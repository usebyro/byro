"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import EventCreationForm from "../../../components/events/EventCreationForm";
import AppLayout from "@/layout/app";
import API from "@/services/api";
import { toast } from "sonner";

export default function EditEventPage() {
  const { slug } = useParams();
  const router = useRouter();
  const [eventData, setEventData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!slug) return;
    API.getEvent(slug)
      .then((data) => {
        // Check the user has permission to edit
        if (!data?.role?.is_owner && !data?.role?.is_cohost) {
          toast.error("You don't have permission to edit this event");
          router.push(`/${slug}`);
          return;
        }
        setEventData(data);
      })
      .catch(() => {
        toast.error("Failed to load event");
        router.push("/events");
      })
      .finally(() => setLoading(false));
  }, [slug, router]);

  if (loading) {
    return (
      <AppLayout>
        <div className="flex justify-center items-center min-h-screen bg-white">
          <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-blue-600" />
        </div>
      </AppLayout>
    );
  }

  if (!eventData) return null;

  return (
    <AppLayout>
      <div className="bg-white min-h-screen">
        <div className="max-w-5xl mx-auto px-4 py-6">
          {/* Header */}
          <div className="flex items-center gap-3 mb-6">
            <button
              onClick={() => router.push(`/dashboard/events/${slug}`)}
              className="text-gray-500 hover:text-gray-700 text-sm flex items-center gap-1"
            >
              ← Back
            </button>
            <h1 className="text-xl font-bold text-gray-900">Edit Event</h1>
          </div>
          <EventCreationForm editSlug={slug} initialData={eventData} />
        </div>
      </div>
    </AppLayout>
  );
}
