"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Alert02Icon, Delete02Icon, Search01Icon } from "@hugeicons/core-free-icons";
import { useAdminMe } from "@/components/admin/AdminMe";

type Role = "viewer" | "admin" | "owner";

interface AdminTeamMember {
  id: number;
  email: string;
  role: Role;
  added_at: string;
  display_name: string;
  handle: string | null;
  avatar_url: string | null;
  last_seen: string | null;
  signed_up: boolean;
}

const ROLES: { value: Role; label: string; hint: string }[] = [
  { value: "owner", label: "Owner", hint: "Everything, incl. deletes, user roles and this team" },
  { value: "admin", label: "Admin", hint: "Moderate events and users, process payouts" },
  { value: "viewer", label: "Viewer", hint: "Can look, can't change anything" },
];

const ROLE_STYLE: Record<Role, string> = {
  owner: "bg-indigo-500/15 text-indigo-300",
  admin: "bg-blue-500/15 text-blue-300",
  viewer: "bg-white/5 text-gray-400",
};

const AVATAR_COLORS = [
  "bg-blue-600", "bg-teal-600", "bg-pink-500", "bg-violet-600", "bg-emerald-600", "bg-orange-600",
];

function formatShortDate(dateStr: string | null) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

function isOnline(dateStr: string | null) {
  return Boolean(dateStr) && Date.now() - new Date(dateStr as string).getTime() < 5 * 60 * 1000;
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function nameOf(m: AdminTeamMember) {
  return m.display_name || m.email.split("@")[0];
}

function Avatar({ m }: { m: AdminTeamMember }) {
  const name = nameOf(m);
  if (m.avatar_url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={m.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />;
  }
  const color = AVATAR_COLORS[m.email.length % AVATAR_COLORS.length];
  return (
    <span
      aria-hidden
      className={`w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-[11px] font-semibold text-white ${color}`}
    >
      {name.slice(0, 2).toUpperCase()}
    </span>
  );
}

function RoleBadge({ role }: { role: Role }) {
  return (
    <span className={`inline-flex text-xs px-2 py-0.5 rounded font-medium capitalize ${ROLE_STYLE[role]}`}>
      {role}
    </span>
  );
}

export default function AdminTeamPage() {
  const { can } = useAdminMe();
  const [members, setMembers] = useState<AdminTeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<"" | Role>("");

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("viewer");
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState("");

  const [removing, setRemoving] = useState<AdminTeamMember | null>(null);
  const [removingId, setRemovingId] = useState<number | null>(null);
  const [actionError, setActionError] = useState("");

  const loadMembers = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/team");
      if (!res.ok) throw new Error("Failed to load team");
      const data = await res.json();
      setMembers(Array.isArray(data) ? data : []);
    } catch {
      setError("Couldn't load the admin team.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  const closeInvite = () => {
    setInviteOpen(false);
    setInviteEmail("");
    setInviteRole("viewer");
    setInviteError("");
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = inviteEmail.trim().toLowerCase();
    setInviteError("");

    if (!isValidEmail(email)) {
      setInviteError("Enter a valid email address.");
      return;
    }
    if (members.some((m) => m.email.toLowerCase() === email)) {
      setInviteError("This person is already on the team.");
      return;
    }

    setInviting(true);
    try {
      const res = await fetch("/api/admin/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role: inviteRole }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "Failed");
      }
      const created: AdminTeamMember = await res.json();
      setMembers((prev) => [...prev, created]);
      closeInvite();
    } catch (err) {
      setInviteError(
        err instanceof Error && err.message !== "Failed"
          ? err.message
          : "Couldn't add that person. Please try again.",
      );
    } finally {
      setInviting(false);
    }
  };

  const changeRole = async (member: AdminTeamMember, role: Role) => {
    setActionError("");
    const previous = members;
    setMembers((prev) => prev.map((m) => (m.id === member.id ? { ...m, role } : m)));
    try {
      const res = await fetch(`/api/admin/team/${member.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "Failed");
      }
    } catch (err) {
      setMembers(previous);
      setActionError(
        err instanceof Error && err.message !== "Failed" ? err.message : "Couldn't change that role.",
      );
    }
  };

  const handleRemove = async (member: AdminTeamMember) => {
    setRemovingId(member.id);
    setActionError("");
    setRemoving(null);
    const previous = members;
    setMembers((prev) => prev.filter((m) => m.id !== member.id));
    try {
      const res = await fetch(`/api/admin/team/${member.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "Failed");
      }
    } catch (err) {
      setMembers(previous);
      setActionError(
        err instanceof Error && err.message !== "Failed" ? err.message : "Couldn't remove that person.",
      );
    } finally {
      setRemovingId(null);
    }
  };

  const q = search.trim().toLowerCase();
  const visible = useMemo(
    () =>
      members
        .filter((m) => !roleFilter || m.role === roleFilter)
        .filter(
          (m) =>
            !q ||
            m.email.toLowerCase().includes(q) ||
            nameOf(m).toLowerCase().includes(q) ||
            (m.handle ?? "").toLowerCase().includes(q),
        )
        .sort((a, b) => nameOf(a).localeCompare(nameOf(b))),
    [members, q, roleFilter],
  );

  const active = visible.filter((m) => m.signed_up);
  const pending = visible.filter((m) => !m.signed_up);

  const columns = can.manage_team ? 6 : 5;

  const row = (m: AdminTeamMember) => (
    <tr key={m.id} className="group border-b border-white/5 last:border-0 hover:bg-white/[0.02]">
      <td className="py-3 pl-4 pr-4">
        <div className="flex items-center gap-3 min-w-0">
          <Avatar m={m} />
          <div className="min-w-0">
            <p className="text-white text-sm font-medium truncate">{nameOf(m)}</p>
            <p className="text-gray-500 text-xs truncate">{m.handle ?? m.email.split("@")[0]}</p>
          </div>
        </div>
      </td>
      <td className="py-3 pr-4 text-gray-400 text-sm truncate max-w-[240px]">{m.email}</td>
      <td className="py-3 pr-4">
        {can.manage_team ? (
          <select
            value={m.role}
            onChange={(e) => changeRole(m, e.target.value as Role)}
            aria-label={`Role for ${m.email}`}
            className={`text-xs font-medium capitalize rounded px-2 py-1 border border-transparent hover:border-white/10 focus:outline-none focus:border-white/20 cursor-pointer ${ROLE_STYLE[m.role]}`}
          >
            {ROLES.map((r) => (
              <option key={r.value} value={r.value} className="bg-[#1a1d27] text-white">
                {r.label}
              </option>
            ))}
          </select>
        ) : (
          <RoleBadge role={m.role} />
        )}
      </td>
      <td className="py-3 pr-4 text-gray-400 text-sm whitespace-nowrap">{formatShortDate(m.added_at)}</td>
      <td className="py-3 pr-4 text-sm whitespace-nowrap">
        {isOnline(m.last_seen) ? (
          <span className="inline-flex items-center gap-1.5 text-gray-300">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
            Online
          </span>
        ) : (
          <span className="text-gray-400">{m.signed_up ? formatShortDate(m.last_seen) : "Not signed in yet"}</span>
        )}
      </td>
      {can.manage_team && (
        <td className="py-3 pr-4 text-right">
          <button
            onClick={() => setRemoving(m)}
            disabled={removingId === m.id}
            aria-label={`Remove ${m.email}`}
            className="opacity-0 group-hover:opacity-100 focus:opacity-100 text-gray-500 hover:text-red-400 disabled:opacity-40 p-1.5 rounded-md hover:bg-red-500/10 transition"
          >
            <HugeiconsIcon icon={Delete02Icon} size={15} color="currentColor" />
          </button>
        </td>
      )}
    </tr>
  );

  const group = (label: string, list: AdminTeamMember[]) =>
    list.length > 0 && (
      <>
        <tr>
          <td colSpan={columns} className="bg-white/[0.03] py-2 pl-4 text-xs text-gray-400">
            {label} <span className="text-gray-600 ml-1">{list.length}</span>
          </td>
        </tr>
        {list.map(row)}
      </>
    );

  return (
    <div className="p-5 md:p-10 max-w-5xl">
      <h1 className="text-white text-2xl font-semibold mb-6">Members</h1>

      <div className="flex flex-wrap items-center gap-2 mb-6">
        <label className="flex items-center gap-2 w-full sm:w-80 bg-white/5 border border-white/10 rounded-lg px-3 py-2 focus-within:ring-1 focus-within:ring-blue-500/50">
          <HugeiconsIcon icon={Search01Icon} size={15} color="#6b7280" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or email"
            className="flex-1 bg-transparent text-sm text-white placeholder:text-gray-500 focus:outline-none"
          />
        </label>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value as "" | Role)}
          aria-label="Filter by role"
          className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none"
        >
          <option value="" className="bg-[#1a1d27]">All roles</option>
          {ROLES.map((r) => (
            <option key={r.value} value={r.value} className="bg-[#1a1d27]">{r.label}s</option>
          ))}
        </select>
        {can.manage_team && (
          <button
            onClick={() => setInviteOpen(true)}
            className="ml-auto text-sm font-semibold text-white bg-indigo-500 hover:bg-indigo-400 px-4 py-2 rounded-lg transition-colors"
          >
            Invite
          </button>
        )}
      </div>

      {actionError && <p className="text-red-400 text-xs mb-4">{actionError}</p>}

      {loading ? (
        <p className="text-gray-500 text-sm py-10 text-center">Loading…</p>
      ) : error ? (
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <HugeiconsIcon icon={Alert02Icon} size={20} color="#f87171" />
          <p className="text-gray-400 text-sm">{error}</p>
          <button
            onClick={loadMembers}
            className="text-xs font-semibold text-gray-300 hover:text-white bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded-lg transition-colors"
          >
            Try again
          </button>
        </div>
      ) : visible.length === 0 ? (
        <p className="text-gray-500 text-sm py-10 text-center">
          {members.length === 0 ? "No one on the team yet." : "No one matches that search."}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="text-xs text-gray-500">
                <th className="pb-3 pl-4 pr-4 font-medium">Name</th>
                <th className="pb-3 pr-4 font-medium">Email</th>
                <th className="pb-3 pr-4 font-medium">Role</th>
                <th className="pb-3 pr-4 font-medium">Added</th>
                <th className="pb-3 pr-4 font-medium">Last seen</th>
                {can.manage_team && <th className="pb-3 pr-4" aria-label="Actions" />}
              </tr>
            </thead>
            <tbody>
              {group("Active", active)}
              {group("Invited", pending)}
            </tbody>
          </table>
        </div>
      )}

      {inviteOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70" onClick={closeInvite} />
          <form
            onSubmit={handleInvite}
            className="relative w-full max-w-sm bg-[#1a1d27] border border-white/10 rounded-xl p-6 shadow-2xl space-y-4"
          >
            <div>
              <h3 className="text-white font-semibold text-sm">Invite to the admin team</h3>
              <p className="text-gray-400 text-xs mt-1">
                They sign in at the admin page with a code sent to this email.
              </p>
            </div>
            <div>
              <label htmlFor="invite-email" className="text-xs text-gray-400 block mb-1.5">Email</label>
              <input
                id="invite-email"
                type="email"
                autoFocus
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="name@usebyro.com"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500/50"
              />
            </div>
            <div>
              <label htmlFor="invite-role" className="text-xs text-gray-400 block mb-1.5">Role</label>
              <select
                id="invite-role"
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as Role)}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none"
              >
                {ROLES.map((r) => (
                  <option key={r.value} value={r.value} className="bg-[#1a1d27]">{r.label}</option>
                ))}
              </select>
              <p className="text-gray-500 text-xs mt-1.5">{ROLES.find((r) => r.value === inviteRole)?.hint}</p>
            </div>
            {inviteError && <p className="text-red-400 text-xs">{inviteError}</p>}
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={closeInvite}
                className="text-xs font-semibold text-gray-300 hover:text-white px-3 py-2 rounded-lg hover:bg-white/5 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={inviting || !inviteEmail.trim()}
                className="text-xs font-semibold text-white bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 px-4 py-2 rounded-lg transition-colors"
              >
                {inviting ? "Adding…" : "Add to team"}
              </button>
            </div>
          </form>
        </div>
      )}

      {removing && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70" onClick={() => setRemoving(null)} />
          <div className="relative w-full max-w-sm bg-[#1a1d27] border border-white/10 rounded-xl p-6 shadow-2xl">
            <h3 className="text-white font-semibold text-sm mb-2">Remove {nameOf(removing)}?</h3>
            <p className="text-gray-400 text-xs leading-relaxed mb-5">
              {removing.email} will lose access to the admin panel immediately. Their Byro account is not affected.
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setRemoving(null)}
                className="text-xs font-semibold text-gray-300 hover:text-white px-3 py-2 rounded-lg hover:bg-white/5 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleRemove(removing)}
                className="text-xs font-semibold text-red-400 bg-red-500/10 hover:bg-red-500/20 px-3 py-2 rounded-lg transition-colors"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
