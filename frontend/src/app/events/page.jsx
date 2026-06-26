"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Calendar01Icon,
  MapPinIcon,
  Settings01Icon,
  Add01Icon,
  Ticket01Icon,
} from "@hugeicons/core-free-icons";
import AppLayout from "@/layout/app";
import API from "@/services/api";

const BASE_URL = (process.env.NEXT_PUBLIC_API_URL || "https://byro.onrender.com").replace(/\/api\/?$/, "");

function formatDate(dateStr) {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

const CATEGORY_META = {
  entertainment: { label: "Concerts", bg: "bg-purple-100", text: "text-purple-700", gradient: "from-purple-600 to-pink-500" },
  fitness:       { label: "Sports",      bg: "bg-orange-100", text: "text-orange-700", gradient: "from-orange-500 to-amber-400" },
  art_culture:   { label: "Nightlife",   bg: "bg-pink-100",   text: "text-pink-700",   gradient: "from-pink-600 to-rose-400" },
  conference:    { label: "Conferences", bg: "bg-teal-100",   text: "text-teal-700",   gradient: "from-teal-600 to-emerald-400" },
  technology:    { label: "Tech",        bg: "bg-indigo-100", text: "text-indigo-700", gradient: "from-indigo-600 to-violet-500" },
  web3_crypto:   { label: "Web3",        bg: "bg-amber-100",  text: "text-amber-700",  gradient: "from-amber-600 to-orange-400" },
  other:         { label: "Other",       bg: "bg-gray-100",   text: "text-gray-600",   gradient: "from-gray-500 to-slate-400" },
};

function EventCard({ event, isOwner }) {
  const imageUrl =
    event.event_image_url ||
    (event.event_image?.startsWith("http")
      ? event.event_image
      : event.event_image
      ? `${BASE_URL}${event.event_image}`
      : null);

  const meta = CATEGORY_META[event.category] || CATEGORY_META.other;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-md transition-shadow flex flex-col">
      {/* Cover */}
      <div className="relative h-36 bg-gray-100 shrink-0">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={event.name}
            fill
            className="object-cover"
            onError={(e) => { e.currentTarget.style.display = "none"; }}
          />
        ) : (
          <div className={`w-full h-full bg-gradient-to-br ${meta.gradient}`} />
        )}
        <span className={`absolute top-3 left-3 text-[10px] font-bold px-2 py-1 rounded-full ${meta.bg} ${meta.text}`}>
          {meta.label}
        </span>
      </div>

      {/* Body */}
      <div className="p-4 flex flex-col flex-1">
        <h3 className="font-bold text-gray-900 text-sm leading-snug mb-2 line-clamp-2">{event.name}</h3>

        <div className="space-y-1.5 mb-4 flex-1">
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <HugeiconsIcon icon={Calendar01Icon} size={12} color="#9ca3af" />
            {formatDate(event.day)}
          </div>
          {event.location && (
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              <HugeiconsIcon icon={MapPinIcon} size={12} color="#9ca3af" />
              <span className="truncate">{event.location}</span>
            </div>
          )}
        </div>

        {isOwner ? (
          <Link
            href={`/dashboard/${event.slug}`}
            className="flex items-center justify-center gap-1.5 w-full bg-[#1F6BFF] text-white text-xs font-semibold py-2.5 rounded-xl hover:bg-blue-700 transition-colors"
          >
            <HugeiconsIcon icon={Settings01Icon} size={12} color="white" />
            Manage Event
          </Link>
        ) : (
          <Link
            href={`/${event.slug}`}
            className="flex items-center justify-center w-full bg-blue-50 text-[#1F6BFF] text-xs font-semibold py-2.5 rounded-xl hover:bg-blue-100 transition-colors"
          >
            View Event
          </Link>
        )}
      </div>
    </div>
  );
}

function EmptyState({ isOwner }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center col-span-full">
      <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mb-4">
        <HugeiconsIcon icon={isOwner ? Settings01Icon : Ticket01Icon} size={28} color="#d1d5db" />
      </div>
      <p className="text-gray-600 font-semibold text-sm mb-1">
        {isOwner ? "No events yet" : "No events attended"}
      </p>
      <p className="text-gray-400 text-xs max-w-xs">
        {isOwner
          ? "Create your first event and start selling tickets"
          : "Events you register for will show up here"}
      </p>
      {isOwner && (
        <Link
          href="/events/create"
          className="mt-5 inline-flex items-center gap-2 bg-[#1F6BFF] text-white text-sm font-semibold px-5 py-2.5 rounded-xl hover:bg-blue-700 transition-colors"
        >
          <HugeiconsIcon icon={Add01Icon} size={14} color="white" />
          Create Event
        </Link>
      )}
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden animate-pulse">
      <div className="h-36 bg-gray-100" />
      <div className="p-4 space-y-2.5">
        <div className="h-4 bg-gray-100 rounded w-3/4" />
        <div className="h-3 bg-gray-100 rounded w-1/2" />
        <div className="h-3 bg-gray-100 rounded w-2/5" />
        <div className="h-9 bg-gray-100 rounded-xl mt-1" />
      </div>
    </div>
  );
}

