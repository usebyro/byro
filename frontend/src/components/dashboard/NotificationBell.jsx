"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Notification01Icon,
  Ticket01Icon,
  Wallet01Icon,
  CheckmarkCircle02Icon,
} from "@hugeicons/core-free-icons";
import { MOCK_ORGANIZER_NOTIFICATIONS } from "@/lib/mockOrganizerNotifications";

const TYPE_META = {
  ticket_purchase: { icon: Ticket01Icon, color: "#4F6EF7", bg: "bg-[#4F6EF7]/10" },
  payout_request: { icon: Wallet01Icon, color: "#d97706", bg: "bg-amber-500/10" },
  payout_processed: { icon: CheckmarkCircle02Icon, color: "#16a34a", bg: "bg-green-500/10" },
};

function fmtNaira(n) {
  return `₦${n.toLocaleString()}`;
}

function timeAgo(iso) {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  if (Number.isNaN(diff)) return "";
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState(MOCK_ORGANIZER_NOTIFICATIONS);
  const containerRef = useRef(null);

  const unread = useMemo(() => items.filter((n) => !n.read).length, [items]);

  useEffect(() => {
    if (!open) return;
    function onClick(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    function onKey(e) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const markAllRead = () =>
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Notifications"
        className="relative p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-50 transition-colors"
      >
        <HugeiconsIcon icon={Notification01Icon} size={18} color="currentColor" />
        {unread > 0 && (
          <span className="absolute top-1 right-1 min-w-[15px] h-[15px] px-1 flex items-center justify-center rounded-full bg-red-500 text-white text-[9px] font-bold leading-none">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] bg-white border border-gray-100 rounded-xl shadow-xl z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <p className="text-gray-900 text-sm font-bold">Notifications</p>
            {unread > 0 && (
              <button
                onClick={markAllRead}
                className="text-[11px] font-semibold text-[#4F6EF7] hover:text-blue-700"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 ? (
              <p className="text-gray-400 text-xs text-center py-8">No notifications yet</p>
            ) : (
              items.map((n) => {
                const meta = TYPE_META[n.type] || TYPE_META.ticket_purchase;
                return (
                  <div
                    key={n.id}
                    className={`flex gap-3 px-4 py-3 border-b border-gray-50 last:border-b-0 ${
                      n.read ? "" : "bg-[#4F6EF7]/[0.03]"
                    }`}
                  >
                    <div className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${meta.bg}`}>
                      <HugeiconsIcon icon={meta.icon} size={16} color={meta.color} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-gray-900 text-xs font-bold truncate">{n.title}</p>
                        {!n.read && <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-[#4F6EF7]" />}
                      </div>
                      <p className="text-gray-500 text-[11px] leading-snug mt-0.5">{n.message}</p>
                      <div className="flex items-center gap-2 mt-1">
                        {typeof n.amount === "number" && (
                          <span className="text-[11px] font-semibold text-gray-700">{fmtNaira(n.amount)}</span>
                        )}
                        <span className="text-[10px] text-gray-400">{timeAgo(n.createdAt)}</span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
