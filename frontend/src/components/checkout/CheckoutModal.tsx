"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import API from "@/services/api";
import { toast } from "sonner";

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
  ticket_price: number;
  event_image_url?: string;
  is_active: boolean;
}

interface TicketTier {
  id: string | number;
  name: string;
  description?: string;
  price: number;
  capacity?: number | null;
  remaining?: number | null;
}

const categoryGradients: Record<string, string> = {
  entertainment: "from-purple-700 via-purple-500 to-pink-500",
  web3_crypto: "from-amber-600 via-amber-500 to-orange-400",
  art_culture: "from-pink-700 via-pink-500 to-rose-400",
  conference: "from-emerald-700 via-emerald-600 to-teal-500",
  fitness: "from-orange-600 via-amber-500 to-yellow-400",
  technology: "from-indigo-700 via-indigo-500 to-violet-400",
  other: "from-gray-600 via-gray-500 to-slate-400",
};

const categoryLabels: Record<string, string> = {
  entertainment: "CONCERTS & MUSIC",
  web3_crypto: "WEB3 & CRYPTO",
  art_culture: "NIGHTLIFE & PARTIES",
  conference: "CONFERENCES",
  fitness: "SPORTS",
  technology: "TECHNOLOGY",
  other: "OTHER",
};

const categoryDotColors: Record<string, string> = {
  entertainment: "bg-purple-300",
  web3_crypto: "bg-amber-300",
  art_culture: "bg-pink-300",
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
  }).format(price);

const STEPS = ["Tickets", "Details", "Payment", "Done"];

interface Props {
  event: Event;
  onClose: () => void;
  tiers?: TicketTier[];
}

