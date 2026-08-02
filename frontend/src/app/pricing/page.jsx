"use client";
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

function CheckIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#3b82f6"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="flex-shrink-0"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

export default function PricingPage() {
  return (
    <>
      <Navbar />
      <div className="min-h-screen bg-white">
        {/* Hero */}
        <div className="text-center pt-24 pb-20 px-4">
          <p className="text-blue-600 text-sm font-medium tracking-wide mb-4">
            Pricing
          </p>
          <h1 className="text-5xl sm:text-6xl font-bold text-gray-900 tracking-tight">
            We earn when you{" "}
            <span className="text-blue-600">sell</span>
          </h1>
          <p className="text-gray-400 mt-5 text-lg max-w-md mx-auto">
            No setup fees. Only pay when you sell.
          </p>
        </div>

        {/* Plan Card */}
        <div className="max-w-lg mx-auto px-4 pb-20 -mt-4">
          <div className="bg-gray-50 rounded-3xl p-10">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-4">
              Standard
            </p>

            <div className="flex items-baseline gap-3 mb-2">
              <span className="text-6xl font-bold text-gray-900 tracking-tight">
                Free
              </span>
            </div>
            <p className="text-gray-400 text-sm mb-10">
              8% + ₦100 per paid ticket
            </p>

            <Link
              href="/events/create"
              className="block w-full text-center bg-gray-900 hover:bg-gray-800 text-white font-medium py-4 rounded-2xl transition-colors text-sm"
            >
              Start selling
            </Link>

            <div className="w-full h-px bg-gray-200 my-10" />

            <ul className="space-y-4">
              {standardFeatures.map((f) => (
                <li key={f} className="flex items-center gap-3 text-sm text-gray-600">
                  <CheckIcon />
                  {f}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* FAQ */}
        <div className="max-w-2xl mx-auto px-4 pb-24">
          <h2 className="text-2xl font-bold text-gray-900 mb-10 text-center">
            Common questions
          </h2>
          <div className="space-y-0 divide-y divide-gray-100">
            {faqs.map((faq, i) => (
              <div key={i} className="py-6 first:pt-0 last:pb-0">
                <p className="font-semibold text-gray-900 text-sm mb-2">
                  {faq.q}
                </p>
                <p className="text-gray-400 text-sm leading-relaxed">
                  {faq.a}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
      <Footer />
    </>
  );
}
