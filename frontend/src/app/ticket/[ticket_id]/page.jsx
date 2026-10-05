"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useParams, notFound } from "next/navigation";
import TicketCard from "@/components/tickets/TicketCard";
import API from "@/services/api";

export default function TicketPage() {
  const { ticket_id: ticketId } = useParams();
  const [ticket, setTicket] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!ticketId) return;
    API.getTicket(ticketId)
      .then(setTicket)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [ticketId]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F7F9FC]">
        <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-t-2 border-[#3669F6]" />
      </div>
    );
  }

  if (error || !ticket) return notFound();

  return (
    <div
      className="flex min-h-screen flex-col bg-[#F7F9FC] text-[#14161C]"
      style={{ fontFamily: "var(--font-body), sans-serif" }}
    >
      <header className="flex h-[60px] items-center justify-between border-b border-[#EDF0F5] px-4 sm:h-[84px] sm:px-16">
        <Link href="/" aria-label="Byro home">
          <Image
            src="/assets/images/logo.svg"
            alt="Byro"
            width={60}
            height={34}
            className="h-7 w-auto sm:h-[34px]"
          />
        </Link>
        <Link href="/home" className="text-sm font-bold text-[#14161C] sm:text-[15px]">
          Your events
        </Link>
      </header>

      <main className="flex flex-1 justify-center px-4 pb-10 pt-6 sm:pt-9">
        <div className="w-full max-w-[480px]">
          <p className="mb-4 text-center text-xs font-extrabold tracking-[0.12em] text-[#2451D6]">
            YOUR TICKET
          </p>
          <TicketCard ticket={ticket} />
        </div>
      </main>
    </div>
  );
}
