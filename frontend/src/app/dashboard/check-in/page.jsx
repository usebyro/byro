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
    API.getDashboard()
      .then(setDashboard)
      .catch(() => setDashboard(null))
      .finally(() => setLoading(false));
  }, []);

  const upcoming = dashboard?.hosting?.upcoming || [];

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-7">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Check-in</h1>
        <p className="text-sm text-gray-400">Select an event to start checking in attendees.</p>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-2xl border border-gray-100 p-4 flex items-center gap-4 animate-pulse">
              <div className="w-12 h-12 rounded-xl bg-gray-100" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-gray-100 rounded w-1/3" />
                <div className="h-3 bg-gray-100 rounded w-1/4" />
              </div>
            </div>
          ))}
        </div>
      ) : upcoming.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
          <div className="w-14 h-14 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <HugeiconsIcon icon={QrCodeIcon} size={24} color="#d1d5db" />
          </div>
          <p className="text-sm text-gray-500 font-semibold mb-1">No upcoming events</p>
          <p className="text-xs text-gray-400">Create an event to start checking in attendees</p>
        </div>
      ) : (
        <div className="space-y-3">
          {upcoming.map((event) => (
            <Link
              key={event.slug}
              href={`/dashboard/events/${event.slug}`}
              className="bg-white rounded-2xl border border-gray-100 p-4 flex items-center gap-4 hover:shadow-sm hover:border-blue-100 transition-all group"
            >
              <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center shrink-0 group-hover:bg-blue-100 transition-colors">
                <HugeiconsIcon icon={QrCodeIcon} size={22} color="#6366f1" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate group-hover:text-blue-600 transition-colors">
                  {event.name}
                </p>
                <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-400">
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
              <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-3 py-1.5 rounded-xl shrink-0 group-hover:bg-blue-100 transition-colors">
                Start check-in →
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
