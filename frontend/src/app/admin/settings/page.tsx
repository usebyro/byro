"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { useAdminMe } from "@/components/admin/AdminMe";
import { publicHref } from "@/lib/adminNav";
import { formatNaira } from "@/lib/eventFormat";

interface Settings {
  default_fee_percent: string;
  max_fee_percent: string;
  updated_by_email: string;
  updated_at: string;
  organiser_fees: { user_id: number; email: string; name: string; handle: string | null; fee_percent: string }[];
}

export default function AdminSettingsPage() {
  const me = useAdminMe();
  const isOwner = me.role === "owner";
  const [data, setData] = useState<Settings | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/settings");
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error();
      setData(body);
      setDraft(body.default_fee_percent);
    } catch {
      setError("Couldn't load settings.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const pct = Number(draft);
  const valid = draft.trim() !== "" && Number.isFinite(pct) && pct >= 0 && pct <= Number(data?.max_fee_percent ?? 15);
  const changed = data && valid && pct !== Number(data.default_fee_percent);
  // A ₦5,000 ticket, buyer pays the fee: what each side sees.
  const example = 5000;
  const exampleFee = valid ? Math.round(example * (pct / 100)) : 0;

  const save = async () => {
    if (!data || !changed) return;
    if (!window.confirm(`Change Byro's default service fee from ${data.default_fee_percent}% to ${pct}%?\n\nIt applies to new orders straight away, for every organiser without a special fee. Orders already paid keep their fee.`)) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/settings", { method: "PATCH", body: JSON.stringify({ default_fee_percent: draft.trim() }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "Try again.");
      setData(body);
      setDraft(body.default_fee_percent);
      toast.success("Default fee updated", { description: `${body.default_fee_percent}% on new orders` });
    } catch (err) {
      toast.error("Couldn't update the fee", { description: (err as Error).message });
    } finally {
      setSaving(false);
    }
  };

  if (error) return <div className="p-5 md:p-8"><p className="text-red-600 text-sm">{error}</p></div>;
  if (!data) return <div className="p-5 md:p-8"><p className="text-faint text-sm">Loading…</p></div>;

  return (
    <div className="p-5 md:p-8 max-w-3xl">
      <div className="mb-8">
        <h1 className="font-display text-ink text-3xl font-extrabold tracking-tight">Settings</h1>
        <p className="text-muted text-sm mt-1">Byro&apos;s service fee. Changes apply to new orders only; paid orders and payouts keep their fee.</p>
      </div>

      <section className="bg-white border border-line rounded-xl p-6">
        <h2 className="text-ink font-semibold">Default service fee</h2>
        <p className="text-muted text-sm mt-1">Charged on every paid ticket, unless an organiser has a special fee below.</p>

        <div className="mt-5 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs font-bold text-muted">
            Fee
            <span className="flex items-center rounded-lg border border-line bg-white focus-within:ring-1 focus-within:ring-brand/40">
              <input
                type="number"
                inputMode="decimal"
                min={0}
                max={Number(data.max_fee_percent)}
                step={0.25}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                disabled={!isOwner}
                aria-invalid={!valid}
                className="w-24 bg-transparent px-3 py-2 text-lg font-bold text-ink tabular-nums focus:outline-none disabled:text-muted"
              />
              <span className="pr-3 text-lg font-bold text-muted">%</span>
            </span>
          </label>
          {isOwner && (
            <button
              type="button"
              onClick={save}
              disabled={!changed || saving}
              className="rounded-lg bg-brand px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-dark disabled:opacity-40"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          )}
        </div>
        {!valid && <p className="mt-2 text-sm text-red-600">Enter a number from 0 to {data.max_fee_percent}.</p>}
        {!isOwner && <p className="mt-2 text-xs text-faint">Only Owners can change the fee.</p>}

        {valid && (
          <p className="mt-4 rounded-lg bg-mist px-4 py-3 text-sm text-ink">
            A {formatNaira(example)} ticket: the buyer pays {formatNaira(example + exampleFee)} plus Paystack&apos;s charge, and Byro keeps{" "}
            {formatNaira(exampleFee)}. If the organiser pays the fee instead, they receive {formatNaira(example - exampleFee)}.
          </p>
        )}
        {data.updated_by_email && (
          <p className="mt-3 text-xs text-faint">
            Last changed by {data.updated_by_email} on {new Date(data.updated_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
          </p>
        )}
      </section>

      <section className="mt-4 bg-white border border-line rounded-xl p-6">
        <h2 className="text-ink font-semibold">Organisers with a special fee</h2>
        <p className="text-muted text-sm mt-1">
          Set or remove a special fee from an organiser&apos;s panel on the Users page.
        </p>
        {data.organiser_fees.length === 0 ? (
          <p className="mt-4 text-sm text-faint">None. Everyone pays the default.</p>
        ) : (
          <ul className="mt-4 divide-y divide-hairline">
            {data.organiser_fees.map((o) => (
              <li key={o.user_id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <span className="min-w-0">
                  {o.handle ? (
                    <a href={publicHref(`/u/${o.handle}`)} target="_blank" rel="noopener noreferrer" className="text-ink hover:underline">
                      {o.name}
                    </a>
                  ) : (
                    <span className="text-ink">{o.name}</span>
                  )}
                  <span className="block truncate text-xs text-muted">{o.email}</span>
                </span>
                <span className="shrink-0 font-bold tabular-nums text-ink">{o.fee_percent}%</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
