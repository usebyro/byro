"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import API from "@/services/api";
import EventImage from "@/components/brand/EventImage";
import { dayParts, formatTime } from "@/lib/eventFormat";

const KINDS = [
  { id: "announce", title: "Announcement", sub: "New events and news. People can unsubscribe." },
  { id: "update", title: "Event update", sub: "Venue or time changes. Goes to ticket holders." },
];

const DRAFTS = {
  announce: {
    subject: "",
    body: "Hi,\n\n",
  },
  update: {
    subject: "",
    body: "Hi,\n\nQuick update: ",
  },
};

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

const KIND_LABEL = { announce: "Announcement", update: "Event update" };
const AUDIENCE_LABEL = { followers: "All followers", members: "Members", regulars: "Regulars" };

export default function MessagesPage() {
  const [data, setData] = useState(null);
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [testing, setTesting] = useState(false);

  const [kind, setKind] = useState("announce");
  const [audience, setAudience] = useState("followers");
  const [eventSlug, setEventSlug] = useState("");
  const [subject, setSubject] = useState(DRAFTS.announce.subject);
  const [body, setBody] = useState(DRAFTS.announce.body);
  const [attach, setAttach] = useState(false);
  const [attachSlug, setAttachSlug] = useState("");

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
    setSubject(DRAFTS[id].subject);
    setBody(DRAFTS[id].body);
    if (id === "update") setAttach(false);
  };

  const draftDirty = subject.trim() !== "" || body !== DRAFTS[kind].body;
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
  const hasDraft = subject.trim() && body.trim() && body.trim() !== DRAFTS[kind].body.trim();
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

  const sendTest = async () => {
    setTesting(true);
    try {
      const res = await API.sendMessage(payload({ test: true }));
      toast.success(`Test sent to ${res.sent_to}`);
    } catch (err) {
      toast.error(err?.message || "Couldn’t send the test. Try again.");
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
      toast.success(`Sending to ${people(count)}`);
      setSubject(DRAFTS[kind].subject);
      setBody(DRAFTS[kind].body);
      setAttach(false);
      await load();
    } catch (err) {
      toast.error(err?.message || "Couldn’t send that. Try again.");
    } finally {
      setSending(false);
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
              <div className="h-[168px] animate-pulse rounded-xl bg-mist" />
            ) : audiences.length === 0 ? (
              <p className="rounded-xl border border-line px-4 py-4 text-sm text-muted">
                No one to send an event update to yet. Ticket holders show up here once an event has sales.
              </p>
            ) : (
              <div role="radiogroup" aria-label="Audience" className="flex flex-col overflow-hidden rounded-xl border border-line">
                {audiences.map((a, i) => {
                  const on = activeAudience?.id === a.id;
                  const choose = (id) => (isAnnounce ? setAudience(id) : setEventSlug(id));
                  return (
                    <button
                      key={a.id}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      tabIndex={on ? 0 : -1}
                      onClick={() => choose(a.id)}
                      onKeyDown={radioKeys(audiences.length, i, (to) => choose(audiences[to].id))}
                      className={`flex h-14 items-center gap-3 px-4 text-left text-ink transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand ${
                        i > 0 ? "border-t border-hairline" : ""
                      } ${on ? "bg-paper" : "bg-white hover:bg-paper"}`}
                    >
                      <span aria-hidden="true" className={`h-[18px] w-[18px] shrink-0 rounded-full ${on ? "border-[6px] border-brand" : "border-2 border-[#A9B3C2]"}`} />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-[15px] font-bold">{a.label}</span>
                        <span className="text-[13px] text-muted">{a.sub}</span>
                      </span>
                      <span className="text-[15px] font-extrabold">{n(a.count)}</span>
                    </button>
                  );
                })}
              </div>
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
              disabled
              title="Coming soon"
              className="h-11 rounded-full bg-hairline px-5 text-[15px] font-bold text-muted disabled:cursor-not-allowed"
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
        </section>

        <aside aria-label="Email preview" className="flex w-full shrink-0 flex-col gap-2.5 lg:w-[420px]">
          <span className="text-sm font-bold text-muted">Preview</span>
          <div className="rounded-[20px] bg-mist p-4">
            <div className="overflow-hidden rounded-xl bg-white">
              <div className="flex flex-col gap-0.5 border-b border-hairline px-[18px] py-3.5">
                <span className="text-[13px] text-muted">
                  <b className="text-ink">{brand}</b> via byro
                </span>
                <span className={`text-[15px] font-extrabold ${subject.trim() ? "text-ink" : "text-faint"}`}>{subject.trim() || "Subject"}</span>
              </div>
              <div className="flex flex-col gap-3.5 p-[18px]">
                <p className="m-0 whitespace-pre-line break-words text-sm leading-[1.6] text-[#3B4252]">{body}</p>
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
        <h2 className="mb-2 font-display text-[22px] font-bold">Sent</h2>
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
                      {KIND_LABEL[m.kind]} · {new Date(m.created_at).toLocaleDateString("en-NG", { day: "numeric", month: "short" })} ·{" "}
                      {m.audience === "event" ? `${m.event_name || "Event"} ticket holders` : AUDIENCE_LABEL[m.audience]}
                    </span>
                  </td>
                  <td className="text-right text-[15px] font-bold">
                    {m.status === "sending" ? (
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
          <p className="py-8 text-[15px] text-muted">{loading ? "Loading…" : "Nothing sent yet. Messages you send will show up here."}</p>
        )}
      </section>
    </div>
  );
}
