"use client";

import { useEffect, useState, Suspense, useCallback } from "react";
import Link from "next/link";
import { generateICS, downloadICS } from "@/lib/calendar";

function formatDate(day) {
  if (!day) return "";
  const parsed = new Date(`${day}T00:00:00`);
  if (isNaN(parsed.getTime())) return day;
  return parsed.toLocaleDateString("en-US", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatTime(time) {
  if (!time) return "";
  const parsed = new Date(`1970-01-01T${time}`);
  if (isNaN(parsed.getTime())) return time;
  return parsed.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function TicketConfirmationContent() {
  const [ticketData, setTicketData] = useState(null);

  useEffect(() => {
    const storedData = localStorage.getItem("ticketData");
    if (storedData) {
      // One-time read of localStorage on mount; this can't run during render
      // (no access to localStorage during SSR) or be deferred to a callback.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTicketData(JSON.parse(storedData));
      localStorage.removeItem("ticketData");
    }
  }, []);

  const handleAddToCalendar = useCallback(() => {
    if (!ticketData) return;

    const startStr = ticketData.eventDate
      ? `${ticketData.eventDate}T${ticketData.timeFrom || "00:00"}:00`
      : null;
    const startDateTime =
      startStr && !isNaN(new Date(startStr).getTime()) ? startStr : new Date().toISOString();

    const endDate = new Date(startDateTime);
    if (isNaN(endDate.getTime())) {
      endDate.setTime(Date.now() + 2 * 60 * 60 * 1000);
    } else {
      endDate.setHours(endDate.getHours() + 2);
    }

    const ics = generateICS({
      eventName: ticketData.eventName || "Event",
      description: `Ticket for ${ticketData.attendeeName}`,
      location: ticketData.eventLocation || "",
      startDate: startDateTime,
      endDate: endDate.toISOString(),
      organizer: "Byro Africa",
    });

    downloadICS(ics, `${(ticketData.eventName || "event").replace(/\s+/g, "_")}.ics`);
  }, [ticketData]);

  if (!ticketData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8F9FA]">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8F9FA] flex items-center justify-center px-4 py-10 sm:py-16">
      <div className="w-full max-w-md">
        <div className="rounded-3xl overflow-hidden shadow-xl border border-gray-100 bg-white">
          {/* Gradient header with success badge */}
          <div className="relative bg-gradient-to-br from-[#0f0a2e] via-[#4c1d95] to-[#a855f7] px-6 pt-9 pb-14 text-center">
            <div className="w-16 h-16 rounded-full bg-white/15 backdrop-blur-sm flex items-center justify-center mx-auto mb-4 ring-4 ring-white/10">
              <div className="w-11 h-11 rounded-full bg-emerald-400 flex items-center justify-center">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
            </div>
            <h1 className="text-white text-xl sm:text-2xl font-bold">You&apos;re going!</h1>
            <p className="text-white/70 text-sm mt-1.5">
              Your spot for <span className="text-white font-semibold">{ticketData.eventName}</span> is confirmed.
            </p>
          </div>

          {/* Event summary card, overlapping the header */}
          <div className="px-6">
            <div className="-mt-8 bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <div className="grid grid-cols-2 gap-y-4">
                <div>
                  <p className="text-[10px] font-bold tracking-widest text-gray-400 uppercase mb-1">Date</p>
                  <p className="text-sm font-semibold text-gray-900">{formatDate(ticketData.eventDate) || "TBA"}</p>
                </div>
                {ticketData.timeFrom && (
                  <div>
                    <p className="text-[10px] font-bold tracking-widest text-gray-400 uppercase mb-1">Time</p>
                    <p className="text-sm font-semibold text-gray-900">{formatTime(ticketData.timeFrom)}</p>
                  </div>
                )}
                {ticketData.eventLocation && (
                  <div className="col-span-2">
                    <p className="text-[10px] font-bold tracking-widest text-gray-400 uppercase mb-1">Venue</p>
                    <p className="text-sm font-semibold text-gray-900">{ticketData.eventLocation}</p>
                  </div>
                )}
                <div className="col-span-2 pt-3 border-t border-dashed border-gray-200">
                  <p className="text-[10px] font-bold tracking-widest text-gray-400 uppercase mb-1">Attendee</p>
                  <p className="text-sm font-semibold text-gray-900">{ticketData.attendeeName}</p>
                  <p className="text-xs text-gray-500">{ticketData.attendeeEmail}</p>
                </div>
              </div>
            </div>
          </div>

          {/* What's next */}
          <div className="px-6 pt-5">
            <p className="text-xs text-gray-500 text-center leading-relaxed">
              We&apos;ve emailed your ticket to <span className="font-medium text-gray-700">{ticketData.attendeeEmail}</span>.
              Check your inbox — it&apos;s attached and ready to present at the gate.
            </p>
          </div>

          {/* Actions */}
          <div className="p-6 space-y-2.5">
            {ticketData.ticketId && (
              <Link
                href={`/ticket/${ticketData.ticketId}`}
                className="flex items-center justify-center gap-2 w-full bg-blue-600 text-white font-semibold py-3 rounded-full hover:bg-blue-700 transition-colors text-sm"
              >
                View my ticket
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </Link>
            )}
            <button
              onClick={handleAddToCalendar}
              className="flex items-center justify-center gap-2 w-full border border-gray-200 text-gray-700 font-semibold py-3 rounded-full hover:bg-gray-50 transition-colors text-sm"
            >
              Add to calendar
            </button>
          </div>
        </div>

        <Link
          href="/"
          className="block text-center mt-6 text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors"
        >
          Back to home
        </Link>
      </div>
    </div>
  );
}

export default function TicketConfirmationPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[#F8F9FA]">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-600" />
        </div>
      }
    >
      <TicketConfirmationContent />
    </Suspense>
  );
}
