"use client";

import { useEffect, useState } from "react";

/**
 * Placeholders for something that's loading. Nothing shows for the first 300ms, so fast loads
 * just appear without a grey flash; after 8s a "Still loading" note goes above the placeholders
 * (pass slowAfter={null} to leave the note out).
 */
export default function Delayed({ children, onRetry, delay = 300, slowAfter = 8000 }) {
  const [shown, setShown] = useState(false);
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    const show = setTimeout(() => setShown(true), delay);
    const late = slowAfter == null ? null : setTimeout(() => setSlow(true), slowAfter);
    return () => {
      clearTimeout(show);
      clearTimeout(late);
    };
  }, [delay, slowAfter]);

  if (!shown) return <span role="status" className="sr-only">Loading</span>;
  return (
    <div aria-busy="true" className="flex flex-col gap-4">
      <span role="status" className="sr-only">Loading</span>
      {slow && (
        <div role="status" className="flex items-center gap-3 rounded-xl bg-[#F7F9FC] px-4 py-3.5">
          <svg className="animate-spin motion-reduce:animate-none" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="9" stroke="#3669F6" strokeOpacity="0.25" strokeWidth="3" />
            <path d="M21 12a9 9 0 0 0-9-9" stroke="#3669F6" strokeWidth="3" strokeLinecap="round" />
          </svg>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-sm font-extrabold">Still loading</span>
            <span className="v-hint">Your connection looks slow. We&apos;ll keep trying.</span>
          </span>
          {onRetry && (
            <button type="button" onClick={onRetry} className="v-btn v-btn-s h-9 shrink-0">
              Retry now
            </button>
          )}
        </div>
      )}
      {children}
    </div>
  );
}
