"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { useSelector } from "react-redux";
import EventImageFallback from "@/components/ui/EventImageFallback";
import OverviewRevenueChart from "@/components/dashboard/v2/OverviewRevenueChart";
import API from "@/services/api";
import BankLogo from "@/components/dashboard/BankLogo";
import Delayed from "@/components/dashboard/v2/Delayed";

// Saved by the Payouts page when the organiser sets their bank account.
const BANK_DETAILS_STORAGE_KEY = "byro_payout_bank_details";
const REFRESH_MS = 60_000;

const PERIODS = [
  { value: "7d", label: "7 days", name: "last 7 days", note: "vs the week before" },
  { value: "30d", label: "30 days", name: "last 30 days", note: "vs the previous 30 days" },
  { value: "all", label: "All time", name: "all time" },
];

// Ticket-mix colours, one per tier in order; the last tone is "still available".
const TIER_COLORS = ["#3669F6", "#EB6834", "#1F7A52", "#8B5CF6", "#D0668E", "#0E9AA7"];
const AVAILABLE_COLOR = "#DCE6FD";

const num = (n) => Math.round(Number(n) || 0).toLocaleString("en-NG");
const naira = (n) => `₦${num(n)}`;
const compact = (n) =>
  n >= 1e6 ? `₦${(n / 1e6).toFixed(1).replace(/\.0$/, "")}M` : n >= 1e3 ? `₦${Math.round(n / 1e3)}K` : `₦${Math.round(n)}`;

// "2026-10-09" -> "Fri 9 Oct"; "2025-Q4" -> "Q4 '25"
function bucketLabel(key) {
  const q = /^(\d{4})-Q([1-4])$/.exec(key);
  if (q) return `Q${q[2]} '${q[1].slice(2)}`;
  return new Date(`${key}T00:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

function formatTime(t) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

function timeAgo(iso) {
  const then = new Date(iso);
  const mins = Math.floor((Date.now() - then) / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (then.toDateString() === yesterday.toDateString()) return "Yesterday";
  return then.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function daysUntil(isoDay) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((new Date(`${isoDay}T00:00:00`) - today) / 864e5);
  return days <= 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`;
}

// "0123456789" -> "••••6789"
const maskAccount = (n) => {
  const digits = String(n || "");
  return digits.length > 4 ? `••••${digits.slice(-4)}` : digits;
};

const andList = (names) => (names.length <= 2 ? names.join(" and ") : `${names[0]}, ${names[1]} and ${names.length - 2} more`);

const sparkPath = (vals) => {
  const top = Math.max(...vals) * 1.1 || 1;
  return vals.map((v, i) => `${i ? "L" : "M"}${((i / (vals.length - 1)) * 100).toFixed(2)} ${(100 - (v / top) * 100).toFixed(2)}`).join(" ");
};

function readSavedBank() {
  try {
    const saved = JSON.parse(localStorage.getItem(BANK_DETAILS_STORAGE_KEY) || "null");
    return saved?.accountNumber ? saved : null;
  } catch {
    return null;
  }
}

function Skeleton() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-5">
      <div className="flex flex-wrap gap-5">
        <div className="v-skel h-[340px] min-w-0 flex-[2_1_520px]" />
        <div className="flex min-w-0 flex-[1_1_280px] flex-col gap-5">
          {[0, 1, 2].map((i) => <div key={i} className="v-skel h-[100px]" />)}
        </div>
      </div>
      <div className="flex flex-wrap gap-5">
        <div className="v-skel h-[260px] min-w-0 flex-[2_1_520px]" />
        <div className="v-skel h-[260px] min-w-0 flex-[1_1_280px]" />
      </div>
    </div>
  );
}

