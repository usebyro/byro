"use client";

import { useState } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { FAQS } from "@/lib/faqs";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Ticket01Icon,
  CreditCardIcon,
  UserIcon,
  Store01Icon,
  Mail01Icon,
  ArrowRight01Icon,
} from "@hugeicons/core-free-icons";

declare global {
  interface Window {
    Tawk_API?: {
      maximize: () => void;
      toggle: () => void;
    };
  }
}

const TOPICS = [
  {
    key: "tickets",
    icon: Ticket01Icon,
    color: "bg-blue-50 text-blue-600",
    title: "Tickets & entry",
    desc: "QR codes, transfers, check-in",
  },
  {
    key: "payments",
    icon: CreditCardIcon,
    color: "bg-teal-50 text-teal-600",
    title: "Payments & refunds",
    desc: "Paying, refunds, receipts",
  },
  {
    key: "account",
    icon: UserIcon,
    color: "bg-purple-50 text-purple-600",
    title: "Account",
    desc: "Signing in",
  },
  {
    key: "organisers",
    icon: Store01Icon,
    color: "bg-rose-50 text-rose-500",
    title: "For organisers",
    desc: "Fees, payouts, check-in, cancelling",
  },
];


export default function FAQPage() {
  const [search, setSearch] = useState("");
  const [topic, setTopic] = useState<string | null>(null);
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const filteredFaqs = FAQS.filter(
    (faq) =>
      (!topic || faq.topic === topic) &&
      (faq.q.toLowerCase().includes(search.toLowerCase()) ||
        faq.a.toLowerCase().includes(search.toLowerCase()))
  );

  const handleLiveChat = () => {
    if (typeof window !== "undefined" && window.Tawk_API) {
      window.Tawk_API.maximize();
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <Navbar />

      <section
        className="relative py-20 px-4 text-center overflow-hidden"
        style={{
          background:
            "linear-gradient(135deg, #0f0c29 0%, #1a1156 30%, #302b63 55%, #6b21a8 80%, #7c3aed 100%)",
        }}
      >
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse 80% 60% at 60% 40%, rgba(139,92,246,0.35) 0%, transparent 70%)",
          }}
        />
        <div className="relative max-w-2xl mx-auto">
          <h1 className="text-4xl sm:text-5xl font-bold text-white mb-8 leading-tight">
            How can we help?
          </h1>
          <div className="flex items-center bg-white rounded-xl overflow-hidden shadow-lg">
            <svg
              className="ml-3 sm:ml-4 shrink-0 text-gray-400"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search questions"
              aria-label="Search questions"
              className="flex-1 min-w-0 px-3 sm:px-4 py-3.5 sm:py-4 text-sm text-gray-700 placeholder-gray-400 focus:outline-none bg-transparent"
            />
          </div>
        </div>
      </section>

      <section className="max-w-5xl mx-auto w-full px-4 sm:px-6 py-14">
        <h2 className="text-xl font-bold text-gray-900 mb-6">Browse by topic</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {TOPICS.map((t) => (
            <button
              key={t.title}
              type="button"
              aria-pressed={t.key === topic}
              onClick={() => { setTopic(t.key === topic ? null : t.key); setOpenIndex(null); }}
              className={`flex items-start gap-4 p-5 border rounded-2xl bg-white hover:border-gray-200 hover:shadow-sm transition-all text-left group ${t.key === topic ? "border-blue-500 ring-1 ring-blue-500" : "border-gray-100"}`}
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${t.color}`}>
                <HugeiconsIcon icon={t.icon} size={20} />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900 mb-0.5 group-hover:text-blue-600 transition-colors">
                  {t.title}
                </p>
                <p className="text-xs text-gray-500">{t.desc}</p>
              </div>
            </button>
          ))}
        </div>
      </section>

      <section className="max-w-5xl mx-auto w-full px-4 sm:px-6 pb-14">
        <h2 className="text-xl font-bold text-gray-900 mb-5">
          {topic ? TOPICS.find((t) => t.key === topic)?.title : "Popular questions"}
        </h2>

        {filteredFaqs.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-sm">
            No questions match &ldquo;{search}&rdquo;. Try another word, or ask us below.
          </div>
        ) : (
          <div className="border border-gray-100 rounded-2xl overflow-hidden divide-y divide-gray-100">
            {filteredFaqs.map((faq, i) => {
              const isOpen = openIndex === i;
              return (
                <div key={i}>
                  <button
                    onClick={() => setOpenIndex(isOpen ? null : i)}
                    className="w-full flex items-center justify-between px-6 py-5 text-left hover:bg-gray-50 transition-colors"
                  >
                    <span className="text-sm font-medium text-gray-900 pr-4">{faq.q}</span>
                    <span className={`shrink-0 text-gray-400 transition-transform duration-200 ${isOpen ? "rotate-90" : ""}`}>
                      <HugeiconsIcon icon={ArrowRight01Icon} size={16} />
                    </span>
                  </button>
                  {isOpen && (
                    <div className="px-6 pb-5 text-sm text-gray-500 leading-relaxed bg-gray-50/60">
                      {faq.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="max-w-5xl mx-auto w-full px-4 sm:px-6 pb-16">
        <div className="bg-gray-50 border border-gray-100 rounded-2xl px-6 py-10 text-center">
          <h3 className="text-xl font-bold text-gray-900 mb-2">Still need a hand?</h3>
          <p className="text-sm text-gray-500 mb-7">
            Email us or start a live chat and a person on our team will reply.
          </p>
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <Link
              href="mailto:support@usebyro.com"
              className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-6 py-3 rounded-full transition-colors"
            >
              <HugeiconsIcon icon={Mail01Icon} size={16} color="white" />
              Contact support
            </Link>
            <button
              onClick={handleLiveChat}
              className="inline-flex items-center gap-2 border border-gray-300 text-gray-700 bg-white hover:bg-gray-50 text-sm font-semibold px-6 py-3 rounded-full transition-colors"
            >
              Live chat
            </button>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
