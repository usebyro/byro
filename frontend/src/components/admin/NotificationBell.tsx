"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Notification03Icon,
  Ticket01Icon,
  Wallet01Icon,
  CheckmarkCircle02Icon,
} from "@hugeicons/core-free-icons";
import {
  MOCK_ADMIN_NOTIFICATIONS,
  type AdminNotification,
  type AdminNotificationType,
} from "@/lib/mockNotifications";

const TYPE_META: Record<
  AdminNotificationType,
  { icon: typeof Ticket01Icon; color: string; bg: string }
> = {
  ticket_purchase: { icon: Ticket01Icon, color: "#60a5fa", bg: "bg-blue-500/10" },
  payout_request: { icon: Wallet01Icon, color: "#fbbf24", bg: "bg-amber-500/10" },
  payout_processed: { icon: CheckmarkCircle02Icon, color: "#4ade80", bg: "bg-green-500/10" },
};

function fmtNaira(n: number) {
  return `₦${n.toLocaleString()}`;
}

function timeAgo(iso: string) {
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
  const [items, setItems] = useState<AdminNotification[]>(MOCK_ADMIN_NOTIFICATIONS);
  const containerRef = useRef<HTMLDivElement>(null);

  const unread = useMemo(() => items.filter((n) => !n.read).length, [items]);

  // Close on outside click or Escape
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

  const markAllRead = () =>
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Notifications"
        className="relative text-gray-300 hover:text-white p-1.5 rounded-lg hover:bg-white/5 transition-colors"
      >
        <HugeiconsIcon icon={Notification03Icon} size={20} color="currentColor" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full bg-red-500 text-white text-[9px] font-bold leading-none">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] bg-[#1a1d27] border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
            <p className="text-white text-sm font-semibold">Notifications</p>
            {unread > 0 && (
              <button
                onClick={markAllRead}
                className="text-[11px] font-semibold text-blue-400 hover:text-blue-300"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 ? (
              <p className="text-gray-500 text-xs text-center py-8">No notifications yet</p>
            ) : (
              items.map((n) => {
                const meta = TYPE_META[n.type];
                return (
                  <div
                    key={n.id}
                    className={`flex gap-3 px-4 py-3 border-b border-white/5 last:border-b-0 ${
                      n.read ? "" : "bg-white/[0.03]"
                    }`}
                  >
                    <div className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${meta.bg}`}>
                      <HugeiconsIcon icon={meta.icon} size={16} color={meta.color} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-white text-xs font-semibold truncate">{n.title}</p>
                        {!n.read && <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-blue-400" />}
                      </div>
                      <p className="text-gray-400 text-[11px] leading-snug mt-0.5">{n.message}</p>
                      <div className="flex items-center gap-2 mt-1">
                        {typeof n.amount === "number" && (
                          <span className="text-[11px] font-semibold text-gray-300">{fmtNaira(n.amount)}</span>
                        )}
                        <span className="text-[10px] text-gray-500">{timeAgo(n.createdAt)}</span>
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
