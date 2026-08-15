"use client";

import { useEffect, useMemo, useState } from "react";

interface AdminUser {
  id: number;
  email: string;
  display_name: string;
  handle: string | null;
  role: "attendee" | "organizer" | "";
  events_created: number;
  date_joined: string;
}

interface AnalyticsSummary {
  total_users: number;
  total_organizers: number;
  total_attendees: number;
}

const FILTERS = [
  { label: "All", value: "" },
  { label: "Organisers", value: "organizer" },
  { label: "Attendees", value: "attendee" },
] as const;

function formatDate(dateStr: string) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function RoleBadge({ role }: { role: AdminUser["role"] }) {
  if (role === "organizer") {
    return (
      <span className="inline-flex items-center text-xs px-2 py-0.5 rounded-full font-medium bg-blue-500/10 text-blue-400">
        Organiser
      </span>
    );
  }
  if (role === "attendee") {
    return (
      <span className="inline-flex items-center text-xs px-2 py-0.5 rounded-full font-medium bg-green-500/10 text-green-400">
        Attendee
      </span>
    );
  }
  return (
    <span className="inline-flex items-center text-xs px-2 py-0.5 rounded-full font-medium bg-gray-500/10 text-gray-400">
      Unspecified
    </span>
  );
}

export default function AdminUsersPage() {
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["value"]>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/admin/analytics/summary")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: AnalyticsSummary | null) => setSummary(data))
      .catch(() => setSummary(null));
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const qs = filter ? `?role=${filter}` : "";
    fetch(`/api/admin/users${qs}`)
      .then((res) => {
        if (!res.ok) throw new Error("users");
        return res.json();
      })
      .then((data: AdminUser[]) => {
        if (!cancelled) setUsers(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!cancelled) setError("Failed to load users.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [filter]);

  const unspecified = useMemo(() => {
    if (!summary) return null;
    return summary.total_users - summary.total_organizers - summary.total_attendees;
  }, [summary]);

  return (
    <div className="p-5 md:p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-white text-xl font-bold">Users</h1>
        <p className="text-gray-400 text-sm mt-1">Registered accounts and the role they picked at sign-up</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        {[
          { label: "Registered Users", value: summary?.total_users },
          { label: "Organisers", value: summary?.total_organizers },
          { label: "Attendees", value: summary?.total_attendees },
        ].map((stat) => (
          <div key={stat.label} className="bg-[#1a1d27] border border-white/10 rounded-xl px-5 py-4">
            <p className="text-gray-400 text-xs uppercase tracking-wider mb-1">{stat.label}</p>
            <p className="text-white text-2xl font-bold">{stat.value ?? "—"}</p>
          </div>
        ))}
      </div>

      {error && <p className="text-red-400 text-sm mb-6">{error}</p>}

      <div className="bg-[#1a1d27] border border-white/10 rounded-xl p-6">
        <div className="flex items-center justify-between gap-2 flex-wrap mb-5">
          <div className="flex items-center gap-2">
            <h2 className="text-white font-semibold">All Users</h2>
            <span className="text-xs bg-white/5 text-gray-400 px-2 py-0.5 rounded-full">
              {loading ? "—" : users.length}
            </span>
          </div>
          <div className="flex items-center gap-1">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => setFilter(f.value)}
                className={`text-[11px] font-semibold px-2.5 py-1.5 rounded-lg transition-colors ${
                  filter === f.value
                    ? "bg-blue-600/20 text-blue-400"
                    : "text-gray-400 hover:text-white hover:bg-white/5"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <p className="text-gray-500 text-sm py-6 text-center">Loading...</p>
        ) : users.length === 0 ? (
          <p className="text-gray-500 text-sm py-6 text-center">No users match this filter.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5 text-left">
                  <th className="pb-3 pr-6 text-xs text-gray-500 uppercase tracking-wider font-medium">Email</th>
                  <th className="pb-3 pr-6 text-xs text-gray-500 uppercase tracking-wider font-medium">Name</th>
                  <th className="pb-3 pr-6 text-xs text-gray-500 uppercase tracking-wider font-medium">Role</th>
                  <th className="pb-3 pr-6 text-xs text-gray-500 uppercase tracking-wider font-medium">Events Created</th>
                  <th className="pb-3 text-xs text-gray-500 uppercase tracking-wider font-medium">Joined</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {users.map((u) => (
                  <tr key={u.id}>
                    <td className="py-3 pr-6 text-white font-medium truncate max-w-[220px]">{u.email}</td>
                    <td className="py-3 pr-6 text-gray-400 truncate max-w-[160px]">
                      {u.display_name || u.handle || "—"}
                    </td>
                    <td className="py-3 pr-6">
                      <RoleBadge role={u.role} />
                    </td>
                    <td className="py-3 pr-6 text-gray-300">{u.events_created}</td>
                    <td className="py-3 text-gray-400 whitespace-nowrap">{formatDate(u.date_joined)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && unspecified !== null && unspecified > 0 && filter === "" && (
          <p className="text-gray-500 text-xs mt-4">
            {unspecified} user{unspecified === 1 ? "" : "s"} haven&apos;t picked a role yet (signed up before this
            existed, or never finished onboarding).
          </p>
        )}
      </div>
    </div>
  );
}
