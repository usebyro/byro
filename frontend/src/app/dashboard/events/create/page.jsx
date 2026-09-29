"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSelector } from "react-redux";
import EventCreationForm from "@/components/events/EventCreationForm";

// Lives inside the dashboard shell (sidebar and header) and reuses its store.
export default function NewEventPage() {
  const router = useRouter();
  const token = useSelector((state) => state.auth?.token);

  useEffect(() => {
    document.title = "Create event | Byro";
  }, []);

  useEffect(() => {
    if (!token) router.push(`/login?redirect=${encodeURIComponent("/dashboard/events/create")}`);
  }, [token, router]);

  if (!token) return null;
  return <EventCreationForm embedded />;
}
