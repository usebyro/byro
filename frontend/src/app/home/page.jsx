"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import EventImageFallback from "@/components/ui/EventImageFallback";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Calendar01Icon,
  MapPinIcon,
  CompassIcon,
} from "@hugeicons/core-free-icons";
import AppLayout from "@/layout/app";
import API from "@/services/api";

const BASE_URL = (process.env.NEXT_PUBLIC_API_URL || "https://byro.onrender.com").replace(/\/api\/?$/, "");

function formatDate(dateStr) {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleDateString("en-US", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function formatTime(t) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

function getDaysLabel(dateStr) {
  if (!dateStr) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const eventDate = new Date(dateStr);
  eventDate.setHours(0, 0, 0, 0);
  const diff = Math.round((eventDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diff < 0) return null;
  if (diff === 0) return "TODAY";
  if (diff === 1) return "TOMORROW";
  return `IN ${diff} DAYS`;
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

function EventRow({ item, isPast }) {
  const { event, role, ticketId, ticketCount } = item;
  const imageUrl = getImageUrl(event);
  const daysLabel = getDaysLabel(event.day);
  const daysText = daysLabel ? daysLabel.charAt(0) + daysLabel.slice(1).toLowerCase() : null; // "In 14 days"
  const when = `${formatDate(event.day)}${event.time_from ? ` at ${formatTime(event.time_from)}` : ""}`;

  // Hosts manage the event; attendees open their ticket (or the event page once it's over).
  const href =
    role === "hosting"
      ? `/dashboard/events/${event.slug}`
      : !isPast && ticketId
      ? `/ticket/${ticketId}`
      : `/discover/${event.slug}`;

  const chips = (
    <>
      {!isPast && daysText && (
        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-50 text-blue-800 whitespace-nowrap">
          {daysText}
        </span>
      )}
      {isPast && (
        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-gray-100 text-gray-700 whitespace-nowrap">
          {role === "hosting" ? "Hosted" : "Attended"}
        </span>
      )}
      {role === "hosting" && !isPast && (
        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-violet-50 text-violet-800 whitespace-nowrap">
          Hosting
        </span>
      )}
      {ticketCount != null && (
        <span className="text-xs text-gray-600 whitespace-nowrap">
          {ticketCount} ticket{ticketCount !== 1 ? "s" : ""}
        </span>
      )}
    </>
  );

  return (
    <Link
      href={href}
      className="group flex items-center gap-4 px-4 md:px-5 py-4 hover:bg-gray-50 focus-visible:outline-none focus-visible:bg-gray-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#4F6EF7] transition-colors"
    >
      {/* Thumbnail */}
      <div className="w-14 h-14 md:w-16 md:h-16 rounded-xl overflow-hidden shrink-0 relative bg-gray-100">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt=""
            fill
            className="object-cover"
            onError={(e) => { e.currentTarget.style.display = "none"; }}
          />
        ) : (
          <EventImageFallback category={event.category} />
        )}
      </div>

      {/* Name, when, where */}
      <div className="flex-1 min-w-0">
        <h3 className="text-base font-semibold text-gray-900 leading-snug truncate group-hover:text-[#3B57D9] transition-colors">
          {event.name}
        </h3>
        <p className="mt-0.5 text-sm text-gray-600 truncate">{when}</p>
        {event.location && (
          <p className="mt-0.5 flex items-center gap-1 text-sm text-gray-500 min-w-0">
            <HugeiconsIcon icon={MapPinIcon} size={13} color="currentColor" className="shrink-0" />
            <span className="truncate">{event.location}</span>
          </p>
        )}
        {/* Phones: chips sit under the text */}
        <div className="md:hidden mt-2 flex items-center gap-2 flex-wrap">{chips}</div>
      </div>

      {/* Tablet and up: chips on the right */}
      <div className="hidden md:flex items-center gap-2 shrink-0">{chips}</div>

      <svg
        width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round"
        className="shrink-0 text-gray-400 group-hover:text-gray-600 transition-colors"
        aria-hidden="true"
      >
        <path d="M9 18l6-6-6-6" />
      </svg>
    </Link>
  );
}

function SkeletonRow() {
  return (
    <div className="flex items-center gap-4 px-4 md:px-5 py-4 animate-pulse">
      <div className="w-14 h-14 md:w-16 md:h-16 rounded-xl bg-gray-100 shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="h-4 bg-gray-100 rounded w-1/2" />
        <div className="h-3 bg-gray-100 rounded w-1/3" />
        <div className="h-3 bg-gray-100 rounded w-1/4" />
      </div>
      <div className="hidden md:block h-6 w-20 bg-gray-100 rounded-full" />
    </div>
  );
}

const EMPTY_STATE = {
  upcoming: {
    icon: Calendar01Icon,
    title: "No upcoming events",
    subtitle: "Create an event of your own or discover one to attend.",
    actions: true,
  },
  past: {
    icon: Calendar01Icon,
    title: "No past events",
    subtitle: "Events you've attended will appear here.",
    actions: false,
  },
};

function EmptyTab({ tab }) {
  const { icon, title, subtitle, actions } = EMPTY_STATE[tab];

  return (
    <div className="border-2 border-dashed border-gray-200 rounded-3xl py-20 px-6 flex flex-col items-center justify-center text-center">
      <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mb-5">
        <HugeiconsIcon icon={icon} size={26} color="#9ca3af" />
      </div>
      <p className="text-gray-900 font-bold text-lg mb-1.5">{title}</p>
      <p className="text-gray-400 text-sm max-w-xs mb-6">{subtitle}</p>
      {actions && (
        <div className="flex items-center gap-3 flex-wrap justify-center">
          <Link
            href="/events/create"
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm px-5 py-3 rounded-full transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Create event
          </Link>
          <Link
            href="/discover"
            className="inline-flex items-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-sm px-5 py-3 rounded-full transition-colors"
          >
            <HugeiconsIcon icon={CompassIcon} size={15} color="currentColor" />
            Discover events
          </Link>
        </div>
      )}
    </div>
  );
}

export default function HomePage() {
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("upcoming");

  useEffect(() => {
    API.getDashboard()
      .then(setDashboard)
      .catch(() => setDashboard(null))
      .finally(() => setLoading(false));
  }, []);

  const hostingUpcoming  = dashboard?.hosting?.upcoming || [];
  const hostingPast      = dashboard?.hosting?.past || [];
  const attendingUpcoming = dashboard?.attending?.upcoming || [];
  const attendingPast    = dashboard?.attending?.past || [];

  // Merge hosting + attending, deduplicate by slug, sort by date
  const seenUp = new Set();
  const upcomingItems = [
    ...hostingUpcoming.map(e => ({ event: e, role: "hosting", ticketId: null, ticketCount: null })),
    ...attendingUpcoming.map(t => ({
      event: t.event,
      role: "attending",
      ticketId: t.ticket_id || t.id,
      ticketCount: t.quantity || 1,
    })),
  ]
    .sort((a, b) => new Date(a.event?.day) - new Date(b.event?.day))
    .filter(({ event }) => {
      if (!event?.slug || seenUp.has(event.slug)) return false;
      seenUp.add(event.slug);
      return true;
    });

  const seenPast = new Set();
  const pastItems = [
    ...hostingPast.map(e => ({ event: e, role: "hosting", ticketId: null, ticketCount: null })),
    ...attendingPast.map(t => ({
      event: t.event,
      role: "attending",
      ticketId: t.ticket_id || t.id,
      ticketCount: t.quantity || 1,
    })),
  ]
    .sort((a, b) => new Date(b.event?.day) - new Date(a.event?.day))
    .filter(({ event }) => {
      if (!event?.slug || seenPast.has(event.slug)) return false;
      seenPast.add(event.slug);
      return true;
    });

  const tabs = [
    { id: "upcoming", label: "Upcoming", count: upcomingItems.length },
    { id: "past",     label: "Past",     count: pastItems.length },
  ];

  const currentItems = activeTab === "upcoming"
    ? upcomingItems
    : activeTab === "past"
    ? pastItems
    : [];

  return (
    <AppLayout>
      <div className="min-h-screen bg-white">
        <div className="max-w-3xl mx-auto px-4 md:px-6 py-6 md:py-8">

          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-6">
            <div>
              <h1 className="text-3xl md:text-4xl font-bold text-gray-900 tracking-tight mb-1">
                Your events
              </h1>
              <p className="text-gray-600 text-[15px] md:text-base">
                Events you are attending or hosting, all in one place.
              </p>
            </div>

            {/* Tabs */}
            <div className="flex md:inline-flex items-center gap-1 bg-gray-100 rounded-full p-1 md:self-start" role="tablist" aria-label="Your events">
              {tabs.map(tab => (
                <button
                  key={tab.id}
                  role="tab"
                  aria-selected={activeTab === tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex-1 md:flex-none px-4 min-h-[44px] md:min-h-0 md:py-2 rounded-full text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4F6EF7] ${
                    activeTab === tab.id
                      ? "bg-white text-gray-900 shadow-sm"
                      : "text-gray-600 hover:text-gray-900"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Content */}
          {loading ? (
            <div className="bg-white rounded-2xl border border-gray-200 divide-y divide-gray-100 overflow-hidden">
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
            </div>
          ) : currentItems.length === 0 ? (
            <EmptyTab tab={activeTab} />
          ) : (
            <div className="bg-white rounded-2xl border border-gray-200 divide-y divide-gray-100 overflow-hidden">
              {currentItems.map((item, i) => (
                <EventRow
                  key={`${item.event?.slug}-${i}`}
                  item={item}
                  isPast={activeTab === "past"}
                />
              ))}
            </div>
          )}

        </div>
      </div>
    </AppLayout>
  );
}
