"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import API from "@/services/api";
import EventImage from "@/components/brand/EventImage";
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

  const count = (c) => `${n(c)} ${c === 1 ? "person" : "people"}`;

  return (
    <div ref={wrap} className="relative">
      <button
        ref={trigger}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Send to: ${active?.label}, ${count(active?.count)}`}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && !open) {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className="flex h-12 w-full items-center gap-2.5 rounded-xl border border-[#CBD3DF] bg-white pl-4 pr-3.5 text-left text-ink transition-[background-color,scale] hover:bg-paper active:scale-[0.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        <span className="min-w-0 flex-1 truncate text-[15px] font-bold">{active?.label}</span>
        <span className="shrink-0 text-sm text-muted">{count(active?.count)}</span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5B6272" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true" className={`shrink-0 transition-transform duration-150 motion-reduce:transition-none ${open ? "rotate-180" : ""}`}>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div
          role="listbox"
          aria-label="Audience"
          onKeyDown={moveFocus}
          className="absolute left-0 right-0 top-[calc(100%+6px)] z-20 origin-top animate-menu-in rounded-xl border border-line bg-white p-1.5 shadow-[0_12px_32px_rgba(20,22,28,0.12)] motion-reduce:animate-none"
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
                className={`flex min-h-[52px] w-full items-center gap-3 rounded-lg px-3 text-left text-ink transition-colors hover:bg-paper focus:bg-paper focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand ${on ? "bg-paper" : ""}`}
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[15px] font-bold">{a.label}</span>
                  <span className="text-[13px] text-muted">{a.sub}</span>
                </span>
                <span className="shrink-0 text-sm font-bold text-muted">{n(a.count)}</span>
                <span className={`flex w-4 shrink-0 text-brand-dark ${on ? "opacity-100" : "opacity-0"}`} aria-hidden="true">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12l5 5 9-10" />
                  </svg>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function MessagesPage() {
  const [data, setData] = useState(null);
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
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

  const load = useCallback(() => API.getMessages().then(setData).catch(() => {}), []);

  useEffect(() => {
    Promise.allSettled([API.getMessages(), API.getDashboard()])
      .then(([m, d]) => {
        setData(m.status === "fulfilled" ? m.value : null);
        setDashboard(d.status === "fulfilled" ? d.value : null);
      })
      .finally(() => setLoading(false));
  }, []);

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
  const canSend = Boolean(hasDraft && activeAudience && (activeAudience.count ?? 0) > 0 && (!isAnnounce || left > 0));

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

  const sendTest = async () => {
    setTesting(true);
    try {
      const res = await API.sendMessage(payload({ test: true }));
      toast.success("Test sent", { description: res.sent_to });
    } catch (err) {
      toast.error("Couldn’t send test", { description: err?.message || "Try again." });
    } finally {
      setTesting(false);
    }
  };

  const send = async () => {
    const count = activeAudience?.count ?? 0;
    if (!window.confirm(`Send “${subject.trim()}” to ${people(count)}?\n\nThis can’t be undone.`)) return;
    setSending(true);
    try {
      await API.sendMessage(payload());
      toast.success("Message queued", { description: `Going to ${people(count)}` });
      setSubject(BLANK.subject);
      setBody(BLANK.body);
      setAttach(false);
      await load();
    } catch (err) {
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
    if (!window.confirm(`Cancel “${m.subject}”? It won’t be sent.`)) return;
    try {
      await API.cancelScheduledMessage(m.id);
      toast.success("Message cancelled");
      await load();
    } catch (err) {
      toast.error("Couldn’t cancel message", { description: err?.message || "Try again." });
    }
  };

  const brand = dashboard?.profile?.display_name || "Your community";
  const footer = isAnnounce
    ? `You get this because you follow ${brand} on byro. Unfollow.`
    : "You get this because you have a ticket for this event.";

  const footNote = isAnnounce
    ? left > 0
      ? `${left} of ${data?.announcements_per_week ?? 2} announcements left this week`
      : "You’ve used this week’s announcements. Event updates still go out."
    : "Event updates always reach ticket holders";

  const label = "text-sm font-bold text-[#3B4252]";
  const field =
    "w-full rounded-xl border-[1.5px] border-[#CBD3DF] bg-white px-3.5 text-[15px] text-ink focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/25";

  return (
    <div className="flex flex-col gap-7 px-4 pb-12 pt-8 tabular-nums md:px-8 lg:px-12">
      <div>
        <h1 className="font-display text-[28px] font-bold leading-tight tracking-[-0.03em] text-ink md:text-[32px]">Messages</h1>
        <p className="mt-1.5 text-[15px] text-muted">Email the people in your community. Replies come to your inbox.</p>
      </div>

      <div className="flex flex-col gap-8 lg:flex-row lg:items-start">
        <section aria-label="New message" className="flex min-w-0 flex-1 flex-col gap-[22px]">
          <div className="flex flex-col gap-2">
            <span className={label}>What are you sending?</span>
            <div role="radiogroup" aria-label="Message type" className="grid gap-2.5 sm:grid-cols-2">
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
                    className={`flex flex-col gap-0.5 rounded-xl px-4 py-3.5 text-left text-ink transition-[scale] active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
                      on ? "border-2 border-brand bg-[#EEF3FF]" : "border-[1.5px] border-[#CBD3DF] bg-white"
                    }`}
                  >
                    <span className="text-[15px] font-extrabold">{k.title}</span>
                    <span className="text-[13px] text-muted">{k.sub}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <span className={label}>Send to</span>
            {loading ? (
              <div className="h-12 animate-pulse rounded-xl bg-mist" />
            ) : audiences.length === 0 ? (
              <p className="rounded-xl border border-line px-4 py-4 text-sm text-muted">
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

          <label className={`flex flex-col gap-2 ${label}`}>
            Subject
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              name="subject"
              autoComplete="off"
              maxLength={120}
              placeholder={isAnnounce ? "What’s new…" : "What changed…"}
              className={`${field} h-[50px] font-semibold`}
            />
          </label>

          <label className={`flex flex-col gap-2 ${label}`}>
            Message
            <textarea
              ref={bodyRef}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              name="body"
              autoComplete="off"
              rows={6}
              maxLength={5000}
              placeholder="Write your message…"
              className={`${field} resize-none py-3 font-medium leading-[1.55]`}
            />
          </label>
          <div className="-mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <button
              type="button"
              onClick={insertName}
              className="h-8 rounded-full border border-line bg-white px-3 text-[13px] font-bold text-ink transition-[background-color,scale] hover:bg-paper active:scale-[0.97] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              Add first name
            </button>
            <span className="text-[13px] text-muted">
              Adds <code className="rounded bg-mist px-1 py-0.5 text-[12px] text-ink">{NAME_TAG}</code>, which becomes each person’s first name. Optional.
            </span>
          </div>

          {isAnnounce && events.length > 0 && (
            <div className="flex flex-col gap-3">
              <button
                type="button"
                role="switch"
                aria-checked={attach}
                onClick={() => setAttach((v) => !v)}
                className="flex items-center gap-3 text-left text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                <span aria-hidden="true" className={`flex h-6 w-10 shrink-0 rounded-full p-[3px] transition-colors motion-reduce:transition-none ${attach ? "bg-brand" : "bg-[#C9D0DC]"}`}>
                  <span className={`h-[18px] w-[18px] rounded-full bg-white transition-transform duration-150 ease-out motion-reduce:transition-none ${attach ? "translate-x-4" : "translate-x-0"}`} />
                </span>
                <span className="flex flex-col">
                  <span className="text-[15px] font-bold">Attach event card</span>
                  <span className="text-[13px] text-muted">{attachEvent ? `${attachEvent.name}, with a Get tickets button` : "Pick an event"}</span>
                </span>
              </button>
              {attach && events.length > 1 && (
                <select
                  aria-label="Event to attach"
                  value={attachEvent?.slug || ""}
                  onChange={(e) => setAttachSlug(e.target.value)}
                  className={`${field} h-11 max-w-sm font-semibold`}
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

          <div className="flex flex-wrap items-center gap-2.5 border-t border-hairline pt-4">
            <span className="min-w-0 flex-1 text-[13px] text-muted">{footNote}</span>
            <button
              type="button"
              onClick={sendTest}
              disabled={testing || sending || !hasDraft || (!isAnnounce && !activeAudience)}
              className="h-11 rounded-full border border-line bg-white px-5 text-[15px] font-bold text-ink transition-[background-color,scale] hover:bg-paper active:scale-[0.97] disabled:cursor-not-allowed disabled:border-0 disabled:bg-hairline disabled:text-muted disabled:active:scale-100"
            >
              {testing ? "Sending test…" : "Send me a test"}
            </button>
            <button
              type="button"
              onClick={openSchedule}
              aria-expanded={scheduleOpen}
              aria-controls="schedule-panel"
              disabled={!canSend || sending || scheduling}
              className={`h-11 rounded-full border px-5 text-[15px] font-bold transition-[background-color,scale] active:scale-[0.97] disabled:cursor-not-allowed disabled:border-0 disabled:bg-hairline disabled:text-muted disabled:active:scale-100 ${
                scheduleOpen ? "border-brand bg-[#EEF3FF] text-brand-dark" : "border-line bg-white text-ink hover:bg-paper"
              }`}
            >
              Schedule
            </button>
            <button
              type="button"
              onClick={send}
              disabled={!canSend || sending}
              className="h-11 rounded-full bg-brand px-5 text-[15px] font-bold text-white transition-[background-color,scale] hover:bg-brand-dark active:scale-[0.97] disabled:cursor-not-allowed disabled:bg-hairline disabled:text-muted disabled:active:scale-100"
            >
              {sending ? "Sending…" : activeAudience ? `Send to ${n(activeAudience.count)}` : "Send"}
            </button>
          </div>

          {scheduleOpen && canSend && (
            <div id="schedule-panel" className="flex flex-col gap-3 rounded-xl border border-line bg-paper p-4">
              <label className="flex flex-col gap-2 text-sm font-bold text-[#3B4252]">
                Send on
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
                  className="h-11 w-full max-w-xs rounded-xl border-[1.5px] border-[#CBD3DF] bg-white px-3.5 text-[15px] font-semibold text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25"
                />
              </label>
              <p id="schedule-hint" className={`text-[13px] ${scheduleError ? "text-red-600" : "text-muted"}`}>
                {scheduleError || `Goes out ${whenLabel(scheduleAt)}, your time. Anyone who unfollows before then won’t get it.`}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={schedule}
                  disabled={Boolean(scheduleError) || scheduling}
                  className="h-10 rounded-full bg-brand px-4 text-sm font-bold text-white transition-[background-color,scale] hover:bg-brand-dark active:scale-[0.97] disabled:cursor-not-allowed disabled:bg-hairline disabled:text-muted"
                >
                  {scheduling ? "Scheduling…" : "Schedule message"}
                </button>
                <button
                  type="button"
                  onClick={() => setScheduleOpen(false)}
                  className="h-10 rounded-full px-4 text-sm font-bold text-muted transition-colors hover:bg-white hover:text-ink"
                >
                  Not now
                </button>
              </div>
            </div>
          )}
        </section>

        <aside aria-label="Email preview" className="flex w-full shrink-0 flex-col gap-2.5 lg:w-[420px]">
          <span className="text-sm font-bold text-muted">Preview</span>
          <div className="rounded-[20px] bg-mist p-4">
            <div className="overflow-hidden rounded-xl bg-white">
              <div className="flex flex-col gap-0.5 border-b border-hairline px-[18px] py-3.5">
                <span className="text-[13px] text-muted">
                  <b className="text-ink">{brand}</b> via byro
                </span>
                <span className={`text-[15px] font-extrabold ${subject.trim() ? "text-ink" : "text-faint"}`}>{withSample(subject).trim() || "Subject"}</span>
              </div>
              <div className="flex flex-col gap-3.5 p-[18px]">
                <p className={`m-0 whitespace-pre-line break-words text-sm leading-[1.6] ${body.trim() ? "text-[#3B4252]" : "text-faint"}`}>{body.trim() ? withSample(body) : "Your message will show here."}</p>
                {showCard && attachEvent && (
                  <div className="overflow-hidden rounded-xl border border-line">
                    <div className="relative h-[110px]">
                      <EventImage event={attachEvent} sizes="400px" />
                    </div>
                    <div className="flex items-center gap-2.5 px-3.5 py-3">
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-sm font-extrabold">{attachEvent.name}</span>
                        <span className="truncate text-xs text-muted">
                          {dayParts(attachEvent.day).short}
                          {attachEvent.time_from ? ` · ${formatTime(attachEvent.time_from)}` : ""}
                          {attachEvent.location ? ` · ${attachEvent.location}` : ""}
                        </span>
                      </span>
                      <span className="flex h-[34px] items-center whitespace-nowrap rounded-full bg-brand px-3 text-[13px] font-bold text-white">Get tickets</span>
                    </div>
                  </div>
                )}
                <span className="text-xs leading-normal text-[#8A91A0]">{footer}</span>
              </div>
            </div>
          </div>
        </aside>
      </div>

      <section aria-label="Sent messages" className="flex flex-col">
        <h2 className="mb-2 font-display text-[22px] font-bold">Sent and scheduled</h2>
        {data?.sent?.length ? (
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="h-10 border-b border-hairline text-[13px] font-bold text-muted">
                <th scope="col" className="font-bold">Message</th>
                <th scope="col" className="w-28 text-right font-bold sm:w-40">Sent to</th>
              </tr>
            </thead>
            <tbody>
              {data.sent.map((m) => (
                <tr key={m.id} className="h-16 border-b border-hairline">
                  <td className="min-w-0 py-2 pr-3">
                    <span className="block truncate text-[15px] font-bold">{m.subject}</span>
                    <span className="block truncate text-[13px] text-muted">
                      {KIND_LABEL[m.kind]} ·{" "}
                      {m.status === "scheduled" || m.status === "cancelled"
                        ? whenLabel(m.scheduled_for)
                        : new Date(m.sent_at || m.created_at).toLocaleDateString("en-NG", { day: "numeric", month: "short" })}{" "}
                      ·{" "}
                      {m.audience === "event" ? `${m.event_name || "Event"} ticket holders` : AUDIENCE_LABEL[m.audience]}
                    </span>
                  </td>
                  <td className="text-right text-[15px] font-bold">
                    {m.status === "scheduled" ? (
                      <span className="flex flex-col items-end gap-1">
                        <span className="text-[13px] font-bold text-brand-dark">Scheduled</span>
                        <button
                          type="button"
                          onClick={() => cancelScheduled(m)}
                          className="text-[13px] font-bold text-muted underline-offset-2 hover:text-ink hover:underline"
                        >
                          Cancel
                        </button>
                      </span>
                    ) : m.status === "cancelled" ? (
                      <span className="text-[13px] font-semibold text-muted">Cancelled</span>
                    ) : m.status === "sending" ? (
                      <span className="text-muted">Sending…</span>
                    ) : m.status === "failed" ? (
                      <span className="text-red-600">Failed</span>
                    ) : (
                      <>
                        {n(m.sent)}
                        {m.failed > 0 && <span className="block text-[13px] font-semibold text-red-600">{n(m.failed)} didn’t arrive</span>}
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="py-8 text-[15px] text-muted">{loading ? "Loading…" : "Nothing sent yet. Messages you send or schedule will show up here."}</p>
        )}
      </section>
    </div>
  );
}
