"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { toast } from "sonner";
import API from "@/services/api";
import BankLogo from "@/components/dashboard/BankLogo";

// Backend status -> label, status ink, dot, amount ink (design: Paid / Pending / Cancelled-style grey).
const STATUS = {
  processed: { label: "Paid", ink: "#1F7A52", dot: "#2F9E6E", amt: "#14161C" },
  pending: { label: "Pending", ink: "#8A4B00", dot: "#F5B83D", amt: "#14161C" },
  rejected: { label: "Rejected", ink: "#B42318", dot: "#D03B3B", amt: "#5B6272" },
};
const STATUS_FALLBACK = { label: "", ink: "#5B6272", dot: "#8A91A0", amt: "#5B6272" };

const FILTERS = [
  ["all", "All"],
  ["processed", "Paid"],
  ["pending", "Pending"],
  ["rejected", "Rejected"],
];

const BANK_DETAILS_STORAGE_KEY = "byro_payout_bank_details";

// "0123456789" -> "••••6789": enough to recognise the account without showing it in full.
const maskAccount = (n) => {
  const digits = String(n || "");
  return digits.length > 4 ? `••••${digits.slice(-4)}` : digits;
};

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

// "Today, 2:14 PM" for today, otherwise "22 Aug 2026, 2:14 PM".
function fmtWhen(iso) {
  const d = new Date(iso);
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const day = d.toDateString() === new Date().toDateString() ? "Today" : fmtDate(iso);
  return `${day}, ${time}`;
}

