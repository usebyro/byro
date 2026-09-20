"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import EventImageFallback from "@/components/ui/EventImageFallback";
import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon, MapPinIcon } from "@hugeicons/core-free-icons";
import API from "@/services/api";

const BASE_URL = (process.env.NEXT_PUBLIC_API_URL || "https://byro.onrender.com").replace(/\/api\/?$/, "");

const fmtNaira = (n) =>
  new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(n || 0);

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
  if (event.is_draft || event.is_active === false) return { label: "Draft", pill: "bg-gray-100 text-gray-600", dot: "bg-gray-400" };
  const diff = Math.ceil((day - now) / (1000 * 60 * 60 * 24));
  if (diff < 0)  return { label: "Past",          pill: "bg-gray-100 text-gray-600",   dot: "bg-gray-400" };
  if (diff <= 7) return { label: "Starting soon", pill: "bg-amber-50 text-amber-800",  dot: "bg-amber-500" };
  return               { label: "Live",           pill: "bg-green-50 text-green-800",  dot: "bg-green-500" };
}

function StatusPill({ status }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${status.pill}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
      {status.label}
    </span>
  );
}

function Thumb({ event, img }) {
  return (
    <div className="w-12 h-12 md:w-14 md:h-14 rounded-xl overflow-hidden shrink-0 relative bg-gray-100">
      {img ? (
        <Image src={img} alt="" fill className="object-cover" />
      ) : (
        <EventImageFallback category={event.category} />
      )}
    </div>
  );
}