export default function CheckoutModal({ event, onClose, tiers: tiersProp }: Props) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [isProcessing, setIsProcessing] = useState(false);

  /* ── Tickets ── */
  const tiers: TicketTier[] = (tiersProp && tiersProp.length > 0)
    ? tiersProp.map(t => ({ ...t, price: parseFloat(String(t.price)) || 0 }))
    : [{ id: "general", name: "General Admission", description: "Standing · main floor", price: event.ticket_price }];

  const [quantities, setQuantities] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    const src = (tiersProp && tiersProp.length > 0)
      ? tiersProp
      : [{ id: "general", name: "General Admission", description: "Standing · main floor", price: event.ticket_price }];
    src.forEach((t, i) => { init[String(t.id)] = i === 0 ? 1 : 0; });
    return init;
  });
  const [promoCode, setPromoCode] = useState("");
  const [promoApplied, setPromoApplied] = useState(false);
  const [promoDiscount] = useState(1000);
  const [promoLabel] = useState("EARLYBIRD");

  /* ── Details ── */
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [delivery, setDelivery] = useState("email");
  const [agreed, setAgreed] = useState(false);

  /* ── Payment ── */
  const [payMethod, setPayMethod] = useState("paystack");

  /* ── Calculations ── */
  const subtotal = tiers.reduce(
    (s, t) => s + t.price * (quantities[String(t.id)] || 0),
    0
  );
  const serviceFee = Math.round(subtotal * 0.05);
  const discount = promoApplied ? promoDiscount : 0;
  const total = subtotal + serviceFee - discount;
  const totalQty = Object.values(quantities).reduce((a: number, b: number) => a + b, 0);

  const applyPromo = () => {
    if (promoCode.trim().toUpperCase() === "EARLYBIRD") setPromoApplied(true);
  };

  const handlePayment = async () => {
    if (!fullName.trim() || !email.trim()) {
      toast.error("Please fill in your name and email before proceeding.");
      return;
    }

    setIsProcessing(true);
    try {
      // Find the first tier with quantity > 0 to pass as tier_id
      const activeTierForPayment = tiers.find(t => (quantities[String(t.id)] || 0) > 0);
      const tier_id = typeof activeTierForPayment?.id === "number" ? activeTierForPayment.id : undefined;

      if (total === 0) {
        const result = await API.initializePayment({
          event_slug: event.slug,
          customer_email: email,
          customer_name: fullName,
          quantity: totalQty,
          tier_id,
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
        setStep(4);
        return;
      }

      const result = await API.initializePayment({
        event_slug: event.slug,
        customer_email: email,
        customer_name: fullName,
        quantity: totalQty,
        tier_id,
      });

      if (result?.data?.authorization_url) {
        window.location.href = result.data.authorization_url;
      } else {
        toast.error("Could not get payment link. Please try again.");
      }
    } catch (err: unknown) {
      console.error("Payment error:", err);
      const message = err instanceof Error ? err.message : "Payment failed. Please try again.";
      toast.error(message);
    } finally {
      setIsProcessing(false);
    }
  };

  const gradient =
    categoryGradients[event.category] || categoryGradients.other;
  const dotColor =
    categoryDotColors[event.category] || "bg-gray-300";
  const badgeLabel =
    categoryLabels[event.category] || event.category.toUpperCase();
  const dateStr = formatDate(event.day);
  const timeStr = formatTime(event.time_from);

  return (
    <div className="fixed inset-0 z-50 bg-[#F1F4F9] overflow-y-auto">
      {/* ── Checkout header ── */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-4 sm:px-6 py-3.5 flex items-center justify-between">
        <Link href="/" onClick={onClose}>
          <Image
            src="/assets/images/logo.svg"
            alt="byro"
            width={70}
            height={28}
            className="h-7 w-auto"
            priority
          />
        </Link>
        <div className="flex items-center gap-1.5 text-sm text-gray-400">
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          Secure checkout
        </div>
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
          Exit
        </button>
      </div>

      {/* ── Step indicator ── */}
      <div className="bg-white border-b border-gray-100 px-6 py-4">
        <div className="flex items-center justify-center">
          {STEPS.map((name, i) => {
            const n = i + 1;
            const done = step > n;
            const active = step === n;
            return (
              <div key={name} className="flex items-center">
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <div
                    className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-xs sm:text-sm font-bold transition-colors shrink-0 ${
                      done
                        ? "bg-emerald-500 text-white"
                        : active
                        ? "bg-blue-600 text-white"
                        : "bg-gray-100 text-gray-400"
                    }`}
                  >
                    {done ? (
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
                    ) : (
                      n
                    )}
                  </div>
                  <span
                    className={`hidden sm:inline text-sm font-medium ${
                      active
                        ? "text-gray-900"
                        : done
                        ? "text-gray-600"
                        : "text-gray-400"
                    }`}
                  >
                    {name}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <div
                    className={`w-6 sm:w-14 lg:w-20 h-0.5 mx-2 sm:mx-3 rounded-full transition-colors ${
                      step > n ? "bg-emerald-400" : "bg-gray-200"
                    }`}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Main content ── */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex flex-col lg:flex-row gap-6 items-start">
          {/* Left panel */}
          <div className="flex-1 w-full">
            {/* Step 1 – Tickets */}
            {step === 1 && (
              <div className="bg-white rounded-2xl p-6 sm:p-8 border border-gray-100 shadow-sm">
                <h1 className="text-2xl font-bold text-gray-900 mb-1">
                  Choose your tickets
                </h1>
                <p className="text-sm text-gray-500 mb-6">
                  Select the tiers and quantities you want.{" "}
                  {(() => {
                    const totalRemaining = tiers.reduce((s, t) => s + (t.remaining ?? 0), 0);
                    return totalRemaining > 0 ? (
                      <span className="text-orange-500 font-semibold">
                        {totalRemaining.toLocaleString()} tickets left.
                      </span>
                    ) : null;
                  })()}
                </p>

                <div className="space-y-3">
                  {tiers.map((tier) => (
                    <div
                      key={tier.id}
                      className={`rounded-xl border p-4 flex items-center justify-between transition-colors ${
                        (quantities[String(tier.id)] || 0) > 0
                          ? "border-blue-300 bg-blue-50/50"
                          : "border-gray-100"
                      }`}
                    >
                      <div>
                        <p className="font-semibold text-gray-900 text-sm">
                          {tier.name}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {tier.description}
                          {tier.remaining != null && tier.remaining > 0 && (
                            <span className="text-orange-500 ml-1">· {tier.remaining} left</span>
                          )}
                          {tier.remaining === 0 && (
                            <span className="text-red-500 ml-1">· Sold out</span>
                          )}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <span className="font-semibold text-gray-900 text-sm">
                          {fmt(tier.price)}
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() =>
                              setQuantities((p) => ({
                                ...p,
                                [String(tier.id)]: Math.max(0, (p[String(tier.id)] || 0) - 1),
                              }))
                            }
                            className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50 transition-colors"
                          >
                            <svg
                              width="13"
                              height="13"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2.5"
                            >
                              <line x1="5" y1="12" x2="19" y2="12" />
                            </svg>
                          </button>
                          <span className="w-5 text-center font-semibold text-gray-900 text-sm">
                            {quantities[String(tier.id)]}
                          </span>
                          <button
                            onClick={() =>
                              setQuantities((p) => ({
                                ...p,
                                [String(tier.id)]: (p[String(tier.id)] || 0) + 1,
                              }))
                            }
                            disabled={tier.remaining === 0}
                            className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            <svg
                              width="13"
                              height="13"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2.5"
                            >
                              <line x1="12" y1="5" x2="12" y2="19" />
                              <line x1="5" y1="12" x2="19" y2="12" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Promo code */}
                <div className="mt-4 flex items-center border border-gray-200 rounded-xl overflow-hidden">
                  <div className="flex items-center gap-3 flex-1 px-4 py-3">
                    <svg
                      width="15"
                      height="15"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      className="text-gray-400 flex-shrink-0"
                    >
                      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
                      <line x1="7" y1="7" x2="7.01" y2="7" />
                    </svg>
                    <input
                      type="text"
                      value={promoCode}
                      onChange={(e) => setPromoCode(e.target.value)}
                      placeholder="Have a promo code?"
                      className="flex-1 text-sm text-gray-700 placeholder-gray-400 focus:outline-none bg-transparent"
                    />
                  </div>
                  <button
                    onClick={applyPromo}
                    className="px-5 py-3 text-sm font-semibold text-gray-700 border-l border-gray-200 hover:bg-gray-50 transition-colors"
                  >
                    Apply
                  </button>
                </div>
                {promoApplied && (
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
              </div>
            )}

            {/* Step 2 – Details */}
            {step === 2 && (
              <div className="bg-white rounded-2xl p-6 sm:p-8 border border-gray-100 shadow-sm">
                <h1 className="text-2xl font-bold text-gray-900 mb-1">
                  Your details
                </h1>
                <p className="text-sm text-gray-500 mb-6">
                  We will send your tickets and entry QR here.
                </p>

                <div className="space-y-4">
                  {/* Full name */}
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-1.5">
                      Full name
                    </label>
                    <div className="relative">
                      <svg
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
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
                        className="w-full border border-gray-200 text-black rounded-xl pl-9 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-gray-400"
                      />
                    </div>
                  </div>

                  {/* Email + Phone */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium text-gray-700 block mb-1.5">
                        Email address
                      </label>
                      <div className="relative">
                        <svg
                          className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
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
                          className="w-full border border-gray-200 text-black rounded-xl pl-9 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-gray-400"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-700 block mb-1.5">
                        Phone number
                      </label>
                      <div className="relative">
                        <svg
                          className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
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
                          className="w-full border border-gray-200 text-blackrounded-xl pl-9 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-gray-400"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Billing address */}
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-1.5">
                      Billing address
                    </label>
                    <div className="relative">
                      <svg
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                        width="15"
                        height="15"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                        <circle cx="12" cy="10" r="3" />
                      </svg>
                      <input
                        type="text"
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                        placeholder="12 Karimu Kotun St, Victoria Island"
                        className="w-full border border-gray-200 text-black rounded-xl pl-9 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-gray-400"
                      />
                    </div>
                  </div>
                </div>

                {/* Ticket delivery */}
                <div className="mt-5 border border-gray-100 rounded-xl p-4">
                  <p className="font-semibold text-gray-900 text-sm mb-3">
                    Ticket delivery
                  </p>
                  <div className="space-y-3">
                    {[
                      {
                        v: "email",
                        label: `Email tickets to me${
                          fullName ? ` (${fullName})` : ""
                        }`,
                      },
                      { v: "each", label: "Send each ticket to a different guest" },
                    ].map((opt) => (
                      <label
                        key={opt.v}
                        className="flex items-center gap-3 cursor-pointer"
                      >
                        <div
                          onClick={() => setDelivery(opt.v)}
                          className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors cursor-pointer ${
                            delivery === opt.v
                              ? "border-blue-600"
                              : "border-gray-300"
                          }`}
                        >
                          {delivery === opt.v && (
                            <div className="w-2.5 h-2.5 rounded-full bg-blue-600" />
                          )}
                        </div>
                        <span className="text-sm text-gray-700">{opt.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Terms checkbox */}
                <label className="flex items-start gap-3 mt-4 cursor-pointer">
                  <div
                    onClick={() => setAgreed(!agreed)}
                    className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors cursor-pointer ${
                      agreed
                        ? "bg-blue-600"
                        : "border-2 border-gray-300"
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
                  <span className="text-sm text-gray-500 leading-relaxed">
                    Send me event updates and reminders. I agree to Byro&apos;s{" "}
                    <a href="/terms" className="text-blue-600 hover:underline">
                      Terms
                    </a>{" "}
                    and{" "}
                    <a
                      href="/refund-policy"
                      className="text-blue-600 hover:underline"
                    >
                      Refund policy
                    </a>
                    .
                  </span>
                </label>
              </div>
            )}

            {/* Step 3 – Payment */}
            {step === 3 && (
              <div className="bg-white rounded-2xl p-6 sm:p-8 border border-gray-100 shadow-sm">
                <h1 className="text-2xl font-bold text-gray-900 mb-1">
                  Payment
                </h1>
                <p className="text-sm text-gray-500 mb-6">
                  All transactions are encrypted and secure.
                </p>

                {/* Payment methods */}
                <div className="space-y-3 mb-5">
                  {/* Pay with Paystack */}
                  <label
                    className={`flex items-center gap-4 p-4 rounded-xl border cursor-pointer transition-colors ${
                      payMethod === "paystack"
                        ? "border-blue-300 bg-blue-50/40"
                        : "border-gray-100 hover:border-gray-200"
                    }`}
                  >
                    <div
                      onClick={() => setPayMethod("paystack")}
                      className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors cursor-pointer ${
                        payMethod === "paystack"
                          ? "border-blue-600"
                          : "border-gray-300"
                      }`}
                    >
                      {payMethod === "paystack" && (
                        <div className="w-2.5 h-2.5 rounded-full bg-blue-600" />
                      )}
                    </div>
                    <span className="text-gray-400 flex-shrink-0">
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
                      <p className="font-semibold text-gray-900 text-sm">
                        Pay with Paystack
                      </p>
                      <p className="text-gray-500 text-xs mt-0.5">
                        Card, bank transfer &amp; more
                      </p>
                    </div>
                  </label>

                  {/* Pay with Crypto — coming soon */}
                  <div className="flex items-center gap-4 p-4 rounded-xl border border-gray-100 opacity-60 cursor-not-allowed select-none">
                    <div className="w-5 h-5 rounded-full border-2 border-gray-300 flex-shrink-0" />
                    <span className="text-gray-400 flex-shrink-0">
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
                        <p className="font-semibold text-gray-900 text-sm">
                          Pay with Crypto
                        </p>
                        <p className="text-gray-500 text-xs mt-0.5">
                          BTC, ETH, USDT and more
                        </p>
                      </div>
                      <span className="ml-auto text-[10px] font-bold uppercase tracking-wide bg-amber-100 text-amber-600 px-2.5 py-1 rounded-full flex-shrink-0">
                        Coming Soon
                      </span>
                    </div>
                  </div>
                </div>

                <p className="text-xs text-gray-400 flex items-center gap-1.5 mt-4">
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

            {/* Step 4 – Done */}
            {step === 4 && (
              <div className="bg-white rounded-2xl p-10 border border-gray-100 shadow-sm text-center">
                <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-5">
                  <svg
                    width="30"
                    height="30"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#10b981"
                    strokeWidth="2.5"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                <h1 className="text-2xl font-bold text-gray-900 mb-2">
                  You&apos;re in!
                </h1>
                <p className="text-gray-500 text-sm mb-6 max-w-xs mx-auto">
                  Your tickets have been confirmed. Check your email for your QR
                  entry codes.
                </p>
                <button
                  onClick={onClose}
                  className="bg-blue-600 text-white font-semibold px-8 py-3 rounded-full hover:bg-blue-700 transition-colors"
                >
                  Back to events
                </button>
              </div>
            )}
          </div>

          {/* ── Right panel – Order summary ── */}
          {step < 4 && (
            <div className="lg:w-72 xl:w-80 w-full shrink-0 order-last lg:order-none">
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden lg:sticky lg:top-28">
                {/* Event preview */}
                <div className="relative h-28">
                  {event.event_image_url ? (
                    <Image
                      src={event.event_image_url}
                      alt={event.name}
                      fill
                      className="object-cover"
                    />
                  ) : (
                    <div
                      className={`w-full h-full bg-gradient-to-br ${gradient}`}
                    />
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
                  <button className="absolute top-2.5 right-2.5 w-7 h-7 bg-white/80 backdrop-blur-sm rounded-full flex items-center justify-center">
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      className="text-gray-600"
                    >
                      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                    </svg>
                  </button>
                </div>

                <div className="p-4">
                  <h3 className="font-bold text-gray-900 text-base mb-2">
                    {event.name}
                  </h3>
                  <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-1">
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
                  <div className="flex items-center gap-1.5 text-xs text-gray-500">
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
                    <div className="mt-4 pt-4 border-t border-gray-100 space-y-2">
                      {tiers.map((t) => {
                        const q = quantities[String(t.id)] || 0;
                        if (!q) return null;
                        return (
                          <div
                            key={t.id}
                            className="flex justify-between text-sm"
                          >
                            <span className="text-gray-600">
                              {q} × {t.name}
                            </span>
                            <span className="font-medium text-gray-900">
                              {fmt(t.price * q)}
                            </span>
                          </div>
                        );
                      })}
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Service fee</span>
                        <span className="text-gray-700">{fmt(serviceFee)}</span>
                      </div>
                      {promoApplied && (
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
                            Promo: {promoLabel}
                          </span>
                          <span className="text-emerald-600">
                            -{fmt(promoDiscount)}
                          </span>
                        </div>
                      )}
                      <div className="flex justify-between pt-2 border-t border-gray-100 mt-1">
                        <span className="font-bold text-gray-900">Total</span>
                        <span className="font-bold text-gray-900 text-lg">
                          {fmt(total)}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* CTA */}
                  <button
                    onClick={() => {
                      if (step === 2 && (!fullName.trim() || !email.trim())) {
                        toast.error("Please fill in your name and email before proceeding.");
                        return;
                      }
                      if (step === 3) {
                        handlePayment();
                      } else {
                        setStep((s) => Math.min(s + 1, 4));
                      }
                    }}
                    disabled={(step === 1 && totalQty === 0) || isProcessing}
                    className="mt-4 w-full bg-blue-600 text-white font-semibold py-3 rounded-full hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed text-sm"
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
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
