"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import EventImageFallback from "@/components/ui/EventImageFallback";
import API from "@/services/api";

const PAGE_SIZE = 10;

const naira = (n) => "₦" + Math.round(Number(n) || 0).toLocaleString("en-NG");
const num = (n) => Math.round(Number(n) || 0).toLocaleString("en-NG");

// "2026-11-14" as a local date, so the day never shifts with the timezone.
function parseDay(d) {
  if (!d) return null;
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y, m - 1, day);
}

function formatTime(t) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

// "Sat 14 Nov, 10:00 AM · Landmark Centre, VI" (year added when it isn't this year)
function formatWhen(e, withTime = true) {
  const day = parseDay(e.day);
  if (!day) return e.location || "";
  const opts = { weekday: "short", day: "numeric", month: "short" };
  if (day.getFullYear() !== new Date().getFullYear()) opts.year = "numeric";
  const date = day.toLocaleDateString("en-GB", opts).replace(/,/g, "");
  const time = withTime && e.time_from ? `, ${formatTime(e.time_from)}` : "";
  return `${date}${time}${e.location ? ` · ${e.location}` : ""}`;
}

function countdown(e) {
  const day = parseDay(e.day);
  if (!day) return "";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((day - today) / 86400000);
  if (days <= 0) return "Today";
  if (days === 1) return "Tomorrow";
  return `In ${days} days`;
}

const isDraft = (e) => Boolean(e.is_draft);
const isUpcoming = (e) => !isDraft(e) && !e.is_past;
const isPast = (e) => !isDraft(e) && e.is_past;
const isFull = (e) => e.capacity > 0 && e.sold >= e.capacity;

const STATUS = {
  sale: { label: "On sale", ink: "#1F7A52", dot: "#2F9E6E" },
  soldout: { label: "Sold out", ink: "#2451D6", dot: "#3669F6" },
  draft: { label: "Draft", ink: "#5B6272", dot: "#CBD3DF" },
  ended: { label: "Ended", ink: "#5B6272", dot: "#8A91A0" },
  cancelled: { label: "Cancelled", ink: "#B42318", dot: "#D92D20" },
};

function statusOf(e) {
  if (isDraft(e)) return STATUS.draft;
  if (e.is_cancelled) return STATUS.cancelled;
  if (e.is_past) return STATUS.ended;
  return isFull(e) ? STATUS.soldout : STATUS.sale;
}

const soldWord = (e) => (e.is_free ? "registered" : "sold");

function ticketsText(e) {
  if (isDraft(e)) return "Not on sale";
  if (isUpcoming(e) && e.capacity > 0) return `${num(e.sold)} of ${num(e.capacity)} ${soldWord(e)}`;
  return `${num(e.sold)} ${soldWord(e)}`;
}

// Co-hosts don't receive the revenue, so they see a dash rather than ₦0.
function revenueText(e) {
  if (isDraft(e)) return "-";
  if (e.is_free) return "Free";
  if (e.revenue == null) return "-";
  return naira(e.revenue);
}

const fillPct = (e) => (e.capacity > 0 ? Math.min(100, (e.sold / e.capacity) * 100) : 0);

// All tab order: on sale soonest first, then drafts, then past most recent first.
function sortEvents(list) {
  const up = list.filter(isUpcoming).sort((a, b) => a.day.localeCompare(b.day));
  const drafts = list.filter(isDraft);
  const past = list.filter(isPast).sort((a, b) => b.day.localeCompare(a.day));
  return [...up, ...drafts, ...past];
}

// Older backends have no /dashboard/events/: build the same rows from the
// overview endpoints (which list at most 10 upcoming and 10 past, and don't
// know check-ins).
async function loadFromOverview() {
  const [d, a] = await Promise.allSettled([API.getDashboard(), API.getDashboardAnalytics()]);
  if (d.status !== "fulfilled") throw d.reason;
  const stats = (a.status === "fulfilled" && a.value?.events) || {};
  const hosting = d.value?.hosting || {};
  const map = (e, past) => {
    const s = stats[e.slug];
    return {
      ...e,
      is_past: past,
      is_cancelled: false,
      sold: s ? s.sold : e.attendee_count || 0,
      checked_in: null,
      is_free: s ? Boolean(s.is_free) : Number(e.ticket_price) === 0,
      revenue: s && s.is_owner !== false ? s.revenue : null,
    };
  };
  return [...(hosting.upcoming || []).map((e) => map(e, false)), ...(hosting.past || []).map((e) => map(e, true))];
}