// Shown to a new organiser until their first event exists.
function SetupCard({ steps }) {
  return (
    <section aria-labelledby="setup-title" className="v-card v-bf flex flex-col gap-4 px-6 py-5" style={{ "--i": 1 }}>
      <div className="flex flex-col gap-1">
        <h2 id="setup-title" className="text-lg font-extrabold">Get ready to sell</h2>
        <p className="v-hint m-0">Three steps and your first event can go live.</p>
      </div>
      <ol className="m-0 flex list-none flex-col gap-2 p-0">
        {steps.map((step, i) => (
          <li key={step.label}>
            <Link href={step.href} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-ink no-underline hover:bg-[#F6F8FB]">
              <span
                aria-hidden="true"
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-extrabold ${step.done ? "bg-[#E9F7EF] text-[#1F7A52]" : "bg-[#EEF2FF] text-brand"}`}
              >
                {step.done ? "✓" : i + 1}
              </span>
              <span className={`text-[15px] font-bold ${step.done ? "text-muted line-through" : ""}`}>{step.label}</span>
              <span className="sr-only">{step.done ? "(done)" : ""}</span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}

export default function StudioDashboard() {
  const [period, setPeriod] = useState("30d");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [now, setNow] = useState(0);
  const [table, setTable] = useState(false);
  const [balance, setBalance] = useState(null);
  const [bank, setBank] = useState(null);
  // First-run checklist: null until we know, so it never flashes for set-up organisers.
  const [hasEvents, setHasEvents] = useState(null);
  const [profileDone, setProfileDone] = useState(null);
  const latest = useRef(0);
  const user = useSelector((s) => s.auth?.user);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const firstName =
    data?.first_name || (user?.display_name || user?.displayName || user?.name || "").split(" ")[0] || "there";
  const communityName = data?.community_name || user?.display_name || user?.displayName || "";

  useEffect(() => {
    document.title = "Overview | Byro";
  }, []);

  const load = useCallback((p, { quiet = false } = {}) => {
    const id = ++latest.current;
    if (!quiet) setLoading(true);
    return API.getDashboardOverview(p)
      .then((d) => {
        if (id !== latest.current) return;
        setData(d);
        setFailed(false);
        setUpdatedAt(Date.now());
      })
      .catch(() => {
        if (id === latest.current && !quiet) setFailed(true);
      })
      .finally(() => {
        if (id === latest.current) setLoading(false);
      });
  }, []);

  useEffect(() => {
    load(period);
  }, [period, load]);

  // Keep the numbers live: refresh quietly while the tab is open.
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === "visible") load(period, { quiet: true });
      setNow(Date.now());
    }, REFRESH_MS);
    return () => clearInterval(t);
  }, [period, load]);

  useEffect(() => {
    API.getDashboardEvents()
      .then((res) => setHasEvents((res?.events || []).length > 0))
      .catch(() => {});
    API.getProfile()
      .then((p) => setProfileDone(Boolean(p?.bio?.trim() && p?.avatar_url)))
      .catch(() => {});
  }, []);

  useEffect(() => {
    API.getPayoutBalance().then(setBalance).catch(() => {});
    const saved = readSavedBank();
    if (saved) {
      setBank(saved);
      return;
    }
    // No saved account on this device: fall back to the last bank payout.
    API.getPayouts()
      .then((list) => {
        const last = (Array.isArray(list) ? list : []).find((p) => p.method === "bank");
        if (last) setBank({ bankName: last.bank_name, accountNumber: last.account_number, accountName: last.account_name });
      })
      .catch(() => {});
  }, []);

  const meta = PERIODS.find((p) => p.value === period);
  const isAll = period === "all";
  const fresh = updatedAt ? Math.floor((now - updatedAt) / 60000) : 0;
  const updatedText = fresh < 1 ? "updated just now" : `updated ${fresh} min ago`;

  return (
    <div className="mx-auto flex w-full max-w-[1240px] flex-col gap-5 px-4 pb-12 pt-4 sm:px-[clamp(16px,3vw,40px)] md:gap-6 md:pt-2">
      <div className="v-bf flex flex-wrap items-end gap-4" style={{ "--i": 0 }}>
        <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-1.5">
          <h1 className="v-h1">{greeting}, {firstName}</h1>
          <p className="v-sub">{communityName ? `Here’s how ${communityName} is doing.` : "Here’s how your events are doing."}</p>
        </div>
        <Link href="/dashboard/events/create" className="v-btn v-btn-p v-btn-lg">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
          Create event
        </Link>
      </div>

      {hasEvents === false && profileDone !== null && (
        <SetupCard steps={[
          { label: "Create your first event", done: false, href: "/dashboard/events/create" },
          { label: "Add a bank account so you can get paid", done: Boolean(bank), href: "/dashboard/payouts" },
          { label: "Finish your profile", done: profileDone, href: "/dashboard/profile" },
        ]} />
      )}

      <div className="v-bf flex flex-wrap items-center gap-3" style={{ "--i": 1 }}>
        <div role="group" aria-label="Time period" className="v-seg">
          {PERIODS.map((p) => (
            <button key={p.value} type="button" aria-pressed={period === p.value} onClick={() => setPeriod(p.value)}>
              {p.label}
            </button>
          ))}
        </div>
        {data && loading ? (
          // A refresh keeps the numbers on screen; this says they're on their way.
          <span role="status" className="v-hint inline-flex items-center gap-2">
            <svg className="animate-spin motion-reduce:animate-none" width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="12" cy="12" r="9" stroke="#5B6272" strokeOpacity="0.25" strokeWidth="3" />
              <path d="M21 12a9 9 0 0 0-9-9" stroke="#5B6272" strokeWidth="3" strokeLinecap="round" />
            </svg>
            Updating
          </span>
        ) : updatedAt ? (
          <span className="v-hint inline-flex items-center gap-2">
            <span className="v-dot v-ping bg-[#1F7A52]" />
            Live · {updatedText}
          </span>
        ) : null}
      </div>

      {!data && loading ? (
        <Delayed onRetry={() => load(period)}>
          <Skeleton />
        </Delayed>
      ) : !data && failed ? (
        <section className="v-card flex flex-col items-start gap-3 p-6">
          <h2 className="v-h2">Couldn’t load your numbers</h2>
          <p className="v-hint">Check your connection and try again.</p>
          <button type="button" className="v-btn v-btn-s" onClick={() => load(period)}>Try again</button>
        </section>
      ) : data ? (
        <Content
          data={data}
          meta={meta}
          isAll={isAll}
          busy={loading}
          table={table}
          setTable={setTable}
          balance={balance}
          bank={bank}
        />
      ) : null}
    </div>
  );
}

function Content({ data, meta, isAll, busy, table, setTable, balance, bank }) {
  const values = data.revenue.series.map(Number);
  const labels = data.labels.map(bucketLabel);
  const total = Number(data.revenue.total);
  const previous = data.revenue.previous == null ? null : Number(data.revenue.previous);
  const hasRevenue = values.some((v) => v > 0);

  let delta = null;
  let deltaNote = "";
  if (isAll) {
    const hosted = data.revenue.events_hosted;
    deltaNote = [data.revenue.since && `Since ${data.revenue.since}`, `${num(hosted)} ${hosted === 1 ? "event" : "events"} hosted`].filter(Boolean).join(" · ");
  } else if (previous > 0) {
    const pct = Math.round(((total - previous) / previous) * 100);
    delta = { text: `${pct >= 0 ? "+" : "−"}${Math.abs(pct)}%`, up: pct >= 0 };
    deltaNote = meta.note;
  } else {
    deltaNote = total > 0 ? `No sales ${meta.value === "7d" ? "the week before" : "in the 30 days before"}` : "";
  }

  const t = data.tickets;
  const c = data.checked_in;
  const f = data.followers;
  const ticketSub =
    t.event_count === 0 ? "No sales yet" : t.event_count <= 2 ? andList(t.events) : `Across ${t.event_count} events`;
  const checkedSub = isAll
    ? c.average_turnout != null ? `${c.average_turnout}% average turnout` : "No past events yet"
    : c.top_event
      ? c.top_event.turnout != null ? `${c.top_event.name}, ${c.top_event.turnout}% turnout` : c.top_event.name
      : "No check-ins yet";
  const tiles = [
    { label: "Tickets sold", value: num(t.total), sub: ticketSub, href: "/dashboard/events", series: t.series },
    {
      label: "Checked in",
      value: num(c.total),
      sub: checkedSub,
      href: !isAll && c.top_event?.slug ? `/dashboard/events/${c.top_event.slug}` : "/dashboard/events",
      // Check-ins land on event days only, so the line is just spikes until it covers quarters.
      series: isAll ? c.series : null,
    },
    isAll
      ? { label: "Followers", value: num(f.total), sub: `${num(f.came_to_event)} ${f.came_to_event === 1 ? "has" : "have"} come to an event`, href: "/dashboard/community", series: f.series }
      : { label: "New followers", value: f.new > 0 ? `+${num(f.new)}` : "0", sub: `${num(f.total)} in total`, href: "/dashboard/community", series: f.series },
  ];

  return (
    <div className="flex flex-col gap-5 md:gap-6" aria-busy={busy}>
      <div className="flex flex-wrap items-stretch gap-5">
        <section aria-label="Revenue" className="v-card v-bf flex min-w-0 flex-[2_1_520px] flex-col gap-[18px] px-6 pb-[18px] pt-6" style={{ "--i": 2 }}>
          <div className="flex flex-wrap items-start gap-3">
            <div className="flex grow flex-col gap-2.5">
              <span className="v-eyebrow">Revenue · {meta.name}</span>
              <span className="v-hero">{isAll && total >= 1e6 ? compact(total) : naira(total)}</span>
              {(delta || deltaNote) && (
                <span className="flex flex-wrap items-center gap-2">
                  {delta && <span className={`v-delta ${delta.up ? "v-up" : "v-down"}`}>{delta.text}</span>}
                  <span className="v-hint">{deltaNote}</span>
                </span>
              )}
            </div>
            {hasRevenue && (
              <button type="button" className="v-viz-toggle" aria-pressed={table} onClick={() => setTable(!table)}>
                {table ? "Show chart" : "Show table"}
              </button>
            )}
          </div>
          {!hasRevenue ? (
            <div className="flex h-[200px] flex-col items-center justify-center gap-1 rounded-xl bg-[#F6F8FB] text-center">
              <p className="text-[15px] font-bold">No revenue {isAll ? "yet" : `in the ${meta.name}`}</p>
              <p className="v-hint">Paid ticket sales show up here {data.unit === "day" ? "day by day" : "quarter by quarter"}.</p>
            </div>
          ) : table ? (
            <div className="max-h-[252px] overflow-auto rounded-xl bg-[#F6F8FB]">
              <table className="w-full border-collapse text-sm">
                <caption className="v-hint px-3.5 py-2.5 text-left">Revenue by {data.unit}, {meta.name}</caption>
                <thead>
                  <tr>
                    <th scope="col" className="v-th px-3.5 py-2 text-left">{data.unit === "day" ? "Day" : "Quarter"}</th>
                    <th scope="col" className="v-th px-3.5 py-2 text-right">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {values.map((v, i) => ({ l: labels[i], v })).reverse().map((r) => (
                    <tr key={r.l} className="border-t border-hairline">
                      <td className="px-3.5 py-2">{r.l}</td>
                      <td className="v-tab px-3.5 py-2 text-right font-bold">{naira(r.v)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <OverviewRevenueChart
              key={meta.value}
              values={values}
              labels={labels}
              format={naira}
              compact={compact}
              unit={data.unit}
              periodName={meta.name}
              endLabel={isAll ? labels[labels.length - 1] : "Today"}
              endSuffix={isAll ? "" : " today"}
            />
          )}
        </section>

        <div className="flex min-w-0 flex-[1_1_280px] flex-col gap-5">
          {tiles.map((s, i) => {
            const spark = s.series && s.series.length > 1 && s.series.some((v) => v > 0) ? s.series : null;
            const top = spark ? Math.max(...spark) * 1.1 || 1 : 1;
            return (
              <Link key={s.label} href={s.href} className="v-card v-lift v-press v-bf flex grow items-end gap-3.5 px-5 py-[18px] text-ink no-underline" style={{ "--i": 3 + i }}>
                <span className="flex min-w-0 grow flex-col gap-2">
                  <span className="v-eyebrow">{s.label}</span>
                  <span className="v-fig">{s.value}</span>
                  <span className="v-hint truncate">{s.sub}</span>
                </span>
                {spark && (
                  <span aria-hidden="true" className="relative h-11 w-[104px] shrink-0">
                    <svg viewBox="0 0 100 100" preserveAspectRatio="none" width="100%" height="100%" className="block overflow-visible">
                      <path d={sparkPath(spark)} fill="none" stroke="#B9C4D8" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                    </svg>
                    <span
                      className="absolute -right-1 -mt-1 h-2 w-2 rounded-full bg-brand shadow-[0_0_0_2px_#FFFFFF]"
                      style={{ top: `${100 - (spark[spark.length - 1] / top) * 100}%` }}
                    />
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-stretch gap-5">
        <NextEvent event={data.next_event} />
        <section aria-label="Payouts" className="v-card v-bf flex min-w-0 flex-[1_1_280px] flex-col gap-4 p-[22px]" style={{ "--i": 6 }}>
          <div className="flex items-baseline justify-between">
            <span className="v-eyebrow">Available to withdraw</span>
            <Link href="/dashboard/payouts" className="text-sm font-bold text-brand-dark no-underline">History</Link>
          </div>
          {balance ? <span className="v-fig text-[36px]">{naira(balance.available)}</span> : <span className="v-skel h-9 w-40" aria-hidden="true" />}
          <div className="grow" />
          <div className="-mx-1 -mb-1 flex items-center gap-2.5 rounded-[14px] bg-[#F6F8FB] p-3">
            {bank ? (
              <BankLogo code={bank.bankCode} name={bank.bankName} size={32} radius={8} />
            ) : (
              <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-ink shadow-[0_0_0_1px_rgba(20,22,28,.06)]">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9.5L12 4l9 5.5M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18" /></svg>
              </span>
            )}
            {bank ? (
              <span className="flex min-w-0 grow flex-col">
                <span className="truncate text-sm font-extrabold">{bank.bankName}</span>
                <span className="v-hint v-tab truncate text-xs">
                  {[bank.accountName && String(bank.accountName).toUpperCase(), maskAccount(bank.accountNumber)].filter(Boolean).join(" · ")}
                </span>
              </span>
            ) : (
              <span className="flex min-w-0 grow flex-col">
                <span className="text-sm font-extrabold">No bank account yet</span>
                <span className="v-hint text-xs">Add a bank account to get paid</span>
              </span>
            )}
            <Link href="/dashboard/payouts" className="v-btn v-btn-p v-btn-sm">{bank ? "Withdraw" : "Add bank"}</Link>
          </div>
        </section>
      </div>

      <div className="flex flex-wrap items-start gap-5">
        <section aria-label="Recent sales" className="v-card v-bf min-w-0 flex-[2_1_520px] px-5 pb-2 pt-5" style={{ "--i": 7 }}>
          <div className="flex items-baseline justify-between px-1 pb-2">
            <h2 className="v-h2">Recent sales</h2>
            <Link href={data.next_event ? `/dashboard/events/${data.next_event.slug}` : "/dashboard/events"} className="text-sm font-bold text-brand-dark no-underline">See guests</Link>
          </div>
          {data.recent_sales.length === 0 ? (
            <p className="v-hint px-2 pb-4 pt-2">No sales yet. They show up here as people get tickets.</p>
          ) : (
            data.recent_sales.map((r, i) => (
              <div key={`${r.created_at}-${i}`} className="v-row v-al flex min-h-[58px] items-center gap-3 rounded-xl px-2" style={{ "--i": i }}>
                <span className="v-av" aria-hidden="true">{(r.name[0] || "?").toUpperCase()}</span>
                <div className="flex min-w-0 grow flex-col">
                  <span className="truncate text-[15px] font-bold">{r.name}</span>
                  <span className="truncate text-[13px] text-muted">{r.tier}{r.quantity > 1 ? ` × ${r.quantity}` : ""} · {r.event}</span>
                </div>
                <span className="whitespace-nowrap text-right text-[13px] text-muted">{timeAgo(r.created_at)}</span>
                <span className="v-tab w-20 shrink-0 text-right text-[15px] font-extrabold">{r.amount == null ? "" : naira(r.amount)}</span>
              </div>
            ))
          )}
        </section>

        <div className="flex min-w-0 flex-[1_1_280px] flex-col gap-5">
          <section aria-label={`Community, ${meta.name}`} className="v-card v-bf flex flex-col gap-3.5 px-[22px] py-5" style={{ "--i": 8 }}>
            <div className="flex items-baseline justify-between">
              <h2 className="v-h2 text-[17px]">Community</h2>
              <Link href="/dashboard/community" className="text-sm font-bold text-brand-dark no-underline">Open</Link>
            </div>
            <div className="flex flex-col gap-3 text-[15px]">
              <div className="flex justify-between"><span className="text-body">New followers</span><b>{data.community.new_followers > 0 ? `+${num(data.community.new_followers)}` : "0"}</b></div>
              <div className="flex justify-between"><span className="text-body">Became regulars</span><b>{num(data.community.became_regulars)}</b></div>
              <div className="flex flex-col gap-1.5">
                <div className="flex justify-between"><span className="text-body">Came back</span><b>{data.community.came_back_rate == null ? "—" : `${data.community.came_back_rate}%`}</b></div>
                {data.community.came_back_rate != null ? (
                  <div className="h-1.5 overflow-hidden rounded-full bg-[#DCE6FD]">
                    <div className="v-growx h-full rounded-full bg-brand" style={{ width: `${data.community.came_back_rate}%` }} />
                  </div>
                ) : (
                  <span className="v-hint">Fills in as you check guests in at the door.</span>
                )}
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function NextEvent({ event }) {
  if (!event) {
    return (
      <section aria-label="Next event" className="v-card v-bf flex min-w-0 flex-[2_1_520px] flex-col items-start justify-center gap-3 p-6" style={{ "--i": 5 }}>
        <span className="v-eyebrow">Next event</span>
        <h2 className="v-h2">Nothing coming up</h2>
        <p className="v-hint">Create an event and its sales show up here.</p>
        <Link href="/dashboard/events/create" className="v-btn v-btn-p">Create event</Link>
      </section>
    );
  }

  const href = `/dashboard/events/${event.slug}`;
  const others = event.hosts.filter((h) => !h.is_you);
  const date = new Date(`${event.day}T00:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  const when = [date, formatTime(event.time_from)].filter(Boolean).join(", ");

  // Ticket mix: each tier that has sold, then what's left (when there's a limit).
  const parts = event.tiers.length
    ? event.tiers.map((t, i) => ({ label: t.name, n: t.sold, color: TIER_COLORS[i % TIER_COLORS.length] })).filter((p) => p.n > 0)
    : event.sold > 0 ? [{ label: "Sold", n: event.sold, color: TIER_COLORS[0] }] : [];
  const available = event.capacity != null ? Math.max(event.capacity - event.sold, 0) : null;
  const scale = event.capacity || event.sold;
  const showMix = scale > 0 && (parts.length > 0 || available != null);
  const mixLabel = [...parts.map((p) => `${p.label} ${p.n}`), available != null && `${available} still available`].filter(Boolean).join(", ");

  return (
    <section aria-label="Next event" className="v-card v-bf flex min-w-0 flex-[2_1_520px] flex-wrap overflow-hidden" style={{ "--i": 5 }}>
      <div className="relative max-h-[320px] min-h-[200px] min-w-0 flex-[1_1_200px] bg-mist">
        {event.image_url ? (
          <Image src={event.image_url} alt="" fill sizes="(max-width: 768px) 100vw, 320px" className="object-cover" />
        ) : (
          <EventImageFallback category={event.category} />
        )}
      </div>
      <div className="flex min-w-0 flex-[3_1_340px] flex-col gap-4 px-6 py-[22px]">
        <div className="flex flex-col gap-1">
          {event.sold_out ? (
            <span className="v-status text-[13px] text-[#B42318]"><span className="v-dot bg-[#B42318]" />Sold out · {daysUntil(event.day)}</span>
          ) : (
            <span className="v-status text-[13px] text-[#1F7A52]"><span className="v-dot bg-[#2F9E6E]" />On sale · {daysUntil(event.day)}</span>
          )}
          <Link href={href} className="v-d text-2xl font-bold tracking-[-0.02em] text-ink no-underline">{event.name}</Link>
          <span className="text-sm text-muted">{[when, event.location].filter(Boolean).join(" · ")}</span>
          {(others.length > 0 || event.is_owner) && (
            <span className="mt-1.5 flex flex-wrap items-center gap-2 text-[13px] text-body">
              <span aria-hidden="true" className="flex">
                {event.hosts.slice(0, 3).map((h, i) => (
                  <span
                    key={`${h.name}-${i}`}
                    className={`v-av h-6 w-6 text-[11px] shadow-[0_0_0_2px_#FFFFFF] ${i ? "-ml-1.5 bg-[#DCE6FD] text-brand-dark" : "bg-ink text-white"}`}
                  >
                    {(h.name[0] || "?").toUpperCase()}
                  </span>
                ))}
              </span>
              {others.length > 0 && <span>With {andList(others.map((h) => h.name))}</span>}
              {event.is_owner && <Link href={href} className="font-bold text-brand-dark no-underline">Add co-host</Link>}
            </span>
          )}
        </div>

        <div className="flex flex-col gap-2.5">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <span>
              <b className="text-xl">{num(event.sold)}</b>{" "}
              <span className="text-sm text-muted">{event.capacity != null ? `of ${num(event.capacity)} sold` : "sold"}</span>
            </span>
            {event.is_free ? (
              <span className="text-sm text-muted">Free event</span>
            ) : event.revenue != null ? (
              <span><b className="text-base">{naira(event.revenue)}</b> <span className="text-sm text-muted">revenue</span></span>
            ) : null}
          </div>
          {showMix && (
            <>
              <div role="img" aria-label={`Ticket mix: ${mixLabel}`} className="flex h-3 gap-0.5 overflow-hidden rounded bg-white">
                {parts.map((p, i) => (
                  <span key={p.label} className="v-growx" style={{ "--i": i, width: `${(p.n / scale) * 100}%`, background: p.color }} />
                ))}
                {available != null && available > 0 && <span className="grow" style={{ background: AVAILABLE_COLOR }} />}
              </div>
              <div className="flex flex-wrap gap-4 text-[13px] text-body">
                {parts.map((p) => (
                  <span key={p.label} className="inline-flex items-center gap-1.5"><span className="v-sw" style={{ background: p.color }} />{p.label} <b>{num(p.n)}</b></span>
                ))}
                {available != null && (
                  <span className="inline-flex items-center gap-1.5"><span className="v-sw" style={{ background: AVAILABLE_COLOR }} />Available <b>{num(available)}</b></span>
                )}
              </div>
            </>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <Link href={`/checkin/${encodeURIComponent(event.slug)}`} className="v-btn v-btn-p">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M4 12h16" /></svg>
            Check in
          </Link>
          <Link href={href} className="v-btn v-btn-s">Manage</Link>
          <Link href={`/dashboard/messages?event=${encodeURIComponent(event.slug)}`} className="v-btn v-btn-t">Email ticket holders</Link>
        </div>
      </div>
    </section>
  );
}
