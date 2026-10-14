"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Alert02Icon, Delete02Icon, Search01Icon } from "@hugeicons/core-free-icons";
import { useAdminMe } from "@/components/admin/AdminMe";
import { useConfirm, SkeletonRows } from "@/components/admin/ui";

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
  owner: "bg-ink text-white",
  admin: "bg-brand/10 text-brand-dark",
  viewer: "bg-mist text-muted",
};

const AVATAR_COLORS = [
  "bg-brand", "bg-stamp-pink", "bg-stamp-green", "bg-stamp-gold", "bg-ink",
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
      className={`w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-[11px] font-bold text-white ${color}`}
    >
      {name.slice(0, 2).toUpperCase()}
    </span>
  );
}

function RoleBadge({ role }: { role: Role }) {
  return (
    <span className={`inline-flex text-xs px-2.5 py-0.5 rounded-full font-bold capitalize ${ROLE_STYLE[role]}`}>
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

  const confirm = useConfirm();
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
    <tr key={m.id} className="group border-b border-hairline last:border-0 hover:bg-mist">
      <td className="py-3 pl-4 pr-4">
        <div className="flex items-center gap-3 min-w-0">
          <Avatar m={m} />
          <div className="min-w-0">
            <p className="text-ink text-sm font-medium truncate">{nameOf(m)}</p>
            <p className="text-faint text-xs truncate">{m.handle ?? m.email.split("@")[0]}</p>
          </div>
        </div>
      </td>
      <td className="py-3 pr-4 text-muted text-sm truncate max-w-[240px]">{m.email}</td>
      <td className="py-3 pr-4">
        {can.manage_team ? (
          <select
            value={m.role}
            onChange={(e) => changeRole(m, e.target.value as Role)}
            aria-label={`Role for ${m.email}`}
            className={`text-xs font-medium capitalize rounded px-2 py-1 border border-transparent hover:border-line focus:outline-none focus:border-brand cursor-pointer ${ROLE_STYLE[m.role]}`}
          >
            {ROLES.map((r) => (
              <option key={r.value} value={r.value} className="bg-white text-ink">
                {r.label}
              </option>
            ))}
          </select>
        ) : (
          <RoleBadge role={m.role} />
        )}
      </td>
      <td className="py-3 pr-4 text-muted text-sm whitespace-nowrap">{formatShortDate(m.added_at)}</td>
      <td className="py-3 pr-4 text-sm whitespace-nowrap">
        {isOnline(m.last_seen) ? (
          <span className="inline-flex items-center gap-1.5 text-body">
            <span className="w-1.5 h-1.5 rounded-full bg-stamp-green" />
            Online
          </span>
        ) : (
          <span className="text-muted">{m.signed_up ? formatShortDate(m.last_seen) : "Not signed in yet"}</span>
        )}
      </td>
      {can.manage_team && (
        <td className="py-3 pr-4 text-right">
          <button
            onClick={async () => {
              const ok = await confirm({
                title: `Remove ${nameOf(m)} from the admin team?`,
                body: `${m.email} loses access to the admin panel straight away. Their Byro account isn't affected, and you can invite them again later.`,
                confirmLabel: "Remove from team",
                tone: "danger",
              });
              if (ok) handleRemove(m);
            }}
            disabled={removingId === m.id}
            aria-label={`Remove ${m.email}`}
            className="opacity-0 group-hover:opacity-100 focus:opacity-100 text-faint hover:text-danger disabled:opacity-40 p-1.5 rounded-md hover:bg-danger-tint transition"
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
          <td colSpan={columns} className="bg-mist py-2 pl-4 text-xs text-muted">
            {label} <span className="text-faint ml-1">{list.length}</span>
          </td>
        </tr>
        {list.map(row)}
      </>
    );

  return (
    <div className="p-5 md:p-8">
      <div className="mb-8">
        <h1 className="font-display text-ink text-3xl font-extrabold tracking-tight">Team</h1>
        <p className="text-muted text-sm mt-1">
          {members.length} {members.length === 1 ? "person" : "people"} on the admin team
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-6">
        <label className="flex items-center gap-2 w-full sm:w-80 bg-mist border border-line rounded-lg px-3 py-2 focus-within:ring-1 focus-within:ring-brand/40">
          <HugeiconsIcon icon={Search01Icon} size={15} color="#6b7280" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or email"
            className="flex-1 bg-transparent text-sm text-ink placeholder:text-faint focus:outline-none"
          />
        </label>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value as "" | Role)}
          aria-label="Filter by role"
          className="bg-mist border border-line rounded-lg px-3 py-2 text-sm text-ink focus:outline-none"
        >
          <option value="" className="bg-white">All roles</option>
          {ROLES.map((r) => (
            <option key={r.value} value={r.value} className="bg-white">{r.label}s</option>
          ))}
        </select>
        {can.manage_team && (
          <button
            onClick={() => setInviteOpen(true)}
            className="ml-auto text-sm font-bold text-white bg-brand hover:bg-brand-dark px-4 py-2 rounded-full transition-colors"
          >
            Invite
          </button>
        )}
      </div>

      {actionError && <p className="text-danger text-xs mb-4">{actionError}</p>}

      {loading ? (
        <SkeletonRows />
      ) : error ? (
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <HugeiconsIcon icon={Alert02Icon} size={20} color="#f87171" />
          <p className="text-muted text-sm">{error}</p>
          <button
            onClick={loadMembers}
            className="text-xs font-semibold text-body hover:text-ink bg-mist hover:bg-line px-3 py-1.5 rounded-lg transition-colors"
          >
            Try again
          </button>
        </div>
      ) : visible.length === 0 ? (
        <p className="text-faint text-sm py-10 text-center">
          {members.length === 0 ? "No one on the team yet." : "No one matches that search."}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="text-xs text-faint">
                <th scope="col" className="pb-3 pl-4 pr-4 font-medium">Name</th>
                <th scope="col" className="pb-3 pr-4 font-medium">Email</th>
                <th scope="col" className="pb-3 pr-4 font-medium">Role</th>
                <th scope="col" className="pb-3 pr-4 font-medium">Added</th>
                <th scope="col" className="pb-3 pr-4 font-medium">Last seen</th>
                {can.manage_team && <th scope="col" className="pb-3 pr-4" aria-label="Actions" />}
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
          <div className="absolute inset-0 bg-ink/50" onClick={closeInvite} />
          <form
            onSubmit={handleInvite}
            className="relative w-full max-w-sm bg-white border border-line rounded-xl p-6 shadow-[0_20px_50px_rgba(20,22,28,0.14)] space-y-4"
          >
            <div>
              <h3 className="text-ink font-semibold text-sm">Invite to the admin team</h3>
              <p className="text-muted text-xs mt-1">
                They sign in at the admin page with a code sent to this email.
              </p>
            </div>
            <div>
              <label htmlFor="invite-email" className="text-xs text-muted block mb-1.5">Email</label>
              <input
                id="invite-email"
                type="email"
                autoFocus
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="name@usebyro.com"
                className="w-full bg-mist border border-line rounded-lg px-3 py-2.5 text-sm text-ink placeholder:text-faint focus:outline-none focus:ring-1 focus:ring-brand/40"
              />
            </div>
            <div>
              <label htmlFor="invite-role" className="text-xs text-muted block mb-1.5">Role</label>
              <select
                id="invite-role"
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as Role)}
                className="w-full bg-mist border border-line rounded-lg px-3 py-2.5 text-sm text-ink focus:outline-none"
              >
                {ROLES.map((r) => (
                  <option key={r.value} value={r.value} className="bg-white">{r.label}</option>
                ))}
              </select>
              <p className="text-faint text-xs mt-1.5">{ROLES.find((r) => r.value === inviteRole)?.hint}</p>
            </div>
            {inviteError && <p className="text-danger text-xs">{inviteError}</p>}
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={closeInvite}
                className="text-xs font-semibold text-body hover:text-ink px-3 py-2 rounded-lg hover:bg-mist transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={inviting || !inviteEmail.trim()}
                className="text-xs font-bold text-white bg-brand hover:bg-brand-dark disabled:opacity-50 px-4 py-2 rounded-full transition-colors"
              >
                {inviting ? "Adding…" : "Add to team"}
              </button>
            </div>
          </form>
        </div>
      )}

    </div>
  );
}
