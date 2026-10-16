"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import API from "@/services/api";

const naira = (n) => `₦${Math.round(Number(n || 0)).toLocaleString("en-NG")}`;
const ordinal = (n) => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
};
const when = (iso) =>
  iso
    ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" })
    : "";

/**
 * One guest, opened from the guest list: their ticket, the order it came from,
 * their answers, how often they've come to your events, and checking them in.
 * Money (what they paid, what you get) only comes back for the event's owner.
 */
export default function EventGuestSheet({ slug, guest, isOwner, canCheckIn, eventIsFuture, onClose, onCheckIn }) {
  const [detail, setDetail] = useState(null);
  const [checking, setChecking] = useState(false);
  const closeRef = useRef(null);

  useEffect(() => {
    let live = true;
    API.getDashEventGuest(slug, guest.id).then((d) => live && setDetail(d)).catch(() => {});
    return () => { live = false; };
  }, [slug, guest.id]);

  // Escape closes, the page behind stops scrolling, focus starts on Close and goes back after.
  useEffect(() => {
    const opener = document.activeElement;
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const scroller = document.getElementById("main");
    const previous = scroller?.style.overflow;
    if (scroller) scroller.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      if (scroller) scroller.style.overflow = previous || "";
      if (opener instanceof HTMLElement) opener.focus({ preventScroll: true });
    };
  }, [onClose]);

  const checkIn = async () => {
    setChecking(true);
    try {
      await onCheckIn(guest);
    } finally {
      setChecking(false);
    }
  };

  const order = detail?.order;
  const history = detail
    ? detail.events_with_you <= 1
      ? "First event with you."
      : `${ordinal(detail.events_with_you)} event with you.${detail.is_regular ? " Regular." : ""}`
    : "";

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button type="button" aria-label="Close guest details" onClick={onClose} tabIndex={-1} className="v-scrim absolute inset-0 cursor-pointer border-0 bg-[rgba(20,22,28,.28)]" />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Guest details"
        className="v-sheet relative box-border flex h-full w-[min(440px,100%)] flex-col gap-5 overflow-y-auto bg-white p-6 shadow-[-20px_0_50px_-20px_rgba(20,22,28,.35)]"
      >
        <div className="flex items-center gap-3.5">
          <span className="v-av h-[52px] w-[52px] text-xl">{(guest.name || "?")[0].toUpperCase()}</span>
          <span className="flex min-w-0 flex-grow flex-col gap-0.5">
            <span className="v-d break-words text-[22px] font-bold">{guest.name}</span>
            <span className="v-hint break-all">{guest.email}</span>
          </span>
          <button ref={closeRef} type="button" className="v-icon-btn ghost" aria-label="Close" onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-paper px-[18px] py-4">
          <span className="flex flex-[1_1_180px] flex-col gap-0.5">
            <span className={`text-base font-extrabold ${guest.checkedIn ? "text-[#1F7A52]" : "text-ink"}`}>
              {guest.checkedIn ? "Checked in" : "Not arrived"}
            </span>
            <span className="v-hint">
              {guest.checkedIn
                ? guest.checkedInAt ? when(guest.checkedInAt) : "At the door"
                : eventIsFuture ? "Check-in opens on event day. You can do it early here." : "Not checked in yet."}
            </span>
          </span>
          {!guest.checkedIn && canCheckIn && guest.qrToken && (
            <button type="button" className="v-btn v-btn-p" onClick={checkIn} disabled={checking}>
              {checking ? "Checking in…" : "Check in now"}
            </button>
          )}
        </div>

        <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-[18px] gap-y-2.5 text-sm">
          <dt className="text-muted">Ticket</dt><dd className="m-0 font-bold">{guest.tier}</dd>
          <dt className="text-muted">Ref</dt><dd className="v-mono m-0">{guest.ref}</dd>
          {order && (
            <>
              <dt className="text-muted">In this order</dt>
              <dd className="m-0 font-bold">
                {order.tickets === 1 ? "1 ticket" : `${order.tickets} tickets (this is ${order.position} of ${order.tickets})`}
              </dd>
              <dt className="text-muted">Order</dt><dd className="v-mono m-0 break-all">{order.reference}</dd>
            </>
          )}
          <dt className="text-muted">Bought</dt><dd className="m-0 font-bold">{when(guest.registeredAt)}</dd>
          {order?.paid !== undefined && (
            <>
              <dt className="text-muted">They paid</dt><dd className="m-0 font-bold">{naira(order.paid)}</dd>
              <dt className="text-muted">You get</dt><dd className="m-0 font-extrabold">{naira(order.net)}</dd>
            </>
          )}
          {detail && !order && guest.paymentStatus === "free" && (
            <><dt className="text-muted">They paid</dt><dd className="m-0 font-bold">Free ticket</dd></>
          )}
        </dl>
        {order?.paid !== undefined && (
          <p className="v-hint m-0">
            {order.fee_paid_by_buyer ? "Service fee paid by the buyer." : "Service fee taken from your share."}
            {order.channel ? ` Paid by ${order.channel.toLowerCase()} with Paystack.` : " Paid with Paystack."}
          </p>
        )}

        {guest.answers.length > 0 && (
          <div className="flex flex-col gap-2.5">
            <h3 className="m-0 text-[15px]">Their answers</h3>
            {guest.answers.map((qa) => (
              <div key={qa.questionId ?? qa.question} className="flex flex-col gap-0.5 text-sm">
                <span className="text-muted">{qa.question}</span>
                <b className="break-words">{qa.answer || "No answer"}</b>
              </div>
            ))}
          </div>
        )}

        {detail && (
          <div className="flex flex-wrap items-center gap-2.5 rounded-[14px] bg-[#F6F8FB] px-4 py-3.5">
            <span className="flex-grow text-sm font-bold">{history}</span>
            {isOwner && (
              <Link href="/dashboard/community" className="text-sm font-bold text-brand-dark no-underline">See them in Community</Link>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}
