"use client";

import { useEffect, useState } from "react";
import { formatNaira } from "@/lib/eventFormat";

interface AdminPayment {
  id: string;
  paystack_reference: string;
  event_name: string | null;
  tier_name: string | null;
  promo_code: string | null;
  customer_name: string;
  customer_email: string;
  amount: string;
  status: string;
  channel: string | null;
  tickets: number;
  paid_at: string | null;
  created_at: string;
}

const STATUSES = ["", "successful", "pending", "failed", "abandoned"];

const STATUS_STYLE: Record<string, string> = {
  successful: "bg-green-500/10 text-green-700",
  pending: "bg-yellow-500/10 text-amber-700",
  failed: "bg-red-500/10 text-red-600",
};

function formatDateTime(s: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleString("en-GB", {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export default function AdminPaymentsPage() {
  const [payments, setPayments] = useState<AdminPayment[]>([]);
  const [count, setCount] = useState(0);
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (debounced) params.set("search", debounced);
    fetch(`/api/admin/payments?${params}`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error();
        if (cancelled) return;
        setPayments(data.payments ?? []);
        setCount(data.count ?? 0);
        setError("");
      })
      .catch(() => { if (!cancelled) setError("Couldn't load payments."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [status, debounced]);

  return (
    <div className="p-5 md:p-8">
      <div className="mb-8">
        <h1 className="font-display text-ink text-3xl font-extrabold tracking-tight">Payments</h1>
        <p className="text-muted text-sm mt-1">
          {loading ? "Loading…" : `${count.toLocaleString()} payments, newest first`}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-6">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by email, name, reference or event…"
          className="w-full sm:w-80 bg-mist border border-line rounded-lg px-3 py-2 text-sm text-ink placeholder:text-faint focus:outline-none focus:ring-1 focus:ring-brand/40"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          aria-label="Filter by status"
          className="bg-mist border border-line rounded-lg px-3 py-2 text-sm text-ink focus:outline-none"
        >
          {STATUSES.map((s) => (
            <option key={s} value={s} className="bg-white">
              {s ? s[0].toUpperCase() + s.slice(1) : "All statuses"}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="text-red-600 text-sm mb-6">{error}</p>}

      <div className="bg-white border border-line rounded-xl p-6 overflow-x-auto">
        {!loading && payments.length === 0 ? (
          <p className="text-faint text-sm py-6 text-center">No payments match.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hairline text-left">
                {["Customer", "Event", "Amount", "Promo", "Tickets", "Status", "Date"].map((h) => (
                  <th key={h} className="pb-3 pr-6 text-xs text-faint font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {payments.map((p) => (
                <tr key={p.id}>
                  <td className="py-3 pr-6">
                    <p className="text-ink truncate max-w-[200px]">{p.customer_name || p.customer_email}</p>
                    <p className="text-faint text-xs truncate max-w-[200px]">{p.paystack_reference}</p>
                  </td>
                  <td className="py-3 pr-6 text-muted">
                    <p className="truncate max-w-[180px]">{p.event_name ?? "—"}</p>
                    {p.tier_name && <p className="text-faint text-xs">{p.tier_name}</p>}
                  </td>
                  <td className="py-3 pr-6 text-[#3B4252] tabular-nums whitespace-nowrap">
                    {formatNaira(Number(p.amount))}
                  </td>
                  <td className="py-3 pr-6 text-muted">{p.promo_code ?? "—"}</td>
                  <td className="py-3 pr-6 text-muted tabular-nums">{p.tickets}</td>
                  <td className="py-3 pr-6">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLE[p.status] ?? "bg-gray-500/10 text-muted"}`}>
                      {p.status}
                    </span>
                  </td>
                  <td className="py-3 text-muted whitespace-nowrap">{formatDateTime(p.paid_at ?? p.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
