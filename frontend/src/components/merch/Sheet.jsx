"use client";

import { useEffect, useRef, useState } from "react";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * A side sheet on desktop and a bottom sheet on phones, that behaves like the modal it says it is:
 * focus moves in when it opens, Tab and Shift+Tab stay inside it, Escape closes it, and focus goes back
 * to whatever opened it. (The toaster is not made inert, so a toast is still announced behind a sheet.)
 */
export default function Sheet({ title, subtitle, onClose, wide = false, children }) {
  const ref = useRef(null);
  const closeRef = useRef(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose; // always the latest, without re-running the focus setup below
  });
  const [sheetUp] = useState(() => typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches);

  useEffect(() => {
    const opener = document.activeElement;
    closeRef.current?.focus({ preventScroll: true });

    const onKey = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab" || !ref.current) return;
      const items = Array.from(ref.current.querySelectorAll(FOCUSABLE)).filter((el) => !el.closest("[hidden], [inert]"));
      if (!items.length) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (!ref.current.contains(active)) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (opener && document.contains(opener)) opener.focus?.({ preventScroll: true });
    };
  }, []);

  return (
    <div className={`fixed inset-0 z-50 flex ${sheetUp ? "flex-col justify-end" : "justify-end"}`}>
      <button type="button" aria-label="Close" onClick={onClose} className="v-scrim absolute inset-0 cursor-pointer border-0 bg-[rgba(20,22,28,.28)]" tabIndex={-1} />
      <aside
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={
          sheetUp
            ? "v-sheet-up relative box-border flex max-h-[92dvh] w-full flex-col gap-[18px] overflow-y-auto rounded-t-3xl bg-white px-5 pb-[calc(20px+env(safe-area-inset-bottom))] pt-2.5 shadow-[0_-20px_50px_-20px_rgba(20,22,28,.35)]"
            : `v-sheet relative box-border flex h-full ${wide ? "w-[min(520px,100%)]" : "w-[min(460px,100%)]"} flex-col gap-[18px] overflow-y-auto bg-white p-6`
        }
      >
        {sheetUp && <span aria-hidden="true" className="mx-auto mb-0.5 mt-0.5 block h-1 w-10 shrink-0 rounded-full bg-[#CBD3DF]" />}
        <div className="flex items-start gap-3">
          <div className="flex min-w-0 flex-grow flex-col">
            <h2 className="v-h2 !text-[22px]">{title}</h2>
            {subtitle && <span className="v-hint">{subtitle}</span>}
          </div>
          <button ref={closeRef} type="button" className="v-icon-btn ghost max-md:!h-11 max-md:!w-11" aria-label="Close" onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
        {children}
      </aside>
    </div>
  );
}
