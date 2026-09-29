"use client";

import React, { useEffect, useState, Suspense, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import API from "@/services/api";
import { generateICS, downloadICS } from "@/lib/calendar";
import { dayParts, formatTime } from "@/lib/eventFormat";

function Header() {
  return (
    <div className="relative px-3 pt-3 md:px-8 md:pt-5 xl:px-16">
      <header className="mx-auto flex h-14 max-w-[1312px] items-center rounded-full border border-hairline bg-white pl-4 pr-1.5 shadow-[0_8px_30px_rgba(20,22,28,0.05)] md:h-16 md:pl-6 md:pr-2.5">
        <Link href="/" aria-label="byro home" className="flex">
          <Image src="/assets/images/logo.svg" alt="byro" width={63} height={36} className="h-7 w-auto md:h-9" priority />
        </Link>
        <div className="flex-1" />
        <Link
          href="/discover"
          className="flex h-11 items-center rounded-full bg-mist px-[18px] text-[15px] font-bold text-ink transition-[background-color,scale] hover:bg-line active:scale-[0.96] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          Find more events
        </Link>
      </header>
    </div>
  );
}

function TicketConfirmationContent() {
  const [ticketData, setTicketData] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [qrFailed, setQrFailed] = useState(false);

  useEffect(() => {
    const storedData = localStorage.getItem("ticketData");
    if (storedData) {
      // One-time read of localStorage on mount; this can't run during render
      // (no access to localStorage during SSR) or be deferred to a callback.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTicketData(JSON.parse(storedData));
      localStorage.removeItem("ticketData");
    }
    setLoaded(true);
  }, []);

  const handleAddToCalendar = useCallback(() => {
    if (!ticketData) return;

    const startStr = ticketData.eventDate
      ? `${ticketData.eventDate}T${ticketData.timeFrom || "00:00"}:00`
      : null;
    const startDateTime = startStr && !isNaN(new Date(startStr).getTime())
      ? startStr
      : new Date().toISOString();

    const endDate = new Date(startDateTime);
    if (isNaN(endDate.getTime())) {
      endDate.setTime(Date.now() + 2 * 60 * 60 * 1000);
    } else {
      endDate.setHours(endDate.getHours() + 2);
    }
    const endDateTime = endDate.toISOString();

    const ics = generateICS({
      eventName: ticketData.eventName || "Event",
      description: `Ticket for ${ticketData.attendeeName}`,
      location: ticketData.eventLocation || "",
      startDate: startDateTime,
      endDate: endDateTime,
      organizer: "Byro Africa",
    });

    downloadICS(ics, `${(ticketData.eventName || "event").replace(/\s+/g, "_")}.ics`);
  }, [ticketData]);

  if (!loaded) {
    return <div className="min-h-screen bg-white" aria-busy="true" />;
  }

  if (!ticketData) {
    return (
      <div className="min-h-screen bg-white font-body text-ink">
        <Header />
        <div className="mx-auto flex max-w-xl flex-col items-start gap-4 px-4 pt-20 md:px-8">
          <h1 className="font-display text-[44px] font-bold leading-none tracking-[-0.04em] md:text-6xl">Nothing to show here</h1>
          <p className="text-lg leading-relaxed text-muted">
            This page only shows right after you buy a ticket. Your ticket is in the email we sent you.
          </p>
          <Link
            href="/discover"
            className="mt-2 flex h-[52px] items-center rounded-full bg-brand px-7 text-base font-bold text-white transition-[filter,scale] hover:brightness-90 active:scale-[0.96]"
          >
            Find events
          </Link>
        </div>
      </div>
    );
  }

  const firstName = (ticketData.attendeeName || "").trim().split(/\s+/)[0];
  const parts = dayParts(ticketData.eventDate || "");
  const when = [parts.short, formatTime(ticketData.timeFrom)].filter(Boolean).join(" · ");
  const canShowQr = ticketData.ticketId && !qrFailed;

  const detail = "flex flex-col gap-0.5";
  const detailLabel = "text-xs font-bold tracking-[0.04em] text-muted";

  return (
    <div className="relative min-h-screen overflow-hidden bg-white font-body text-ink">
      <div aria-hidden="true" className="absolute -left-52 top-36 hidden h-[700px] w-[700px] rounded-full bg-sky lg:block" />
      <div aria-hidden="true" className="absolute -right-36 top-[520px] hidden h-[480px] w-[480px] rounded-full bg-blush lg:block" />
      <div aria-hidden="true" className="absolute -left-24 top-24 h-72 w-72 rounded-full bg-sky lg:hidden" />

      <Header />

      <main className="relative mx-auto flex max-w-[1440px] flex-col items-center gap-10 px-4 pb-16 pt-10 md:px-12 md:pt-14 lg:flex-row lg:gap-20 xl:px-24">
        <div className="flex w-full flex-col gap-5 lg:w-[520px] lg:shrink-0">
          <span className="flex h-[34px] items-center gap-2 self-start rounded-full bg-mint px-3.5 text-sm font-extrabold text-[#1F7A52]">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5 12l5 5L20 7" />
            </svg>
            Order confirmed
          </span>
          <h1 className="text-balance font-display text-[52px] font-bold leading-[0.98] tracking-[-0.045em] md:text-[80px]">
            You&apos;re going{firstName ? "," : "."}
            {firstName && (
              <>
                <br />
                {firstName}.
              </>
            )}
          </h1>
          <p className="max-w-[460px] text-pretty text-base leading-[1.6] text-muted md:text-lg">
            {ticketData.attendeeEmail ? (
              <>
                Your ticket is on its way to <b className="text-ink">{ticketData.attendeeEmail}</b>. Check your inbox, and your spam folder if it doesn&apos;t show up.
              </>
            ) : (
              <>Your ticket is on its way. Check your inbox, and your spam folder if it doesn&apos;t show up.</>
            )}
          </p>
          <div className="mt-2 flex flex-wrap gap-2.5">
            <button
              type="button"
              onClick={handleAddToCalendar}
              className="flex h-[52px] items-center gap-2 rounded-full bg-ink px-[22px] text-[15px] font-bold text-white transition-[filter,scale] hover:brightness-125 active:scale-[0.96] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                <rect x="3" y="5" width="18" height="16" rx="3" />
                <path d="M3 10h18M8 3v4M16 3v4" />
              </svg>
              Add to calendar
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="flex h-[52px] items-center rounded-full border border-line bg-white px-[22px] text-[15px] font-bold text-ink transition-[background-color,scale] hover:bg-mist active:scale-[0.96] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              Download ticket
            </button>
          </div>
        </div>

        {/* The ticket */}
        <div className="w-full max-w-[420px] overflow-hidden rounded-[30px] bg-white shadow-[0_30px_80px_rgba(20,22,28,0.14)] lg:mx-auto">
          <div className="flex h-[150px] items-end bg-sky p-6">
            <span className="font-display text-[30px] font-bold leading-[1.05] tracking-[-0.02em]">{ticketData.eventName}</span>
          </div>
          <div className="flex flex-col gap-3.5 px-7 py-6">
            <div className="grid grid-cols-2 gap-3.5 text-sm">
              <div className={detail}>
                <span className={detailLabel}>DATE</span>
                <span className="font-bold">{when || "To be announced"}</span>
              </div>
              <div className={detail}>
                <span className={detailLabel}>VENUE</span>
                <span className="break-words font-bold">{ticketData.eventLocation || "To be announced"}</span>
              </div>
              <div className={`${detail} col-span-2`}>
                <span className={detailLabel}>NAME</span>
                <span className="font-bold">{ticketData.attendeeName}</span>
              </div>
            </div>
          </div>
          <div aria-hidden="true" className="mx-6 border-t-2 border-dashed border-line" />
          <div className="flex items-center gap-5 px-7 pb-7 pt-6">
            <span className="flex h-[132px] w-[132px] shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-paper">
              {canShowQr ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={API.getTicketQrUrl(ticketData.ticketId)}
                  alt="Your entry QR code"
                  width={132}
                  height={132}
                  className="h-full w-full object-contain"
                  onError={() => setQrFailed(true)}
                />
              ) : (
                <svg width="88" height="88" viewBox="0 0 24 24" fill="none" stroke="#14161C" strokeWidth="1.4" strokeLinejoin="round" aria-hidden="true">
                  <rect x="3" y="3" width="7" height="7" />
                  <rect x="14" y="3" width="7" height="7" />
                  <rect x="3" y="14" width="7" height="7" />
                  <path d="M14 14h3v3h-3zM18 18h3v3h-3zM14 20h2M20 14v2" />
                </svg>
              )}
            </span>
            <div className="flex min-w-0 flex-col gap-2">
              <span className="text-[15px] font-extrabold">Show this at the door</span>
              <span className="break-all text-[13px] leading-[1.5] text-muted">
                {ticketData.ticketId ? `Ticket ID ${String(ticketData.ticketId).slice(0, 13)}` : "Also in your email"}
                <br />
                Also in your email
              </span>
              {ticketData.ticketId && (
                <Link href={`/ticket/${ticketData.ticketId}`} className="text-sm font-bold text-brand hover:text-brand-dark">
                  View ticket
                </Link>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

// Main page component with Suspense boundary
export default function TicketConfirmationPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-white" />}>
      <TicketConfirmationContent />
    </Suspense>
  );
}
