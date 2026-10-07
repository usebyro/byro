"use client";

import { openCookieSettings } from "@/lib/consent";

export default function CookieSettingsButton() {
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
