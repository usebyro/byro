"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { useAdminMe } from "@/components/admin/AdminMe";
import { useConfirm, throwIfFailed, ActionRow, BTN, BTN_QUIET, BTN_BRAND, BTN_DANGER } from "@/components/admin/ui";
import { publicHref } from "@/lib/adminNav";
import { formatNaira } from "@/lib/eventFormat";

interface Summary {
  id: number;
  email: string;
  is_active: boolean;
  last_login: string | null;
  profile: { display_name: string; handle: string | null; messaging_blocked: boolean } | null;
  followers: number;
  following: number;
  balance: string;
  fee_percent: string | null;
  events: { name: string; slug: string; day: string; is_draft: boolean; cancelled: boolean; upcoming: boolean; tickets: number }[];
  events_total: number;
  tickets: { ticket_id: string; event_name: string; event_slug: string; day: string; status: string; checked_in: boolean }[];
  tickets_total: number;
  spent: { orders: number; total: string };
  payouts: { amount: string; status: string; requested_at: string }[];
  delete_blockers: string[];
}

const day = (s: string | null) =>
  s ? new Date(s).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="bg-mist rounded-lg px-3 py-2.5">
      <p className="text-faint text-[11px] mb-0.5">{label}</p>
      <p className="text-ink text-sm tabular-nums">{value}</p>
    </div>
  );
}

