"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowRight02Icon } from "@hugeicons/core-free-icons";
import { toast } from "sonner";
import { useAdminMe } from "@/components/admin/AdminMe";
import { Button, SkeletonCard, fmtDateTime, useConfirm } from "@/components/admin/ui";
import { publicHref } from "@/lib/adminNav";
import { formatNaira } from "@/lib/eventFormat";

interface Deal {
  user_id: number;
  email: string;
  name: string;
  handle: string | null;
  fee_percent: string;
  events: number;
}

type Provider = "paystack" | "bachs";

interface PaymentSettings {
  provider: Provider;
  source: "admin" | "server";
  test_emails: string[];
  server_test_emails: string[];
  bachs_configured: boolean;
  bachs_mode: "live" | "sandbox" | null;
  bachs_webhook_configured: boolean;
  history: { kind: "provider" | "test_emails"; who: string; change: string; at: string }[];
}

interface Settings {
  default_fee_percent: string;
  max_fee_percent: string;
  updated_by_email: string;
  updated_at: string;
  organiser_fees: Deal[];
  history: { kind: "default" | "organiser"; who: string; target: string; change: string; at: string }[];
  payments: PaymentSettings;
}

const PROVIDER_NAME: Record<Provider, string> = { paystack: "Paystack", bachs: "Bachs" };

interface Organiser {
  user_id: number;
  email: string;
  name: string;
  handle: string | null;
  events: number | null;
}

type Tab = "fees" | "payments";

const STEP = 0.25;
const clean = (n: number) => String(Math.round(n * 100) / 100);

/* One surface style for the whole page: a white panel on the admin's paper background. */
const PANEL = "rounded-2xl border border-line bg-white p-5 md:p-6";

/* Named properties only, so presses and hovers stay on the compositor. */
const PRESS =
  "transition-[background-color,border-color,box-shadow,opacity,transform,scale] duration-150 ease-out active:scale-[0.96] motion-reduce:transition-none";

/** "changed to", between an old and a new value. */
const To = () => (
  <>
    <HugeiconsIcon icon={ArrowRight02Icon} size={14} color="currentColor" aria-hidden="true" className="mx-1 inline-block -translate-y-px align-middle" />
    <span className="sr-only">to </span>
  </>
);

