"use client";

import { useAdminMe } from "@/components/admin/AdminMe";
import { useConfirm } from "@/components/admin/ui";
import { useEffect, useState, useCallback } from "react";

type PayoutStatus = "pending" | "processed" | "rejected";

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

function StatusBadge({ status }: { status: PayoutStatus }) {
  const style =
    status === "processed"
      ? "bg-green-500/10 text-green-700"
      : status === "rejected"
        ? "bg-red-500/10 text-red-600"
        : "bg-yellow-500/10 text-amber-700";
  const dot =
    status === "processed" ? "bg-green-400" : status === "rejected" ? "bg-red-400" : "bg-yellow-400";

  return (
    <span className={`inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full font-medium ${style}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
      {status[0].toUpperCase() + status.slice(1)}
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

  const updateStatus = async (id: number, status: "processed" | "rejected") => {
    setUpdatingId(id);
    try {
      const res = await fetch(`/api/admin/payouts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Failed to update payout");
      const updated = await res.json();
      setPayouts((prev) => prev.map((p) => (p.id === id ? updated : p)));
    } catch {
      setError(`Couldn't ${status === "processed" ? "process" : "reject"} that payout. Please try again.`);
    } finally {
      setUpdatingId(null);
    }
  };

  const deletePayout = async (id: number) => {
    setUpdatingId(id);
    try {
      const res = await fetch(`/api/admin/payouts/${id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) throw new Error("Failed to delete payout");
      setPayouts((prev) => prev.filter((p) => p.id !== id));
    } catch {
      setError("Couldn't delete that payout. Please try again.");
    } finally {
      setUpdatingId(null);
    }
  };

  const pending = payouts.filter((p) => p.status === "pending");
  const processed = payouts.filter((p) => p.status === "processed");
  const rejected = payouts.filter((p) => p.status === "rejected");

  const sumOf = (list: PayoutRequest[]) => list.reduce((s, p) => s + Number(p.amount || 0), 0);
  const outstandingAmount = sumOf(pending);
  const paidOutAmount = sumOf(processed);
  const totalVolume = sumOf(payouts); // pending + processed + rejected, lifetime


  // One proper dialog for each payout decision, showing who gets what.
  const askPayout = async (p: PayoutRequest, action: "processed" | "rejected" | "delete") => {
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
    if (!(await confirm(copy))) return;
    if (action === "delete") deletePayout(p.id);
    else updateStatus(p.id, action);
  };

  return (
    <div className="p-5 md:p-8">
      <div className="mb-6">
        <h1 className="font-display text-ink text-3xl font-extrabold tracking-tight">Payouts</h1>
        <p className="text-muted text-sm mt-1">Review and process organiser withdrawal requests</p>
      </div>

      {error && (
        <div className="mb-6 bg-red-500/5 border border-red-500/20 rounded-xl px-4 py-3">
          <p className="text-red-700 text-xs">{error}</p>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-white border border-line rounded-xl px-5 py-4 border-l-2 border-l-yellow-500/50">
          <p className="text-muted text-xs mb-1.5">Outstanding</p>
          <p className="text-ink text-2xl font-semibold tabular-nums">{fmtNaira(outstandingAmount)}</p>
          <p className="text-faint text-xs mt-1">{pending.length} pending</p>
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
          <p className="text-faint text-sm text-center py-8">Loading…</p>
        ) : payouts.length === 0 ? (
          <p className="text-faint text-sm text-center py-8">No payout requests yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hairline text-left">
                  <th className="pb-3 pr-6 text-xs text-faint font-medium whitespace-nowrap">Organiser</th>
                  <th className="pb-3 pr-6 text-xs text-faint font-medium whitespace-nowrap">Event</th>
                  <th className="pb-3 pr-6 text-xs text-faint font-medium whitespace-nowrap">Amount</th>
                  <th className="pb-3 pr-6 text-xs text-faint font-medium whitespace-nowrap">Destination</th>
                  <th className="pb-3 pr-6 text-xs text-faint font-medium whitespace-nowrap">Requested</th>
                  <th className="pb-3 pr-6 text-xs text-faint font-medium whitespace-nowrap">Status</th>
                  <th className="pb-3 text-xs text-faint font-medium whitespace-nowrap">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {payouts.map((p) => (
                  <tr key={p.id} className="group">
                    <td className="py-3 pr-6">
                      <p className="text-ink font-medium truncate max-w-[160px]">{p.user_email}</p>
                    </td>
                    <td className="py-3 pr-6 text-muted truncate max-w-[160px]">{p.event_name || "—"}</td>
                    <td className="py-3 pr-6 text-[#3B4252] whitespace-nowrap font-medium tabular-nums">{fmtNaira(p.amount)}</td>
                    <td className="py-3 pr-6 text-muted truncate max-w-[220px] capitalize" title={destinationOf(p)}>{destinationOf(p)}</td>
                    <td className="py-3 pr-6 text-muted whitespace-nowrap">{fmtDate(p.requested_at)}</td>
                    <td className="py-3 pr-6">
                      <StatusBadge status={p.status} />
                    </td>
                    <td className="py-3">
                      <div className="flex items-center gap-2">
                        {p.status === "pending" && can.payouts && (
                          <>
                            <button
                              onClick={() => askPayout(p, "processed")}
                              disabled={updatingId === p.id}
                              className="text-xs font-semibold text-brand-dark hover:text-brand-dark bg-blue-500/10 hover:bg-blue-500/20 disabled:opacity-50 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap"
                            >
                              {updatingId === p.id ? "Updating…" : "Mark as processed"}
                            </button>
                            <button
                              onClick={() => askPayout(p, "rejected")}
                              disabled={updatingId === p.id}
                              className="text-xs font-semibold text-red-600 hover:text-red-700 bg-red-500/10 hover:bg-red-500/20 disabled:opacity-50 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap"
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
                          className="text-xs font-semibold text-faint hover:text-red-600 hover:bg-red-500/10 disabled:opacity-50 px-2 py-1.5 rounded-lg transition-colors whitespace-nowrap"
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
