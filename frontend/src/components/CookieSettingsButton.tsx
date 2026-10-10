"use client";

import { useEffect, useState } from "react";
import { CONSENT_SAVED_EVENT, openCookieSettings, readConsent } from "@/lib/consent";

export default function CookieSettingsButton() {
  // Hidden once a choice exists; it only shows while the visitor has not answered the banner.
  const [answered, setAnswered] = useState(true);

  useEffect(() => {
    const sync = () => setAnswered(readConsent() !== null);
    sync();
    window.addEventListener(CONSENT_SAVED_EVENT, sync);
    return () => window.removeEventListener(CONSENT_SAVED_EVENT, sync);
  }, []);

  if (answered) return null;

  return (
    <button
      type="button"
      onClick={openCookieSettings}
      className="inline-flex items-center h-11 px-5 rounded-full bg-brand text-sm font-bold text-white hover:bg-brand-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
    >
      Change your cookie choices
    </button>
  );
}
