"use client";

import { useAdminMe } from "@/components/admin/AdminMe";
import { useConfirm, SkeletonRows, throwIfFailed } from "@/components/admin/ui";
import { useEffect, useState, useCallback } from "react";

type PayoutStatus = "pending" | "on_hold" | "processed" | "rejected";

interface PayoutRequest {
  id: number;
  user_email: string;
  event: number | null;
  event_name: string | null;
  amount: string;
  currency: string;
  method: "bank" | "wallet";
  bank_name: string;
  account_number: string;
  account_name: string;
  wallet_address: string;
  wallet_type: string;
  status: PayoutStatus;
  hold_reason?: string;
  requested_at: string;
  processed_at: string | null;
}

function fmtNaira(n: string | number) {
  return `₦${Number(n).toLocaleString()}`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function destinationOf(p: PayoutRequest) {
  if (p.method === "wallet") return p.wallet_address || "—";
  return p.account_number ? `${p.bank_name} ···· ${p.account_number.slice(-4)}` : p.bank_name;
}

/** Where the money goes, in full for admins who send payouts: bank, account number (with copy) and account name. */
function Destination({ p, full }: { p: PayoutRequest; full: boolean }) {
  const [copied, setCopied] = useState(false);
  const number = p.method === "wallet" ? p.wallet_address : p.account_number;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(number);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };
  if (!full || !number) return <span className="capitalize">{destinationOf(p)}</span>;
  return (
    <span className="flex flex-col gap-0.5">
      <span className="font-semibold text-ink">{p.method === "wallet" ? p.wallet_type || "Wallet" : p.bank_name}</span>
      <span className="flex items-center gap-2">
        <span className="font-mono text-body tabular-nums break-all">{number}</span>
        <button
          type="button"
          onClick={copy}
          aria-label={`Copy ${p.method === "wallet" ? "wallet address" : "account number"}`}
          className="shrink-0 rounded-md px-1.5 py-0.5 text-xs font-bold text-brand-dark hover:bg-mist"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </span>
      {p.method !== "wallet" && p.account_name && <span className="text-xs text-muted">{p.account_name}</span>}
    </span>
  );
}

