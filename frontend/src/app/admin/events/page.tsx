"use client";

import { useEffect, useState } from "react";
import axiosInstance from "@/utils/axios";

interface Event {
  id: number;
  slug: string;
  name: string;
  category: string;
  day: string;
  time_from: string;
  location: string;
  ticket_price: number;
  is_active: boolean;
  hosted_by?: string;
}

function formatDate(dateStr: string) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function StatusBadge({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full font-medium ${
        active
          ? "bg-green-500/10 text-green-400"
          : "bg-gray-500/10 text-gray-400"
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${active ? "bg-green-400" : "bg-gray-500"}`} />
      {active ? "Active" : "Inactive"}
    </span>
  );
}

function EventTable({ events, emptyText }: { events: Event[]; emptyText: string }) {
  if (events.length === 0) {
    return (
      <p className="text-gray-500 text-sm py-6 text-center">{emptyText}</p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/5 text-left">
            <th className="pb-3 pr-6 text-xs text-gray-500 uppercase tracking-wider font-medium">Event</th>
            <th className="pb-3 pr-6 text-xs text-gray-500 uppercase tracking-wider font-medium">Date</th>
            <th className="pb-3 pr-6 text-xs text-gray-500 uppercase tracking-wider font-medium">Location</th>
            <th className="pb-3 pr-6 text-xs text-gray-500 uppercase tracking-wider font-medium">Category</th>
            <th className="pb-3 pr-6 text-xs text-gray-500 uppercase tracking-wider font-medium">Price</th>
            <th className="pb-3 text-xs text-gray-500 uppercase tracking-wider font-medium">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {events.map((event) => (
            <tr key={event.id} className="group">
              <td className="py-3 pr-6">
                <a
                  href={`/${event.slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-white group-hover:text-blue-400 transition-colors font-medium truncate block max-w-[200px]"
                >
                  {event.name}
                </a>
              </td>
              <td className="py-3 pr-6 text-gray-400 whitespace-nowrap">
                {formatDate(event.day)}
              </td>
              <td className="py-3 pr-6 text-gray-400 truncate max-w-[160px]">
                {event.location || "—"}
              </td>
              <td className="py-3 pr-6 text-gray-400 capitalize">
                {event.category?.replace(/_/g, " ") || "—"}
              </td>
              <td className="py-3 pr-6 text-gray-300 whitespace-nowrap">
                {event.ticket_price > 0
                  ? `₦${Number(event.ticket_price).toLocaleString()}`
                  : "Free"}
              </td>
              <td className="py-3">
                <StatusBadge active={event.is_active} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function AdminEventsPage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    axiosInstance
      .get("events/")
      .then((res) => {
        const data: Event[] = Array.isArray(res.data)
          ? res.data
          : res.data?.results ?? [];
        setEvents(data);
      })
      .catch(() => setError("Failed to load events."))
      .finally(() => setLoading(false));
  }, []);

  const freeEvents = events.filter((e) => Number(e.ticket_price) === 0);
  const paidEvents = events.filter((e) => Number(e.ticket_price) > 0);

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-white text-xl font-bold">Events</h1>
        <p className="text-gray-400 text-sm mt-1">All events on the platform</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        {[
          { label: "Total Events", value: events.length },
          { label: "Free Events", value: freeEvents.length },
          { label: "Paid Events", value: paidEvents.length },
        ].map((stat) => (
          <div
            key={stat.label}
            className="bg-[#1a1d27] border border-white/10 rounded-xl px-5 py-4"
          >
            <p className="text-gray-400 text-xs uppercase tracking-wider mb-1">{stat.label}</p>
            <p className="text-white text-2xl font-bold">
              {loading ? "—" : stat.value}
            </p>
          </div>
        ))}
      </div>

      {error && (
        <p className="text-red-400 text-sm mb-6">{error}</p>
      )}

      {/* Free Events */}
      <div className="bg-[#1a1d27] border border-white/10 rounded-xl p-6 mb-6">
        <div className="flex items-center gap-2 mb-5">
          <h2 className="text-white font-semibold">Free Events</h2>
          <span className="text-xs bg-green-500/10 text-green-400 px-2 py-0.5 rounded-full">
            {freeEvents.length}
          </span>
        </div>
        {loading ? (
          <p className="text-gray-500 text-sm py-6 text-center">Loading...</p>
        ) : (
          <EventTable events={freeEvents} emptyText="No free events yet." />
        )}
      </div>

      {/* Paid Events */}
      <div className="bg-[#1a1d27] border border-white/10 rounded-xl p-6">
        <div className="flex items-center gap-2 mb-5">
          <h2 className="text-white font-semibold">Paid Events</h2>
          <span className="text-xs bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded-full">
            {paidEvents.length}
          </span>
        </div>
        {loading ? (
          <p className="text-gray-500 text-sm py-6 text-center">Loading...</p>
        ) : (
          <EventTable events={paidEvents} emptyText="No paid events yet." />
        )}
      </div>
    </div>
  );
}
