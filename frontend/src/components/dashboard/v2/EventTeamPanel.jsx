"use client";

import { forwardRef, useState } from "react";
import { toast } from "sonner";
import API from "@/services/api";

// Backend roles: "manager" runs the event, "checkin" works the door.
const ROLES = [
  { value: "manager", label: "Co-host" },
  { value: "checkin", label: "Door staff" },
];

const added = (iso) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "");

/**
 * The Team tab: invite co-hosts and door staff, change what they can do,
 * resend or cancel invites, and remove people. Owner only.
 * `emailRef` lets the page focus the email field from "Add co-host".
 */
const EventTeamPanel = forwardRef(function EventTeamPanel({ slug, ownerEmail, ownerName, cohosts = [], onChanged }, emailRef) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("manager");
  const [inviting, setInviting] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [confirmId, setConfirmId] = useState(null);

  const invite = async (e) => {
    e.preventDefault();
    if (!email.trim() || inviting) return;
    setInviting(true);
    try {
      const res = await API.addCohost(slug, email.trim(), role);
      toast.success("Invitation sent", { description: res?.message });
      setEmail("");
      onChanged();
    } catch (err) {
      toast.error("Couldn't send invite", { description: err?.message });
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
      toast.error("Couldn't update permissions", { description: err?.message });
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
      toast.error("Couldn't remove co-host", { description: err?.message });
    } finally {
      setBusyId(null);
    }
  };

  const resend = async (cohost) => {
    setBusyId(cohost.id);
    try {
      await API.resendCohostInvite(slug, cohost.id);
      toast.success("Invite sent again", { description: cohost.email });
    } catch (err) {
      toast.error("Couldn't resend invite", { description: err?.message });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="flex flex-wrap gap-6 p-5">
      <div className="flex min-w-0 flex-[3_1_420px] flex-col gap-3.5">
        <form onSubmit={invite} className="flex flex-wrap items-end gap-2">
          <label className="flex flex-[1_1_220px] flex-col gap-1.5">
            <span className="v-lbl">Add a co-host or door staff</span>
            <input
              ref={emailRef}
              className="v-input"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="name@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="flex flex-[0_1_160px] flex-col gap-1.5">
            <span className="v-lbl">Role</span>
            <select className="v-input" value={role} onChange={(e) => setRole(e.target.value)}>
              {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </label>
          <button type="submit" className="v-btn v-btn-p v-btn-lg" disabled={inviting || !email.trim()}>
            {inviting ? "Sending…" : "Send invite"}
          </button>
        </form>

        <ul className="m-0 flex list-none flex-col p-0">
          <li className="v-row v-al flex min-h-[60px] items-center gap-3 rounded-xl px-2" style={{ "--i": 0 }}>
            <span className="v-av">{(ownerName || ownerEmail || "Y")[0].toUpperCase()}</span>
            <span className="flex min-w-0 flex-grow flex-col">
              <span className="truncate text-[15px] font-extrabold">{ownerName || ownerEmail}</span>
              <span className="text-[13px] text-muted">You</span>
            </span>
            <span className="text-sm font-bold">Owner</span>
          </li>

          {cohosts.map((c, i) => {
            const pending = c.status === "pending";
            const busy = busyId === c.id;
            if (confirmId === c.id) {
              return (
                <li key={c.id} className="flex min-h-[60px] flex-wrap items-center gap-2 rounded-xl bg-danger-tint px-3 py-2">
                  <span className="min-w-0 flex-grow break-words text-sm font-bold text-danger">
                    {pending ? "Cancel the invite to" : "Remove"} {c.email}?
                  </span>
                  <button type="button" className="v-btn v-btn-danger v-btn-sm" onClick={() => remove(c)} disabled={busy}>
                    {pending ? "Cancel invite" : "Remove"}
                  </button>
                  <button type="button" className="v-btn v-btn-t v-btn-sm" onClick={() => setConfirmId(null)}>Keep</button>
                </li>
              );
            }
            const name = pending ? c.email : c.name || c.email;
            const meta = pending
              ? `Invite sent ${added(c.added_at)}`
              : [c.name && c.name !== c.email ? c.email : null, c.added_at ? `added ${added(c.added_at)}` : null].filter(Boolean).join(" · ");
            return (
              <li key={c.id} className="v-row v-al flex min-h-[60px] flex-wrap items-center gap-x-3 gap-y-1 rounded-xl px-2 py-1.5" style={{ "--i": i + 1 }}>
                <span className="v-av">{(name || "?")[0].toUpperCase()}</span>
                <span className="flex min-w-0 flex-[1_1_160px] flex-col">
                  <span className="truncate text-[15px] font-extrabold">{name}</span>
                  <span className="truncate text-[13px] text-muted">{meta}</span>
                </span>
                {pending && <span className="text-sm font-bold text-muted">Pending</span>}
                <label className="sr-only" htmlFor={`role-${c.id}`}>Role for {c.email}</label>
                <select
                  id={`role-${c.id}`}
                  value={c.role || "manager"}
                  onChange={(e) => changeRole(c, e.target.value)}
                  disabled={busy}
                  className="h-9 cursor-pointer rounded-lg border-0 bg-transparent pr-1 text-sm font-bold text-ink hover:bg-mist focus-visible:outline-2"
                >
                  {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
                {pending && (
                  <button type="button" className="v-btn v-btn-t v-btn-sm min-w-[70px]" onClick={() => resend(c)} disabled={busy}>Resend</button>
                )}
                <button type="button" className="v-btn v-btn-t v-btn-sm min-w-[70px] !text-muted" onClick={() => setConfirmId(c.id)} disabled={busy}>
                  {pending ? "Cancel" : "Remove"}
                </button>
              </li>
            );
          })}
        </ul>
        {cohosts.length === 0 && <p className="v-hint m-0 px-2">No co-hosts or door staff yet. Invite someone above.</p>}
      </div>

      <aside className="flex min-w-0 flex-[2_1_260px] flex-col gap-3.5 rounded-2xl bg-paper px-5 py-[18px] text-sm leading-normal text-body">
        <h3 className="m-0 text-[15px] text-ink">What each role can do</h3>
        <p className="m-0"><b className="text-ink">Co-host.</b> Edit the event, tickets and discounts, see the guest list and check people in. Doesn&apos;t see revenue and can&apos;t withdraw money.</p>
        <p className="m-0"><b className="text-ink">Door staff.</b> See the guest list and check people in on event day. Nothing else.</p>
        <p className="m-0"><b className="text-ink">Owner.</b> Everything, including payouts, emailing ticket holders and cancelling the event.</p>
      </aside>
    </div>
  );
});

export default EventTeamPanel;
