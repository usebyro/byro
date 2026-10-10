"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter, useSearchParams, notFound } from "next/navigation";
import API from "@/services/api";
import { toast } from "sonner";
import Navbar from "@/components/Navbar";
import SuspendedEvent from "./SuspendedEvent";
import Footer from "@/components/Footer";
import { Providers } from "@/redux/Providers";
import CheckoutModal from "@/components/checkout/CheckoutModal";
import ShareMenu from "@/components/ShareMenu";
import EventPublishedModal from "@/components/events/EventPublishedModal";
import EventImage from "@/components/brand/EventImage";
import Stamp from "@/components/brand/Stamp";
import { StackTile } from "@/components/brand/EventTile";
import { categoryTone, dayParts, formatNaira, formatTime, isPast } from "@/lib/eventFormat";
import { trackViewEvent, trackShareEvent, trackSaveEvent, trackBeginCheckout } from "@/lib/analytics";
import { calculateTicketFees } from "@/lib/pricing";
import { ticketLimits, describeTicketLimits } from "@/lib/ticketLimits";

const fmt = (price) => formatNaira(price);

const iconBtn =
  "flex h-12 w-12 items-center justify-center rounded-full bg-white/95 text-ink shadow-sm transition-[scale,background-color] hover:bg-white active:scale-[0.96] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand";

