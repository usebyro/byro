"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import API from "@/services/api";

const RANGES = [
  { id: "12w", label: "12 weeks", name: "last 12 weeks" },
  { id: "6m", label: "6 months", name: "last 6 months" },
  { id: "12m", label: "12 months", name: "last 12 months" },
];

const FILTERS = [
  { id: "all", label: "All" },
  { id: "regular", label: "Regulars" },
  { id: "new", label: "New" },
  { id: "follower", label: "Followers only" },
];

const TAG = {
  regular: ["Regular", "bg-[#EEF3FF] text-brand-dark"],
  member: ["Member", "bg-[#F1F3F7] text-body"],
  new: ["New", "bg-[#E9F7EF] text-[#1F7A52]"],
  follower: ["Follower", "bg-[#FFF4CC] text-[#6B4A08]"],
};

const PIPS = 6;

const num = (v) => (v == null ? "—" : Number(v).toLocaleString("en-NG"));

// "2026-10-12" as a local date, so the label never slips a day across time zones.
const parseDay = (s) => {
  const [y, m, d] = String(s).split("-").map(Number);
  return new Date(y, m - 1, d);
};
const monthYear = (iso) => (iso ? new Date(iso).toLocaleDateString("en-GB", { month: "short", year: "numeric" }) : "");

function barLabels(point, unit, last) {
  const d = parseDay(point.start);
  if (unit === "week") {
    const day = d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
    return { label: day, short: day.split(" ")[0], full: `Week of ${day}${last ? " (this week)" : ""}` };
  }
  const month = d.toLocaleDateString("en-GB", { month: "short" });
  const full = d.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  return { label: month, short: month[0], full: `${full}${last ? " (so far)" : ""}` };
}

// Shown next to numbers that are refreshing; the old numbers stay on screen meanwhile.
function Updating() {
  return (
    <span role="status" className="inline-flex items-center gap-1.5 text-xs font-bold text-muted">
      <svg className="animate-spin motion-reduce:animate-none" width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="9" stroke="#5B6272" strokeOpacity="0.25" strokeWidth="3" />
        <path d="M21 12a9 9 0 0 0-9-9" stroke="#5B6272" strokeWidth="3" strokeLinecap="round" />
      </svg>
      Updating
    </span>
  );
}

function Skel({ className }) {
  return <span aria-hidden="true" className={`v-skel block ${className}`} />;
}

