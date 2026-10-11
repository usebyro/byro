"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import { Notification03Icon } from "@hugeicons/core-free-icons";
import { resolveAdminHref } from "@/lib/adminNav";

interface AdminNotification {
  id: number;
  kind: string;
  title: string;
  body: string;
  link: string;
  read: boolean;
  created_at: string;
}

// A quiet colour per type instead of an icon: marigold needs action, blue is for information.
const KIND_DOT: Record<string, string> = {
  payout_request: "bg-marigold",
  refunds_pending: "bg-marigold",
  event_created: "bg-brand",
};

const POLL_MS = 60_000;

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(diff)) return "";
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AdminNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const pathname = usePathname();

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/notifications");
      if (!res.ok) return;
      const data = await res.json();
      setItems(data.results || []);
      setUnread(data.unread || 0);
    } catch {
      // Keep what we have; the next poll tries again.
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, POLL_MS);
    window.addEventListener("focus", load);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", load);
    };
  }, [load]);

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

  const markRead = (ids?: number[]) =>
    fetch("/api/admin/notifications/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(ids ? { ids } : {}),
    }).catch(() => load());

  const markAllRead = () => {
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnread(0);
    markRead();
  };

  const openItem = (n: AdminNotification) => {
    setOpen(false);
    if (!n.read) {
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      setUnread((u) => Math.max(0, u - 1));
      markRead([n.id]);
    }
    if (n.link) router.push(resolveAdminHref(pathname, n.link));
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
        aria-expanded={open}
        className="relative text-[#3B4252] hover:text-ink p-1.5 rounded-lg hover:bg-mist transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        <HugeiconsIcon icon={Notification03Icon} size={20} color="currentColor" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-bold leading-none text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] bg-white border border-line rounded-2xl shadow-[0_20px_50px_rgba(20,22,28,0.14)] z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-line">
            <p className="font-display text-ink text-sm font-extrabold">Notifications</p>
            {unread > 0 && (
              <button onClick={markAllRead} className="text-xs font-bold text-brand-dark hover:text-brand">
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 ? (
              <p className="text-muted text-sm text-center py-8 px-4">
                Nothing yet. Payout requests, refunds to review and new events show up here.
              </p>
            ) : (
              items.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => openItem(n)}
                  className={`flex w-full gap-3 px-4 py-3 text-left border-b border-hairline last:border-b-0 hover:bg-mist ${
                    n.read ? "" : "bg-brand/[0.04]"
                  }`}
                >
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${KIND_DOT[n.kind] ?? "bg-brand"} ${n.read ? "opacity-30" : ""}`} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className={`truncate text-[13px] text-ink ${n.read ? "font-semibold" : "font-extrabold"}`}>{n.title}</span>
                    </span>
                    {n.body && <span className="mt-0.5 block text-xs leading-snug text-muted">{n.body}</span>}
                    <span className="mt-1 block text-xs text-faint">{timeAgo(n.created_at)}</span>
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
