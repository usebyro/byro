"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Stamp from "@/components/brand/Stamp";
import SectionError from "@/components/dashboard/v2/SectionError";
import Delayed from "@/components/dashboard/v2/Delayed";
import { stampLook, stampMonth, stampWords } from "@/lib/stamps";
import API from "@/services/api";

const FIRST_PAGE = 24;

// The passport tab on Your events (boards 16p / 16pm): every stamp, grouped by month, newest first.
export default function Passport({ stamps, loading, failed, onRetry, openSlug, onOpenSlug }) {
  const [all, setAll] = useState(false);

  if (failed) {
    return (
      <section className="v-card v-bf" style={{ "--i": 1 }}>
        <SectionError what="your passport" onRetry={onRetry} />
      </section>
    );
  }
  if (loading) {
    return (
      <Delayed onRetry={onRetry}>
        <div aria-hidden="true" className="v-card grid grid-cols-3 gap-5 p-6 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
          {Array.from({ length: 12 }, (_, i) => (
            <span key={i} className="v-skel mx-auto h-[100px] w-[100px] !rounded-full" />
          ))}
        </div>
      </Delayed>
    );
  }
  if (!stamps.length) {
    return (
      <section aria-label="Your passport" className="v-card v-bf flex flex-col items-start gap-3 px-5 py-8 md:px-7 md:py-10" style={{ "--i": 1 }}>
        <h2 className="v-h2 !text-[22px]">No stamps yet</h2>
        <p className="m-0 max-w-[46ch] text-[15px] text-body">Get a ticket and check in at the door to collect your first.</p>
        <Link href="/discover" className="v-btn v-btn-p v-btn-lg mt-1.5">Find events</Link>
      </section>
    );
  }

  const shown = all ? stamps : stamps.slice(0, FIRST_PAGE);
  const months = [];
  shown.forEach((s) => {
    const label = stampMonth(s.day);
    const last = months[months.length - 1];
    if (last && last.label === label) last.stamps.push(s);
    else months.push({ label, stamps: [s] });
  });
  const communities = new Set(stamps.map((s) => s.organizer_handle || s.organizer_name)).size;
  const oldest = stamps[stamps.length - 1];
  const since = oldest?.day ? stampMonth(oldest.day).replace(/^(\w{3})\w*/, "$1") : "";
  const summary = [
    `${stamps.length} ${stamps.length === 1 ? "stamp" : "stamps"}`,
    `${communities} ${communities === 1 ? "community" : "communities"}`,
    since && `since ${since}`,
  ]
    .filter(Boolean)
    .join(" · ");
  const open = stamps.find((s) => s.event_slug === openSlug) || null;

  return (
    <section aria-labelledby="passport-title" className="v-bf flex flex-col gap-6" style={{ "--i": 1 }}>
      <div className="flex flex-col gap-1">
        <h2 id="passport-title" className="v-h2 !text-[22px]">Your passport</h2>
        <p className="v-hint m-0">{summary}</p>
      </div>

      {months.map((m) => (
        <section key={m.label} aria-label={m.label} className="flex flex-col gap-3">
          <h3 className="v-eyebrow m-0">{m.label}</h3>
          <ul className="m-0 grid list-none grid-cols-3 gap-x-3 gap-y-5 p-0 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
            {m.stamps.map((s) => {
              const look = stampLook(s);
              return (
                <li key={s.id} className="flex flex-col items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onOpenSlug(s.event_slug)}
                    aria-label={look.label}
                    className="v-press rounded-full border-0 bg-transparent p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  >
                    <Stamp name={look.name} city={look.city} date={look.date} ink={look.ink} shape={look.shape} tilt={look.tilt} size={100} filled />
                  </button>
                  <span aria-hidden="true" className="line-clamp-2 max-w-[120px] text-center text-[13px] font-bold leading-tight">{s.event_name}</span>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {!all && stamps.length > FIRST_PAGE && (
        <button type="button" onClick={() => setAll(true)} className="v-btn v-btn-s self-center">
          Show all {stamps.length} stamps
        </button>
      )}

      {open && <StampSheet stamp={open} onClose={() => onOpenSlug(null)} />}
    </section>
  );
}

function StampSheet({ stamp, onClose }) {
  const look = stampLook(stamp);
  const closeRef = useRef(null);
  const place = (stamp.location || "").split(",").pop().trim();
  const [share, setShare] = useState("idle"); // idle | busy | copied | failed | manual
  const [link, setLink] = useState("");
  const [shareError, setShareError] = useState("");

  // Phones open the share menu; elsewhere the link is copied. If the browser refuses both
  // (it can, once the request has taken a moment), the link is shown to copy by hand.
  const shareStamp = async () => {
    setShare("busy");
    setShareError("");
    let url;
    try {
      ({ url } = await API.shareStamp(stamp.id));
    } catch (err) {
      setShareError(err?.message || "");
      setShare("failed");
      return;
    }
    setLink(url);
    if (navigator.share) {
      try {
        await navigator.share({ title: `I was at ${stamp.event_name}`, url });
        setShare("idle");
        return;
      } catch (e) {
        if (e?.name === "AbortError") {
          setShare("idle");
          return;
        }
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setShare("copied");
    } catch {
      setShare("manual");
    }
  };

  useEffect(() => {
    const opener = document.activeElement;
    closeRef.current?.focus();
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      opener?.focus?.();
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <button type="button" aria-label="Close" onClick={onClose} className="v-scrim absolute inset-0 border-0 bg-[rgba(20,22,28,.4)]" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="stamp-title"
        className="v-sheet-up relative flex w-full flex-col items-center gap-4 rounded-t-[24px] bg-white px-6 pb-[calc(24px+env(safe-area-inset-bottom))] pt-6 text-center sm:w-[420px] sm:rounded-[24px] sm:pb-6"
      >
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-full border-0 bg-transparent text-ink hover:bg-mist focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
        <div role="img" aria-label={`Stamp: ${look.label}`}>
          <Stamp name={look.name} city={look.city} date={look.date} ink={look.ink} shape={look.shape} tilt={look.tilt} size={180} filled />
        </div>
        <div className="flex flex-col gap-1">
          <h2 id="stamp-title" className="v-d m-0 text-2xl font-bold leading-tight">{stamp.event_name}</h2>
          <p className="m-0 text-[15px] text-body">{[place, stampWords(stamp.day)].filter(Boolean).join(" · ")}</p>
          {stamp.organizer_name && (
            <p className="m-0 text-sm text-muted">
              With{" "}
              {stamp.organizer_handle ? (
                <Link href={`/u/${stamp.organizer_handle}`} className="font-bold text-brand-dark">{stamp.organizer_name}</Link>
              ) : (
                stamp.organizer_name
              )}
            </p>
          )}
        </div>
        <div className="flex w-full flex-col gap-2.5">
          <button type="button" onClick={shareStamp} disabled={share === "busy"} className="v-btn v-btn-p v-btn-lg w-full">
            {share === "busy" ? "Getting your link…" : share === "copied" ? "Copy the link again" : "Share this stamp"}
          </button>
          {stamp.event_slug && (
            <Link href={`/discover/${stamp.event_slug}`} className="v-btn v-btn-s v-btn-lg w-full">
              Event page
            </Link>
          )}
        </div>
        <p role="status" className="v-hint m-0 min-h-[20px]">
          {share === "copied"
            ? "Link copied. Anyone with it can see this stamp and your first name."
            : share === "failed"
              ? shareError || "Couldn't make the link. Try again."
              : share === "manual"
                ? "Your browser wouldn't copy it. Copy the link below. Anyone with it can see this stamp and your first name."
                : "Sharing shows this stamp and your first name to anyone with the link."}
        </p>
        {share === "manual" && link && (
          <input
            readOnly
            value={link}
            aria-label="Stamp link"
            onFocus={(e) => e.target.select()}
            className="w-full rounded-xl border border-hairline bg-mist px-3 py-2.5 text-sm text-ink"
          />
        )}
      </div>
    </div>
  );
}
