"use client";

import { useEffect, useState } from "react";
import API from "@/services/api";

const naira = (n) => `₦${Number(n || 0).toLocaleString("en-NG", { maximumFractionDigits: 2 })}`;

/** Shown to the organiser on a cancelled event: why, and where the buyers' refunds have got to. */
export default function CancelledPanel({ slug, reason, initial = null }) {
  const [progress, setProgress] = useState(initial);

  useEffect(() => {
    let live = true;
    let timer;
    const load = () =>
      API.getEventRefunds(slug)
        .then((p) => {
          if (!live) return;
          setProgress(p);
          // Keep watching until everything is back with the buyers.
          if (p.total_refunds > p.processed) timer = setTimeout(load, 30000);
        })
        .catch(() => {});
    load();
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [slug]);

  const p = progress;
  const hasMoney = p && p.total_refunds > 0;
  let line = "";
  if (hasMoney) {
    if (p.processed === p.total_refunds) line = "All refunds have been returned to your buyers.";
    else if (p.awaiting > 0 && p.processing + p.processed === 0) line = "Byro will check and send the refunds shortly. Each buyer is emailed when theirs goes out.";
    else if (p.failed > 0) line = `${p.failed} refund${p.failed === 1 ? "" : "s"} need${p.failed === 1 ? "s" : ""} Byro's attention. We'll sort it out and contact the buyer if we need anything.`;
    else line = "Refunds are being sent. Banks usually take 3–10 business days to show them.";
  }

  return (
    <section className="rounded-xl border border-red-200 bg-red-50 p-4 md:p-5" aria-label="Event cancelled">
      <p className="text-sm font-bold text-red-800">This event has been cancelled.</p>
      {reason && <p className="mt-1 text-sm text-red-900/80 break-words">Reason you gave: {reason}</p>}
      {hasMoney ? (
        <div className="mt-3 text-sm text-gray-800">
          <p>
            Refunds to buyers: <b>{naira(p.total_amount)}</b> across {p.total_refunds} order{p.total_refunds === 1 ? "" : "s"}
            {" "}(ticket price only; Byro&apos;s service fee and the payment charge are not refunded).
          </p>
          <p className="mt-1">
            {p.processed} of {p.total_refunds} returned to buyers
            {p.processed > 0 ? ` (${naira(p.processed_amount)})` : ""}.
          </p>
          <p className="mt-2 text-gray-700">{line}</p>
        </div>
      ) : (
        p && <p className="mt-2 text-sm text-gray-700">There was nothing to refund. Your attendees have been told.</p>
      )}
    </section>
  );
}
