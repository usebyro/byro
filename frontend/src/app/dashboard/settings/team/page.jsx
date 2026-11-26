"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import API from "@/services/api";
import SectionError from "@/components/dashboard/v2/SectionError";
import Delayed from "@/components/dashboard/v2/Delayed";

const ROLE_OPTIONS = [
  { value: "manager", label: "Co-host", hint: "Runs events with you." },
  { value: "checkin", label: "Door staff", hint: "Check-in only." },
];

const initials = (name) =>
  (name || "?").split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("") || "?";

function RoleChoice({ value, onChange, disabled }) {
  return (
    <div role="radiogroup" aria-label="Role" className="s-ropts s-ivr">
      {ROLE_OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          disabled={disabled}
          onClick={() => onChange(o.value)}
          className="s-ropt"
        >
          <span className="s-rad" />
          <span className="flex flex-col gap-px">
            <b>{o.label}</b>
            <span className="v-hint">{o.hint}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

// A dialog that sits over the page: Escape or a tap outside closes it; the first field gets focus.
function Dialog({ labelId, onClose, children }) {
  const box = useRef(null);
  useEffect(() => {
    const before = document.activeElement;
    box.current?.querySelector("input, button[role=radio][aria-checked=true], button")?.focus();
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      before?.focus?.();
    };
  }, [onClose]);
  return (
    <div className="s-owrap">
      <button type="button" aria-label="Close" tabIndex={-1} className="v-scrim" onClick={onClose} style={{ position: "absolute", inset: 0, border: 0, background: "rgba(20,22,28,.28)" }} />
      <section ref={box} role="dialog" aria-modal="true" aria-labelledby={labelId} className="v-pop s-ivd">
        {children}
      </section>
    </div>
  );
}

export default function TeamSettings() {
  const [team, setTeam] = useState(null);
  const [failed, setFailed] = useState(false);
  const [invite, setInvite] = useState(null); // { email, role, error }
  const [sending, setSending] = useState(false);
  const [managing, setManaging] = useState(null); // member id
  const [busy, setBusy] = useState(false);

  const load = () => {
    setFailed(false);
    API.getTeam().then(setTeam).catch(() => setFailed(true));
  };
  useEffect(() => {
    document.title = "Settings | Byro";
    load();
  }, []);

  const send = async (e) => {
    e.preventDefault();
    setSending(true);
    try {
      const body = await API.inviteTeamMember(invite.email.trim(), invite.role);
      setTeam(body);
      setInvite(null);
      toast.success("Invite sent");
    } catch (err) {
      setInvite((i) => ({ ...i, error: err?.message || "Couldn’t send the invite. Try again." }));
    } finally {
      setSending(false);
    }
  };

  const member = team?.members.find((m) => m.id === managing);

  const setRole = async (role) => {
    if (!member || role === member.role) return;
    setBusy(true);
    try {
      setTeam(await API.updateTeamMember(member.id, role));
      toast.success("Saved");
    } catch (err) {
      toast.error("Couldn’t change the role", { description: err?.message || "Try again." });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      setTeam(await API.removeTeamMember(member.id));
      setManaging(null);
      toast.success(`${member.name} removed from your team`);
    } catch (err) {
      toast.error("Couldn’t remove them", { description: err?.message || "Try again." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {failed ? (
        <section className="v-card"><SectionError what="your team" onRetry={load} /></section>
      ) : team === null ? (
        <Delayed onRetry={load}><div className="v-skel h-[300px] !rounded-[20px]" /></Delayed>
      ) : (
        <>
          <section aria-labelledby="tm-t" className="v-card v-bf" style={{ padding: "8px 24px 12px", "--i": 1 }}>
            <div className="s-nrow s-nhead">
              <h2 id="tm-t" className="v-h2" style={{ fontSize: 17, flex: 1 }}>Team</h2>
              <button type="button" className="v-btn v-btn-p v-btn-sm" onClick={() => setInvite({ email: "", role: "manager", error: "" })}>
                Invite someone
              </button>
            </div>
            <div className="s-trow">
              <span className="s-avt" aria-hidden="true">{initials(team.owner.name)}</span>
              <span className="s-tnm"><b>{team.owner.name}</b><span className="v-hint">{team.owner.email}</span></span>
              <span className="s-deftag">Owner</span>
            </div>
            {team.members.map((m) => (
              <button
                key={m.id}
                type="button"
                className="s-trow s-tbtn"
                onClick={() => setManaging(m.id)}
                aria-label={`Manage ${m.name}, ${m.role_label}${m.pending ? ", invited" : ""}`}
              >
                <span className="s-avt" aria-hidden="true">{initials(m.name)}</span>
                <span className="s-tnm"><b>{m.name}</b><span className="v-hint">{m.email}</span></span>
                <span className="s-trl">{m.role_label}{m.pending ? " · Invited" : ""}</span>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8A91A0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
              </button>
            ))}
          </section>

          <section aria-labelledby="rl-t" className="v-card v-bf" style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 12, "--i": 2 }}>
            <h2 id="rl-t" className="v-h2" style={{ fontSize: 17 }}>What each role can do</h2>
            <dl className="s-roles">
              {team.roles.map((r) => (
                <div key={r.role}><dt>{r.label}</dt><dd className="v-hint">{r.can}</dd></div>
              ))}
            </dl>
          </section>
        </>
      )}

      {invite && (
        <Dialog labelId="iv-t" onClose={() => setInvite(null)}>
          <form className="contents" onSubmit={send}>
            <h2 id="iv-t" className="v-h2" style={{ fontSize: 20 }}>Invite someone</h2>
            <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span className="v-lbl">Email</span>
              <input
                className="v-input"
                type="email"
                required
                placeholder="name@example.com"
                value={invite.email}
                onChange={(e) => setInvite({ ...invite, email: e.target.value, error: "" })}
              />
            </label>
            <RoleChoice value={invite.role} onChange={(role) => setInvite({ ...invite, role })} />
            <span className="v-hint">They get an email with a link to join.</span>
            {invite.error && <span className="s-error" role="alert">{invite.error}</span>}
            <div className="s-ivb">
              <button type="button" className="v-btn v-btn-s v-btn-lg" onClick={() => setInvite(null)}>Cancel</button>
              <button type="submit" className="v-btn v-btn-p v-btn-lg" disabled={sending || !invite.email.trim()}>
                {sending ? "Sending…" : "Send invite"}
              </button>
            </div>
          </form>
        </Dialog>
      )}

      {member && (
        <Dialog labelId="mg-t" onClose={() => setManaging(null)}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span className="s-avt" aria-hidden="true" style={{ width: 44, height: 44, fontSize: 16 }}>{initials(member.name)}</span>
            <span className="s-tnm"><h2 id="mg-t" className="v-h2" style={{ fontSize: 20 }}>{member.name}</h2><span className="v-hint">{member.email}</span></span>
          </div>
          <RoleChoice value={member.role} onChange={setRole} disabled={busy} />
          <div className="s-ivb">
            <button type="button" className="v-btn v-btn-s v-btn-lg" style={{ color: "#B42318" }} onClick={remove} disabled={busy}>Remove from team</button>
            <button type="button" className="v-btn v-btn-p v-btn-lg" onClick={() => setManaging(null)}>Done</button>
          </div>
        </Dialog>
      )}
    </>
  );
}
