"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import API from "@/services/api";
import { useConfirm } from "@/components/admin/ui";
import EventImage from "@/components/brand/EventImage";
import SectionError from "@/components/dashboard/v2/SectionError";
import BusyButton, { useButtonResult } from "@/components/dashboard/v2/BusyButton";
import { dayParts, formatTime } from "@/lib/eventFormat";

const KINDS = [
  { id: "announce", title: "Announcement", sub: "New events and news. People can unsubscribe." },
  { id: "update", title: "Event update", sub: "Venue or time changes. Goes to ticket holders." },
];

// Where each kind of message starts: blank, so the organiser writes it in their own words.
const BLANK = { subject: "", body: "" };

// {{name}} becomes each person's first name when the email is sent.
const NAME_TAG = "{{name}}";
const SAMPLE_NAME = "Ada";
const withSample = (text) => text.replace(/\{\{\s*name\s*\}\}/gi, SAMPLE_NAME);

// Arrow keys move the selection through a radio group, as native radios do.
function radioKeys(count, index, select) {
  return (e) => {
    const next = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
    if (!next) return;
    e.preventDefault();
    const to = (index + next + count) % count;
    select(to);
    const radios = e.currentTarget.parentElement.querySelectorAll('[role="radio"]');
    radios[to]?.focus();
  };
}

const n = (v) => (v == null ? "—" : Number(v).toLocaleString());
const people = (count) => `${n(count)} ${count === 1 ? "person" : "people"}`;

