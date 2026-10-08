"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useParams, notFound } from "next/navigation";
import TicketCard from "@/components/tickets/TicketCard";
import API from "@/services/api";

const naira = (n) => `₦${Number(n || 0).toLocaleString("en-NG", { maximumFractionDigits: 2 })}`;

// Where the buyer's refund has got to, in words they can act on.
function refundLine(refund, email) {
  const amount = naira(refund.amount);
  switch (refund.status) {
    case "processed":
      return `Your refund of ${amount} has been returned to the card or bank account you paid with.`;
    case "processing":
    case "submitting":
    case "pending":
      return `Your refund of ${amount} has been sent to the card or bank account you paid with. Banks usually show it within 3–10 business days.`;
    case "failed":
    case "needs_attention":
      return `There is a problem sending your refund of ${amount}. Our team has been told and will contact you at ${email}. You can also write to support@usebyro.com.`;
    default:
      return `Your refund of ${amount} is being arranged. We will email you as soon as it has been sent. There is nothing you need to do.`;
  }
}

function CancelledNotice({ ticket }) {
  return (
    <section role="status" className="rounded-3xl border border-[#F2C4C4] bg-[#FDECEC] p-6 text-[#8A1C1C]">
      <p className="text-xs font-extrabold tracking-[0.12em]">EVENT CANCELLED</p>
      <h1 className="mt-2 font-display text-2xl font-bold leading-tight text-[#14161C]">{ticket.event_name} was cancelled</h1>
      {ticket.event_cancel_reason && (
        <p className="mt-3 text-[15px] break-words">Reason from the organiser: {ticket.event_cancel_reason}</p>
      )}
      <p className="mt-3 text-[15px] text-[#14161C]">This ticket is no longer valid.</p>
      {ticket.refund ? (
        <div className="mt-4 rounded-2xl bg-white/70 p-4 text-[15px] text-[#14161C]">
          <p>{refundLine(ticket.refund, ticket.current_owner_email)}</p>
          <p className="mt-2 text-sm text-[#5B6272]">
            That is the ticket price you paid. Byro&apos;s service fee and the payment processing charge cannot be refunded.
          </p>
        </div>
      ) : (
        <p className="mt-2 text-sm text-[#5B6272]">Nothing further is needed from you.</p>
      )}
      <Link
        href={`/discover/${ticket.event_slug}`}
        className="mt-5 inline-flex h-11 items-center rounded-full border border-[#D5DBE5] bg-white px-5 text-sm font-bold text-[#14161C]"
      >
        See the event page
      </Link>
    </section>
  );
}

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
          {ticket.event_cancelled_at ? (
            <CancelledNotice ticket={ticket} />
          ) : (
            <>
              <p className="mb-4 text-center text-xs font-extrabold tracking-[0.12em] text-[#2451D6]">
                YOUR TICKET
              </p>
              <TicketCard ticket={ticket} />
            </>
          )}
        </div>
      </main>
    </div>
  );
}
