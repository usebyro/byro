"use client";

import { useAdminMe } from "@/components/admin/AdminMe";
import { useCallback, useEffect, useRef, useState } from "react";

interface Progress {
  total_refunds: number;
  total_amount: string;
  awaiting: number;
  awaiting_amount: string;
  waiting: number;
  processing: number;
  processed: number;
  processed_amount: string;
  failed: number;
  waiting_notices: number;
  done: boolean;
}

interface Problem {
  refund_id: number;
  email: string;
  name: string;
  amount: string;
  status: string;
  reason: string;
  reference: string;
}

interface EventRefunds {
  event_id: number;
  name: string;
  slug: string;
  owner_email: string;
  progress: Progress;
  problems: Problem[];
}

interface RefundsResponse {
  paystack_balance: string | null;
  awaiting_total: string;
  events: EventRefunds[];
}

const naira = (n: string | number) => `₦${Number(n).toLocaleString("en-NG", { maximumFractionDigits: 2 })}`;

function Stat({ label, value, note, tone }: { label: string; value: string; note?: string; tone?: string }) {
  return (
    <div className={`bg-[#1a1d27] border border-white/10 rounded-xl px-5 py-4 ${tone ?? ""}`}>
      <p className="text-gray-400 text-xs mb-1.5">{label}</p>
      <p className="text-white text-2xl font-semibold tabular-nums">{value}</p>
      {note && <p className="text-gray-500 text-xs mt-1">{note}</p>}
    </div>
  );
}

