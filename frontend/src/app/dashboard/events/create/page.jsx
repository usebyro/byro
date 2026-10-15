"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/redux/useAuth";
import EventCreationForm from "@/components/events/EventCreationForm";
import CommunityGate from "@/components/community/CommunityGate";

// Lives inside the dashboard shell (sidebar and header) and reuses its store.
export default function NewEventPage() {
  const router = useRouter();
  const { token, ready } = useAuth();

  useEffect(() => {
    document.title = "Create event | Byro";
  }, []);

  useEffect(() => {
    if (ready && !token) router.push(`/login?redirect=${encodeURIComponent("/dashboard/events/create")}`);
  }, [ready, token, router]);

  if (!token) return null;
  return (
    <CommunityGate>
      <EventCreationForm embedded />
    </CommunityGate>
  );
}
