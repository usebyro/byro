"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { useAdminMe } from "@/components/admin/AdminMe";
import { useConfirm } from "@/components/admin/ui";
import { publicHref } from "@/lib/adminNav";

interface AdminMessage {
  id: number;
  kind: "announce" | "update";
  audience: string;
  subject: string;
  body: string;
  status: "scheduled" | "sending" | "sent" | "failed" | "cancelled";
  event_name: string;
  recipients: number;
  sent: number;
  failed: number;
  created_at: string;
  scheduled_for: string | null;
  sent_at: string | null;
  organizer: { id: number; email: string; name: string; handle: string | null; messaging_blocked: boolean };
}

const STATUSES = [
  { value: "", label: "All" },
  { value: "scheduled", label: "Scheduled" },
  { value: "sent", label: "Sent" },
  { value: "failed", label: "Failed" },
  { value: "cancelled", label: "Cancelled" },
];

const AUDIENCE: Record<string, string> = {
  followers: "All followers",
  members: "Members",
  regulars: "Regulars",
};

const STATUS_STYLE: Record<AdminMessage["status"], string> = {
  scheduled: "bg-brand/10 text-brand-dark",
  sending: "bg-amber-500/10 text-amber-700",
  sent: "bg-green-500/10 text-green-700",
  failed: "bg-red-500/10 text-red-700",
  cancelled: "bg-gray-500/10 text-muted",
};

const when = (s: string | null) =>
  s ? new Date(s).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";

