"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import API from "@/services/api";
import { HugeiconsIcon } from "@hugeicons/react";
import { Notification01Icon } from "@hugeicons/core-free-icons";

// A quiet colour per type instead of an icon.
const KIND_DOT = {
  ticket_sale: "bg-[#4F6EF7]",
  new_follower: "bg-[#D0668E]",
  payout_processed: "bg-green-500",
  payout_rejected: "bg-amber-500",
  event_status: "bg-amber-500",
};

const POLL_MS = 60_000;

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
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const containerRef = useRef(null);
  const router = useRouter();

  const load = useCallback(async () => {
    try {
      const data = await API.getNotifications();
      setItems(data.results || []);
      setUnread(data.unread || 0);
    } catch {
      // Keep whatever we had; the next poll tries again.
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, POLL_MS);
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [load]);

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

  const markAllRead = async () => {
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnread(0);
    try {
      await API.markNotificationsRead();
    } catch {
      load();
    }
  };

  const openItem = async (n) => {
    setOpen(false);
    if (!n.read) {
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      setUnread((u) => Math.max(0, u - 1));
      API.markNotificationsRead([n.id]).catch(() => load());
    }
    if (n.link) router.push(n.link);
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Notifications"
        className="relative p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-50 transition-colors"
      >
        <HugeiconsIcon icon={Notification01Icon} size={18} color="currentColor" />
        {unread > 0 && (
          <span className="absolute top-1 right-1 min-w-[15px] h-[15px] px-1 flex items-center justify-center rounded-full bg-red-500 text-white text-[11px] font-bold leading-none">
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
              <p className="text-gray-400 text-xs text-center py-8 px-4">No notifications yet. You&apos;ll see ticket sales and payouts here.</p>
            ) : (
              items.map((n) => {
                return (
                  <button
                    type="button"
                    key={n.id}
                    onClick={() => openItem(n)}
                    className={`flex w-full gap-3 px-4 py-3 text-left border-b border-gray-50 last:border-b-0 hover:bg-gray-50 ${
                      n.read ? "" : "bg-[#4F6EF7]/[0.03]"
                    }`}
                  >
                    <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${KIND_DOT[n.kind] || "bg-[#4F6EF7]"} ${n.read ? "opacity-30" : ""}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className={`text-gray-900 text-xs truncate ${n.read ? "font-semibold" : "font-extrabold"}`}>{n.title}</p>
                      </div>
                      {n.body && <p className="text-gray-500 text-[11px] leading-snug mt-0.5">{n.body}</p>}
                      <span className="mt-1 block text-xs text-gray-400">{timeAgo(n.created_at)}</span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
