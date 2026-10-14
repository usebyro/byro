"use client";

import { useAdminMe } from "@/components/admin/AdminMe";
import UserDetails from "@/components/admin/UserDetails";
import { useConfirm } from "@/components/admin/ui";
import { useEffect, useMemo, useState, useCallback } from "react";

interface AdminUser {
  id: number;
  email: string;
  display_name: string;
  handle: string | null;
  role: "attendee" | "organizer" | "";
  auth_provider?: string;
  events_created: number;
  date_joined: string;
  is_active: boolean;
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

const ROLE_OPTIONS = [
  { label: "Unspecified", value: "" },
  { label: "Attendee", value: "attendee" },
  { label: "Organiser", value: "organizer" },
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
      <span className="inline-flex items-center text-xs px-2 py-0.5 rounded-full font-medium bg-blue-500/10 text-brand-dark">
        Organiser
      </span>
    );
  }
  if (role === "attendee") {
    return (
      <span className="inline-flex items-center text-xs px-2 py-0.5 rounded-full font-medium bg-green-500/10 text-green-700">
        Attendee
      </span>
    );
  }
  return (
    <span className="inline-flex items-center text-xs px-2 py-0.5 rounded-full font-medium bg-gray-500/10 text-muted">
      Unspecified
    </span>
  );
}

function GuestBadge() {
  return (
    <span
      title="Created from a guest checkout — no login account, linked automatically if they later sign in with the same email"
      className="inline-flex items-center text-xs px-2 py-0.5 rounded-full font-medium bg-amber-500/10 text-amber-700 ml-1.5"
    >
      Guest
    </span>
  );
}

