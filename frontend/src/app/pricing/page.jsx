"use client";
import useFeeInfo from "@/lib/useFeeInfo";
import { useState } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

const freeFeatures = [
  "Unlimited events and guests",
  "Registration questions",
  "QR tickets and check-in",
  "Email your attendees",
];

const paidFeatures = [
  "Everything in free events",
  "Ticket types and promo codes",
  "Co-hosts and door staff",
  "Payouts to your bank",
];

const PRICE_PRESETS = [2000, 5000, 10000, 25000];

const naira = (v) => `₦${Math.round(v).toLocaleString("en-NG")}`;

/** Delay for the staggered entrance (`motion-safe:animate-rise`, skipped for people who ask for reduced motion). */
const rise = (i) => ({ style: { animationDelay: `${i * 60}ms` } });

function TakeHome({ percent }) {
  const rate = Number(percent) / 100;
  const [price, setPrice] = useState(5000);
  const [guestsPay, setGuestsPay] = useState(true);

  const fee = Math.round(price * rate);
  const guestPays = guestsPay ? price + fee : price;
  const youGet = guestsPay ? price : price - fee;

  return (
    <div className="flex flex-col gap-5 rounded-3xl bg-[#F4F6FA] p-5 md:p-7">
      <label className="flex flex-col gap-2">
        <span className="text-[15px] font-bold">Ticket price</span>
        <span className="flex min-h-14 items-center gap-1.5 rounded-[14px] bg-white px-4 focus-within:ring-2 focus-within:ring-brand">
          <span className="font-display text-[22px] font-bold text-muted">₦</span>
          <input
            inputMode="numeric"
            aria-label="Ticket price in naira"
            value={price.toLocaleString("en-NG")}
            onChange={(e) => setPrice(parseInt(e.target.value.replace(/[^0-9]/g, ""), 10) || 0)}
            className="min-w-0 flex-1 bg-transparent font-display text-[22px] font-bold tabular-nums text-ink outline-none"
          />
        </span>
      </label>

      <div className="-mt-2 flex flex-wrap gap-2">
        {PRICE_PRESETS.map((v) => (
          <button
            key={v}
            type="button"
            aria-pressed={price === v}
            onClick={() => setPrice(v)}
            className={`min-h-10 rounded-full px-3.5 text-sm font-bold tabular-nums transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 ${
              price === v ? "bg-ink text-white" : "bg-white text-ink"
            }`}
          >
            {naira(v)}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <span id="who-pays" className="text-[15px] font-bold">
          Who pays the {percent}%?
        </span>
        <div role="group" aria-labelledby="who-pays" className="inline-flex rounded-full bg-[#E6EAF1] p-[3px]">
          {[
            [true, "Guests"],
            [false, "Me"],
          ].map(([value, label]) => (
            <button
              key={label}
              type="button"
              aria-pressed={guestsPay === value}
              onClick={() => setGuestsPay(value)}
              className={`min-h-10 rounded-full px-4 text-sm font-bold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
                guestsPay === value ? "bg-white text-ink shadow-[0_1px_2px_rgba(20,22,28,0.08)]" : "text-muted"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div aria-live="polite" className="grid grid-cols-2 gap-3 border-t border-line pt-5">
        <div className="flex flex-col gap-1">
          <span className="text-sm text-muted">Guest pays</span>
          <span className="font-display text-[30px] font-bold tabular-nums tracking-[-0.02em]">{naira(guestPays)}</span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-sm text-muted">You get</span>
          <span className="font-display text-[30px] font-bold tabular-nums tracking-[-0.02em] text-brand-dark">
            {naira(youGet)}
          </span>
        </div>
      </div>
    </div>
  );
}

/** One answer open at a time; the first starts open. */
function Questions({ faqs }) {
  const [open, setOpen] = useState(0);
  return (
    <div className="flex flex-col gap-2.5">
      {faqs.map(({ q, a }, i) => {
        const isOpen = open === i;
        return (
          <div key={q} className="rounded-[18px] bg-white">
            <h3>
              <button
                type="button"
                aria-expanded={isOpen}
                aria-controls={`faq-${i}`}
                onClick={() => setOpen(isOpen ? -1 : i)}
                className="group flex min-h-16 w-full items-center justify-between gap-4 rounded-[18px] px-5 text-left text-[17px] font-extrabold text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                {q}
                <span
                  aria-hidden="true"
                  className={`flex size-7 shrink-0 items-center justify-center rounded-full transition-[transform,background-color] duration-[240ms] ease-[cubic-bezier(0.77,0,0.175,1)] motion-reduce:transition-none ${
                    isOpen ? "rotate-45 bg-[#EAF0FF]" : "bg-[#F1F3F7] group-hover:bg-[#E6EAF1]"
                  }`}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                </span>
              </button>
            </h3>
            <div
              id={`faq-${i}`}
              role="region"
              className="grid transition-[grid-template-rows] duration-[260ms] ease-[cubic-bezier(0.77,0,0.175,1)] motion-reduce:transition-none"
              style={{ gridTemplateRows: isOpen ? "1fr" : "0fr" }}
            >
              <div className="overflow-hidden">
                <p className="px-5 pb-5 text-base leading-[1.55] text-body">{a}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function PricingPage() {
  const { defaultPercent } = useFeeInfo();

  const faqs = [
    {
      q: "When do I get paid?",
      a: "Withdraw from your dashboard any time. It reaches your bank within 24 hours.",
    },
    {
      q: "Are free events really free?",
      a: "Yes. No fees for you or your guests, however many people come.",
    },
    {
      q: `Who pays the ${defaultPercent}%?`,
      a: "You choose for each event: add it to the ticket price at checkout, or cover it yourself.",
    },
    {
      q: "How do guests pay?",
      a: "Card or bank transfer through Paystack. No account needed.",
    },
    {
      q: "What if I cancel an event?",
      a: "Everyone who paid is refunded the ticket price straight away. Byro's service fee and the payment processing charge are not refunded.",
    },
  ];

  const ctaBase =
    "inline-flex min-h-12 items-center justify-center whitespace-nowrap rounded-full px-[22px] text-base font-bold transition-[transform,background-color] duration-150 active:scale-[0.97] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2";

  return (
    <>
      <Navbar />
      <main className="bg-white font-body text-ink">
        <section
          aria-labelledby="pricing-title"
          {...rise(0)}
          className="mx-auto flex max-w-[880px] flex-col items-center gap-4 px-4 pb-12 pt-14 text-center motion-safe:animate-rise md:px-6 md:pt-28"
        >
          <h1 id="pricing-title" className="font-display text-[44px] font-bold leading-none tracking-[-0.045em] md:text-[72px]">
            Pricing
          </h1>
          <p className="max-w-[36ch] text-[17px] leading-normal text-body md:text-[19px]">
            Free to use. We only take a small fee when you sell a ticket.
          </p>
        </section>

        <section aria-label="Plans" className="mx-auto max-w-[880px] px-4 pb-16 md:px-6 md:pb-28">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div {...rise(1)} className="flex flex-col gap-5 rounded-3xl bg-[#F4F6FA] p-7 motion-safe:animate-rise">
              <div className="flex flex-col gap-1.5">
                <span className="text-base font-bold">Free events</span>
                <span className="font-display text-[56px] font-bold leading-none tabular-nums tracking-[-0.04em]">₦0</span>
                <span className="text-[15px] text-muted">No fees for you or your guests.</span>
              </div>
              <ul className="flex flex-col gap-2.5 text-[15px]">
                {freeFeatures.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
              <Link href="/events/create" className={`${ctaBase} mt-auto bg-white text-ink hover:bg-[#DFE3EA]`}>
                Create a free event
              </Link>
            </div>

            <div {...rise(2)} className="flex flex-col gap-5 rounded-3xl bg-brand p-7 text-white motion-safe:animate-rise">
              <div className="flex flex-col gap-1.5">
                <span className="text-base font-bold">Paid events</span>
                <span className="font-display text-[56px] font-bold leading-none tabular-nums tracking-[-0.04em]">
                  {defaultPercent}%
                </span>
                <span className="text-[15px] text-[#E3EAFF]">Per ticket sold. Pass it to guests or cover it.</span>
              </div>
              <ul className="flex flex-col gap-2.5 text-[15px]">
                {paidFeatures.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
              <Link href="/events/create" className={`${ctaBase} mt-auto bg-white text-ink focus-visible:ring-white focus-visible:ring-offset-brand`}>
                Start selling tickets
              </Link>
            </div>
          </div>
          <p {...rise(3)} className="mt-4 text-center text-sm leading-normal text-body motion-safe:animate-rise">
            No setup or monthly fees. Paystack card and bank processing is shown to the buyer at checkout.
          </p>
        </section>

        <section aria-labelledby="take-home" className="bg-white py-14 md:py-24">
          <div className="mx-auto flex max-w-[640px] flex-col gap-6 px-4 md:px-6">
            <h2 id="take-home" className="text-center font-display text-[28px] font-bold tracking-[-0.03em] md:text-4xl">
              What you’ll take home
            </h2>
            <TakeHome percent={defaultPercent} />
          </div>
        </section>

        <section aria-labelledby="questions" className="bg-[#F4F6FA] py-14 md:py-24">
          <div className="mx-auto flex max-w-[720px] flex-col gap-8 px-4 md:px-6">
            <h2 id="questions" className="font-display text-[28px] font-bold tracking-[-0.03em] md:text-4xl">
              Questions
            </h2>
            <Questions faqs={faqs} />
          </div>
        </section>

        <section aria-labelledby="start" className="flex flex-col items-center gap-5 bg-ink px-4 py-[72px] text-center text-white md:py-[120px]">
          <h2 id="start" className="font-display text-[32px] font-bold tracking-[-0.035em] md:text-5xl">
            Start for free.
          </h2>
          <Link href="/events/create" className={`${ctaBase} bg-brand text-white hover:bg-[#2F5EE0] focus-visible:ring-offset-ink`}>
            Create an event
          </Link>
        </section>
      </main>
      <Footer />
    </>
  );
}
