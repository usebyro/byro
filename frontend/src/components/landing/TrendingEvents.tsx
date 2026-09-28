"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import axiosInstance from "@/utils/axios";
import EventCard from "./EventCard";
import { displayStyle } from "./fonts";

interface Event {
  id: number;
  slug: string;
  name: string;
  category: string;
  category_display?: string;
  day: string;
  time_from: string;
  time_to: string;
  location: string;
  ticket_price: number;
  event_image_url?: string;
  is_active: boolean;
}

interface Props {
  initialEvents?: Event[];
}

const TrendingEvents = ({ initialEvents }: Props) => {
  const router = useRouter();
  const [events, setEvents] = useState<Event[]>(initialEvents ?? []);
  const [loading, setLoading] = useState(!initialEvents);

  useEffect(() => {
    // Skip client-side fetch if the server already provided data
    if (initialEvents) return;

    const fetchEvents = async () => {
      try {
        const response = await axiosInstance.get("events/");
        const data = response.data;
        const raw = Array.isArray(data) ? data : data.events || data.data || [];
        const seen = new Set<number>();
        const eventList = raw.filter((e: Event) => {
          if (seen.has(e.id)) return false;
          seen.add(e.id);
          return true;
        });
        setEvents(eventList.slice(0, 4));
      } catch (error) {
        console.error("Error fetching events:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchEvents();
  }, [initialEvents]);

  if (loading) {
    return (
      <section className="py-16 sm:py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="animate-pulse">
            <div className="h-4 w-32 bg-gray-200 rounded mb-3" />
            <div className="h-8 w-48 bg-gray-200 rounded mb-8" />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="bg-white rounded-2xl overflow-hidden border border-gray-100">
                  <div className="h-44 bg-gray-100" />
                  <div className="p-4 space-y-3">
                    <div className="h-5 bg-gray-100 rounded w-3/4" />
                    <div className="h-4 bg-gray-100 rounded w-1/2" />
                    <div className="h-4 bg-gray-100 rounded w-2/3" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="py-16 sm:py-24 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-end justify-between mb-10">
          <h2 className="text-3xl sm:text-5xl font-extrabold tracking-[-0.02em] text-[#0F172A]" style={displayStyle}>
            Coming up
          </h2>
          <button
            onClick={() => router.push("/discover")}
            className="text-sm font-semibold text-[#2563EB] underline underline-offset-4 hover:brightness-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] rounded"
          >
            See all events
          </button>
        </div>

        {events.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500 text-lg">No events available yet.</p>
            <button
              onClick={() => router.push("/events/create")}
              className="mt-4 text-blue-600 font-medium hover:text-blue-700"
            >
              Create the first event
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {events.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
};

export default TrendingEvents;
