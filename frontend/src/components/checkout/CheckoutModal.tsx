"use client";

import { useEffect, useRef, useState } from "react";
import Script from "next/script";
import { ticketLimits, stepUp, stepDown, describeTicketLimits } from "@/lib/ticketLimits";
import EventImageFallback from "@/components/ui/EventImageFallback";
import Image from "next/image";
import { useRouter } from "next/navigation";
import API from "@/services/api";
import { toast } from "sonner";
import { trackPurchase, trackSelectTicket } from "@/lib/analytics";
import { calculateTicketFees } from "@/lib/pricing";

interface Event {
  id: number;
  slug: string;
  name: string;
  category: string;
  category_display?: string;
  day: string;
  time_from: string;
  time_to: string;
  location: string;
  ticket_price: number | string;
  event_image_url?: string;
  is_active: boolean;
  show_remaining_count?: boolean;
  pass_fee_to_attendee?: boolean;
  max_tickets_per_person?: number;
}

interface TicketTier {
  min_tickets_per_person?: number;
  description?: string;
  max_tickets_per_person?: number | null;
  id: string | number;
  name: string;
  price: number | string;
  capacity?: number | null;
  remaining?: number | null;
  sold?: number | null;
  admits_count?: number | null;
}

const categoryLabels: Record<string, string> = {
  entertainment: "CONCERTS & MUSIC",
  web3_crypto: "WEB3 & CRYPTO",
  art_culture: "ART & CULTURE",
  nightlife: "NIGHTLIFE & PARTIES",
  conference: "CONFERENCES",
  fitness: "SPORTS",
  technology: "TECHNOLOGY",
  other: "OTHER",
};

const categoryDotColors: Record<string, string> = {
  entertainment: "bg-purple-300",
  web3_crypto: "bg-amber-300",
  art_culture: "bg-violet-300",
  nightlife: "bg-pink-300",
  conference: "bg-emerald-300",
  fitness: "bg-orange-300",
  technology: "bg-indigo-300",
  other: "bg-gray-300",
};

const formatDate = (dateStr: string) => {
  try {
    const date = new Date(dateStr);
    const day = date.toLocaleDateString("en-US", { weekday: "short" });
    const month = date.toLocaleDateString("en-US", { month: "short" });
    return `${day} ${date.getDate()} ${month}`;
  } catch {
    return dateStr;
  }
};

const formatTime = (timeStr: string) => {
  try {
    const [hours, minutes] = timeStr.split(":");
    const h = parseInt(hours);
    const ampm = h >= 12 ? "PM" : "AM";
    return `${h % 12 || 12}:${minutes} ${ampm}`;
  } catch {
    return timeStr;
  }
};

const fmt = (price: number) =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(price);

const STEPS = ["Tickets", "Details", "Pay", "Done"];

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "";

type TurnstileApi = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  reset: (id: string) => void;
  remove: (id: string) => void;
};
const getTurnstile = () => (window as unknown as { turnstile?: TurnstileApi }).turnstile;

interface FormQuestion {
  id: number;
  question: string;
  question_type: "text" | "textarea" | "select" | "radio" | "checkbox" | "yesno";
  options: string[];
  required: boolean;
}
type Answer = string | string[];

interface Props {
  event: Event;
  onClose: () => void;
  tiers?: TicketTier[];
}

