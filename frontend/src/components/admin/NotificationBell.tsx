"use client";

import { useEffect, useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Notification03Icon } from "@hugeicons/core-free-icons";

// No notifications API exists yet — this used to render fabricated sample
// data (fake names, fake payout amounts) that looked like real activity.
// Showing an honest empty state until a real feed is wired up.
// TODO: replace with a real notifications API once the backend exists
// (suggested: GET /api/admin/notifications/, PATCH /api/admin/notifications/:id/read/).
export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Notifications"
        className="relative text-gray-300 hover:text-white p-1.5 rounded-lg hover:bg-white/5 transition-colors"
      >
        <HugeiconsIcon icon={Notification03Icon} size={20} color="currentColor" />
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] bg-[#1a1d27] border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-white/10">
            <p className="text-white text-sm font-semibold">Notifications</p>
          </div>
          <p className="text-gray-500 text-xs text-center py-8 px-4">
            Live notifications are coming soon. Check Events and Payouts directly for now.
          </p>
        </div>
      )}
    </div>
  );
}
