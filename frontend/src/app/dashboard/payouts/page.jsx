"use client";

import { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { toast } from "sonner";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Money01Icon,
  ArrowUpRight01Icon,
  Calendar01Icon,
  WalletAdd01Icon,
  Cancel01Icon,
} from "@hugeicons/core-free-icons";

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

// No backend field for this yet — persisted locally until the Payout Requests
// API exists (see BACKEND_REQUIREMENTS.md).
const BANK_DETAILS_STORAGE_KEY = "byro_payout_bank_details";

const EMPTY_BANK_DETAILS = { bankName: "", accountNumber: "", accountName: "" };

function fmt(n) {
  return `₦${n.toLocaleString()}`;
}

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl w-full max-w-sm p-5 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <p className="font-semibold text-gray-900">{title}</p>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
            <HugeiconsIcon icon={Cancel01Icon} size={16} color="currentColor" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function StudioPayouts() {
  const user = useSelector((s) => s.auth?.user);

  const [bankDetails, setBankDetails] = useState(EMPTY_BANK_DETAILS);
  const [bankForm, setBankForm] = useState(EMPTY_BANK_DETAILS);
  const [bankModalOpen, setBankModalOpen] = useState(false);

  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawModalOpen, setWithdrawModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(BANK_DETAILS_STORAGE_KEY);
      if (stored) setBankDetails(JSON.parse(stored));
    } catch {
      // ignore malformed/missing storage
    }
  }, []);

  const openBankModal = () => {
    setBankForm(bankDetails);
    setBankModalOpen(true);
  };

  const saveBankDetails = (e) => {
    e.preventDefault();
    if (!bankForm.bankName || !bankForm.accountNumber || !bankForm.accountName) {
      toast.error("Please fill in all bank details.");
      return;
    }
    setBankDetails(bankForm);
    localStorage.setItem(BANK_DETAILS_STORAGE_KEY, JSON.stringify(bankForm));
    setBankModalOpen(false);
    toast.success("Bank details saved.");
  };

  const submitWithdrawal = async (e) => {
    e.preventDefault();
    const amount = parseFloat(withdrawAmount);
    if (!withdrawAmount || isNaN(amount) || amount <= 0) {
      toast.error("Please enter a valid amount.");
      return;
    }
    if (!bankDetails.bankName || !bankDetails.accountNumber || !bankDetails.accountName) {
      toast.error("Add your bank details before withdrawing.");
      setWithdrawModalOpen(false);
      openBankModal();
      return;
    }
    const email = user?.email;
    if (!email) {
      toast.error("Couldn't find your account email. Please try again after signing in.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emails: [
            {
              type: "payout",
              to: email,
              data: {
                name: bankDetails.accountName,
                amount: withdrawAmount,
                method: "bank",
                accountNumber: bankDetails.accountNumber,
                bankName: bankDetails.bankName,
              },
            },
          ],
        }),
      });

      if (res.ok) {
        toast.success("Withdrawal request submitted! You'll receive a confirmation email within 24 hours.");
        setWithdrawAmount("");
        setWithdrawModalOpen(false);
      } else {
        toast.error("Failed to submit withdrawal request. Please try again.");
      }
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const hasBankDetails = Boolean(bankDetails.bankName);

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
            <button
              onClick={() => setWithdrawModalOpen(true)}
              className="flex items-center gap-1.5 bg-white text-indigo-700 text-xs font-bold px-4 py-2 rounded-xl hover:bg-white/90 transition-colors"
            >
              <HugeiconsIcon icon={WalletAdd01Icon} size={13} color="currentColor" />
              Withdraw
            </button>
            <button
              onClick={openBankModal}
              className="flex items-center gap-1.5 bg-white/15 text-white text-xs font-semibold px-3 py-2 rounded-xl hover:bg-white/20 transition-colors"
            >
              {hasBankDetails ? `${bankDetails.bankName} ····` : "Add bank details"}
              <span className="text-white/60 ml-1">↓</span>
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

      {/* Bank details modal */}
      {bankModalOpen && (
        <Modal title="Bank details" onClose={() => setBankModalOpen(false)}>
          <form onSubmit={saveBankDetails} className="space-y-3">
            <div>
              <label className="text-xs text-gray-500 block mb-1">Bank name</label>
              <input
                type="text"
                value={bankForm.bankName}
                onChange={(e) => setBankForm((p) => ({ ...p, bankName: e.target.value }))}
                placeholder="e.g. GTBank"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Account number</label>
              <input
                type="text"
                inputMode="numeric"
                value={bankForm.accountNumber}
                onChange={(e) => setBankForm((p) => ({ ...p, accountNumber: e.target.value }))}
                placeholder="0123456789"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Account name</label>
              <input
                type="text"
                value={bankForm.accountName}
                onChange={(e) => setBankForm((p) => ({ ...p, accountName: e.target.value }))}
                placeholder="As it appears on your bank account"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <button
              type="submit"
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors mt-2"
            >
              Save
            </button>
          </form>
        </Modal>
      )}

      {/* Withdraw modal */}
      {withdrawModalOpen && (
        <Modal title="Withdraw" onClose={() => setWithdrawModalOpen(false)}>
          <form onSubmit={submitWithdrawal} className="space-y-3">
            <div>
              <label className="text-xs text-gray-500 block mb-1">Amount</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">₦</span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(e.target.value)}
                  placeholder="0.00"
                  autoFocus
                  className="w-full border border-gray-200 rounded-lg pl-7 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
            <p className="text-xs text-gray-400">
              {hasBankDetails
                ? `Sent to ${bankDetails.bankName} ···· ${bankDetails.accountNumber.slice(-4)}`
                : "You'll be asked to add bank details before this can be sent."}
            </p>
            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors mt-2"
            >
              {submitting ? "Submitting..." : "Request withdrawal"}
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}
