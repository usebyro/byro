"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { FaTelegram, FaWhatsapp, FaXTwitter } from "react-icons/fa6";
import { Reveal, useInView } from "./Reveal";

const steps = [
  { title: "Describe your event", body: "Name it, pick a category, write a description and add a cover image." },
  { title: "Set the date and place", body: "Choose the date, start time and venue." },
  { title: "Set up your tickets", body: "Free or paid tiers, how many you'll sell, and whether tickets can be transferred." },
  { title: "Publish and share", body: "List it publicly or keep it unlisted, then share the link on WhatsApp, X or Telegram." },
];

const shareChip = "flex h-9 flex-1 items-center justify-center gap-1 rounded-[10px] text-[11px] font-bold";

export default function HostsSection() {
  const [open, setOpen] = useState(0);
  const [guestsRef, guestsSeen] = useInView<HTMLDivElement>(0.5);

  return (
    <section className="mx-auto max-w-[1440px] px-4 pt-5 md:px-12 md:pt-[140px] xl:px-24">
      <div className="relative flex flex-col gap-10 overflow-hidden rounded-[30px] bg-blush px-[22px] py-8 md:gap-[60px] md:rounded-[40px] md:p-[72px] lg:min-h-[700px] lg:flex-row">
        <Reveal className="flex flex-col gap-4 md:gap-5 lg:w-[520px] lg:shrink-0">
          <span className="text-xs font-extrabold tracking-[0.14em] text-[#C2527A] md:text-[13px]">FOR HOSTS</span>
          <h2 className="-mt-1.5 text-balance font-display text-[34px] font-bold leading-none tracking-[-0.035em] md:text-[56px]">
            Host it.
            <br />
            Keep the crowd.
          </h2>
          <ol className="mt-2 flex flex-col gap-2 md:mt-3.5">
            {steps.map((s, i) => {
              const on = open === i;
              return (
                <li key={s.title}>
                  <button
                    type="button"
                    onClick={() => setOpen(i)}
                    aria-expanded={on}
                    className={`flex w-full gap-3.5 rounded-[20px] px-5 py-4 text-left transition-[background-color,box-shadow] duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
                      on ? "bg-white shadow-[0_10px_30px_rgba(194,82,122,0.10)]" : "hover:bg-white/50"
                    }`}
                  >
                    <span className={`w-6 shrink-0 font-display text-[15px] font-extrabold transition-colors ${on ? "text-brand" : "text-[#B27C8C]"}`}>
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="flex min-w-0 flex-col">
                      <span className={`text-[17px] ${on ? "font-extrabold text-ink" : "font-bold text-[#6B4A55]"}`}>{s.title}</span>
                      <span
                        className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none ${
                          on ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                        }`}
                      >
                        <span className="overflow-hidden">
                          <span className="block pt-1 text-sm leading-[1.5] text-muted">{s.body}</span>
                        </span>
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
          <Link
            href="/events/create"
            className="mt-2 flex h-[52px] items-center justify-center self-stretch rounded-full bg-ink px-[26px] text-base font-bold text-white transition-[filter,scale] hover:brightness-125 active:scale-[0.96] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 md:self-start"
          >
            Start hosting, it&apos;s free
          </Link>
        </Reveal>

        <div aria-hidden="true" className="relative hidden flex-1 lg:block">
          <Reveal className="absolute left-[70px] top-[-10px]">
            <div className="h-[600px] w-[300px] rounded-[44px] bg-ink p-2.5 shadow-[0_30px_70px_rgba(20,22,28,0.25)]">
              <div className="flex h-[580px] w-[280px] flex-col overflow-hidden rounded-[36px] bg-white">
                <Image src="/images/brand/tech.jpg" alt="" width={280} height={200} className="h-[200px] w-[280px] object-cover object-top" />
                <div className="flex flex-col gap-2.5 p-[18px]">
                  <span className="flex h-6 items-center self-start rounded-full bg-butter px-2.5 text-[11px] font-extrabold">TECH</span>
                  <span className="font-display text-2xl font-bold leading-[1.05] tracking-[-0.02em]">Builders Meetup: AI Edition</span>
                  <span className="text-[13px] text-muted">
                    Sat, 4 Oct · 10:00 AM
                    <br />
                    Cafe One, Yaba, Lagos
                  </span>
                  <div className="flex items-center gap-2 text-xs text-muted">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-sky text-[10px] font-extrabold text-brand">GD</span>
                    Hosted by GDGoC UNILAG
                  </div>
                  <div className="mt-1.5 flex items-center justify-between rounded-2xl border border-line px-3.5 py-3">
                    <span className="text-sm font-bold">General</span>
                    <span className="text-sm font-extrabold text-brand">Free</span>
                  </div>
                  <span className="flex h-[46px] items-center justify-center rounded-full bg-brand text-[15px] font-bold text-white">Register</span>
                </div>
              </div>
            </div>
          </Reveal>

          <Reveal className="absolute left-[306px] top-[90px]" delay={250}>
            <div className="flex w-[290px] flex-col gap-3 rounded-[22px] bg-white p-[18px] shadow-[0_20px_50px_rgba(20,22,28,0.12)]">
              <span className="text-xs font-extrabold tracking-[0.1em] text-faint">SHARE YOUR LINK</span>
              <span className="flex h-10 items-center rounded-xl bg-mist px-3 text-[13px] font-semibold">usebyro.com/builders-meetup</span>
              <div className="flex gap-2">
                <span className={`${shareChip} bg-mint`}>
                  <FaWhatsapp size={15} color="#25D366" aria-hidden="true" />
                  WhatsApp
                </span>
                <span className={`${shareChip} bg-mist`}>
                  <FaXTwitter size={13} color="#14161C" aria-hidden="true" />X
                </span>
                <span className={`${shareChip} bg-sky`}>
                  <FaTelegram size={15} color="#229ED9" aria-hidden="true" />
                  Telegram
                </span>
              </div>
            </div>
          </Reveal>

          <Reveal className="absolute left-[350px] top-[330px]" delay={500}>
            <div ref={guestsRef} className="flex w-[230px] flex-col gap-2.5 rounded-[22px] bg-white p-[18px] shadow-[0_20px_50px_rgba(20,22,28,0.12)]">
              <span className="text-xs font-extrabold tracking-[0.1em] text-faint">GUESTS</span>
              <div className="flex items-baseline gap-1.5">
                <span className="font-display text-[38px] font-bold">38</span>
                <span className="text-sm text-muted">of 50 going</span>
              </div>
              <div className="flex h-2 overflow-hidden rounded-full bg-[#EEF1F6]">
                <span
                  className="rounded-full bg-brand transition-[width] duration-[1200ms] ease-out delay-700 motion-reduce:transition-none"
                  style={{ width: guestsSeen ? "76%" : "0%" }}
                />
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