function Thumb({ event, className, sizes }) {
  return (
    <span className={`relative block overflow-hidden bg-mist ${className}`}>
      {event.event_image_url ? (
        <Image src={event.event_image_url} alt="" fill sizes={sizes} className="object-cover" />
      ) : (
        <EventImageFallback category={event.category} />
      )}
    </span>
  );
}

function Status({ e }) {
  const s = statusOf(e);
  return (
    <span className="v-status" style={{ color: s.ink }}>
      <span className="v-dot" style={{ background: s.dot }} />
      {s.label}
    </span>
  );
}

function Bar({ pct, className = "", grow, i }) {
  return (
    <span className={`block overflow-hidden rounded-full bg-[#DCE6FD] ${className}`} role="presentation">
      <span
        className={`block h-full rounded-full bg-brand ${grow ? "v-growx" : ""}`}
        style={{ width: `${pct}%`, "--i": i }}
      />
    </span>
  );
}

function Turnout({ e }) {
  if (!isPast(e) || e.checked_in == null || !e.sold) {
    return <span className="text-sm text-faint">{isPast(e) && e.checked_in == null && e.sold ? "-" : "Not yet"}</span>;
  }
  const ratio = Math.min(1, e.checked_in / e.sold);
  const mask = "radial-gradient(circle, transparent 6px, #000 6.5px)";
  return (
    <span className="inline-flex items-center gap-2">
      <span
        aria-hidden="true"
        className="inline-block h-[22px] w-[22px] rounded-full"
        style={{
          background: `conic-gradient(#3669F6 ${Math.round(ratio * 360)}deg, #DCE6FD 0)`,
          WebkitMask: mask,
          mask,
        }}
      />
      <span className="v-tab text-sm font-bold">
        {Math.round(ratio * 100)}% · {num(e.checked_in)} came
      </span>
    </span>
  );
}

function ComingUpCard({ e, i }) {
  const showRevenue = e.is_free || e.revenue != null;
  return (
    <Link
      href={`/dashboard/events/${e.slug}`}
      className="v-card v-lift v-press v-bf flex min-h-[196px] overflow-hidden text-ink no-underline"
      style={{ "--i": i }}
    >
      <Thumb event={e} className="w-[34%] shrink-0" sizes="(max-width: 640px) 34vw, 220px" />
      <span className="flex min-w-0 flex-grow flex-col gap-3 px-[22px] py-5">
        <span className="flex flex-wrap items-center gap-2">
          <span className="v-status text-[13px]" style={{ color: statusOf(e).ink }}>
            <span className="v-dot" style={{ background: statusOf(e).dot }} />
            {statusOf(e).label}
          </span>
          <span className="rounded-md bg-[#EEF3FF] px-2.5 py-[3px] text-[13px] font-bold text-brand-dark">{countdown(e)}</span>
        </span>
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="v-d break-words text-[21px] font-bold tracking-[-0.02em]">{e.name}</span>
          <span className="v-hint">{formatWhen(e)}</span>
        </span>
        <span className="mt-auto flex flex-col gap-2">
          <span className="flex justify-between gap-2 text-sm">
            <span>
              <b>{num(e.sold)}</b>{" "}
              <span className="text-muted">{e.capacity > 0 ? `of ${num(e.capacity)} ${soldWord(e)}` : soldWord(e)}</span>
            </span>
            {showRevenue && <b>{revenueText(e)}</b>}
          </span>
          {e.capacity > 0 && <Bar pct={fillPct(e)} className="h-1.5" grow i={i} />}
        </span>
      </span>
    </Link>
  );
}

