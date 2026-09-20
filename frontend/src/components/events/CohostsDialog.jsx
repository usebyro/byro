"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { HugeiconsIcon } from "@hugeicons/react";
import { Cancel01Icon, Link01Icon } from "@hugeicons/core-free-icons";
import API from "@/services/api";
import Avatar from "@/components/ui/Avatar";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

export const COHOST_ROLES = [
  { value: "manager", label: "Manager", hint: "Can edit the event, tickets and discounts, see the guest list and check people in." },
  { value: "checkin", label: "Check-in only", hint: "Can see the guest list and check people in. Nothing else." },
];
const roleLabel = (value) => COHOST_ROLES.find((r) => r.value === value)?.label || "Manager";

const VISIBLE_AT_FIRST = 4;

function Chevron() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

/**
 * Manage who helps run an event. Owner only.
 * Layout after a "members" dialog: title and one-line description, dashed dividers
 * between sections, an invite row, compact rows with a permission menu, and a
 * quiet footer with one primary action.
 */
export default function CohostsDialog({ open, onClose, slug, ownerEmail, cohosts = [], onChanged }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("manager");
  const [inviting, setInviting] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [confirmId, setConfirmId] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const emailRef = useRef(null);

  // Escape closes, the page behind stops scrolling, and focus starts on the email field.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    emailRef.current?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  const invite = async (e) => {
    e.preventDefault();
    if (!email.trim() || inviting) return;
    setInviting(true);
    try {
      const res = await API.addCohost(slug, email.trim(), role);
      toast.success(res?.message || "Invitation sent");
      setEmail("");
      onChanged();
    } catch (err) {
      toast.error(err?.message || "Couldn't send that invite.");
    } finally {
      setInviting(false);
    }
  };

  const changeRole = async (cohost, next) => {
    if (next === (cohost.role || "manager")) return;
    setBusyId(cohost.id);
    try {
      await API.updateCohost(slug, cohost.id, next);
      toast.success("Permissions updated");
      onChanged();
    } catch (err) {
      toast.error(err?.message || "Couldn't update permissions.");
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (cohost) => {
    setBusyId(cohost.id);
    try {
      await API.removeCohost(slug, cohost.id);
      toast.success(cohost.status === "pending" ? "Invite cancelled" : "Co-host removed");
      setConfirmId(null);
      onChanged();
    } catch (err) {
      toast.error(err?.message || "Couldn't remove that co-host.");
    } finally {
      setBusyId(null);
    }
  };

  const copyEventLink = () => {
    navigator.clipboard
      .writeText(`${window.location.origin}/discover/${slug}`)
      .then(() => toast.success("Link copied!"))
      .catch(() => toast.error("Couldn't copy the link."));
  };

  const shown = showAll ? cohosts : cohosts.slice(0, VISIBLE_AT_FIRST);
  const hidden = cohosts.length - shown.length;
  const selectedHint = COHOST_ROLES.find((r) => r.value === role)?.hint;

  return (
    <div className="fixed inset-0 z-[60] flex items-end md:items-center justify-center md:p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="cohosts-title"
        className="relative w-full md:max-w-[460px] max-h-[92vh] overflow-y-auto rounded-t-2xl md:rounded-2xl bg-white border border-gray-200 shadow-xl"
      >
        {/* Title */}
        <div className="flex items-start justify-between gap-4 px-5 pt-5 pb-4">
          <div>
            <h2 id="cohosts-title" className="text-[15px] font-semibold text-gray-900">Co-hosts</h2>
            <p className="text-[13px] text-gray-500 mt-0.5">Manage who can help run this event.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1.5 -mt-1.5 w-10 h-10 md:w-8 md:h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4F6EF7]"
          >
            <HugeiconsIcon icon={Cancel01Icon} size={16} color="currentColor" />
          </button>
        </div>

        {/* Invite */}
        <section className="px-5 py-4 border-t border-dashed border-gray-200">
          <h3 className="text-[13px] font-semibold text-gray-900">Invite to co-host</h3>
          <p className="text-[13px] text-gray-500 mt-0.5">Add people by email. They don&apos;t need a Byro account yet.</p>

          <form onSubmit={invite} className="mt-3 flex items-center gap-2">
            <div className="flex-1 min-w-0 flex items-center rounded-lg border border-gray-300 bg-white focus-within:border-[#4F6EF7] focus-within:ring-2 focus-within:ring-[#4F6EF7]/25">
              <label htmlFor="cohost-email" className="sr-only">Email address</label>
              <input
                id="cohost-email"
                ref={emailRef}
                type="email"
                inputMode="email"
                autoCapitalize="none"
                autoCorrect="off"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email address"
                className="flex-1 min-w-0 bg-transparent px-3 h-10 md:h-9 text-base md:text-[13px] text-gray-900 placeholder:text-gray-400 focus:outline-none"
              />
              <label htmlFor="cohost-role" className="sr-only">Permission</label>
              <select
                id="cohost-role"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="shrink-0 bg-transparent border-l border-gray-200 pl-2 pr-1 h-10 md:h-9 text-base md:text-[13px] text-gray-600 focus:outline-none"
              >
                {COHOST_ROLES.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              disabled={inviting || !email.trim()}
              className="shrink-0 h-10 md:h-9 px-3.5 rounded-lg border border-gray-300 bg-white text-[13px] font-semibold text-gray-800 hover:bg-gray-50 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4F6EF7]"
            >
              {inviting ? "Sending…" : "Send invite"}
            </button>
          </form>
          <p className="mt-2 text-xs text-gray-500">{selectedHint}</p>
        </section>

        {/* Who has access */}
        <section className="px-5 py-4 border-t border-dashed border-gray-200">
          <h3 className="text-[13px] font-semibold text-gray-900">Who has access</h3>

          <ul className="mt-3 space-y-1.5">
            {ownerEmail && (
              <li className="flex items-center gap-3 rounded-lg bg-gray-50 px-3 py-2">
                <Avatar name={ownerEmail} className="w-6 h-6 rounded-full text-[10px]" />
                <span className="flex-1 min-w-0 truncate text-[13px] text-gray-800">{ownerEmail}</span>
                <span className="shrink-0 text-[13px] text-gray-500">Owner</span>
              </li>
            )}

            {shown.map((c) => {
              const pending = c.status === "pending";
              const current = c.role || "manager";

              if (confirmId === c.id) {
                return (
                  <li key={c.id} className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2">
                    <span className="flex-1 min-w-0 truncate text-[13px] text-red-800">
                      {pending ? "Cancel the invite to" : "Remove"} {c.email}?
                    </span>
                    <button
                      type="button"
                      onClick={() => remove(c)}
                      disabled={busyId === c.id}
                      className="shrink-0 rounded-md bg-red-600 px-2.5 h-8 text-[13px] font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                    >
                      {pending ? "Cancel invite" : "Remove"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmId(null)}
                      className="shrink-0 rounded-md px-2.5 h-8 text-[13px] font-medium text-gray-600 hover:bg-white"
                    >
                      Keep
                    </button>
                  </li>
                );
              }

              return (
                <li key={c.id} className="flex items-center gap-3 rounded-lg bg-gray-50 px-3 py-1.5 min-h-[40px]">
                  <Avatar name={c.email} className="w-6 h-6 rounded-full text-[10px]" />
                  <span className="flex-1 min-w-0 truncate text-[13px] text-gray-800">{c.email}</span>
                  {pending && (
                    <span className="shrink-0 rounded-full bg-amber-50 border border-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                      Invited
                    </span>
                  )}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        disabled={busyId === c.id}
                        aria-label={`Permissions for ${c.email}`}
                        className="shrink-0 inline-flex items-center gap-1 rounded-md px-1.5 h-8 text-[13px] text-gray-600 hover:text-gray-900 hover:bg-white disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4F6EF7]"
                      >
                        {roleLabel(current)}
                        <Chevron />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="z-[70] w-56">
                      {COHOST_ROLES.map((r) => (
                        <DropdownMenuItem key={r.value} onSelect={() => changeRole(c, r.value)}>
                          <span className="flex-1">
                            <span className="block">{r.label}</span>
                            <span className="block text-xs text-gray-500 leading-snug">{r.hint}</span>
                          </span>
                          {current === r.value && <span aria-hidden="true">✓</span>}
                        </DropdownMenuItem>
                      ))}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem variant="destructive" onSelect={() => setConfirmId(c.id)}>
                        {pending ? "Cancel invite" : "Remove access"}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </li>
              );
            })}
          </ul>

          {cohosts.length === 0 && (
            <p className="mt-2 text-[13px] text-gray-500">No co-hosts yet. Invite someone above.</p>
          )}

          {hidden > 0 && (
            <div className="mt-2.5 flex justify-center">
              <button
                type="button"
                onClick={() => setShowAll(true)}
                className="rounded-full border border-gray-200 bg-white px-3 h-7 text-xs font-medium text-gray-600 shadow-sm hover:bg-gray-50"
              >
                View {hidden} more
              </button>
            </div>
          )}
          {showAll && cohosts.length > VISIBLE_AT_FIRST && (
            <div className="mt-2.5 flex justify-center">
              <button
                type="button"
                onClick={() => setShowAll(false)}
                className="rounded-full border border-gray-200 bg-white px-3 h-7 text-xs font-medium text-gray-600 shadow-sm hover:bg-gray-50"
              >
                Show less
              </button>
            </div>
          )}
        </section>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-t border-dashed border-gray-200">
          <button
            type="button"
            onClick={copyEventLink}
            className="inline-flex items-center gap-1.5 h-10 md:h-9 px-3 rounded-lg border border-gray-300 bg-white text-[13px] font-medium text-gray-700 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4F6EF7]"
          >
            <HugeiconsIcon icon={Link01Icon} size={14} color="currentColor" />
            Copy event link
          </button>
          <button
            type="button"
            onClick={onClose}
            className="h-10 md:h-9 px-5 rounded-lg bg-[#4F6EF7] text-[13px] font-semibold text-white hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#4F6EF7]"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