function StatusBadge({ isActive }: { isActive: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full font-medium ${
        isActive ? "bg-green-500/10 text-green-700" : "bg-red-500/10 text-red-600"
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${isActive ? "bg-green-400" : "bg-red-400"}`} />
      {isActive ? "Active" : "Suspended"}
    </span>
  );
}

export default function AdminUsersPage() {
  const { can } = useAdminMe();
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["value"]>("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [selected, setSelected] = useState<AdminUser | null>(null);
  const [savingRole, setSavingRole] = useState(false);
  const [roleError, setRoleError] = useState("");
  const confirm = useConfirm();
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [statusError, setStatusError] = useState("");

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

  const visibleUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.email.toLowerCase().includes(q) ||
        (u.display_name ?? "").toLowerCase().includes(q) ||
        (u.handle ?? "").toLowerCase().includes(q)
    );
  }, [users, search]);

  const openUser = (user: AdminUser) => {
    setSelected(user);
    setRoleError("");
    setStatusError("");
  };

  const applyUpdate = useCallback((id: number, patch: Partial<AdminUser>) => {
    setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, ...patch } : u)));
    setSelected((prev) => (prev && prev.id === id ? { ...prev, ...patch } : prev));
  }, []);

  const changeRole = async (user: AdminUser, role: AdminUser["role"]) => {
    if (role === user.role) return;
    setSavingRole(true);
    setRoleError("");
    const previous = user.role;
    applyUpdate(user.id, { role });
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      if (!res.ok) throw new Error("Failed to update role");
    } catch {
      applyUpdate(user.id, { role: previous });
      setRoleError("Couldn't update this user's role. Please try again.");
    } finally {
      setSavingRole(false);
    }
  };

  const askStatus = async (user: AdminUser, action: "suspend" | "reactivate") => {
    const ok = await confirm(
      action === "suspend"
        ? {
            title: `Suspend ${user.display_name || user.email}?`,
            body: `${user.email} is signed out and can't sign in until you reactivate them. Their events and tickets stay as they are.`,
            confirmLabel: "Suspend account",
            tone: "danger",
          }
        : {
            title: `Reactivate ${user.display_name || user.email}?`,
            body: `${user.email} can sign in and use Byro again.`,
            confirmLabel: "Reactivate account",
          },
    );
    if (ok) updateStatus(user, action);
  };

  const updateStatus = async (user: AdminUser, action: "suspend" | "reactivate") => {
    setUpdatingStatus(true);
    setStatusError("");
    const previous = user.is_active;
    const next = action === "reactivate";
    applyUpdate(user.id, { is_active: next });
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: next }),
      });
      if (!res.ok) throw new Error("Failed to update status");
    } catch {
      applyUpdate(user.id, { is_active: previous });
      setStatusError(`Couldn't ${action === "suspend" ? "suspend" : "reactivate"} this user. Please try again.`);
    } finally {
      setUpdatingStatus(false);
    }
  };

  return (
    <div className="p-5 md:p-8">
      <div className="mb-8">
        <h1 className="font-display text-ink text-3xl font-extrabold tracking-tight">Users</h1>
        <p className="text-muted text-sm mt-1">Registered accounts and the role they picked at sign-up</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        {[
          { label: "Registered Users", value: summary?.total_users },
          { label: "Organisers", value: summary?.total_organizers },
          { label: "Attendees", value: summary?.total_attendees },
        ].map((stat) => (
          <div key={stat.label} className="bg-white border border-line rounded-xl px-5 py-4">
            <p className="text-muted text-xs mb-1.5">{stat.label}</p>
            <p className="text-ink text-2xl font-semibold tabular-nums">{stat.value ?? "—"}</p>
          </div>
        ))}
      </div>

      {error && <p className="text-red-600 text-sm mb-6">{error}</p>}

      <div className="bg-white border border-line rounded-xl p-6">
        <div className="flex items-center justify-between gap-2 flex-wrap mb-4">
          <div className="flex items-center gap-2">
            <h2 className="text-ink font-semibold">All Users</h2>
            <span className="text-xs bg-mist text-muted px-2 py-0.5 rounded-full">
              {loading ? "—" : visibleUsers.length}
            </span>
          </div>
          <div className="flex items-center gap-1">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => setFilter(f.value)}
                className={`text-[11px] font-semibold px-2.5 py-1.5 rounded-lg transition-colors ${
                  filter === f.value
                    ? "bg-brand/10 text-brand-dark"
                    : "text-muted hover:text-ink hover:bg-mist"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by email or name…"
          className="w-full sm:w-72 mb-5 bg-mist border border-line rounded-lg px-3 py-2 text-sm text-ink placeholder:text-faint focus:outline-none focus:ring-1 focus:ring-brand/40"
        />

        {loading ? (
          <p className="text-faint text-sm py-6 text-center">Loading...</p>
        ) : visibleUsers.length === 0 ? (
          <p className="text-faint text-sm py-6 text-center">
            {search ? "No users match your search." : "No users match this filter."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hairline text-left">
                  <th className="pb-3 pr-6 text-xs text-faint font-medium">Email</th>
                  <th className="pb-3 pr-6 text-xs text-faint font-medium">Name</th>
                  <th className="pb-3 pr-6 text-xs text-faint font-medium">Role</th>
                  <th className="pb-3 pr-6 text-xs text-faint font-medium">Events created</th>
                  <th className="pb-3 pr-6 text-xs text-faint font-medium">Joined</th>
                  <th className="pb-3 text-xs text-faint font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {visibleUsers.map((u) => (
                  <tr
                    key={u.id}
                    onClick={() => openUser(u)}
                    className="cursor-pointer hover:bg-mist"
                  >
                    <td className="py-3 pr-6 text-ink font-medium truncate max-w-[220px]">{u.email}</td>
                    <td className="py-3 pr-6 text-muted truncate max-w-[160px]">
                      {u.display_name || u.handle || "—"}
                    </td>
                    <td className="py-3 pr-6">
                      <RoleBadge role={u.role} />
                      {u.auth_provider === "guest" && <GuestBadge />}
                    </td>
                    <td className="py-3 pr-6 text-[#3B4252] tabular-nums">{u.events_created}</td>
                    <td className="py-3 pr-6 text-muted whitespace-nowrap">{formatDate(u.date_joined)}</td>
                    <td className="py-3">
                      <StatusBadge isActive={u.is_active !== false} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && unspecified !== null && unspecified > 0 && filter === "" && (
          <p className="text-faint text-xs mt-4">
            {`${unspecified} ${unspecified === 1 ? "user hasn't" : "users haven't"} picked a role yet (signed up before this existed, or never finished onboarding).`}
          </p>
        )}
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-ink/50" onClick={() => setSelected(null)} />
          <div className="relative w-full max-w-md h-full bg-white border-l border-line shadow-[0_20px_50px_rgba(20,22,28,0.14)] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-line px-6 py-4 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-ink font-semibold truncate">{selected.display_name || selected.email}</h3>
                <p className="text-faint text-xs mt-0.5 truncate">{selected.email}</p>
              </div>
              <button
                onClick={() => setSelected(null)}
                aria-label="Close"
                className="shrink-0 text-muted hover:text-ink text-lg leading-none px-1"
              >
                ×
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-mist rounded-lg px-3 py-2.5">
                  <p className="text-faint text-[11px] mb-0.5">Handle</p>
                  <p className="text-ink text-sm">{selected.handle ? `@${selected.handle}` : "—"}</p>
                </div>
                <div className="bg-mist rounded-lg px-3 py-2.5">
                  <p className="text-faint text-[11px] mb-0.5">Events created</p>
                  <p className="text-ink text-sm tabular-nums">{selected.events_created}</p>
                </div>
                <div className="bg-mist rounded-lg px-3 py-2.5">
                  <p className="text-faint text-[11px] mb-0.5">Joined</p>
                  <p className="text-ink text-sm">{formatDate(selected.date_joined)}</p>
                </div>
                <div className="bg-mist rounded-lg px-3 py-2.5">
                  <p className="text-faint text-[11px] mb-0.5">Status</p>
                  <StatusBadge isActive={selected.is_active !== false} />
                </div>
              </div>

              <div>
                <h4 className="text-ink text-sm font-semibold mb-2">Role</h4>
                {!can.manage_roles && (
                  <p className="text-faint text-xs mb-2">Only owners can change a user&apos;s role.</p>
                )}
                <div className="flex items-center gap-1 bg-mist rounded-lg p-1 w-fit">
                  {ROLE_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      disabled={savingRole || !can.manage_roles}
                      onClick={() => changeRole(selected, opt.value)}
                      className={`text-xs font-semibold px-3 py-1.5 rounded-md transition-colors disabled:opacity-50 ${
                        selected.role === opt.value
                          ? "bg-brand/10 text-brand-dark"
                          : "text-muted hover:text-ink hover:bg-mist"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                {roleError && <p className="text-red-600 text-xs mt-2">{roleError}</p>}
              </div>

              <div>
                <h4 className="text-ink text-sm font-semibold mb-2">Account access</h4>
                <p className="text-faint text-xs leading-relaxed mb-3">
                  {selected.is_active !== false
                    ? "This account can sign in and use Byro normally."
                    : "This account is suspended and cannot sign in."}
                </p>
                {can.moderate ? <button
                  onClick={() => askStatus(selected, selected.is_active !== false ? "suspend" : "reactivate")}
                  disabled={updatingStatus}
                  className={`text-xs font-semibold px-3 py-2 rounded-lg transition-colors disabled:opacity-50 ${
                    selected.is_active !== false
                      ? "text-red-600 bg-red-500/10 hover:bg-red-500/20"
                      : "text-green-700 bg-green-500/10 hover:bg-green-500/20"
                  }`}
                >
                  {selected.is_active !== false ? "Suspend account" : "Reactivate account"}
                </button> : <p className="text-faint text-xs">Your role can&apos;t change account access.</p>}
                {statusError && <p className="text-red-600 text-xs mt-2">{statusError}</p>}
              </div>

              <UserDetails
                key={selected.id}
                userId={selected.id}
                onDeleted={() => {
                  setUsers((prev) => prev.filter((u) => u.id !== selected.id));
                  setSelected(null);
                }}
              />
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
