"use client";

import { useEffect, useRef, useState } from "react";
import { toPng } from "html-to-image";
import API from "@/services/api";
import { formatNaira } from "@/lib/eventFormat";

const LABEL = "text-[11px] font-extrabold tracking-[0.1em] text-[#5B6272] uppercase";

function formatDate(day) {
  if (!day) return "";
  return new Date(`${day}T00:00:00`).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatTime(time) {
  if (!time) return "";
  return new Date(`1970-01-01T${time}`).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function priceText(ticket) {
  const n = Number(ticket.ticket_price);
  return n > 0 ? formatNaira(n) : "Free";
}

function status(ticket) {
  if (ticket.checked_in) {
    return { text: "Checked in", tone: "bg-[#EEF2FF] text-[#2451D6]", dot: "bg-[#3669F6]" };
  }
  if (ticket.payment_status === "paid" || ticket.payment_status === "free") {
    return { text: "Valid · show this at the door", tone: "bg-[#E9F7EF] text-[#1F7A52]", dot: "bg-[#2F9E6E]" };
  }
  return { text: "Payment not confirmed", tone: "bg-[#FFF4E5] text-[#9A5B00]", dot: "bg-[#E08A00]" };
}

export default function TicketCard({ ticket }) {
  const cardRef = useRef(null);
  const [qrSrc, setQrSrc] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  // Load the QR as a data URL so the card can be rendered to an image:
  // a cross-origin <img> would taint the capture.
  useEffect(() => {
    let cancelled = false;
    fetch(API.getTicketQrUrl(ticket.ticket_id))
      .then((r) => (r.ok ? r.blob() : Promise.reject()))
      .then(
        (blob) =>
          new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.readAsDataURL(blob);
          }),
      )
      .then((src) => { if (!cancelled) setQrSrc(src); })
      .catch(() => { if (!cancelled) setQrSrc(API.getTicketQrUrl(ticket.ticket_id)); });
    return () => { cancelled = true; };
  }, [ticket.ticket_id]);

  const saveImage = async () => {
    if (!cardRef.current) return;
    setSaving(true);
    setSaveError("");
    try {
      const dataUrl = await toPng(cardRef.current, { pixelRatio: 2, backgroundColor: "#F7F9FC" });
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `${ticket.event_slug || "byro"}-ticket.png`;
      a.click();
    } catch {
      setSaveError("Couldn't save the image. A screenshot works too.");
    } finally {
      setSaving(false);
    }
  };

  const st = status(ticket);
  const directions = ticket.event_location
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(ticket.event_location)}`
    : null;

  return (
    <div className="w-full">
      <div ref={cardRef} className="bg-[#F7F9FC] pb-1">
        <article className="overflow-hidden rounded-[28px] border border-[#E3E8F0] bg-white">
          <div className="flex flex-col gap-3.5 px-[22px] pt-6 pb-[18px]">
            <div className="flex flex-col gap-2">
              <h1
                className="text-[32px] sm:text-4xl font-bold leading-[1.05] tracking-[-0.02em] text-[#14161C] break-words"
                style={{ fontFamily: "var(--font-display), sans-serif" }}
              >
                {ticket.event_name}
              </h1>
              {ticket.event_hosted_by && (
                <p className="text-sm text-[#5B6272]">Hosted by {ticket.event_hosted_by}</p>
              )}
            </div>

            <div className="flex items-center justify-between gap-3 rounded-2xl border border-[#E3E8F0] px-3.5 py-3">
              <div className="min-w-0">
                <p className={LABEL}>Ticket</p>
                <p className="truncate text-base font-extrabold text-[#14161C]">
                  {ticket.tier_name || "General admission"}
                </p>
              </div>
              <span className="shrink-0 text-base font-extrabold text-[#14161C] tabular-nums">
                {priceText(ticket)}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-x-3 gap-y-3.5">
              <div>
                <p className={LABEL}>Date</p>
                <p className="text-[15px] font-extrabold text-[#14161C]">{formatDate(ticket.event_date)}</p>
              </div>
              {ticket.event_time && (
                <div>
                  <p className={LABEL}>Time</p>
                  <p className="text-[15px] font-extrabold text-[#14161C]">{formatTime(ticket.event_time)}</p>
                </div>
              )}
              {ticket.event_location && (
                <div>
                  <p className={LABEL}>Venue</p>
                  <p className="text-[15px] font-extrabold text-[#14161C]">{ticket.event_location}</p>
                  {directions && (
                    <a
                      href={directions}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[13px] font-bold text-[#3669F6] hover:text-[#2451D6]"
                    >
                      Get directions
                    </a>
                  )}
                </div>
              )}
              <div className="min-w-0">
                <p className={LABEL}>Attendee</p>
                <p className="text-[15px] font-extrabold text-[#14161C] break-words">{ticket.current_owner_name}</p>
                <p className="truncate text-[13px] text-[#5B6272]">{ticket.current_owner_email}</p>
              </div>
            </div>
          </div>

          {/* Tear line */}
          <div aria-hidden="true" className="relative flex h-6 items-center">
            <span className="absolute -left-3 h-6 w-6 rounded-full border-r border-[#E3E8F0] bg-[#F7F9FC]" />
            <span className="mx-[22px] grow border-t-2 border-dashed border-[#E3E8F0]" />
            <span className="absolute -right-3 h-6 w-6 rounded-full border-l border-[#E3E8F0] bg-[#F7F9FC]" />
          </div>

          <div className="flex flex-col items-center gap-3 px-[22px] pt-4 pb-6">
            <div className="rounded-[18px] border border-[#E3E8F0] p-2.5">
              {qrSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={qrSrc}
                  alt="Ticket QR code"
                  className="block h-[180px] w-[180px] sm:h-[208px] sm:w-[208px]"
                />
              ) : (
                <div className="h-[180px] w-[180px] animate-pulse rounded-lg bg-[#F0F3F8] sm:h-[208px] sm:w-[208px]" />
              )}
            </div>
            <span className={`flex h-7 items-center gap-1.5 rounded-full px-3 text-[13px] font-extrabold ${st.tone}`}>
              <span className={`h-[7px] w-[7px] rounded-full ${st.dot}`} />
              {st.text}
            </span>
          </div>
        </article>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2.5">
        <a
          href={API.getTicketCalendarUrl(ticket.ticket_id)}
          className="flex h-[50px] items-center justify-center rounded-full bg-[#14161C] text-[15px] font-bold text-white transition-colors hover:bg-[#2A2D36]"
        >
          Add to calendar
        </a>
        <button
          type="button"
          onClick={saveImage}
          disabled={saving || !qrSrc}
          className="flex h-[50px] items-center justify-center rounded-full border border-[#E3E8F0] bg-white text-[15px] font-bold text-[#14161C] transition-colors hover:bg-[#F0F3F8] disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save ticket image"}
        </button>
      </div>
      {saveError && <p role="alert" className="mt-3 text-center text-[13px] text-red-600">{saveError}</p>}
      <p className="mt-4 text-center text-[13px] text-[#5B6272]">
        We also emailed this ticket. Screenshots work at the door, no app needed.
      </p>
    </div>
  );
}
