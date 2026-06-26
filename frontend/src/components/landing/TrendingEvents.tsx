"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import axiosInstance from "@/utils/axios";
import EventCard from "./EventCard";

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

const TrendingEvents = () => {
  const router = useRouter();
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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
  }, []);

  if (loading) {
    return (
      <section className="py-16 bg-[#F8FAFC]">
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
    <section className="py-16 bg-[#F8FAFC]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-end justify-between mb-8">
          <div>
            <p className="text-orange-500 text-sm font-semibold uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <span>🔥</span> Trending this week
            </p>
            <h2 className="text-3xl font-bold text-gray-900">Selling fast</h2>
          </div>
          <button
            onClick={() => router.push("/discover")}
            className="flex items-center gap-1.5 bg-white border border-gray-200 text-gray-700 text-sm font-medium px-4 py-2 rounded-full hover:border-gray-300 hover:shadow-sm transition-all"
          >
            View all events
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        {events.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500 text-lg">No events available yet.</p>
            <button
              onClick={() => router.push("/events/create")}
              className="mt-4 text-blue-600 font-medium hover:text-blue-700"
            >
              Create the first event →
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