function TableRow({ e, i }) {
  return (
    <tr className="v-row v-al relative border-b border-hairline" style={{ "--i": i }}>
      <td className="px-5 py-3">
        <Link
          href={`/dashboard/events/${e.slug}`}
          className="flex items-center gap-3.5 text-ink no-underline after:absolute after:inset-0 after:content-['']"
        >
          <Thumb event={e} className="h-12 w-[60px] shrink-0 rounded-xl" sizes="60px" />
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="text-base font-extrabold">{e.name}</span>
            <span className="text-sm text-muted">{formatWhen(e, !e.is_past)}</span>
          </span>
        </Link>
      </td>
      <td data-l="Tickets" className="p-3">
        <span className="flex flex-col gap-1.5">
          <span className="v-tab whitespace-nowrap text-sm font-bold">{ticketsText(e)}</span>
          {isUpcoming(e) && e.capacity > 0 && <Bar pct={fillPct(e)} className="h-1 w-[110px]" />}
        </span>
      </td>
      <td data-l="Turnout" className="p-3">
        <Turnout e={e} />
      </td>
      <td data-l="Revenue" className="v-tab whitespace-nowrap p-3 text-right text-[15px] font-extrabold">{revenueText(e)}</td>
      <td data-l="Status" className="py-3 pl-6 pr-5">
        <Status e={e} />
      </td>
    </tr>
  );
}

