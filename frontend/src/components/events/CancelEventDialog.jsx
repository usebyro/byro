"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import API from "@/services/api";

const naira = (n) => `₦${Number(n || 0).toLocaleString("en-NG", { maximumFractionDigits: 2 })}`;

/**
 * Cancel an event: shows exactly what will happen, asks why, and makes the
 * organiser type the event's name before it goes ahead. Cancelling cannot be undone.
 */
export default function CancelEventDialog({ open, onClose, slug, eventName, onCancelled }) {
  const [preview, setPreview] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [reason, setReason] = useState("");
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const reasonRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setPreview(null);
    setLoadError("");
    setReason("");
    setTyped("");
    API.getCancelPreview(slug)
      .then((data) => {
        if (data.cancelled) setLoadError("This event has already been cancelled.");
        else setPreview(data.preview);
      })
      .catch((err) => setLoadError(err?.message || "Couldn't load the details. Try again."));
  }, [open, slug]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && !busy && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);

  if (!open) return null;

  const reasonOk = reason.trim().length >= 3;
  const nameOk = typed.trim().toLowerCase() === eventName.trim().toLowerCase();
  const canSubmit = Boolean(preview) && reasonOk && nameOk && !busy;
  const money = preview && Number(preview.refund_total) > 0;

  const submit = async () => {
    setBusy(true);
    try {
      const result = await API.cancelEvent(slug, reason.trim());
      toast.success("Event cancelled. Your attendees are being told.");
      onCancelled?.(result);
    } catch (err) {
      toast.error(err?.message || "Couldn't cancel the event. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-6 overflow-y-auto" role="dialog" aria-modal="true" aria-labelledby="cancel-title">
      <div className="w-full max-w-lg rounded-2xl bg-white p-5 md:p-6 shadow-xl my-auto">
        <h2 id="cancel-title" className="text-lg font-bold text-gray-900">Cancel {eventName}?</h2>
        <p className="mt-1 text-sm text-gray-600">This can&apos;t be undone.</p>

        {loadError ? (
          <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{loadError}</p>
        ) : !preview ? (
          <p className="mt-6 text-sm text-gray-500">Checking your sales…</p>
        ) : (
          <>
            <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-800">
              <p>
                <b>{preview.paid_tickets}</b> paid ticket{preview.paid_tickets === 1 ? "" : "s"} and{" "}
                <b>{preview.free_tickets}</b> free ticket{preview.free_tickets === 1 ? "" : "s"} will be cancelled.
              </p>
              {money && (
                <p className="mt-1">
                  Buyers will be refunded <b>{naira(preview.refund_total)}</b> in total, across {preview.paid_orders} order
                  {preview.paid_orders === 1 ? "" : "s"}.
                </p>
              )}
            </div>

            <ul className="mt-4 space-y-2 text-sm text-gray-700 list-disc pl-5">
              <li>Everyone with a ticket is emailed, with your reason.</li>
              <li>Tickets stop working and the event comes off Byro. Nobody can buy or register.</li>
              {money && (
                <>
                  <li>
                    Buyers get back the <b>ticket price</b> they paid, to the card or bank account they used. Byro&apos;s
                    service fee and the payment processing charge are <b>not</b> refunded.
                  </li>
                  <li>The Byro team sends the refunds, and each buyer is emailed when theirs goes out.</li>
                  <li>
                    The cancelled sales leave your balance. If money for this event was already paid out to you, it is taken
                    from your future ticket sales before you can withdraw again.
                  </li>
                </>
              )}
            </ul>

            <label className="mt-5 block text-sm font-semibold text-gray-900" htmlFor="cancel-reason">
              Why is it cancelled? <span className="font-normal text-gray-500">Your attendees will read this.</span>
            </label>
            <textarea
              id="cancel-reason"
              ref={reasonRef}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={500}
              rows={3}
              className="mt-1.5 w-full resize-none rounded-xl border border-gray-300 px-3.5 py-3 text-base md:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="The venue is no longer available."
            />

            <label className="mt-4 block text-sm font-semibold text-gray-900" htmlFor="cancel-confirm">
              Type <span className="font-mono text-gray-700">{eventName}</span> to confirm
            </label>
            <input
              id="cancel-confirm"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              className="mt-1.5 w-full rounded-xl border border-gray-300 px-3.5 py-3 text-base md:text-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
            />
          </>
        )}

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="min-h-[44px] rounded-xl border border-gray-300 px-4 text-sm font-semibold text-gray-800 hover:bg-gray-50 disabled:opacity-50"
          >
            Keep the event
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit}
            className="min-h-[44px] rounded-xl bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? "Cancelling…" : money ? "Cancel event and refund buyers" : "Cancel event"}
          </button>
        </div>
      </div>
    </div>
  );
}
