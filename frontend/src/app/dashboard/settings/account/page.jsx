"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useDispatch } from "react-redux";
import { toast } from "sonner";
import API from "@/services/api";
import { signOut } from "@/redux/auth/authSlice";
import { useConfirm } from "@/components/admin/ui";
import SectionError from "@/components/dashboard/v2/SectionError";
import Delayed from "@/components/dashboard/v2/Delayed";

const ZONES = [
  ["Africa/Lagos", "Lagos (WAT, UTC+1)"],
  ["Africa/Accra", "Accra (GMT)"],
  ["Africa/Nairobi", "Nairobi (EAT, UTC+3)"],
  ["Europe/London", "London (GMT/BST)"],
];


function when(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export default function AccountSettings() {
  const router = useRouter();
  const dispatch = useDispatch();
  const confirm = useConfirm();
  const [account, setAccount] = useState(null);
  const [name, setName] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [sessions, setSessions] = useState(null);
  const [sessionsFailed, setSessionsFailed] = useState(false);
  const [failed, setFailed] = useState(false);

  const load = () => {
    setFailed(false);
    API.getAccount()
      .then((a) => { setAccount(a); setName(a.name || ""); })
      .catch(() => setFailed(true));
    loadSessions();
  };
  const loadSessions = () => {
    setSessionsFailed(false);
    API.getSessions().then((d) => setSessions(d.sessions)).catch(() => { setSessions([]); setSessionsFailed(true); });
  };

  useEffect(() => {
    document.title = "Settings | Byro";
    load();
  }, []);

  const saveName = async (e) => {
    e.preventDefault();
    setSavingName(true);
    try {
      const a = await API.updateAccount({ name });
      setAccount(a);
      setName(a.name);
      toast.success("Saved");
    } catch (err) {
      toast.error("Couldn't save your name", { description: err?.message || "Try again." });
    } finally {
      setSavingName(false);
    }
  };

  const saveZone = async (timezone) => {
    const before = account;
    setAccount({ ...account, timezone });
    try {
      setAccount(await API.updateAccount({ timezone }));
      toast.success("Saved");
    } catch (err) {
      setAccount(before);
      toast.error("Couldn't save your time zone", { description: err?.message || "Try again." });
    }
  };

  const signOutOne = async (s) => {
    try {
      await API.signOutSession(s.id);
      setSessions((list) => list.filter((x) => x.id !== s.id));
      toast.success(`Signed out of ${s.name}`);
    } catch (err) {
      toast.error("Couldn't sign that device out", { description: err?.message || "Try again." });
    }
  };

  const signOutOthers = async () => {
    try {
      await API.signOutOtherSessions();
      setSessions((list) => list.filter((x) => x.current));
      toast.success("Signed out everywhere else");
    } catch (err) {
      toast.error("Couldn't sign out your other devices", { description: err?.message || "Try again." });
    }
  };

  const deleteAccount = async () => {
    let blockers = [];
    try {
      blockers = (await API.getDeleteBlockers()).blockers || [];
    } catch (err) {
      toast.error("Couldn't check your account", { description: err?.message || "Try again." });
      return;
    }
    if (blockers.length) {
      await confirm({
        title: "You can’t delete your account yet",
        body: (
          <ul className="m-0 list-disc pl-5">
            {blockers.map((b) => <li key={b}>{b}</li>)}
          </ul>
        ),
        confirmLabel: "OK",
        cancelLabel: "Close",
      });
      return;
    }
    const typed = await confirm({
      title: "Delete your account?",
      body: "Your name, photo, followers and community page are removed and you can’t sign in again. Tickets and payments stay in Byro’s records. You can’t undo this.",
      confirmLabel: "Delete account",
      tone: "danger",
      input: { label: "Type your email address to confirm", placeholder: account.email, required: true },
    });
    if (typeof typed !== "string" || !typed.trim()) return;
    try {
      await API.deleteAccount(typed.trim());
      dispatch(signOut());
      router.push("/");
    } catch (err) {
      toast.error("Couldn't delete your account", { description: err?.message || "Try again." });
    }
  };

  const others = (sessions || []).filter((s) => !s.current);
  const saveIfChanged = () => {
    if (name.trim() && name.trim() !== account.name) saveName({ preventDefault() {} });
  };

  return (
    <>
      {failed ? (
        <section className="v-card"><SectionError what="your account" onRetry={load} /></section>
      ) : account === null ? (
        <Delayed onRetry={load}><div className="v-skel h-[420px] !rounded-[20px]" /></Delayed>
      ) : (
        <>
          <section aria-labelledby="ac-t" className="v-card v-bf" style={{ padding: "8px 24px 20px", "--i": 1 }}>
            <div className="s-nrow s-nhead"><h2 id="ac-t" className="v-h2" style={{ fontSize: 17 }}>You</h2></div>

            <form className="s-frow" onSubmit={saveName}>
              <label className="s-fl" htmlFor="nm">Your name</label>
              <div className="s-fv">
                <input
                  id="nm"
                  className="v-input"
                  value={name}
                  maxLength={100}
                  autoComplete="name"
                  onChange={(e) => setName(e.target.value)}
                  onBlur={saveIfChanged}
                />
                <span className="v-hint">Shown to co-hosts and door staff. Your community name is set on <a className="font-bold text-brand-dark underline" href="/dashboard/profile">Profile</a>.</span>
              </div>
            </form>

            <div className="s-frow">
              <span className="s-fl">Sign-in email</span>
              <div className="s-fv">
                <div className="s-fixed"><span data-testid="acct-email" style={{ flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>{account.email}</span></div>
                <span className="v-hint">
                  To change it, email <a className="font-bold text-brand-dark underline" href="mailto:support@usebyro.com">support@usebyro.com</a> from your current address and tell us the new one. We’ll check it’s you, then send a confirmation link to the new address. Nothing changes until you confirm.
                </span>
              </div>
            </div>

            <div className="s-frow">
              <label className="s-fl" htmlFor="tz">Time zone</label>
              <div className="s-fv">
                <div className="s-selw">
                  <select id="tz" className="v-input" value={account.timezone} onChange={(e) => saveZone(e.target.value)}>
                    {ZONES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
                <span className="v-hint">Used for event times in your dashboard and for 8 AM summary emails.</span>
              </div>
            </div>
          </section>

          <section aria-labelledby="dv-t" className="v-card v-bf" style={{ padding: "8px 24px 12px", "--i": 2 }}>
            <div className="s-nrow s-nhead">
              <h2 id="dv-t" className="v-h2" style={{ fontSize: 17, flex: 1 }}>Signed in</h2>
              {others.length > 0 && <button type="button" className="v-btn v-btn-s v-btn-sm" onClick={signOutOthers}>Sign out everywhere else</button>}
            </div>
            {sessions === null ? (
              <div className="v-skel mb-2 h-[64px] !rounded-[14px]" />
            ) : sessionsFailed ? (
              <div className="pb-2"><SectionError what="your devices" onRetry={loadSessions} /></div>
            ) : (
              sessions.map((s) => (
                <div key={s.id} className="s-nrow">
                  <span className="s-nlab">
                    <b>{s.name}</b>
                    <span className="v-hint">{s.current ? "Active now" : `Signed in ${when(s.last_active)}`.trim()}</span>
                  </span>
                  {s.current ? (
                    <span className="s-deftag">This device</span>
                  ) : (
                    <button type="button" className="v-btn v-btn-s v-btn-sm" onClick={() => signOutOne(s)}>Sign out</button>
                  )}
                </div>
              ))
            )}
          </section>

          <section aria-labelledby="dl-t" className="v-card v-bf" style={{ padding: "20px 24px", "--i": 3 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
              <span style={{ flex: "1 1 280px", display: "flex", flexDirection: "column", gap: 2 }}>
                <h2 id="dl-t" className="v-h2" style={{ fontSize: 17 }}>Delete account</h2>
                <span className="v-hint">You can only delete your account when you have no upcoming events and nothing left to withdraw.</span>
              </span>
              <button type="button" className="v-btn v-btn-s" style={{ color: "#B42318" }} onClick={deleteAccount}>Delete account</button>
            </div>
          </section>
        </>
      )}
    </>
  );
}
