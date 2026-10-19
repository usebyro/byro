"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const MIN_SPIN_MS = 500; // once the spinner shows, keep it up this long so it doesn't flicker
const DONE_MS = 1500; // how long "Sent" / "Saved" stays before the label comes back

function Spinner() {
  return (
    <svg className="animate-spin motion-reduce:animate-none" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function Check() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12l5 5 9-10" />
    </svg>
  );
}

/**
 * `done` / `failed` after an action: call `flash("done")` on success and `flash("failed")` on error.
 * "done" clears itself; "failed" stays until the next attempt.
 */
export function useButtonResult() {
  const [result, setResult] = useState(null);
  const timer = useRef(null);
  const flash = useCallback((next) => {
    clearTimeout(timer.current);
    setResult(next);
    if (next === "done") timer.current = setTimeout(() => setResult(null), DONE_MS);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);
  return [result, flash];
}

/**
 * A button that stays the same width while it works: every label is laid out in the same
 * cell and only the current one is visible, so nothing jumps.
 */
export default function BusyButton({
  busy = false,
  result = null,
  busyLabel,
  doneLabel = "Done",
  failedLabel = "Try again",
  children,
  className = "",
  disabled,
  ...rest
}) {
  // Hold the spinner for a moment after `busy` turns off, so a quick request doesn't flicker.
  const [spinning, setSpinning] = useState(busy);
  const since = useRef(0);
  useEffect(() => {
    if (busy) {
      since.current = Date.now();
      setSpinning(true);
      return;
    }
    const left = MIN_SPIN_MS - (Date.now() - since.current);
    if (left <= 0) {
      setSpinning(false);
      return;
    }
    const t = setTimeout(() => setSpinning(false), left);
    return () => clearTimeout(t);
  }, [busy]);

  const state = spinning ? "busy" : result || "idle";
  const labels = {
    idle: children,
    busy: (
      <>
        <Spinner />
        {busyLabel}
      </>
    ),
    done: (
      <>
        <Check />
        {doneLabel}
      </>
    ),
    failed: failedLabel,
  };

  return (
    <button
      {...rest}
      disabled={disabled || state === "busy"}
      aria-busy={state === "busy" || undefined}
      className={`${className} ${state === "done" ? "!bg-[#E9F7EF] !text-[#1F7A52]" : ""} ${state === "busy" ? "cursor-progress" : ""}`}
    >
      <span className="inline-grid">
        {Object.entries(labels).map(([key, label]) => (
          <span
            key={key}
            aria-hidden={key !== state || undefined}
            className={`col-start-1 row-start-1 inline-flex items-center justify-center gap-2 ${key === state ? "" : "invisible"}`}
          >
            {label}
          </span>
        ))}
      </span>
    </button>
  );
}
