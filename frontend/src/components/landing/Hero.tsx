"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Passport from "./Passport";
import type { EventLike } from "@/lib/eventFormat";

export default function Hero({ event }: { event?: EventLike }) {
  const router = useRouter();
  const [query, setQuery] = useState("");

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    router.push(q ? `/discover?search=${encodeURIComponent(q)}` : "/discover");
  };

  return (
    <section className="relative overflow-hidden">
      <style>{`
        @keyframes byro-rise { from { opacity: 0; transform: translateY(28px); } to { opacity: 1; transform: none; } }
        @keyframes byro-pop { 0% { opacity: 0; transform: scale(1.5); } 60% { opacity: 1; transform: scale(0.96); } 100% { opacity: 1; transform: scale(1); } }
        @keyframes byro-slide { from { opacity: 0; transform: translateX(-24px); } to { opacity: 1; transform: none; } }
        @keyframes byro-float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
        .byro-in { animation: byro-rise 0.7s cubic-bezier(.2,.8,.3,1) both; }
        .byro-float { animation: byro-float 7s ease-in-out 2s infinite; }
        .byro-passport { animation: byro-rise 0.8s cubic-bezier(.2,.8,.3,1) 0.2s both; }
        .byro-stamp-pop { animation: byro-pop 0.45s cubic-bezier(.2,1.2,.3,1) both; }
        .byro-new-stamp { animation: byro-slide 0.6s cubic-bezier(.2,.8,.3,1) 1.9s both; }
        @media (prefers-reduced-motion: reduce) {
          .byro-in, .byro-float, .byro-passport, .byro-stamp-pop, .byro-new-stamp { animation: none; }
        }
      `}</style>

      <div aria-hidden="true" className="absolute -right-[120px] top-10 hidden h-[680px] w-[780px] rounded-l-[340px] bg-sky lg:block" />
      <div aria-hidden="true" className="absolute right-[520px] top-[560px] hidden h-[120px] w-[120px] rounded-full bg-blush lg:block" />
      <div aria-hidden="true" className="absolute right-[60px] top-[70px] hidden h-[70px] w-[70px] rounded-full border border-[#F3EBC0] bg-butter lg:block" />

      <div className="relative mx-auto max-w-[1440px] px-4 pb-12 pt-9 md:px-12 md:pt-14 lg:h-[760px] lg:px-12 lg:pb-0 lg:pt-0 xl:px-24">
        <div className="flex flex-col lg:absolute lg:left-12 lg:top-1/2 lg:w-[500px] lg:-translate-y-1/2 xl:left-24 xl:w-[560px] min-[1440px]:w-[600px]">
          <span
            className="byro-in flex h-8 items-center gap-1.5 self-start rounded-full border-[1.5px] border-transparent px-3 text-xs font-semibold text-[#3B4252] md:h-9 md:gap-2 md:px-4 md:text-sm"
            style={{
              animationDelay: "0s",
              background:
                "linear-gradient(#F6F9FE,#F6F9FE) padding-box, linear-gradient(90deg,#7FA8FF,#F5A3C0,#FFD66B,#8EDDB0) border-box",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="#3669F6" aria-hidden="true">
              <path d="M12 2l2 6.5L20.5 10 14 12l-2 7-2-7-6.5-2L10 8.5z" />
            </svg>
            Every event you attend becomes a stamp
          </span>

          <h1 style={{ animationDelay: "0.08s" }} className="byro-in mt-5 font-display text-[54px] font-bold leading-[0.98] tracking-[-0.045em] md:mt-[26px] md:text-[76px] lg:text-[68px] xl:text-[80px] min-[1440px]:text-[92px]">
            Go out.
            <br />
            Keep the <span className="text-brand">memory.</span>
          </h1>

          <p style={{ animationDelay: "0.16s" }} className="byro-in mt-4 max-w-[470px] text-pretty text-base leading-[1.55] text-muted md:mt-[26px] md:text-[19px] md:leading-[1.6]">
            Byro is a community events platform. Discover events near you, buy tickets in seconds, and collect a
            stamp every time you show up. Organisers use Byro to create events, sell tickets and check guests in.
          </p>

          <form
            onSubmit={handleSearch}
            style={{ animationDelay: "0.24s" }}
            className="byro-in mt-6 flex h-14 max-w-[560px] items-center gap-3 rounded-full border border-line bg-white pl-[18px] pr-1.5 shadow-[0_12px_30px_rgba(54,105,246,0.12)] focus-within:ring-2 focus-within:ring-brand md:mt-9 md:h-[62px] md:pl-[22px] md:pr-[7px]"
          >
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#8A91A0" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.5-3.5" />
            </svg>
            <label htmlFor="hero-search" className="sr-only">Search events</label>
            <input
              id="hero-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search events, artists, venues"
              className="min-w-0 flex-1 bg-transparent text-[15px] text-ink placeholder:text-faint focus:outline-none md:text-base"
            />
            <button
              type="submit"
              aria-label="Find events"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand text-white transition-[filter,scale] hover:brightness-90 active:scale-[0.96] focus:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 md:h-12 md:w-auto md:px-6 md:text-[15px] md:font-bold"
            >
              <span className="hidden md:inline">Find events</span>
              <svg className="md:hidden" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </button>
          </form>

          <div style={{ animationDelay: "0.32s" }} className="byro-in mt-5 flex items-center gap-4 text-[15px] text-muted md:mt-[22px] md:gap-[18px]">
            <span className="flex" aria-hidden="true">
              {["talk", "toast", "celebration"].map((n, i) => (
                <Image
                  key={n}
                  src={`/images/brand/${n}.jpg`}
                  alt=""
                  width={32}
                  height={32}
                  className={`h-8 w-8 rounded-full border-2 border-white object-cover ${i ? "-ml-2.5" : ""}`}
                />
              ))}
            </span>
            <span>
              Hosting something?{" "}
              <Link href="/events/create" className="font-bold text-brand hover:text-brand-dark">
                Create an event →
              </Link>
            </span>
          </div>
        </div>

        <div className="byro-float relative mx-auto mt-10 h-[290px] w-[340px] lg:absolute lg:right-4 lg:top-[90px] lg:mt-0 lg:h-[380px] lg:w-[450px] xl:right-8 xl:h-[450px] xl:w-[530px] min-[1440px]:right-[60px] min-[1440px]:top-[110px] min-[1440px]:h-[520px] min-[1440px]:w-[620px]">
          <div aria-hidden="true" className="absolute -inset-x-6 -top-6 bottom-0 rounded-full bg-sky lg:hidden" />
          {/* The entrance animation sits on the outer div: it would cancel the scale if they shared an element. */}
          <div className="byro-passport">
            <div className="relative origin-top-left scale-[0.56] lg:scale-[0.72] xl:scale-[0.85] min-[1440px]:scale-100">
              <Passport event={event} />
            </div>
          </div>
          <div className="byro-new-stamp absolute -bottom-2 left-1 flex h-12 items-center gap-2.5 rounded-full bg-white pl-1.5 pr-4 text-[13px] shadow-[0_14px_34px_rgba(20,22,28,0.12)] md:h-14 md:gap-3 md:pl-2 md:pr-5 md:text-sm lg:-left-8 lg:bottom-10">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-blush md:h-10 md:w-10">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#C2527A" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="8" />
                <circle cx="12" cy="12" r="4" />
              </svg>
            </span>
            <span>
              <b>New stamp</b> · Sunday Run Club
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