// "3 of 50" with a fill bar, or "3 sold" when there is no capacity.
function TicketsCell({ sold, capacity }) {
  if (sold == null) return <span className="text-sm text-gray-500">—</span>;
  const pct = capacity > 0 ? Math.min(100, Math.round((sold / capacity) * 100)) : null;
  return (
    <div className="min-w-0">
      <p className="text-sm font-medium text-gray-900">
        {capacity > 0 ? `${sold} of ${capacity}` : `${sold} sold`}
      </p>
      {pct !== null && (
        <div className="mt-1.5 h-1 w-24 rounded-full bg-gray-100 overflow-hidden" role="presentation">
          <div className="h-full rounded-full bg-[#4F6EF7]" style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
}

function EventRow({ event, stats }) {
  const img = getImageUrl(event);
  const status = getEventStatus(event);
  const sold = stats ? stats.sold : null;
  const isFree = Boolean(stats?.is_free);
  const notOwner = stats?.is_owner === false; // co-hosts do not receive the revenue
  const revenue = stats && !notOwner ? fmtNaira(Number(stats.revenue)) : "—";
  const when = `${formatDate(event.day)}${event.time_from ? ` at ${formatTime(event.time_from)}` : ""}`;

  return (
    <Link
      href={`/dashboard/events/${event.slug}`}
      className="block px-4 md:px-5 py-4 hover:bg-gray-50 focus-visible:outline-none focus-visible:bg-gray-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#4F6EF7] transition-colors group"
    >
      <div className="grid grid-cols-[minmax(0,1fr)_auto] lg:grid-cols-[minmax(0,1fr)_130px_100px_130px_16px] items-center gap-x-4 gap-y-3">
        {/* Event: picture, name, when and where */}
        <div className="flex items-center gap-3.5 min-w-0">
          <Thumb event={event} img={img} />
          <div className="min-w-0">
            <p className="text-[15px] font-semibold text-gray-900 truncate group-hover:text-[#3B57D9] transition-colors">
              {event.name}
            </p>
            <p className="mt-0.5 text-sm text-gray-600 truncate">{when}</p>
            {event.location && (
              <p className="mt-0.5 flex items-center gap-1 text-sm text-gray-500 min-w-0">
                <HugeiconsIcon icon={MapPinIcon} size={13} color="currentColor" className="shrink-0" />
                <span className="truncate">{event.location}</span>
              </p>
            )}
          </div>
        </div>

        {/* Status: top right on phones, its own column on desktop */}
        <div className="lg:order-4 justify-self-end lg:justify-self-start">
          <StatusPill status={status} />
        </div>

        {/* Tickets and revenue: a quiet second line on phones, columns on desktop */}
        <div className="col-span-2 lg:col-span-1 lg:order-2 flex items-start justify-between gap-6 lg:block pl-[62px] lg:pl-0">
          <div>
            <p className="text-xs text-gray-500 lg:hidden mb-0.5">Tickets</p>
            <TicketsCell sold={sold} capacity={event.capacity} />
          </div>
          {!isFree && (
            <div className="lg:hidden text-right">
              <p className="text-xs text-gray-500 mb-0.5">Revenue</p>
              <p className="text-sm font-medium text-gray-900">{revenue}</p>
            </div>
          )}
        </div>
        <p className={`hidden lg:block lg:order-3 text-sm lg:text-right ${isFree ? "text-gray-500" : "font-medium text-gray-900"}`}>{isFree ? "Free" : revenue}</p>

        {/* Arrow */}
        <svg
          width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2"
          className="hidden lg:block lg:order-5 shrink-0 transition-transform group-hover:translate-x-0.5"
          aria-hidden="true"
        >
          <path d="M9 18l6-6-6-6" />
        </svg>
      </div>
    </Link>
  );
}

function SkeletonRow() {
  return (
    <div className="flex items-center gap-3.5 px-4 md:px-5 py-4 animate-pulse">
      <div className="w-12 h-12 md:w-14 md:h-14 rounded-xl bg-gray-100 shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="h-3.5 bg-gray-100 rounded w-2/5" />
        <div className="h-3 bg-gray-100 rounded w-1/3" />
        <div className="h-3 bg-gray-100 rounded w-1/4" />
      </div>
      <div className="h-6 w-16 bg-gray-100 rounded-full" />
    </div>
  );
}

export default function StudioEvents() {
  const [dashboard, setDashboard] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all"); // all | upcoming | past | draft

  useEffect(() => {
    document.title = "Events | Byro";
  }, []);

  useEffect(() => {
    Promise.allSettled([API.getDashboard(), API.getDashboardAnalytics()])
      .then(([d, a]) => {
        setDashboard(d.status === "fulfilled" ? d.value : null);
        setAnalytics(a.status === "fulfilled" ? a.value : null);
      })
      .finally(() => setLoading(false));
  }, []);

  const upcoming = dashboard?.hosting?.upcoming || [];
  const past     = dashboard?.hosting?.past || [];
  const allEvents = [
    ...upcoming.map((e) => ({ ...e, _group: "upcoming" })),
    ...past.map((e) => ({ ...e, _group: "past" })),
  ];

  const isDraft = (e) => Boolean(e.is_draft) || e.is_active === false;
  const matchesFilter = (e, f) =>
    f === "all" ||
    (f === "upcoming" && e._group === "upcoming" && !isDraft(e)) ||
    (f === "past" && e._group === "past" && !isDraft(e)) ||
    (f === "draft" && isDraft(e));

  const counts = Object.fromEntries(
    ["all", "upcoming", "past", "draft"].map((f) => [f, allEvents.filter((e) => matchesFilter(e, f)).length])
  );

  const filtered = allEvents.filter(
    (e) => (!search || e.name.toLowerCase().includes(search.toLowerCase())) && matchesFilter(e, filter)
  );

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Events</h1>
        <Link
          href="/dashboard/events/create"
          className="inline-flex items-center justify-center gap-1.5 bg-[#4F6EF7] text-white text-sm font-semibold px-4 min-h-[44px] md:min-h-0 md:py-2 rounded-lg hover:bg-blue-700 transition-colors shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#4F6EF7]"
        >
          <HugeiconsIcon icon={Add01Icon} size={15} color="white" />
          Create event
        </Link>
      </div>

      {/* Search + filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative w-full md:w-72">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
          </svg>
          <input
            type="search"
            aria-label="Search events"
            placeholder="Search events"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 md:py-2 bg-white border border-gray-200 rounded-lg text-base md:text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#4F6EF7] focus:ring-2 focus:ring-[#4F6EF7]/25"
          />
        </div>
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg" role="tablist" aria-label="Filter events">
          {["all", "upcoming", "past", "draft"].map((f) => (
            <button
              key={f}
              role="tab"
              aria-selected={filter === f}
              onClick={() => setFilter(f)}
              className={`px-3 min-h-[40px] md:min-h-0 md:py-1.5 rounded-md text-sm font-semibold capitalize transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4F6EF7] ${
                filter === f ? "bg-white text-gray-900 shadow-sm" : "text-gray-600 hover:text-gray-900"
              }`}
            >
              {f}
              {!loading && <span className={`ml-1.5 font-medium ${filter === f ? "text-gray-500" : "text-gray-400"}`}>{counts[f]}</span>}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {/* Column titles (desktop only) */}
        {!loading && filtered.length > 0 && (
          <div className="hidden lg:grid grid-cols-[minmax(0,1fr)_130px_100px_130px_16px] gap-x-4 px-5 py-2.5 border-b border-gray-200 bg-gray-50 text-sm font-medium text-gray-600">
            <span>Event</span>
            <span>Tickets</span>
            <span className="text-right">Revenue</span>
            <span>Status</span>
            <span />
          </div>
        )}

        {loading ? (
          <div className="divide-y divide-gray-100">
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-14 px-4">
            <p className="text-sm font-semibold text-gray-700">
              {search ? "No events match your search" : filter === "all" ? "No events yet" : `No ${filter} events`}
            </p>
            {!search && filter === "all" && (
              <>
                <p className="text-sm text-gray-500 mt-1">Create an event to start selling tickets.</p>
                <Link
                  href="/dashboard/events/create"
                  className="inline-block mt-4 bg-[#4F6EF7] text-white text-sm font-semibold py-2.5 px-5 rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Create your first event
                </Link>
              </>
            )}
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {filtered.map((event) => (
              <EventRow key={event.slug} event={event} stats={analytics?.events?.[event.slug]} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
