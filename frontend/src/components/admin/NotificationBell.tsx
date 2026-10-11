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
        className="relative text-[#3B4252] hover:text-ink p-1.5 rounded-lg hover:bg-mist transition-colors"
      >
        <HugeiconsIcon icon={Notification03Icon} size={20} color="currentColor" />
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] bg-white border border-line rounded-xl shadow-[0_20px_50px_rgba(20,22,28,0.14)] z-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-line">
            <p className="text-ink text-sm font-semibold">Notifications</p>
          </div>
          <p className="text-faint text-xs text-center py-8 px-4">
            Live notifications are coming soon. Check Events and Payouts directly for now.
          </p>
        </div>
      )}
    </div>
  );
}
