"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import API from "@/services/api";
import SectionError from "@/components/dashboard/v2/SectionError";
import Delayed from "@/components/dashboard/v2/Delayed";
import Toggle from "@/components/dashboard/settings/Toggle";
import ChoiceGroup from "@/components/dashboard/settings/ChoiceGroup";

const SALE_OPTIONS = [
  { value: "every", label: "Every sale", hint: "An email the moment someone buys or claims.", isDefault: true },
  { value: "daily", label: "Daily summary", hint: "One email at 8 AM, only on days with sales." },
  { value: "off", label: "Off", hint: "No sale emails. Sales still show in the app." },
];
const MERCH_OPTIONS = [
  { value: "every", label: "Every order", hint: "An email the moment someone pays.", isDefault: true },
  { value: "daily", label: "Daily summary", hint: "One email at 8 AM, only on days with orders." },
  { value: "off", label: "Off", hint: "No order emails. Orders still show in the app." },
];

// Each switch is a notification kind the person can turn off; Byro picks is the Byro newsletter.
const HOSTING = [
  { kind: "milestone_email", label: "Milestones", hint: "When an event reaches 1, 10, 25 and 50 tickets, then every 100." },
  { kind: "event_reminder_email", label: "Event reminders", hint: "The day before your event, with your check-in link." },
];
const ATTENDING = [
  { kind: "ticket_reminder_email", label: "Ticket reminders", hint: "The day before and on the day of events you’re going to." },
  { kind: "new_event_email", label: "New events", hint: "From communities you follow." },
  { key: "byro_picks", label: "Byro picks", hint: "Events worth going to, once a week." },
];

export default function NotificationSettings() {
  const [prefs, setPrefs] = useState(null);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setFailed(false);
    API.getNotificationSettings()
      .then(setPrefs)
      .catch(() => setFailed(true));
  };

  useEffect(() => {
    document.title = "Settings | Byro";
    load();
  }, []);

  // Saves straight away; puts things back if the save fails.
  const save = async (changes, optimistic) => {
    const before = prefs;
    setPrefs({ ...prefs, ...optimistic });
    setSaving(true);
    try {
      setPrefs(await API.updateNotificationSettings(changes));
      toast.success("Saved");
    } catch (err) {
      setPrefs(before);
      toast.error("Couldn't save that setting", { description: err?.message || "Try again." });
    } finally {
      setSaving(false);
    }
  };

  const flipKind = (kind) => {
    const muted = prefs.muted.includes(kind) ? prefs.muted.filter((k) => k !== kind) : [...prefs.muted, kind];
    return save({ muted }, { muted });
  };
  const flipPicks = () => save({ byro_picks: !prefs.byro_picks }, { byro_picks: !prefs.byro_picks });

  const card = (title, children) => (
    <section aria-labelledby={`set-${title}`} className="v-card flex flex-col px-6 py-5">
      <h2 id={`set-${title}`} className="v-h2">{title}</h2>
      <div className="mt-2 flex flex-col divide-y divide-hairline">{children}</div>
    </section>
  );

  const row = (r) => {
    const on = r.key === "byro_picks" ? prefs.byro_picks : !prefs.muted.includes(r.kind);
    return (
      <Toggle
        key={r.kind || r.key}
        label={r.label}
        hint={r.hint}
        on={on}
        disabled={saving}
        onChange={() => (r.key === "byro_picks" ? flipPicks() : flipKind(r.kind))}
      />
    );
  };

  return (
    <>
      <p className="v-sub -mt-2">Everything also shows in your notification bell. Choose what else reaches you.</p>

      {failed ? (
        <section className="v-card">
          <SectionError what="your settings" onRetry={load} />
        </section>
      ) : prefs === null ? (
        <Delayed onRetry={load}>
          <div className="v-skel h-[420px] !rounded-[20px]" />
        </Delayed>
      ) : (
        <>
          {card("Ticket sales", (
            <ChoiceGroup
              label="Ticket sale emails"
              hint="Daily summaries arrive at 8 AM Lagos time (WAT)."
              options={SALE_OPTIONS}
              value={prefs.sale_email}
              disabled={saving}
              onChange={(v) => save({ sale_email: v }, { sale_email: v })}
            />
          ))}
          {card("Merch orders", (
            <ChoiceGroup
              label="Merch order emails"
              hint="Problems reported by buyers, and orders about to be cancelled, always email you."
              options={MERCH_OPTIONS}
              value={prefs.merch_email}
              disabled={saving}
              onChange={(v) => save({ merch_email: v }, { merch_email: v })}
            />
          ))}
          {card("Hosting emails", HOSTING.map(row))}
          {card("Emails when you attend", ATTENDING.map(row))}
          <p className="v-hint m-0">Tickets, receipts, payouts, refunds and sign-in codes always come by email, so they’re not listed here.</p>
        </>
      )}
    </>
  );
}
