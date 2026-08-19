"use client";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import {
  FiFileText,
  FiClipboard,
  FiGrid,
  FiBarChart2,
  FiZap,
  FiDownload,
  FiUsers,
  FiGift,
  FiPackage,
  FiUserPlus,
  FiTag,
  FiClock,
} from "react-icons/fi";

const eventManagementFeatures = [
  {
    icon: FiFileText,
    title: "Rich text for event description",
    description:
      "Create engaging event descriptions with rich text formatting, including bold, italics, lists, links, and more for a detailed and visually appealing presentation.",
  },
  {
    icon: FiClipboard,
    title: "Form based events",
    description:
      "Create structured events using customizable forms, making it easy to collect specific attendee information and streamline event management.",
  },
  {
    icon: FiGrid,
    title: "Wide range of event categories",
    description:
      "No matter your event type, we've got you covered! From concerts to conferences, workshops to festivals, list your event under the perfect category and reach the right audience.",
  },
  {
    icon: FiBarChart2,
    title: "Event analytics",
    description:
      "Get the insights you need to sell more tickets. Track ticket sales, attendee engagement, and real-time data to optimize your event strategy.",
  },
  {
    icon: FiZap,
    title: "Easy event creation process",
    description:
      "Set up your event in minutes with our simplified event creation process, including customizable ticket types, pricing, and more.",
    featured: true,
  },
  {
    icon: FiDownload,
    title: "Exporting event data",
    description:
      "With just a few clicks, get all the data you need from ticket sales reports to attendee lists, helping you make informed decisions.",
  },
  {
    icon: FiUsers,
    title: "Event collaborations",
    description:
      "Invite co-hosts, partners, and sponsors to manage events together.",
  },
  {
    icon: FiGift,
    title: "Free tickets",
    description:
      "Create free tickets with no charge to attendees or event hosts — we only make money when you do.",
    featured: true,
  },
  {
    icon: FiPackage,
    title: "Combo tickets",
    description:
      "Expand your ticket capabilities with combo tickets, allowing attendees to purchase multiple ticket types as one package.",
  },
  {
    icon: FiUserPlus,
    title: "Group tickets",
    description:
      "Encourage group attendance with discounted group ticket options, making it easy for friends, families, and teams to attend together.",
  },
  {
    icon: FiTag,
    title: "E-tickets",
    description:
      "Instantly generated and secured QR codes are sent to attendees after a successful purchase, enabling a seamless check-in experience.",
  },
  {
    icon: FiClock,
    title: "Flexible payout frequencies",
    description:
      "Choose how and when you receive your earnings with customizable payout schedules that fit your cash flow needs.",
    featured: true,
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
        </div>

        {/* Plan Cards */}
        <div className="max-w-md mx-auto px-4 pb-16 relative">
          <div
            aria-hidden
            className="absolute -inset-x-24 -top-8 -bottom-8 -z-10 bg-blue-100/40 blur-3xl rounded-full"
          />
          <div>
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

          {/* Custom plan — commented out for now
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
          */}
        </div>

        {/* Event Management */}
        <div className="bg-[#EEF2FF] border-y border-blue-100/60 py-20">
          <div className="w-[90%] max-w-6xl mx-auto">
            <div className="text-center mb-14">
              <span className="text-blue-600 text-xs font-semibold tracking-widest uppercase">
                Event management
              </span>
              <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mt-3 max-w-2xl mx-auto leading-tight">
                Everything you need to create, manage, and optimize your
                events
              </h2>
            </div>

            {/* Featured features */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-6">
              {eventManagementFeatures
                .filter((f) => f.featured)
                .map((feature) => {
                  const Icon = feature.icon;
                  return (
                    <div
                      key={feature.title}
                      className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6"
                    >
                      <div className="w-11 h-11 rounded-xl bg-blue-600 text-white flex items-center justify-center">
                        <Icon size={20} />
                      </div>
                      <h3 className="mt-4 font-semibold text-gray-900">
                        {feature.title}
                      </h3>
                      <p className="mt-2 text-sm text-gray-500 leading-relaxed">
                        {feature.description}
                      </p>
                    </div>
                  );
                })}
            </div>

            {/* Remaining features */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-10 gap-y-10 pt-6">
              {eventManagementFeatures
                .filter((f) => !f.featured)
                .map((feature) => {
                  const Icon = feature.icon;
                  return (
                    <div key={feature.title}>
                      <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center">
                        <Icon size={18} />
                      </div>
                      <h3 className="mt-4 font-semibold text-gray-900">
                        {feature.title}
                      </h3>
                      <p className="mt-2 text-sm text-gray-500 leading-relaxed">
                        {feature.description}
                      </p>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>

        {/* Common Questions */}
        <div className="w-[90%] mx-auto py-24">
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
