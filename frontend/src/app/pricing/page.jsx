"use client";
import { useState, useMemo } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import {
  FiBarChart2,
  FiZap,
  FiGift,
  FiUserPlus,
  FiTag,
  FiClock,
} from "react-icons/fi";

const eventManagementFeatures = [
  {
    icon: FiGift,
    title: "Free tickets",
    description:
      "Create free tickets with no charge to attendees or event hosts. We only make money when you do.",
  },
  {
    icon: FiClock,
    title: "Flexible payout frequencies",
    description:
      "Choose how and when you receive your earnings with customizable payout schedules that fit your cash flow needs.",
  },
  {
    icon: FiBarChart2,
    title: "Event analytics",
    description:
      "Track ticket sales and attendee engagement in real time to optimize pricing and sell more.",
  },
  {
    icon: FiZap,
    title: "Easy event creation",
    description:
      "Set up your event in minutes, including customizable ticket types and pricing.",
  },
  {
    icon: FiUserPlus,
    title: "Group tickets",
    description:
      "Offer discounted group pricing to encourage bigger orders per checkout.",
  },
  {
    icon: FiTag,
    title: "E-tickets & QR entry",
    description:
      "Secure QR codes are generated instantly for fast, frictionless check-in.",
  },
];

const standardFeatures = [
  "Unlimited free events",
  "Unlimited ticket volume",
  "Byro checkout & QR entry",
  "Reserved seating & tiers",
  "Payout in 24 hours",
  "Email support",
];

const faqs = [
  {
    q: "When do I get paid?",
    a: "Payouts land in your bank within 24 hours of submitting a payout request on the dashboard.",
  },
  {
    q: "Can I issue refunds?",
    a: "Yes. Set your own refund window per event; Byro handles the reversal automatically.",
  },
  {
    q: "Who pays the fees?",
    a: "You choose: absorb the fee or pass it to attendees at checkout.",
  },
];

const FEE_RATE = 0.08;
const FEE_FLAT = 100;

