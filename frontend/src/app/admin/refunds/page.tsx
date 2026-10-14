"use client";

import { useAdminMe } from "@/components/admin/AdminMe";
import { useConfirm, SkeletonRows } from "@/components/admin/ui";
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
    <div className={`bg-white border border-line rounded-xl px-5 py-4 ${tone ?? ""}`}>
      <p className="text-muted text-xs mb-1.5">{label}</p>
      <p className="text-ink text-2xl font-semibold tabular-nums">{value}</p>
      {note && <p className="text-faint text-xs mt-1">{note}</p>}
    </div>
  );
}

export default function AdminRefundsPage() {
  const { can } = useAdminMe();
  const [data, setData] = useState<RefundsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sending, setSending] = useState<number | null>(null);
  const ask = useConfirm();
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
        void askSend(e, json.error);
        return;
      }
      if (!res.ok) throw new Error(json.error || "failed");
      setProgress(e.event_id, json);
      setSending(null);
      void drain(e.event_id);
    } catch (err) {
      setSending(null);
      setError(err instanceof Error && err.message !== "failed" ? err.message : "Couldn't send those refunds. Please try again.");
    }
  };

  // Ask before sending money back. If Paystack's balance looks too low, the server says so and we ask again, with the warning.
  const askSend = async (e: EventRefunds, lowBalance?: string) => {
    const n = e.progress.awaiting;
    const ok = await ask({
      title: lowBalance ? "Paystack's balance looks too low" : `Send ${n} refund${n === 1 ? "" : "s"} for ${e.name}?`,
      body: (
        <>
          <p>
            {n} buyer{n === 1 ? "" : "s"} get <b className="text-ink">{naira(e.progress.awaiting_amount)}</b> back in total: the
            ticket price they paid, to the card or bank account they used. Byro&apos;s service fee and Paystack&apos;s charge
            aren&apos;t refunded. This can&apos;t be undone.
          </p>
          <p className="mt-2 text-muted">
            Paystack balance: {data?.paystack_balance != null ? naira(data.paystack_balance) : "couldn't be checked"}.
          </p>
          {lowBalance && (
            <p className="mt-3 rounded-lg bg-waiting-tint px-3 py-2 text-waiting">
              {lowBalance} Refunds can also come out of the next payout, but any Paystack can&apos;t cover will fail and can be
              retried after you top up.
            </p>
          )}
        </>
      ),
      confirmLabel: lowBalance ? "Send anyway" : `Send ${naira(e.progress.awaiting_amount)}`,
      tone: lowBalance ? "danger" : "primary",
    });
    if (ok) send(e, Boolean(lowBalance));
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
        <h1 className="font-display text-ink text-3xl font-extrabold tracking-tight">Refunds</h1>
        <p className="text-muted text-sm mt-1">
          Events organisers have cancelled, and the ticket price owed back to each buyer. Check the Paystack
          balance, then send. Byro&apos;s service fee and Paystack&apos;s charge are never refunded.
        </p>
      </div>

      {error && (
        <div role="alert" className="mb-6 bg-danger-tint border border-danger-hover rounded-xl px-4 py-3">
          <p className="text-danger text-xs">{error}</p>
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
        <SkeletonRows rows={4} />
      ) : events.length === 0 ? (
        <div className="bg-white border border-line rounded-xl p-6">
          <p className="text-faint text-sm text-center py-4">No cancelled events have refunds yet.</p>
        </div>
      ) : (
        <div className="space-y-5">
          {events.map((e) => {
            const p = e.progress;
            const busy = sending === e.event_id;
            const sentCount = p.processing + p.processed;
            return (
              <section key={e.event_id} className="bg-white border border-line rounded-xl p-4 md:p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h2 className="text-ink font-semibold truncate">{e.name}</h2>
                    <p className="text-faint text-xs mt-0.5">Organiser: {e.owner_email}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {p.awaiting > 0 && can.payouts && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => askSend(e)}
                        className="h-9 px-4 rounded-lg bg-brand text-white text-xs font-semibold hover:bg-brand-dark disabled:opacity-50"
                      >
                        Send {p.awaiting} refund{p.awaiting === 1 ? "" : "s"} · {naira(p.awaiting_amount)}
                      </button>
                    )}
                    {p.failed > 0 && can.payouts && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => retry(e)}
                        className="h-9 px-4 rounded-lg border border-line text-body text-xs font-semibold hover:bg-mist disabled:opacity-50"
                      >
                        Retry {p.failed} failed
                      </button>
                    )}
                    {p.awaiting > 0 && !can.payouts && (
                      <span className="text-xs text-faint">An admin needs to send these.</span>
                    )}
                  </div>
                </div>

                <dl className="mt-5 grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
                  <div><dt className="text-faint text-xs">Total owed</dt><dd className="text-ink tabular-nums">{naira(p.total_amount)} <span className="text-faint text-xs">({p.total_refunds})</span></dd></div>
                  <div><dt className="text-faint text-xs">Awaiting approval</dt><dd className="text-waiting tabular-nums">{p.awaiting}</dd></div>
                  <div><dt className="text-faint text-xs">Sent to Paystack</dt><dd className="text-body tabular-nums">{sentCount}</dd></div>
                  <div><dt className="text-faint text-xs">Returned to buyers</dt><dd className="text-good tabular-nums">{p.processed} <span className="text-faint text-xs">{naira(p.processed_amount)}</span></dd></div>
                  <div><dt className="text-faint text-xs">Need attention</dt><dd className={`tabular-nums ${p.failed ? "text-danger" : "text-muted"}`}>{p.failed}</dd></div>
                </dl>

                {busy && (
                  <p className="mt-4 text-xs text-muted" aria-live="polite">
                    Sending refunds… {sentCount} of {p.total_refunds} sent. Keep this page open.
                  </p>
                )}

                {e.problems.length > 0 && (
                  <div className="mt-5 border-t border-hairline pt-4">
                    <p className="text-body text-xs font-medium mb-1">Refunds that need you</p>
                    <p className="text-faint text-xs mb-3">
                      If Paystack didn&apos;t capture the buyer&apos;s bank details (it can happen with transfers and
                      USSD), open the payment reference in your Paystack dashboard and enter their account there.
                      If Paystack&apos;s balance was too low, top it up and press Retry.
                    </p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-left text-faint">
                            <th scope="col" className="pb-2 pr-4 font-medium">Buyer</th>
                            <th scope="col" className="pb-2 pr-4 font-medium">Amount</th>
                            <th scope="col" className="pb-2 pr-4 font-medium">Status</th>
                            <th scope="col" className="pb-2 pr-4 font-medium">Reason</th>
                            <th scope="col" className="pb-2 font-medium">Paystack reference</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-hairline">
                          {e.problems.map((r) => (
                            <tr key={r.refund_id}>
                              <td className="py-2 pr-4 text-body">{r.email}</td>
                              <td className="py-2 pr-4 text-body tabular-nums">{naira(r.amount)}</td>
                              <td className="py-2 pr-4 text-danger">{r.status === "needs_attention" ? "Needs attention" : "Failed"}</td>
                              <td className="py-2 pr-4 text-muted max-w-[260px]">{r.reason || "—"}</td>
                              <td className="py-2 text-muted font-mono break-all">{r.reference}</td>
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

    </div>
  );
}
