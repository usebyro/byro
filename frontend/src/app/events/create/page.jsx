"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSelector } from "react-redux";
import { Providers } from "@/redux/Providers";
import EventCreationForm from "../../../components/events/EventCreationForm";
import CommunityGate from "@/components/community/CommunityGate";

function CreateEventGate() {
  const router = useRouter();
  const token = useSelector((state) => state.auth?.token);

  useEffect(() => {
    if (!token) router.push(`/login?redirect=${encodeURIComponent("/events/create")}`);
  }, [token, router]);

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
