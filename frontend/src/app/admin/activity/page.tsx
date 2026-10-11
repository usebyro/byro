"use client";

import { useEffect, useState } from "react";

interface ActivityEntry {
  id: number;
  action: string;
  actor_email: string;
  target_type: string;
  target_id: string;
  target_label: string;
  detail: string;
  ip_address: string | null;
  created_at: string;
}

interface ActionOption {
  value: string;
  label: string;
}

function formatDateTime(s: string) {
  return new Date(s).toLocaleString("en-GB", {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export default function AdminActivityPage() {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [actions, setActions] = useState<ActionOption[]>([]);
  const [action, setAction] = useState("");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ limit: "150" });
    if (action) params.set("action", action);
    if (debounced) params.set("search", debounced);
    fetch(`/api/admin/activity?${params}`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error();
        if (cancelled) return;
        setEntries(data.results ?? []);
        setActions(data.actions ?? []);
        setError("");
      })
      .catch(() => { if (!cancelled) setError("Couldn't load activity."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [action, debounced]);

  const label = (value: string) => actions.find((a) => a.value === value)?.label ?? value;

  return (
    <div className="p-5 md:p-8">
      <div className="mb-8">
        <h1 className="text-ink text-xl font-bold">Activity</h1>
        <p className="text-muted text-sm mt-1">
          What users did: sign-ins, events, tickets and payout requests. Kept for a year.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-6">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by email or event…"
          className="w-full sm:w-80 bg-mist border border-line rounded-lg px-3 py-2 text-sm text-ink placeholder:text-faint focus:outline-none focus:ring-1 focus:ring-brand/40"
        />
        <select
          value={action}
          onChange={(e) => setAction(e.target.value)}
          aria-label="Filter by action"
          className="bg-mist border border-line rounded-lg px-3 py-2 text-sm text-ink focus:outline-none"
        >
          <option value="" className="bg-white">All actions</option>
          {actions.map((a) => (
            <option key={a.value} value={a.value} className="bg-white">{a.label}</option>
          ))}
        </select>
      </div>

      {error && <p className="text-red-600 text-sm mb-6">{error}</p>}

      <div className="bg-white border border-line rounded-xl p-6 overflow-x-auto">
        {!loading && entries.length === 0 ? (
          <p className="text-faint text-sm py-6 text-center">No activity matches.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hairline text-left">
                {["When", "Who", "Action", "Target", "Detail", "IP"].map((h) => (
                  <th key={h} className="pb-3 pr-6 text-xs text-faint font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {entries.map((a) => (
                <tr key={a.id}>
                  <td className="py-3 pr-6 text-muted whitespace-nowrap">{formatDateTime(a.created_at)}</td>
                  <td className="py-3 pr-6 text-[#3B4252] truncate max-w-[200px]">{a.actor_email || "Guest"}</td>
                  <td className="py-3 pr-6">
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap bg-blue-500/10 text-brand-dark">
                      {label(a.action)}
                    </span>
                  </td>
                  <td className="py-3 pr-6 text-[#3B4252] truncate max-w-[200px]">{a.target_label || "—"}</td>
                  <td className="py-3 pr-6 text-faint truncate max-w-[220px]">{a.detail || "—"}</td>
                  <td className="py-3 text-faint whitespace-nowrap tabular-nums">{a.ip_address ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
