"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { useAdminMe } from "@/components/admin/AdminMe";
import { useConfirm } from "@/components/admin/ui";
import { publicHref } from "@/lib/adminNav";

interface AdminReport {
  id: number;
  target_type: "event" | "community";
  reason: string;
  reason_label: string;
  details: string;
  reporter_email: string;
  status: "open" | "resolved" | "dismissed";
  resolution_note: string;
  resolved_by_email: string;
  resolved_at: string | null;
  created_at: string;
  reports_on_same: number;
  event: { id: number; name: string; slug: string; is_active: boolean; organizer_email: string | null } | null;
  community: { user_id: number; email: string; name: string; handle: string | null; hidden_from_directory: boolean } | null;
}

const FILTERS = [
  { value: "open", label: "Open" },
  { value: "resolved", label: "Action taken" },
  { value: "dismissed", label: "No action" },
  { value: "", label: "All" },
];

const STATUS_LABEL: Record<AdminReport["status"], string> = {
  open: "Open",
  resolved: "Action taken",
  dismissed: "No action needed",
};

const when = (s: string | null) =>
  s ? new Date(s).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";

async function send(url: string, method: string, body: unknown) {
  const res = await fetch(url, { method, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || "Try again.");
  return data;
}

export default function AdminReportsPage() {
  const { can } = useAdminMe();
  const confirm = useConfirm();
  const [filter, setFilter] = useState("open");
  const [rows, setRows] = useState<AdminReport[]>([]);
  const [openCount, setOpenCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/reports?${new URLSearchParams(filter ? { status: filter } : {})}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error();
      setRows(data.reports || []);
      setOpenCount(data.open || 0);
      setError("");
    } catch {
      setError("Couldn't load reports.");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
      await load();
    } catch (err) {
      toast.error("Couldn't do that", { description: (err as Error).message });
    } finally {
      setBusy("");
    }
  };

  const close = async (r: AdminReport, status: "resolved" | "dismissed" | "open") => {
    let note = "";
    if (status !== "open") {
      const answer = await confirm({
        title: status === "resolved" ? "Close as action taken?" : "Close with no action needed?",
        confirmLabel: "Close report",
        input: {
          label: status === "resolved" ? "What did you do? (optional, for the team)" : "Why is no action needed? (optional, for the team)",
          placeholder: status === "resolved" ? "Suspended the event…" : "Checked the event, it's legitimate…",
          multiline: true,
          maxLength: 500,
        },
      });
      if (typeof answer !== "string") return;
      note = answer;
    }
    return run(`close-${r.id}`, async () => {
      await send(`/api/admin/reports/${r.id}`, "PATCH", { status, note });
      toast.success(status === "open" ? "Report reopened" : "Report closed");
    });
  };

  const suspendEvent = async (r: AdminReport) => {
    if (!r.event) return;
    const ok = await confirm({
      title: `Suspend “${r.event.name}”?`,
      body: "It comes off Byro straight away, nobody can buy tickets, and the organiser is told by email.",
      confirmLabel: "Suspend event",
      tone: "danger",
    });
    if (!ok) return;
    return run(`suspend-${r.id}`, async () => {
      await send(`/api/admin/events/${r.event!.id}`, "PATCH", { is_active: false });
      toast.success("Event suspended", { description: r.event!.name });
    });
  };

  const hideCommunity = (r: AdminReport) => {
    if (!r.community) return;
    return run(`hide-${r.id}`, async () => {
      await send(`/api/admin/communities/${r.community!.user_id}`, "PATCH", { hidden_from_directory: true });
      const c = r.community!;
      toast.success("Hidden from directory", {
        description: `${c.name}'s page still works by link`,
        action: {
          label: "Undo",
          onClick: () => run(`hide-${r.id}`, async () => {
            await send(`/api/admin/communities/${c.user_id}`, "PATCH", { hidden_from_directory: false });
            toast.success("Shown in directory again", { description: c.name });
          }),
        },
      });
    });
  };

  return (
    <div className="p-5 md:p-8">
      <div className="mb-8">
        <h1 className="font-display text-ink text-3xl font-extrabold tracking-tight">Reports</h1>
        <p className="text-muted text-sm mt-1">
          Events and communities that people flagged{openCount ? ` · ${openCount} open` : ""}
        </p>
      </div>

      <div role="group" aria-label="Filter reports" className="mb-6 flex w-fit flex-wrap gap-1 rounded-lg bg-mist p-1">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            aria-pressed={filter === f.value}
            onClick={() => setFilter(f.value)}
            className={`rounded-md px-3 py-1.5 text-xs font-bold transition-colors ${filter === f.value ? "bg-white text-ink shadow-sm" : "text-muted hover:text-ink"}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && <p className="text-red-600 text-sm mb-6">{error}</p>}

      {!loading && rows.length === 0 && (
        <p className="bg-white border border-line rounded-xl p-6 text-faint text-sm text-center">
          {filter === "open" ? "No open reports. All clear." : "No reports here."}
        </p>
      )}

      <div className="flex flex-col gap-3">
        {rows.map((r) => {
          const label = r.event ? r.event.name : r.community?.name || "—";
          const href = r.event ? `/discover/${r.event.slug}` : r.community?.handle ? `/u/${r.community.handle}` : null;
          return (
            <article key={r.id} className="bg-white border border-line rounded-xl p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-bold text-faint">
                    {r.target_type === "event" ? "Event" : "Community"} · {r.reason_label}
                    {r.reports_on_same > 1 && <span className="ml-2 text-red-600">{r.reports_on_same} reports</span>}
                  </p>
                  {href ? (
                    <a href={publicHref(href)} target="_blank" rel="noopener noreferrer" className="font-display text-lg font-bold text-ink hover:underline">
                      {label}
                    </a>
                  ) : (
                    <p className="font-display text-lg font-bold text-ink">{label}</p>
                  )}
                  <p className="text-xs text-muted">
                    Organiser: {r.event?.organizer_email || r.community?.email || "—"}
                    {r.event && !r.event.is_active && <span className="ml-2 font-bold text-red-600">Suspended</span>}
                    {r.community?.hidden_from_directory && <span className="ml-2 font-bold text-red-600">Hidden</span>}
                  </p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${r.status === "open" ? "bg-amber-500/10 text-amber-700" : "bg-gray-500/10 text-muted"}`}>
                  {STATUS_LABEL[r.status]}
                </span>
              </div>

              {r.details && <p className="mt-3 whitespace-pre-line break-words rounded-lg bg-mist p-3 text-sm text-ink">{r.details}</p>}
              <p className="mt-2 text-xs text-faint">
                Reported {when(r.created_at)} by {r.reporter_email || "someone who didn't leave an email"}
              </p>
              {r.status !== "open" && (
                <p className="mt-1 text-xs text-muted">
                  Closed {when(r.resolved_at)} by {r.resolved_by_email || "—"}
                  {r.resolution_note ? `: ${r.resolution_note}` : ""}
                </p>
              )}

              {can.moderate && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {r.status === "open" ? (
                    <>
                      {r.event && r.event.is_active && (
                        <button type="button" onClick={() => suspendEvent(r)} disabled={busy !== ""} className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-bold text-red-700 hover:bg-red-50 disabled:opacity-50">
                          Suspend event
                        </button>
                      )}
                      {r.community && !r.community.hidden_from_directory && (
                        <button type="button" onClick={() => hideCommunity(r)} disabled={busy !== ""} className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-bold text-red-700 hover:bg-red-50 disabled:opacity-50">
                          Hide from directory
                        </button>
                      )}
                      <button type="button" onClick={() => close(r, "resolved")} disabled={busy !== ""} className="rounded-lg bg-brand px-3 py-1.5 text-xs font-bold text-white hover:bg-brand-dark disabled:opacity-50">
                        Action taken
                      </button>
                      <button type="button" onClick={() => close(r, "dismissed")} disabled={busy !== ""} className="rounded-lg border border-line px-3 py-1.5 text-xs font-bold text-ink hover:bg-mist disabled:opacity-50">
                        No action needed
                      </button>
                    </>
                  ) : (
                    <button type="button" onClick={() => close(r, "open")} disabled={busy !== ""} className="rounded-lg border border-line px-3 py-1.5 text-xs font-bold text-ink hover:bg-mist disabled:opacity-50">
                      Reopen
                    </button>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