// New followers per week or month, as bars or as a table.
function FollowersCard({ summary, loading, rangeName }) {
  const [table, setTable] = useState(false);
  const [hot, setHot] = useState(null);
  const series = summary?.series || [];
  const unit = summary?.unit || "week";
  const values = series.map((p) => p.count);
  const max = Math.max(0, ...values);
  const top = max * 1.18 || 1;
  const bars = series.map((p, i) => ({ ...p, ...barLabels(p, unit, i === series.length - 1) }));
  const n = bars.length;

  return (
    <section aria-label="Followers" className="v-card v-bf flex min-w-0 flex-[3_1_520px] flex-col gap-[18px] px-6 pb-[18px] pt-6" style={{ "--i": 2 }}>
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex grow flex-col gap-2.5">
          <span className="v-eyebrow">Followers</span>
          {loading ? <Skel className="h-[52px] w-40" /> : <span className="v-hero">{num(summary?.stats?.followers)}</span>}
          <span className="flex flex-wrap items-center gap-2">
            {loading ? (
              <Skel className="h-6 w-48" />
            ) : (
              <>
                <span className={`v-delta ${summary?.new_followers > 0 ? "v-up" : "v-flat"}`}>+{num(summary?.new_followers)}</span>
                <span className="v-hint">new followers, {rangeName}</span>
              </>
            )}
          </span>
        </div>
        {n > 0 && (
          <button type="button" className="v-viz-toggle" aria-pressed={table} onClick={() => setTable((t) => !t)}>
            {table ? "Show chart" : "Show table"}
          </button>
        )}
      </div>

      {loading ? (
        <Skel className="h-[200px] w-full" />
      ) : max === 0 ? (
        <div className="flex h-[180px] items-center justify-center rounded-xl bg-paper px-6 text-center">
          <p className="v-hint max-w-sm">
            No new followers in the {rangeName}. Ticket buyers follow you at checkout, and anyone can follow from your public page.
          </p>
        </div>
      ) : table ? (
        <div className="max-h-[260px] overflow-auto rounded-xl bg-[#F6F8FB]">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th scope="col" className="v-th px-3.5 py-2 text-left">{unit === "week" ? "Week" : "Month"}</th>
                <th scope="col" className="v-th px-3.5 py-2 text-right">New followers</th>
              </tr>
            </thead>
            <tbody>
              {bars.map((b) => (
                <tr key={b.start} className="border-t border-hairline">
                  <td className="px-3.5 py-2">{b.full}</td>
                  <td className="v-tab px-3.5 py-2 text-right font-bold">+{num(b.count)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <figure className="m-0 flex gap-2.5" aria-label={`New followers per ${unit}`}>
          <div className="flex min-w-0 grow flex-col gap-2">
            <div className="relative h-[180px]">
              <div className="absolute inset-0 flex items-stretch gap-0.5">
                {bars.map((b, i) => {
                  const isHot = hot === i;
                  const last = i === n - 1;
                  const h = `${(b.count / top) * 100}%`;
                  const showVal = (last || b.count === max) && b.count > 0 && !isHot;
                  const shift = i < 2 ? "-20%" : i > n - 3 ? "-80%" : "-50%";
                  return (
                    <button
                      key={b.start}
                      type="button"
                      className="v-bar-btn h-full min-w-0 flex-[1_1_0]"
                      aria-label={`${b.full}: ${b.count} new followers`}
                      onMouseEnter={() => setHot(i)}
                      onFocus={() => setHot(i)}
                      onMouseLeave={() => setHot(null)}
                      onBlur={() => setHot(null)}
                    >
                      {showVal && <span className="v-fade pb-1 text-[13px] font-extrabold text-ink">{b.count}</span>}
                      <span
                        className="v-grow w-full max-w-[24px] rounded-t transition-colors duration-150"
                        style={{ "--i": i, height: h, background: isHot ? "#2451D6" : last ? "#3669F6" : "#AFC4FA" }}
                      />
                      {isHot && (
                        <span className="v-tip" style={{ bottom: `calc(${h} + 10px)`, left: "50%", transform: `translateX(${shift})` }}>
                          <b>+{num(b.count)}</b>
                          <span>{b.full}</span>
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
            <div aria-hidden="true" className="flex gap-0.5 text-xs text-faint">
              {bars.map((b, i) => (
                <span key={b.start} className="min-w-0 flex-[1_1_0] overflow-hidden whitespace-nowrap text-center">
                  <span className="hidden sm:inline">{b.label}</span>
                  <span className="sm:hidden">{unit === "week" && i % 2 ? "" : b.short}</span>
                </span>
              ))}
            </div>
          </div>
        </figure>
      )}
    </section>
  );
}

function MembersCard({ stats, loading }) {
  const rate = stats?.repeat_rate ?? 0;
  return (
    <section aria-label="Members" className="v-card v-bf grid gap-[18px] px-[22px] py-5 [grid-template-columns:repeat(auto-fit,minmax(min(120px,100%),1fr))]" style={{ "--i": 3 }}>
      <div className="flex flex-col gap-1.5">
        <span className="v-eyebrow">Members</span>
        {loading ? <Skel className="h-7 w-16" /> : <span className="v-fig">{num(stats?.attendees)}</span>}
        <span className="v-hint">Came to at least one event</span>
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="v-eyebrow">Regulars</span>
        {loading ? <Skel className="h-7 w-16" /> : <span className="v-fig">{num(stats?.regulars)}</span>}
        <span className="v-hint">Came to 3 or more</span>
      </div>
      <div className="col-span-full flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <span className="v-eyebrow">Came back for a 2nd event</span>
          <b className="text-lg">{loading ? "—" : `${rate}%`}</b>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-[#DCE6FD]">
          {!loading && <div className="v-growx h-full rounded-full bg-brand" style={{ width: `${rate}%` }} />}
        </div>
      </div>
    </section>
  );
}

function GrewCard({ top, loading, rangeName }) {
  const most = Math.max(1, ...top.map((t) => t.new_members));
  return (
    <section aria-label="Events that grew you" className="v-card v-bf flex grow flex-col gap-3.5 px-[22px] py-5" style={{ "--i": 4 }}>
      <div className="flex flex-col gap-0.5">
        <h2 className="v-h2 !text-[17px]">Events that grew you</h2>
        <span className="v-hint">New members each event brought in, {rangeName}</span>
      </div>
      {loading ? (
        [0, 1, 2].map((i) => <Skel key={i} className="h-5 w-full" />)
      ) : top.length === 0 ? (
        <p className="v-hint">No first-time check-ins yet. Members fill in as you check guests in at the door.</p>
      ) : (
        top.map((t, i) => (
          <div key={t.slug || t.name} className="flex items-center gap-3">
            <span className="w-[104px] shrink-0 truncate text-sm font-bold" title={t.name}>{t.name}</span>
            <span className="flex h-5 min-w-0 grow items-center gap-2">
              <span
                className="v-growx h-[18px] rounded-r bg-brand"
                style={{ "--i": i, width: `calc(${Math.round((t.new_members / most) * 100)}% - 40px)`, minWidth: 4 }}
              />
              <span className="v-tab text-[13px] font-extrabold">+{num(t.new_members)}</span>
            </span>
          </div>
        ))
      )}
    </section>
  );
}

function PersonRow({ p, i }) {
  const name = p.name || p.email || "Byro member";
  const [tag, tagCls] = TAG[p.status] || TAG.member;
  const firstWhat = p.events ? p.first_event : "Followed";
  const firstWhen = monthYear(p.events ? p.first_at : p.followed_at);
  return (
    <tr className="v-row v-al border-b border-hairline" style={{ "--i": Math.min(i, 12) }}>
      <td className="px-5 py-2.5">
        <span className="flex items-center gap-3">
          <span className="v-av" aria-hidden="true">{name[0].toUpperCase()}</span>
          <span className="flex min-w-0 flex-col">
            <span className="text-[15px] font-extrabold">{name}</span>
            {p.email && p.name && <span className="text-[13px] text-muted">{p.email}</span>}
            {!p.email && <span className="text-[13px] text-muted">Follows you on Byro</span>}
          </span>
        </span>
      </td>
      <td data-l="Events" className="px-3 py-2.5">
        <span className="flex items-center gap-[3px]" aria-label={`${p.events} events`}>
          {Array.from({ length: PIPS }, (_, j) => (
            <span key={j} className="h-3.5 w-1.5 rounded-sm" style={{ background: j < p.events ? "#3669F6" : "#E3E8F0" }} />
          ))}
          <span className="v-tab ml-2 text-sm font-extrabold">{p.events}</span>
        </span>
      </td>
      <td data-l="First came" className="px-3 py-2.5">
        <span className="flex flex-col">
          <span className="text-sm font-bold">{firstWhat}</span>
          <span className="text-[13px] text-muted">{firstWhen}</span>
        </span>
      </td>
      <td data-l="Last seen" className="px-3 py-2.5">
        <span className="flex flex-col">
          <span className="text-sm font-bold">{p.events ? p.last_event : "Not yet"}</span>
          {p.events > 0 && <span className="text-[13px] text-muted">{monthYear(p.last_at)}</span>}
        </span>
      </td>
      <td data-l="Status" className="py-2.5 pl-3 pr-5">
        <span className={`rounded-full px-2.5 py-1 text-[13px] font-extrabold ${tagCls}`}>{tag}</span>
      </td>
    </tr>
  );
}

export default function CommunityPage() {
  const [range, setRange] = useState("12w");
  const [summary, setSummary] = useState(null);
  const [summaryTry, setSummaryTry] = useState(0);
  // Which request the summary on screen answers; loading until it matches the current one.
  const [summaryDone, setSummaryDone] = useState({ key: null, error: false });
  const summaryKey = `${range}:${summaryTry}`;
  const summaryLoading = summaryDone.key !== summaryKey;
  const summaryError = !summaryLoading && summaryDone.error;
  // Placeholders only before the first numbers arrive; after that a range change keeps them up.
  const summaryFirstLoad = summaryLoading && !summary;

  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [q, setQ] = useState("");
  const [people, setPeople] = useState(null);
  const [peopleTry, setPeopleTry] = useState(0);
  const [peopleDone, setPeopleDone] = useState({ key: null, error: false });
  const peopleKey = `${filter}:${q}:${peopleTry}`;
  const peopleLoading = peopleDone.key !== peopleKey;
  const peopleError = !peopleLoading && peopleDone.error;
  const [loadingMore, setLoadingMore] = useState(false);
  const [exporting, setExporting] = useState(false);
  const peopleReq = useRef(0);

  useEffect(() => {
    document.title = "Community | Byro";
  }, []);

  useEffect(() => {
    let live = true;
    API.getCommunitySummary(range)
      .then((s) => {
        if (!live) return;
        setSummary(s);
        setSummaryDone({ key: summaryKey, error: false });
      })
      .catch(() => live && setSummaryDone({ key: summaryKey, error: true }));
    return () => {
      live = false;
    };
  }, [range, summaryKey]);

  // Search waits for a pause in typing.
  useEffect(() => {
    const t = setTimeout(() => setQ(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  // The first page, again whenever the filter or search changes.
  useEffect(() => {
    const id = ++peopleReq.current;
    API.getCommunityMembers({ filter, q, page: 1 })
      .then((d) => {
        if (id !== peopleReq.current) return;
        setPeople(d);
        setPeopleDone({ key: peopleKey, error: false });
      })
      .catch(() => id === peopleReq.current && setPeopleDone({ key: peopleKey, error: true }));
  }, [filter, q, peopleKey]);

  const loadMore = () => {
    const id = ++peopleReq.current;
    setLoadingMore(true);
    API.getCommunityMembers({ filter, q, page: people.page + 1 })
      .then((d) => id === peopleReq.current && setPeople((prev) => ({ ...d, results: [...prev.results, ...d.results] })))
      .catch((err) => toast.error("Couldn’t load more people", { description: err?.message || "Try again." }))
      .finally(() => setLoadingMore(false));
  };

  const exportCsv = async () => {
    setExporting(true);
    try {
      const blob = await API.exportCommunityMembers({ filter, q });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = "byro-community.csv";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
      toast.success("CSV downloaded", { description: `${num(people?.count)} ${people?.count === 1 ? "person" : "people"}` });
    } catch (err) {
      toast.error("Couldn’t export CSV", { description: err?.message || "Try again." });
    } finally {
      setExporting(false);
    }
  };

  const rangeName = RANGES.find((r) => r.id === range)?.name;
  const audiences = summary?.audiences;
  const message =
    filter === "regular"
      ? { href: "/dashboard/messages?audience=regulars", label: audiences ? `Message ${num(audiences.regulars)} regulars` : "Message regulars" }
      : { href: "/dashboard/messages?audience=followers", label: audiences ? `Message ${num(audiences.followers)} followers` : "Message followers" };
  const organiser = summary?.organizer_name;

  return (
    <div className="mx-auto flex w-full max-w-[1240px] flex-col gap-5 px-4 pb-12 pt-4 sm:px-[clamp(16px,3vw,40px)] md:gap-6 md:pt-2">
      <div className="v-bf flex flex-wrap items-end gap-4" style={{ "--i": 0 }}>
        <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-1.5">
          <h1 className="v-h1">Community</h1>
          <p className="v-sub">People who follow {organiser || "you"} and come to your events.</p>
        </div>
        {summary?.handle && (
          <Link href={`/u/${summary.handle}`} className="v-btn v-btn-s v-btn-lg">
            View public page
          </Link>
        )}
        <button type="button" className="v-btn v-btn-s v-btn-lg" onClick={exportCsv} disabled={exporting || !people?.count}>
          {exporting ? "Exporting…" : "Export CSV"}
        </button>
      </div>

      <div className="v-bf flex flex-wrap items-center gap-3" style={{ "--i": 1 }}>
        <div role="group" aria-label="Time range" className="v-seg">
          {RANGES.map((r) => (
            <button key={r.id} type="button" aria-pressed={range === r.id} onClick={() => setRange(r.id)}>
              {r.label}
            </button>
          ))}
        </div>
        {summaryLoading && summary && <Updating />}
      </div>

      {summaryError && !summaryLoading ? (
        <div className="v-card flex flex-wrap items-center gap-3 px-6 py-5">
          <p className="v-hint grow">Couldn’t load your community numbers.</p>
          <button type="button" className="v-btn v-btn-s v-btn-sm" onClick={() => setSummaryTry((t) => t + 1)}>
            Try again
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-stretch gap-5">
          <FollowersCard summary={summary} loading={summaryFirstLoad} rangeName={rangeName} />
          <div className="flex min-w-0 flex-[2_1_300px] flex-col gap-5">
            <MembersCard stats={summary?.stats} loading={summaryFirstLoad} />
            <GrewCard top={summary?.top_events || []} loading={summaryFirstLoad} rangeName={rangeName} />
          </div>
        </div>
      )}

      <section aria-label="People" className="v-card v-bf overflow-hidden" style={{ "--i": 5 }}>
        <div className="flex flex-wrap items-center gap-3 px-5 py-[18px]">
          <h2 className="v-h2 mr-2">People</h2>
          <div role="group" aria-label="Filter people" className="v-seg">
            {FILTERS.map((f) => (
              <button key={f.id} type="button" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
                {f.label}
              </button>
            ))}
          </div>
          <div className="grow" />
          <label className="v-search w-full sm:w-56">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8A91A0" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.5-3.5" />
            </svg>
            <span className="sr-only">Search people</span>
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name or email" />
          </label>
          <Link href={message.href} className="v-btn v-btn-p v-btn-sm">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 6h16v12H4zM4 7l8 6 8-6" />
            </svg>
            {message.label}
          </Link>
        </div>

        {peopleError ? (
          <div className="flex flex-wrap items-center gap-3 border-t border-hairline px-5 py-5">
            <p className="v-hint grow">Couldn’t load people.</p>
            <button type="button" className="v-btn v-btn-s v-btn-sm" onClick={() => setPeopleTry((t) => t + 1)}>
              Try again
            </button>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="v-stack w-full min-w-[820px] border-collapse">
                <thead>
                  <tr className="border-y border-hairline">
                    <th scope="col" className="v-th px-5 py-3 text-left">Person</th>
                    <th scope="col" className="v-th p-3 text-left">Events</th>
                    <th scope="col" className="v-th p-3 text-left">First came</th>
                    <th scope="col" className="v-th p-3 text-left">Last seen</th>
                    <th scope="col" className="v-th py-3 pl-3 pr-5 text-left">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {peopleLoading
                    ? [0, 1, 2, 3].map((i) => (
                        <tr key={i} className="border-b border-hairline">
                          <td className="px-5 py-3"><Skel className="h-8 w-48" /></td>
                          <td className="p-3"><Skel className="h-4 w-20" /></td>
                          <td className="p-3"><Skel className="h-8 w-28" /></td>
                          <td className="p-3"><Skel className="h-8 w-28" /></td>
                          <td className="py-3 pl-3 pr-5"><Skel className="h-6 w-16" /></td>
                        </tr>
                      ))
                    : people?.results.map((p, i) => <PersonRow key={`${p.email || p.name}-${i}`} p={p} i={i} />)}
                </tbody>
              </table>
            </div>
            {!peopleLoading && people?.results.length === 0 && (
              <p className="v-hint px-5 py-6 text-center">
                {q
                  ? `No one matches “${q}”.`
                  : people?.total === 0
                    ? "No one yet. Ticket buyers follow you at checkout, and members fill in as you check guests in at the door."
                    : "No one in this group yet."}
              </p>
            )}
          </>
        )}

        {!peopleLoading && !peopleError && people?.count > 0 && (
          <div className="flex flex-wrap items-center gap-3 px-5 py-3.5 text-[13px] text-muted">
            <span className="grow">
              Showing {num(people.results.length)} of {num(people.count)}
              {people.count !== people.total ? ` (${num(people.total)} in your community)` : ""}
            </span>
            {people.has_more && (
              <button type="button" className="v-btn v-btn-s v-btn-sm" onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? "Loading…" : "Show more"}
              </button>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
