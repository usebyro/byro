"use client";

import { useEffect } from "react";
import { useWeb3AuthConnect } from "@web3auth/modal/react";
import { Providers } from "@/redux/Providers";
import EventCreationForm from "../../../components/events/EventCreationForm";

export default function CreateEventPage() {
  const { connect, isConnected } = useWeb3AuthConnect();

  useEffect(() => {
    if (!isConnected) connect();
  }, [isConnected, connect]);

  return (
    <Providers>
      <EventCreationForm />
    </Providers>
  );
}
