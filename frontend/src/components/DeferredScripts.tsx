"use client";

import { useEffect } from "react";

const GA_ID = "G-PKLCDNL7QC";
const TAWK_SRC = "https://embed.tawk.to/6a36e24716fcef1d436fc177/1jrj67qeb";

// Where someone is likely to need the chat straight away, so it isn't held back.
const NEEDS_CHAT_NOW = /^\/(payment|order-confirmed|ticket)(\/|$)/;

function addScript(src: string, attrs: Record<string, string> = {}) {
  const s = document.createElement("script");
  s.async = true;
  s.src = src;
  for (const [k, v] of Object.entries(attrs)) s.setAttribute(k, v);
  document.head.appendChild(s);
}

/**
 * Analytics and the support chat are third-party scripts worth about 400 KB. Loaded with the page they
 * block it from painting on a phone, so they wait for the first touch, scroll or key press, or for the
 * page to settle (5 seconds after it loads), whichever comes first. The consent defaults stay inline in
 * the layout, so nothing is tracked before the visitor chooses.
 */
export default function DeferredScripts() {
  useEffect(() => {
    let loaded = false;
    const load = () => {
      if (loaded) return;
      loaded = true;
      cleanup();
      addScript(`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`);
      const w = window as unknown as { Tawk_API?: object; Tawk_LoadStart?: Date };
      w.Tawk_API = w.Tawk_API || {};
      w.Tawk_LoadStart = new Date();
      addScript(TAWK_SRC, { charset: "UTF-8", crossorigin: "*" });
    };

    const events = ["pointerdown", "keydown", "scroll", "touchstart"] as const;
    const cleanup = () => {
      events.forEach((e) => window.removeEventListener(e, load));
      clearTimeout(timer);
    };
    events.forEach((e) => window.addEventListener(e, load, { once: true, passive: true }));
    const timer = setTimeout(load, NEEDS_CHAT_NOW.test(window.location.pathname) ? 0 : 5000);
    return cleanup;
  }, []);

  return null;
}
