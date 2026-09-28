"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { displayStyle } from "./fonts";

const CYCLE_MS = 5000;
const SLIDES = 2;

const stubs = [
  { name: "Rooftop Sessions", meta: "Sat, 8:00 PM", tone: "bg-white", rotate: "-rotate-[5deg]", offset: "" },
  { name: "Sunday Run Club", meta: "Sun, 6:30 AM", tone: "bg-[#FFC93C]", rotate: "rotate-[2deg]", offset: "sm:translate-x-10" },
  { name: "Builders Meetup", meta: "Thu, 6:00 PM", tone: "bg-white", rotate: "-rotate-[2deg]", offset: "hidden sm:flex sm:-translate-x-2" },
];

const Hero = () => {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [active, setActive] = useState(0);
  const [searchFocused, setSearchFocused] = useState(false);
  const paused = searchFocused || searchQuery.length > 0;

  useEffect(() => {
    if (paused) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => setActive((a) => (a + 1) % SLIDES), CYCLE_MS);
    return () => clearInterval(id);
  }, [paused]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (searchQuery) params.set("search", searchQuery);
    router.push(`/discover?${params.toString()}`);
  };

  const slide = (i: number) =>
    `col-start-1 row-start-1 transition-[opacity,transform] duration-500 ease-out motion-reduce:transition-none ${
      active === i ? "opacity-100 translate-y-0" : "pointer-events-none translate-y-2 opacity-0"
    }`;

  const headline =
    "text-[2.5rem] min-[400px]:text-[2.9rem] font-extrabold leading-[0.98] tracking-[-0.03em] sm:text-7xl lg:text-[5.5rem]";
  const sub = "mt-6 max-w-md text-base leading-relaxed text-[#0F172A]/70 sm:text-lg";

  return (
    <section className="relative overflow-hidden bg-[#F8FAFC] text-[#0F172A]">
      <style>{`
        @keyframes byro-stamp {
          0% { transform: scale(2.2) rotate(-24deg); opacity: 0; }
          55% { transform: scale(0.92) rotate(-12deg); opacity: 1; }
          75% { transform: scale(1.05) rotate(-12deg); }
          100% { transform: scale(1) rotate(-12deg); opacity: 1; }
        }
        .byro-stamp { animation: byro-stamp 0.55s cubic-bezier(.2,.8,.3,1) 1.1s both; }
        @keyframes byro-ticket-in {
          from { opacity: 0; translate: 48px 0; }
          to { opacity: 1; translate: 0 0; }
        }
        @keyframes byro-float {
          0%, 100% { translate: 0 0; }
          50% { translate: 0 -7px; }
        }
        .byro-ticket {
          animation: byro-ticket-in 0.7s cubic-bezier(.2,.8,.3,1) both, byro-float 6s ease-in-out infinite;
          animation-delay: var(--d), calc(var(--d) + 1s);
        }
        @media (prefers-reduced-motion: reduce) {
          .byro-stamp { animation: none; transform: rotate(-12deg); }
          .byro-ticket { animation: none; }
        }
      `}</style>

      <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-12 pt-10 sm:gap-12 sm:px-6 sm:pb-16 md:pt-20 lg:grid-cols-[1.15fr_0.85fr] lg:gap-8 lg:px-8 lg:pb-24">
        <div>
          <div className="grid">
            <div className={slide(0)} aria-hidden={active !== 0} inert={active !== 0}>
              <h1 className={headline} style={displayStyle}>
                Go out.
                <br />
                Keep the memory.
              </h1>
              <p className={sub}>Buy tickets in seconds. Collect a badge for every event you attend.</p>
            </div>
            <div className={slide(1)} aria-hidden={active !== 1} inert={active !== 1}>
              <h2 className={headline} style={displayStyle}>
                Host it.
                <br />
                Keep the crowd.
              </h2>
              <p className={sub}>
                Sell tickets, build your community and give every guest a badge to remember it by.
              </p>
            </div>
          </div>

          <div className="mt-9 grid max-w-lg">
            <form onSubmit={handleSearch} className={slide(0)} aria-hidden={active !== 0} inert={active !== 0}>
              <div className="flex flex-col gap-2 rounded-2xl bg-white p-2 shadow-[0_2px_0_#0F172A] ring-2 ring-[#0F172A] focus-within:ring-[#2563EB] sm:flex-row sm:items-center">
                <label className="sr-only" htmlFor="hero-search">Search events</label>
                <input
                  id="hero-search"
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onFocus={() => setSearchFocused(true)}
                  onBlur={() => setSearchFocused(false)}
                  placeholder="Search events, artists, venues"
                  className="min-w-0 flex-1 bg-transparent px-3 py-3 text-sm placeholder:text-[#0F172A]/40 focus:outline-none"
                />
                <button
                  type="submit"
                  className="rounded-xl bg-[#2563EB] px-6 py-3 text-sm font-semibold text-white transition-colors hover:brightness-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0F172A] focus-visible:ring-offset-2"
                >
                  Find events
                </button>
              </div>
            </form>
            <div
              className={`${slide(1)} flex items-center [&>a]:w-full [&>a]:text-center sm:[&>a]:w-auto`}
              aria-hidden={active !== 1}
              inert={active !== 1}
            >
              <Link
                href="/events/create"
                className="rounded-xl bg-[#2563EB] px-7 py-4 text-sm font-semibold text-white transition-colors hover:brightness-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0F172A] focus-visible:ring-offset-2"
              >
                Create an event
              </Link>
            </div>
          </div>
        </div>

        <div aria-hidden="true" className="relative mx-auto flex w-full max-w-sm flex-col gap-3 lg:max-w-none">
          {stubs.map((s, i) => (
            <div
              key={s.name}
              style={{ "--d": `${i * 0.15}s` } as React.CSSProperties}
              className={`byro-ticket relative flex ${s.tone} ${s.rotate} ${s.offset} rounded-xl ring-2 ring-[#0F172A] shadow-[4px_4px_0_#0F172A]`}
            >
              <div className="flex-1 px-5 py-4">
                <p className="text-lg font-bold leading-tight" style={displayStyle}>
                  {s.name}
                </p>
                <p className="mt-1 text-sm text-[#0F172A]/70">{s.meta}</p>
              </div>
              <div className="relative w-20 border-l-2 border-dashed border-[#0F172A]/40">
                {i === 0 && (
                  <div className="byro-stamp absolute inset-0 flex items-center justify-center">
                    <div className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-[#2563EB] text-center text-[10px] font-bold leading-tight text-[#2563EB]">
                      Been
                      <br />
                      there
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Hero;
