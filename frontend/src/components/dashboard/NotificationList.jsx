"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import API from "@/services/api";

const POLL_MS = 60_000;

// One icon and tint per kind the backend sends (Backend/bryo/notifications.py callers).
const KINDS = {
  ticket_sale: {
    path: "M3 8a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2v-2a2 2 0 0 0 0-4z",
    bg: "#EEF3FF",
    fg: "#2451D6",
  },
  new_follower: {
    path: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5M19 8v6M16 11h6",
    bg: "#F3F6FB",
    fg: "#14161C",
  },
  payout_processed: { path: "M3 7h18v10H3zM12 12m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0", bg: "#E9F7EF", fg: "#1F7A52" },
  payout_rejected: { path: "M12 9v4M12 17h.01M10.3 3.9L2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z", bg: "#FFF4D6", fg: "#8A5A00" },
  milestone: { path: "M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z", bg: "#FFF4CC", fg: "#6B4A08" },
  event_reminder: { path: "M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z", bg: "#F3F6FB", fg: "#14161C" },
  cohost_joined: { path: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c1-4 4-6 8-6s7 2 8 6", bg: "#F3F6FB", fg: "#14161C" },
  event_status: { path: "M12 9v4M12 17h.01M10.3 3.9L2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z", bg: "#FFF4D6", fg: "#8A5A00" },
};
const FALLBACK = { path: "M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15zM10 20a2 2 0 0 0 4 0", bg: "#F3F6FB", fg: "#14161C" };

function timeAgo(iso) {
  const then = new Date(iso);
  const mins = Math.round((Date.now() - then.getTime()) / 60000);
  if (Number.isNaN(mins)) return "";
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24 && then.toDateString() === new Date().toDateString()) return `${hrs} ${hrs === 1 ? "hr" : "hrs"} ago`;
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (then.toDateString() === yesterday.toDateString()) return "Yesterday";
  const days = Math.max(2, Math.round(hrs / 24));
  return days < 7 ? `${days} days ago` : then.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

const isToday = (iso) => new Date(iso).toDateString() === new Date().toDateString();

/** The organiser's notifications, polled while the page is open. */
export function useNotifications() {
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await API.getNotifications();
      setItems(data.results || []);
      setUnread(data.unread || 0);
      setFailed(false);
      setLoaded(true);
    } catch {
      // Keep whatever we had; the next poll tries again.
      setFailed(true);
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

  const markAllRead = useCallback(async () => {
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnread(0);
    try {
      await API.markNotificationsRead();
    } catch {
      load();
    }
  }, [load]);

  const markRead = useCallback(
    (n) => {
      if (n.read) return;
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      setUnread((u) => Math.max(0, u - 1));
      API.markNotificationsRead([n.id]).catch(() => load());
    },
    [load],
  );

  return { items, unread, loaded, failed, load, markAllRead, markRead };
}

/**
 * The list itself: header, All / Unread tabs, Today / Earlier groups. Used by the bell's panel
 * on desktop and by /dashboard/notifications on phones. `onNavigate` runs before following a link.
 */
export default function NotificationList({ state, onNavigate, inset = "px-5" }) {
  const { items, unread, loaded, failed, load, markAllRead, markRead } = state;
  const [tab, setTab] = useState("all");
  const router = useRouter();

  const visible = tab === "all" ? items : items.filter((n) => !n.read);
  const groups = [
    { label: "TODAY", items: visible.filter((n) => isToday(n.created_at)) },
    { label: "EARLIER", items: visible.filter((n) => !isToday(n.created_at)) },
  ].filter((g) => g.items.length);

  const open = (n) => {
    markRead(n);
    onNavigate?.();
    if (n.link) router.push(n.link);
  };

  const onTabKey = (e) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const next = tab === "all" ? "unread" : "all";
    setTab(next);
    document.getElementById(`notif-tab-${next}`)?.focus();
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className={`flex items-center justify-between pt-4 ${inset}`}>
        <h2 className="font-display m-0 text-xl font-bold">Notifications</h2>
        <button
          type="button"
          onClick={markAllRead}
          disabled={!unread}
          className="border-0 bg-transparent p-0 text-[13px] font-bold text-[#2451D6] disabled:cursor-default disabled:text-[#A9B3C2]"
        >
          Mark all as read
        </button>
      </div>

      <div role="tablist" aria-label="Show" className={`flex gap-[18px] border-b border-hairline pt-3 ${inset}`}>
        {[
          ["all", "All"],
          ["unread", "Unread"],
        ].map(([id, label]) => (
          <button
            key={id}
            id={`notif-tab-${id}`}
            type="button"
            role="tab"
            aria-selected={tab === id}
            tabIndex={tab === id ? 0 : -1}
            onClick={() => setTab(id)}
            onKeyDown={onTabKey}
            className={`-mb-px flex h-[38px] items-center gap-1.5 border-0 border-b-2 bg-transparent p-0 text-sm font-extrabold ${
              tab === id ? "border-ink text-ink" : "border-transparent text-faint"
            }`}
          >
            {label}
            {id === "unread" && unread > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1.5 text-[11px] text-white">{unread}</span>
            )}
          </button>
        ))}
      </div>

      <div role="tabpanel" aria-labelledby={`notif-tab-${tab}`} className="min-h-0 flex-1 overflow-y-auto">
        {!loaded && failed ? (
          <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
            <span className="text-[15px] font-extrabold">We couldn&apos;t load your notifications</span>
            <span className="text-[13px] text-muted">Check your connection and try again.</span>
            <button type="button" onClick={load} className="mt-1 text-sm font-bold text-[#2451D6]">
              Try again
            </button>
          </div>
        ) : !loaded ? (
          <div aria-busy="true" className={`flex flex-col gap-4 py-4 ${inset}`}>
            <span role="status" className="sr-only">Loading</span>
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-start gap-3">
                <span className="h-[38px] w-[38px] shrink-0 animate-pulse rounded-full bg-[#EEF1F6] motion-reduce:animate-none" />
                <span className="flex flex-1 flex-col gap-2 pt-1">
                  <span className="h-3 w-4/5 animate-pulse rounded bg-[#EEF1F6] motion-reduce:animate-none" />
                  <span className="h-2.5 w-1/4 animate-pulse rounded bg-[#EEF1F6] motion-reduce:animate-none" />
                </span>
              </div>
            ))}
          </div>
        ) : groups.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
            <span aria-hidden="true" className="flex h-12 w-12 items-center justify-center rounded-full bg-[#E9F7EF] text-[#1F7A52]">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12l5 5L20 7" />
              </svg>
            </span>
            <span className="text-[15px] font-extrabold">You&apos;re all caught up</span>
            <span className="text-[13px] text-muted">New sales, followers and payouts will show here.</span>
          </div>
        ) : (
          groups.map((g) => (
            <section key={g.label} aria-label={g.label === "TODAY" ? "Today" : "Earlier"}>
              <p className={`m-0 pb-1.5 pt-3.5 text-xs font-extrabold tracking-[0.08em] text-faint ${inset}`}>{g.label}</p>
              <ul className="m-0 list-none p-0">
                {g.items.map((n) => {
                  const k = KINDS[n.kind] || FALLBACK;
                  return (
                    <li key={n.id}>
                      <button
                        type="button"
                        onClick={() => open(n)}
                        className={`flex w-full items-start gap-3 border-0 py-3 text-left text-ink hover:bg-[#F3F6FB] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand ${inset} ${
                          n.read ? "bg-white" : "bg-[#F7F9FC]"
                        }`}
                      >
                        <span
                          aria-hidden="true"
                          className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full"
                          style={{ background: k.bg, color: k.fg }}
                        >
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d={k.path} />
                          </svg>
                        </span>
                        <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
                          <span className="text-sm leading-[1.45] text-body">
                            <b className="text-ink">{n.title}</b> {n.body}
                          </span>
                          <span className="text-xs text-faint">{timeAgo(n.created_at)}</span>
                        </span>
                        {!n.read && (
                          <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand">
                            <span className="sr-only">Unread</span>
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
        )}
      </div>

      <Link
        href="/dashboard/settings"
        onClick={() => onNavigate?.()}
        className="flex h-12 shrink-0 items-center justify-center border-t border-hairline text-sm font-bold text-[#2451D6] no-underline hover:bg-[#F7F9FC]"
      >
        Notification settings
      </Link>
    </div>
  );
}