/* Google Calendar "add event" link built from the event's own fields. */
function calendarUrl(event) {
  const day = (event.day || "").replace(/-/g, "");
  if (!day) return null;
  const t = (x) => (x || "00:00:00").slice(0, 5).replace(":", "") + "00";
  const start = `${day}T${t(event.time_from)}`;
  let end = `${day}T${t(event.time_to || event.time_from)}`;
  if (end < start) end = start;
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(event.name)}&dates=${start}/${end}&location=${encodeURIComponent(event.location || "")}`;
}

const inputCls =
  "w-full rounded-[14px] border border-[#D5DBE5] px-3.5 py-2.5 text-sm text-ink placeholder:text-faint focus:outline-none focus-visible:ring-2 focus-visible:ring-brand";

export default function ViewEventClient({ slug }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [suspended, setSuspended] = useState(null);
  const [registered, setRegistered] = useState(false);
  const [ticketId, setTicketId] = useState(null);
  const [showCheckout, setShowCheckout] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [more, setMore] = useState([]);

  /* Ticket tier selection */
  const [selectedTier, setSelectedTier] = useState("general");
  const [qty, setQty] = useState(1);
  const [realTiers, setRealTiers] = useState([]);

  /* Image URL helper */
  const getImageUrl = useCallback(() => {
    if (!event) return null;
    if (event.event_image_url) return event.event_image_url;
    if (!event.event_image) return null;
    if (event.event_image.startsWith("http")) return event.event_image;
    const base = (process.env.NEXT_PUBLIC_API_URL || "https://byro.onrender.com").replace(/\/api\/?$/, "");
    return `${base}${event.event_image}`;
  }, [event]);

  /* Set browser tab title + fire GA4 view_event */
  useEffect(() => {
    if (event?.name) {
      document.title = `${event.name} | Byro`;
      trackViewEvent({
        eventName: event.name,
        eventSlug: event.slug,
        category: event.category,
        isFree: parseFloat(event.ticket_price ?? 0) === 0,
      });
    }
  }, [event?.name]);

  /* Deep link from the "event published" email's share CTA: /discover/:slug?share=1 */
  useEffect(() => {
    if (!event || searchParams.get("share") !== "1") return;
    setShowShareModal(true);
    const params = new URLSearchParams(searchParams);
    params.delete("share");
    const qs = params.toString();
    router.replace(`/discover/${slug}${qs ? `?${qs}` : ""}`, { scroll: false });
  }, [event, searchParams, router, slug]);

  /* Fetch event */
  useEffect(() => {
    if (!slug) { setError("No event found"); setLoading(false); return; }
    const doFetch = async () => {
      try {
        setLoading(true);
        const hasToken = !!(
          localStorage.getItem("authToken") ||
          localStorage.getItem("token") ||
          localStorage.getItem("accessToken")
        );
        const [eventData, ticketData, tiersData] = await Promise.all([
          API.getEvent(slug),
          hasToken ? API.getMyTicket(slug) : Promise.resolve({ registered: false }),
          API.getEventTiers(slug).catch(() => []),
        ]);
        if (eventData?.id || eventData?.slug) {
          setEvent(eventData);
          if (eventData.slug && eventData.slug !== slug) router.replace(`/discover/${eventData.slug}`);
          // Try tiers embedded in event first, then fall back to dedicated endpoint
          const embeddedTiers = Array.isArray(eventData.tiers) ? eventData.tiers : [];
          const fetchedTiers = Array.isArray(tiersData)
            ? tiersData
            : Array.isArray(tiersData?.results)
            ? tiersData.results
            : [];
          const resolvedTiers = embeddedTiers.length > 0 ? embeddedTiers : fetchedTiers;
          if (resolvedTiers.length > 0) {
            setRealTiers(resolvedTiers);
            const firstOpen = resolvedTiers.find((t) => t.remaining !== 0) || resolvedTiers[0];
            setSelectedTier(String(firstOpen.id));
          }
        } else {
          throw new Error("Invalid event data");
        }
        if (ticketData?.registered) { setRegistered(true); setTicketId(ticketData.ticket_id || null); }
      } catch (err) {
        if (err.suspended) {
          setSuspended(err.event);
        } else {
          console.error(err);
          setError(err.message || "Failed to load event");
          toast.error(err.message || "Failed to load event");
        }
      } finally {
        setLoading(false);
      }
    };
    doFetch();
  }, [slug, router]);

  /* Other events you may like: same category first, then whatever is trending */
  useEffect(() => {
    if (!event?.slug) return;
    let cancelled = false;
    const pick = (data) => {
      const raw = Array.isArray(data) ? data : data?.events || data?.data || [];
      return raw.filter((e) => e.slug !== event.slug && !isPast(e)).slice(0, 4);
    };
    API.getEvents({ category: event.category })
      .then(pick)
      .then((same) => (same.length > 0 ? same : API.getEvents({ sort: "trending" }).then(pick)))
      .then((list) => { if (!cancelled) setMore(list); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [event?.slug, event?.category]);

  /* Transfer */
  const [showTransfer, setShowTransfer] = useState(false);
  const [transferEmail, setTransferEmail] = useState("");
  const [transferName, setTransferName] = useState("");

  const handleTransferSubmit = useCallback(async (e) => {
    e.preventDefault();
    try {
      await API.transferTicket(ticketId, { to_user_name: transferName, to_user_email: transferEmail });
      toast.success(`Ticket transfer sent to ${transferName}`);
      setShowTransfer(false);
      setTransferEmail(""); setTransferName("");
    } catch (err) {
      toast.error(err.message || "Transfer failed");
    }
  }, [ticketId, transferName, transferEmail]);

  const handleCancelRegistration = useCallback(async () => {
    if (!ticketId) return;
    try {
      await API.cancelRegistration(ticketId);
      setRegistered(false); setTicketId(null);
      toast.success("Registration cancelled");
    } catch (err) {
      toast.error(err.message || "Failed to cancel");
    }
  }, [ticketId]);

  /* Registration closes one full day after the event has ended */
  const registrationClosed = useMemo(() => {
    if (event?.cancelled_at) return true; // cancelled by the organiser: nothing to buy
    if (!event?.day) return false;
    const endTime = event.time_to || event.time_from || "23:59:59";
    const eventEnd = new Date(`${event.day}T${endTime}`);
    if (isNaN(eventEnd.getTime())) return false;
    const closeAt = new Date(eventEnd.getTime() + 24 * 60 * 60 * 1000);
    return new Date() > closeAt;
  }, [event?.day, event?.time_to, event?.time_from]);

  if (loading) return (
    <Providers>
      <div className="min-h-screen bg-white font-body">
        <Navbar />
        <div className="mx-auto max-w-[1440px] animate-pulse px-4 pt-8 md:px-12 xl:px-24">
          <div className="h-[260px] rounded-3xl bg-mist md:h-[460px] md:rounded-[36px]" />
          <div className="mt-10 h-12 w-2/3 rounded-2xl bg-mist" />
          <div className="mt-6 h-24 rounded-3xl bg-mist" />
        </div>
      </div>
    </Providers>
  );

  if (suspended) return (
    <Providers>
      <div className="flex min-h-screen flex-col bg-[#F7F9FC] font-body">
        <Navbar />
        <SuspendedEvent event={suspended} />
      </div>
    </Providers>
  );

  if (error || (!loading && !event)) return notFound();

  if (!event) return null;

  const rawTicketPrice = parseFloat(event.ticket_price ?? 0);
  // If tiers are present, use the lowest tier price; otherwise fall back to event.ticket_price
  const ticketPrice = realTiers.length > 0
    ? Math.min(...realTiers.map(t => parseFloat(String(t.price)) || 0))
    : rawTicketPrice;
  const isFree = ticketPrice === 0 && realTiers.every(t => parseFloat(String(t.price)) === 0);
  const attendeeCount = event.attendee_count ?? 0;
  const imageUrl = getImageUrl();
  const tone = categoryTone(event.category, event.category_display);
  const parts = dayParts(event.day);
  const timeRange = event.time_to && event.time_to !== event.time_from
    ? `${formatTime(event.time_from)} – ${formatTime(event.time_to)}`
    : formatTime(event.time_from);
  const calUrl = calendarUrl(event);
  const mapsUrl = event.location
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.location)}`
    : null;
  const stampCity = (event.location || "").split(",").pop().trim().toUpperCase().slice(0, 12) || "BYRO";
  const stampDate = parts.dd ? `${parts.dd}.${(event.day || "").slice(5, 7)}.${(event.day || "").slice(2, 4)}` : "";
  const orgInitial = (event.owner_handle || event.owner_email || "B")[0].toUpperCase();

  const tiers = realTiers.length > 0
    ? realTiers.map(t => ({ ...t, desc: t.description || "", price: parseFloat(String(t.price)) || 0 }))
    : (isFree ? [] : [{ id: "general", name: "General Admission", desc: "", price: ticketPrice }]);

  const activeTier   = tiers.find(t => String(t.id) === String(selectedTier)) || tiers[0] || { price: 0, name: "" };
  // A group tier (admits_count > 1) is a SINGLE ticket that admits several
  // people, so its quantity is locked at 1 (the admits count becomes attendee
  // slots at checkout, not extra tickets).
  const { min: minQty, max: maxQty } = ticketLimits(activeTier, event);
  // Tickets are sold in the tier's bundle: never below its minimum, never above its maximum.
  const effectiveQty = Math.min(maxQty, Math.max(minQty, qty));
  const passFeeToAttendee = event.pass_fee_to_attendee !== false;
  const tierFees = calculateTicketFees(activeTier.price * effectiveQty, passFeeToAttendee);
  const tierSubtotal = tierFees.subtotal;
  // Buyer-facing "service fee" = everything added on top of the subtotal
  // (Byro's 6.5% + the simulated Paystack cut), so the breakdown reconciles
  // and the shown total equals what Paystack will actually charge.
  const serviceFee = tierFees.displayTotal - tierFees.subtotal;
  const tierTotal = tierFees.displayTotal;

  const startCheckout = () => {
    trackBeginCheckout({
      eventName: event.name,
      eventSlug: event.slug,
      value: parseFloat(event.ticket_price ?? 0),
    });
    setShowCheckout(true);
  };

  const scrollToTickets = () => {
    document.getElementById("tickets")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const stepBtn =
    "flex h-11 w-11 items-center justify-center rounded-full border border-line bg-white text-xl text-ink transition-[scale,background-color] hover:bg-mist active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand";

  return (
    <Providers>
      <div className="flex min-h-screen flex-col bg-white font-body text-ink">
        <Navbar />

        <main className="flex-1 pb-28 lg:pb-0">
          <section className="mx-auto max-w-[1440px] px-4 pt-4 md:px-12 md:pt-6 xl:px-24">
            <div className="relative h-[260px] overflow-hidden rounded-3xl bg-mist md:h-[460px] md:rounded-[36px]">
              <EventImage
                event={{ name: event.name, category: event.category, event_image_url: imageUrl }}
                sizes="(min-width: 1440px) 1248px, 100vw"
                priority
              />
              <div className="absolute right-4 top-4 flex gap-2 md:right-5 md:top-5">
                <ShareMenu
                  url={typeof window !== "undefined" ? window.location.href : ""}
                  title={event.name}
                  campaign="event_share"
                  content={event.slug}
                  onShare={(method) => trackShareEvent({ eventName: event.name, eventSlug: event.slug, method })}
                  className={iconBtn}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M12 3v13M7 8l5-5 5 5M5 14v5h14v-5" />
                  </svg>
                  <span className="sr-only">Share event</span>
                </ShareMenu>
                <button
                  type="button"
                  aria-label={saved ? "Remove from saved" : "Save event"}
                  aria-pressed={saved}
                  onClick={() => { setSaved(s => !s); if (!saved) trackSaveEvent({ eventName: event.name, eventSlug: event.slug }); }}
                  className={iconBtn}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill={saved ? "#ef4444" : "none"} stroke={saved ? "#ef4444" : "currentColor"} strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
                    <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" />
                  </svg>
                </button>
              </div>
              {event?.role?.is_owner && (
                <Link
                  href={`/dashboard/events/${event.slug}`}
                  className="absolute left-4 top-4 flex h-11 items-center rounded-full bg-ink px-5 text-sm font-bold text-white transition-[scale] active:scale-[0.96] md:left-5 md:top-5"
                >
                  Manage event
                </Link>
              )}
            </div>
          </section>

          <section className="mx-auto flex max-w-[1440px] flex-col gap-10 px-4 pt-8 md:px-12 md:pt-11 lg:flex-row lg:items-start lg:gap-16 xl:px-24">
            <div className="flex min-w-0 flex-1 flex-col gap-9">
              <div className="flex flex-col gap-3.5">
                <span
                  className="flex h-[30px] items-center self-start rounded-full px-3 text-xs font-extrabold uppercase tracking-[0.06em]"
                  style={{ background: tone.bg, color: tone.text }}
                >
                  {tone.label}
                </span>
                {event?.cancelled_at && (
                  <div role="status" className="mb-5 rounded-2xl border border-[#F2C4C4] bg-[#FDECEC] px-5 py-4 text-[#8A1C1C]">
                    <p className="font-bold">This event has been cancelled.</p>
                    {event.cancel_reason && <p className="mt-1 text-[15px] break-words">{event.cancel_reason}</p>}
                    <p className="mt-2 text-sm">If you had a ticket, check your email: paid tickets are refunded the ticket price.</p>
                  </div>
                )}
                <h1 className="text-balance font-display text-[40px] font-bold leading-none tracking-[-0.04em] md:text-[64px]">
                  {event.name}
                </h1>
                <div className="mt-1.5 grid gap-3 md:grid-cols-2">
                  <div className="flex items-center gap-3.5 rounded-[20px] bg-paper p-[18px_20px]">
                    <span className="flex h-14 w-[52px] shrink-0 flex-col items-center justify-center rounded-[14px] bg-white">
                      <span className="text-[10px] font-extrabold text-brand">{parts.month}</span>
                      <span className="font-display text-[22px] font-bold leading-none">{parts.dd}</span>
                    </span>
                    <span className="min-w-0 text-[15px]">
                      <b>{parts.long}</b>
                      <br />
                      <span className="text-muted">{timeRange}</span>
                      {calUrl && (
                        <>
                          <br />
                          <a href={calUrl} target="_blank" rel="noopener noreferrer" className="text-sm font-bold text-brand hover:text-brand-dark">
                            Add to calendar
                          </a>
                        </>
                      )}
                    </span>
                  </div>
                  <div className="flex items-center gap-3.5 rounded-[20px] bg-paper p-[18px_20px]">
                    <span className="flex h-14 w-[52px] shrink-0 items-center justify-center rounded-[14px] bg-white">
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#3669F6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21z" />
                        <circle cx="12" cy="9.5" r="2.5" />
                      </svg>
                    </span>
                    <span className="min-w-0 text-[15px]">
                      <b className="break-words">{event.location || "Location to be announced"}</b>
                      {mapsUrl && (
                        <>
                          <br />
                          <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="text-sm font-bold text-brand hover:text-brand-dark">
                            Get directions
                          </a>
                        </>
                      )}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-3.5">
                <h2 className="font-display text-[28px] font-bold tracking-[-0.02em]">About this event</h2>
                {event.description ? (
                  <div
                    className="prose max-w-[680px] text-[17px] leading-[1.7] text-[#3B4252] prose-headings:font-display prose-headings:text-ink prose-p:text-[#3B4252] prose-a:text-brand"
                    dangerouslySetInnerHTML={{ __html: event.description }}
                  />
                ) : (
                  <p className="max-w-[680px] text-[17px] leading-[1.7] text-[#3B4252]">No description provided for this event.</p>
                )}
                <div className="mt-1 flex flex-wrap gap-2">
                  {event.transferable && (
                    <span className="flex h-[34px] items-center rounded-full bg-mist px-3 text-[13px] font-bold">Tickets are transferable</span>
                  )}
                  {attendeeCount > 0 && (
                    <span className="flex h-[34px] items-center rounded-full bg-mist px-3 text-[13px] font-bold">
                      {attendeeCount.toLocaleString()} going
                    </span>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-4 rounded-3xl border border-hairline p-5 md:px-6 md:py-[22px]">
                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-sky font-extrabold text-brand">
                  {orgInitial}
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-[13px] text-muted">Organised by</span>
                  <span className="truncate text-lg font-extrabold">
                    {event.owner_handle ? `@${event.owner_handle}` : event.owner_email || "Byro Africa"}
                  </span>
                  <span className="text-[13px] text-muted">
                    {event.owner_events_count ?? 0} event{event.owner_events_count === 1 ? "" : "s"} hosted
                  </span>
                </div>
                {event.owner_handle && (
                  <Link
                    href={`/u/${event.owner_handle}`}
                    className="flex h-11 items-center rounded-full border border-line px-[18px] text-sm font-bold transition-colors hover:bg-mist focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  >
                    View profile
                  </Link>
                )}
              </div>

              <div className="flex flex-col items-start gap-5 rounded-[28px] bg-butter p-6 md:flex-row md:items-center md:gap-7 md:px-8 md:py-7">
                <Stamp name={event.name.length > 18 ? event.name.slice(0, 16) + "…" : event.name} city={stampCity} date={stampDate} ink="blue" size={120} tilt={-8} filled className="shrink-0" />
                <div className="flex flex-col gap-1.5">
                  <span className="font-display text-2xl font-bold tracking-[-0.01em]">Collect this stamp</span>
                  <span className="max-w-[460px] text-base leading-[1.55] text-muted">
                    Check in at the door.
                  </span>
                </div>
              </div>

              {(event.location || event.address) && (
                <div className="flex flex-col gap-4">
                  <h2 className="font-display text-[28px] font-bold tracking-[-0.02em]">Location</h2>
                  <div className="h-60 overflow-hidden rounded-3xl border border-hairline">
                    <iframe
                      title="Event location map"
                      width="100%"
                      height="100%"
                      style={{ border: "none" }}
                      loading="lazy"
                      referrerPolicy="no-referrer-when-downgrade"
                      src={`https://maps.google.com/maps?q=${encodeURIComponent(event.location || event.address)}&output=embed&z=15`}
                    />
                  </div>
                </div>
              )}

              {/* Transfer (if registered + transferable) */}
              {registered && event.transferable && (
                <div>
                  <button
                    type="button"
                    onClick={() => setShowTransfer(s => !s)}
                    aria-expanded={showTransfer}
                    className="text-sm font-bold text-brand underline underline-offset-4 hover:text-brand-dark"
                  >
                    Transfer ticket
                  </button>
                  {showTransfer && (
                    <form onSubmit={handleTransferSubmit} className="mt-4 max-w-sm space-y-3">
                      <div>
                        <label htmlFor="transfer-name" className="mb-1 block text-sm font-bold">Recipient&apos;s name</label>
                        <input id="transfer-name" type="text" value={transferName} onChange={e => setTransferName(e.target.value)} className={inputCls} placeholder="John Doe" required />
                      </div>
                      <div>
                        <label htmlFor="transfer-email" className="mb-1 block text-sm font-bold">Recipient&apos;s email</label>
                        <input id="transfer-email" type="email" value={transferEmail} onChange={e => setTransferEmail(e.target.value)} className={inputCls} placeholder="example@email.com" required />
                      </div>
                      <div className="flex gap-2">
                        <button type="submit" className="h-11 rounded-full bg-brand px-5 text-sm font-bold text-white transition-[filter,scale] hover:brightness-90 active:scale-[0.96]">Send ticket</button>
                        <button type="button" onClick={() => setShowTransfer(false)} className="h-11 rounded-full border border-line px-5 text-sm font-bold transition-colors hover:bg-mist">Cancel</button>
                      </div>
                    </form>
                  )}
                </div>
              )}
            </div>

            <aside
              id="tickets"
              aria-label="Tickets"
              className="flex w-full shrink-0 scroll-mt-28 flex-col gap-4 rounded-[30px] border border-hairline bg-white p-6 shadow-[0_24px_60px_rgba(20,22,28,0.08)] md:p-7 lg:sticky lg:top-28 lg:w-[420px]"
            >
              <h2 className="font-display text-2xl font-bold">Tickets</h2>

              {registered ? (
                <div className="flex flex-col gap-3">
                  <p className="rounded-2xl bg-mint px-4 py-3 text-sm font-bold text-[#1F7A52]">You&apos;re going. Your ticket is ready.</p>
                  <button
                    type="button"
                    onClick={() => router.push(`/ticket/${ticketId}`)}
                    className="flex h-14 items-center justify-center rounded-full bg-brand text-[17px] font-bold text-white transition-[filter,scale] hover:brightness-90 active:scale-[0.96] focus:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2"
                  >
                    View ticket
                  </button>
                  {isFree && (
                    <button
                      type="button"
                      onClick={handleCancelRegistration}
                      className="h-12 rounded-full border border-red-200 text-sm font-bold text-red-600 transition-colors hover:bg-red-50"
                    >
                      Cancel registration
                    </button>
                  )}
                </div>
              ) : (
                <>
                  {isFree ? (
                    <p className="font-display text-4xl font-bold">Free</p>
                  ) : tiers.length > 0 ? (
                    <>
                      <div role="radiogroup" aria-label="Ticket type" className="flex flex-col gap-3">
                        {tiers.map(tier => {
                          const sel = String(selectedTier) === String(tier.id);
                          const out = tier.remaining === 0;
                          return (
                            <button
                              key={tier.id}
                              type="button"
                              role="radio"
                              aria-checked={sel}
                              disabled={out}
                              onClick={() => {
                                setSelectedTier(String(tier.id));
                                // Start each tier at its own minimum (e.g. 2 for a couples ticket).
                                setQty(ticketLimits(tier, event).min);
                              }}
                              className={`flex items-center gap-3.5 rounded-[18px] border px-[18px] py-4 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
                                out ? "cursor-not-allowed border-line bg-paper" : sel ? "border-2 border-brand bg-[#F3F8FE]" : "border-line hover:border-[#C7CEDA]"
                              }`}
                            >
                              <span className={`h-5 w-5 shrink-0 rounded-full ${sel && !out ? "border-[6px] border-brand" : "border-2 border-[#C7CEDA]"}`} />
                              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                                <span className="text-base font-extrabold">{tier.name}</span>
                                {(tier.desc || (tier.remaining != null && tier.remaining > 0 && tier.remaining <= 10)) && (
                                  <span className="text-[13px] text-muted">
                                    {tier.desc}
                                    {tier.desc && tier.remaining != null && tier.remaining <= 10 && tier.remaining > 0 ? " · " : ""}
                                    {tier.remaining != null && tier.remaining > 0 && tier.remaining <= 10 ? `${tier.remaining} left` : ""}
                                  </span>
                                )}
                              </span>
                              <span className="shrink-0 text-base font-extrabold">
                                {out ? "Sold out" : tier.price === 0 ? "Free" : fmt(tier.price)}
                              </span>
                            </button>
                          );
                        })}
                      </div>

                      <div className="flex items-center justify-between px-0.5 py-1.5">
                        <span id="qty-label" className="text-[15px] font-bold">Quantity</span>
                        <div className="flex items-center gap-1.5" role="group" aria-labelledby="qty-label">
                          <button type="button" aria-label="Fewer tickets" onClick={() => setQty(Math.max(minQty, effectiveQty - 1))} disabled={effectiveQty <= minQty} className={stepBtn}>−</button>
                          <span aria-live="polite" className="w-8 text-center text-[17px] font-extrabold">{effectiveQty}</span>
                          <button type="button" aria-label="More tickets" onClick={() => setQty(Math.min(maxQty, effectiveQty + 1))} disabled={effectiveQty >= maxQty} className={stepBtn}>+</button>
                        </div>
                      </div>
                      <p className="-mt-2 text-right text-xs text-muted">{describeTicketLimits(activeTier, event)}</p>

                      <div className="flex flex-col gap-2 border-t-[1.5px] border-dashed border-line pt-3.5 text-[15px]">
                        <div className="flex justify-between">
                          <span className="text-muted">{effectiveQty} × {activeTier.name}</span>
                          <span className="font-bold">{fmt(tierSubtotal)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted">Service fee</span>
                          <span className="font-bold">{fmt(serviceFee)}</span>
                        </div>
                        <div className="mt-1 flex justify-between text-lg">
                          <span className="font-extrabold">Total</span>
                          <span className="font-extrabold">{fmt(tierTotal)}</span>
                        </div>
                      </div>
                    </>
                  ) : (
                    <p className="font-display text-4xl font-bold">{fmt(ticketPrice)}</p>
                  )}

                  <button
                    type="button"
                    onClick={startCheckout}
                    disabled={registrationClosed}
                    className="flex h-14 items-center justify-center rounded-full bg-brand text-[17px] font-bold text-white transition-[filter,scale] hover:brightness-90 active:scale-[0.96] focus:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-line disabled:text-faint disabled:hover:brightness-100"
                  >
                    {event?.cancelled_at ? "Event cancelled" : registrationClosed ? "Registration closed" : isFree ? "Register" : "Get tickets"}
                  </button>
                  <p className="flex items-center justify-center gap-1.5 text-center text-[13px] text-muted">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2F9E6E" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" />
                    </svg>
                    Secure checkout with Paystack
                  </p>
                </>
              )}
            </aside>
          </section>

          {more.length > 0 && (
            <section className="mx-auto flex max-w-[1440px] flex-col gap-5 px-4 pt-16 md:px-12 md:pt-[90px] xl:px-24">
              <div className="flex items-baseline justify-between gap-4">
                <h2 className="font-display text-[26px] font-bold tracking-[-0.025em] md:text-[34px]">More to go to</h2>
                <Link href="/discover" className="text-[15px] font-bold text-brand hover:text-brand-dark">See all</Link>
              </div>
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                {more.map((e) => (
                  <StackTile key={e.slug} event={e} showCategory={false} />
                ))}
              </div>
            </section>
          )}
        </main>

        {/* Phone: sticky buy bar */}
        {!registered && (
          <div className="fixed inset-x-0 bottom-0 z-40 flex items-center gap-4 border-t border-hairline bg-white/95 px-4 py-3 backdrop-blur lg:hidden">
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="text-xs text-muted">{isFree ? "Entry" : "From"}</span>
              <span className="truncate font-display text-xl font-bold">{isFree ? "Free" : fmt(ticketPrice)}</span>
            </div>
            <button
              type="button"
              onClick={scrollToTickets}
              disabled={registrationClosed}
              className="flex h-12 items-center rounded-full bg-brand px-7 text-[15px] font-bold text-white transition-[filter,scale] active:scale-[0.96] disabled:bg-line disabled:text-faint"
            >
              {event?.cancelled_at ? "Cancelled" : registrationClosed ? "Closed" : isFree ? "Register" : "Get tickets"}
            </button>
          </div>
        )}

        <Footer />

        {showCheckout && (
          <CheckoutModal event={event} onClose={() => setShowCheckout(false)} tiers={realTiers} />
        )}

        {showShareModal && event && (
          <EventPublishedModal event={event} onClose={() => setShowShareModal(false)} />
        )}
      </div>
    </Providers>
  );
}