function Skeleton() {
  return (
    <>
      <div className="grid gap-5 [grid-template-columns:repeat(auto-fit,minmax(min(380px,100%),1fr))]">
        {[0, 1].map((k) => (
          <div key={k} className="v-card flex min-h-[196px] overflow-hidden">
            <div className="v-skel w-[34%] shrink-0 rounded-none" />
            <div className="flex flex-grow flex-col gap-3 p-5">
              <div className="v-skel h-5 w-32" />
              <div className="v-skel h-6 w-3/4" />
              <div className="v-skel h-4 w-1/2" />
              <div className="v-skel mt-auto h-1.5 w-full" />
            </div>
          </div>
        ))}
      </div>
      <div className="v-card flex flex-col gap-4 p-5" aria-hidden="true">
        {[0, 1, 2, 3].map((k) => (
          <div key={k} className="flex items-center gap-3.5">
            <div className="v-skel h-12 w-[60px] shrink-0 rounded-xl" />
            <div className="flex flex-grow flex-col gap-2">
              <div className="v-skel h-4 w-2/5" />
              <div className="v-skel h-3 w-1/3" />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

const PlusIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 5v14M5 12h14" />
  </svg>
);

const TABS = [
  ["all", "All"],
  ["upcoming", "Upcoming"],
  ["past", "Past"],
  ["draft", "Drafts"],
];
const matchesTab = (e, t) =>
  t === "all" || (t === "upcoming" && isUpcoming(e)) || (t === "past" && isPast(e)) || (t === "draft" && isDraft(e));

export default function StudioEvents() {
  const [events, setEvents] = useState(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all"); // all | upcoming | past | draft
  const [page, setPage] = useState(0);

  useEffect(() => {
    document.title = "Events | Byro";
  }, []);

  const fetchEvents = useCallback(
    () =>
      API.getDashboardEvents()
        .then((res) => res.events || [])
        .catch(() => loadFromOverview())
        .then((list) => {
          setEvents(sortEvents(list));
          setFailed(false);
        })
        .catch(() => setFailed(true))
        .finally(() => setLoading(false)),
    []
  );

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const retry = () => {
    setLoading(true);
    fetchEvents();
  };

  const all = events || [];
  const comingUp = all.filter((e) => isUpcoming(e) && !e.is_cancelled).slice(0, 2);
  const counts = Object.fromEntries(TABS.map(([t]) => [t, all.filter((e) => matchesTab(e, t)).length]));
  const q = search.trim().toLowerCase();
  const filtered = all.filter(
    (e) => matchesTab(e, filter) && (!q || e.name.toLowerCase().includes(q) || (e.location || "").toLowerCase().includes(q))
  );
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  const rows = filtered.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE);
  const countNote =
    pages > 1
      ? `Showing ${current * PAGE_SIZE + 1}–${current * PAGE_SIZE + rows.length} of ${filtered.length}`
      : `Showing ${filtered.length}${filter === "all" && !q ? "" : ` of ${all.length}`}`;

  const emptyTitle = { upcoming: "No upcoming events", past: "No past events", draft: "No drafts" }[filter] || "No events";

  return (
    <div className="mx-auto flex w-full max-w-[1240px] flex-col gap-5 px-4 pb-12 pt-2 md:gap-6 sm:px-[clamp(16px,3vw,40px)]">
      <div className="v-bf flex flex-wrap items-end gap-4" style={{ "--i": 0 }}>
        <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-1.5">
          <h1 className="v-h1">Events</h1>
          <p className="v-sub">Everything you host: on sale, past and drafts.</p>
        </div>
        <Link href="/dashboard/events/create" className="v-btn v-btn-p v-btn-lg">
          <PlusIcon />
          Create event
        </Link>
      </div>

      {loading ? (
        <Skeleton />
      ) : failed ? (
        <section className="v-card flex flex-col items-center gap-3 px-4 py-14 text-center">
          <p className="v-h2">Couldn&apos;t load your events</p>
          <p className="v-sub">Check your connection and try again.</p>
          <button type="button" className="v-btn v-btn-s" onClick={retry}>
            Try again
          </button>
        </section>
      ) : all.length === 0 ? (
        <section className="v-card v-bf flex flex-col items-center gap-3 px-4 py-14 text-center" style={{ "--i": 1 }}>
          <p className="v-h2">No events yet</p>
          <p className="v-sub">Create an event to start selling tickets.</p>
          <Link href="/dashboard/events/create" className="v-btn v-btn-p mt-1">
            <PlusIcon />
            Create your first event
          </Link>
        </section>
      ) : (
        <>
          {comingUp.length > 0 && (
            <section aria-label="Coming up" className="grid gap-5 [grid-template-columns:repeat(auto-fit,minmax(min(380px,100%),1fr))]">
              {comingUp.map((e, i) => (
                <ComingUpCard key={e.slug} e={e} i={i + 1} />
              ))}
            </section>
          )}

          <div className="v-bf flex flex-wrap items-center gap-3" style={{ "--i": 3 }}>
            <label className="v-search min-w-0 flex-[1_1_240px] sm:flex-[0_1_320px]">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5B6272" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="11" cy="11" r="7" />
                <path d="M20 20l-3.5-3.5" />
              </svg>
              <input
                type="search"
                placeholder="Search your events…"
                aria-label="Search your events"
                value={search}
                onChange={(ev) => {
                  setSearch(ev.target.value);
                  setPage(0);
                }}
                className="!text-base sm:!text-sm"
              />
            </label>
            <div role="group" aria-label="Filter events" className="v-seg">
              {TABS.map(([t, label]) => (
                <button key={t} type="button" aria-pressed={filter === t} onClick={() => {
                    setFilter(t);
                    setPage(0);
                  }}>
                  {label}
                  <span className="n">{counts[t]}</span>
                </button>
              ))}
            </div>
          </div>

          <section aria-label="Your events" className="v-card v-bf overflow-hidden" style={{ "--i": 4 }}>
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-4 py-14 text-center">
                <p className="text-base font-extrabold">{q ? "No events match your search" : emptyTitle}</p>
                <p className="v-hint">
                  {q ? "Try another name or place." : filter === "draft" ? "Events you save without publishing show up here." : "They'll show up here."}
                </p>
                {q && (
                  <button type="button" className="v-btn v-btn-s v-btn-sm mt-2" onClick={() => {
                      setSearch("");
                      setPage(0);
                    }}>
                    Clear search
                  </button>
                )}
              </div>
            ) : (
              <>
                <table className="v-stack w-full border-collapse">
                  <thead>
                    <tr className="border-b border-hairline">
                      <th scope="col" className="v-th px-5 py-3.5 text-left">Event</th>
                      <th scope="col" className="v-th px-3 py-3.5 text-left">Tickets</th>
                      <th scope="col" className="v-th px-3 py-3.5 text-left">Turnout</th>
                      <th scope="col" className="v-th px-3 py-3.5 text-right">Revenue</th>
                      <th scope="col" className="v-th py-3.5 pl-6 pr-5 text-left">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((e, i) => (
                      <TableRow key={e.slug} e={e} i={i} />
                    ))}
                  </tbody>
                </table>
                <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 text-[13px] text-muted">
                  <span aria-live="polite">{countNote}</span>
                  {pages > 1 && (
                    <span className="flex gap-2">
                      <button type="button" className="v-btn v-btn-s v-btn-sm" disabled={current === 0} onClick={() => setPage(current - 1)}>
                        Previous
                      </button>
                      <button type="button" className="v-btn v-btn-s v-btn-sm" disabled={current >= pages - 1} onClick={() => setPage(current + 1)}>
                        Next
                      </button>
                    </span>
                  )}
                </div>
              </>
            )}
          </section>
        </>
      )}
    </div>
  );
}
