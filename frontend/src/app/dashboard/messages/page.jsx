"use client";

import { useEffect, useMemo, useState } from "react";
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

// Flip to true once the send endpoint exists.
const SENDING_READY = false;

const n = (v) => (v == null ? "—" : Number(v).toLocaleString());

export default function MessagesPage() {
  const [community, setCommunity] = useState(null);
  const [dashboard, setDashboard] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);

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

  useEffect(() => {
    Promise.allSettled([API.getCommunityStats(), API.getDashboard(), API.getDashboardAnalytics()])
      .then(([c, d, a]) => {
        setCommunity(c.status === "fulfilled" ? c.value : null);
        setDashboard(d.status === "fulfilled" ? d.value : null);
        setAnalytics(a.status === "fulfilled" ? a.value : null);
      })
      .finally(() => setLoading(false));
  }, []);

  const events = useMemo(() => {
    const up = dashboard?.hosting?.upcoming || [];
    const past = dashboard?.hosting?.past || [];
    return [...up, ...past].filter((e) => e.slug && e.is_active !== false && !e.is_draft);
  }, [dashboard]);

  // Ticket holders per event come from the same analytics the Events page shows.
  const holders = (slug) => analytics?.events?.[slug]?.sold ?? null;

  const eventsWithTickets = events.filter((e) => (holders(e.slug) ?? 0) > 0);
  const chosenEvent = eventsWithTickets.find((e) => e.slug === eventSlug) || eventsWithTickets[0] || null;
  const attachEvent = events.find((e) => e.slug === attachSlug) || events[0] || null;

  const isAnnounce = kind === "announce";
  const audiences = isAnnounce
    ? [
        { id: "followers", label: "All followers", sub: "Everyone who follows you", count: community?.followers },
        { id: "members", label: "Members", sub: "Came to at least one event", count: community?.attendees },
        { id: "regulars", label: "Regulars", sub: "Came to 3 or more events", count: community?.regulars },
      ]
    : eventsWithTickets.map((e) => ({
        id: e.slug,
        label: `${e.name} ticket holders`,
        sub: `${dayParts(e.day).short}`,
        count: holders(e.slug),
      }));

  const activeAudience = isAnnounce
    ? audiences.find((a) => a.id === audience) || audiences[0]
    : audiences.find((a) => a.id === (chosenEvent?.slug)) || audiences[0] || null;

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

  const canSend = subject.trim() && body.trim() && activeAudience && (activeAudience.count ?? 0) > 0;

  const brand = dashboard?.profile?.display_name || "Your community";
  const footer = isAnnounce
    ? `You get this because you follow ${brand} on byro. Unsubscribe.`
    : "You get this because you have a ticket for this event.";

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

          {events.length > 0 && (
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
            <span className="min-w-0 flex-1 text-[13px] text-muted">
              {SENDING_READY
                ? isAnnounce
                  ? "People can unsubscribe from announcements"
                  : "Event updates always reach ticket holders"
                : "Sending isn’t available yet. Your draft stays here until it is."}
            </span>
            <button type="button" disabled={!SENDING_READY} title={SENDING_READY ? undefined : "Coming soon"} className="h-11 rounded-full border border-line bg-white px-5 text-[15px] font-bold text-ink transition-[background-color,scale] hover:bg-paper active:scale-[0.97] disabled:cursor-not-allowed disabled:border-0 disabled:bg-hairline disabled:text-muted disabled:active:scale-100">
              Send me a test
            </button>
            <button type="button" disabled={!SENDING_READY} title={SENDING_READY ? undefined : "Coming soon"} className="h-11 rounded-full border border-line bg-white px-5 text-[15px] font-bold text-ink transition-[background-color,scale] hover:bg-paper active:scale-[0.97] disabled:cursor-not-allowed disabled:border-0 disabled:bg-hairline disabled:text-muted disabled:active:scale-100">
              Schedule
            </button>
            <button
              type="button"
              disabled={!SENDING_READY || !canSend}
              title={SENDING_READY ? undefined : "Coming soon"}
              className="h-11 rounded-full bg-brand px-5 text-[15px] font-bold text-white transition-[background-color,scale] hover:bg-brand-dark active:scale-[0.97] disabled:cursor-not-allowed disabled:bg-hairline disabled:text-muted disabled:active:scale-100"
            >
              {activeAudience ? `Send to ${n(activeAudience.count)}` : "Send"}
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
                {attach && attachEvent && (
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
        <div className="flex h-10 items-center border-b border-hairline text-[13px] font-bold text-muted">
          <span className="flex-1">Message</span>
          <span className="w-20 text-right sm:w-[120px]">Sent to</span>
          <span className="hidden w-[120px] text-right sm:block">Opened</span>
          <span className="hidden w-[140px] text-right md:block">Tickets sold</span>
        </div>
        <p className="py-8 text-[15px] text-muted">Nothing sent yet. Messages you send will show up here with how many people opened them.</p>
      </section>
    </div>
  );
}
