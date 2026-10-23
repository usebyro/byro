"use client";

import { SkeletonRows } from "@/components/admin/ui";
import { useEffect, useState } from "react";

interface AuditEntry {
  id: number;
  action: string;
  target_type: string;
  target_id: string;
  target_label: string;
  detail: string;
  actor_email: string;
  created_at: string;
}

const TARGET_TYPES = ["", "event", "user", "payout", "member"];

const ACTION_LABEL: Record<string, string> = {
  "event.suspended": "Suspended event",
  "event.visibility_changed": "Changed event visibility",
  "event.cancelled": "Cancelled event",
  "event.cohost_added": "Added event co-host",
  "ticket.voided": "Voided ticket",
  "ticket.email_changed": "Changed ticket email",
  "event.edited": "Edited event details",
  "event.sales_closed": "Closed ticket sales",
  "event.sales_reopened": "Reopened ticket sales",
  "event.moved_to_draft": "Moved event to draft",
  "event.reactivated": "Reactivated event",
  "event.deleted": "Deleted event",
  "user.suspended": "Suspended user",
  "user.reactivated": "Reactivated user",
  "user.role_changed": "Changed user role",
  "payout.processed": "Processed payout",
  "payout.rejected": "Rejected payout",
  "payout.held": "Put payout on hold",
  "payout.released": "Released payout from hold",
  "payout.deleted": "Deleted payout",
  "team.added": "Added team member",
  "team.role_changed": "Changed team role",
  "team.removed": "Removed team member",
};

function tone(action: string) {
  if (/deleted|removed|suspended|rejected/.test(action)) return "bg-danger-tint text-danger";
  if (/reactivated|processed|added/.test(action)) return "bg-good-tint text-good";
  return "bg-sky text-brand-dark";
}

function formatDateTime(s: string) {
  return new Date(s).toLocaleString("en-GB", {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export default function AdminAuditLogPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [targetType, setTargetType] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ limit: "100" });
    if (targetType) params.set("target_type", targetType);
    fetch(`/api/admin/audit-log?${params}`)
      .then(async (res) => {
        const data = await res.json().catch(() => []);
        if (!res.ok) throw new Error();
        if (cancelled) return;
        setEntries(Array.isArray(data) ? data : []);
        setError("");
      })
      .catch(() => { if (!cancelled) setError("Couldn't load the audit log."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [targetType]);

  return (
    <div className="p-5 md:p-8">
      <div className="mb-8">
        <h1 className="font-display text-ink text-3xl font-extrabold tracking-tight">Audit log</h1>
        <p className="text-muted text-sm mt-1">Every action taken from the admin panel, newest first</p>
      </div>

      <select
        value={targetType}
        onChange={(e) => setTargetType(e.target.value)}
        aria-label="Filter by target"
        className="mb-6 bg-mist border border-line rounded-lg px-3 py-2 text-sm text-ink focus:outline-none"
      >
        {TARGET_TYPES.map((t) => (
          <option key={t} value={t} className="bg-white">
            {t ? `${t[0].toUpperCase()}${t.slice(1)}s` : "Everything"}
          </option>
        ))}
      </select>

      {error && <p className="text-danger text-sm mb-6">{error}</p>}

      <div className="bg-white border border-line rounded-xl p-6 overflow-x-auto">
        {loading && entries.length === 0 ? (
          <SkeletonRows />
        ) : entries.length === 0 ? (
          <p className="text-faint text-sm py-6 text-center">Nothing has been logged yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hairline text-left">
                {["When", "Who", "Action", "Target", "Detail"].map((h) => (
                  <th scope="col" key={h} className="pb-3 pr-6 text-xs text-faint font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {entries.map((a) => (
                <tr key={a.id}>
                  <td className="py-3 pr-6 text-muted whitespace-nowrap">{formatDateTime(a.created_at)}</td>
                  <td className="py-3 pr-6 text-body truncate max-w-[200px]">{a.actor_email || "—"}</td>
                  <td className="py-3 pr-6">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${tone(a.action)}`}>
                      {ACTION_LABEL[a.action] ?? a.action}
                    </span>
                  </td>
                  <td className="py-3 pr-6 text-body truncate max-w-[220px]">
                    {a.target_label || `${a.target_type} ${a.target_id}`}
                  </td>
                  <td className="py-3 text-faint truncate max-w-[200px]">{a.detail || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
