"use client";

import { useEffect, useState, useCallback } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Alert02Icon, MoreVerticalIcon } from "@hugeicons/core-free-icons";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

interface AdminTeamMember {
  id: number;
  email: string;
  added_at: string;
}

const VISIBLE_AT_FIRST = 5;

// Soft dark tints for the initial circles, picked from the address so each person keeps their colour.
const TINTS = [
  "bg-blue-500/20 text-blue-300",
  "bg-emerald-500/20 text-emerald-300",
  "bg-amber-500/20 text-amber-300",
  "bg-rose-500/20 text-rose-300",
  "bg-violet-500/20 text-violet-300",
  "bg-teal-500/20 text-teal-300",
];
function tintFor(email: string) {
  let h = 0;
  for (let i = 0; i < email.length; i++) h = (h * 31 + email.charCodeAt(i)) | 0;
  return TINTS[Math.abs(h) % TINTS.length];
}

function formatDate(dateStr: string) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

const divider = "border-t border-dashed border-white/10";

export default function AdminTeamPage() {
  const [members, setMembers] = useState<AdminTeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showAll, setShowAll] = useState(false);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState("");

  const [removing, setRemoving] = useState<AdminTeamMember | null>(null);
  const [removingId, setRemovingId] = useState<number | null>(null);
  const [removeError, setRemoveError] = useState("");

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

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = inviteEmail.trim().toLowerCase();
    setInviteError("");

    if (!isValidEmail(email)) {
      setInviteError("Enter a valid email address.");
      return;
    }
    if (members.some((m) => m.email.toLowerCase() === email)) {
      setInviteError("This person already has admin access.");
      return;
    }

    setInviting(true);
    try {
      const res = await fetch("/api/admin/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) throw new Error("Failed to invite");
      const created: AdminTeamMember = await res.json();
      setMembers((prev) => [created, ...prev]);
      setInviteEmail("");
    } catch {
      setInviteError("Couldn't send that invite. Please try again.");
    } finally {
      setInviting(false);
    }
  };

  const handleRemove = async (member: AdminTeamMember) => {
    setRemovingId(member.id);
    setRemoveError("");
    setRemoving(null);
    const previous = members;
    setMembers((prev) => prev.filter((m) => m.id !== member.id));
    try {
      const res = await fetch(`/api/admin/team/${member.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to remove");
    } catch {
      setMembers(previous);
      setRemoveError("Couldn't remove that admin. Please try again.");
    } finally {
      setRemovingId(null);
    }
  };

  const shown = showAll ? members : members.slice(0, VISIBLE_AT_FIRST);
  const hidden = members.length - shown.length;

  return (
    <div className="p-5 md:p-8">
      <div className="mx-auto w-full max-w-xl rounded-2xl border border-white/10 bg-[#1a1d27] shadow-2xl">
        {/* Title */}
        <div className="px-6 pt-6 pb-5">
          <h1 className="text-[15px] font-semibold text-white">Admin team</h1>
          <p className="mt-0.5 text-[13px] text-gray-400">Manage who has access to this admin panel.</p>
        </div>

        {/* Invite */}
        <section className={`px-6 py-5 ${divider}`}>
          <h2 className="text-[13px] font-semibold text-white">Invite an admin</h2>
          <p className="mt-0.5 text-[13px] text-gray-400">Add people by email.</p>

          <form onSubmit={handleInvite} className="mt-3 flex items-center gap-2">
            <label htmlFor="admin-invite-email" className="sr-only">Email address</label>
            <input
              id="admin-invite-email"
              type="email"
              inputMode="email"
              autoCapitalize="none"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="name@usebyro.com"
              aria-invalid={Boolean(inviteError)}
              className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-3 h-10 md:h-9 text-base md:text-[13px] text-white placeholder:text-gray-500 focus:border-blue-500/60 focus:outline-none focus:ring-2 focus:ring-blue-500/25"
            />
            <button
              type="submit"
              disabled={inviting || !inviteEmail.trim()}
              className="shrink-0 h-10 md:h-9 rounded-lg border border-white/10 bg-white/5 px-3.5 text-[13px] font-semibold text-white hover:bg-white/10 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60"
            >
              {inviting ? "Sending…" : "Send invite"}
            </button>
          </form>
          {inviteError && (
            <p className="mt-2 text-xs text-red-400" role="alert">{inviteError}</p>
          )}
        </section>

        {/* Admins */}
        <section className={`px-6 py-5 ${divider}`}>
          <div className="flex items-center gap-2">
            <h2 className="text-[13px] font-semibold text-white">Admins</h2>
            <span className="rounded-full bg-white/5 px-2 py-0.5 text-xs text-gray-400">
              {loading ? "—" : members.length}
            </span>
          </div>

          {removeError && <p className="mt-3 text-xs text-red-400" role="alert">{removeError}</p>}

          {loading ? (
            <ul className="mt-3 space-y-1.5" aria-label="Loading admins">
              {[0, 1, 2].map((i) => (
                <li key={i} className="h-10 animate-pulse rounded-lg bg-white/[0.04]" />
              ))}
            </ul>
          ) : error ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <HugeiconsIcon icon={Alert02Icon} size={20} color="#f87171" />
              <p className="text-[13px] text-gray-400">{error}</p>
              <button
                onClick={loadMembers}
                className="rounded-lg border border-white/10 bg-white/5 px-3 h-8 text-[13px] font-semibold text-gray-200 hover:bg-white/10"
              >
                Try again
              </button>
            </div>
          ) : members.length === 0 ? (
            <p className="mt-3 text-[13px] text-gray-500">No admins yet. Invite someone above.</p>
          ) : (
            <>
              <ul className="mt-3 space-y-1.5">
                {shown.map((m) => (
                  <li key={m.id} className="flex items-center gap-3 rounded-lg bg-white/[0.04] px-3 py-1.5 min-h-[40px]">
                    <span
                      aria-hidden="true"
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold uppercase ${tintFor(m.email)}`}
                    >
                      {m.email.charAt(0)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[13px] text-gray-100">{m.email}</span>
                    <span className="hidden shrink-0 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-xs text-gray-400 md:inline">
                      Added {formatDate(m.added_at)}
                    </span>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          disabled={removingId === m.id}
                          aria-label={`Actions for ${m.email}`}
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-gray-400 hover:bg-white/10 hover:text-white disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60"
                        >
                          <HugeiconsIcon icon={MoreVerticalIcon} size={16} color="currentColor" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="end"
                        className="w-44 border-white/10 bg-[#22252f] text-gray-200"
                      >
                        <DropdownMenuItem
                          inset={false}
                          variant="destructive"
                          onSelect={() => setRemoving(m)}
                          className="text-gray-200 focus:bg-white/10 focus:text-white data-[variant=destructive]:text-red-400 data-[variant=destructive]:focus:bg-red-500/10 data-[variant=destructive]:focus:text-red-300"
                        >
                          Remove access
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </li>
                ))}
              </ul>

              {(hidden > 0 || (showAll && members.length > VISIBLE_AT_FIRST)) && (
                <div className="mt-2.5 flex justify-center">
                  <button
                    type="button"
                    onClick={() => setShowAll((v) => !v)}
                    className="rounded-full border border-white/10 bg-white/5 px-3 h-7 text-xs font-medium text-gray-300 hover:bg-white/10"
                  >
                    {showAll ? "Show less" : `View ${hidden} more`}
                  </button>
                </div>
              )}
            </>
          )}
        </section>

        {/* Footer note */}
        <div className={`px-6 py-4 ${divider}`}>
          <p className="text-xs text-gray-500">
            Admins have full access to events, users and payouts.
          </p>
        </div>
      </div>

      {/* Remove confirmation */}
      {removing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70" onClick={() => setRemoving(null)} aria-hidden="true" />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="remove-admin-title"
            className="relative w-full max-w-sm rounded-2xl border border-white/10 bg-[#1a1d27] p-6 shadow-2xl"
          >
            <h3 id="remove-admin-title" className="mb-2 text-[15px] font-semibold text-white">Remove admin access?</h3>
            <p className="mb-5 text-[13px] leading-relaxed text-gray-400">
              {removing.email} will immediately lose access to this admin panel.
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setRemoving(null)}
                className="rounded-lg border border-white/10 bg-white/5 px-3.5 h-9 text-[13px] font-semibold text-gray-200 hover:bg-white/10"
              >
                Cancel
              </button>
              <button
                onClick={() => handleRemove(removing)}
                className="rounded-lg bg-red-500/15 px-3.5 h-9 text-[13px] font-semibold text-red-300 hover:bg-red-500/25"
              >
                Remove access
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
