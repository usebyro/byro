"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  OPEN_SETTINGS_EVENT,
  applyConsent,
  readConsent,
  saveConsent,
  type ConsentChoice,
} from "@/lib/consent";

function Switch({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className={`w-11 h-[26px] shrink-0 rounded-full p-[3px] flex transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 ${
        checked ? "bg-brand justify-end" : "bg-[#C9D0DC] justify-start"
      }`}
    >
      <span className="w-5 h-5 rounded-full bg-white shadow-sm" />
    </button>
  );
}

export default function CookieBanner() {
  // Nothing renders until we have read the saved choice, so there is no flash for returning visitors.
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  const [manage, setManage] = useState(false);
  const [analytics, setAnalytics] = useState(true);
  const [marketing, setMarketing] = useState(false);

  useEffect(() => {
    const saved = readConsent();
    if (saved) {
      applyConsent(saved);
      setAnalytics(saved.analytics);
      setMarketing(saved.marketing);
    }
    setOpen(!saved);
    setReady(true);

    const reopen = () => {
      const current = readConsent();
      if (current) {
        setAnalytics(current.analytics);
        setMarketing(current.marketing);
      }
      setManage(true);
      setOpen(true);
    };
    window.addEventListener(OPEN_SETTINGS_EVENT, reopen);
    return () => window.removeEventListener(OPEN_SETTINGS_EVENT, reopen);
  }, []);

  const decide = (choice: ConsentChoice) => {
    saveConsent(choice);
    setAnalytics(choice.analytics);
    setMarketing(choice.marketing);
    setManage(false);
    setOpen(false);
  };

  if (!ready) return null;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => { setManage(true); setOpen(true); }}
        className="hidden md:flex fixed left-8 bottom-8 z-40 h-9 px-3.5 items-center rounded-full border border-line bg-white text-[13px] font-bold text-[#3B4252] shadow-sm hover:bg-mist focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        Cookie settings
      </button>
    );
  }

  return (
    <section
      role="dialog"
      aria-label="Cookie preferences"
      className="fixed z-50 left-4 right-4 bottom-4 md:left-8 md:right-auto md:bottom-8 md:w-[440px] rounded-[22px] border border-line bg-white shadow-[0_20px_50px_rgba(20,22,28,0.14)] px-5 py-[18px] flex flex-col gap-3.5 text-ink font-body"
    >
      <p className="text-sm leading-[1.55] text-[#3B4252]">
        <b className="text-ink">We use cookies</b> to keep you signed in and to see what&apos;s working on Byro.{" "}
        <Link href="/cookies" className="font-bold text-brand hover:text-brand-dark no-underline">
          Cookie policy
        </Link>
      </p>

      {manage && (
        <div className="flex flex-col gap-2.5 border-t border-hairline pt-3">
          <div className="flex items-center gap-3">
            <div className="flex-1 flex flex-col">
              <span className="text-sm font-extrabold">Essential</span>
              <span className="text-xs text-muted">Sign-in, checkout and security. Always on.</span>
            </div>
            <span className="text-xs font-extrabold text-muted">ALWAYS ON</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex-1 flex flex-col">
              <span className="text-sm font-extrabold">Analytics</span>
              <span className="text-xs text-muted">Helps us understand how people use Byro.</span>
            </div>
            <Switch checked={analytics} onChange={() => setAnalytics((v) => !v)} label="Analytics cookies" />
          </div>
          <div className="flex items-center gap-3">
            <div className="flex-1 flex flex-col">
              <span className="text-sm font-extrabold">Marketing</span>
              <span className="text-xs text-muted">Lets us show you Byro ads on other sites.</span>
            </div>
            <Switch checked={marketing} onChange={() => setMarketing((v) => !v)} label="Marketing cookies" />
          </div>
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => decide(manage ? { analytics, marketing } : { analytics: true, marketing: true })}
          className="h-10 px-4 rounded-full bg-ink text-sm font-bold text-white hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
        >
          {manage ? "Save choices" : "Accept all"}
        </button>
        <button
          type="button"
          onClick={() => decide({ analytics: false, marketing: false })}
          className="h-10 px-4 rounded-full border border-[#D5DBE5] bg-white text-sm font-bold text-ink hover:bg-mist focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          Reject
        </button>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => setManage((v) => !v)}
          aria-expanded={manage}
          className="h-10 px-1 text-sm font-bold text-brand-dark hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand rounded"
        >
          {manage ? "Hide" : "Manage"}
        </button>
      </div>
    </section>
  );
}
