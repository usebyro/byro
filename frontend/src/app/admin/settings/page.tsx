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

const STEP = 0.25;
const clean = (n: number) => String(Math.round(n * 100) / 100);

/** "changed to", between an old and a new value. */
const To = () => (
  <>
    <HugeiconsIcon icon={ArrowRight02Icon} size={14} color="currentColor" aria-hidden="true" className="mx-1 inline-block -translate-y-px align-middle" />
    <span className="sr-only">to </span>
  </>
);

/* A settings group: what it is on the left, the controls on the right (stacked on phones). */
function Section({ title, hint, children }: { title: string; hint: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="grid gap-x-10 gap-y-4 border-t border-line py-8 first:border-t-0 first:pt-0 md:grid-cols-[220px_minmax(0,1fr)]">
      <div>
        <h3 className="font-display text-lg font-bold text-ink">{title}</h3>
        <p className="mt-1 text-sm leading-relaxed text-muted text-pretty">{hint}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

/* A percentage box with − and + buttons, 0.25 at a time. */
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
  const step = `flex shrink-0 items-center justify-center rounded-full text-ink hover:bg-mist disabled:opacity-40 ${big ? "h-11 w-11 text-xl" : "h-8 w-8"}`;
  return (
    <div className={`inline-flex items-center gap-1 rounded-full border border-line bg-white ${big ? "p-1" : "p-0.5"}`}>
      <button type="button" className={step} onClick={() => bump(-STEP)} disabled={disabled || n <= 0} aria-label={`Lower ${label}`}>
        −
      </button>
      <label className="flex items-baseline">
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
          className={`bg-transparent text-center font-display font-bold tabular-nums text-ink focus:outline-none disabled:text-muted [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none ${
            big ? "w-20 text-3xl" : "w-12 text-base"
          }`}
        />
        <span className={`font-display font-bold text-muted ${big ? "text-2xl" : "text-sm"}`}>%</span>
      </label>
      <button type="button" className={step} onClick={() => bump(STEP)} disabled={disabled || n >= max} aria-label={`Raise ${label}`}>
        +
      </button>
    </div>
  );
}

/* One side of the live receipt. */
function Receipt({ title, rows, note }: { title: string; rows: [string, string, boolean?][]; note: string }) {
  return (
    <div className="flex flex-col rounded-2xl border border-line bg-white p-5">
      <p className="text-xs font-bold uppercase tracking-[0.06em] text-faint">{title}</p>
      <dl className="mt-3 flex-1 divide-y divide-hairline">
        {rows.map(([label, value, strong]) => (
          <div key={label} className="flex items-baseline justify-between gap-4 py-2 text-sm">
            <dt className={strong ? "font-bold text-ink" : "text-muted"}>{label}</dt>
            <dd className={`tabular-nums ${strong ? "font-display text-lg font-bold text-ink" : "text-ink"}`}>{value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-xs leading-relaxed text-faint">{note}</p>
    </div>
  );
}

export default function AdminSettingsPage() {
  const me = useAdminMe();
  const isOwner = me.role === "owner";
  const confirm = useConfirm();
  const [data, setData] = useState<Settings | null>(null);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [price, setPrice] = useState("5000");

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
      <div className="p-5 md:p-8 max-w-5xl space-y-4">
        <SkeletonCard className="h-16" />
        <SkeletonCard className="h-56" />
        <SkeletonCard className="h-40" />
      </div>
    );
  }

  const shown = valid ? pct : Number(data.default_fee_percent);
  const p = Math.max(0, Number(price) || 0);
  const fee = Math.round(p * (shown / 100));

  return (
    <div className="p-5 pb-28 md:p-8 md:pb-28 max-w-5xl">
      <header className="mb-8">
        <h1 className="font-display text-ink text-3xl font-extrabold tracking-tight">Settings</h1>
        <p className="text-muted text-sm mt-1">What Byro charges on paid tickets, and which payment provider takes new orders.</p>
      </header>

      <h2 className="mb-3 font-display text-xl font-bold text-ink">Service fee</h2>

      <div className="rounded-3xl border border-line bg-white p-5 md:p-8">
        <Section
          title="Default service fee"
          hint={
            <>
              Charged on every paid ticket, unless the organiser has a special fee. Free tickets are never charged.
              {!isOwner && <span className="mt-2 block font-semibold text-ink">Only Owners can change it.</span>}
            </>
          }
        >
          <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
            <PercentInput value={draft} onChange={setDraft} max={max} disabled={!isOwner} label="Default service fee" />
            <div className="text-sm">
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
            </div>
          </div>
          {!valid && <p role="alert" className="mt-3 text-sm text-danger">Enter a number from 0 to {data.max_fee_percent}.</p>}
        </Section>

        <Section
          title="What people pay"
          hint={
            <>
              Try a ticket price to see the split{dirty ? " with the new fee" : ""}. Organisers choose who pays the fee when they create an
              event. The payment processing charge is added on top for the buyer.
            </>
          }
        >
          <label className="mb-4 flex w-fit items-center gap-2 rounded-full border border-line bg-white px-4 py-2 text-sm focus-within:ring-2 focus-within:ring-brand/30">
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
              className="w-24 bg-transparent font-bold tabular-nums text-ink focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <Receipt
              title="Buyer pays the fee"
              rows={[
                ["Ticket", formatNaira(p)],
                [`Byro fee (${clean(shown)}%)`, formatNaira(fee)],
                ["Buyer pays", formatNaira(p + fee), true],
                ["Organiser gets", formatNaira(p)],
              ]}
              note="Most events. The fee is added to the price at checkout."
            />
            <Receipt
              title="Organiser pays the fee"
              rows={[
                ["Buyer pays", formatNaira(p)],
                [`Byro fee (${clean(shown)}%)`, `−${formatNaira(fee)}`],
                ["Organiser gets", formatNaira(p - fee), true],
              ]}
              note="The buyer sees one clean price; the fee comes out of the organiser's earnings."
            />
          </div>
        </Section>

        <Section
          title="Special fees"
          hint="A different fee for one organiser, e.g. a partner or a charity. It replaces the default for their new orders."
        >
          <SpecialFees deals={data.organiser_fees} defaultPercent={data.default_fee_percent} max={max} canEdit={isOwner} onSet={setDeal} />
        </Section>

        <Section title="History" hint="Every fee change, newest first. The full record is in the Audit log.">
          {data.history.length === 0 ? (
            <p className="text-sm text-faint">No changes yet.</p>
          ) : (
            <ol className="relative space-y-4 border-l border-line pl-5">
              {data.history.map((h, i) => (
                <li key={i} className="relative">
                  <span aria-hidden="true" className={`absolute -left-[26px] top-1.5 h-2.5 w-2.5 rounded-full ${h.kind === "default" ? "bg-brand" : "bg-marigold"}`} />
                  <p className="text-sm text-ink">
                    <b>{h.kind === "default" ? "Default fee" : h.target}</b>{" "}
                    <span className="tabular-nums">
                      {h.change.split("->").map((part, j) => (
                        <span key={j}>{j > 0 && <To />}{part.trim()}</span>
                      ))}
                    </span>
                  </p>
                  <p className="text-xs text-faint">
                    {fmtDateTime(h.at)} · {h.who || "—"}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </Section>
      </div>

      <h2 className="mb-3 mt-10 font-display text-xl font-bold text-ink">Payments</h2>
      <PaymentsCard payments={data.payments} canEdit={isOwner} onSaved={(body) => setData(body)} />

      {/* Save bar: only while there's an unsaved change, so it's obvious and never in the way otherwise. */}
      {isOwner && dirty && (
        <div className="fixed inset-x-0 bottom-4 z-40 flex justify-center px-4 md:left-60">
          <div
            role="region"
            aria-label="Unsaved change"
            className="flex w-full max-w-xl items-center justify-between gap-3 rounded-full bg-ink py-2 pl-5 pr-2 text-white shadow-[0_16px_40px_rgba(20,22,28,0.28)] animate-dialog-in motion-reduce:animate-none"
          >
            <p className="text-sm">
              Default fee <b className="tabular-nums">{data.default_fee_percent}% <To /> {clean(pct)}%</b>
            </p>
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => setDraft(data.default_fee_percent)}
                className="h-10 rounded-full px-4 text-sm font-bold text-white/80 hover:bg-white/10 hover:text-white"
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
                <th scope="col" className="px-4 py-2.5 text-xs font-bold text-faint">Organiser</th>
                <th scope="col" className="px-4 py-2.5 text-xs font-bold text-faint">Fee</th>
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
                    <td className="px-4 py-3">
                      {d.handle ? (
                        <a href={publicHref(`/u/${d.handle}`)} target="_blank" rel="noopener noreferrer" className="font-semibold text-ink hover:underline">
                          {d.name}
                        </a>
                      ) : (
                        <span className="font-semibold text-ink">{d.name}</span>
                      )}
                      <span className="block max-w-[220px] truncate text-xs text-muted">{d.email}</span>
                    </td>
                    <td className="px-4 py-3">
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
                    <td className="px-4 py-3 text-right">
                      {canEdit &&
                        (isEditing ? (
                          <span className="inline-flex gap-1.5">
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
                          <span className="inline-flex gap-1.5">
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
            <span className="inline-flex gap-1.5">
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

/* Which provider takes new ticket orders, the Bachs test list, and their history. */
function PaymentsCard({
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

  const bachsStatus = !payments.bachs_configured
    ? { text: "Not set up: BACHS_SECRET_KEY is empty on the server", cls: "text-danger" }
    : payments.bachs_mode === "sandbox"
      ? { text: "Sandbox key: test payments only, no real money moves", cls: "text-waiting" }
      : { text: "Live key", cls: "text-good" };

  return (
    <div className="rounded-3xl border border-line bg-white p-5 md:p-8">
      <Section
        title="Provider for new orders"
        hint={
          <>
            Which payment provider buyers are sent to when they pay for a ticket. Orders already taken always stay with the provider that took
            them. Merch still uses Paystack.
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
                className={`flex flex-col items-start rounded-2xl border p-4 text-left transition-colors disabled:cursor-not-allowed ${
                  active ? "border-brand bg-sky ring-2 ring-brand/30" : "border-line bg-white enabled:hover:bg-mist"
                } ${blocked ? "opacity-60" : ""}`}
              >
                <span className="flex w-full items-center justify-between gap-2">
                  <span className="font-display text-lg font-bold text-ink">{PROVIDER_NAME[p]}</span>
                  {active && (
                    <span className="rounded-full bg-brand px-2.5 py-0.5 text-xs font-bold text-white">Taking new orders</span>
                  )}
                  {switching === p && <span className="text-xs font-semibold text-muted">Switching…</span>}
                </span>
                <span className="mt-1 text-xs leading-relaxed text-muted">
                  {p === "paystack"
                    ? "Paystack adds its processing charge on top for the buyer."
                    : "The buyer pays the all-in price; Bachs takes its fee from what Byro receives."}
                </span>
              </button>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-faint">
          {payments.source === "server"
            ? "Not chosen here yet: following the server's PAYMENT_PROVIDER setting."
            : "Chosen here. This overrides the server's PAYMENT_PROVIDER setting."}
        </p>
        <dl className="mt-4 grid gap-1 text-sm sm:grid-cols-[140px_minmax(0,1fr)]">
          <dt className="text-muted">Bachs key</dt>
          <dd className={`font-semibold ${bachsStatus.cls}`}>{bachsStatus.text}</dd>
          <dt className="text-muted">Bachs webhook</dt>
          <dd className={`font-semibold ${payments.bachs_webhook_configured ? "text-good" : "text-danger"}`}>
            {payments.bachs_webhook_configured
              ? "Secret set"
              : "BACHS_WEBHOOK_SECRET is empty: Bachs payments only confirm when the buyer returns to Byro"}
          </dd>
        </dl>
      </Section>

      <Section
        title="Bachs test list"
        hint={
          <>
            While Paystack takes new orders, buyers with these emails (the email at checkout, or the account they&apos;re signed in with) pay through
            Bachs instead. Use it to try Bachs with real money before switching everyone.
          </>
        }
      >
        <label htmlFor="bachs-test-emails" className="mb-1.5 block text-sm font-bold text-ink">
          Emails, one per line
        </label>
        <textarea
          id="bachs-test-emails"
          rows={Math.min(8, Math.max(3, parsed.length + 1))}
          value={emailsDraft}
          onChange={(e) => setEmailsDraft(e.target.value)}
          disabled={!canEdit || savingEmails}
          placeholder={"you@example.com\nteammate@example.com"}
          className="w-full max-w-md rounded-2xl border border-line bg-white px-4 py-3 text-sm text-ink placeholder:text-faint focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25 disabled:text-muted"
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
          <p className="mt-2 text-xs text-faint">
            Also on the list from the server&apos;s BACHS_TEST_EMAILS: {payments.server_test_emails.join(", ")}
          </p>
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
      </Section>

      <Section title="History" hint="Provider and test list changes, newest first. The full record is in the Audit log.">
        {payments.history.length === 0 ? (
          <p className="text-sm text-faint">No changes yet.</p>
        ) : (
          <ol className="relative space-y-4 border-l border-line pl-5">
            {payments.history.map((h, i) => (
              <li key={i} className="relative">
                <span aria-hidden="true" className={`absolute -left-[26px] top-1.5 h-2.5 w-2.5 rounded-full ${h.kind === "provider" ? "bg-brand" : "bg-marigold"}`} />
                <p className="text-sm text-ink">
                  <b>{h.kind === "provider" ? "Provider" : "Test list"}</b>{" "}
                  {h.kind === "provider"
                    ? h.change.split("->").map((part, j) => (
                        <span key={j}>{j > 0 && <To />}{part.trim()}</span>
                      ))
                    : h.change}
                </p>
                <p className="text-xs text-faint">
                  {fmtDateTime(h.at)} · {h.who || "—"}
                </p>
              </li>
            ))}
          </ol>
        )}
      </Section>
    </div>
  );
}
