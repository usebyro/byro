"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { HugeiconsIcon } from "@hugeicons/react";
import { Share01Icon, FavouriteIcon, Calendar01Icon, Location01Icon, UserGroupIcon } from "@hugeicons/core-free-icons";
import API from "../../services/api";
import { toast } from "sonner";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Providers } from "@/redux/Providers";
import CheckoutModal from "@/components/checkout/CheckoutModal";

/* ── helpers ── */
const fmt = (price) =>
  new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", minimumFractionDigits: 0 }).format(price);

const categoryGradients = {
  entertainment: "from-purple-800 via-purple-600 to-pink-500",
  web3_crypto:   "from-amber-700 via-amber-500 to-orange-400",
  art_culture:   "from-pink-800 via-pink-600 to-rose-400",
  conference:    "from-emerald-800 via-emerald-600 to-teal-400",
  fitness:       "from-orange-700 via-amber-500 to-yellow-400",
  technology:    "from-indigo-800 via-indigo-600 to-violet-400",
  other:         "from-gray-700 via-gray-600 to-slate-500",
};

const categoryLabels = {
  entertainment: "CONCERTS & MUSIC",
  web3_crypto:   "WEB3 & CRYPTO",
  art_culture:   "NIGHTLIFE & PARTIES",
  conference:    "CONFERENCES",
  fitness:       "SPORTS",
  technology:    "TECHNOLOGY",
  other:         "OTHER",
};