// Value for a datetime-local input, in the organiser's own time zone.
const toLocalInput = (d) => {
  const pad = (x) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const whenLabel = (iso) =>
  new Date(iso).toLocaleString("en-NG", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

const KIND_LABEL = { announce: "Announcement", update: "Event update" };
const AUDIENCE_LABEL = { followers: "All followers", members: "Members", regulars: "Regulars" };

// A menu of who the message goes to, with the number of people each choice reaches.
function AudiencePicker({ audiences, active, onPick }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef(null);
  const trigger = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (!wrap.current?.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    wrap.current?.querySelector('[role="option"][aria-selected="true"]')?.focus();
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const moveFocus = (e) => {
    const options = [...wrap.current.querySelectorAll('[role="option"]')];
    const i = options.indexOf(document.activeElement);
    const to = { ArrowDown: i + 1, ArrowUp: i - 1, Home: 0, End: options.length - 1 }[e.key];
    if (e.key === "Tab") return setOpen(false);
    if (to === undefined) return;
    e.preventDefault();
    options[Math.min(options.length - 1, Math.max(0, to))]?.focus();
  };

  return (
    <div ref={wrap} className="relative">
      <button
        ref={trigger}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Send to: ${active?.label}, ${people(active?.count)}`}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && !open) {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className="v-input flex !h-[52px] cursor-pointer items-center gap-2.5 text-left"
      >
        <span className="min-w-0 flex-1 truncate font-bold">{active?.label}</span>
        <span className="v-tab shrink-0 whitespace-nowrap rounded-full bg-[#EEF3FF] px-2.5 py-[3px] text-[13px] font-extrabold text-brand-dark">
          {people(active?.count)}
        </span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5B6272" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={`shrink-0 transition-transform duration-150 motion-reduce:transition-none ${open ? "rotate-180" : ""}`}>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div
          role="listbox"
          aria-label="Audience"
          onKeyDown={moveFocus}
          className="v-card v-pop absolute left-0 right-0 top-[calc(100%+6px)] z-20 !origin-top p-1.5 !shadow-[0_18px_40px_-16px_rgba(20,22,28,.3)]"
        >
          {audiences.map((a) => {
            const on = active?.id === a.id;
            return (
              <button
                key={a.id}
                type="button"
                role="option"
                aria-selected={on}
                tabIndex={-1}
                onClick={() => {
                  onPick(a.id);
                  setOpen(false);
                  trigger.current?.focus();
                }}
                className={`v-row flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2.5 text-left text-ink focus:bg-paper focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand ${on ? "!bg-[#F5F8FF]" : ""}`}
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-extrabold">{a.label}</span>
                  <span className="v-hint">{a.sub}</span>
                </span>
                <span className="v-tab shrink-0 text-sm font-extrabold">{n(a.count)}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// The on/off switch from the design: a pill track with a white knob.
function Switch({ on, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={`flex h-7 w-12 shrink-0 cursor-pointer rounded-full p-[3px] transition-colors duration-200 ${on ? "bg-brand" : "bg-[#C9D0DC]"}`}
    >
      <span
        className={`h-[22px] w-[22px] rounded-full bg-white shadow-[0_1px_3px_rgba(20,22,28,.25)] transition-transform duration-200 ease-out motion-reduce:transition-none ${on ? "translate-x-5" : "translate-x-0"}`}
      />
    </button>
  );
}

// Where a message in the Sent list stands: scheduled (with Cancel), going out, or delivered.
function SentStatus({ m, onCancel }) {
  if (m.status === "scheduled") {
    return (
      <span className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 max-md:justify-start">
        <span className="v-status text-brand-dark">
          <span className="v-dot v-ping bg-brand" />
          Scheduled
        </span>
        <button type="button" onClick={() => onCancel(m)} className="v-btn v-btn-t v-btn-sm">
          Cancel
        </button>
      </span>
    );
  }
  if (m.status === "cancelled") return <span className="v-status text-muted"><span className="v-dot bg-[#C9D0DC]" />Cancelled</span>;
  if (m.status === "sending") return <span className="v-status text-muted"><span className="v-dot v-ping bg-brand" />Sending…</span>;
  if (m.status === "failed") return <span className="v-status text-[#B42318]"><span className="v-dot bg-[#B42318]" />Failed</span>;
  return (
    <span className="flex flex-col items-end gap-0.5 max-md:items-start">
      <span className="v-status"><span className="v-dot bg-[#2F9E6E]" />Sent</span>
      {m.failed > 0 && <span className="text-[13px] font-semibold text-[#B42318]">{n(m.failed)} didn’t arrive</span>}
    </span>
  );
}

export default function MessagesPage() {
  const confirm = useConfirm();
  const [data, setData] = useState(null);
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [sending, setSending] = useState(false);
  const [testing, setTesting] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleAt, setScheduleAt] = useState("");
  const [scheduling, setScheduling] = useState(false);
  // "Now" for checking the chosen time; refreshed when the picker opens or changes.
  const [now, setNow] = useState(0);

  const [kind, setKind] = useState("announce");
  const [audience, setAudience] = useState("followers");
  const [eventSlug, setEventSlug] = useState("");
  const [subject, setSubject] = useState(BLANK.subject);
  const [body, setBody] = useState(BLANK.body);
  const [attach, setAttach] = useState(false);
  const [attachSlug, setAttachSlug] = useState("");
  const bodyRef = useRef(null);

  useEffect(() => {
    document.title = "Messages | Byro";
  }, []);

  // Links from Overview and Community open with the audience picked: ?event=<slug> or ?audience=regulars.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const ev = q.get("event");
    const aud = q.get("audience");
    /* eslint-disable react-hooks/set-state-in-effect -- read the link once on open */
    if (ev) {
      setKind("update");
      setEventSlug(ev);
    } else if (["followers", "members", "regulars"].includes(aud)) {
      setAudience(aud);
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const load = useCallback(() => API.getMessages().then(setData).catch(() => {}), []);

  const loadAll = useCallback(() => {
    setLoading(true);
    return Promise.allSettled([API.getMessages(), API.getDashboard()])
      .then(([m, d]) => {
        setData(m.status === "fulfilled" ? m.value : null);
        setDashboard(d.status === "fulfilled" ? d.value : null);
        setLoadFailed(m.status === "rejected" || d.status === "rejected");
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // While a message is going out, check back until it has finished.
  const goingOut = Boolean(data?.sent?.some((m) => m.status === "sending"));
  useEffect(() => {
    if (!goingOut) return;
    const id = setInterval(load, 4000);
    return () => clearInterval(id);
  }, [goingOut, load]);

  // Events with their photo, date and venue, for the event card in the preview.
  const events = useMemo(() => {
    const up = dashboard?.hosting?.upcoming || [];
    const past = dashboard?.hosting?.past || [];
    return [...up, ...past].filter((e) => e.slug && e.is_active !== false && !e.is_draft);
  }, [dashboard]);

  const isAnnounce = kind === "announce";
  const holderEvents = data?.events || [];
  const chosenHolder = holderEvents.find((e) => e.slug === eventSlug) || holderEvents[0] || null;

  const audiences = isAnnounce
    ? [
        { id: "followers", label: "All followers", sub: "Everyone who follows you", count: data?.audiences?.followers },
        { id: "members", label: "Members", sub: "Followers who came to at least one event", count: data?.audiences?.members },
        { id: "regulars", label: "Regulars", sub: "Followers who came to 3 or more events", count: data?.audiences?.regulars },
      ]
    : holderEvents.map((e) => ({
        id: e.slug,
        label: `${e.name} ticket holders`,
        sub: dayParts(e.day).short,
        count: e.holders,
      }));

  const activeAudience = isAnnounce
    ? audiences.find((a) => a.id === audience) || audiences[0]
    : audiences.find((a) => a.id === chosenHolder?.slug) || null;

  // The card in the email: the event being updated, or the one picked for an announcement.
  const attachEvent = isAnnounce
    ? events.find((e) => e.slug === attachSlug) || events[0] || null
    : events.find((e) => e.slug === chosenHolder?.slug) || null;
  const showCard = isAnnounce ? attach : true;

  const pickKind = (id) => {
    setKind(id);
    setSubject(BLANK.subject);
    setBody(BLANK.body);
    if (id === "update") setAttach(false);
  };

  const draftDirty = subject.trim() !== "" || body.trim() !== "";
  useEffect(() => {
    if (!draftDirty) return;
    const guard = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [draftDirty]);

  const left = data?.announcements_left ?? 0;
  const hasDraft = Boolean(subject.trim() && body.trim());
  const canSend = Boolean(!data?.blocked && hasDraft && activeAudience && (activeAudience.count ?? 0) > 0 && (!isAnnounce || left > 0));

  const payload = (extra = {}) => ({
    kind,
    audience: isAnnounce ? activeAudience?.id : "event",
    event: isAnnounce ? (attach ? attachEvent?.slug : undefined) : activeAudience?.id,
    attach_event: showCard,
    subject: subject.trim(),
    body: body.trim(),
    ...extra,
  });

  // Put {{name}} where the cursor is, so the organiser can greet people by first name if they want to.
  const insertName = () => {
    const el = bodyRef.current;
    const start = el?.selectionStart ?? body.length;
    const end = el?.selectionEnd ?? body.length;
    setBody(body.slice(0, start) + NAME_TAG + body.slice(end));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + NAME_TAG.length, start + NAME_TAG.length);
    });
  };

  const [testResult, flashTest] = useButtonResult();
  const [sendResult, flashSend] = useButtonResult();

  const sendTest = async () => {
    setTesting(true);
    try {
      const res = await API.sendMessage(payload({ test: true }));
      toast.success("Test sent", { description: res.sent_to });
      flashTest("done");
    } catch (err) {
      flashTest("failed");
      toast.error("Couldn’t send test", { description: err?.message || "Try again." });
    } finally {
      setTesting(false);
    }
  };

  const send = async () => {
    const count = activeAudience?.count ?? 0;
    const ok = await confirm({
      title: `Send “${subject.trim()}” to ${people(count)}?`,
      body: "Emails go out right away. You can’t unsend them.",
      confirmLabel: `Send to ${people(count)}`,
    });
    if (!ok) return;
    setSending(true);
    try {
      await API.sendMessage(payload());
      toast.success(`Sending to ${people(count)}`, { description: "It can take a few minutes to reach everyone." });
      setSubject(BLANK.subject);
      setBody(BLANK.body);
      setAttach(false);
      flashSend("done");
      await load();
    } catch (err) {
      flashSend("failed");
      toast.error("Couldn’t send message", { description: err?.message || "Try again." });
    } finally {
      setSending(false);
    }
  };

  const openSchedule = () => {
    setNow(Date.now());
    if (!scheduleAt) {
      // Default: tomorrow at 10:00.
      const d = new Date();
      d.setDate(d.getDate() + 1);
      d.setHours(10, 0, 0, 0);
      setScheduleAt(toLocalInput(d));
    }
    setScheduleOpen((v) => !v);
  };

  const scheduleError = (() => {
    if (!scheduleAt) return "Pick a date and time.";
    const t = new Date(scheduleAt).getTime();
    if (Number.isNaN(t)) return "Pick a date and time.";
    if (t < now + 5 * 60 * 1000) return "Pick a time at least 5 minutes from now.";
    if (t > now + 30 * 24 * 60 * 60 * 1000) return "You can schedule up to 30 days ahead.";
    return "";
  })();

  const schedule = async () => {
    if (scheduleError) return;
    const iso = new Date(scheduleAt).toISOString();
    setScheduling(true);
    try {
      await API.sendMessage(payload({ scheduled_for: iso }));
      toast.success("Message scheduled", { description: whenLabel(iso) });
      setSubject(BLANK.subject);
      setBody(BLANK.body);
      setAttach(false);
      setScheduleOpen(false);
      setScheduleAt("");
      await load();
    } catch (err) {
      toast.error("Couldn’t schedule message", { description: err?.message || "Try again." });
    } finally {
      setScheduling(false);
    }
  };

  const cancelScheduled = async (m) => {
    const ok = await confirm({
      title: `Cancel “${m.subject}”?`,
      body: "It won’t be sent.",
      confirmLabel: "Cancel message",
      cancelLabel: "Keep it",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await API.cancelScheduledMessage(m.id);
      toast.success("Message cancelled");
      await load();
    } catch (err) {
      toast.error("Couldn’t cancel message", { description: err?.message || "Try again." });
    }
  };

  const brand = dashboard?.profile?.display_name || "Your community";
  const avatar = dashboard?.profile?.avatar_url;
  const footer = isAnnounce
    ? `You get this because you follow ${brand} on byro. Unfollow.`
    : "You get this because you have a ticket for this event.";

  const footNote = isAnnounce
    ? left > 0
      ? `${left} of ${data?.announcements_per_week ?? 2} announcements left this week`
      : "You’ve used both announcements for the last 7 days. Each one frees up 7 days after it was sent. Event updates still go out."
    : "Event updates always reach ticket holders";

  const eventLine = (e) =>
    [dayParts(e.day).short, e.time_from ? formatTime(e.time_from) : "", e.location || ""].filter(Boolean).join(" · ");

  return (
    <div className="mx-auto flex w-full max-w-[1240px] flex-col gap-5 px-4 pb-12 pt-2 sm:px-[clamp(16px,3vw,40px)] md:gap-6">
      <div className="v-bf flex flex-col gap-1.5" style={{ "--i": 0 }}>
        <h1 className="v-h1">Messages</h1>
        <p className="v-sub">Email the people in your community. Replies come to your inbox.</p>
      </div>

      {data?.blocked && (
        <div role="alert" className="rounded-2xl border border-[#F3C7C2] bg-[#FDECEA] px-4 py-3 text-sm text-[#7A1A12]">
          <b>Messaging is turned off for your account.</b> You can&apos;t send or schedule messages right now. Email{" "}
          <a href="mailto:support@usebyro.com" className="font-bold underline">support@usebyro.com</a> if you think this is a mistake.
        </div>
      )}

      <div className="flex flex-wrap items-start gap-5 md:gap-6">
        <section
          aria-label="Write a message"
          className="v-card v-bf flex min-w-0 flex-[3_1_460px] flex-col gap-5 p-5 sm:p-6"
          style={{ "--i": 1 }}
        >
          <div className="flex flex-col gap-2.5">
            <span className="v-lbl" id="kind-label">What are you sending?</span>
            <div role="radiogroup" aria-labelledby="kind-label" className="grid grid-cols-[repeat(auto-fit,minmax(min(200px,100%),1fr))] gap-2.5">
              {KINDS.map((k, i) => {
                const on = kind === k.id;
                return (
                  <button
                    key={k.id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    tabIndex={on ? 0 : -1}
                    onClick={() => pickKind(k.id)}
                    onKeyDown={radioKeys(KINDS.length, i, (to) => pickKind(KINDS[to].id))}
                    className={`v-press flex cursor-pointer flex-col gap-1 rounded-2xl px-4 py-3.5 text-left text-ink transition-[background-color,border-color] duration-200 ${
                      on ? "border-2 border-brand bg-[#F5F8FF]" : "border-[1.5px] border-line bg-white"
                    }`}
                  >
                    <span className="text-[15px] font-extrabold">{k.title}</span>
                    <span className="v-hint">{k.sub}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <span className="v-lbl">Send to</span>
            {loading ? (
              <div className="v-skel h-[52px]" />
            ) : loadFailed ? (
              <SectionError what="who you can message" onRetry={loadAll} className="rounded-xl bg-paper" />
            ) : audiences.length === 0 ? (
              <p className="v-hint rounded-xl bg-paper px-4 py-4">
                No one to send an event update to yet. Ticket holders show up here once an event has sales.
              </p>
            ) : (
              <AudiencePicker
                audiences={audiences}
                active={activeAudience}
                onPick={(id) => (isAnnounce ? setAudience(id) : setEventSlug(id))}
              />
            )}
          </div>

          <label className="flex flex-col gap-2">
            <span className="v-lbl">Subject</span>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              name="subject"
              autoComplete="off"
              maxLength={120}
              placeholder={isAnnounce ? "What’s new…" : "What changed…"}
              className="v-input font-semibold"
            />
          </label>

          <div className="flex flex-col gap-2">
            <label className="flex flex-col gap-2">
              <span className="v-lbl">Message</span>
              <textarea
                ref={bodyRef}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                name="body"
                autoComplete="off"
                rows={7}
                maxLength={5000}
                placeholder="Write your message…"
                className="v-input font-medium"
              />
            </label>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <button type="button" onClick={insertName} className="v-btn v-btn-s v-btn-sm">
                Add first name
              </button>
              <span className="v-hint">
                Adds <code className="rounded bg-mist px-1 py-0.5 text-[12px] text-ink">{NAME_TAG}</code>, which becomes each person’s first name. Optional.
              </span>
            </div>
          </div>

          {isAnnounce && events.length > 0 && (
            <div className="flex flex-col gap-3 rounded-[14px] bg-paper px-4 py-3.5">
              <div className="flex items-center gap-3.5">
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-sm font-extrabold">Attach event card</span>
                  <span className="v-hint">{attachEvent ? `${attachEvent.name}, with a Get tickets button` : "Pick an event"}</span>
                </span>
                <Switch on={attach} onChange={setAttach} label="Attach event card" />
              </div>
              {attach && events.length > 1 && (
                <select
                  aria-label="Event to attach"
                  value={attachEvent?.slug || ""}
                  onChange={(e) => setAttachSlug(e.target.value)}
                  className="v-input max-w-sm font-semibold"
                >
                  {events.map((e) => (
                    <option key={e.slug} value={e.slug}>
                      {e.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2.5">
            <span className="v-hint flex-[1_1_200px]">{footNote}</span>
            <BusyButton
              type="button"
              onClick={sendTest}
              busy={testing}
              result={testResult}
              busyLabel="Sending test"
              doneLabel="Test sent"
              disabled={sending || !hasDraft || (!isAnnounce && !activeAudience)}
              className="v-btn v-btn-t"
            >
              Send me a test
            </BusyButton>
            <button
              type="button"
              onClick={openSchedule}
              aria-expanded={scheduleOpen}
              aria-controls="schedule-panel"
              disabled={!canSend || sending || scheduling}
              className={`v-btn v-btn-s v-btn-lg ${scheduleOpen ? "!border-brand !bg-[#F5F8FF] text-brand-dark" : ""}`}
            >
              Schedule
            </button>
            <BusyButton
              type="button"
              onClick={send}
              busy={sending}
              result={sendResult}
              busyLabel="Sending"
              doneLabel="Sent"
              disabled={!canSend}
              className="v-btn v-btn-p v-btn-lg"
            >
              {activeAudience ? `Send to ${n(activeAudience.count)}` : "Send"}
            </BusyButton>
          </div>

          {scheduleOpen && canSend && (
            <div id="schedule-panel" className="v-bf flex flex-col gap-3 rounded-[14px] bg-paper p-4">
              <label className="flex flex-col gap-2">
                <span className="v-lbl">Send on</span>
                <input
                  type="datetime-local"
                  name="scheduled_for"
                  value={scheduleAt}
                  min={toLocalInput(new Date(now + 5 * 60 * 1000))}
                  onChange={(e) => {
                    setNow(Date.now());
                    setScheduleAt(e.target.value);
                  }}
                  aria-invalid={Boolean(scheduleError)}
                  aria-describedby="schedule-hint"
                  className="v-input max-w-xs font-semibold"
                />
              </label>
              <p id="schedule-hint" className={`v-hint m-0 ${scheduleError ? "!text-[#B42318]" : ""}`}>
                {scheduleError || `Goes out ${whenLabel(scheduleAt)}, your time. Anyone who unfollows before then won’t get it.`}
              </p>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={schedule} disabled={Boolean(scheduleError) || scheduling} className="v-btn v-btn-p">
                  {scheduling ? "Scheduling…" : "Schedule message"}
                </button>
                <button type="button" onClick={() => setScheduleOpen(false)} className="v-btn v-btn-t">
                  Not now
                </button>
              </div>
            </div>
          )}
        </section>

        <section aria-label="Email preview" className="v-bf flex min-w-0 flex-[2_1_340px] flex-col gap-3" style={{ "--i": 2 }}>
          <span className="v-eyebrow">Preview</span>
          <div className="v-card overflow-hidden shadow-[0_24px_50px_-28px_rgba(20,22,28,.35)]">
            <div className="flex items-center gap-3 border-b border-hairline px-5 py-4">
              <span className="v-d flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-[10px] bg-ink font-bold text-white">
                {avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatar} alt="" className="h-full w-full object-cover" />
                ) : (
                  brand.charAt(0).toUpperCase()
                )}
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-extrabold">
                  {brand} <span className="font-semibold text-muted">via byro</span>
                </span>
                <span className={`break-words text-[15px] font-extrabold ${subject.trim() ? "text-ink" : "text-faint"}`}>
                  {withSample(subject).trim() || "Subject"}
                </span>
              </span>
            </div>
            <div className="flex flex-col gap-4 p-5">
              <p className={`m-0 whitespace-pre-line break-words text-[15px] leading-[1.6] ${body.trim() ? "text-body" : "text-faint"}`}>
                {body.trim() ? withSample(body) : "Your message will show here."}
              </p>
              {showCard && attachEvent && (
                <div className="v-bf overflow-hidden rounded-2xl bg-[#F6F8FB]">
                  <div className="relative h-[140px] bg-mist">
                    <EventImage event={attachEvent} sizes="(max-width: 768px) 100vw, 480px" />
                  </div>
                  <div className="flex items-center gap-3 px-4 py-3.5">
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-[15px] font-extrabold">{attachEvent.name}</span>
                      <span className="v-hint truncate">{eventLine(attachEvent)}</span>
                    </span>
                    <span className="v-btn v-btn-p v-btn-sm pointer-events-none" aria-hidden="true">Get tickets</span>
                  </div>
                </div>
              )}
              <p className="v-hint m-0 !text-[12px]">{footer}</p>
            </div>
          </div>
        </section>
      </div>

      <section aria-label="Sent messages" className="v-card v-bf overflow-hidden" style={{ "--i": 3 }}>
        <div className="px-5 py-[18px]">
          <h2 className="v-h2">Sent and scheduled</h2>
        </div>
        {loading ? (
          <div className="flex flex-col gap-3 px-5 pb-5">
            {[0, 1, 2].map((i) => (
              <div key={i} className="v-skel h-12" />
            ))}
          </div>
        ) : loadFailed && !data ? (
          <SectionError what="your messages" onRetry={loadAll} className="border-t border-hairline" />
        ) : data?.sent?.length ? (
          <div className="overflow-x-auto">
            <table className="v-stack w-full min-w-[520px] border-collapse">
              <thead>
                <tr className="border-y border-hairline">
                  <th scope="col" className="v-th px-5 py-3 text-left">Message</th>
                  <th scope="col" className="v-th px-3 py-3 text-right">Sent to</th>
                  <th scope="col" className="v-th py-3 pl-3 pr-5 text-right">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.sent.map((m, i) => (
                  <tr key={m.id} className="v-row v-al border-b border-hairline last:border-b-0" style={{ "--i": Math.min(i, 10) }}>
                    <td className="min-w-0 max-w-0 px-5 py-3.5 max-md:max-w-none">
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate text-[15px] font-extrabold">{m.subject}</span>
                        <span className="truncate text-[13px] text-muted">
                          {KIND_LABEL[m.kind]} ·{" "}
                          {m.status === "scheduled" || m.status === "cancelled"
                            ? whenLabel(m.scheduled_for)
                            : new Date(m.sent_at || m.created_at).toLocaleDateString("en-NG", { day: "numeric", month: "short" })}{" "}
                          ·{" "}
                          {m.audience === "event" ? `${m.event_name || "Event"} ticket holders` : AUDIENCE_LABEL[m.audience]}
                        </span>
                      </span>
                    </td>
                    <td data-l="Sent to" className="v-tab w-28 whitespace-nowrap px-3 py-3.5 text-right text-sm font-bold">
                      {m.status === "sent" ? n(m.sent) : n(m.recipients)}
                    </td>
                    <td data-l="Status" className="w-44 py-3.5 pl-3 pr-5 text-right">
                      <SentStatus m={m} onCancel={cancelScheduled} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="v-hint m-0 border-t border-hairline px-5 py-8 !text-[15px]">
            Nothing sent yet. Messages you send or schedule will show up here.
          </p>
        )}
      </section>
    </div>
  );
}
