"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { Money01Icon, ArrowUpRight01Icon, Calendar01Icon, WalletAdd01Icon } from "@hugeicons/core-free-icons";

// Placeholder page — replace with real API data when backend supports it
const MOCK_TRANSACTIONS = [
  { id: 1, label: "Payout to GTBank", date: "18 Jul 2026 · 09:24", status: "PAID", amount: 3200000, icon: "bank" },
  { id: 2, label: "Afrorave: Lights Out — sales", date: "15 Jul 2026", status: "PENDING", amount: 2400000, icon: "event" },
  { id: 3, label: "Payout to GTBank", date: "12 Jul 2026 · 14:02", status: "PAID", amount: 5100000, icon: "bank" },
  { id: 4, label: "Derby Day — sales", date: "10 Jul 2026", status: "CLEARED", amount: 3000000, icon: "event" },
  { id: 5, label: "Afrobeats Arena — sales", date: "8 Jul 2026", status: "CLEARED", amount: 6100000, icon: "event" },
];

const STATUS_STYLE = {
  PAID:    "bg-teal-50 text-teal-600 border border-teal-100",
  PENDING: "bg-amber-50 text-amber-600 border border-amber-100",
  CLEARED: "bg-gray-100 text-gray-500",
};

function fmt(n) {
  return `₦${n.toLocaleString()}`;
}

export default function StudioPayouts() {
  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-7">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Payouts</h1>
        <p className="text-sm text-gray-400">Track earnings and withdraw to your bank.</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        {/* Available */}
        <div className="sm:col-span-1 bg-gradient-to-br from-indigo-700 to-purple-700 rounded-2xl p-5 text-white">
          <p className="text-sm text-white/70 mb-3">Available to withdraw</p>
          <p className="text-3xl font-bold mb-1">—</p>
          <p className="text-xs text-white/50 mb-5">Pending clearance after events</p>
          <div className="flex items-center gap-2">
            <button className="flex items-center gap-1.5 bg-white text-indigo-700 text-xs font-bold px-4 py-2 rounded-xl hover:bg-white/90 transition-colors">
              <HugeiconsIcon icon={WalletAdd01Icon} size={13} color="currentColor" />
              Withdraw
            </button>
            <button className="flex items-center gap-1.5 bg-white/15 text-white text-xs font-semibold px-3 py-2 rounded-xl hover:bg-white/20 transition-colors">
              GTBank ···· <span className="text-white/60 ml-1">↓</span>
            </button>
          </div>
        </div>

        {/* Paid out */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <div className="flex items-start justify-between mb-4">
            <p className="text-sm text-gray-400">Paid out (2026)</p>
            <div className="w-8 h-8 rounded-xl bg-green-50 text-green-600 flex items-center justify-center">
              <HugeiconsIcon icon={ArrowUpRight01Icon} size={16} color="currentColor" />
            </div>
          </div>
          <p className="text-2xl font-bold text-gray-900 mb-1">—</p>
          <p className="text-xs text-green-500">+22% vs last month</p>
        </div>

        {/* Next payout */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <div className="flex items-start justify-between mb-4">
            <p className="text-sm text-gray-400">Next payout</p>
            <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <HugeiconsIcon icon={Calendar01Icon} size={16} color="currentColor" />
            </div>
          </div>
          <p className="text-2xl font-bold text-gray-900 mb-1">—</p>
          <p className="text-xs text-gray-400">Clears after your next event</p>
        </div>
      </div>

      {/* Transaction history */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5">
        <div className="flex items-center justify-between mb-5">
          <p className="font-semibold text-gray-900">Transaction history</p>
          <div className="flex items-center gap-1">
            {["All", "Payouts", "Sales"].map((f, i) => (
              <button
                key={f}
                className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${
                  i === 0 ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                }`}
              >
                {f}
              </button>
            ))}
            <button className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-full bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 ml-1">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              Statement
            </button>
          </div>
        </div>

        <div className="divide-y divide-gray-50">
          {MOCK_TRANSACTIONS.map((tx) => (
            <div key={tx.id} className="flex items-center gap-4 py-3.5">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                tx.icon === "bank" ? "bg-teal-50 text-teal-600" : "bg-amber-50 text-amber-600"
              }`}>
                <HugeiconsIcon icon={tx.icon === "bank" ? WalletAdd01Icon : Money01Icon} size={16} color="currentColor" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">{tx.label}</p>
                <p className="text-xs text-gray-400 mt-0.5">{tx.date}</p>
              </div>
              <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full shrink-0 ${STATUS_STYLE[tx.status]}`}>
                {tx.status}
              </span>
              <p className="text-sm font-bold text-gray-900 shrink-0 w-24 text-right">{fmt(tx.amount)}</p>
            </div>
          ))}
        </div>

        <p className="text-xs text-gray-400 text-center mt-5 pt-4 border-t border-gray-50">
          Revenue data will update automatically once backend integration is complete.
        </p>
      </div>
    </div>
  );
}
