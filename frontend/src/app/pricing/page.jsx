"use client";
import { useState } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

const standardFeatures = [
  "Unlimited free events",
  "Unlimited ticket volume",
  "Byro checkout & QR entry",
  "Reserved seating & tiers",
  "Payout in 24 hours",
  "Email support",
];

const customFeatures = [
  "Everything in Standard",
  "API access & webhooks",
  "Custom event branding",
  "Email marketing tools",
  "Multi-event dashboards",
  "Dedicated account manager",
  "Custom contracts & SLAs",
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
    a: "You choose — absorb the fee or pass it to attendees at checkout.",
  },
];

function CheckIcon({ color = "#22c55e" }) {
  return (
    <svg
      width="16"
      height="16"
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
  const [tab, setTab] = useState("standard");

  return (
    <>
      <Navbar />
      <div className="min-h-screen bg-[#F5F7FA]">
        {/* Hero */}
        <div className="text-center pt-16 pb-12 px-4">
          <span className="text-blue-600 text-xs font-semibold tracking-widest uppercase">
            Pricing
          </span>
          <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 mt-3 leading-tight">
            We earn when you{" "}
            <span className="text-blue-500 italic font-bold">sell</span>
          </h1>
          <p className="text-gray-500 mt-4 text-base max-w-sm mx-auto">
            No setup fees. Only pay when you sell.
          </p>

          {/* Toggle */}
          <div className="mt-8 inline-flex items-center bg-white border border-gray-200 rounded-full p-1 shadow-sm">
            <button
              onClick={() => setTab("standard")}
              className={`px-6 py-2 rounded-full text-sm font-medium transition-all ${
                tab === "standard"
                  ? "bg-gray-900 text-white shadow-sm"
                  : "text-gray-500 hover:text-gray-800"
              }`}
            >
              Standard
            </button>
            <button
              onClick={() => setTab("custom")}
              className={`px-6 py-2 rounded-full text-sm font-medium transition-all ${
                tab === "custom"
                  ? "bg-gray-900 text-white shadow-sm"
                  : "text-gray-500 hover:text-gray-800"
              }`}
            >
              Custom
            </button>
          </div>
        </div>

        {/* Plan Cards */}
        <div className="max-w-5xl mx-auto px-4 pb-16">
          {tab === "standard" ? (
            <div className="max-w-md mx-auto">
              <div className="bg-white border-2 border-blue-500 rounded-2xl p-8 shadow-xl shadow-blue-100">
                <h2 className="text-xl font-bold text-gray-900">Standard</h2>
                <p className="text-gray-500 text-sm mt-1">
                  For everyone selling tickets on Byro.
                </p>

                <div className="mt-6">
                  <span className="text-5xl font-extrabold text-gray-900">
                    Free
                  </span>
                </div>
                <p className="text-gray-500 text-sm mt-1 mb-6">
                  8% + ₦100 per paid ticket
                </p>

                <Link
                  href="/events/create"
                  className="block w-full text-center bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-3 rounded-xl transition-colors text-sm"
                >
                  Start free
                </Link>

                <ul className="mt-8 space-y-3">
                  {standardFeatures.map((f) => (
                    <li
                      key={f}
                      className="flex items-start gap-2.5 text-sm text-gray-700"
                    >
                      <CheckIcon />
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ) : (
            <div className="max-w-md mx-auto">
              <div className="bg-white border border-gray-200 rounded-2xl p-8 shadow-sm relative">
                <div className="absolute top-5 right-5">
                  <span className="bg-gray-100 text-gray-500 text-xs font-semibold px-3 py-1.5 rounded-full">
                    Coming soon
                  </span>
                </div>

                <h2 className="text-xl font-bold text-gray-900">Custom</h2>
                <p className="text-gray-500 text-sm mt-1">
                  For venues and large promoters.
                </p>

                <div className="mt-6">
                  <span className="text-5xl font-extrabold text-gray-900">
                    Custom
                  </span>
                </div>
                <p className="text-gray-500 text-sm mt-1 mb-6">
                  Volume pricing &amp; dedicated rates
                </p>

                <button
                  disabled
                  className="w-full text-center bg-gray-100 text-gray-400 font-medium px-4 py-3 rounded-xl cursor-not-allowed text-sm"
                >
                  Coming soon
                </button>

                <ul className="mt-8 space-y-3">
                  {customFeatures.map((f) => (
                    <li
                      key={f}
                      className="flex items-start gap-2.5 text-sm text-gray-400"
                    >
                      <CheckIcon color="#9ca3af" />
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>

        {/* Common Questions */}
        <div className="w-[90%] mx-auto pb-24">
          <div className="bg-white rounded-2xl p-8 sm:p-10 shadow-sm border border-gray-100">
            <h2 className="text-2xl font-bold text-gray-900 mb-8">
              Common questions
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-12 gap-y-8">
              {faqs.map((faq, i) => (
                <div key={i} className="flex gap-3">
                  <CheckIcon color="#3b82f6" />
                  <div>
                    <p className="font-semibold text-gray-900 text-sm mb-1">
                      {faq.q}
                    </p>
                    <p className="text-gray-500 text-sm leading-relaxed">
                      {faq.a}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </>
  );
}