/* A titled block of controls. The title and hint sit above, stacked, never beside. */
function Block({ title, hint, children }: { title: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="font-display text-xl font-bold tracking-tight text-ink">{title}</h2>
      {hint && <p className="mt-1 max-w-[65ch] text-sm leading-relaxed text-muted text-pretty">{hint}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

/* A percentage box with - and + buttons, 0.25 at a time. */
function PercentInput({
  value,
  onChange,
  max,
  disabled,
  label,
  size = "lg",
}: {
  value: string;
  onChange: (v: string) => void;
  max: number;
  disabled?: boolean;
  label: string;
  size?: "lg" | "sm";
}) {
  const n = Number(value);
  const bump = (d: number) => onChange(clean(Math.min(max, Math.max(0, (Number.isFinite(n) ? n : 0) + d))));
  const big = size === "lg";
  const step = `flex shrink-0 items-center justify-center rounded-full text-ink hover:bg-mist disabled:opacity-40 ${PRESS} ${
    big ? "h-12 w-12 text-2xl" : "h-8 w-8"
  }`;
  return (
    <div className={`inline-flex items-center gap-1 rounded-full border border-line bg-white focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/25 ${big ? "p-1.5" : "p-0.5"}`}>
      <button type="button" className={step} onClick={() => bump(-STEP)} disabled={disabled || n <= 0} aria-label={`Lower ${label}`}>
        −
      </button>
      <label className="flex items-baseline justify-center">
        <span className="sr-only">{label}</span>
        <input
          type="number"
          inputMode="decimal"
          min={0}
          max={max}
          step={STEP}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className={`bg-transparent text-center font-display font-extrabold tabular-nums tracking-tight text-ink focus:outline-none disabled:text-muted [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none ${
            big ? "w-28 text-5xl" : "w-12 text-base font-bold"
          }`}
        />
        <span className={`font-display font-bold text-muted ${big ? "text-3xl" : "text-sm"}`}>%</span>
      </label>
      <button type="button" className={step} onClick={() => bump(STEP)} disabled={disabled || n >= max} aria-label={`Raise ${label}`}>
        +
      </button>
    </div>
  );
}

/* Tabs: Fees and Payments. Arrow keys move between them; the choice lives in the URL hash so a link can open one. */
function Tabs({ value, onChange }: { value: Tab; onChange: (t: Tab) => void }) {
  const tabs: { id: Tab; label: string }[] = [
    { id: "fees", label: "Fees" },
    { id: "payments", label: "Payments" },
  ];
  return (
    <div role="tablist" aria-label="Settings" className="flex w-full gap-1 rounded-full bg-mist p-1 sm:inline-flex sm:w-auto">
      {tabs.map((t) => {
        const on = value === t.id;
        return (
          <button
            key={t.id}
            id={`tab-${t.id}`}
            type="button"
            role="tab"
            aria-selected={on}
            aria-controls={`panel-${t.id}`}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(t.id)}
            onKeyDown={(e) => {
              if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
              e.preventDefault();
              const next = tabs[(tabs.findIndex((x) => x.id === value) + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length].id;
              onChange(next);
              document.getElementById(`tab-${next}`)?.focus();
            }}
            className={`h-11 flex-1 rounded-full px-5 text-sm font-bold sm:h-10 sm:flex-none ${PRESS} ${
              on ? "bg-white text-ink shadow-[0_1px_2px_rgba(20,22,28,0.08),0_0_0_1px_rgba(20,22,28,0.04)]" : "text-muted hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

/* A change log folded away by default: it matters when you need it, not on every visit. */
function Timeline({
  entries,
}: {
  entries: { key: string; tone: "brand" | "marigold"; title: string; change: React.ReactNode; at: string; who: string }[];
}) {
  return (
    <details className="group rounded-2xl border border-line bg-white">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-5 py-4 text-sm font-bold text-ink hover:bg-mist focus-visible:outline-2 focus-visible:outline-brand [&::-webkit-details-marker]:hidden">
        <span>
          History <span className="ml-1 font-normal tabular-nums text-faint">{entries.length === 0 ? "No changes yet" : `${entries.length} change${entries.length === 1 ? "" : "s"}`}</span>
        </span>
        <HugeiconsIcon icon={ArrowRight02Icon} size={16} color="currentColor" aria-hidden="true" className="text-muted transition-transform duration-150 ease-out group-open:rotate-90 motion-reduce:transition-none" />
      </summary>
      <div className="border-t border-hairline px-5 py-5">
        {entries.length === 0 ? (
          <p className="text-sm text-faint">Nothing has been changed here yet.</p>
        ) : (
          <>
            <ol className="relative space-y-4 border-l border-line pl-5">
              {entries.map((h) => (
                <li key={h.key} className="relative">
                  <span aria-hidden="true" className={`absolute -left-[26px] top-1.5 h-2.5 w-2.5 rounded-full ${h.tone === "brand" ? "bg-brand" : "bg-marigold"}`} />
                  <p className="text-sm text-ink">
                    <b>{h.title}</b> <span className="tabular-nums">{h.change}</span>
                  </p>
                  <p className="text-xs text-faint">
                    {fmtDateTime(h.at)}, {h.who || "unknown"}
                  </p>
                </li>
              ))}
            </ol>
            <p className="mt-5 text-xs text-faint">The full record is in the Audit log.</p>
          </>
        )}
      </div>
    </details>
  );
}

const arrowParts = (change: string) =>
  change.split("->").map((part, j) => (
    <span key={j}>
      {j > 0 && <To />}
      {part.trim()}
    </span>
  ));

export default function AdminSettingsPage() {
  const me = useAdminMe();
  const isOwner = me.role === "owner";
  const confirm = useConfirm();
  const [data, setData] = useState<Settings | null>(null);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [price, setPrice] = useState("5000");
  const [payer, setPayer] = useState<"buyer" | "organiser">("buyer");
  const [tab, setTab] = useState<Tab>("fees");

  useEffect(() => {
    if (window.location.hash === "#payments") setTab("payments");
  }, []);

  const chooseTab = (t: Tab) => {
    setTab(t);
    window.history.replaceState(null, "", t === "fees" ? window.location.pathname : `#${t}`);
  };

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/settings");
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error();
      setData(body);
      setDraft(body.default_fee_percent);
    } catch {
      setError("Couldn't load settings. Refresh to try again.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const max = Number(data?.max_fee_percent ?? 15);
  const pct = Number(draft);
  const valid = draft.trim() !== "" && Number.isFinite(pct) && pct >= 0 && pct <= max;
  const dirty = Boolean(data && valid && pct !== Number(data.default_fee_percent));

  const save = async () => {
    if (!data || !dirty) return;
    const ok = await confirm({
      title: `Change the default fee from ${data.default_fee_percent}% to ${clean(pct)}%?`,
      body: "It applies to new orders straight away, for every organiser without a special fee. Orders already paid, and payouts, keep their fee.",
      confirmLabel: `Change to ${clean(pct)}%`,
    });
    if (!ok) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/settings", { method: "PATCH", body: JSON.stringify({ default_fee_percent: clean(pct) }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "Try again.");
      setData(body);
      setDraft(body.default_fee_percent);
      toast.success("Default fee changed", { description: `${body.default_fee_percent}% on new orders` });
    } catch (err) {
      toast.error("Couldn't change the fee", { description: (err as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const setDeal = async (o: { user_id: number; name: string }, value: string | null) => {
    const ok = await confirm({
      title: value === null ? `Put ${o.name} back on the default fee?` : `Give ${o.name} a ${value}% fee?`,
      body: "It applies to their new orders straight away. Orders they've already been paid for keep their fee.",
      confirmLabel: value === null ? "Use default fee" : `Set ${value}%`,
    });
    if (!ok) return false;
    try {
      const res = await fetch(`/api/admin/users/${o.user_id}/fee`, { method: "PATCH", body: JSON.stringify({ fee_percent: value }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "Try again.");
      toast.success(value === null ? "Back on the default fee" : "Special fee set", { description: `${o.name}: ${body.effective_percent}% on new orders` });
      await load();
      return true;
    } catch (err) {
      toast.error("Couldn't update the fee", { description: (err as Error).message });
      return false;
    }
  };

  if (error) {
    return (
      <div className="p-5 md:p-8">
        <p role="alert" className="rounded-xl bg-danger-tint px-4 py-3 text-sm text-danger">{error}</p>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="max-w-5xl space-y-4 p-5 md:p-8">
        <SkeletonCard className="h-16" />
        <SkeletonCard className="h-64" />
        <SkeletonCard className="h-40" />
      </div>
    );
  }

  const shown = valid ? pct : Number(data.default_fee_percent);
  const p = Math.max(0, Number(price) || 0);
  const fee = Math.round(p * (shown / 100));

  const rows: [string, string, boolean?][] =
    payer === "buyer"
      ? [
          ["Ticket", formatNaira(p)],
          [`Byro fee (${clean(shown)}%)`, formatNaira(fee)],
          ["Buyer pays", formatNaira(p + fee), true],
          ["Organiser gets", formatNaira(p)],
        ]
      : [
          ["Buyer pays", formatNaira(p)],
          [`Byro fee (${clean(shown)}%)`, `−${formatNaira(fee)}`],
          ["Organiser gets", formatNaira(p - fee), true],
        ];

  return (
    <div className="max-w-5xl p-5 pb-28 md:p-8 md:pb-28">
      <header className="mb-6">
        <h1 className="font-display text-3xl font-extrabold tracking-tight text-ink">Settings</h1>
        <p className="mt-1 max-w-[65ch] text-sm text-muted text-pretty">What Byro charges on paid tickets, and which payment provider takes new orders.</p>
      </header>

      <Tabs value={tab} onChange={chooseTab} />

      {tab === "fees" && (
        <div role="tabpanel" id="panel-fees" aria-labelledby="tab-fees" className="mt-8 space-y-10">
          {/* The fee on the left, what it does to a real price on the right. */}
          <div className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
            <section className="flex flex-col rounded-2xl border border-line bg-white p-5 md:p-6">
              <h2 className="font-display text-xl font-bold tracking-tight text-ink">Default service fee</h2>
              <p className="mt-1 text-sm leading-relaxed text-muted text-pretty">
                Charged on every paid ticket unless the organiser has a special fee. Free tickets are never charged.
              </p>
              <div className="my-6">
                <PercentInput value={draft} onChange={setDraft} max={max} disabled={!isOwner} label="Default service fee" />
              </div>
              <div className="mt-auto text-sm">
                {dirty ? (
                  <p className="font-semibold text-waiting">
                    Not saved: {data.default_fee_percent}% <To /> {clean(pct)}%
                  </p>
                ) : (
                  <p className="text-muted">Current fee on new orders</p>
                )}
                {data.updated_by_email && (
                  <p className="mt-0.5 text-xs text-faint">
                    Last changed {fmtDateTime(data.updated_at)} by {data.updated_by_email}
                  </p>
                )}
                {!isOwner && <p className="mt-2 font-semibold text-ink">Only Owners can change it.</p>}
                {!valid && <p role="alert" className="mt-2 text-danger">Enter a number from 0 to {data.max_fee_percent}.</p>}
              </div>
            </section>

            <section className={PANEL}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="font-display text-xl font-bold tracking-tight text-ink">What people pay</h2>
                <label className="flex items-center gap-2 rounded-full border border-line bg-white px-4 py-2 text-sm focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/25">
                  <span className="text-muted">Ticket price</span>
                  <span className="font-bold text-ink">₦</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    step={500}
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    aria-label="Ticket price in naira"
                    className="w-20 bg-transparent font-bold tabular-nums text-ink focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                  />
                </label>
              </div>

              <div role="radiogroup" aria-label="Who pays the fee" className="mt-4 grid w-full grid-cols-2 gap-1 rounded-full bg-mist p-1 sm:inline-grid sm:w-auto">
                {(
                  [
                    ["buyer", "Buyer pays"],
                    ["organiser", "Organiser pays"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={payer === id}
                    onClick={() => setPayer(id)}
                    className={`h-10 rounded-full px-4 text-center text-sm font-semibold sm:h-9 ${PRESS} ${
                      payer === id ? "bg-white text-ink shadow-[0_1px_2px_rgba(20,22,28,0.08),0_0_0_1px_rgba(20,22,28,0.04)]" : "text-muted hover:text-ink"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Receipt: an inset tray, so the inner radius is the outer one minus the tray's padding. */}
              <div className="mt-4 rounded-2xl bg-paper p-1.5">
                <dl className="divide-y divide-hairline rounded-[10px] bg-white px-4">
                  {rows.map(([label, value, strong]) => (
                    <div key={label} className="flex items-baseline justify-between gap-4 py-3 text-sm">
                      <dt className={strong ? "font-bold text-ink" : "text-muted"}>{label}</dt>
                      <dd className={`tabular-nums ${strong ? "font-display text-xl font-bold text-ink" : "text-ink"}`}>{value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
              <p className="mt-3 max-w-[65ch] text-xs leading-relaxed text-faint text-pretty">
                {payer === "buyer"
                  ? "Most events. The fee is added to the price at checkout, and the payment processing charge goes on top for the buyer."
                  : "The buyer sees one clean price and the fee comes out of the organiser's earnings. The payment processing charge still goes on top for the buyer."}
                {dirty && " Showing the unsaved fee."}
              </p>
            </section>
          </div>

          <Block
            title="Special fees"
            hint="A different fee for one organiser, such as a partner or a charity. It replaces the default for their new orders."
          >
            <SpecialFees deals={data.organiser_fees} defaultPercent={data.default_fee_percent} max={max} canEdit={isOwner} onSet={setDeal} />
          </Block>

          <Timeline
            entries={data.history.map((h, i) => ({
              key: String(i),
              tone: h.kind === "default" ? "brand" : "marigold",
              title: h.kind === "default" ? "Default fee" : h.target,
              change: arrowParts(h.change),
              at: h.at,
              who: h.who,
            }))}
          />
        </div>
      )}

      {tab === "payments" && (
        <div role="tabpanel" id="panel-payments" aria-labelledby="tab-payments" className="mt-8">
          <PaymentsPanel payments={data.payments} canEdit={isOwner} onSaved={(body) => setData(body)} />
        </div>
      )}

      {/* Save bar: only while there's an unsaved change, so it's obvious and never in the way otherwise. */}
      {isOwner && dirty && (
        <div className="fixed inset-x-0 bottom-4 z-40 flex justify-center px-4 md:left-60">
          <div
            role="region"
            aria-label="Unsaved change"
            className="flex w-full max-w-xl items-center justify-between gap-3 rounded-full bg-ink py-2 pl-5 pr-2 text-white shadow-[0_16px_40px_rgba(20,22,28,0.28)] animate-dialog-in motion-reduce:animate-none"
          >
            <p className="text-sm">
              <span className="hidden sm:inline">Default fee </span><b className="tabular-nums">{data.default_fee_percent}% <To /> {clean(pct)}%</b>
            </p>
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => setDraft(data.default_fee_percent)}
                className={`h-10 rounded-full px-4 text-sm font-bold text-white/80 hover:bg-white/10 hover:text-white ${PRESS}`}
              >
                Discard
              </button>
              <Button variant="primary" onClick={save} loading={saving}>
                Save change
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* The table of organisers on a special fee, with in-place change/remove and an "add" search. */
function SpecialFees({
  deals,
  defaultPercent,
  max,
  canEdit,
  onSet,
}: {
  deals: Deal[];
  defaultPercent: string;
  max: number;
  canEdit: boolean;
  onSet: (o: { user_id: number; name: string }, value: string | null) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");
  const [adding, setAdding] = useState<Organiser | null>(null);
  const [addValue, setAddValue] = useState("");

  const diff = (fee: string) => {
    const d = Number(fee) - Number(defaultPercent);
    if (Math.abs(d) < 0.001) return { text: "Same as default", cls: "text-faint" };
    return d < 0
      ? { text: `${clean(-d)}% lower`, cls: "text-good" }
      : { text: `${clean(d)}% higher`, cls: "text-waiting" };
  };

  return (
    <div className="space-y-4">
      {deals.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line px-5 py-6 text-center text-sm text-muted">
          Nobody has a special fee. Everyone pays {defaultPercent}%.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-line">
          <table className="w-full text-sm">
            <thead className="bg-paper">
              <tr className="text-left">
                <th scope="col" className="px-3 py-2.5 text-xs font-bold text-faint sm:px-4">Organiser</th>
                <th scope="col" className="px-3 py-2.5 text-xs font-bold text-faint sm:px-4">Fee</th>
                <th scope="col" className="hidden px-4 py-2.5 text-xs font-bold text-faint sm:table-cell">Events</th>
                <th scope="col" className="px-4 py-2.5"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {deals.map((d) => {
                const isEditing = editing === d.user_id;
                const vs = diff(d.fee_percent);
                return (
                  <tr key={d.user_id} className="align-middle">
                    <td className="px-3 py-3 sm:px-4">
                      {d.handle ? (
                        <a href={publicHref(`/u/${d.handle}`)} target="_blank" rel="noopener noreferrer" className="font-semibold text-ink hover:underline">
                          {d.name}
                        </a>
                      ) : (
                        <span className="font-semibold text-ink">{d.name}</span>
                      )}
                      <span className="block max-w-[130px] truncate text-xs text-muted sm:max-w-[220px]">{d.email}</span>
                    </td>
                    <td className="px-3 py-3 sm:px-4">
                      {isEditing ? (
                        <PercentInput value={editValue} onChange={setEditValue} max={max} label={`${d.name}'s fee`} size="sm" />
                      ) : (
                        <>
                          <span className="font-display text-lg font-bold tabular-nums text-ink">{d.fee_percent}%</span>
                          <span className={`block text-xs font-semibold ${vs.cls}`}>{vs.text}</span>
                        </>
                      )}
                    </td>
                    <td className="hidden px-4 py-3 tabular-nums text-muted sm:table-cell">{d.events}</td>
                    <td className="px-3 py-3 text-right sm:px-4">
                      {canEdit &&
                        (isEditing ? (
                          <span className="inline-flex flex-col items-stretch gap-1.5 sm:flex-row">
                            <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                              Cancel
                            </Button>
                            <Button
                              size="sm"
                              variant="primary"
                              disabled={editValue.trim() === "" || Number(editValue) === Number(d.fee_percent)}
                              onClick={async () => {
                                if (await onSet(d, clean(Number(editValue)))) setEditing(null);
                              }}
                            >
                              Save
                            </Button>
                          </span>
                        ) : (
                          <span className="inline-flex flex-col items-stretch gap-1.5 sm:flex-row">
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => {
                                setEditing(d.user_id);
                                setEditValue(d.fee_percent);
                              }}
                            >
                              Change
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => onSet(d, null)}>
                              Remove
                            </Button>
                          </span>
                        ))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {canEdit &&
        (adding ? (
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-brand/30 bg-sky px-4 py-3">
            <span className="min-w-0 flex-1">
              <span className="block font-semibold text-ink">{adding.name}</span>
              <span className="block truncate text-xs text-muted">{adding.email}</span>
            </span>
            <PercentInput value={addValue} onChange={setAddValue} max={max} label={`${adding.name}'s fee`} size="sm" />
            <span className="inline-flex flex-col items-stretch gap-1.5 sm:flex-row">
              <Button size="sm" variant="ghost" onClick={() => setAdding(null)}>
                Cancel
              </Button>
              <Button
                size="sm"
                variant="primary"
                disabled={addValue.trim() === ""}
                onClick={async () => {
                  if (await onSet(adding, clean(Number(addValue)))) setAdding(null);
                }}
              >
                Set fee
              </Button>
            </span>
          </div>
        ) : (
          <OrganiserSearch
            exclude={deals.map((d) => d.user_id)}
            onPick={(o) => {
              setAdding(o);
              setAddValue(defaultPercent);
            }}
          />
        ))}
    </div>
  );
}

/* Search for an organiser to give a special fee. */
function OrganiserSearch({ exclude, onPick }: { exclude: number[]; onPick: (o: Organiser) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Organiser[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return;
    const t = setTimeout(async () => {
      const res = await fetch(`/api/admin/communities?${new URLSearchParams({ search: term })}`);
      const data = await res.json().catch(() => []);
      setResults(Array.isArray(data) ? data.slice(0, 8) : []);
      setActive(0);
      setOpen(true);
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const away = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, []);

  const options = useMemo(() => results.filter((r) => !exclude.includes(r.user_id)), [results, exclude]);
  const showing = open && q.trim().length >= 2;

  const pick = (o: Organiser) => {
    onPick(o);
    setQ("");
    setOpen(false);
  };

  return (
    <div ref={box} className="relative max-w-md">
      <label htmlFor="add-organiser" className="mb-1.5 block text-sm font-bold text-ink">
        Add an organiser
      </label>
      <input
        id="add-organiser"
        type="search"
        role="combobox"
        aria-expanded={showing}
        aria-controls="organiser-results"
        aria-autocomplete="list"
        autoComplete="off"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (!showing || options.length === 0) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(options.length - 1, a + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(0, a - 1));
          } else if (e.key === "Enter") {
            e.preventDefault();
            pick(options[active]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        placeholder="Search by name, handle or email…"
        className="h-11 w-full rounded-full border border-line bg-white px-4 text-sm text-ink placeholder:text-faint focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25"
      />
      {showing && (
        <ul
          id="organiser-results"
          role="listbox"
          className="absolute left-0 right-0 top-[calc(100%+6px)] z-20 max-h-72 overflow-y-auto rounded-2xl border border-line bg-white p-1.5 shadow-[0_12px_32px_rgba(20,22,28,0.12)] animate-menu-in motion-reduce:animate-none"
        >
          {options.length === 0 ? (
            <li className="px-3 py-3 text-sm text-faint">No organisers match.</li>
          ) : (
            options.map((o, i) => (
              <li
                key={o.user_id}
                role="option"
                aria-selected={i === active}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(o);
                }}
                className={`cursor-pointer rounded-xl px-3 py-2.5 ${i === active ? "bg-mist" : ""}`}
              >
                <span className="block text-sm font-semibold text-ink">{o.name}</span>
                <span className="block truncate text-xs text-muted">
                  {o.handle ? `@${o.handle} · ` : ""}
                  {o.email}
                  {o.events ? ` · ${o.events} event${o.events === 1 ? "" : "s"}` : ""}
                </span>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}


/* Which provider takes new ticket orders, how Bachs is connected, the Bachs test list, and their history. */
function PaymentsPanel({
  payments,
  canEdit,
  onSaved,
}: {
  payments: PaymentSettings;
  canEdit: boolean;
  onSaved: (body: Settings) => void;
}) {
  const confirm = useConfirm();
  const [switching, setSwitching] = useState<Provider | null>(null);
  const [emailsDraft, setEmailsDraft] = useState(payments.test_emails.join("\n"));
  const [savingEmails, setSavingEmails] = useState(false);

  useEffect(() => {
    setEmailsDraft(payments.test_emails.join("\n"));
  }, [payments.test_emails]);

  const send = async (body: Record<string, unknown>) => {
    const res = await fetch("/api/admin/settings", { method: "PATCH", body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || "Try again.");
    onSaved(data);
    return data as Settings;
  };

  const choose = async (next: Provider) => {
    if (next === payments.provider) return;
    const toBachs = next === "bachs";
    const ok = await confirm({
      title: `Send new orders to ${PROVIDER_NAME[next]}?`,
      body: toBachs
        ? "Every new paid ticket order goes to Bachs from now on, for every buyer. Orders already taken stay with the provider that took them, so their tickets and refunds keep working. You can switch back at any time."
        : "Every new paid ticket order goes to Paystack from now on. Buyers on the Bachs test list still go to Bachs. Orders already taken by Bachs keep verifying and refunding through Bachs.",
      confirmLabel: `Use ${PROVIDER_NAME[next]}`,
      tone: toBachs ? "danger" : "primary",
    });
    if (!ok) return;
    setSwitching(next);
    try {
      await send({ payment_provider: next });
      toast.success(`New orders now go to ${PROVIDER_NAME[next]}`);
    } catch (err) {
      toast.error("Couldn't change the provider", { description: (err as Error).message });
    } finally {
      setSwitching(null);
    }
  };

  const parsed = emailsDraft
    .split(/[\s,;]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  const emailsDirty = parsed.join(",") !== payments.test_emails.join(",");

  const saveEmails = async () => {
    setSavingEmails(true);
    try {
      const body = await send({ bachs_test_emails: parsed });
      const n = body.payments.test_emails.length;
      toast.success("Test list saved", { description: n ? `${n} email${n === 1 ? "" : "s"} pay through Bachs` : "Nobody is on the list" });
    } catch (err) {
      toast.error("Couldn't save the test list", { description: (err as Error).message });
    } finally {
      setSavingEmails(false);
    }
  };

  /* Real state, so a coloured dot is earned here: green is working, amber is test-only, red is broken. */
  const connection: { label: string; text: string; tone: "good" | "waiting" | "danger" }[] = [
    !payments.bachs_configured
      ? { label: "Bachs key", text: "Not set up. BACHS_SECRET_KEY is empty on the server.", tone: "danger" }
      : payments.bachs_mode === "sandbox"
        ? { label: "Bachs key", text: "Sandbox key. Test payments only, no real money moves.", tone: "waiting" }
        : { label: "Bachs key", text: "Live key", tone: "good" },
    payments.bachs_webhook_configured
      ? { label: "Bachs webhook", text: "Secret set", tone: "good" }
      : { label: "Bachs webhook", text: "BACHS_WEBHOOK_SECRET is empty. Bachs payments only confirm when the buyer returns to Byro.", tone: "danger" },
  ];
  const dot = { good: "bg-good", waiting: "bg-waiting", danger: "bg-danger" } as const;
  const ink = { good: "text-good", waiting: "text-waiting", danger: "text-danger" } as const;

  return (
    <div className="space-y-10">
      <Block
        title="Provider for new orders"
        hint={
          <>
            Which provider buyers are sent to when they pay for a ticket. Orders already taken always stay with the provider that took them. Merch
            still uses Paystack.
            {!canEdit && <span className="mt-2 block font-semibold text-ink">Only Owners can change it.</span>}
          </>
        }
      >
        <div role="radiogroup" aria-label="Provider for new orders" className="grid gap-3 sm:grid-cols-2">
          {(["paystack", "bachs"] as Provider[]).map((p) => {
            const active = payments.provider === p;
            const blocked = p === "bachs" && !payments.bachs_configured;
            return (
              <button
                key={p}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={!canEdit || blocked || switching !== null}
                onClick={() => choose(p)}
                className={`flex min-h-[132px] flex-col items-start rounded-2xl border p-5 text-left disabled:cursor-not-allowed active:scale-[0.98] ${PRESS} ${
                  active ? "border-brand bg-sky ring-2 ring-brand/30" : "border-line bg-white enabled:hover:bg-mist"
                } ${blocked ? "opacity-60" : ""}`}
              >
                <span className="flex w-full flex-wrap items-center justify-between gap-x-2 gap-y-1.5">
                  <span className="font-display text-2xl font-extrabold tracking-tight text-ink">{PROVIDER_NAME[p]}</span>
                  {active && <span className="rounded-full bg-brand px-3 py-1 text-xs font-bold text-white">Taking new orders</span>}
                  {switching === p && <span className="text-xs font-semibold text-muted">Switching…</span>}
                </span>
                <span className="mt-2 max-w-[38ch] text-sm leading-relaxed text-muted text-pretty">
                  {p === "paystack"
                    ? "Paystack adds its processing charge on top for the buyer."
                    : "Bachs adds its own fee on top at checkout, so Byro receives the full amount."}
                </span>
              </button>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-faint">
          {payments.source === "server"
            ? "Not chosen here yet. Following the server's PAYMENT_PROVIDER setting."
            : "Chosen here. This overrides the server's PAYMENT_PROVIDER setting."}
        </p>
        <ul className="mt-3 space-y-1.5">
          {connection.map((c) => (
            <li key={c.label} className={`flex items-start gap-2 text-sm ${ink[c.tone]}`}>
              <span aria-hidden="true" className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${dot[c.tone]}`} />
              <span className="text-pretty">
                <b>{c.label}:</b> {c.text}
              </span>
            </li>
          ))}
        </ul>
      </Block>

      <section>
          <h2 className="font-display text-xl font-bold tracking-tight text-ink">Bachs test list</h2>
          <p className="mt-1 max-w-[65ch] text-sm leading-relaxed text-muted text-pretty">
            While Paystack takes new orders, buyers with these emails (the email at checkout, or the account they&apos;re signed in with) pay through
            Bachs instead. Use it to try Bachs with real money before switching everyone.
          </p>
          <label htmlFor="bachs-test-emails" className="mb-1.5 mt-5 block text-sm font-bold text-ink">
            Emails, one per line
          </label>
          <textarea
            id="bachs-test-emails"
            rows={Math.min(8, Math.max(3, parsed.length + 1))}
            value={emailsDraft}
            onChange={(e) => setEmailsDraft(e.target.value)}
            disabled={!canEdit || savingEmails}
            placeholder={"you@example.com\nteammate@example.com"}
            className="w-full max-w-md rounded-xl border border-line bg-white px-4 py-3 text-sm text-ink placeholder:text-faint focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25 disabled:text-muted"
          />
          {payments.provider === "bachs" && (
            <p className="mt-2 text-xs font-semibold text-waiting">Bachs is taking every new order, so this list makes no difference right now.</p>
          )}
          {!payments.bachs_configured && parsed.length > 0 && (
            <p className="mt-2 text-xs font-semibold text-danger">
              Bachs isn&apos;t set up on the server, so people on this list can&apos;t pay until BACHS_SECRET_KEY is set.
            </p>
          )}
          {payments.server_test_emails.length > 0 && (
            <p className="mt-2 text-xs text-faint">Also on the list from the server&apos;s BACHS_TEST_EMAILS: {payments.server_test_emails.join(", ")}</p>
          )}
          {canEdit && (
            <div className="mt-3 flex gap-1.5">
              <Button variant="primary" size="sm" onClick={saveEmails} loading={savingEmails} disabled={!emailsDirty}>
                Save list
              </Button>
              {emailsDirty && (
                <Button variant="ghost" size="sm" onClick={() => setEmailsDraft(payments.test_emails.join("\n"))}>
                  Discard
                </Button>
              )}
            </div>
          )}
      </section>

      <Timeline
        entries={payments.history.map((h, i) => ({
          key: String(i),
          tone: h.kind === "provider" ? "brand" : "marigold",
          title: h.kind === "provider" ? "Provider" : "Test list",
          change: h.kind === "provider" ? arrowParts(h.change) : h.change,
          at: h.at,
          who: h.who,
        }))}
      />
    </div>
  );
}
