"use client";

/**
 * One part of a page that failed to load. Only that part shows this; the rest keeps working.
 * `what` finishes the sentence "We couldn't load …", e.g. "your guests".
 */
export default function SectionError({ what, onRetry, className = "" }) {
  return (
    <div role="alert" className={`flex flex-col items-center gap-2 px-5 py-7 text-center ${className}`}>
      <span aria-hidden="true" className="flex h-11 w-11 items-center justify-center rounded-full bg-[#F3F6FB] text-[#3B4252]">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M4 4l16 16M8.5 8.6A6 6 0 0 0 6 13M2 9a15 15 0 0 1 4-2.6M22 9a15 15 0 0 0-9.5-3.9M17.5 13a6 6 0 0 0-2.7-3M12 18h.01" />
        </svg>
      </span>
      <p className="m-0 text-base font-extrabold">We couldn&apos;t load {what}</p>
      <p className="v-hint m-0">Check your connection and try again. Your data is safe.</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="v-btn v-btn-p mt-1.5">
          Try again
        </button>
      )}
    </div>
  );
}
