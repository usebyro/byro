"use client";

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
      ? "bg-green-500/10 text-green-400"
      : status === "rejected"
        ? "bg-red-500/10 text-red-400"
        : "bg-yellow-500/10 text-yellow-400";
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
  const [payouts, setPayouts] = useState<PayoutRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatingId, setUpdatingId] = useState<number | null>(null);

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

  const markProcessed = async (id: number) => {
    setUpdatingId(id);
    try {
      const res = await fetch(`/api/admin/payouts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "processed" }),
      });
      if (!res.ok) throw new Error("Failed to update payout");
      const updated = await res.json();
      setPayouts((prev) => prev.map((p) => (p.id === id ? updated : p)));
    } catch {
      setError("Couldn't update that payout. Please try again.");
    } finally {
      setUpdatingId(null);
    }
  };

  const pending = payouts.filter((p) => p.status === "pending");
  const processed = payouts.filter((p) => p.status === "processed");

  return (
    <div className="p-5 md:p-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-white text-xl font-bold">Payouts</h1>
        <p className="text-gray-400 text-sm mt-1">Review and process organizer withdrawal requests</p>
      </div>

      {error && (
        <div className="mb-6 bg-red-500/5 border border-red-500/20 rounded-xl px-4 py-3">
          <p className="text-red-300 text-xs">{error}</p>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 mb-8">
        <div className="bg-[#1a1d27] border border-white/10 rounded-xl px-5 py-4">
          <p className="text-gray-400 text-xs uppercase tracking-wider mb-1">Pending</p>
          <p className="text-white text-2xl font-bold">{pending.length}</p>
        </div>
        <div className="bg-[#1a1d27] border border-white/10 rounded-xl px-5 py-4">
          <p className="text-gray-400 text-xs uppercase tracking-wider mb-1">Processed</p>
          <p className="text-white text-2xl font-bold">{processed.length}</p>
        </div>
      </div>

      {/* Table */}
      <div className="bg-[#1a1d27] border border-white/10 rounded-xl p-4 md:p-6">
        {loading ? (
          <p className="text-gray-500 text-sm text-center py-8">Loading…</p>
        ) : payouts.length === 0 ? (
          <p className="text-gray-500 text-sm text-center py-8">No payout requests yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5 text-left">
                  <th className="pb-3 pr-6 text-xs text-gray-500 uppercase tracking-wider font-medium whitespace-nowrap">Organizer</th>
                  <th className="pb-3 pr-6 text-xs text-gray-500 uppercase tracking-wider font-medium whitespace-nowrap">Event</th>
                  <th className="pb-3 pr-6 text-xs text-gray-500 uppercase tracking-wider font-medium whitespace-nowrap">Amount</th>
                  <th className="pb-3 pr-6 text-xs text-gray-500 uppercase tracking-wider font-medium whitespace-nowrap">Destination</th>
                  <th className="pb-3 pr-6 text-xs text-gray-500 uppercase tracking-wider font-medium whitespace-nowrap">Requested</th>
                  <th className="pb-3 pr-6 text-xs text-gray-500 uppercase tracking-wider font-medium whitespace-nowrap">Status</th>
                  <th className="pb-3 text-xs text-gray-500 uppercase tracking-wider font-medium whitespace-nowrap">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {payouts.map((p) => (
                  <tr key={p.id} className="group">
                    <td className="py-3 pr-6">
                      <p className="text-white font-medium truncate max-w-[160px]">{p.user_email}</p>
                    </td>
                    <td className="py-3 pr-6 text-gray-400 truncate max-w-[160px]">{p.event_name || "—"}</td>
                    <td className="py-3 pr-6 text-gray-200 whitespace-nowrap font-medium">{fmtNaira(p.amount)}</td>
                    <td className="py-3 pr-6 text-gray-400 whitespace-nowrap capitalize">{destinationOf(p)}</td>
                    <td className="py-3 pr-6 text-gray-400 whitespace-nowrap">{fmtDate(p.requested_at)}</td>
                    <td className="py-3 pr-6">
                      <StatusBadge status={p.status} />
                    </td>
                    <td className="py-3">
                      {p.status === "pending" ? (
                        <button
                          onClick={() => markProcessed(p.id)}
                          disabled={updatingId === p.id}
                          className="text-xs font-semibold text-blue-400 hover:text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 disabled:opacity-50 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap"
                        >
                          {updatingId === p.id ? "Updating…" : "Mark as processed"}
                        </button>
                      ) : (
                        <span className="text-xs text-gray-600 whitespace-nowrap">—</span>
                      )}
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
