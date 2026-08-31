"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { QrCodeIcon, Calendar01Icon, MapPinIcon } from "@hugeicons/core-free-icons";
import { toast } from "sonner";
import API from "@/services/api";

function formatDate(d) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-US", { weekday: "short", day: "numeric", month: "short" });
}

export default function StudioCheckIn() {
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    document.title = "Check-in | Byro";
  }, []);

  useEffect(() => {
    API.getDashboard()
      .then(setDashboard)
      .catch(() => setDashboard(null))
      .finally(() => setLoading(false));
  }, []);

  const upcoming = dashboard?.hosting?.upcoming || [];

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-4">
      <div className="pb-2 border-b border-gray-100/50">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Check-in</h1>
        <p className="text-xs text-gray-450 mt-0.5">Select an event to start checking in attendees.</p>
      </div>

      {loading ? (
        <div className="space-y-2.5">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-100/80 p-3.5 flex items-center gap-3 animate-pulse">
              <div className="w-10 h-10 rounded-lg bg-gray-105 shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3.5 bg-gray-105 rounded w-1/3" />
                <div className="h-2.5 bg-gray-105 rounded w-1/4" />
              </div>
              <div className="h-6 w-20 bg-gray-105 rounded-lg" />
            </div>
          ))}
        </div>
      ) : upcoming.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-10 text-center shadow-sm">
          <div className="w-12 h-12 bg-gray-50 rounded-xl flex items-center justify-center mx-auto mb-3">
            <HugeiconsIcon icon={QrCodeIcon} size={20} color="#9ca3af" />
          </div>
          <p className="text-xs text-gray-550 font-bold mb-0.5">No upcoming events</p>
          <p className="text-[11px] text-gray-400">Create an event to start checking in attendees</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {upcoming.map((event) => (
            <Link
              key={event.slug}
              href={`/dashboard/events/${event.slug}`}
              className="bg-white rounded-xl border border-gray-100/80 p-3 flex items-center gap-3 hover:shadow-sm hover:border-[#4F6EF7]/30 transition-all duration-200 group"
            >
              <div className="w-10 h-10 rounded-lg bg-indigo-50 text-[#4F6EF7] flex items-center justify-center shrink-0 group-hover:bg-[#4F6EF7]/10 transition-colors">
                <HugeiconsIcon icon={QrCodeIcon} size={20} color="currentColor" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs sm:text-sm font-bold text-gray-800 truncate group-hover:text-[#4F6EF7] transition-colors">
                  {event.name}
                </p>
                <div className="flex items-center gap-3 mt-0.5 text-[10px] sm:text-xs text-gray-400">
                  <span className="flex items-center gap-1">
                    <HugeiconsIcon icon={Calendar01Icon} size={11} color="#9ca3af" />
                    {formatDate(event.day)}
                  </span>
                  {event.location && (
                    <span className="flex items-center gap-1 truncate">
                      <HugeiconsIcon icon={MapPinIcon} size={11} color="#9ca3af" />
                      {event.location}
                    </span>
                  )}
                </div>
              </div>
              <span className="text-[11px] font-bold text-[#4F6EF7] bg-indigo-50/50 px-2.5 py-1.5 rounded-lg shrink-0 group-hover:bg-[#4F6EF7] group-hover:text-white transition-all duration-250">
                Start check-in →
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