export default function CheckoutModal({ event, onClose, tiers: tiersProp }: Props) {
  const limitsFor = (tier: TicketTier) => ticketLimits(tier, event);
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [isProcessing, setIsProcessing] = useState(false);

  const [confirmRelease, setConfirmRelease] = useState(false);

  /* ── Human check (Cloudflare Turnstile) ──
     Sits on the review step, next to the pay button, because the token is single-use
     and verified by the server when the order is created. Skipped when no site key is set. */
  const [tsReady, setTsReady] = useState(false);
  const [tsToken, setTsToken] = useState("");
  const tsBox = useRef<HTMLDivElement>(null);
  const tsWidget = useRef<string | null>(null);
  const needsTs = !!TURNSTILE_SITE_KEY && step === 3;
  // The pay button sits in the side column on desktop and in a bar at the bottom on phones;
  // the check is drawn right under whichever one is showing.
  const [isDesktop, setIsDesktop] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const sync = () => setIsDesktop(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (!needsTs || !tsReady || !tsBox.current) return;
    const api = getTurnstile();
    if (!api) return;
    tsWidget.current = api.render(tsBox.current, {
      sitekey: TURNSTILE_SITE_KEY,
      theme: "light",
      callback: (token: string) => setTsToken(token),
      "expired-callback": () => setTsToken(""),
      "error-callback": () => setTsToken(""),
    });
    return () => {
      if (tsWidget.current !== null) getTurnstile()?.remove(tsWidget.current);
      tsWidget.current = null;
      setTsToken("");
    };
  }, [needsTs, tsReady, isDesktop]);

  // Tokens are single-use, so a failed attempt needs a fresh one.
  const resetTs = () => {
    setTsToken("");
    if (tsWidget.current !== null) getTurnstile()?.reset(tsWidget.current);
  };

  // Leaving before the order is done asks first. Once it is done, closing is immediate.
  const requestClose = () => {
    if (step === 4) onClose();
    else setConfirmRelease(true);
  };

  // Escape backs out of the confirmation, or asks to leave; the page behind stays put.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (confirmRelease) setConfirmRelease(false);
      else if (step === 4) onClose();
      else setConfirmRelease(true);
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose, step, confirmRelease]);

  /* ── Tickets ── */
  const hasTiers = tiersProp && tiersProp.length > 0;
  const tiers: TicketTier[] = hasTiers
    ? tiersProp!.map(t => ({ ...t, price: parseFloat(String(t.price)) || 0 }))
    : [{ id: "general", name: "General Admission", price: event.ticket_price }];

  const [quantities, setQuantities] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    const src = (tiersProp && tiersProp.length > 0)
      ? tiersProp
      : [{ id: "general", name: "General Admission", price: event.ticket_price }];
    src.forEach((t, i) => { init[String(t.id)] = i === 0 ? 1 : 0; });
    return init;
  });
  const [promoCode, setPromoCode] = useState("");
  const [appliedPromo, setAppliedPromo] = useState<{
    code: string;
    discountType: "fixed" | "percentage";
    amount: number;
  } | null>(null);
  const [promoError, setPromoError] = useState("");
  const [isApplyingPromo, setIsApplyingPromo] = useState(false);
  const [promoOpen, setPromoOpen] = useState(false);

  /* ── Details ── */
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [sendToOther, setSendToOther] = useState(false); // single ticket → send to another email
  const [guests, setGuests] = useState<{ name: string; email: string }[]>([]);
  const [agreed, setAgreed] = useState(false);

  /* ── The organiser's questions: asked once per order, on the details step ── */
  const [formQuestions, setFormQuestions] = useState<FormQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<number, Answer>>({});
  useEffect(() => {
    let live = true;
    API.getFormQuestions(event.slug)
      .then((data: FormQuestion[]) => { if (live && Array.isArray(data)) setFormQuestions(data); })
      .catch(() => {}); // no questions is the same as none asked
    return () => { live = false; };
  }, [event.slug]);

  const setAnswer = (id: number, value: Answer) => setAnswers((a) => ({ ...a, [id]: value }));
  const toggleChoice = (id: number, option: string) =>
    setAnswers((a) => {
      const current = Array.isArray(a[id]) ? (a[id] as string[]) : [];
      return { ...a, [id]: current.includes(option) ? current.filter((o) => o !== option) : [...current, option] };
    });
  const buildAnswers = () =>
    formQuestions
      .filter((q) => {
        const a = answers[q.id];
        return Array.isArray(a) ? a.length > 0 : !!a && a.trim() !== "";
      })
      .map((q) => ({ question_id: q.id, answer: answers[q.id] }));

  /* ── Calculations ── */
  const subtotal = tiers.reduce(
    (s, t) => s + parseFloat(String(t.price)) * (quantities[String(t.id)] || 0),
    0
  );
  // Discount is taken off the subtotal before fees, same order the backend
  // uses when it re-validates the code and computes the actual charge.
  const discount = appliedPromo
    ? Math.min(
        appliedPromo.discountType === "percentage"
          ? Math.round((subtotal * appliedPromo.amount) / 100)
          : appliedPromo.amount,
        subtotal
      )
    : 0;
  const discountedSubtotal = subtotal - discount;
  const passFeeToAttendee = event.pass_fee_to_attendee !== false;
  const fees = calculateTicketFees(discountedSubtotal, passFeeToAttendee);
  // Buyer-facing "service fee" = everything added on top of the subtotal
  // (Byro's 6.5% + the simulated Paystack cut), so the shown total equals what
  // Paystack will actually charge and no fee jumps at checkout.
  const serviceFee = fees.displayTotal - fees.subtotal;
  const total = discountedSubtotal + serviceFee;
  const totalQty = Object.values(quantities).reduce((a: number, b: number) => a + b, 0);

  /* ── Attendees (per-seat guest capture) ──
     Only one tier can be selected at a time (the + button resets others), so
     the active tier drives seats = quantity × people-per-ticket. A group tier
     (admits_count > 1) is ONE ticket that admits several people, so its qty is
     locked at 1 and it yields admits_count attendee slots.
       • Multiple seats (group tier OR qty > 1): buyer holds seat #1 and MUST
         name a distinct person for every other seat — no "email all to me".
       • Single seat: buyer may opt in to "Send ticket to another email?" — when
         chosen, the one ticket goes to that recipient instead of the buyer. */
  const activeTier = tiers.find((t) => (quantities[String(t.id)] || 0) > 0);
  const admitsPer = Math.max(Number(activeTier?.admits_count) || 1, 1);
  const activeQty = activeTier ? quantities[String(activeTier.id)] || 0 : 0;
  const seats = activeQty * admitsPer;

  const isMultiSeat = seats > 1;
  const isRedirect = seats === 1 && sendToOther;      // single ticket → another person
  const buyerHoldsTicket = isMultiSeat || !isRedirect; // buyer keeps a ticket unless redirecting a single one
  const recipientCount = isMultiSeat ? seats - 1 : isRedirect ? 1 : 0;
  const requireRecipientName = isMultiSeat;           // redirect only needs an email
  const recipientBaseLabel = isMultiSeat ? "Guest" : "Recipient";
  const recipientLabelOffset = isMultiSeat ? 2 : 1;   // group guests start at #2

  const isValidEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

  const setGuest = (i: number, field: "name" | "email", value: string) => {
    setGuests((prev) => {
      const next = [...prev];
      while (next.length <= i) next.push({ name: "", email: "" });
      next[i] = { ...next[i], [field]: value };
      return next;
    });
  };

  // Validate buyer + all required recipient rows. Returns an error string or null.
  const validateAttendees = (): string | null => {
    if (!fullName.trim() || !email.trim()) {
      return "Please fill in your name and email before proceeding.";
    }
    if (!isValidEmail(email)) {
      return "Please enter a valid email address.";
    }
    for (const q of formQuestions) {
      const a = answers[q.id];
      const empty = Array.isArray(a) ? a.length === 0 : !a || a.trim() === "";
      if (q.required && empty) return `Please answer: ${q.question}`;
    }
    for (let i = 0; i < recipientCount; i++) {
      const g = guests[i];
      const label = `${recipientBaseLabel.toLowerCase()} ${i + recipientLabelOffset}`;
      if (!g || !g.email.trim()) {
        return `Please enter an email for ${label}.`;
      }
      if (!isValidEmail(g.email)) {
        return `Please enter a valid email for ${label}.`;
      }
      if (requireRecipientName && !g.name.trim()) {
        return `Please enter a name for ${label}.`;
      }
    }
    return null;
  };

  // Build the per-seat attendee list for the API (undefined = single ticket to buyer).
  const buildAttendees = () => {
    if (recipientCount <= 0) return undefined;
    const recipients = Array.from({ length: recipientCount }, (_, i) => {
      const nm = (guests[i]?.name || "").trim();
      const em = (guests[i]?.email || "").trim();
      // For an email-only redirect, derive a display name from the address.
      return { name: nm || em.split("@")[0] || fullName.trim(), email: em };
    });
    // Multi-seat: buyer holds seat #1, then the named guests.
    // Redirect: buyer holds no seat — the ticket goes to the recipient.
    return buyerHoldsTicket
      ? [{ name: fullName.trim(), email: email.trim() }, ...recipients]
      : recipients;
  };

  const applyPromo = async () => {
    const code = promoCode.trim();
    if (!code || isApplyingPromo) return;

    setPromoError("");
    setIsApplyingPromo(true);
    try {
      const result = await API.validatePromoCode(event.slug, code);
      setAppliedPromo({
        code: result.code,
        discountType: result.discount_type,
        amount: parseFloat(result.amount),
      });
    } catch (err: unknown) {
      setAppliedPromo(null);
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        "Invalid or expired promo code.";
      setPromoError(message);
    } finally {
      setIsApplyingPromo(false);
    }
  };

  const handlePayment = async () => {
    const attendeeError = validateAttendees();
    if (attendeeError) {
      toast.error(attendeeError);
      return;
    }

    if (!agreed) {
      toast.error("Please agree to Byro's Terms and Refund policy to continue.");
      return;
    }

    setIsProcessing(true);
    try {
      // Find the first tier with quantity > 0 to pass as tier_id
      const activeTierForPayment = tiers.find(t => (quantities[String(t.id)] || 0) > 0);
      const tier_id = typeof activeTierForPayment?.id === "number" ? activeTierForPayment.id : undefined;
      const attendees = buildAttendees();

      if (total === 0) {
        const result = await API.initializePayment({
          event_slug: event.slug,
          customer_email: email,
          customer_name: fullName,
          quantity: totalQty,
          tier_id,
          attendees,
          promo_code: appliedPromo?.code,
          turnstile_token: tsToken || undefined,
          form_answers: buildAnswers(),
        });
        const ticket = result.tickets?.[0];
        const ticketData = {
          attendeeName: fullName,
          attendeeEmail: email,
          eventName: event.name,
          eventDate: event.day,
          timeFrom: event.time_from,
          eventLocation: event.location,
          ticketId: ticket?.id || ticket?.ticket_id,
        };
        localStorage.setItem("ticketData", JSON.stringify(ticketData));
        trackPurchase({
          transactionId: ticket?.ticket_id || ticket?.id || 'free',
          eventName: event.name,
          eventSlug: event.slug,
          value: 0,
          quantity: totalQty,
          isFree: true,
        });
        onClose();
        router.push("/order-confirmed");
        return;
      }

      const result = await API.initializePayment({
        event_slug: event.slug,
        customer_email: email,
        customer_name: fullName,
        quantity: totalQty,
        tier_id,
        attendees,
        promo_code: appliedPromo?.code,
        turnstile_token: tsToken || undefined,
        form_answers: buildAnswers(),
      });

      if (result?.data?.authorization_url) {
        // The purchase is counted on /payment/callback, once Paystack confirms it was paid.
        window.location.href = result.data.authorization_url;
      } else {
        toast.error("Could not get payment link. Please try again.");
      }
    } catch (err: unknown) {
      console.error("Payment error:", err);
      const message = err instanceof Error ? err.message : "Payment failed. Please try again.";
      toast.error(message);
      resetTs();
    } finally {
      setIsProcessing(false);
    }
  };

  const dotColor =
    categoryDotColors[event.category] || "bg-gray-300";
  const badgeLabel =
    categoryLabels[event.category] || event.category.toUpperCase();
  const dateStr = formatDate(event.day);
  const timeStr = formatTime(event.time_from);

  // Respect the organiser's "show remaining count" setting. The API may still
  // return real counts to the owner/co-host, so gate on the flag here too.
  const showRemaining = !!event.show_remaining_count;

  /* ── Review and pay ──
     Who is going: the buyer holds seat 1 on a multi-ticket order, and a single
     ticket sent to someone else belongs only to that person. */
  const tierLabel = activeTier?.name || "Ticket";
  const holders: { name: string; email: string; you: boolean }[] = [];
  if (buyerHoldsTicket) holders.push({ name: fullName.trim(), email: email.trim(), you: true });
  for (let i = 0; i < recipientCount; i++) {
    const em = (guests[i]?.email || "").trim();
    holders.push({ name: (guests[i]?.name || "").trim() || em, email: em, you: false });
  }
  const isFreeOrder = total === 0;

  const termsCheckbox = (
    <label className="flex cursor-pointer items-start gap-2.5">
      <input
        type="checkbox"
        checked={agreed}
        onChange={(e) => setAgreed(e.target.checked)}
        className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer rounded accent-[#3669F6]"
      />
      <span className="text-[13px] leading-relaxed text-[#3B4252]">
        I agree to Byro&apos;s{" "}
        <a href="/terms" target="_blank" className="font-bold text-[#2451D6] hover:underline">Terms</a>,{" "}
        <a href="/refund-policy" target="_blank" className="font-bold text-[#2451D6] hover:underline">Refund policy</a>{" "}
        and{" "}
        <a href="/privacy" target="_blank" className="font-bold text-[#2451D6] hover:underline">Privacy policy</a>.
      </span>
    </label>
  );

  const payDisabled = isProcessing || !agreed || (needsTs && !tsToken);
  const payButton = (
    <button
      type="button"
      onClick={handlePayment}
      disabled={payDisabled}
      className="flex h-[54px] w-full items-center justify-center gap-2 rounded-full bg-brand text-[17px] font-bold text-white transition-[filter,scale] hover:brightness-90 active:scale-[0.96] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {isProcessing ? "Processing..." : isFreeOrder ? "Register" : `Pay ${fmt(total)}`}
    </button>
  );

  const tsBlock = needsTs ? (
    <div>
      <div className="h-[60px]">
        <div ref={tsBox} className="w-[300px] origin-top-left scale-[0.91]" />
      </div>
      {!tsToken && <p className="mt-1 text-xs text-muted">Tick the box to continue.</p>}
    </div>
  ) : null;

  const backLink = (label: string, to: number) => (
    <button
      type="button"
      onClick={() => setStep(to)}
      className="-mb-1 flex items-center gap-1.5 self-start text-sm font-bold text-ink hover:text-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M19 12H5M11 6l-6 6 6 6" />
      </svg>
      {label}
    </button>
  );

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-ink/45 font-body text-ink backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-label="Checkout"
      onClick={(e) => {
        if (e.target === e.currentTarget) requestClose();
      }}
    >
      {TURNSTILE_SITE_KEY && (
        <Script
          src="https://challenges.cloudflare.com/turnstile/v0/api.js"
          strategy="afterInteractive"
          onReady={() => setTsReady(true)}
        />
      )}
      {confirmRelease && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/40 p-4" onClick={(e) => e.stopPropagation()}>
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="release-title"
            aria-describedby="release-desc"
            className="w-full max-w-sm rounded-[28px] bg-white p-7 shadow-[0_30px_80px_rgba(20,22,28,0.35)]"
          >
            <h2 id="release-title" className="font-display text-2xl font-bold tracking-[-0.02em]">
              Release your tickets?
            </h2>
            <p id="release-desc" className="mt-2 text-[15px] leading-relaxed text-muted">
              You&apos;ll leave checkout and your ticket selection will be cleared.
            </p>
            <div className="mt-6 flex flex-col gap-2.5">
              <button
                type="button"
                autoFocus
                onClick={() => setConfirmRelease(false)}
                className="h-12 rounded-full bg-brand text-[15px] font-bold text-white transition-[filter,scale] hover:brightness-90 active:scale-[0.96] focus:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2"
              >
                Keep my tickets
              </button>
              <button
                type="button"
                onClick={onClose}
                className="h-12 rounded-full border border-line text-[15px] font-bold text-ink transition-[background-color,scale] hover:bg-mist active:scale-[0.96] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                Release tickets
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="mx-auto flex min-h-full max-w-[920px] flex-col overflow-hidden bg-white md:my-8 md:min-h-0 md:flex-row md:rounded-[32px] md:shadow-[0_40px_100px_rgba(20,22,28,0.35)]">
          <div className="flex flex-1 flex-col gap-5 p-5 md:p-10">
            <div className="flex items-center justify-between gap-3">
              <ol aria-label="Checkout steps" className="flex items-center gap-2 text-[13px] font-bold">
                {STEPS.slice(0, 3).map((name, i) => {
                  const n = i + 1;
                  const done = step > n;
                  const active = step === n;
                  const label = name;
                  return (
                    <li
                      key={name}
                      aria-current={active ? "step" : undefined}
                      className={`flex h-7 items-center rounded-full px-2.5 ${
                        done ? "bg-mint text-[#1F7A52]" : active ? "bg-brand text-white" : "bg-mist text-muted"
                      }`}
                    >
                      {n} {label}
                      {done ? " ✓" : ""}
                    </li>
                  );
                })}
              </ol>
              <button
                type="button"
                onClick={requestClose}
                aria-label="Close checkout"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-mist text-ink transition-[background-color,scale] hover:bg-line active:scale-[0.96] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
            {step === 1 && (
              <div className="flex flex-col">
                <h1 className="font-display text-[32px] md:text-4xl font-bold tracking-[-0.025em] text-ink mb-1">
                  Choose your tickets
                </h1>
                <p className="text-sm text-muted mb-6">
                  Select the tiers and quantities you want.{" "}
                  {(() => {
                    if (!showRemaining) return null;
                    const trackedTiers = tiers.filter(t => t.remaining != null);
                    if (trackedTiers.length === 0) return null;
                    const totalRemaining = trackedTiers.reduce((s, t) => s + (t.remaining as number), 0);
                    return totalRemaining > 0 ? (
                      <span className="text-orange-500 font-semibold">
                        {totalRemaining.toLocaleString()} tickets left.
                      </span>
                    ) : null;
                  })()}
                </p>

                <div className="space-y-3">
                  {tiers.map((tier) => {
                    const currentQty = quantities[String(tier.id)] || 0;
                    const { min, max } = limitsFor(tier);
                    const cap = tier.remaining != null ? Math.min(max, tier.remaining) : max;
                    const atCap = currentQty >= cap || (currentQty === 0 && tier.remaining != null && tier.remaining < min);
                    return (
                      <div
                        key={tier.id}
                        className={`rounded-[18px] border p-4 transition-colors ${
                          currentQty > 0 ? "border-brand bg-[#F3F8FE]" : "border-hairline"
                        }`}
                      >
                        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-ink">{tier.name}</p>
                            {tier.description && (
                              <p className="mt-0.5 break-words text-xs text-muted">{tier.description}</p>
                            )}
                            <p className="mt-0.5 text-xs text-muted">
                              {showRemaining && tier.remaining != null && tier.remaining > 0 && (
                                <span className="text-orange-500">{tier.remaining} left</span>
                              )}
                              {tier.remaining === 0 && <span className="text-red-500">Sold out</span>}
                              {showRemaining && tier.remaining == null && tier.capacity != null && (
                                <span>{tier.capacity} capacity</span>
                              )}
                            </p>
                            {tier.remaining !== 0 && (
                              <p className="mt-0.5 text-xs text-muted">{describeTicketLimits(tier, event)}</p>
                            )}
                          </div>
                          <div className="flex shrink-0 items-center justify-between gap-3 md:justify-end">
                            <span className="text-sm font-semibold text-ink">
                              {parseFloat(String(tier.price)) === 0 ? "Free" : fmt(parseFloat(String(tier.price)))}
                            </span>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                aria-label={`Fewer ${tier.name} tickets`}
                                onClick={() =>
                                  setQuantities((p) => ({
                                    ...p,
                                    [String(tier.id)]: stepDown(p[String(tier.id)] || 0, min),
                                  }))
                                }
                                className="flex h-9 w-9 items-center justify-center rounded-full border border-line text-muted transition-colors hover:bg-mist"
                              >
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                                  <line x1="5" y1="12" x2="19" y2="12" />
                                </svg>
                              </button>
                              <span className="w-5 text-center text-sm font-semibold text-ink">{currentQty}</span>
                              <button
                                type="button"
                                aria-label={`More ${tier.name} tickets`}
                                onClick={() =>
                                  setQuantities((p) => {
                                    const cur = p[String(tier.id)] || 0;
                                    // Bundled: the first press jumps to the tier's minimum, then one at a time up to its cap.
                                    const next = stepUp(cur, min, cap);
                                    if (next === cur) return p;
                                    // Reset all other tiers to 0: only one tier can be selected at a time
                                    const reset: Record<string, number> = {};
                                    tiers.forEach((t) => { reset[String(t.id)] = 0; });
                                    return { ...reset, [String(tier.id)]: next };
                                  })
                                }
                                disabled={tier.remaining === 0 || atCap}
                                className="flex h-9 w-9 items-center justify-center rounded-full bg-brand text-white transition-[filter] hover:brightness-90 disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                                  <line x1="12" y1="5" x2="12" y2="19" />
                                  <line x1="5" y1="12" x2="19" y2="12" />
                                </svg>
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

              </div>
            )}

            {step === 2 && (
              <div className="flex flex-col">
                <div className="mb-4">{backLink("Back to tickets", 1)}</div>
                <h1 className="font-display text-[32px] md:text-4xl font-bold tracking-[-0.025em] text-ink mb-1">
                  Your details
                </h1>
                <p className="text-sm text-muted mb-6">
                  We will send your tickets and entry QR here.
                </p>

                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-bold text-ink block mb-1.5">
                      Full name
                    </label>
                    <div className="relative">
                      <svg
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-faint"
                        width="15"
                        height="15"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                        <circle cx="12" cy="7" r="4" />
                      </svg>
                      <input
                        type="text"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder="Amara Okafor"
                        className="w-full border border-[#D5DBE5] text-ink rounded-[14px] pl-9 pr-4 py-3.5 text-[15px] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand placeholder:text-faint"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-bold text-ink block mb-1.5">
                        Email address
                      </label>
                      <div className="relative">
                        <svg
                          className="absolute left-3 top-1/2 -translate-y-1/2 text-faint"
                          width="15"
                          height="15"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                          <polyline points="22,6 12,13 2,6" />
                        </svg>
                        <input
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="amara@email.com"
                          className="w-full border border-[#D5DBE5] text-ink rounded-[14px] pl-9 pr-4 py-3.5 text-[15px] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand placeholder:text-faint"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-sm font-bold text-ink block mb-1.5">
                        Phone number
                      </label>
                      <div className="relative">
                        <svg
                          className="absolute left-3 top-1/2 -translate-y-1/2 text-faint"
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
                          <line x1="12" y1="18" x2="12.01" y2="18" />
                        </svg>
                        <input
                          type="tel"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          placeholder="+234 801 234 5678"
                          className="w-full border border-[#D5DBE5] text-ink rounded-[14px] pl-9 pr-4 py-3.5 text-[15px] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand placeholder:text-faint"
                        />
                      </div>
                    </div>
                  </div>

                </div>

                <div className="mt-5 border border-hairline rounded-xl p-4">
                  <p className="font-semibold text-ink text-sm mb-3">
                    Ticket recipient(s)
                  </p>
                  {isMultiSeat ? (
                    <p className="text-sm text-muted">
                      Enter the details of the guest&apos;s below
                    </p>
                  ) : (
                    /* Single ticket — optional redirect, unselected by default */
                    <label className="flex items-center gap-3 cursor-pointer">
                      <div
                        onClick={() => setSendToOther((v) => !v)}
                        className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 transition-colors cursor-pointer ${
                          sendToOther ? "bg-brand" : "border-2 border-[#C7CEDA]"
                        }`}
                      >
                        {sendToOther && (
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )}
                      </div>
                      <span className="text-sm text-ink">
                        Send ticket to another email?
                      </span>
                    </label>
                  )}

                  {recipientCount > 0 && (
                    <div className="mt-4 space-y-4 border-t border-hairline pt-4">
                      {isRedirect && (
                        <p className="text-xs text-muted">
                          You&apos;re paying, but the ticket will be sent to this email.
                        </p>
                      )}
                      {Array.from({ length: recipientCount }, (_, i) => (
                        <div key={i} className="space-y-2">
                          {isMultiSeat && (
                            <p className="text-xs font-semibold text-ink">
                              {recipientBaseLabel} {i + recipientLabelOffset}
                            </p>
                          )}
                          {isMultiSeat ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <input
                                type="text"
                                value={guests[i]?.name || ""}
                                onChange={(e) => setGuest(i, "name", e.target.value)}
                                placeholder="Full name"
                                className="w-full border border-[#D5DBE5] text-ink rounded-[14px] px-4 py-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand placeholder:text-faint"
                              />
                              <input
                                type="email"
                                value={guests[i]?.email || ""}
                                onChange={(e) => setGuest(i, "email", e.target.value)}
                                placeholder="Email address"
                                className="w-full border border-[#D5DBE5] text-ink rounded-[14px] px-4 py-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand placeholder:text-faint"
                              />
                            </div>
                          ) : (
                            <input
                              type="email"
                              value={guests[i]?.email || ""}
                              onChange={(e) => setGuest(i, "email", e.target.value)}
                              placeholder="Recipient's email address"
                              className="w-full border border-[#D5DBE5] text-ink rounded-[14px] px-4 py-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand placeholder:text-faint"
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                </div>

                  {formQuestions.length > 0 && (
                    <section aria-label="Questions from the organiser" className="mt-5 space-y-5 rounded-xl border border-hairline p-4">
                      <div>
                        <h2 className="font-display text-xl font-bold text-ink">A few questions</h2>
                        <p className="mt-0.5 text-xs text-muted">Only the organiser sees your answers.</p>
                      </div>
                      {formQuestions.map((q) => {
                        const a = answers[q.id];
                        const choiceCls = "flex items-center gap-3 border border-[#D5DBE5] rounded-[14px] px-4 py-3 text-sm text-ink cursor-pointer has-[:checked]:border-brand has-[:checked]:bg-[#EEF3FF] focus-within:ring-2 focus-within:ring-brand";
                        return (
                          <fieldset key={q.id} className="min-w-0">
                            <legend className="text-sm font-bold text-ink mb-2">
                              {q.question}
                              {!q.required && <span className="font-normal text-muted"> · optional</span>}
                            </legend>
                            {(q.question_type === "radio" || q.question_type === "select" || q.question_type === "yesno") && (
                              <div className={q.question_type === "yesno" ? "grid grid-cols-2 gap-2" : "space-y-2"}>
                                {q.options.map((opt) => (
                                  <label key={opt} className={choiceCls}>
                                    <input type="radio" name={`q-${q.id}`} checked={a === opt} onChange={() => setAnswer(q.id, opt)} className="w-4 h-4 accent-[#3669F6]" />
                                    {opt}
                                  </label>
                                ))}
                              </div>
                            )}
                            {q.question_type === "checkbox" && (
                              <div className="space-y-2">
                                {q.options.map((opt) => (
                                  <label key={opt} className={choiceCls}>
                                    <input type="checkbox" checked={Array.isArray(a) && a.includes(opt)} onChange={() => toggleChoice(q.id, opt)} className="w-4 h-4 accent-[#3669F6]" />
                                    {opt}
                                  </label>
                                ))}
                              </div>
                            )}
                            {(q.question_type === "textarea" || q.question_type === "text") && (
                              <textarea
                                rows={q.question_type === "textarea" ? 4 : 2}
                                maxLength={q.question_type === "textarea" ? 2000 : 255}
                                value={typeof a === "string" ? a : ""}
                                onChange={(e) => setAnswer(q.id, e.target.value)}
                                className="w-full border border-[#D5DBE5] text-ink rounded-[14px] px-4 py-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand resize-none"
                              />
                            )}
                          </fieldset>
                        );
                      })}
                    </section>
                  )}
              </div>
            )}

            {step === 3 && (
              <div className="flex flex-col gap-4">
                {backLink("Back to details", 2)}
                <h1 className="font-display text-[32px] md:text-4xl font-bold tracking-[-0.025em] text-ink">
                  Review and pay
                </h1>

                <section className="rounded-[22px] border border-line bg-white p-5">
                  <div className="flex items-center justify-between">
                    <h2 className="text-base font-extrabold">Who&apos;s going</h2>
                    <button type="button" onClick={() => setStep(2)} className="text-[13px] font-bold text-brand hover:underline">Edit</button>
                  </div>
                  <ul className="mt-1">
                    {holders.map((h, i) => (
                      <li key={i} className="flex items-center gap-3 border-b border-hairline py-2.5 last:border-b-0">
                        <span aria-hidden="true" className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-[#EEF3FF] text-[13px] font-extrabold text-[#2451D6]">
                          {(h.name || h.email || "?").charAt(0).toUpperCase()}
                        </span>
                        <div className="min-w-0 grow">
                          <p className="break-words text-[15px] font-extrabold">
                            {h.name || h.email}
                            {h.you && <span className="font-semibold text-muted"> (you)</span>}
                          </p>
                          {h.name && h.name !== h.email && <p className="truncate text-[13px] text-muted">{h.email}</p>}
                        </div>
                        <span className="shrink-0 text-[13px] font-bold text-[#3B4252]">{tierLabel}</span>
                      </li>
                    ))}
                  </ul>
                  {isMultiSeat && <p className="pt-2 text-xs text-muted">Tickets will be sent to each email.</p>}
                </section>

                {formQuestions.length > 0 && (
                  <section className="flex items-center gap-2.5 rounded-[22px] border border-line bg-white px-5 py-3.5">
                    <span aria-hidden="true" className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-[#2F9E6E] text-xs font-extrabold text-white">✓</span>
                    <span className="grow text-sm font-bold">Questions from the organiser answered</span>
                    <button type="button" onClick={() => setStep(2)} className="text-[13px] font-bold text-brand hover:underline">Edit</button>
                  </section>
                )}

                <section className="hidden rounded-[22px] border border-line bg-white px-5 py-4 md:block">{termsCheckbox}</section>

              </div>
            )}

          </div>

          {step < 4 && (
            <div className="w-full shrink-0 bg-paper md:w-[330px]">
              <div className="md:sticky md:top-0">
                <div className="relative m-5 mb-0 h-[150px] overflow-hidden rounded-[18px] md:m-7 md:mb-0">
                  {event.event_image_url ? (
                    <Image
                      src={event.event_image_url}
                      alt={event.name}
                      fill
                      sizes="330px"
                      unoptimized={/localhost|127\.0\.0\.1/.test(event.event_image_url)}
                      className="object-cover"
                    />
                  ) : (
                    <EventImageFallback category={event.category} tone="solid" />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
                  <div className="absolute top-2.5 left-3">
                    <span className="inline-flex items-center gap-1.5 bg-black/40 backdrop-blur-sm text-white text-[10px] font-bold tracking-wide px-2.5 py-1 rounded-full">
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${dotColor} flex-shrink-0`}
                      />
                      {badgeLabel}
                    </span>
                  </div>
                </div>

                <div className="p-5 md:p-7">
                  <p className="mb-3 text-xs font-extrabold tracking-[0.12em] text-muted">YOUR ORDER</p>
                  <h3 className="mb-2 font-display text-[22px] font-bold text-ink">
                    {event.name}
                  </h3>
                  <div className="flex items-center gap-1.5 text-xs text-muted mb-1">
                    <svg
                      width="11"
                      height="11"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                      <line x1="16" y1="2" x2="16" y2="6" />
                      <line x1="8" y1="2" x2="8" y2="6" />
                      <line x1="3" y1="10" x2="21" y2="10" />
                    </svg>
                    {dateStr} · {timeStr}
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-muted">
                    <svg
                      width="11"
                      height="11"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                      <circle cx="12" cy="10" r="3" />
                    </svg>
                    {event.location}
                  </div>

                  {subtotal > 0 && (
                    <div className="mt-4 pt-4 border-t border-hairline space-y-2">
                      {tiers.map((t) => {
                        const q = quantities[String(t.id)] || 0;
                        if (!q) return null;
                        return (
                          <div
                            key={t.id}
                            className="flex justify-between text-sm"
                          >
                            <span className="text-muted">
                              {q} × {t.name}
                            </span>
                            <span className="font-medium text-ink">
                              {fmt(parseFloat(String(t.price)) * q)}
                            </span>
                          </div>
                        );
                      })}
                      <div className="flex justify-between text-sm">
                        <span className="flex items-center gap-1 text-muted">
                          Service fee
                          <span className="relative group cursor-default">
                            <svg
                              width="12"
                              height="12"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              className="text-faint"
                            >
                              <circle cx="12" cy="12" r="10" />
                              <line x1="12" y1="16" x2="12" y2="12" />
                              <line x1="12" y1="8" x2="12.01" y2="8" />
                            </svg>
                            <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block whitespace-nowrap bg-gray-800 text-white text-[10px] leading-tight px-2.5 py-1.5 rounded-lg pointer-events-none shadow-lg z-10">
                              To serve you better
                              <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-800" />
                            </span>
                          </span>
                        </span>
                        <span className="text-ink">{fmt(serviceFee)}</span>
                      </div>
                      {step === 3 && !appliedPromo && !promoOpen && (
                        <button
                          type="button"
                          onClick={() => setPromoOpen(true)}
                          className="self-start text-left text-[13px] font-bold text-[#2451D6] hover:underline"
                        >
                          Have a discount code?
                        </button>
                      )}
                      {step === 3 && !appliedPromo && promoOpen && (
                        <div>
                          <div className="flex gap-2">
                            <label htmlFor="discount-code" className="sr-only">Discount code</label>
                            <input
                              id="discount-code"
                              type="text"
                              value={promoCode}
                              autoFocus
                              onChange={(e) => {
                                setPromoCode(e.target.value);
                                if (promoError) setPromoError("");
                              }}
                              onKeyDown={(e) => { if (e.key === "Enter") applyPromo(); }}
                              placeholder="Enter code"
                              className="h-[42px] min-w-0 grow rounded-xl border-[1.5px] border-[#CBD3DF] bg-white px-3 text-sm font-bold uppercase focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                            />
                            <button
                              type="button"
                              onClick={applyPromo}
                              disabled={!promoCode.trim() || isApplyingPromo}
                              className="h-[42px] rounded-xl bg-ink px-4 text-sm font-bold text-white transition-[filter] hover:brightness-125 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {isApplyingPromo ? "Checking..." : "Apply"}
                            </button>
                          </div>
                          {promoError && <p role="alert" className="mt-1.5 text-xs text-red-600">{promoError}</p>}
                        </div>
                      )}
                      {appliedPromo && (
                        <div className="flex items-center justify-between text-sm text-[#1F7A52]">
                          <span className="flex items-center gap-1.5">
                            Discount ({appliedPromo.code})
                            {step === 3 && (
                              <button
                                type="button"
                                onClick={() => { setAppliedPromo(null); setPromoCode(""); setPromoOpen(false); }}
                                className="text-xs font-bold text-muted underline"
                              >
                                Remove
                              </button>
                            )}
                          </span>
                          <span className="font-bold">-{fmt(discount)}</span>
                        </div>
                      )}
                      <div className="flex justify-between pt-2 border-t border-hairline mt-1">
                        <span className="font-bold text-ink">Total</span>
                        <span className="font-bold text-ink text-lg">
                          {fmt(total)}
                        </span>
                      </div>
                    </div>
                  )}

                  {step === 3 && isDesktop && (
                    <div className="mt-4 flex flex-col gap-3">
                      {payButton}
                      {tsBlock}
                    </div>
                  )}

                  {step < 3 && (
                  <button
                    onClick={() => {
                      if (step === 2) {
                        const err = validateAttendees();
                        if (err) {
                          toast.error(err);
                          return;
                        }
                      }
                      {
                        if (step === 1) {
                          const selectedTier = tiers.find(t => (quantities[String(t.id)] || 0) > 0);
                          trackSelectTicket({
                            eventName: event.name,
                            eventSlug: event.slug,
                            tierName: selectedTier?.name ?? 'General',
                            quantity: totalQty,
                            value: total,
                          });
                        }
                        setStep((s) => Math.min(s + 1, 4));
                      }
                    }}
                    disabled={step === 1 && totalQty === 0}
                    className="mt-4 w-full bg-brand text-white font-semibold py-3 rounded-full hover:brightness-90 transition-colors flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed text-sm"
                  >
                    {step === 1 && (
                      <>
                        Continue to details
                        <svg
                          width="15"
                          height="15"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <path d="M5 12h14M12 5l7 7-7 7" />
                        </svg>
                      </>
                    )}
                    {step === 2 && (
                      <>
                        {isFreeOrder ? "Review and register" : "Continue to payment"}
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M5 12h14M12 5l7 7-7 7" />
                        </svg>
                      </>
                    )}
                  </button>
                  )}

                </div>
              </div>
            </div>
          )}
      </div>
      {step === 3 && !isDesktop && (
        <div className="sticky bottom-0 z-[55] flex flex-col gap-3 border-t border-line bg-white px-4 pb-6 pt-3.5 shadow-[0_-10px_30px_rgba(20,22,28,0.06)] md:hidden">
          {termsCheckbox}
          {payButton}
          {tsBlock}
        </div>
      )}
    </div>
  );
}
