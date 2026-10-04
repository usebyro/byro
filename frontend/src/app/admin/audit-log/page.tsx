"use client";

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
  "event.reactivated": "Reactivated event",
  "event.deleted": "Deleted event",
  "user.suspended": "Suspended user",
  "user.reactivated": "Reactivated user",
  "user.role_changed": "Changed user role",
  "payout.processed": "Processed payout",
  "payout.rejected": "Rejected payout",
  "payout.deleted": "Deleted payout",
  "team.added": "Added team member",
  "team.role_changed": "Changed team role",
  "team.removed": "Removed team member",
};

function tone(action: string) {
  if (/deleted|removed|suspended|rejected/.test(action)) return "bg-red-500/10 text-red-400";
  if (/reactivated|processed|added/.test(action)) return "bg-green-500/10 text-green-400";
  return "bg-blue-500/10 text-blue-400";
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
        <h1 className="text-white text-xl font-bold">Audit log</h1>
        <p className="text-gray-400 text-sm mt-1">Every action taken from the admin panel, newest first</p>
      </div>

      <select
        value={targetType}
        onChange={(e) => setTargetType(e.target.value)}
        aria-label="Filter by target"
        className="mb-6 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none"
      >
        {TARGET_TYPES.map((t) => (
          <option key={t} value={t} className="bg-[#1a1d27]">
            {t ? `${t[0].toUpperCase()}${t.slice(1)}s` : "Everything"}
          </option>
        ))}
      </select>

      {error && <p className="text-red-400 text-sm mb-6">{error}</p>}

      <div className="bg-[#1a1d27] border border-white/10 rounded-xl p-6 overflow-x-auto">
        {!loading && entries.length === 0 ? (
          <p className="text-gray-500 text-sm py-6 text-center">Nothing has been logged yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5 text-left">
                {["When", "Who", "Action", "Target", "Detail"].map((h) => (
                  <th key={h} className="pb-3 pr-6 text-xs text-gray-500 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {entries.map((a) => (
                <tr key={a.id}>
                  <td className="py-3 pr-6 text-gray-400 whitespace-nowrap">{formatDateTime(a.created_at)}</td>
                  <td className="py-3 pr-6 text-gray-300 truncate max-w-[200px]">{a.actor_email || "—"}</td>
                  <td className="py-3 pr-6">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${tone(a.action)}`}>
                      {ACTION_LABEL[a.action] ?? a.action}
                    </span>
                  </td>
                  <td className="py-3 pr-6 text-gray-300 truncate max-w-[220px]">
                    {a.target_label || `${a.target_type} ${a.target_id}`}
                  </td>
                  <td className="py-3 text-gray-500 truncate max-w-[200px]">{a.detail || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