export default function AdminMessagesPage() {
  const me = useAdminMe();
  const canAct = me.can.moderate;
  const confirm = useConfirm();
  const [rows, setRows] = useState<AdminMessage[]>([]);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [status, setStatus] = useState("");
  const [open, setOpen] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string>("");

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (debounced) params.set("search", debounced);
    if (status) params.set("status", status);
    try {
      const res = await fetch(`/api/admin/messages?${params}`);
      const data = await res.json().catch(() => []);
      if (!res.ok) throw new Error();
      setRows(Array.isArray(data) ? data : []);
      setError("");
    } catch {
      setError("Couldn't load messages.");
    } finally {
      setLoading(false);
    }
  }, [debounced, status]);

  useEffect(() => {
    load();
  }, [load]);

  const cancel = async (m: AdminMessage) => {
    const ok = await confirm({
      title: `Cancel “${m.subject}”?`,
      body: `${m.organizer.name}'s scheduled message won't be sent. This can't be undone; they'd have to write it again.`,
      confirmLabel: "Cancel message",
      cancelLabel: "Keep it",
      tone: "danger",
    });
    if (!ok) return;
    setBusy(`cancel-${m.id}`);
    try {
      const res = await fetch(`/api/admin/messages/${m.id}/cancel`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error);
      toast.success("Message cancelled", { description: m.subject });
      await load();
    } catch (err) {
      toast.error("Couldn't cancel message", { description: err instanceof Error && err.message ? err.message : "Try again." });
    } finally {
      setBusy("");
    }
  };

  const setBlocked = async (m: AdminMessage, blocked: boolean) => {
    const name = m.organizer.name;
    // Unblocking is harmless; blocking also cancels their scheduled messages, which can't be brought back.
    if (blocked) {
      const ok = await confirm({
        title: `Block ${name} from messaging?`,
        body: "They won't be able to send or schedule messages until you unblock them. Anything they've already scheduled is cancelled for good.",
        confirmLabel: "Block messaging",
        tone: "danger",
      });
      if (!ok) return;
    }
    setBusy(`block-${m.organizer.id}`);
    try {
      const res = await fetch(`/api/admin/users/${m.organizer.id}/messaging`, {
        method: "POST",
        body: JSON.stringify({ blocked }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error);
      toast.success(blocked ? "Organiser blocked from messaging" : "Organiser can message again", {
        description: blocked && data.scheduled_cancelled ? `${data.scheduled_cancelled} scheduled message(s) cancelled` : name,
      });
      await load();
    } catch (err) {
      toast.error("Couldn't update organiser", { description: err instanceof Error && err.message ? err.message : "Try again." });
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="p-5 md:p-8">
      <div className="mb-8">
        <h1 className="font-display text-ink text-3xl font-extrabold tracking-tight">Messages</h1>
        <p className="text-muted text-sm mt-1">Every email organisers have sent or scheduled to their community</p>
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search subject, organiser or email…"
          aria-label="Search messages"
          className="w-full sm:w-80 bg-mist border border-line rounded-lg px-3 py-2 text-sm text-ink placeholder:text-faint focus:outline-none focus:ring-1 focus:ring-brand/40"
        />
        <div role="group" aria-label="Filter by status" className="flex flex-wrap gap-1 rounded-lg bg-mist p-1">
          {STATUSES.map((s) => (
            <button
              key={s.value}
              type="button"
              aria-pressed={status === s.value}
              onClick={() => setStatus(s.value)}
              className={`rounded-md px-3 py-1.5 text-xs font-bold transition-colors ${
                status === s.value ? "bg-white text-ink shadow-sm" : "text-muted hover:text-ink"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-red-600 text-sm mb-6">{error}</p>}

      <div className="bg-white border border-line rounded-xl p-6 overflow-x-auto">
        {!loading && rows.length === 0 ? (
          <p className="text-faint text-sm py-6 text-center">No messages match.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hairline text-left">
                {["Message", "Organiser", "To", "Reached", "When", "Status", ""].map((h, i) => (
                  <th key={i} className="pb-3 pr-6 text-xs text-faint font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {rows.map((m) => {
                const expanded = open === m.id;
                return (
                  <FragmentRow key={m.id}>
                    <tr className="align-top">
                      <td className="py-3 pr-6 max-w-[260px]">
                        <button
                          type="button"
                          onClick={() => setOpen(expanded ? null : m.id)}
                          aria-expanded={expanded}
                          className="text-left text-ink font-semibold hover:underline"
                        >
                          {m.subject}
                        </button>
                        <span className="block text-xs text-faint">{m.kind === "update" ? "Event update" : "Announcement"}</span>
                      </td>
                      <td className="py-3 pr-6 max-w-[200px]">
                        {m.organizer.handle ? (
                          <a href={publicHref(`/u/${m.organizer.handle}`)} target="_blank" rel="noopener noreferrer" className="text-ink hover:underline">
                            {m.organizer.name}
                          </a>
                        ) : (
                          <span className="text-ink">{m.organizer.name}</span>
                        )}
                        <span className="block truncate text-xs text-faint">{m.organizer.email}</span>
                        {m.organizer.messaging_blocked && (
                          <span className="mt-1 inline-block rounded-full bg-red-500/10 px-2 py-0.5 text-[11px] font-bold text-red-700">Blocked</span>
                        )}
                      </td>
                      <td className="py-3 pr-6 text-muted whitespace-nowrap">
                        {m.audience === "event" ? `${m.event_name || "Event"} holders` : AUDIENCE[m.audience] || m.audience}
                      </td>
                      <td className="py-3 pr-6 text-[#3B4252] tabular-nums whitespace-nowrap">
                        {m.status === "sent" || m.status === "failed" ? `${m.sent} of ${m.recipients}` : `~${m.recipients}`}
                      </td>
                      <td className="py-3 pr-6 text-muted whitespace-nowrap">
                        {m.status === "scheduled" || m.status === "cancelled" ? when(m.scheduled_for) : when(m.sent_at || m.created_at)}
                      </td>
                      <td className="py-3 pr-6">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${STATUS_STYLE[m.status]}`}>{m.status}</span>
                      </td>
                      <td className="py-3 whitespace-nowrap text-right">
                        {canAct && m.status === "scheduled" && (
                          <button
                            type="button"
                            onClick={() => cancel(m)}
                            disabled={busy !== ""}
                            className="mr-3 text-xs font-bold text-red-600 hover:underline disabled:opacity-50"
                          >
                            Cancel
                          </button>
                        )}
                        {canAct && (
                          <button
                            type="button"
                            onClick={() => setBlocked(m, !m.organizer.messaging_blocked)}
                            disabled={busy !== ""}
                            className="text-xs font-bold text-muted hover:text-ink hover:underline disabled:opacity-50"
                          >
                            {m.organizer.messaging_blocked ? "Unblock sender" : "Block sender"}
                          </button>
                        )}
                      </td>
                    </tr>
                    {expanded && (
                      <tr>
                        <td colSpan={7} className="pb-4">
                          <div className="rounded-lg bg-mist p-4">
                            <p className="mb-2 text-xs font-bold text-faint">Message</p>
                            <p className="whitespace-pre-line break-words text-sm text-ink">{m.body}</p>
                            {m.failed > 0 && <p className="mt-3 text-xs font-semibold text-red-600">{m.failed} didn&apos;t arrive</p>}
                          </div>
                        </td>
                      </tr>
                    )}
                  </FragmentRow>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function FragmentRow({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
