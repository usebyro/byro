"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import EventImageFallback from "@/components/ui/EventImageFallback";
import AppLayout from "@/layout/app";
import API from "@/services/api";
import SectionError from "@/components/dashboard/v2/SectionError";
import "@/app/dashboard/dashboard-v2.css";
import Delayed from "@/components/dashboard/v2/Delayed";

const BASE_URL = (process.env.NEXT_PUBLIC_API_URL || "https://byro.onrender.com").replace(/\/api\/?$/, "");

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAY_MS = 1000 * 60 * 60 * 24;

// "2026-10-24" as a local date (new Date("2026-10-24") is UTC midnight and can land on the day before).
function parseDay(dateStr) {
  if (!dateStr) return null;
  const [y, m, d] = String(dateStr).split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

// The API sends "None" when an event has no start time.
function parseTime(t) {
  if (!t || !/^\d{1,2}:\d{2}/.test(t)) return null;
  const [h, m] = t.split(":").map(Number);
  return { h, m };
}

function formatDate(dateStr) {
  const d = parseDay(dateStr);
  if (!d) return "";
  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

function formatTime(t) {
  const p = parseTime(t);
  if (!p) return "";
  return `${p.h % 12 || 12}:${String(p.m).padStart(2, "0")} ${p.h >= 12 ? "PM" : "AM"}`;
}

// Whole days from today to the event; negative once it's gone.
function daysUntil(dateStr) {
  const d = parseDay(dateStr);
  if (!d) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / DAY_MS);
}

// "Next up · in 8 days", or "Today · starts in 2 hours" on the day.
function nextUpLine(event) {
  const diff = daysUntil(event.day);
  if (diff === 0) {
    const p = parseTime(event.time_from);
    if (!p) return { text: "Today", today: true };
    const start = parseDay(event.day);
    start.setHours(p.h, p.m, 0, 0);
    const mins = Math.round((start.getTime() - Date.now()) / 60000);
    if (mins <= 0) return { text: `Today · started at ${formatTime(event.time_from)}`, today: true };
    if (mins < 60) return { text: `Today · starts in ${mins} minute${mins !== 1 ? "s" : ""}`, today: true };
    const hours = Math.round(mins / 60);
    return { text: `Today · starts in ${hours} hour${hours !== 1 ? "s" : ""}`, today: true };
  }
  if (diff === 1) return { text: "Next up · tomorrow", today: false };
  return { text: `Next up · in ${diff} days`, today: false };
}

function whenLine(event, withTime = true) {
  return [formatDate(event.day), withTime && formatTime(event.time_from), event.location].filter(Boolean).join(" · ");
}

function getImageUrl(event) {
  return (
    event.event_image_url ||
    (event.event_image?.startsWith("http")
      ? event.event_image
      : event.event_image
      ? `${BASE_URL}${event.event_image}`
      : null)
  );
}

function EventImage({ event, className }) {
  const imageUrl = getImageUrl(event);
  return (
    <div className={`relative overflow-hidden bg-mist ${className}`}>
      {imageUrl ? (
        <Image
          src={imageUrl}
          alt=""
          fill
          sizes="(max-width: 767px) 100vw, 200px"
          className="object-cover"
          onError={(e) => { e.currentTarget.style.display = "none"; }}
        />
      ) : (
        <EventImageFallback category={event.category} />
      )}
    </div>
  );
}

function ticketsLabel(n) {
  return `${n} ticket${n !== 1 ? "s" : ""}`;
}

// Role line, its ink and the two links for a row.
function rowDetails(item, isPast) {
  const { event, role, ticketId, ticketCount, checkedIn } = item;
  const eventPage = `/discover/${event.slug}`;
  if (role === "hosting") {
    return {
      role: isPast ? "Hosted" : "Hosting",
      ink: "text-[#2451D6]",
      cta: { label: "Manage", href: `/dashboard/events/${event.slug}` },
      cta2: { label: "View page", href: eventPage },
    };
  }
  if (isPast) {
    return {
      role: checkedIn ? "Checked in" : `Had ${ticketCount === 1 ? "a ticket" : ticketsLabel(ticketCount)}`,
      ink: checkedIn ? "text-[#1F7A52]" : "text-muted",
      cta: { label: "Event page", href: eventPage },
      cta2: ticketId ? { label: "Ticket", href: `/ticket/${ticketId}` } : null,
    };
  }
  return {
    role: `Going · ${ticketsLabel(ticketCount)}`,
    ink: "text-[#1F7A52]",
    cta: ticketId ? { label: "Show ticket", href: `/ticket/${ticketId}` } : { label: "Event page", href: eventPage },
    cta2: ticketId ? { label: "Event page", href: eventPage } : null,
  };
}

function EventRow({ item, isPast, index }) {
  const { event } = item;
  const { role, ink, cta, cta2 } = rowDetails(item, isPast);

  return (
    <article className="v-row v-al flex flex-wrap items-center gap-[14px] rounded-[14px] p-2.5" style={{ "--i": index }}>
      <EventImage event={event} className="h-[72px] w-[72px] shrink-0 rounded-xl" />
      <div className="flex min-w-0 flex-[1_1_200px] flex-col gap-[3px]">
        <h3 className="v-d m-0 truncate text-[17px] font-bold tracking-[-0.01em]">{event.name}</h3>
        <span className="text-sm text-body">{whenLine(event, !isPast)}</span>
        <span className={`text-[13px] font-bold ${ink}`}>{role}</span>
      </div>
      <div className="flex items-center gap-1.5">
        {cta2 && <Link href={cta2.href} className="v-btn v-btn-t v-btn-sm">{cta2.label}</Link>}
        <Link href={cta.href} className="v-btn v-btn-s v-btn-sm">{cta.label}</Link>
      </div>
    </article>
  );
}

function NextUp({ item }) {
  const { event, ticketId } = item;
  const line = nextUpLine(event);
  return (
    <section aria-labelledby="next-title" className="v-card v-bf flex flex-wrap items-stretch overflow-hidden" style={{ "--i": 1 }}>
      <EventImage
        event={event}
        className="m-2 mb-0 h-[148px] min-w-0 shrink grow-0 basis-[calc(100%-16px)] rounded-[14px] md:m-[10px] md:h-[156px] md:basis-[200px]"
      />
      <div className="flex min-w-0 flex-[1_1_300px] flex-col justify-center gap-3 px-4 pb-4 pt-[14px] md:py-[18px] md:pl-[10px] md:pr-5">
        <span className={`text-sm font-bold ${line.today ? "text-[#B45309]" : "text-[#1F7A52]"}`}>
          {line.text}
          {item.ticketCount > 1 && <span className="font-semibold text-muted"> · {ticketsLabel(item.ticketCount)}</span>}
        </span>
        <div className="flex flex-col gap-1">
          <h2 id="next-title" className="v-d m-0 text-2xl font-bold leading-[1.15] tracking-[-0.02em] [text-wrap:balance]">
            {event.name}
          </h2>
          <p className="m-0 text-[15px] text-body">{whenLine(event)}</p>
        </div>
        <div className="flex flex-wrap gap-2 pt-1">
          <Link href={`/ticket/${ticketId}`} className="v-btn v-btn-p">Show ticket</Link>
          <a href={API.getTicketCalendarUrl(ticketId)} className="v-btn v-btn-s">Add to calendar</a>
        </div>
      </div>
    </section>
  );
}

// On the day, phones keep the ticket one tap away.
function PinnedTicket({ item }) {
  const { event, ticketId } = item;
  const time = formatTime(event.time_from);
  return (
    <div className="fixed inset-x-3 bottom-[calc(76px+env(safe-area-inset-bottom))] z-30 flex items-center gap-3 rounded-[18px] bg-ink py-2.5 pl-4 pr-2.5 text-white shadow-[0_1px_2px_rgba(20,22,28,.06),0_16px_36px_-12px_rgba(20,22,28,.28)] md:hidden">
      <span className="flex min-w-0 flex-grow flex-col">
        <span className="truncate text-sm font-extrabold">{time ? `${event.name} starts ${time}` : `${event.name} is today`}</span>
        {event.location && <span className="truncate text-xs text-[#C9CFDA]">{event.location}</span>}
      </span>
      <Link href={`/ticket/${ticketId}`} className="v-btn !h-11 border-0 bg-white text-ink">Show ticket</Link>
    </div>
  );
}

function SkeletonList() {
  return (
    <div className="flex flex-col gap-5" aria-hidden="true">
      <div className="v-card flex flex-wrap gap-4 p-2.5">
        <div className="v-skel h-[148px] flex-[1_1_100%] rounded-[14px] md:h-[156px] md:flex-[0_1_200px]" />
        <div className="flex flex-[1_1_300px] flex-col justify-center gap-3 p-2">
          <div className="v-skel h-4 w-28" />
          <div className="v-skel h-6 w-2/3" />
          <div className="v-skel h-4 w-1/2" />
        </div>
      </div>
      <div className="v-card flex flex-col p-1.5">
        {[0, 1].map((i) => (
          <div key={i} className="flex items-center gap-[14px] p-2.5">
            <div className="v-skel h-[72px] w-[72px] shrink-0 rounded-xl" />
            <div className="flex flex-1 flex-col gap-2">
              <div className="v-skel h-4 w-1/2" />
              <div className="v-skel h-3 w-1/3" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const EMPTY_STATE = {
  upcoming: {
    title: "Nothing coming up yet",
    body: "Tickets you get and events you host show up here, with your ticket one tap away on the day.",
  },
  past: {
    title: "No past events yet",
    body: "Events you go to or host show up here once they're over.",
  },
};

function EmptyTab({ tab }) {
  const { title, body } = EMPTY_STATE[tab];
  return (
    <section aria-label="Nothing yet" className="v-card v-bf flex flex-col items-start gap-3 px-5 py-8 md:px-7 md:py-10" style={{ "--i": 1 }}>
      <h2 className="v-h2 !text-[22px]">{title}</h2>
      <p className="m-0 max-w-[46ch] text-[15px] text-body">{body}</p>
      <Link href="/discover" className="v-btn v-btn-p v-btn-lg mt-1.5">Find something this week</Link>
    </section>
  );
}

const isRealTicket = (t) => t.payment_status !== "pending" && t.payment_status !== "failed";

// Hosting + attending in one list: one row per event (hosting wins), tickets for the same event counted together.
function mergeItems(hosting, attending, newestFirst) {
  const ticketsBySlug = {};
  attending.forEach((t) => {
    const slug = t.event?.slug;
    if (!slug) return;
    const entry = (ticketsBySlug[slug] ||= { count: 0, checkedIn: false });
    entry.count += t.quantity || 1;
    if (t.checked_in) entry.checkedIn = true;
  });

  const seen = new Set();
  return [
    ...hosting.map((e) => ({ event: e, role: "hosting", ticketId: null, ticketCount: null, checkedIn: false })),
    ...attending.map((t) => ({
      event: t.event,
      role: "attending",
      ticketId: t.ticket_id || t.id,
      ticketCount: ticketsBySlug[t.event?.slug]?.count || 1,
      checkedIn: !!ticketsBySlug[t.event?.slug]?.checkedIn,
    })),
  ]
    .sort((a, b) => {
      const diff = (parseDay(a.event?.day)?.getTime() || 0) - (parseDay(b.event?.day)?.getTime() || 0);
      return newestFirst ? -diff : diff;
    })
    .filter(({ event }) => {
      if (!event?.slug || seen.has(event.slug)) return false;
      seen.add(event.slug);
      return true;
    });
}

export default function HomePage() {
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("upcoming");
  const [failed, setFailed] = useState(false);

  const load = () => {
    setLoading(true);
    setFailed(false);
    API.getDashboard()
      .then(setDashboard)
      .catch(() => {
        setDashboard(null);
        setFailed(true);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const hostingUpcoming = dashboard?.hosting?.upcoming || [];
  const hostingPast = dashboard?.hosting?.past || [];
  // Only tickets that get you in: unfinished or failed payments aren't tickets yet.
  const attendingUpcoming = (dashboard?.attending?.upcoming || []).filter(isRealTicket);
  const attendingPast = (dashboard?.attending?.past || []).filter(isRealTicket);

  const upcomingItems = mergeItems(hostingUpcoming, attendingUpcoming, false);
  const pastItems = mergeItems(hostingPast, attendingPast, true);

  // Next up: the soonest event you hold a ticket for. The rest of the upcoming list sits under "Later".
  const nextUp = upcomingItems.find((i) => i.role === "attending" && i.ticketId) || null;
  const isUpcoming = activeTab === "upcoming";
  const rows = isUpcoming ? upcomingItems.filter((i) => i !== nextUp) : pastItems;
  const showNext = isUpcoming && !!nextUp;
  const isEmpty = isUpcoming ? upcomingItems.length === 0 : pastItems.length === 0;
  const pinTicket = showNext && daysUntil(nextUp.event.day) === 0;

  const tabs = [
    { id: "upcoming", label: "Upcoming", count: upcomingItems.length },
    { id: "past", label: "Past", count: pastItems.length },
  ];

  return (
    <AppLayout>
      <div className="dv2 min-h-screen bg-[#F6F8FB]">
        <div
          className={`mx-auto flex w-full max-w-[1040px] flex-col gap-5 px-4 pt-6 sm:px-[clamp(16px,3vw,32px)] ${
            pinTicket ? "pb-[120px] md:pb-12" : "pb-12"
          }`}
        >
          <div className="v-bf flex flex-wrap items-end justify-between gap-4" style={{ "--i": 0 }}>
            <h1 className="v-h1">Your events</h1>
            <div role="group" aria-label="Show" className="v-seg">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  aria-pressed={activeTab === tab.id}
                  onClick={() => setActiveTab(tab.id)}
                >
                  {tab.label}
                  {!loading && <span className="n">{tab.count}</span>}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <Delayed onRetry={load}>
              <SkeletonList />
            </Delayed>
          ) : failed ? (
            <section className="v-card v-bf" style={{ "--i": 1 }}>
              <SectionError what="your events" onRetry={load} />
            </section>
          ) : isEmpty ? (
            <EmptyTab tab={activeTab} />
          ) : (
            <>
              {showNext && <NextUp item={nextUp} />}

              {rows.length > 0 && (
                <section aria-labelledby="list-title" className="v-bf flex flex-col gap-2.5" style={{ "--i": 2 }}>
                  <h2 id="list-title" className="v-h2 !text-[17px]">
                    {isUpcoming ? (showNext ? "Later" : "Coming up") : "Past events"}
                  </h2>
                  <div className="v-card flex flex-col p-1.5">
                    {rows.map((item, i) => (
                      <EventRow key={`${item.event?.slug}-${i}`} item={item} isPast={!isUpcoming} index={i} />
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </div>

        {!loading && pinTicket && <PinnedTicket item={nextUp} />}
      </div>
    </AppLayout>
  );
}
