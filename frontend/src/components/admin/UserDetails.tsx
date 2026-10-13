"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { useAdminMe } from "@/components/admin/AdminMe";
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
export default function UserDetails({ userId, onDeleted }: { userId: number; onDeleted: () => void }) {
  const me = useAdminMe();
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState("");
  const [showDelete, setShowDelete] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/users/${userId}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error);
      setData(body);
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
    if (!window.confirm(blocked ? "Stop this person sending community messages? Anything scheduled is cancelled." : "Let this person send messages again?")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}/messaging`, { method: "POST", body: JSON.stringify({ blocked }) });
      if (!res.ok) throw new Error();
      toast.success(blocked ? "Blocked from messaging" : "Can message again");
      await load();
    } catch {
      toast.error("Couldn't update messaging");
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

  if (error) return <p className="text-red-600 text-xs">{error}</p>;
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

      {data.profile && me.can.moderate && !deleted && (
        <div>
          <h4 className="text-ink text-sm font-semibold mb-2">Community messages</h4>
          <p className="text-faint text-xs leading-relaxed mb-3">
            {data.profile.messaging_blocked ? "Blocked: they can't send or schedule messages." : "They can email their followers and ticket holders."}
          </p>
          <button
            type="button"
            onClick={toggleMessaging}
            disabled={busy}
            className="text-xs font-semibold px-3 py-2 rounded-lg bg-mist text-ink hover:bg-line disabled:opacity-50"
          >
            {data.profile.messaging_blocked ? "Allow messaging" : "Block messaging"}
          </button>
        </div>
      )}

      {isOwner && !deleted && (
        <div className="border-t border-hairline pt-5">
          <h4 className="text-ink text-sm font-semibold mb-2">Delete account</h4>
          <p className="text-faint text-xs leading-relaxed mb-3">
            For when someone asks us to delete their data. Their name, email, photo, page, links and follows are removed and they
            can&apos;t sign in. Payments and event history are kept for Byro&apos;s records. This can&apos;t be undone.
          </p>
          {data.delete_blockers.length > 0 ? (
            <ul className="space-y-1 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
              {data.delete_blockers.map((b) => (
                <li key={b}>• {b}</li>
              ))}
            </ul>
          ) : !showDelete ? (
            <button
              type="button"
              onClick={() => setShowDelete(true)}
              className="text-xs font-semibold px-3 py-2 rounded-lg text-red-600 bg-red-500/10 hover:bg-red-500/20"
            >
              Delete account…
            </button>
          ) : (
            <div className="space-y-2">
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
                className="w-full bg-mist border border-line rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-red-400"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={remove}
                  disabled={busy || confirmEmail.trim().toLowerCase() !== data.email.toLowerCase()}
                  className="text-xs font-semibold px-3 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-40"
                >
                  {busy ? "Deleting…" : "Delete for good"}
                </button>
                <button type="button" onClick={() => setShowDelete(false)} className="text-xs font-semibold px-3 py-2 text-muted hover:text-ink">
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
