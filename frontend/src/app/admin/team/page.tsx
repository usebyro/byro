"use client";

import { useEffect, useState, useCallback } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { MailAdd01Icon, Delete02Icon, Alert02Icon } from "@hugeicons/core-free-icons";

interface AdminTeamMember {
  id: number;
  email: string;
  added_at: string;
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

export default function AdminTeamPage() {
  const [members, setMembers] = useState<AdminTeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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

  return (
    <div className="p-5 md:p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-white text-xl font-bold">Team</h1>
        <p className="text-gray-400 text-sm mt-1">People with access to this admin panel</p>
      </div>

      {/* Invite form */}
      <div className="bg-[#1a1d27] border border-white/10 rounded-xl p-6 mb-6">
        <h2 className="text-white font-semibold mb-1">Invite an admin</h2>
        <p className="text-gray-400 text-xs mb-4">
          They&apos;ll get full access to this admin panel — events, users, and payouts.
        </p>
        <form onSubmit={handleInvite} className="flex flex-col sm:flex-row gap-2">
          <input
            type="email"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            placeholder="name@usebyro.com"
            className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500/50"
          />
          <button
            type="submit"
            disabled={inviting || !inviteEmail.trim()}
            className="flex items-center justify-center gap-2 text-xs font-semibold text-blue-400 bg-blue-500/10 hover:bg-blue-500/20 disabled:opacity-50 px-4 py-2.5 rounded-lg transition-colors whitespace-nowrap"
          >
            <HugeiconsIcon icon={MailAdd01Icon} size={15} color="currentColor" />
            {inviting ? "Sending invite…" : "Send invite"}
          </button>
        </form>
        {inviteError && <p className="text-red-400 text-xs mt-2">{inviteError}</p>}
      </div>

      {/* Members list */}
      <div className="bg-[#1a1d27] border border-white/10 rounded-xl p-6">
        <div className="flex items-center gap-2 mb-5">
          <h2 className="text-white font-semibold">Admins</h2>
          <span className="text-xs bg-white/5 text-gray-400 px-2 py-0.5 rounded-full">
            {loading ? "—" : members.length}
          </span>
        </div>

        {removeError && <p className="text-red-400 text-xs mb-4">{removeError}</p>}

        {loading ? (
          <p className="text-gray-500 text-sm py-6 text-center">Loading...</p>
        ) : error ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <HugeiconsIcon icon={Alert02Icon} size={20} color="#f87171" />
            <p className="text-gray-400 text-sm">{error}</p>
            <button
              onClick={loadMembers}
              className="text-xs font-semibold text-gray-300 hover:text-white bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded-lg transition-colors"
            >
              Try again
            </button>
          </div>
        ) : members.length === 0 ? (
          <p className="text-gray-500 text-sm py-6 text-center">No admins added yet.</p>
        ) : (
          <div className="divide-y divide-white/5">
            {members.map((m) => (
              <div key={m.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="text-white text-sm font-medium truncate">{m.email}</p>
                  <p className="text-gray-500 text-xs mt-0.5">Added {formatDate(m.added_at)}</p>
                </div>
                <button
                  onClick={() => setRemoving(m)}
                  disabled={removingId === m.id}
                  aria-label={`Remove ${m.email}`}
                  className="shrink-0 flex items-center gap-1.5 text-xs font-semibold text-red-400 bg-red-500/10 hover:bg-red-500/20 disabled:opacity-50 px-3 py-1.5 rounded-lg transition-colors"
                >
                  <HugeiconsIcon icon={Delete02Icon} size={14} color="currentColor" />
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Remove confirmation modal */}
      {removing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70" onClick={() => setRemoving(null)} />
          <div className="relative w-full max-w-sm bg-[#1a1d27] border border-white/10 rounded-xl p-6 shadow-2xl">
            <h3 className="text-white font-semibold text-sm mb-2">Remove admin access?</h3>
            <p className="text-gray-400 text-xs leading-relaxed mb-5">
              {removing.email} will immediately lose access to this admin panel.
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
                Confirm remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
