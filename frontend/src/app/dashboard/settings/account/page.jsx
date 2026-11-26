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

const FIELD = "h-11 w-full rounded-xl border border-[#D5DBE5] bg-white px-3.5 text-[15px] text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand";
const BTN = "inline-flex h-10 items-center justify-center rounded-full px-5 text-[14px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:opacity-50 motion-reduce:transition-none";

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
  const card = (title, children, id) => (
    <section aria-labelledby={id} className="v-card flex flex-col px-6 py-5">
      <h2 id={id} className="v-h2">{title}</h2>
      {children}
    </section>
  );

  return (
    <>
      <p className="v-sub -mt-2">Your sign-in details and where your times are shown.</p>
      {failed ? (
        <section className="v-card"><SectionError what="your account" onRetry={load} /></section>
      ) : account === null ? (
        <Delayed onRetry={load}><div className="v-skel h-[420px] !rounded-[20px]" /></Delayed>
      ) : (
        <>
          {card("You", (
            <div className="mt-3 flex flex-col gap-5">
              <form onSubmit={saveName} className="flex flex-col gap-1.5">
                <label htmlFor="acct-name" className="text-[15px] font-bold">Your name</label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input id="acct-name" className={FIELD} value={name} maxLength={100} onChange={(e) => setName(e.target.value)} autoComplete="name" />
                  <button type="submit" className={`${BTN} shrink-0 bg-brand text-white hover:bg-brand-dark`} disabled={savingName || !name.trim() || name.trim() === account.name}>
                    {savingName ? "Saving…" : "Save"}
                  </button>
                </div>
                <span className="v-hint">Shown to co-hosts and door staff. Your community name is set on <a className="font-bold text-brand-dark underline" href="/dashboard/profile">Profile</a>.</span>
              </form>

              <div className="flex flex-col gap-1.5">
                <span className="text-[15px] font-bold">Sign-in email</span>
                <span className="text-[15px]" data-testid="acct-email">{account.email}</span>
                <span className="v-hint">
                  To change it, email <a className="font-bold text-brand-dark underline" href="mailto:support@usebyro.com">support@usebyro.com</a> from this address. We check it’s you, then send a confirmation link to the new one.
                </span>
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="acct-zone" className="text-[15px] font-bold">Time zone</label>
                <select id="acct-zone" className={FIELD} value={account.timezone} onChange={(e) => saveZone(e.target.value)}>
                  {ZONES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
                <span className="v-hint">Used for event times in your dashboard and for 8 AM summary emails.</span>
              </div>
            </div>
          ), "acct-you")}

          {card("Signed in", (
            <div className="mt-2 flex flex-col">
              {sessions === null ? (
                <div className="v-skel mt-2 h-[88px] !rounded-[14px]" />
              ) : sessionsFailed ? (
                <div className="py-2"><SectionError what="your devices" onRetry={loadSessions} /></div>
              ) : (
                <>
                  <ul className="m-0 flex list-none flex-col divide-y divide-hairline p-0">
                    {sessions.map((s) => (
                      <li key={s.id} className="flex items-center gap-3 py-3.5">
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="text-[15px] font-bold">{s.name}</span>
                          <span className="v-hint">{s.current ? "Active now" : `Signed in ${when(s.last_active)}`.trim()}</span>
                        </span>
                        {s.current ? (
                          <span className="rounded-full bg-[#EAEEF5] px-3 py-1 text-[12px] font-bold text-[#5B6272]">This device</span>
                        ) : (
                          <button type="button" className={`${BTN} border border-[#D5DBE5] bg-white text-ink hover:bg-[#F7F9FC]`} onClick={() => signOutOne(s)}>
                            Sign out
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                  {others.length > 0 && (
                    <button type="button" className={`${BTN} mt-3 self-start border border-[#D5DBE5] bg-white text-ink hover:bg-[#F7F9FC]`} onClick={signOutOthers}>
                      Sign out everywhere else
                    </button>
                  )}
                </>
              )}
            </div>
          ), "acct-signed-in")}

          {card("Delete account", (
            <div className="mt-2 flex flex-col items-start gap-3">
              <p className="v-hint m-0">You can only delete your account when you have no upcoming events and nothing left to withdraw.</p>
              <button type="button" className={`${BTN} bg-[#D92D20] text-white hover:bg-[#B42318]`} onClick={deleteAccount}>
                Delete account
              </button>
            </div>
          ), "acct-delete")}
        </>
      )}
    </>
  );
}
