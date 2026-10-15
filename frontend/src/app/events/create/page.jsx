"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/redux/useAuth";
import { Providers } from "@/redux/Providers";
import EventCreationForm from "../../../components/events/EventCreationForm";
import CommunityGate from "@/components/community/CommunityGate";

function CreateEventGate() {
  const router = useRouter();
  const { token, ready } = useAuth();

  useEffect(() => {
    if (ready && !token) router.push(`/login?redirect=${encodeURIComponent("/events/create")}`);
  }, [ready, token, router]);

  if (!token) return null;
  return (
    <CommunityGate>
      <EventCreationForm />
    </CommunityGate>
  );
}

export default function CreateEventPage() {
  return (
    <Providers>
      <CreateEventGate />
    </Providers>
  );
}
