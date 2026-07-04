"use client";

import { useState } from "react";
import { MOCK_PAYOUT_REQUESTS } from "@/lib/mockPayouts";

type PayoutStatus = "pending" | "processed";

interface PayoutRequest {
  id: string;
  organizerName: string;
  organizerEmail: string;
  eventName: string;
  amount: number;
  method: string;
  destination: string;
  status: PayoutStatus;
  requestedAt: string;
}

function fmtNaira(n: number) {
  return `₦${n.toLocaleString()}`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function StatusBadge({ status }: { status: PayoutStatus }) {
  const processed = status === "processed";
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full font-medium ${
        processed ? "bg-green-500/10 text-green-400" : "bg-yellow-500/10 text-yellow-400"
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${processed ? "bg-green-400" : "bg-yellow-400"}`} />
      {processed ? "Processed" : "Pending"}
    </span>
  );
}

export default function AdminPayoutsPage() {
  const [payouts, setPayouts] = useState<PayoutRequest[]>(MOCK_PAYOUT_REQUESTS as PayoutRequest[]);

  const markProcessed = (id: string) => {
    setPayouts((prev) => prev.map((p) => (p.id === id ? { ...p, status: "processed" } : p)));
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

      <div className="mb-6 bg-blue-500/5 border border-blue-500/20 rounded-xl px-4 py-3">
        <p className="text-blue-300 text-xs">
          Preview build: actions here update the screen only. Once the backend Payout Requests API is wired up,
          this page will read/write real data and organizers will see the status update on their own dashboard.
        </p>
      </div>

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
                    <p className="text-white font-medium truncate max-w-[160px]">{p.organizerName}</p>
                    <p className="text-gray-500 text-xs truncate max-w-[160px]">{p.organizerEmail}</p>
                  </td>
                  <td className="py-3 pr-6 text-gray-400 truncate max-w-[160px]">{p.eventName}</td>
                  <td className="py-3 pr-6 text-gray-200 whitespace-nowrap font-medium">{fmtNaira(p.amount)}</td>
                  <td className="py-3 pr-6 text-gray-400 whitespace-nowrap capitalize">{p.destination}</td>
                  <td className="py-3 pr-6 text-gray-400 whitespace-nowrap">{fmtDate(p.requestedAt)}</td>
                  <td className="py-3 pr-6">
                    <StatusBadge status={p.status} />
                  </td>
                  <td className="py-3">
                    {p.status === "pending" ? (
                      <button
                        onClick={() => markProcessed(p.id)}
                        className="text-xs font-semibold text-blue-400 hover:text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap"
                      >
                        Mark as processed
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
      </div>
    </div>
  );
}
