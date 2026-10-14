"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useAdminMe } from "@/components/admin/AdminMe";

const KINDS = [
  { value: "payments", title: "Payments", sub: "Every checkout: buyer, event, ticket total, Byro fee, amount paid, refund" },
  { value: "payouts", title: "Payouts", sub: "Money paid to organisers, with bank details. Handle with care." },
  { value: "refunds", title: "Refunds", sub: "Money returned to buyers, why, and where it got to" },
  { value: "users", title: "Users", sub: "Accounts that joined in the dates: name, email, role, events, followers" },
];

const iso = (d: Date) => d.toISOString().slice(0, 10);

function defaultRange() {
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - 30);
  return { from: iso(from), to: iso(to) };
}

export default function AdminExportsPage() {
  const { can } = useAdminMe();
  const [range, setRange] = useState(defaultRange);
  const [busy, setBusy] = useState("");

  const download = async (kind: string) => {
    setBusy(kind);
    try {
      const res = await fetch(`/api/admin/export/${kind}?${new URLSearchParams({ from: range.from, to: range.to })}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "Try again.");
      }
      const blob = await res.blob();
      const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") || "")?.[1] || `byro-${kind}.csv`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Download started", { description: name });
    } catch (err) {
      toast.error("Couldn't export", { description: (err as Error).message });
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="p-5 md:p-8">
      <div className="mb-8">
        <h1 className="font-display text-ink text-3xl font-extrabold tracking-tight">Exports</h1>
        <p className="text-muted text-sm mt-1">Download spreadsheets (CSV) for accounting and records. Opens in Excel, Numbers or Google Sheets.</p>
      </div>

      {!can.moderate ? (
        <p className="bg-white border border-line rounded-xl p-6 text-sm text-muted">
          Exports include personal and bank details, so only Admins and Owners can download them.
        </p>
      ) : (
        <>
          <div className="mb-6 flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs font-bold text-muted">
              From
              <input
                type="date"
                value={range.from}
                max={range.to}
                onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
                className="bg-white border border-line rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-brand/40"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-bold text-muted">
              To
              <input
                type="date"
                value={range.to}
                min={range.from}
                onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
                className="bg-white border border-line rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-brand/40"
              />
            </label>
            <p className="pb-2 text-xs text-faint">Up to one year at a time. Every download is recorded in the audit log.</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {KINDS.map((k) => (
              <div key={k.value} className="flex flex-col gap-3 bg-white border border-line rounded-xl p-5">
                <div>
                  <h2 className="font-display text-lg font-bold text-ink">{k.title}</h2>
                  <p className="text-sm text-muted">{k.sub}</p>
                </div>
                <button
                  type="button"
                  onClick={() => download(k.value)}
                  disabled={busy !== "" || !range.from || !range.to}
                  className="self-start rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white hover:bg-brand-dark disabled:opacity-60"
                >
                  {busy === k.value ? "Preparing…" : "Download CSV"}
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
