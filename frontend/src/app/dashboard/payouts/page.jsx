"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { toast } from "sonner";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowUpRight01Icon,
  Calendar01Icon,
  WalletAdd01Icon,
  Cancel01Icon,
} from "@hugeicons/core-free-icons";
import API from "@/services/api";

const STATUS_STYLE = {
  processed: "bg-teal-50 text-teal-600 border border-teal-100",
  pending: "bg-amber-50 text-amber-600 border border-amber-100",
  rejected: "bg-red-50 text-red-600 border border-red-100",
};

const BANK_DETAILS_STORAGE_KEY = "byro_payout_bank_details";

const EMPTY_BANK_DETAILS = { bankCode: "", bankName: "", accountNumber: "", accountName: "" };

function fmt(n) {
  return `₦${Number(n).toLocaleString()}`;
}

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
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
  const [payouts, setPayouts] = useState([]);
  const [loadingPayouts, setLoadingPayouts] = useState(true);

  const [banks, setBanks] = useState([]);
  const [loadingBanks, setLoadingBanks] = useState(false);

  const [bankDetails, setBankDetails] = useState(EMPTY_BANK_DETAILS);
  const [bankForm, setBankForm] = useState(EMPTY_BANK_DETAILS);
  const [bankModalOpen, setBankModalOpen] = useState(false);

  const [resolvedName, setResolvedName] = useState("");
  const [resolving, setResolving] = useState(false);
  const [resolveError, setResolveError] = useState("");
  const resolveTimer = useRef(null);

  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawModalOpen, setWithdrawModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Load saved bank details (local cache — backend doesn't expose a
  // standalone "saved bank details" read; it's inferred from payout history).
  useEffect(() => {
    try {
      const stored = localStorage.getItem(BANK_DETAILS_STORAGE_KEY);
      if (stored) setBankDetails(JSON.parse(stored));
    } catch {
      // ignore malformed/missing storage
    }
  }, []);

  const loadPayouts = useCallback(async () => {
    setLoadingPayouts(true);
    try {
      const data = await API.getPayouts();
      setPayouts(Array.isArray(data) ? data : []);

      // Fall back to the most recent bank payout for pre-fill if nothing cached locally.
      const lastBank = (Array.isArray(data) ? data : []).find((p) => p.method === "bank");
      if (lastBank) {
        setBankDetails((prev) =>
          prev.accountNumber
            ? prev
            : {
                bankCode: "",
                bankName: lastBank.bank_name || "",
                accountNumber: lastBank.account_number || "",
                accountName: lastBank.account_name || "",
              }
        );
      }
    } catch {
      toast.error("Couldn't load payout history.");
    } finally {
      setLoadingPayouts(false);
    }
  }, []);

  useEffect(() => {
    loadPayouts();
  }, [loadPayouts]);

  const loadBanks = useCallback(async () => {
    if (banks.length) return;
    setLoadingBanks(true);
    try {
      const res = await API.getBanks("nigeria");
      setBanks(Array.isArray(res?.data) ? res.data : []);
    } catch {
      toast.error("Couldn't load the bank list. Please try again.");
    } finally {
      setLoadingBanks(false);
    }
  }, [banks.length]);

  const openBankModal = () => {
    setBankForm(bankDetails);
    setResolvedName(bankDetails.accountName || "");
    setResolveError("");
    setBankModalOpen(true);
    loadBanks();
  };

  // Debounced account-name lookup: fires once a bank + full account number are set,
  // so the user can confirm details before they get sent anywhere.
  useEffect(() => {
    if (!bankModalOpen) return;
    clearTimeout(resolveTimer.current);
    setResolveError("");

    if (!bankForm.bankCode || bankForm.accountNumber.length < 10) {
      setResolvedName("");
      return;
    }

    resolveTimer.current = setTimeout(async () => {
      setResolving(true);
      try {
        const res = await API.resolveAccount(bankForm.accountNumber, bankForm.bankCode);
        const name = res?.data?.account_name;
        if (name) {
          setResolvedName(name);
          setBankForm((p) => ({ ...p, accountName: name }));
        } else {
          setResolvedName("");
          setResolveError(res?.message || "Couldn't verify this account.");
        }
      } catch (err) {
        setResolvedName("");
        setResolveError(err?.message || "Couldn't verify this account.");
      } finally {
        setResolving(false);
      }
    }, 600);

    return () => clearTimeout(resolveTimer.current);
  }, [bankForm.bankCode, bankForm.accountNumber, bankModalOpen]);

  const saveBankDetails = (e) => {
    e.preventDefault();
    if (!bankForm.bankCode || !bankForm.accountNumber || !bankForm.accountName) {
      toast.error("Select a bank and enter your account number to confirm your details.");
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

    setSubmitting(true);
    try {
      await API.createPayout({
        method: "bank",
        amount,
        currency: "NGN",
        bank_name: bankDetails.bankName,
        account_number: bankDetails.accountNumber,
        account_name: bankDetails.accountName,
      });
      toast.success("Withdrawal request submitted!");
      setWithdrawAmount("");
      setWithdrawModalOpen(false);
      loadPayouts();
    } catch (err) {
      toast.error(err?.message || "Failed to submit withdrawal request. Please try again.");
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
        <div className="sm:col-span-1 bg-gradient-to-br from-blue-700 to-purple-700 rounded-2xl p-5 text-white">
          <p className="text-sm text-white/70 mb-3">Available to withdraw</p>
          <p className="text-3xl font-bold mb-1">—</p>
          <p className="text-xs text-white/50 mb-5">Pending clearance after events</p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setWithdrawModalOpen(true)}
              className="flex items-center gap-1.5 bg-white text-blue-700 text-xs font-bold px-4 py-2 rounded-xl hover:bg-white/90 transition-colors"
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
            <p className="text-sm text-gray-400">Paid out</p>
            <div className="w-8 h-8 rounded-xl bg-green-50 text-green-600 flex items-center justify-center">
              <HugeiconsIcon icon={ArrowUpRight01Icon} size={16} color="currentColor" />
            </div>
          </div>
          <p className="text-2xl font-bold text-gray-900 mb-1">
            {fmt(payouts.filter((p) => p.status === "processed").reduce((sum, p) => sum + Number(p.amount), 0))}
          </p>
        </div>

        {/* Pending */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <div className="flex items-start justify-between mb-4">
            <p className="text-sm text-gray-400">Pending</p>
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <HugeiconsIcon icon={Calendar01Icon} size={16} color="currentColor" />
            </div>
          </div>
          <p className="text-2xl font-bold text-gray-900 mb-1">
            {fmt(payouts.filter((p) => p.status === "pending").reduce((sum, p) => sum + Number(p.amount), 0))}
          </p>
        </div>
      </div>

      {/* Payout history */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5">
        <div className="flex items-center justify-between mb-5">
          <p className="font-semibold text-gray-900">Payout history</p>
        </div>

        {loadingPayouts ? (
          <p className="text-sm text-gray-400 py-6 text-center">Loading…</p>
        ) : payouts.length === 0 ? (
          <p className="text-sm text-gray-400 py-6 text-center">No payout requests yet.</p>
        ) : (
          <div className="divide-y divide-gray-50">
            {payouts.map((p) => (
              <div key={p.id} className="flex items-center gap-4 py-3.5">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-teal-50 text-teal-600">
                  <HugeiconsIcon icon={WalletAdd01Icon} size={16} color="currentColor" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">
                    {p.method === "bank" ? `Payout to ${p.bank_name}` : "Payout to wallet"}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">{fmtDate(p.requested_at)}</p>
                </div>
                <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full shrink-0 ${STATUS_STYLE[p.status] || ""}`}>
                  {p.status?.toUpperCase()}
                </span>
                <p className="text-sm font-bold text-gray-900 shrink-0 w-24 text-right">{fmt(p.amount)}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bank details modal */}
      {bankModalOpen && (
        <Modal title="Bank details" onClose={() => setBankModalOpen(false)}>
          <form onSubmit={saveBankDetails} className="space-y-3">
            <div>
              <label className="text-xs text-gray-500 block mb-1">Bank</label>
              <input
                type="text"
                list="bank-options"
                value={bankForm.bankName}
                onChange={(e) => {
                  const typed = e.target.value;
                  const match = banks.find(
                    (b) => b.name.toLowerCase() === typed.trim().toLowerCase()
                  );
                  setBankForm((p) => ({
                    ...p,
                    bankName: typed,
                    bankCode: match ? String(match.code) : "",
                  }));
                }}
                placeholder={loadingBanks ? "Loading banks…" : "Type your bank name"}
                autoComplete="off"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              />
              <datalist id="bank-options">
                {banks.map((b) => (
                  <option key={b.code} value={b.name} />
                ))}
              </datalist>
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Account number</label>
              <input
                type="text"
                inputMode="numeric"
                value={bankForm.accountNumber}
                onChange={(e) =>
                  setBankForm((p) => ({ ...p, accountNumber: e.target.value.replace(/\D/g, "") }))
                }
                placeholder="0123456789"
                maxLength={10}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs mt-1.5 min-h-[1rem]">
                {resolving && <span className="text-gray-400">Verifying account…</span>}
                {!resolving && resolvedName && (
                  <span className="text-green-600 font-medium inline-flex items-center gap-1">
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="shrink-0"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    {resolvedName}
                  </span>
                )}
                {!resolving && !resolvedName && resolveError && (
                  <span className="text-red-500">{resolveError}</span>
                )}
              </p>
            </div>
            <button
              type="submit"
              disabled={!resolvedName}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors mt-2"
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
                  className="w-full border border-gray-200 rounded-lg pl-7 pr-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors mt-2"
            >
              {submitting ? "Submitting..." : "Request withdrawal"}
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}