export default function AdminRefundsPage() {
  const { can } = useAdminMe();
  const [data, setData] = useState<RefundsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sending, setSending] = useState<number | null>(null);
  const [confirm, setConfirm] = useState<{ event: EventRefunds; lowBalance?: string } | null>(null);
  const looping = useRef<Set<number>>(new Set());

  const load = useCallback(async () => {
    setError("");
    try {
      const res = await fetch("/api/admin/refunds");
      if (!res.ok) throw new Error();
      setData(await res.json());
    } catch {
      setError("Couldn't load refunds.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const setProgress = (eventId: number, progress: Progress) =>
    setData((d) =>
      d ? { ...d, events: d.events.map((e) => (e.event_id === eventId ? { ...e, progress } : e)) } : d,
    );

  const post = async (eventId: number, body: Record<string, unknown>) => {
    const res = await fetch(`/api/admin/events/${eventId}/refunds`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return { res, json: await res.json().catch(() => ({})) };
  };

  // Keep sending batches until nothing approved is left. Stops on any error.
  const drain = useCallback(async (eventId: number) => {
    if (looping.current.has(eventId)) return;
    looping.current.add(eventId);
    setSending(eventId);
    try {
      for (let i = 0; i < 200; i++) {
        const { res, json } = await post(eventId, { action: "continue" });
        if (!res.ok) throw new Error(json.error || "failed");
        setProgress(eventId, json);
        if (json.waiting === 0 && json.waiting_notices === 0) break;
        await new Promise((r) => setTimeout(r, 400));
      }
    } catch {
      setError("Sending stopped. Check the list below, then use Retry or Continue.");
    } finally {
      looping.current.delete(eventId);
      setSending(null);
      load();
    }
  }, [load]);

  // Pick up approved refunds that were left half-sent.
  useEffect(() => {
    if (!data || !can.payouts) return;
    data.events.forEach((e) => {
      if (e.progress.waiting > 0 || e.progress.waiting_notices > 0) void drain(e.event_id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.events.length, can.payouts]);

  const send = async (e: EventRefunds, confirmLow = false) => {
    setError("");
    setSending(e.event_id);
    try {
      const { res, json } = await post(e.event_id, { action: "send", ...(confirmLow ? { confirm_low_balance: true } : {}) });
      if (res.status === 409 && json.code === "low_balance") {
        setSending(null);
        setConfirm({ event: e, lowBalance: json.error });
        return;
      }
      if (!res.ok) throw new Error(json.error || "failed");
      setConfirm(null);
      setProgress(e.event_id, json);
      setSending(null);
      void drain(e.event_id);
    } catch (err) {
      setConfirm(null);
      setSending(null);
      setError(err instanceof Error && err.message !== "failed" ? err.message : "Couldn't send those refunds. Please try again.");
    }
  };

  const retry = async (e: EventRefunds) => {
    setError("");
    setSending(e.event_id);
    try {
      const { res, json } = await post(e.event_id, { action: "retry" });
      if (!res.ok) throw new Error(json.error || "failed");
      setProgress(e.event_id, json);
      setSending(null);
      void drain(e.event_id);
      load();
    } catch {
      setSending(null);
      setError("Couldn't retry those refunds. Please try again.");
    }
  };

  const events = data?.events ?? [];
  const failedCount = events.reduce((n, e) => n + e.progress.failed, 0);
  const inProgress = events.reduce((n, e) => n + e.progress.waiting + e.progress.processing, 0);

  return (
    <div className="p-5 md:p-8">
      <div className="mb-6">
        <h1 className="text-white text-xl font-bold">Refunds</h1>
        <p className="text-gray-400 text-sm mt-1">
          Events organisers have cancelled, and the ticket price owed back to each buyer. Check the Paystack
          balance, then send. Byro&apos;s service fee and Paystack&apos;s charge are never refunded.
        </p>
      </div>

      {error && (
        <div role="alert" className="mb-6 bg-red-500/5 border border-red-500/20 rounded-xl px-4 py-3">
          <p className="text-red-300 text-xs">{error}</p>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <Stat
          label="Paystack balance"
          value={data?.paystack_balance != null ? naira(data.paystack_balance) : "—"}
          note={data && data.paystack_balance == null ? "Couldn't check it just now" : "Available for refunds"}
        />
        <Stat
          label="Awaiting your approval"
          value={naira(data?.awaiting_total ?? 0)}
          note="Not sent until you approve"
          tone="border-l-2 border-l-yellow-500/50"
        />
        <Stat label="In progress" value={String(inProgress)} note="Sending or with Paystack" />
        <Stat
          label="Need attention"
          value={String(failedCount)}
          note="Failed or need bank details"
          tone={failedCount ? "border-l-2 border-l-red-500/50" : ""}
        />
      </div>

      {loading ? (
        <p className="text-gray-500 text-sm text-center py-8">Loading…</p>
      ) : events.length === 0 ? (
        <div className="bg-[#1a1d27] border border-white/10 rounded-xl p-6">
          <p className="text-gray-500 text-sm text-center py-4">No cancelled events have refunds yet.</p>
        </div>
      ) : (
        <div className="space-y-5">
          {events.map((e) => {
            const p = e.progress;
            const busy = sending === e.event_id;
            const sentCount = p.processing + p.processed;
            return (
              <section key={e.event_id} className="bg-[#1a1d27] border border-white/10 rounded-xl p-4 md:p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h2 className="text-white font-semibold truncate">{e.name}</h2>
                    <p className="text-gray-500 text-xs mt-0.5">Organiser: {e.owner_email}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {p.awaiting > 0 && can.payouts && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setConfirm({ event: e })}
                        className="h-9 px-4 rounded-lg bg-[#4F6EF7] text-white text-xs font-semibold hover:bg-blue-600 disabled:opacity-50"
                      >
                        Send {p.awaiting} refund{p.awaiting === 1 ? "" : "s"} · {naira(p.awaiting_amount)}
                      </button>
                    )}
                    {p.failed > 0 && can.payouts && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => retry(e)}
                        className="h-9 px-4 rounded-lg border border-white/15 text-gray-200 text-xs font-semibold hover:bg-white/5 disabled:opacity-50"
                      >
                        Retry {p.failed} failed
                      </button>
                    )}
                    {p.awaiting > 0 && !can.payouts && (
                      <span className="text-xs text-gray-500">An admin needs to send these.</span>
                    )}
                  </div>
                </div>

                <dl className="mt-5 grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
                  <div><dt className="text-gray-500 text-xs">Total owed</dt><dd className="text-white tabular-nums">{naira(p.total_amount)} <span className="text-gray-500 text-xs">({p.total_refunds})</span></dd></div>
                  <div><dt className="text-gray-500 text-xs">Awaiting approval</dt><dd className="text-yellow-300 tabular-nums">{p.awaiting}</dd></div>
                  <div><dt className="text-gray-500 text-xs">Sent to Paystack</dt><dd className="text-gray-200 tabular-nums">{sentCount}</dd></div>
                  <div><dt className="text-gray-500 text-xs">Returned to buyers</dt><dd className="text-green-400 tabular-nums">{p.processed} <span className="text-gray-500 text-xs">{naira(p.processed_amount)}</span></dd></div>
                  <div><dt className="text-gray-500 text-xs">Need attention</dt><dd className={`tabular-nums ${p.failed ? "text-red-400" : "text-gray-400"}`}>{p.failed}</dd></div>
                </dl>

                {busy && (
                  <p className="mt-4 text-xs text-gray-400" aria-live="polite">
                    Sending refunds… {sentCount} of {p.total_refunds} sent. Keep this page open.
                  </p>
                )}

                {e.problems.length > 0 && (
                  <div className="mt-5 border-t border-white/5 pt-4">
                    <p className="text-gray-300 text-xs font-medium mb-1">Refunds that need you</p>
                    <p className="text-gray-500 text-xs mb-3">
                      If Paystack didn&apos;t capture the buyer&apos;s bank details (it can happen with transfers and
                      USSD), open the payment reference in your Paystack dashboard and enter their account there.
                      If Paystack&apos;s balance was too low, top it up and press Retry.
                    </p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-left text-gray-500">
                            <th className="pb-2 pr-4 font-medium">Buyer</th>
                            <th className="pb-2 pr-4 font-medium">Amount</th>
                            <th className="pb-2 pr-4 font-medium">Status</th>
                            <th className="pb-2 pr-4 font-medium">Reason</th>
                            <th className="pb-2 font-medium">Paystack reference</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {e.problems.map((r) => (
                            <tr key={r.refund_id}>
                              <td className="py-2 pr-4 text-gray-200">{r.email}</td>
                              <td className="py-2 pr-4 text-gray-200 tabular-nums">{naira(r.amount)}</td>
                              <td className="py-2 pr-4 text-red-300">{r.status === "needs_attention" ? "Needs attention" : "Failed"}</td>
                              <td className="py-2 pr-4 text-gray-400 max-w-[260px]">{r.reason || "—"}</td>
                              <td className="py-2 text-gray-400 font-mono break-all">{r.reference}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" role="dialog" aria-modal="true" aria-label="Send refunds">
          <div className="w-full max-w-md rounded-xl border border-white/10 bg-[#1a1d27] p-5">
            <h3 className="text-white font-semibold">Send these refunds?</h3>
            <p className="text-gray-300 text-sm mt-3">
              {confirm.event.progress.awaiting} buyer{confirm.event.progress.awaiting === 1 ? "" : "s"} of{" "}
              <b className="text-white">{confirm.event.name}</b> will get{" "}
              <b className="text-white">{naira(confirm.event.progress.awaiting_amount)}</b> back, the ticket price
              they paid, on the card or bank account they used. Byro&apos;s service fee and Paystack&apos;s charge are
              not refunded.
            </p>
            <p className="text-gray-400 text-xs mt-3">
              Paystack balance: {data?.paystack_balance != null ? naira(data.paystack_balance) : "couldn't be checked"}.
            </p>
            {confirm.lowBalance && (
              <p role="alert" className="mt-3 rounded-lg border border-yellow-500/30 bg-yellow-500/5 px-3 py-2 text-xs text-yellow-200">
                {confirm.lowBalance} Refunds can also be taken from your next payout, but any Paystack can&apos;t
                cover will fail and can be retried after you top up.
              </p>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setConfirm(null)} className="h-9 px-4 rounded-lg border border-white/15 text-gray-200 text-xs font-semibold hover:bg-white/5">
                Cancel
              </button>
              <button
                type="button"
                disabled={sending === confirm.event.event_id}
                onClick={() => send(confirm.event, Boolean(confirm.lowBalance))}
                className="h-9 px-4 rounded-lg bg-[#4F6EF7] text-white text-xs font-semibold hover:bg-blue-600 disabled:opacity-50"
              >
                {confirm.lowBalance ? "Send anyway" : "Send refunds"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
