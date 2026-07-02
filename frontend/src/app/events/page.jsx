"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Calendar01Icon,
  MapPinIcon,
  Search01Icon,
  Ticket01Icon,
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

const CATEGORY_GRADIENT = {
  entertainment: "from-purple-600 to-pink-500",
  fitness:       "from-orange-500 to-amber-400",
  art_culture:   "from-pink-600 to-rose-400",
  conference:    "from-teal-600 to-emerald-400",
  technology:    "from-indigo-600 to-violet-500",
  web3_crypto:   "from-amber-600 to-orange-400",
  other:         "from-gray-500 to-slate-400",
};

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

// Deterministic QR-like visual from a seed string
function QRVisual({ seed = "" }) {
  const s = seed.replace(/-/g, "");
  const cells = Array.from({ length: 25 }, (_, i) => {
    const c = s.charCodeAt(i % Math.max(s.length, 1)) || 0;
    return ((c >> (i % 8)) & 1) === 1;
  });
  return (
    <div className="grid gap-px p-1 bg-white border border-gray-200 rounded" style={{ gridTemplateColumns: "repeat(5, 7px)" }}>
      {cells.map((on, i) => (
        <div key={i} style={{ width: 7, height: 7, borderRadius: 1, background: on ? "#0f172a" : "#f1f5f9" }} />
      ))}
    </div>
  );
}

function shortRef(id) {
  if (!id) return "";
  const clean = String(id).toUpperCase().replace(/-/g, "");
  return `${clean.slice(0, 3)}-${clean.slice(3, 7)}-${clean.slice(7, 11)}`;
}

function EventRow({ item, isPast }) {
  const { event, role, ticketId, ticketCount } = item;
  const imageUrl = getImageUrl(event);
  const gradient = CATEGORY_GRADIENT[event.category] || CATEGORY_GRADIENT.other;
  const daysLabel = getDaysLabel(event.day);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 flex overflow-hidden hover:shadow-sm transition-shadow">
      {/* Thumbnail */}
      <div className="w-24 sm:w-28 shrink-0 relative self-stretch">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={event.name}
            fill
            className="object-cover"
            onError={(e) => { e.currentTarget.style.display = "none"; }}
          />
        ) : (
          <div className={`w-full h-full bg-gradient-to-br ${gradient}`} />
        )}
      </div>

      {/* Info */}
      <div className="flex-1 px-4 py-3.5 min-w-0">
        {/* Badges */}
        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
          {!isPast && daysLabel && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-100">
              • {daysLabel}
            </span>
          )}
          {isPast && (
            <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full border border-teal-200 text-teal-600">
              ATTENDED
            </span>
          )}
          {role === "hosting" && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-50 text-violet-600 border border-violet-100">
              HOSTING
            </span>
          )}
          {ticketCount != null && (
            <span className="text-[11px] text-gray-400">
              {ticketCount} ticket{ticketCount !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        {/* Event name */}
        <h3 className="font-bold text-gray-900 text-sm leading-snug mb-2 line-clamp-1">
          {event.name}
        </h3>

        {/* Date + location */}
        <div className="flex items-center gap-3 text-xs text-gray-400 flex-wrap">
          <span className="flex items-center gap-1">
            <HugeiconsIcon icon={Calendar01Icon} size={11} color="#9ca3af" />
            {formatDate(event.day)}
          </span>
          {event.location && (
            <span className="flex items-center gap-1 min-w-0">
              <HugeiconsIcon icon={MapPinIcon} size={11} color="#9ca3af" />
              <span className="truncate">{event.location}</span>
            </span>
          )}
        </div>
      </div>

      {/* Right: QR / status */}
      <div className="w-24 shrink-0 flex flex-col items-center justify-center border-l-2 border-dashed border-gray-100 py-3 px-2 gap-1.5">
        {isPast ? (
          <>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="2" strokeLinecap="round">
              <path d="M20 6L9 17l-5-5" />
            </svg>
            <span className="text-[10px] text-gray-400">Used</span>
          </>
        ) : ticketId ? (
          <>
            <QRVisual seed={ticketId} />
            <span className="text-[9px] text-gray-400 font-mono text-center leading-tight mt-0.5">
              {shortRef(ticketId)}
            </span>
          </>
        ) : role === "hosting" ? (
          <Link
            href={`/dashboard/events/${event.slug}`}
            className="flex flex-col items-center gap-1 text-blue-600 hover:text-blue-700 text-center"
          >
            <span className="text-[11px] font-extrabold tracking-wide">Manage</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </Link>
        ) : null}
      </div>
    </div>
  );
}

function SkeletonRow() {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 flex overflow-hidden animate-pulse" style={{ height: 88 }}>
      <div className="w-24 sm:w-28 bg-gray-100 shrink-0" />
      <div className="flex-1 px-4 py-3.5 space-y-2.5">
        <div className="h-3 bg-gray-100 rounded w-24" />
        <div className="h-4 bg-gray-100 rounded w-3/4" />
        <div className="h-3 bg-gray-100 rounded w-1/2" />
      </div>
      <div className="w-24 border-l-2 border-dashed border-gray-100" />
    </div>
  );
}

function EmptyTab({ tab }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-14 h-14 bg-gray-100 rounded-2xl flex items-center justify-center mb-4">
        <HugeiconsIcon icon={Ticket01Icon} size={24} color="#d1d5db" />
      </div>
      <p className="text-gray-700 font-semibold text-sm mb-1">
        {tab === "upcoming"
          ? "No upcoming events"
          : tab === "past"
          ? "No past events"
          : "No saved events"}
      </p>
      <p className="text-gray-400 text-xs max-w-xs">
        {tab === "upcoming"
          ? "Events you're hosting or attending will appear here"
          : tab === "past"
          ? "Events you've attended will appear here"
          : "Save events you're interested in to find them easily"}
      </p>
    </div>
  );
}

export default function EventsPage() {
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
    { id: "saved",    label: "Saved",    count: 0 },
  ];

  const currentItems = activeTab === "upcoming"
    ? upcomingItems
    : activeTab === "past"
    ? pastItems
    : [];

  return (
    <AppLayout>
      <div className="min-h-screen bg-[#F1F5F9]">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">

          {/* Top bar */}
          <div className="flex items-center justify-end mb-6">
            <Link
              href="/discover"
              className="flex items-center gap-2 bg-[#1F6BFF] text-white text-sm font-semibold px-4 py-2.5 rounded-xl hover:bg-blue-700 transition-colors"
            >
              <HugeiconsIcon icon={Search01Icon} size={14} color="white" />
              Find an event
            </Link>
          </div>

          {/* Tabs */}
          <div className="flex gap-6 border-b border-gray-200 mb-5">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`pb-3 text-sm font-semibold flex items-center gap-1.5 border-b-2 -mb-px transition-colors ${
                  activeTab === tab.id
                    ? "border-[#1F6BFF] text-gray-900"
                    : "border-transparent text-gray-400 hover:text-gray-600"
                }`}
              >
                {tab.label}
                {!loading && (
                  <span className={`text-xs font-bold ${
                    activeTab === tab.id ? "text-[#1F6BFF]" : "text-gray-300"
                  }`}>
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Content */}
          {loading ? (
            <div className="space-y-3">
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
            </div>
          ) : currentItems.length === 0 ? (
            <EmptyTab tab={activeTab} />
          ) : (
            <div className="space-y-3">
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
