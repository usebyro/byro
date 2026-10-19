"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import API from "@/services/api";
import SectionError from "@/components/dashboard/v2/SectionError";
import Delayed from "@/components/dashboard/v2/Delayed";

// What organisers can turn off. Payouts and events going on hold always reach them.
const BELL = [
  { kind: "ticket_sale", label: "Ticket sales", hint: "Who bought or claimed tickets, as it happens." },
  { kind: "milestone", label: "Sales milestones", hint: "When an event reaches 25, 50, 100 tickets and more." },
  { kind: "new_follower", label: "New followers", hint: "People who start following your community." },
  { kind: "cohost_joined", label: "Co-hosts joining", hint: "When someone you invited takes their co-host place." },
  { kind: "event_reminder", label: "Event reminders", hint: "A heads-up three days before each event." },
];
const EMAIL = [{ kind: "milestone_email", label: "Milestone emails", hint: "An email at 1, 10, 25 and 50 tickets, then every 100." }];

function Toggle({ on, label, hint, onChange, disabled }) {
  return (
    <div className="flex items-start gap-4 py-3.5">
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[15px] font-bold">{label}</span>
        <span className="v-hint">{hint}</span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        disabled={disabled}
        onClick={onChange}
        className={`relative mt-0.5 h-7 w-12 shrink-0 rounded-full border-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:opacity-60 motion-reduce:transition-none ${
          on ? "bg-brand" : "bg-[#CBD3DF]"
        }`}
      >
        <span
          aria-hidden="true"
          className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-[left] motion-reduce:transition-none ${on ? "left-6" : "left-1"}`}
        />
      </button>
    </div>
  );
}

export default function StudioSettings() {
  const [muted, setMuted] = useState(null);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setFailed(false);
    API.getNotificationSettings()
      .then((d) => setMuted(d.muted || []))
      .catch(() => setFailed(true));
  };

  useEffect(() => {
    document.title = "Settings | Byro";
    load();
  }, []);

  // Saves straight away; puts the switch back if the save fails.
  const flip = async (kind) => {
    const before = muted;
    const next = muted.includes(kind) ? muted.filter((k) => k !== kind) : [...muted, kind];
    setMuted(next);
    setSaving(true);
    try {
      const d = await API.updateNotificationSettings(next);
      setMuted(d.muted || next);
    } catch (err) {
      setMuted(before);
      toast.error("Couldn't save that setting", { description: err?.message || "Try again." });
    } finally {
      setSaving(false);
    }
  };

  const group = (title, sub, rows) => (
    <section aria-labelledby={`set-${title}`} className="v-card flex flex-col px-6 py-5">
      <h2 id={`set-${title}`} className="v-h2">{title}</h2>
      <p className="v-hint m-0 mt-1">{sub}</p>
      <div className="mt-2 flex flex-col divide-y divide-hairline">
        {rows.map((r) => (
          <Toggle key={r.kind} label={r.label} hint={r.hint} on={!muted.includes(r.kind)} disabled={saving} onChange={() => flip(r.kind)} />
        ))}
      </div>
    </section>
  );

  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-5 px-4 pb-12 pt-4 sm:px-[clamp(16px,3vw,40px)] md:pt-2">
      <div className="flex flex-col gap-1.5">
        <h1 className="v-h1">Settings</h1>
        <p className="v-sub">Choose what Byro tells you about.</p>
      </div>

      {failed ? (
        <section className="v-card">
          <SectionError what="your settings" onRetry={load} />
        </section>
      ) : muted === null ? (
        <Delayed onRetry={load}>
          <div className="v-skel h-[340px] !rounded-[20px]" />
        </Delayed>
      ) : (
        <>
          {group("Notifications", "In the bell at the top of your dashboard.", BELL)}
          {group("Emails", "Sent to your account email.", EMAIL)}
          <p className="v-hint m-0">Payouts and events put on hold always reach you, so you never miss anything about your money.</p>
        </>
      )}
    </div>
  );
}
