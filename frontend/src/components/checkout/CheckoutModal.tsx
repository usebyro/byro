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

const STEPS = ["Tickets", "Details", "Payment", "Done"];

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
     Sits above the pay button on the details and payment steps and is verified
     by the server when the payment is created. Skipped when no site key is set. */
  const [tsReady, setTsReady] = useState(false);
  const [tsToken, setTsToken] = useState("");
  const tsBox = useRef<HTMLDivElement>(null);
  const tsWidget = useRef<string | null>(null);
  const needsTs = !!TURNSTILE_SITE_KEY && (step === 2 || step === 3);

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
  }, [needsTs, tsReady]);

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

  /* ── Payment ── */
  const [payMethod, setPayMethod] = useState("paystack");

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
        trackPurchase({
          transactionId: result?.data?.reference || event.slug,
          eventName: event.name,
          eventSlug: event.slug,
          value: total,
          quantity: totalQty,
          isFree: false,
        });
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
          {/* Left panel */}
          <div className="flex flex-1 flex-col gap-5 p-5 md:p-10">
            <div className="flex items-center justify-between gap-3">
              <ol aria-label="Checkout steps" className="flex items-center gap-2 text-[13px] font-bold">
                {STEPS.slice(0, 3).map((name, i) => {
                  const n = i + 1;
                  const done = step > n;
                  const active = step === n;
                  const label = name === "Details" ? "Your details" : name === "Payment" ? "Pay" : name;
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
            {/* Step 1 – Tickets */}
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

                {/* Promo code */}
                <div className="mt-4 flex items-center border border-line rounded-xl overflow-hidden">
                  <div className="flex items-center gap-3 flex-1 px-4 py-3">
                    <svg
                      width="15"
                      height="15"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      className="text-faint flex-shrink-0"
                    >
                      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
                      <line x1="7" y1="7" x2="7.01" y2="7" />
                    </svg>
                    <input
                      type="text"
                      value={promoCode}
                      onChange={(e) => {
                        setPromoCode(e.target.value);
                        if (appliedPromo) setAppliedPromo(null);
                        if (promoError) setPromoError("");
                      }}
                      placeholder="Have a promo code?"
                      className="flex-1 text-sm text-ink placeholder-gray-400 focus:outline-none bg-transparent"
                    />
                  </div>
                  <button
                    onClick={applyPromo}
                    disabled={!promoCode.trim() || isApplyingPromo}
                    className="px-5 py-3 text-sm font-semibold text-ink border-l border-line hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isApplyingPromo ? "Checking..." : "Apply"}
                  </button>
                </div>
                {appliedPromo && (
                  <p className="text-sm text-emerald-600 flex items-center gap-1.5 mt-2">
                    <svg
                      width="13"
                      height="13"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    Promo code applied!
                  </p>
                )}
                {promoError && (
                  <p className="text-sm text-red-600 mt-2">{promoError}</p>
                )}
              </div>
            )}

            {/* Step 2 – Details */}
            {step === 2 && (
              <div className="flex flex-col">
                <h1 className="font-display text-[32px] md:text-4xl font-bold tracking-[-0.025em] text-ink mb-1">
                  Your details
                </h1>
                <p className="text-sm text-muted mb-6">
                  We will send your tickets and entry QR here.
                </p>

                <div className="space-y-4">
                  {/* Full name */}
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

                  {/* Email + Phone */}
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

                {/* Ticket delivery */}
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

                  {/* Per-recipient details */}
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

                  {/* Organiser's questions */}
                  {formQuestions.length > 0 && (
                    <div className="space-y-5 pt-2">
                      <h2 className="font-display text-xl font-bold text-ink">A few questions</h2>
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
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Step 3 – Payment */}
            {step === 3 && (
              <div className="flex flex-col">
                <h1 className="font-display text-[32px] md:text-4xl font-bold tracking-[-0.025em] text-ink mb-1">
                  Payment
                </h1>
                <p className="text-sm text-muted mb-6">
                  All transactions are encrypted and secure.
                </p>

                {/* Payment methods */}
                <div className="space-y-3 mb-5">
                  {/* Pay with Paystack */}
                  <label
                    className={`flex items-center gap-4 p-4 rounded-[18px] border cursor-pointer transition-colors ${
                      payMethod === "paystack"
                        ? "border-brand bg-[#F3F8FE]"
                        : "border-hairline hover:border-line"
                    }`}
                  >
                    <div
                      onClick={() => setPayMethod("paystack")}
                      className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors cursor-pointer ${
                        payMethod === "paystack"
                          ? "border-brand"
                          : "border-[#C7CEDA]"
                      }`}
                    >
                      {payMethod === "paystack" && (
                        <div className="w-2.5 h-2.5 rounded-full bg-brand" />
                      )}
                    </div>
                    <span className="text-faint flex-shrink-0">
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
                        <line x1="1" y1="10" x2="23" y2="10" />
                      </svg>
                    </span>
                    <div>
                      <p className="font-semibold text-ink text-sm">
                        Pay with Paystack
                      </p>
                      <p className="text-muted text-xs mt-0.5">
                        Card, bank transfer &amp; more
                      </p>
                    </div>
                  </label>

                  {/* Pay with Crypto — coming soon */}
                  <div className="flex items-center gap-4 p-4 rounded-[18px] border border-hairline opacity-60 cursor-not-allowed select-none">
                    <div className="w-5 h-5 rounded-full border-2 border-[#C7CEDA] flex-shrink-0" />
                    <span className="text-faint flex-shrink-0">
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <circle cx="12" cy="12" r="10" />
                        <path d="M9.5 8.5h4a2 2 0 0 1 0 4h-4v4" />
                        <path d="M9.5 8.5V7" />
                        <path d="M13.5 16.5V18" />
                      </svg>
                    </span>
                    <div className="flex items-center gap-2 flex-1">
                      <div>
                        <p className="font-semibold text-ink text-sm">
                          Pay with Crypto
                        </p>
                        <p className="text-muted text-xs mt-0.5">
                          BTC, ETH, USDT and more
                        </p>
                      </div>
                      <span className="ml-auto text-[10px] font-bold uppercase tracking-wide bg-amber-100 text-amber-600 px-2.5 py-1 rounded-full flex-shrink-0">
                        Coming Soon
                      </span>
                    </div>
                  </div>
                </div>

                <p className="text-xs text-faint flex items-center gap-1.5 mt-4">
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                  Secured by Paystack · 256-bit encryption
                </p>
              </div>
            )}

          </div>

          {/* ── Right panel – Order summary ── */}
          {step < 4 && (
            <div className="w-full shrink-0 bg-paper md:w-[330px]">
              <div className="md:sticky md:top-0">
                {/* Event preview */}
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

                  {/* Order lines */}
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
                      {appliedPromo && (
                        <div className="flex justify-between text-sm">
                          <span className="text-emerald-600 flex items-center gap-1">
                            <svg
                              width="11"
                              height="11"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2.5"
                            >
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                            Promo: {appliedPromo.code}
                          </span>
                          <span className="text-emerald-600">
                            -{fmt(discount)}
                          </span>
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

                  {needsTs && (
                    <div className="mt-4">
                      <div className="h-[60px]">
                        <div ref={tsBox} className="w-[300px] origin-top-left scale-[0.91]" />
                      </div>
                      {!tsToken && (
                        <p className="mt-1.5 text-xs text-muted">Tick the box to continue.</p>
                      )}
                    </div>
                  )}

                  {/* CTA */}
                  <button
                    onClick={() => {
                      if (step === 2) {
                        const err = validateAttendees();
                        if (err) {
                          toast.error(err);
                          return;
                        }
                      }
                      if (step === 3 || (step === 2 && total === 0)) {
                        handlePayment();
                      } else {
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
                    disabled={(step === 1 && totalQty === 0) || (step === 2 && !agreed) || (step === 2 && isProcessing) || (step === 3 && isProcessing) || (needsTs && !tsToken)}
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
                        {isProcessing ? (
                          <>
                            <svg
                              className="animate-spin"
                              width="13"
                              height="13"
                              viewBox="0 0 24 24"
                              fill="none"
                            >
                              <circle
                                cx="12"
                                cy="12"
                                r="10"
                                stroke="currentColor"
                                strokeWidth="4"
                                className="opacity-25"
                              />
                              <path
                                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                                fill="currentColor"
                                className="opacity-75"
                              />
                            </svg>
                            Processing...
                          </>
                        ) : total === 0 ? (
                          <>
                            Get tickets
                            <svg
                              width="15"
                              height="15"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                            >
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          </>
                        ) : (
                          <>
                            Continue to payment
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
                      </>
                    )}
                    {step === 3 && (
                      <>
                        {isProcessing ? (
                          <>
                            <svg
                              className="animate-spin"
                              width="13"
                              height="13"
                              viewBox="0 0 24 24"
                              fill="none"
                            >
                              <circle
                                cx="12"
                                cy="12"
                                r="10"
                                stroke="currentColor"
                                strokeWidth="4"
                                className="opacity-25"
                              />
                              <path
                                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                                fill="currentColor"
                                className="opacity-75"
                              />
                            </svg>
                            Processing...
                          </>
                        ) : (
                          <>
                            <svg
                              width="13"
                              height="13"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                            >
                              <rect
                                x="3"
                                y="11"
                                width="18"
                                height="11"
                                rx="2"
                                ry="2"
                              />
                              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                            </svg>
                            Pay {fmt(total)}
                          </>
                        )}
                      </>
                    )}
                  </button>

                  {/* Terms — directly under the Get tickets / Continue CTA */}
                  {step === 2 && (
                    <label className="flex items-start gap-2.5 mt-3 cursor-pointer">
                      <div
                        onClick={() => setAgreed(!agreed)}
                        className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors cursor-pointer ${
                          agreed ? "bg-brand" : "border-2 border-[#C7CEDA]"
                        }`}
                      >
                        {agreed && (
                          <svg
                            width="11"
                            height="11"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="white"
                            strokeWidth="3"
                          >
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )}
                      </div>
                      <span className="text-xs text-muted leading-relaxed">
                        I agree to Byro&apos;s{" "}
                        <a href="/terms" target="_blank" className="text-brand hover:underline">
                          Terms
                        </a>{" "}
                        and{" "}
                        <a
                          href="/refund-policy"
                          target="_blank"
                          className="text-brand hover:underline"
                        >
                          Refund policy
                        </a>
                        .
                      </span>
                    </label>
                  )}
                </div>
              </div>
            </div>
          )}
      </div>
    </div>
  );
}