export default function ViewEventClient({ slug }) {
  const router = useRouter();
  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [registered, setRegistered] = useState(false);
  const [ticketId, setTicketId] = useState(null);
  const [showCheckout, setShowCheckout] = useState(false);
  const [saved, setSaved] = useState(false);

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

  /* Set browser tab title */
  useEffect(() => {
    if (event?.name) document.title = `${event.name} | Byro`;
  }, [event?.name]);

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
        const [eventData, ticketData] = await Promise.all([
          API.getEvent(slug),
          hasToken ? API.getMyTicket(slug) : Promise.resolve({ registered: false }),
        ]);
        if (eventData?.id || eventData?.slug) {
          setEvent(eventData);
          if (eventData.slug && eventData.slug !== slug) router.replace(`/${eventData.slug}`);
        } else {
          throw new Error("Invalid event data");
        }
        if (ticketData?.registered) { setRegistered(true); setTicketId(ticketData.ticket_id || null); }
      } catch (err) {
        console.error(err);
        setError(err.message || "Failed to load event");
        toast.error(err.message || "Failed to load event");
      } finally {
        setLoading(false);
      }
    };
    doFetch();
  }, [slug, router]);

  /* Fetch ticket tiers for paid events */
  useEffect(() => {
    if (!event || !slug) return;
    if (parseFloat(event.ticket_price ?? 0) === 0) return;
    API.getEventTiers(slug)
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          setRealTiers(data);
          setSelectedTier(String(data[0].id));
        }
      })
      .catch(err => console.error("Failed to load tiers:", err));
  }, [event, slug]);

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

  /* Derived values */
  const formattedDate = useMemo(() => {
    if (!event?.day) return "";
    return new Date(event.day).toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "long" });
  }, [event?.day]);

  const formattedTime = useMemo(() => {
    if (!event?.time_from) return "";
    return new Date(`1970-01-01T${event.time_from}`).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
  }, [event?.time_from]);

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen bg-white">
      <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-blue-600" />
    </div>
  );

  if (error) return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4 text-center px-4">
      <h2 className="text-2xl font-bold text-gray-900">Event Not Found</h2>
      <p className="text-gray-500 text-sm">{error}</p>
      <button onClick={() => router.push("/discover")} className="bg-blue-600 text-white px-6 py-2.5 rounded-full text-sm font-semibold">
        Browse Events
      </button>
    </div>
  );

  if (!event) return null;

  const ticketPrice  = parseFloat(event.ticket_price ?? 0);
  const isFree       = ticketPrice === 0;
  const attendeeCount = event.attendee_count ?? 0;
  const gradient     = categoryGradients[event.category] || categoryGradients.other;
  const badgeLabel   = categoryLabels[event.category] || event.category?.toUpperCase();
  const imageUrl     = getImageUrl();

  const tiers = realTiers.length > 0
    ? realTiers.map(t => ({ ...t, desc: t.description || "" }))
    : (isFree ? [] : [{ id: "general", name: "General Admission", desc: "", price: ticketPrice }]);

  const activeTier   = tiers.find(t => String(t.id) === String(selectedTier)) || tiers[0] || { price: 0, name: "" };
  const tierSubtotal = activeTier.price * qty;
  const serviceFee   = isFree ? 0 : Math.round(tierSubtotal * 0.05);
  const tierTotal    = tierSubtotal + serviceFee;

  return (
    <Providers>
      <div className="min-h-screen bg-white flex flex-col">
        <Navbar />

        {/* ── Hero ── */}
        <div className="relative w-full" style={{ height: "380px" }}>
          {imageUrl ? (
            <img src={imageUrl} alt={event.name} className="w-full h-full object-cover" />
          ) : (
            <div className={`w-full h-full bg-gradient-to-br ${gradient}`} />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-black/10" />

          {/* Top-right actions */}
          <div className="absolute top-5 right-5 flex items-center gap-2">
            <button
              onClick={() => {
                if (navigator.share) {
                  navigator.share({ title: event.name, url: window.location.href });
                } else {
                  navigator.clipboard.writeText(window.location.href).then(() => toast.success("Link copied!"));
                }
              }}
              className="w-10 h-10 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center hover:bg-white/30 transition-colors"
            >
              <HugeiconsIcon icon={Share01Icon} size={16} color="white" />
            </button>
            <button
              onClick={() => setSaved(s => !s)}
              className="w-10 h-10 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center hover:bg-white/30 transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill={saved ? "white" : "none"} stroke="white" strokeWidth="2">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
              </svg>
            </button>
          </div>

          {/* Owner: Manage button */}
          {event?.role?.is_owner && (
            <button
              onClick={() => router.push(`/dashboard/${event.slug}`)}
              className="absolute top-5 left-5 bg-blue-600 text-white text-xs font-semibold px-4 py-2 rounded-full hover:bg-blue-700 transition-colors"
            >
              Manage Event
            </button>
          )}

          {/* Bottom overlay */}
          <div className="absolute bottom-0 left-0 right-0 px-6 pb-8">
            <span className="inline-flex items-center bg-white/10 backdrop-blur-sm border border-white/20 text-white text-xs font-bold tracking-wider px-3 py-1.5 rounded-full mb-4">
              {badgeLabel}
            </span>
            <h1 className="text-white text-4xl sm:text-5xl font-bold leading-tight mb-4">{event.name}</h1>
            <div className="flex flex-wrap items-center gap-5 text-white/80 text-sm">
              <span className="flex items-center gap-1.5">
                <HugeiconsIcon icon={Calendar01Icon} size={14} color="rgba(255,255,255,0.8)" />
                {formattedDate}{formattedTime && ` · ${formattedTime}`}
              </span>
              <span className="flex items-center gap-1.5">
                <HugeiconsIcon icon={Location01Icon} size={14} color="rgba(255,255,255,0.8)" />
                {event.location || "TBD"}
              </span>
              {attendeeCount > 0 && (
                <span className="flex items-center gap-1.5">
                  <HugeiconsIcon icon={UserGroupIcon} size={14} color="rgba(255,255,255,0.8)" />
                  {attendeeCount.toLocaleString()} going
                </span>
              )}
            </div>
          </div>
        </div>

        {/* ── Body ── */}
        <div className="flex-1 max-w-5xl mx-auto w-full px-4 sm:px-6 py-10 flex flex-col lg:flex-row gap-8 items-start">

          {/* Left column */}
          <div className="flex-1 min-w-0 order-2 lg:order-1">
            {/* About */}
            <section className="mb-10">
              <h2 className="text-xl font-bold text-gray-900 mb-3">About this event</h2>
              <p className="text-gray-600 text-sm leading-relaxed">
                {event.description || "No description provided for this event."}
              </p>
            </section>


            {/* Organizer */}
            <section className="mb-10">
              <div className="flex items-center justify-between p-5 border border-gray-100 rounded-2xl">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-sm shrink-0">
                    {(event.hosted_by || "EL")[0].toUpperCase()}
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-0.5">Organised by</p>
                    <p className="font-semibold text-gray-900 text-sm">{event.hosted_by || event.owner_email || "Byro Africa"}</p>
                    <p className="text-xs text-gray-400">48 events · 12k followers</p>
                  </div>
                </div>
                <button className="border border-gray-200 text-gray-700 text-xs font-semibold px-4 py-2 rounded-full hover:bg-gray-50 transition-colors">
                  Follow
                </button>
              </div>
            </section>

            {/* Location */}
            <section className="mb-10">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Location</h2>
              {event.location || event.address ? (
                <>
                  <div className="rounded-2xl overflow-hidden border border-gray-100" style={{ height: "240px" }}>
                    <iframe
                      title="event-location-map"
                      width="100%"
                      height="100%"
                      style={{ border: "none" }}
                      loading="lazy"
                      referrerPolicy="no-referrer-when-downgrade"
                      src={`https://maps.google.com/maps?q=${encodeURIComponent(event.location || event.address)}&output=embed&z=15`}
                    />
                  </div>
                  <div className="flex items-start gap-2 mt-3">
                    <HugeiconsIcon icon={Location01Icon} size={14} color="#6b7280" className="shrink-0 mt-0.5" />
                    <p className="text-sm text-gray-600">{event.location || event.address}</p>
                  </div>
                </>
              ) : (
                <div className="rounded-2xl bg-gray-50 border border-gray-100 h-40 flex flex-col items-center justify-center gap-2">
                  <HugeiconsIcon icon={Location01Icon} size={28} color="#d1d5db" />
                  <p className="text-xs text-gray-400">No location set</p>
                </div>
              )}
            </section>

            {/* Transfer (if registered + transferable) */}
            {registered && event.transferable && (
              <section className="mb-8">
                <button
                  onClick={() => setShowTransfer(s => !s)}
                  className="text-blue-600 text-sm font-medium underline"
                >
                  Transfer Ticket
                </button>
                {showTransfer && (
                  <form onSubmit={handleTransferSubmit} className="mt-4 space-y-3 max-w-sm">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Recipient&apos;s Name</label>
                      <input type="text" value={transferName} onChange={e => setTransferName(e.target.value)}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="John Doe" required />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Recipient&apos;s Email</label>
                      <input type="email" value={transferEmail} onChange={e => setTransferEmail(e.target.value)}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="example@email.com" required />
                    </div>
                    <div className="flex gap-2">
                      <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium">Send</button>
                      <button type="button" onClick={() => setShowTransfer(false)} className="bg-gray-100 text-gray-700 px-4 py-2 rounded-xl text-sm font-medium">Cancel</button>
                    </div>
                  </form>
                )}
              </section>
            )}
          </div>

          {/* ── Right sticky panel ── */}
          <div className="lg:w-72 xl:w-80 shrink-0 w-full order-1 lg:order-2">
            <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-5 lg:sticky lg:top-24">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-gray-400 font-medium">From</span>
                {event.capacity && (
                  <span className="text-[10px] font-bold text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full">
                    ● {event.capacity} LEFT
                  </span>
                )}
              </div>
              <p className="text-3xl font-bold text-gray-900 mb-5">
                {isFree ? "Free" : fmt(ticketPrice)}
              </p>

              {!isFree && (
                <>
                  <p className="text-[10px] font-bold text-gray-400 tracking-widest uppercase mb-3">Select ticket tier</p>
                  <div className="space-y-2 mb-5">
                    {tiers.map(tier => (
                      <button
                        key={tier.id}
                        onClick={() => setSelectedTier(String(tier.id))}
                        className={`w-full flex items-center justify-between p-3.5 rounded-xl border transition-colors text-left ${
                          String(selectedTier) === String(tier.id) ? "border-blue-400 bg-blue-50" : "border-gray-100 hover:border-gray-200"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                            String(selectedTier) === String(tier.id) ? "border-blue-600" : "border-gray-300"
                          }`}>
                            {String(selectedTier) === String(tier.id) && <div className="w-2 h-2 rounded-full bg-blue-600" />}
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-gray-900 leading-tight">{tier.name}</p>
                            <p className="text-xs text-gray-400">{tier.desc}</p>
                          </div>
                        </div>
                        <span className="text-sm font-bold text-gray-900 ml-2 shrink-0">{fmt(tier.price)}</span>
                      </button>
                    ))}
                  </div>

                  {/* Quantity */}
                  <div className="flex items-center justify-between mb-5">
                    <span className="text-sm font-medium text-gray-700">Quantity</span>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => setQty(q => Math.max(1, q - 1))}
                        className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50 transition-colors"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="5" y1="12" x2="19" y2="12" /></svg>
                      </button>
                      <span className="w-5 text-center font-bold text-gray-900 text-sm">{qty}</span>
                      <button
                        onClick={() => setQty(q => q + 1)}
                        className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white hover:bg-blue-700 transition-colors"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <line x1="12" y1="5" x2="12" y2="19" />
                          <line x1="5" y1="12" x2="19" y2="12" />
                        </svg>
                      </button>
                    </div>
                  </div>

                  {/* Price breakdown */}
                  <div className="space-y-2 pb-4 mb-4 border-b border-gray-100 text-sm">
                    <div className="flex justify-between text-gray-600">
                      <span>{qty} × {activeTier.name}</span>
                      <span>{fmt(tierSubtotal)}</span>
                    </div>
                    <div className="flex justify-between text-gray-400">
                      <span>Service fee</span>
                      <span>{fmt(serviceFee)}</span>
                    </div>
                    <div className="flex justify-between font-bold text-gray-900 pt-1">
                      <span>Total</span>
                      <span className="text-lg">{fmt(tierTotal)}</span>
                    </div>
                  </div>
                </>
              )}

              {registered ? (
                <div className="space-y-2">
                  <button
                    onClick={() => router.push("/ticket-confirmation")}
                    className="w-full bg-emerald-500 text-white font-semibold py-3 rounded-full hover:bg-emerald-600 transition-colors text-sm"
                  >
                    View Ticket
                  </button>
                  <button
                    onClick={handleCancelRegistration}
                    className="w-full border border-red-200 text-red-500 font-medium py-2.5 rounded-full text-sm hover:bg-red-50 transition-colors"
                  >
                    Cancel registration
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowCheckout(true)}
                  className="w-full bg-blue-600 text-white font-bold py-3.5 rounded-full hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 text-sm"
                >
                  Buy ticket
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                </button>
              )}

              <p className="text-center text-xs text-gray-400 flex items-center justify-center gap-1 mt-3">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                Secure checkout · instant QR ticket
              </p>
            </div>
          </div>
        </div>

        <Footer />

        {showCheckout && (
          <CheckoutModal event={event} onClose={() => setShowCheckout(false)} tiers={realTiers} />
        )}
      </div>
    </Providers>
  );
}