export default function StudioPayouts() {
  const [payouts, setPayouts] = useState([]);
  const [loadingPayouts, setLoadingPayouts] = useState(true);
  const [filter, setFilter] = useState("all");

  const [banks, setBanks] = useState([]);
  const [loadingBanks, setLoadingBanks] = useState(false);

  const [bankDetails, setBankDetails] = useState(EMPTY_BANK_DETAILS);
  const [bankForm, setBankForm] = useState(EMPTY_BANK_DETAILS);
  const [changingBank, setChangingBank] = useState(false);

  const [resolvedName, setResolvedName] = useState("");
  const [resolving, setResolving] = useState(false);
  const [resolveError, setResolveError] = useState("");
  const resolveTimer = useRef(null);

  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [balance, setBalance] = useState(null);
  const [loadingBalance, setLoadingBalance] = useState(true);

  useEffect(() => {
    document.title = "Payouts | Byro";
  }, []);

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
      toast.error("Couldn't load payout history");
    } finally {
      setLoadingPayouts(false);
    }
  }, []);

  useEffect(() => {
    loadPayouts();
  }, [loadPayouts]);

  const loadBalance = useCallback(async () => {
    try {
      const data = await API.getPayoutBalance();
      setBalance(data);
    } catch {
      // Non-fatal — the page still works without the balance summary.
      setBalance(null);
    } finally {
      setLoadingBalance(false);
    }
  }, []);

  useEffect(() => {
    loadBalance();
  }, [loadBalance]);

  const loadBanks = useCallback(async () => {
    if (banks.length) return;
    setLoadingBanks(true);
    try {
      const res = await API.getBanks("nigeria");
      setBanks(Array.isArray(res?.data) ? res.data : []);
    } catch {
      toast.error("Couldn't load banks", { description: "Please try again." });
    } finally {
      setLoadingBanks(false);
    }
  }, [banks.length]);

  const hasBankDetails = Boolean(bankDetails.bankName);
  // The bank form shows inline when there's no account yet, or the organiser chose Change.
  // Wait for history first: saved details can be inferred from it.
  const showBankForm = !loadingPayouts && (changingBank || !hasBankDetails);

  useEffect(() => {
    if (showBankForm) loadBanks();
  }, [showBankForm, loadBanks]);

  const openBankForm = () => {
    setBankForm(bankDetails);
    setResolvedName(bankDetails.accountName || "");
    setResolveError("");
    setConfirming(false);
    setChangingBank(true);
  };

  // Debounced account-name lookup: fires once a bank + full account number are set,
  // so the user can confirm details before they get sent anywhere.
  useEffect(() => {
    if (!showBankForm) return;
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
  }, [bankForm.bankCode, bankForm.accountNumber, showBankForm]);

  const saveBankDetails = (e) => {
    e.preventDefault();
    if (!bankForm.bankCode || !bankForm.accountNumber || !bankForm.accountName) {
      toast.error("Bank details needed", { description: "Select a bank and enter your account number." });
      return;
    }
    setBankDetails(bankForm);
    localStorage.setItem(BANK_DETAILS_STORAGE_KEY, JSON.stringify(bankForm));
    setChangingBank(false);
    toast.success("Bank details saved");
  };

  const submitWithdrawal = async (e) => {
    e.preventDefault();
    const amount = parseFloat(withdrawAmount);
    if (!withdrawAmount || isNaN(amount) || amount <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    const available = balance ? Number(balance.available) : 0;
    if (available <= 0) {
      toast.error("No funds to withdraw");
      return;
    }
    if (amount > available) {
      toast.error("Amount too high", { description: `Your balance is ${fmt(available)}.` });
      return;
    }
    if (!bankDetails.bankName || !bankDetails.accountNumber || !bankDetails.accountName) {
      toast.error("Add bank details first");
      setConfirming(false);
      openBankForm();
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
      toast.success("Withdrawal requested");
      setWithdrawAmount("");
      setConfirming(false);
      loadPayouts();
      loadBalance();
    } catch (err) {
      toast.error("Couldn't submit request", { description: err?.message || "Please try again." });
    } finally {
      setSubmitting(false);
    }
  };

  const availableAmount = balance ? Number(balance.available) : null;
  const canWithdraw = availableAmount !== null && availableAmount > 0;

  const askWithdraw = () => {
    // Defaults to the whole balance; the organiser can lower it before confirming.
    setWithdrawAmount(String(availableAmount));
    setConfirming(true);
  };

  const paid = payouts.filter((p) => p.status === "processed");
  const paidOutTotal = paid.reduce((sum, p) => sum + Number(p.amount), 0);
  const pendingTotal = payouts.filter((p) => p.status === "pending").reduce((sum, p) => sum + Number(p.amount), 0);

  // The newest request, while it's still waiting, gets the progress steps.
  const inFlight = payouts[0]?.status === "pending" ? payouts[0] : null;

  const count = (s) => (s === "all" ? payouts.length : payouts.filter((p) => p.status === s).length);
  const rows = filter === "all" ? payouts : payouts.filter((p) => p.status === filter);
  const parsedAmount = parseFloat(withdrawAmount);
  const bankLabel = `${bankDetails.bankName} ${maskAccount(bankDetails.accountNumber)}`;

  return (
    <div className="mx-auto flex w-full max-w-[1240px] flex-col gap-5 px-4 pb-12 pt-2 md:gap-6 sm:px-[clamp(16px,3vw,40px)]">
      <div className="v-bf flex flex-col gap-1.5" style={{ "--i": 0 }}>
        <h1 className="v-h1">Payouts</h1>
        <p className="v-sub">Your ticket earnings and where they go.</p>
      </div>

      <div className="flex flex-wrap items-stretch gap-5">
        <section
          aria-label="Available to withdraw"
          className="v-card v-bf flex min-w-0 flex-[3_1_460px] flex-col gap-5 p-5 sm:p-[26px]"
          style={{ "--i": 1 }}
        >
          <div className="flex flex-col gap-2.5">
            <span className="v-eyebrow">Available to withdraw</span>
            {loadingBalance ? (
              <span className="v-skel block h-[52px] w-56 max-w-full" aria-label="Loading balance" />
            ) : (
              <span className="v-hero break-words">{balance ? fmt(balance.available) : "—"}</span>
            )}
          </div>

          {loadingPayouts ? (
            <div className="v-skel h-[68px] rounded-2xl" />
          ) : (
            <div className="flex flex-col gap-3.5 rounded-2xl bg-[#F6F8FB] px-4 py-3.5">
              {!showBankForm ? (
                <div className="flex items-center gap-3.5">
                  <BankLogo code={bankDetails.bankCode} name={bankDetails.bankName} />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-[15px] font-extrabold">{bankDetails.bankName}</span>
                    <span className="v-tab truncate text-[13px] text-muted">
                      {[bankDetails.accountName, maskAccount(bankDetails.accountNumber)].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  <button type="button" className="v-btn v-btn-t v-btn-sm" onClick={openBankForm}>
                    Change
                  </button>
                </div>
              ) : (
                <form onSubmit={saveBankDetails} className="v-bf flex flex-col gap-3.5">
                  <span className="text-[15px] font-extrabold">Where should we send your money?</span>
                  <div className="flex flex-wrap gap-3">
                    <label className="flex min-w-0 flex-[1_1_180px] flex-col gap-2">
                      <span className="v-lbl">Bank</span>
                      <select
                        className="v-input"
                        value={bankForm.bankCode}
                        disabled={loadingBanks}
                        onChange={(e) => {
                          const match = banks.find((b) => String(b.code) === e.target.value);
                          setBankForm((p) => ({
                            ...p,
                            bankCode: match ? String(match.code) : "",
                            bankName: match ? match.name : "",
                          }));
                        }}
                      >
                        <option value="">{loadingBanks ? "Loading banks…" : "Choose your bank"}</option>
                        {banks.map((b) => (
                          <option key={b.code} value={String(b.code)}>
                            {b.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="flex min-w-0 flex-[1_1_180px] flex-col gap-2">
                      <span className="v-lbl">Account number</span>
                      <input
                        className="v-input v-tab"
                        type="text"
                        inputMode="numeric"
                        maxLength={10}
                        placeholder="10 digits"
                        value={bankForm.accountNumber}
                        onChange={(e) =>
                          setBankForm((p) => ({ ...p, accountNumber: e.target.value.replace(/\D/g, "") }))
                        }
                      />
                    </label>
                  </div>
                  <p className="v-hint m-0 min-h-[1.25rem]" aria-live="polite">
                    {resolving && "Verifying account…"}
                    {!resolving && resolvedName && (
                      <span className="inline-flex items-center gap-1 font-bold text-[#1F7A52]">
                        <svg
                          width="12"
                          height="12"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="3"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="shrink-0"
                          aria-hidden="true"
                        >
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                        {resolvedName}
                      </span>
                    )}
                    {!resolving && !resolvedName && resolveError && (
                      <span className="text-[#B42318]">{resolveError}</span>
                    )}
                    {!resolving &&
                      !resolvedName &&
                      !resolveError &&
                      "We show the account name before you save, so you can check it’s yours."}
                  </p>
                  <div className="flex flex-wrap justify-end gap-2">
                    {hasBankDetails && (
                      <button type="button" className="v-btn v-btn-s" onClick={() => setChangingBank(false)}>
                        Cancel
                      </button>
                    )}
                    <button type="submit" className="v-btn v-btn-p" disabled={!resolvedName}>
                      Save bank account
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {!showBankForm && !loadingPayouts && !confirming && (
            <div className="flex flex-wrap items-center gap-3.5">
              <button
                type="button"
                className="v-btn v-btn-p v-btn-lg"
                onClick={askWithdraw}
                disabled={!canWithdraw}
              >
                {canWithdraw ? `Withdraw ${fmt(availableAmount)}` : "Withdraw"}
              </button>
              <span className="v-hint">
                {canWithdraw || availableAmount === null ? "Sent to your bank within 24 hours" : "Nothing to withdraw yet"}
              </span>
            </div>
          )}

          {!showBankForm && confirming && (
            <form
              onSubmit={submitWithdrawal}
              className="v-bf flex flex-col gap-3.5 rounded-2xl bg-[#F5F8FF] px-[18px] py-4"
            >
              <label className="flex flex-col gap-2">
                <span className="v-lbl">Amount</span>
                <span className="relative block w-full max-w-[240px]">
                  <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted">₦</span>
                  <input
                    className="v-input v-tab"
                    style={{ paddingLeft: 28 }}
                    type="number"
                    min="1"
                    step="1"
                    max={availableAmount ?? undefined}
                    value={withdrawAmount}
                    onChange={(e) => setWithdrawAmount(e.target.value)}
                    autoFocus
                  />
                </span>
              </label>
              <div className="flex flex-wrap items-center gap-3.5">
                <span className="min-w-0 flex-[1_1_220px] text-[15px] font-bold">
                  Send <b>{fmt(isNaN(parsedAmount) ? 0 : parsedAmount)}</b> to {bankLabel}?
                </span>
                <button type="button" className="v-btn v-btn-s" onClick={() => setConfirming(false)}>
                  Cancel
                </button>
                <button type="submit" className="v-btn v-btn-p" disabled={submitting}>
                  {submitting ? "Submitting…" : "Confirm withdrawal"}
                </button>
              </div>
            </form>
          )}

          {inFlight && (
            <ol aria-label="Withdrawal progress" className="v-bf m-0 grid list-none grid-cols-3 gap-2 p-0">
              <li className="flex min-w-0 flex-col gap-2">
                <span className="h-1 rounded-full bg-brand" />
                <span className="text-[14px] font-extrabold">Requested</span>
                <span className="v-hint">{fmtWhen(inFlight.requested_at)}</span>
              </li>
              <li className="flex min-w-0 flex-col gap-2">
                <span className="h-1 overflow-hidden rounded-full bg-[#DCE6FD]">
                  <span className="v-growx block h-full w-1/2 bg-brand" />
                </span>
                <span className="flex items-center gap-1.5 text-[14px] font-extrabold">
                  <span className="v-dot v-ping bg-brand" />
                  Processing
                </span>
                <span className="v-hint">Within 24 hours</span>
              </li>
              <li className="flex min-w-0 flex-col gap-2">
                <span className="h-1 rounded-full bg-[#DCE6FD]" />
                <span className="text-[14px] font-extrabold text-muted">Sent to your bank</span>
                <span className="v-hint">Within 24 hours</span>
              </li>
            </ol>
          )}
        </section>

        <div className="flex min-w-0 flex-[2_1_260px] flex-col gap-5">
          <div className="v-card v-bf flex grow flex-col gap-2 px-[22px] py-5" style={{ "--i": 2 }}>
            <span className="v-eyebrow">Pending</span>
            {loadingPayouts ? (
              <span className="v-skel block h-7 w-32" />
            ) : (
              <span className="v-fig">{fmt(pendingTotal)}</span>
            )}
            <span className="v-hint">Sent within 24 hours</span>
          </div>
          <div className="v-card v-bf flex grow flex-col gap-2 px-[22px] py-5" style={{ "--i": 3 }}>
            <span className="v-eyebrow">Paid out</span>
            {loadingPayouts ? (
              <span className="v-skel block h-7 w-32" />
            ) : (
              <span className="v-fig">{fmt(paidOutTotal)}</span>
            )}
          </div>
        </div>
      </div>

      <section aria-label="Payout history" className="v-card v-bf min-w-0 overflow-hidden" style={{ "--i": 4 }}>
        <div className="flex flex-wrap items-center gap-3 px-[22px] py-5">
          <h2 className="v-h2 grow">History</h2>
          {payouts.length > 0 && (
            <div role="group" aria-label="Filter payouts" className="v-seg">
              {FILTERS.map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={filter === value}
                  onClick={() => setFilter(value)}
                >
                  {label}
                  <span className="n">{count(value)}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {loadingPayouts ? (
          <div className="flex flex-col gap-3 border-t border-hairline px-[22px] py-5">
            {[0, 1, 2].map((i) => (
              <div key={i} className="v-skel h-6" />
            ))}
          </div>
        ) : payouts.length === 0 ? (
          <div className="border-t border-hairline px-[22px] py-10 text-center">
            <p className="m-0 text-[15px] font-extrabold">No payout requests yet</p>
            <p className="v-hint m-0 mt-1">Once your tickets sell, request a withdrawal to your bank here.</p>
          </div>
        ) : rows.length === 0 ? (
          <p className="v-hint m-0 border-t border-hairline px-[22px] py-8 text-center">Nothing here for this filter</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="v-stack w-full min-w-[620px] border-collapse">
              <thead>
                <tr className="border-y border-hairline">
                  <th scope="col" className="v-th px-[22px] py-3 text-left">Requested</th>
                  <th scope="col" className="v-th p-3 text-left">Amount</th>
                  <th scope="col" className="v-th p-3 text-left">To</th>
                  <th scope="col" className="v-th py-3 pl-3 pr-[22px] text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p, i) => {
                  const s = STATUS[p.status] || STATUS_FALLBACK;
                  return (
                    <tr key={p.id} className="v-row v-al border-b border-hairline" style={{ "--i": Math.min(i, 12) }}>
                      <td className="px-[22px] py-3.5 text-[14px] font-bold">{fmtDate(p.requested_at)}</td>
                      <td data-l="Amount" className="px-3 py-3.5">
                        <span className="v-tab text-[15px] font-extrabold" style={{ color: s.amt }}>
                          {fmt(p.amount)}
                        </span>
                      </td>
                      <td data-l="To" className="px-3 py-3.5 text-[14px] text-muted">
                        {p.method === "bank" ? `${p.bank_name} ${maskAccount(p.account_number)}` : "Wallet"}
                      </td>
                      <td data-l="Status" className="py-3.5 pl-3 pr-[22px]">
                        <span className="v-status" style={{ color: s.ink }}>
                          <span className="v-dot" style={{ background: s.dot }} />
                          {s.label || p.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="v-hint m-0 px-[22px] py-3.5 text-center">
          Questions?{" "}
          <a href="mailto:support@usebyro.com" className="font-bold text-brand-dark">
            support@usebyro.com
          </a>
        </p>
      </section>
    </div>
  );
}
