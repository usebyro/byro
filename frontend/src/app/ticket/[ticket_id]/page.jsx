"use client";

import { useEffect, useState } from "react";
import { useParams, notFound } from "next/navigation";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
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
      <div className="flex items-center justify-center min-h-screen bg-white">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (error || !ticket) return notFound();

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <Navbar />

      <main className="flex-1 flex items-start justify-center px-4 py-10 sm:py-16">
        <div className="w-full max-w-md">
          <p className="text-center text-xs font-bold tracking-widest text-blue-600 uppercase mb-2">
            {ticket.checked_in ? "Checked in" : "Your Ticket"}
          </p>
          <h1 className="text-center text-2xl font-bold text-gray-900 mb-8">
            {ticket.current_owner_name}
          </h1>

          <TicketCard ticket={ticket} />
        </div>
      </main>

      <Footer />
    </div>
  );
}
