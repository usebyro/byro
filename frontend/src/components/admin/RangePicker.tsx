"use client";

import { useEffect, useRef, useState } from "react";

export interface RangeOption {
  label: string;
  short?: string;
  days: number;
}

// A compact range filter: one pill showing the current range, and a small menu
// with the others when it's opened.
export default function RangePicker({
  value,
  options,
  onChange,
  onBrand = false,
}: {
  value: number;
  options: RangeOption[];
  onChange: (days: number) => void;
  onBrand?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = options.find((o) => o.days === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 ${
          onBrand
            ? "bg-white/15 text-white hover:bg-white/25 focus-visible:ring-white"
            : "bg-mist text-ink hover:bg-line focus-visible:ring-brand"
        }`}
      >
        {current.short ?? current.label}
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" className={`transition-transform ${open ? "rotate-180" : ""}`}>
          <path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <ul
          role="listbox"
          className="absolute right-0 z-20 mt-2 min-w-[5.5rem] overflow-hidden rounded-2xl border border-line bg-white p-1 shadow-[0_20px_50px_rgba(20,22,28,0.14)]"
        >
          {options.map((o) => (
            <li key={o.days} role="option" aria-selected={o.days === value}>
              <button
                type="button"
                onClick={() => {
                  onChange(o.days);
                  setOpen(false);
                }}
                className={`w-full rounded-xl px-3 py-1.5 text-left text-xs font-bold transition-colors ${
                  o.days === value ? "bg-brand/10 text-brand-dark" : "text-body hover:bg-mist"
                }`}
              >
                {o.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