function formatNaira(amount) {
  return `₦${amount.toLocaleString("en-NG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function PayoutCalculator() {
  const [price, setPrice] = useState(10000);
  const [quantity, setQuantity] = useState(50);

  const { grossRevenue, totalFee, payout } = useMemo(() => {
    const p = Number(price) || 0;
    const q = Number(quantity) || 0;
    const fee = p * FEE_RATE + FEE_FLAT;
    return {
      grossRevenue: p * q,
      totalFee: fee * q,
      payout: (p - fee) * q,
    };
  }, [price, quantity]);

  const handleNumberChange = (setter) => (e) => {
    const val = e.target.value;
    if (val === "") return setter("");
    const num = Number(val.replace(/[^0-9.]/g, ""));
    if (!Number.isNaN(num)) setter(num);
  };

  return (
    <div className="h-full flex flex-col justify-between bg-[#0B0F19] text-white rounded-3xl p-6 sm:p-8 shadow-xl shadow-indigo-950/20">
      <div>
        <p className="text-[10px] font-extrabold uppercase tracking-widest text-[#4F6EF7]">
          Payout calculator
        </p>
        <p className="text-[11px] text-slate-500 mt-1 mb-6">
          Estimate what you&apos;ll take home before you set your ticket
          price.
        </p>

        <div className="grid grid-cols-2 gap-4 mb-6">
          <label className="block">
            <span className="text-[11px] font-semibold text-slate-400">
              Ticket price
            </span>
            <div className="mt-1.5 flex items-center bg-white/5 border border-slate-800 rounded-xl px-3 py-2.5 focus-within:border-[#4F6EF7]/60 transition-colors">
              <span className="text-xs text-slate-500 mr-1">₦</span>
              <input
                type="text"
                inputMode="decimal"
                value={price}
                onChange={handleNumberChange(setPrice)}
                className="w-full bg-transparent text-sm font-bold text-white outline-none"
              />
            </div>
          </label>

          <label className="block">
            <span className="text-[11px] font-semibold text-slate-400">
              Tickets sold
            </span>
            <div className="mt-1.5 flex items-center bg-white/5 border border-slate-800 rounded-xl px-3 py-2.5 focus-within:border-[#4F6EF7]/60 transition-colors">
              <input
                type="text"
                inputMode="numeric"
                value={quantity}
                onChange={handleNumberChange(setQuantity)}
                className="w-full bg-transparent text-sm font-bold text-white outline-none"
              />
            </div>
          </label>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex justify-between items-center pb-4 border-b border-slate-800">
          <span className="text-xs text-slate-300">
            Gross revenue ({Number(quantity) || 0} tickets)
          </span>
          <span className="text-sm font-bold">
            {formatNaira(grossRevenue)}
          </span>
        </div>
        <div className="flex justify-between items-center pb-4 border-b border-slate-800">
          <span className="text-xs text-slate-300">
            Platform fee (8% + ₦100 per ticket)
          </span>
          <span className="text-sm font-bold text-[#4F6EF7]">
            −{formatNaira(totalFee)}
          </span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-xs text-slate-300 font-semibold">
            Your payout
          </span>
          <span className="text-lg font-black">{formatNaira(payout)}</span>
        </div>
        <p className="text-[10px] text-slate-500 leading-relaxed">
          Shown assuming you absorb the fee. You can instead pass it on to
          attendees at checkout. The choice is always yours.
        </p>
      </div>
    </div>
  );
}

function CheckIcon({ color = "#4F6EF7" }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2.5"
      className="flex-shrink-0 mt-0.5"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

export default function PricingPage() {
  return (
    <>
      <Navbar />
      <div className="min-h-screen bg-[#F8FAFC] space-y-16 pb-12">
        {/* Hero */}
        <div className="text-center pt-20 pb-4 px-4 relative">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-64 bg-indigo-200/10 blur-3xl rounded-full -z-10 pointer-events-none" />
          <span className="text-[#4F6EF7] text-xs font-extrabold tracking-widest uppercase bg-indigo-50 px-3 py-1 rounded-full">
            Pricing plans
          </span>
          <h1 className="text-4xl sm:text-6xl font-black text-gray-900 tracking-tight mt-5 leading-tight">
            We earn when you{" "}
            <span
              className="italic text-[#4F6EF7]"
              style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
            >
              sell
            </span>
          </h1>
          <p className="text-gray-500 mt-4 text-xs sm:text-sm max-w-sm sm:max-w-md mx-auto leading-relaxed">
            Simple and transparent fee structure. No setup costs. Free tickets are always 100% free.
          </p>
        </div>

        {/* Plan Card + Payout Calculator */}
        <div className="max-w-4xl mx-auto px-4 relative">
          <div
            aria-hidden
            className="absolute -inset-x-24 -top-8 -bottom-8 -z-10 bg-indigo-50/30 blur-3xl rounded-full pointer-events-none"
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-stretch">
            {/* Standard Card (only live plan) */}
            <div className="bg-[#0B0F19] text-white border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-sm relative">
              <div className="absolute top-6 right-6">
                <span className="bg-[#4F6EF7] text-white text-[10px] font-extrabold px-3 py-1 rounded-full uppercase tracking-wider">
                  Active
                </span>
              </div>
              <div>
                <h2 className="text-xl font-bold text-white tracking-tight">Standard</h2>
                <p className="text-slate-400 text-xs mt-1.5">
                  For everyone hosting and selling tickets.
                </p>

                <div className="mt-6">
                  <span className="text-5xl sm:text-6xl font-black text-white">Free</span>
                </div>
                <p className="text-slate-400 text-xs mt-1 mb-6">
                  8% + ₦100 per paid ticket sold
                </p>
              </div>

              <div>
                <Link
                  href="/events/create"
                  className="block w-full text-center bg-[#4F6EF7] hover:bg-blue-700 text-white text-xs font-bold py-3.5 px-4 rounded-full transition-colors"
                >
                  Start free
                </Link>

                <ul className="mt-8 space-y-3.5 border-t border-slate-800/80 pt-6">
                  {standardFeatures.map((f) => (
                    <li
                      key={f}
                      className="flex items-start gap-2.5 text-xs text-slate-300"
                    >
                      <CheckIcon color="#4F6EF7" />
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <PayoutCalculator />
          </div>
        </div>

        {/* Event Management */}
        <div className="bg-[#EEF2FF]/40 border-y border-indigo-50/50 py-20 relative">
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#8080800a_1px,transparent_1px),linear-gradient(to_bottom,#8080800a_1px,transparent_1px)] bg-[size:14px_24px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] pointer-events-none" />
          <div className="w-[90%] max-w-6xl mx-auto relative z-10">
            <div className="text-center mb-12">
              <span className="text-[#4F6EF7] text-xs font-bold tracking-widest uppercase bg-indigo-50 px-2.5 py-1 rounded-full">
                What&apos;s included
              </span>
              <h2 className="text-2xl sm:text-4xl font-extrabold text-gray-900 mt-4 max-w-2xl mx-auto leading-tight tracking-tight">
                Everything needed to manage your event
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {eventManagementFeatures.map((feature) => {
                const Icon = feature.icon;
                return (
                  <div
                    key={feature.title}
                    className="bg-white rounded-2xl border border-gray-100/80 shadow-sm p-6 hover:shadow-md hover:-translate-y-1 transition-all duration-300 group"
                  >
                    <div className="w-10 h-10 rounded-lg bg-indigo-50 text-[#4F6EF7] flex items-center justify-center group-hover:bg-[#4F6EF7] group-hover:text-white transition-all duration-300">
                      <Icon size={18} />
                    </div>
                    <h3 className="mt-4 text-base font-bold text-gray-900">
                      {feature.title}
                    </h3>
                    <p className="mt-2.5 text-xs text-gray-500 leading-relaxed">
                      {feature.description}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Common Questions */}
        <div className="w-[90%] mx-auto max-w-4xl">
          <div className="bg-white rounded-3xl p-6 sm:p-10 shadow-sm border border-gray-100/80">
            <h2 className="text-2xl font-black text-gray-900 mb-8 text-center tracking-tight">
              Common questions
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-8 gap-y-8">
              {faqs.map((faq, i) => (
                <div key={i} className="flex gap-3 hover:bg-slate-50/50 p-2 rounded-lg transition-colors duration-200">
                  <CheckIcon color="#4F6EF7" />
                  <div>
                    <p className="font-bold text-gray-900 text-sm mb-1.5">
                      {faq.q}
                    </p>
                    <p className="text-gray-500 text-xs leading-relaxed">
                      {faq.a}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Closing CTA */}
        <div className="max-w-2xl mx-auto px-4 text-center">
          <h2 className="text-2xl sm:text-3xl font-black text-gray-900 tracking-tight">
            Ready to start selling?
          </h2>
          <p className="text-gray-500 mt-3 text-xs sm:text-sm max-w-sm mx-auto leading-relaxed">
            Create your first event in minutes. No setup costs, no monthly
            fees. We only earn when you sell.
          </p>
          <Link
            href="/events/create"
            className="inline-block mt-6 bg-[#4F6EF7] hover:bg-blue-700 text-white text-xs font-bold py-3.5 px-8 rounded-full transition-colors"
          >
            Start free
          </Link>
        </div>
      </div>
      <Footer />
    </>
  );
}