function EventGrid({ upcoming, past, isOwner }) {
  const hasAny = upcoming?.length || past?.length;
  if (!hasAny) return <EmptyState isOwner={isOwner} />;

  return (
    <>
      {upcoming?.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500">Upcoming</h2>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-600">
              {upcoming.length}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {upcoming.map((ev) => (
              <EventCard key={ev.slug} event={ev} isOwner={isOwner} />
            ))}
          </div>
        </div>
      )}

      {past?.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400">Past</h2>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-400">
              {past.length}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 opacity-70">
            {past.map((ev) => (
              <EventCard key={ev.slug} event={ev} isOwner={isOwner} />
            ))}
          </div>
        </div>
      )}
    </>
  );
}

export default function EventsPage() {
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("hosting");

  useEffect(() => {
    API.getDashboard()
      .then(setDashboard)
      .catch(() => setDashboard(null))
      .finally(() => setLoading(false));
  }, []);

  const hostingUpcoming  = dashboard?.hosting?.upcoming || [];
  const hostingPast      = dashboard?.hosting?.past || [];
  const attendingUpcoming = dashboard?.attending?.upcoming?.map(t => t.event) || [];
  const attendingPast    = dashboard?.attending?.past?.map(t => t.event) || [];

  const totalHosting   = hostingUpcoming.length + hostingPast.length;
  const totalAttending = attendingUpcoming.length + attendingPast.length;

  const tabs = [
    { id: "hosting",   label: "Hosting",   count: totalHosting },
    { id: "attending", label: "Attending", count: totalAttending },
  ];

  return (
    <AppLayout>
      <div className="min-h-screen bg-[#F5F6FA]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">

          {/* ── Header ── */}
          <div className="flex items-start justify-between mb-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-1">My Events</h1>
              <p className="text-sm text-gray-400">Manage the events you host and attend</p>
            </div>
            <Link
              href="/events/create"
              className="flex items-center gap-2 bg-[#1F6BFF] text-white text-sm font-semibold px-5 py-2.5 rounded-xl hover:bg-blue-700 transition-colors shrink-0"
            >
              <HugeiconsIcon icon={Add01Icon} size={14} color="white" />
              Create Event
            </Link>
          </div>

          {/* ── Stats ── */}
          {!loading && (
            <div className="flex gap-3 mb-6 flex-wrap">
              <div className="flex items-center gap-3 bg-white border border-gray-100 px-4 py-3 rounded-xl shadow-sm">
                <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center shrink-0">
                  <HugeiconsIcon icon={Settings01Icon} size={15} color="#2563eb" />
                </div>
                <div>
                  <p className="text-xl font-bold text-gray-900 leading-none">{totalHosting}</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">Events hosted</p>
                </div>
              </div>
              <div className="flex items-center gap-3 bg-white border border-gray-100 px-4 py-3 rounded-xl shadow-sm">
                <div className="w-8 h-8 bg-violet-50 rounded-lg flex items-center justify-center shrink-0">
                  <HugeiconsIcon icon={Ticket01Icon} size={15} color="#7c3aed" />
                </div>
                <div>
                  <p className="text-xl font-bold text-gray-900 leading-none">{totalAttending}</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">Events attending</p>
                </div>
              </div>
            </div>
          )}

          {/* ── Tabs ── */}
          <div className="flex gap-1 bg-white border border-gray-100 p-1 rounded-xl w-fit shadow-sm mb-6">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-5 py-2 rounded-lg text-sm font-semibold transition-colors ${
                  activeTab === tab.id
                    ? "bg-[#1F6BFF] text-white shadow-sm"
                    : "text-gray-500 hover:text-gray-800"
                }`}
              >
                {tab.label}
                {!loading && (
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                    activeTab === tab.id
                      ? "bg-white/25 text-white"
                      : "bg-gray-100 text-gray-500"
                  }`}>
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* ── Content ── */}
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </div>
          ) : activeTab === "hosting" ? (
            <EventGrid
              upcoming={hostingUpcoming}
              past={hostingPast}
              isOwner={true}
            />
          ) : (
            <EventGrid
              upcoming={attendingUpcoming}
              past={attendingPast}
              isOwner={false}
            />
          )}
        </div>
      </div>
    </AppLayout>
  );
}