/** The fuller picture of one person, shown in the Users side panel, with messaging and delete controls. */
/** `accountRows` and `dangerRows` are the page's own rows (role, suspend), shown in the same cards as the rest. */
export default function UserDetails({ userId, onDeleted, accountRows, dangerRows }: { userId: number; onDeleted: () => void; accountRows?: ReactNode; dangerRows?: ReactNode }) {
  const me = useAdminMe();
  const confirm = useConfirm();
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState("");
  const [showDelete, setShowDelete] = useState(false);
  const [feeDraft, setFeeDraft] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/users/${userId}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error);
      setData(body);
      setFeeDraft(body.fee_percent ?? "");
      setError("");
    } catch {
      setError("Couldn't load this person's details.");
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleMessaging = async () => {
    if (!data?.profile) return;
    const blocked = !data.profile.messaging_blocked;
    if (blocked) {
      const ok = await confirm({
        title: "Block this person from messaging?",
        body: "They won't be able to send or schedule community messages. Anything they've already scheduled is cancelled for good.",
        confirmLabel: "Block messaging",
        tone: "danger",
      });
      if (!ok) return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}/messaging`, { method: "POST", body: JSON.stringify({ blocked }) });
      await throwIfFailed(res);
      toast.success(blocked ? "Blocked from messaging" : "Can message again");
      await load();
    } catch (err) {
      toast.error("Couldn't update messaging", { description: err instanceof Error && err.message ? err.message : "Try again." });
    } finally {
      setBusy(false);
    }
  };

  const saveFee = async (value: string | null) => {
    const ok = await confirm({
      title: value === null ? "Put this organiser back on the default fee?" : `Give this organiser a ${value}% fee?`,
      body: "It applies to their new orders straight away. Orders they've already been paid for keep their fee.",
      confirmLabel: value === null ? "Use default fee" : `Set ${value}% fee`,
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}/fee`, { method: "PATCH", body: JSON.stringify({ fee_percent: value }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "Try again.");
      toast.success("Service fee updated", { description: `Now ${body.effective_percent}% on new orders` });
      await load();
    } catch (err) {
      toast.error("Couldn't update the fee", { description: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!data) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}/delete`, {
        method: "POST",
        body: JSON.stringify({ confirm_email: confirmEmail }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "Try again.");
      toast.success("Account deleted", { description: data.email });
      onDeleted();
    } catch (err) {
      toast.error("Couldn't delete account", { description: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };

  if (error) return <p className="text-danger text-xs">{error}</p>;
  if (!data) return <p className="text-faint text-xs">Loading details…</p>;

  const isOwner = me.role === "owner";
  const deleted = data.email.endsWith("@deleted.usebyro.com");

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Followers" value={data.followers.toLocaleString()} />
        <Stat label="Following" value={data.following.toLocaleString()} />
        <Stat label="Orders paid" value={`${data.spent.orders} · ${formatNaira(Number(data.spent.total))}`} />
        <Stat label="Owed to them" value={formatNaira(Number(data.balance))} />
        <Stat label="Last signed in" value={day(data.last_login)} />
        <Stat label="Tickets held" value={data.tickets_total} />
      </div>

      {data.events.length > 0 && (
        <div>
          <h4 className="text-ink text-sm font-semibold mb-2">Events ({data.events_total})</h4>
          <ul className="divide-y divide-hairline text-sm">
            {data.events.slice(0, 8).map((e) => (
              <li key={e.slug} className="flex items-center justify-between gap-3 py-2">
                <a href={publicHref(`/discover/${e.slug}`)} target="_blank" rel="noopener noreferrer" className="min-w-0 truncate text-ink hover:underline">
                  {e.name}
                </a>
                <span className="shrink-0 text-xs text-muted">
                  {e.cancelled ? "Cancelled" : e.is_draft ? "Draft" : e.upcoming ? "Upcoming" : "Past"} · {e.tickets} tickets
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {data.tickets.length > 0 && (
        <div>
          <h4 className="text-ink text-sm font-semibold mb-2">Tickets ({data.tickets_total})</h4>
          <ul className="divide-y divide-hairline text-sm">
            {data.tickets.slice(0, 8).map((t) => (
              <li key={t.ticket_id} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0 truncate text-ink">{t.event_name}</span>
                <span className="shrink-0 text-xs text-muted capitalize">
                  {t.status}
                  {t.checked_in ? " · went" : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {data.payouts.length > 0 && (
        <div>
          <h4 className="text-ink text-sm font-semibold mb-2">Payouts</h4>
          <ul className="divide-y divide-hairline text-sm">
            {data.payouts.slice(0, 5).map((p, i) => (
              <li key={i} className="flex items-center justify-between gap-3 py-2">
                <span className="text-ink tabular-nums">{formatNaira(Number(p.amount))}</span>
                <span className="text-xs text-muted capitalize">{p.status} · {day(p.requested_at)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <section aria-labelledby="account-actions" className="space-y-6">
        <div className="space-y-2">
          <h4 id="account-actions" className="text-ink text-sm font-semibold">Manage account</h4>
          <div className="divide-y divide-hairline rounded-xl border border-line bg-white">
            {accountRows}
            {data.profile && me.can.moderate && !deleted && (
              <ActionRow
                title="Community messages"
                hint={data.profile.messaging_blocked ? "Blocked. They can't send or schedule messages." : "They can email their followers and ticket holders."}
              >
                <button type="button" onClick={toggleMessaging} disabled={busy} className={BTN_QUIET}>
                  {data.profile.messaging_blocked ? "Allow messaging" : "Block messaging"}
                </button>
              </ActionRow>
            )}
            {isOwner && !deleted && data.events_total > 0 && (
              <ActionRow
                title="Service fee"
                hint={
                  data.fee_percent !== null
                    ? `Special fee: ${data.fee_percent}% on their new orders.`
                    : "Default fee. Give them a special fee for a partnership or a charity."
                }
                below={
                  <>
                    <span className="flex min-h-9 items-center rounded-lg border border-line bg-white focus-within:ring-2 focus-within:ring-brand">
                      <input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        max={15}
                        step={0.25}
                        value={feeDraft}
                        onChange={(e) => setFeeDraft(e.target.value)}
                        placeholder="e.g. 3"
                        aria-label="Special service fee in percent"
                        className="w-20 bg-transparent px-3 py-1.5 text-sm text-ink tabular-nums focus:outline-none"
                      />
                      <span className="pr-3 text-sm text-muted">%</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => saveFee(feeDraft.trim())}
                      disabled={busy || feeDraft.trim() === "" || feeDraft.trim() === data.fee_percent}
                      className={BTN_BRAND}
                    >
                      Set special fee
                    </button>
                    {data.fee_percent !== null && (
                      <button type="button" onClick={() => saveFee(null)} disabled={busy} className={BTN_QUIET}>
                        Use default
                      </button>
                    )}
                  </>
                }
              />
            )}
          </div>
        </div>

        {(dangerRows || (isOwner && !deleted)) && (
          <div className="space-y-2">
            <h4 className="text-danger text-sm font-semibold">Danger zone</h4>
            <div className="divide-y divide-hairline rounded-xl border border-danger-hover/50 bg-white">
              {dangerRows}
              {isOwner && !deleted && (
                <div>
                  <ActionRow
                    title="Delete account"
                    hint="For when someone asks us to delete their data. Their name, email, photo, page, links and follows are removed and they can't sign in. Payments and event history are kept for Byro's records. This can't be undone."
                  >
                    {data.delete_blockers.length === 0 && !showDelete && (
                      <button type="button" onClick={() => setShowDelete(true)} className={BTN_DANGER}>
                        Delete account
                      </button>
                    )}
                  </ActionRow>
                  {data.delete_blockers.length > 0 && (
                    <ul className="mx-4 mb-4 space-y-1 rounded-lg border border-waiting-hover bg-waiting-tint p-3 text-xs text-waiting">
                      {data.delete_blockers.map((b) => (
                        <li key={b}>• {b}</li>
                      ))}
                    </ul>
                  )}
                  {data.delete_blockers.length === 0 && showDelete && (
                    <div className="space-y-2 px-4 pb-4">
                      <label className="block text-xs text-muted" htmlFor="confirm-delete">
                        Type <b className="text-ink">{data.email}</b> to confirm
                      </label>
                      <input
                        id="confirm-delete"
                        type="email"
                        value={confirmEmail}
                        onChange={(e) => setConfirmEmail(e.target.value)}
                        autoComplete="off"
                        spellCheck={false}
                        className="w-full rounded-lg border border-line bg-mist px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-danger"
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={remove}
                          disabled={busy || confirmEmail.trim().toLowerCase() !== data.email.toLowerCase()}
                          className={`${BTN} bg-danger-strong text-white hover:bg-danger`}
                        >
                          {busy ? "Deleting…" : "Delete for good"}
                        </button>
                        <button type="button" onClick={() => setShowDelete(false)} className={BTN_QUIET}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
