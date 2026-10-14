"use client";

import { useEffect, useRef, useState } from "react";
import { useSelector } from "react-redux";
import { toast } from "sonner";
import API from "@/services/api";

const REASONS = [
  { value: "scam", label: "Scam or fraud", hint: "Asks for money outside Byro, fake tickets" },
  { value: "misleading", label: "Misleading or fake", hint: "Not what it says it is" },
  { value: "inappropriate", label: "Offensive or inappropriate", hint: "Hateful, explicit or abusive" },
  { value: "safety", label: "Safety concern", hint: "Someone could get hurt" },
  { value: "spam", label: "Spam", hint: "Repeated or junk content" },
  { value: "other", label: "Something else", hint: "Tell us below" },
];

/** A quiet "Report" link that opens a short form. `target` is "event" or "community". */
export default function ReportButton({ target, slug, handle, name, className = "" }) {
  const token = useSelector((s) => s.auth?.token);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const dialog = useRef(null);
  const opener = useRef(null);

  useEffect(() => {
    if (!open) return;
    dialog.current?.querySelector("input")?.focus();
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    const back = opener.current;
    return () => {
      document.removeEventListener("keydown", onKey);
      back?.focus();
    };
  }, [open]);

  const submit = async (e) => {
    e.preventDefault();
    if (!reason) return;
    setSending(true);
    try {
      await API.sendReport({ target, slug, handle, reason, details: details.trim(), email: email.trim() || undefined });
      toast.success("Report sent", { description: "Thanks. Byro will look into it." });
      setOpen(false);
      setReason("");
      setDetails("");
    } catch (err) {
      toast.error("Couldn't send report", { description: err?.message || "Try again." });
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <button
        ref={opener}
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex items-center gap-1.5 text-[13px] font-semibold text-muted hover:text-ink focus:outline-none focus-visible:underline ${className}`}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M5 21V4M5 4h11l-2 4 2 4H5" />
        </svg>
        Report {target === "event" ? "this event" : "this community"}
      </button>

      {open && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-labelledby="report-title">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <form
            ref={dialog}
            onSubmit={submit}
            className="relative z-10 flex max-h-[90dvh] w-full max-w-md flex-col gap-4 overflow-y-auto overscroll-contain rounded-t-3xl bg-white p-6 text-ink sm:rounded-3xl"
          >
            <div>
              <h2 id="report-title" className="font-display text-xl font-bold">Report {name ? `“${name}”` : target === "event" ? "this event" : "this community"}</h2>
              <p className="mt-1 text-sm text-muted">Byro reviews every report. The organiser isn&apos;t told who reported them.</p>
            </div>

            <fieldset className="flex flex-col gap-1.5">
              <legend className="mb-1 text-sm font-bold">What&apos;s wrong?</legend>
              {REASONS.map((r) => (
                <label
                  key={r.value}
                  className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3.5 py-2.5 ${reason === r.value ? "border-brand bg-[#EEF3FF]" : "border-line hover:bg-paper"}`}
                >
                  <input
                    type="radio"
                    name="reason"
                    value={r.value}
                    checked={reason === r.value}
                    onChange={() => setReason(r.value)}
                    className="mt-1 accent-[#3669F6]"
                  />
                  <span className="flex flex-col">
                    <span className="text-sm font-bold">{r.label}</span>
                    <span className="text-xs text-muted">{r.hint}</span>
                  </span>
                </label>
              ))}
            </fieldset>

            <label className="flex flex-col gap-1.5 text-sm font-bold">
              Details {reason === "other" ? <span className="font-normal text-red-600">(needed)</span> : <span className="font-normal text-muted">(optional)</span>}
              <textarea
                name="details"
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                rows={3}
                maxLength={2000}
                autoComplete="off"
                placeholder="What happened…"
                className="w-full resize-none rounded-xl border border-line px-3.5 py-2.5 text-sm font-normal focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25"
              />
            </label>

            {!token && (
              <label className="flex flex-col gap-1.5 text-sm font-bold">
                Your email <span className="font-normal text-muted">(optional, so we can follow up)</span>
                <input
                  type="email"
                  name="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  placeholder="you@example.com…"
                  className="h-11 rounded-xl border border-line px-3.5 text-sm font-normal focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25"
                />
              </label>
            )}

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={!reason || sending || (reason === "other" && !details.trim())}
                className="h-11 flex-1 rounded-full bg-ink text-sm font-bold text-white transition-[filter,scale] hover:brightness-125 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {sending ? "Sending…" : "Send report"}
              </button>
              <button type="button" onClick={() => setOpen(false)} className="h-11 rounded-full px-5 text-sm font-bold text-muted hover:bg-paper hover:text-ink">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
