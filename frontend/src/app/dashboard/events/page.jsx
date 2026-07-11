"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon, Calendar01Icon, MapPinIcon, Search01Icon } from "@hugeicons/core-free-icons";
import API from "@/services/api";

const BASE_URL = (process.env.NEXT_PUBLIC_API_URL || "https://byro.onrender.com").replace(/\/api\/?$/, "");

const CATEGORY_GRADIENT = {
  entertainment: "from-purple-600 to-pink-500",
  fitness:       "from-orange-500 to-amber-400",
  art_culture:   "from-pink-600 to-rose-400",
  conference:    "from-teal-600 to-emerald-400",
  technology:    "from-blue-600 to-violet-500",
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

function formatDate(d) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-US", { weekday: "short", day: "numeric", month: "short" });
}

function formatTime(t) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

function getEventStatus(event) {
  const now = new Date();
  const day = new Date(event.day);
  if (event.is_active === false) return { label: "DRAFT", bg: "bg-gray-100", text: "text-gray-500" };
  const diff = Math.ceil((day - now) / (1000 * 60 * 60 * 24));
  if (diff < 0) return { label: "PAST", bg: "bg-gray-100", text: "text-gray-400" };
  if (diff <= 7) return { label: "SOON", bg: "bg-amber-50", text: "text-amber-600" };
  return { label: "LIVE", bg: "bg-green-50", text: "text-green-600" };
}

function EventRow({ event }) {
  const img = getImageUrl(event);
  const grad = CATEGORY_GRADIENT[event.category] || CATEGORY_GRADIENT.other;
  const status = getEventStatus(event);

  return (
    <Link
      href={`/dashboard/events/${event.slug}`}
      className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors group"
    >
      {/* Thumbnail */}
      <div className="w-9 h-9 rounded-lg overflow-hidden shrink-0 relative bg-gray-50 border border-gray-100/50">
        {img ? (
          <Image src={img} alt={event.name} fill className="object-cover" />
        ) : (
          <div className={`w-full h-full bg-gradient-to-br ${grad}`} />
        )}
      </div>

      {/* Name + meta */}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold text-gray-800 truncate group-hover:text-[#4F6EF7] transition-colors">
          {event.name}
        </p>
        <div className="flex items-center gap-3 mt-0.5 text-[11px] text-gray-400">
          <span className="flex items-center gap-1">
            <HugeiconsIcon icon={Calendar01Icon} size={11} color="#9ca3af" />
            {formatDate(event.day)}
            {event.time_from && ` · ${formatTime(event.time_from)}`}
          </span>
          {event.location && (
            <span className="flex items-center gap-1 truncate hidden sm:flex">
              <HugeiconsIcon icon={MapPinIcon} size={11} color="#9ca3af" />
              {event.location}
            </span>
          )}
        </div>
      </div>

      {/* Status */}
      <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md ${status.bg} ${status.text} shrink-0 w-14 justify-center`}>
        {status.label}
      </span>

      {/* Arrow */}
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" className="shrink-0 transition-transform group-hover:translate-x-0.5">
        <path d="M9 18l6-6-6-6" />
      </svg>
    </Link>
  );
}

function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 animate-pulse">
      <div className="w-9 h-9 rounded-lg bg-gray-100 shrink-0" />
      <div className="flex-1 space-y-1.5">
        <div className="h-3 bg-gray-100 rounded w-2/5" />
        <div className="h-2.5 bg-gray-100 rounded w-1/3" />
      </div>
      <div className="h-5 w-12 bg-gray-100 rounded-md" />
    </div>
  );
}

export default function StudioEvents() {
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all"); // all | upcoming | past | draft

  useEffect(() => {
    API.getDashboard()
      .then(setDashboard)
      .catch(() => setDashboard(null))
      .finally(() => setLoading(false));
  }, []);

  const upcoming = dashboard?.hosting?.upcoming || [];
  const past     = dashboard?.hosting?.past || [];
  const allEvents = [
    ...upcoming.map((e) => ({ ...e, _group: "upcoming" })),
    ...past.map((e) => ({ ...e, _group: "past" })),
  ];

  const filtered = allEvents.filter((e) => {
    const matchSearch = !search || e.name.toLowerCase().includes(search.toLowerCase());
    const matchFilter =
      filter === "all" ||
      (filter === "upcoming" && e._group === "upcoming") ||
      (filter === "past" && e._group === "past") ||
      (filter === "draft" && !e.is_active);
    return matchSearch && matchFilter;
  });

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 pb-2 border-b border-gray-100/50">
        <h1 className="text-xl font-bold text-gray-900">Events</h1>
        <Link
          href="/events/create"
          className="flex items-center justify-center gap-1.5 bg-[#4F6EF7] text-white text-xs font-semibold px-3.5 py-2 rounded-lg hover:bg-blue-700 transition-colors shrink-0 shadow-sm shadow-[#4F6EF7]/10"
        >
          <HugeiconsIcon icon={Add01Icon} size={13} color="white" />
          Create event
        </Link>
      </div>

      {/* Search + filters */}
      <div className="flex items-center gap-2.5 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
          </svg>
          <input
            type="search"
            placeholder="Search events..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-4 py-1.5 bg-gray-50 border border-gray-100/80 rounded-lg text-xs text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#4F6EF7]/20 transition-all"
          />
        </div>
        <div className="flex gap-0.5 bg-white border border-gray-100/80 p-0.5 rounded-lg">
          {["all", "upcoming", "past", "draft"].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-2.5 py-1 rounded-md text-xs font-semibold capitalize transition-all ${
                filter === f
                  ? "bg-[#4F6EF7] text-white shadow-sm shadow-[#4F6EF7]/10"
                  : "text-gray-500 hover:text-gray-800"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="bg-white rounded-xl border border-gray-100/80 shadow-sm overflow-hidden">
        {loading ? (
          <div className="divide-y divide-gray-50">
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-xs text-gray-400 mb-2">
              {search ? "No events match your search" : "No events yet"}
            </p>
            {!search && (
              <Link href="/events/create" className="text-xs font-bold text-[#4F6EF7] hover:text-blue-700">
                Create your first event
              </Link>
            )}
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {filtered.map((event) => (
              <EventRow key={event.slug} event={event} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
