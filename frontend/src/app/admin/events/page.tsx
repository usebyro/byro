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
  created_at?: string;
  owner_email?: string;
}

interface Attendee {
  ticket_id: string;
  current_owner_name: string;
  current_owner_email: string;
  tier_name: string | null;
  payment_status: string;
  checked_in: boolean;
}

function formatDate(dateStr: string) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(dateStr?: string) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getEventStatus(event: Event): "active" | "inactive" | "ended" {
  if (!event.day) return event.is_active ? "active" : "inactive";
  const eventDate = new Date(event.day);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  eventDate.setHours(0, 0, 0, 0);
  if (eventDate < today) return "ended";
  return event.is_active ? "active" : "inactive";
}

function StatusBadge({ status }: { status: "active" | "inactive" | "ended" }) {
  const styles = {
    active: "bg-green-500/10 text-green-400",
    inactive: "bg-gray-500/10 text-gray-400",
    ended: "bg-red-500/10 text-red-400",
  };
  const dots = {
    active: "bg-green-400",
    inactive: "bg-gray-500",
    ended: "bg-red-400",
  };
  const labels = { active: "Active", inactive: "Inactive", ended: "Ended" };

  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full font-medium ${styles[status]}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${dots[status]}`} />
      {labels[status]}
    </span>
  );
}

function EventTable({
  events,
  emptyText,
  ticketCounts,
  onSelect,
}: {
  events: Event[];
  emptyText: string;
  ticketCounts: Record<number, number | null>;
  onSelect: (event: Event) => void;
}) {
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
            <th className="pb-3 pr-6 text-xs text-gray-500 uppercase tracking-wider font-medium">Created</th>
            <th className="pb-3 pr-6 text-xs text-gray-500 uppercase tracking-wider font-medium">Tickets Sold</th>
            <th className="pb-3 text-xs text-gray-500 uppercase tracking-wider font-medium">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {events.map((event) => (
            <tr
              key={event.id}
              onClick={() => onSelect(event)}
              className="group cursor-pointer hover:bg-white/[0.03]"
            >
              <td className="py-3 pr-6">
                <a
                  href={`/discover/${event.slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
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
              <td className="py-3 pr-6 text-gray-400 whitespace-nowrap">
                {formatDateTime(event.created_at)}
              </td>
              <td className="py-3 pr-6 text-gray-300 whitespace-nowrap">
                {ticketCounts[event.id] === null || ticketCounts[event.id] === undefined
                  ? "—"
                  : ticketCounts[event.id]}
              </td>
              <td className="py-3">
                <StatusBadge status={getEventStatus(event)} />
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
  const [ticketCounts, setTicketCounts] = useState<Record<number, number | null>>({});
  const [totalTicketsSold, setTotalTicketsSold] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [selected, setSelected] = useState<Event | null>(null);
  const [attendees, setAttendees] = useState<Attendee[] | null>(null);
  const [attendeesError, setAttendeesError] = useState("");
  const [attendeesLoading, setAttendeesLoading] = useState(false);

  const openEvent = (event: Event) => {
    setSelected(event);
    setAttendees(null);
    setAttendeesError("");
    setAttendeesLoading(true);
    axiosInstance
      .get(`events/${event.slug}/attendees/`)
      .then((r) => setAttendees(r.data.attendees ?? []))
      .catch((err) => {
        setAttendeesError(
          err?.response?.status === 403
            ? "You can only see the attendee list for events you own or co-host."
            : "Couldn't load attendees for this event."
        );
      })
      .finally(() => setAttendeesLoading(false));
  };

  useEffect(() => {
    let cancelled = false;

    axiosInstance
      .get("events/")
      .then(async (res) => {
        const data: Event[] = Array.isArray(res.data)
          ? res.data
          : res.data?.results ?? [];
        if (cancelled) return;
        setEvents(data);

        // Per-event attendee counts are only visible to that event's owner/co-hosts,
        // so this call 403s (and shows "—") for any event the admin doesn't also own.
        // It's a nice-to-have per-row detail, not the source of truth for the total below.
        const counts: Record<number, number | null> = {};
        data.forEach((e) => { counts[e.id] = null; });

        await Promise.allSettled(
          data.map((event) =>
            axiosInstance
              .get(`events/${event.slug}/attendees/`)
              .then((r) => {
                counts[event.id] = r.data.count ?? 0;
              })
              .catch(() => {
                counts[event.id] = null;
              })
          )
        );

        if (!cancelled) {
          setTicketCounts({ ...counts });
        }
      })
      .catch(() => setError("Failed to load events."))
      .finally(() => { if (!cancelled) setLoading(false); });

    // Platform-wide tickets-sold total, from the same admin-authorized endpoint
    // the Dashboard uses — avoids the per-event 403s skewing this number.
    fetch("/api/admin/analytics/summary")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data) setTotalTicketsSold(data.total_tickets_sold ?? null);
      })
      .catch(() => {
        if (!cancelled) setTotalTicketsSold(null);
      });

    return () => { cancelled = true; };
  }, []);

  const [search, setSearch] = useState("");
  const q = search.trim().toLowerCase();
  const matchesSearch = (e: Event) =>
    !q ||
    e.name.toLowerCase().includes(q) ||
    (e.location ?? "").toLowerCase().includes(q) ||
    (e.hosted_by ?? "").toLowerCase().includes(q);

  // Stats stay platform-wide; only the tables below narrow with the search box.
  const freeEvents = events.filter((e) => Number(e.ticket_price) === 0);
  const paidEvents = events.filter((e) => Number(e.ticket_price) > 0);
  const visibleFreeEvents = freeEvents.filter(matchesSearch);
  const visiblePaidEvents = paidEvents.filter(matchesSearch);

  return (
    <div className="p-5 md:p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-white text-xl font-bold">Events</h1>
        <p className="text-gray-400 text-sm mt-1">All events on the platform</p>
      </div>

      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by event name, location, or host…"
        className="w-full sm:w-80 mb-8 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500/50"
      />

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-8">
        {[
          { label: "Total Events", value: events.length },
          { label: "Free Events", value: freeEvents.length },
          { label: "Paid Events", value: paidEvents.length },
          { label: "Tickets Sold", value: loading || totalTicketsSold === null ? "—" : totalTicketsSold.toLocaleString() },
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
            {visibleFreeEvents.length}
          </span>
        </div>
        {loading ? (
          <p className="text-gray-500 text-sm py-6 text-center">Loading...</p>
        ) : (
          <EventTable
            events={visibleFreeEvents}
            emptyText={search ? "No free events match your search." : "No free events yet."}
            ticketCounts={ticketCounts}
            onSelect={openEvent}
          />
        )}
      </div>

      {/* Paid Events */}
      <div className="bg-[#1a1d27] border border-white/10 rounded-xl p-6">
        <div className="flex items-center gap-2 mb-5">
          <h2 className="text-white font-semibold">Paid Events</h2>
          <span className="text-xs bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded-full">
            {visiblePaidEvents.length}
          </span>
        </div>
        {loading ? (
          <p className="text-gray-500 text-sm py-6 text-center">Loading...</p>
        ) : (
          <EventTable
            events={visiblePaidEvents}
            emptyText={search ? "No paid events match your search." : "No paid events yet."}
            ticketCounts={ticketCounts}
            onSelect={openEvent}
          />
        )}
      </div>

      {/* Event detail drawer */}
      {selected && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/70" onClick={() => setSelected(null)} />
          <div className="relative w-full max-w-md h-full bg-[#1a1d27] border-l border-white/10 shadow-2xl overflow-y-auto">
            <div className="sticky top-0 bg-[#1a1d27] border-b border-white/10 px-6 py-4 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-white font-semibold truncate">{selected.name}</h3>
                <p className="text-gray-500 text-xs mt-0.5">
                  {formatDate(selected.day)} · {selected.location || "No location set"}
                </p>
              </div>
              <button
                onClick={() => setSelected(null)}
                aria-label="Close"
                className="shrink-0 text-gray-400 hover:text-white text-lg leading-none px-1"
              >
                ×
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white/5 rounded-lg px-3 py-2.5">
                  <p className="text-gray-500 text-[10px] uppercase tracking-wider mb-0.5">Category</p>
                  <p className="text-white text-sm capitalize">{selected.category?.replace(/_/g, " ") || "—"}</p>
                </div>
                <div className="bg-white/5 rounded-lg px-3 py-2.5">
                  <p className="text-gray-500 text-[10px] uppercase tracking-wider mb-0.5">Price</p>
                  <p className="text-white text-sm">
                    {selected.ticket_price > 0 ? `₦${Number(selected.ticket_price).toLocaleString()}` : "Free"}
                  </p>
                </div>
                <div className="bg-white/5 rounded-lg px-3 py-2.5">
                  <p className="text-gray-500 text-[10px] uppercase tracking-wider mb-0.5">Status</p>
                  <StatusBadge status={getEventStatus(selected)} />
                </div>
                <div className="bg-white/5 rounded-lg px-3 py-2.5">
                  <p className="text-gray-500 text-[10px] uppercase tracking-wider mb-0.5">Created</p>
                  <p className="text-white text-sm">{formatDateTime(selected.created_at)}</p>
                </div>
              </div>

              <a
                href={`/discover/${selected.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block text-xs font-semibold text-blue-400 hover:text-blue-300"
              >
                View public event page ↗
              </a>

              <div>
                <h4 className="text-white text-sm font-semibold mb-3">
                  Attendees{attendees ? ` (${attendees.length})` : ""}
                </h4>
                {attendeesLoading ? (
                  <p className="text-gray-500 text-sm">Loading…</p>
                ) : attendeesError ? (
                  <p className="text-gray-500 text-sm">{attendeesError}</p>
                ) : attendees && attendees.length > 0 ? (
                  <div className="space-y-2">
                    {attendees.map((a) => (
                      <div
                        key={a.ticket_id}
                        className="flex items-center justify-between gap-2 bg-white/5 rounded-lg px-3 py-2"
                      >
                        <div className="min-w-0">
                          <p className="text-white text-xs font-medium truncate">{a.current_owner_name}</p>
                          <p className="text-gray-500 text-[11px] truncate">{a.current_owner_email}</p>
                        </div>
                        <span
                          className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                            a.checked_in ? "bg-green-500/10 text-green-400" : "bg-gray-500/10 text-gray-400"
                          }`}
                        >
                          {a.checked_in ? "Checked in" : "Not checked in"}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500 text-sm">No attendees yet.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
