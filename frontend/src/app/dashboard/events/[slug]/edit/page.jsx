"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import EventCreationForm from "@/components/events/EventCreationForm";
import API from "@/services/api";

// Editing from the dashboard stays in the dashboard (sidebar and header).
// The standalone /discover/<slug>/edit page still exists for links from the public site.
export default function DashboardEditEventPage() {
  const { slug } = useParams();
  const router = useRouter();
  const [eventData, setEventData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    document.title = "Edit event | Byro";
  }, []);

  useEffect(() => {
    if (!slug) return;
    API.getEvent(slug)
      .then((data) => {
        // Owners and manager co-hosts can edit. Check-in-only co-hosts cannot.
        if (!data?.role?.can_edit) {
          toast.error("You don't have permission to edit this event");
          router.replace(`/dashboard/events/${slug}`);
          return;
        }
        setEventData(data);
      })
      .catch(() => {
        toast.error("Failed to load event");
        router.replace("/dashboard/events");
      })
      .finally(() => setLoading(false));
  }, [slug, router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[#4F6EF7]" />
      </div>
    );
  }

  if (!eventData) return null;
  return <EventCreationForm editSlug={slug} initialData={eventData} embedded />;
}
