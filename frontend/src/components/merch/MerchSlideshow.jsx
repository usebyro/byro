"use client";

import { useEffect, useRef, useState } from "react";

// A merch item's photos as a slideshow: swipe on phones (native scroll-snap), arrows on hover
// for a mouse, dots to show where you are. One photo shows plain; none shows `fallback`.
export default function MerchSlideshow({ photos = [], alt = "", className = "", fallback = null, children }) {
  const track = useRef(null);
  const [index, setIndex] = useState(0);
  const count = photos.length;

  // Keep the dots in step with swipes.
  useEffect(() => {
    const el = track.current;
    if (!el || count < 2) return;
    const onScroll = () => setIndex(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [count]);

  const go = (i) => {
    const el = track.current;
    if (!el) return;
    const next = (i + count) % count;
    el.scrollTo({ left: next * el.clientWidth, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  };

  if (!count) {
    return <div className={`relative ${className}`}>{fallback}{children}</div>;
  }

  return (
    <div className={`group relative overflow-hidden ${className}`} role={count > 1 ? "region" : undefined} aria-roledescription={count > 1 ? "carousel" : undefined} aria-label={count > 1 ? `${alt || "Photos"}, ${count} photos` : undefined}>
      <div
        ref={track}
        className="flex h-full w-full snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {photos.map((src, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={src + i}
            src={src}
            alt={count > 1 ? `${alt} ${i + 1} of ${count}`.trim() : alt}
            className="h-full w-full shrink-0 snap-center object-cover"
            loading={i === 0 ? "eager" : "lazy"}
            draggable={false}
          />
        ))}
      </div>

      {count > 1 && (
        <>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              go(index - 1);
            }}
            aria-label="Previous photo"
            className="absolute left-2 top-1/2 hidden h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-ink opacity-0 shadow-[0_1px_3px_rgba(20,22,28,.2)] transition-opacity focus-visible:opacity-100 group-hover:opacity-100 [@media(hover:hover)]:flex"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              go(index + 1);
            }}
            aria-label="Next photo"
            className="absolute right-2 top-1/2 hidden h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-ink opacity-0 shadow-[0_1px_3px_rgba(20,22,28,.2)] transition-opacity focus-visible:opacity-100 group-hover:opacity-100 [@media(hover:hover)]:flex"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
          </button>
          <span className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center gap-1.5" aria-hidden="true">
            {photos.map((_, i) => (
              <span key={i} className={`h-1.5 rounded-full bg-white shadow-[0_0_2px_rgba(20,22,28,.4)] transition-all ${i === index ? "w-4" : "w-1.5 opacity-60"}`} />
            ))}
          </span>
        </>
      )}
      {children}
    </div>
  );
}