function StatusBadge({ status }: { status: PayoutStatus }) {
  const style =
    status === "processed"
      ? "bg-good-tint text-good"
      : status === "rejected"
        ? "bg-danger-tint text-danger"
        : status === "on_hold"
          ? "bg-mist text-ink"
          : "bg-waiting-tint text-waiting";
  const dot =
    status === "processed" ? "bg-stamp-green" : status === "rejected" ? "bg-danger-strong" : status === "on_hold" ? "bg-muted" : "bg-marigold";

  return (
    <span className={`inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full font-medium ${style}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
      {status === "on_hold" ? "On hold" : status[0].toUpperCase() + status.slice(1)}
    </span>
  );
}

export default function AdminPayoutsPage() {
  const { can } = useAdminMe();
  const [payouts, setPayouts] = useState<PayoutRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const confirm = useConfirm();

  const loadPayouts = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/payouts");
      if (!res.ok) throw new Error("Failed to load payouts");
      const data = await res.json();
      setPayouts(Array.isArray(data) ? data : []);
    } catch {
      setError("Couldn't load payout requests.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPayouts();
  }, [loadPayouts]);

  const updateStatus = async (id: number, status: "processed" | "rejected" | "on_hold" | "pending", reason?: string) => {
    setUpdatingId(id);
    try {
      const res = await fetch(`/api/admin/payouts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reason ? { status, reason } : { status }),
      });
      await throwIfFailed(res);
      const updated = await res.json();
      setPayouts((prev) => prev.map((p) => (p.id === id ? updated : p)));
    } catch (err) {
      setError(`Couldn't ${{ processed: "process", rejected: "reject", on_hold: "hold", pending: "release" }[status]} that payout. ${err instanceof Error && err.message ? err.message : "Try again."}`);
    } finally {
      setUpdatingId(null);
    }
  };

  const deletePayout = async (id: number) => {
    setUpdatingId(id);
    try {
      const res = await fetch(`/api/admin/payouts/${id}`, { method: "DELETE" });
      if (res.status !== 204) await throwIfFailed(res);
      setPayouts((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      setError(`Couldn't delete that payout. ${err instanceof Error && err.message ? err.message : "Try again."}`);
    } finally {
      setUpdatingId(null);
    }
  };

  const pending = payouts.filter((p) => p.status === "pending" || p.status === "on_hold");
  const heldCount = payouts.filter((p) => p.status === "on_hold").length;
  const processed = payouts.filter((p) => p.status === "processed");
  const rejected = payouts.filter((p) => p.status === "rejected");

  const sumOf = (list: PayoutRequest[]) => list.reduce((s, p) => s + Number(p.amount || 0), 0);
  const outstandingAmount = sumOf(pending);
  const paidOutAmount = sumOf(processed);
  const totalVolume = sumOf(payouts); // pending + processed + rejected, lifetime


  // One proper dialog for each payout decision, showing who gets what.
  const askPayout = async (p: PayoutRequest, action: "processed" | "rejected" | "hold" | "release" | "delete") => {
    const who = (
      <span className="mt-3 block rounded-xl bg-mist px-3.5 py-2.5">
        <span className="block truncate font-bold text-ink">{p.user_email}</span>
        <span className="block tabular-nums text-muted">
          {fmtNaira(p.amount)} to {destinationOf(p)}
        </span>
      </span>
    );
    const copy = {
      processed: {
        title: "Mark this payout as paid?",
        body: <>Only do this once the money has actually left Byro&apos;s account. The organiser is told it&apos;s been paid.{who}</>,
        confirmLabel: "Mark as paid",
        tone: "primary" as const,
      },
      rejected: {
        title: "Reject this payout request?",
        body: <>The organiser is told, and has to send a new request to get this money.{who}</>,
        confirmLabel: "Reject request",
        tone: "danger" as const,
      },
      hold: {
        title: "Put this payout on hold?",
        body: <>The money stays reserved against the organiser&apos;s balance, nothing is paid, and the organiser sees your reason. Use it while you verify them or the event.{who}</>,
        confirmLabel: "Put on hold",
        tone: "danger" as const,
        input: { label: "Reason (the organiser sees this)", placeholder: "We need a copy of your ID before we can pay this out", required: true, multiline: true, maxLength: 500 },
      },
      release: {
        title: "Release this payout?",
        body: <>It goes back to pending and is processed on the next business day. The organiser is told.{who}</>,
        confirmLabel: "Release",
        tone: "primary" as const,
      },
      delete: {
        title: "Delete this payout request for good?",
        body: (
          <>
            For bad or test data only, not for undoing a real payout. If it was already paid, deleting it doesn&apos;t reverse the
            transfer; it only stops this amount counting against the organiser&apos;s balance.{who}
          </>
        ),
        confirmLabel: "Delete request",
        tone: "danger" as const,
      },
    }[action];
    const answer = await confirm(copy);
    if (!answer) return;
    if (action === "delete") deletePayout(p.id);
    else if (action === "hold") updateStatus(p.id, "on_hold", String(answer));
    else if (action === "release") updateStatus(p.id, "pending");
    else updateStatus(p.id, action);
  };

  return (
    <div className="p-5 md:p-8">
      <div className="mb-6">
        <h1 className="font-display text-ink text-3xl font-extrabold tracking-tight">Payouts</h1>
        <p className="text-muted text-sm mt-1">Review and process organiser payout requests</p>
      </div>

      {error && (
        <div className="mb-6 bg-danger-tint border border-danger-hover rounded-xl px-4 py-3">
          <p className="text-danger text-xs">{error}</p>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-white border border-line rounded-xl px-5 py-4 border-l-2 border-l-yellow-500/50">
          <p className="text-muted text-xs mb-1.5">Outstanding</p>
          <p className="text-ink text-2xl font-semibold tabular-nums">{fmtNaira(outstandingAmount)}</p>
          <p className="text-faint text-xs mt-1">{pending.length} pending{heldCount ? `, ${heldCount} on hold` : ""}</p>
        </div>
        <div className="bg-white border border-line rounded-xl px-5 py-4 border-l-2 border-l-green-500/50">
          <p className="text-muted text-xs mb-1.5">Total paid out</p>
          <p className="text-ink text-2xl font-semibold tabular-nums">{fmtNaira(paidOutAmount)}</p>
          <p className="text-faint text-xs mt-1">{processed.length} processed</p>
        </div>
        <div className="bg-white border border-line rounded-xl px-5 py-4">
          <p className="text-muted text-xs mb-1.5">Total volume</p>
          <p className="text-ink text-2xl font-semibold tabular-nums">{fmtNaira(totalVolume)}</p>
          <p className="text-faint text-xs mt-1">{payouts.length} requests, all-time</p>
        </div>
        <div className="bg-white border border-line rounded-xl px-5 py-4">
          <p className="text-muted text-xs mb-1.5">Rejected</p>
          <p className="text-ink text-2xl font-semibold tabular-nums">{rejected.length}</p>
          <p className="text-faint text-xs mt-1">{fmtNaira(sumOf(rejected))} requested</p>
        </div>
      </div>

      <div className="bg-white border border-line rounded-xl p-4 md:p-6">
        {loading ? (
          <SkeletonRows rows={4} />
        ) : payouts.length === 0 ? (
          <p className="text-faint text-sm text-center py-8">No payout requests yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hairline text-left">
                  <th scope="col" className="pb-3 pr-6 text-xs text-faint font-medium whitespace-nowrap">Organiser</th>
                  <th scope="col" className="pb-3 pr-6 text-xs text-faint font-medium whitespace-nowrap">Event</th>
                  <th scope="col" className="pb-3 pr-6 text-xs text-faint font-medium whitespace-nowrap">Amount</th>
                  <th scope="col" className="pb-3 pr-6 text-xs text-faint font-medium whitespace-nowrap">Destination</th>
                  <th scope="col" className="pb-3 pr-6 text-xs text-faint font-medium whitespace-nowrap">Requested</th>
                  <th scope="col" className="pb-3 pr-6 text-xs text-faint font-medium whitespace-nowrap">Status</th>
                  <th scope="col" className="pb-3 text-xs text-faint font-medium whitespace-nowrap">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {payouts.map((p) => (
                  <tr key={p.id} className="group">
                    <td className="py-3 pr-6">
                      <p className="text-ink font-medium truncate max-w-[160px]">{p.user_email}</p>
                    </td>
                    <td className="py-3 pr-6 text-muted truncate max-w-[160px]">{p.event_name || "—"}</td>
                    <td className="py-3 pr-6 text-body whitespace-nowrap font-medium tabular-nums">{fmtNaira(p.amount)}</td>
                    <td className="py-3 pr-6 text-muted min-w-[200px] max-w-[280px]">
                      <Destination p={p} full={can.payouts} />
                    </td>
                    <td className="py-3 pr-6 text-muted whitespace-nowrap">{fmtDate(p.requested_at)}</td>
                    <td className="py-3 pr-6">
                      <StatusBadge status={p.status} />
                      {p.status === "on_hold" && p.hold_reason && (
                        <p className="text-faint text-xs mt-1 max-w-[220px]">{p.hold_reason}</p>
                      )}
                    </td>
                    <td className="py-3">
                      <div className="flex items-center gap-2">
                        {p.status === "on_hold" && can.payouts && (
                          <>
                            <button
                              onClick={() => askPayout(p, "release")}
                              disabled={updatingId === p.id}
                              className="text-xs font-semibold text-brand-dark bg-sky hover:bg-brand/15 disabled:opacity-50 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap"
                            >
                              Release
                            </button>
                            <button
                              onClick={() => askPayout(p, "rejected")}
                              disabled={updatingId === p.id}
                              className="text-xs font-semibold text-danger bg-danger-tint hover:bg-danger-hover disabled:opacity-50 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap"
                            >
                              Reject
                            </button>
                          </>
                        )}
                        {p.status === "pending" && can.payouts && (
                          <>
                            <button
                              onClick={() => askPayout(p, "processed")}
                              disabled={updatingId === p.id}
                              className="text-xs font-semibold text-brand-dark hover:text-brand-dark bg-sky hover:bg-brand/15 disabled:opacity-50 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap"
                            >
                              {updatingId === p.id ? "Updating…" : "Mark as processed"}
                            </button>
                            <button
                              onClick={() => askPayout(p, "hold")}
                              disabled={updatingId === p.id}
                              className="text-xs font-semibold text-ink bg-mist hover:bg-line disabled:opacity-50 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap"
                            >
                              Hold
                            </button>
                            <button
                              onClick={() => askPayout(p, "rejected")}
                              disabled={updatingId === p.id}
                              className="text-xs font-semibold text-danger hover:text-danger bg-danger-tint hover:bg-danger-hover disabled:opacity-50 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap"
                            >
                              Reject
                            </button>
                          </>
                        )}
                        {/* Delete — for bad/test data on any row. Not an "undo": deleting
                            a processed row doesn't reverse a real transfer, it only
                            stops it counting against the organiser's balance here. */}
                        {can.delete && <button
                          onClick={() => askPayout(p, "delete")}
                          disabled={updatingId === p.id}
                          title="Delete this payout request"
                          className="text-xs font-semibold text-faint hover:text-danger hover:bg-danger-tint disabled:opacity-50 px-2 py-1.5 rounded-lg transition-colors whitespace-nowrap"
                        >
                          Delete
                        </button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
}
