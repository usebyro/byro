"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { resolveAdminHref } from "@/lib/adminNav";
import { isPaidEvent } from "@/lib/eventFormat";

interface EventTier {
  price: number | string;
}

interface Event {
  id: number;
  category: string;
  ticket_price: number | string;
  tiers?: EventTier[];
  is_active: boolean;
  created_at: string;
}

interface AnalyticsSummary {
  total_tickets_sold: number;
  total_revenue: number;
  total_events: number;
  active_events: number;
  private_events?: number;
  draft_events?: number;
}

interface RevenueTrendPoint {
  date: string; // ISO date, e.g. "2026-07-01"
  revenue: number;
}

interface ChartPoint {
  day: string;
  revenue: number;
}

const REVENUE_RANGES = [
  { label: "7D", days: 7 },
  { label: "30D", days: 30 },
  { label: "90D", days: 90 },
  { label: "6M", days: 180 },
  { label: "1Y", days: 365 },
];

// The revenue-trend endpoint only returns days that had successful payments, so
// zero-fill the gaps to keep the line continuous across the whole range.
function fillTrend(rows: RevenueTrendPoint[], days: number): ChartPoint[] {
  const byDate = new Map(rows.map((r) => [r.date, Number(r.revenue) || 0]));
  const today = new Date();
  const out: ChartPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const iso = d.toISOString().slice(0, 10);
    out.push({
      day:
        days <= 14
          ? d.toLocaleDateString("en-US", { weekday: "short" })
          : d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      revenue: byDate.get(iso) ?? 0,
    });
  }
  return out;
}

function fmtNaira(n: number) {
  return `₦${n.toLocaleString()}`;
}

// Compact axis label: avoid collapsing everything under ₦1,000 to "₦0k".
function fmtNairaCompact(n: number) {
  if (n >= 1000) return `₦${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`;
  return `₦${n}`;
}

const CATEGORY_LABELS: Record<string, string> = {
  entertainment: "Entertainment",
  web3_crypto: "Web3 & Crypto",
  art_culture: "Art & Culture",
  nightlife: "Nightlife & Parties",
  conference: "Conferences",
  fitness: "Sports",
  technology: "Technology",
  other: "Other",
};

export default function AdminDashboardPage() {
  const pathname = usePathname();
  const [events, setEvents] = useState<Event[]>([]);
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [revenueTrend, setRevenueTrend] = useState<ChartPoint[]>([]);
  const [trendLoading, setTrendLoading] = useState(true);
  const [pendingPayouts, setPendingPayouts] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revenueRangeDays, setRevenueRangeDays] = useState(7);

  // Events power the "Events by category" chart; summary powers the stat cards.
  useEffect(() => {
    Promise.all([
      // The admin overview lists every event; the public events/ list hides
      // private, draft and suspended ones.
      fetch("/api/admin/events/overview")
        .then((res) => {
          if (!res.ok) throw new Error("events");
          return res.json();
        })
        .then((data: Event[]) => setEvents(Array.isArray(data) ? data : [])),
      fetch("/api/admin/analytics/summary")
        .then((res) => {
          if (!res.ok) throw new Error("summary");
          return res.json();
        })
        .then((data: AnalyticsSummary) => setSummary(data)),
    ])
      .catch(() => setError("Failed to load platform analytics."))
      .finally(() => setLoading(false));
  }, []);

  // Pending-payout count for the callout — reuses the existing payouts proxy.
  useEffect(() => {
    fetch("/api/admin/payouts")
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        const list = Array.isArray(data) ? data : [];
        setPendingPayouts(list.filter((p) => p.status === "pending").length);
      })
      .catch(() => setPendingPayouts(null));
  }, []);

  // Refetch the revenue trend whenever the range toggle changes.
  useEffect(() => {
    let cancelled = false;
    setTrendLoading(true);
    fetch(`/api/admin/analytics/revenue-trend?days=${revenueRangeDays}`)
      .then((res) => (res.ok ? res.json() : []))
      .then((rows: RevenueTrendPoint[]) => {
        if (cancelled) return;
        setRevenueTrend(fillTrend(Array.isArray(rows) ? rows : [], revenueRangeDays));
      })
      .catch(() => {
        if (!cancelled) setRevenueTrend(fillTrend([], revenueRangeDays));
      })
      .finally(() => {
        if (!cancelled) setTrendLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [revenueRangeDays]);

  const categoryData = useMemo(() => {
    const counts: Record<string, number> = {};
    events.forEach((e) => {
      const key = e.category || "other";
      counts[key] = (counts[key] || 0) + 1;
    });
    return Object.entries(counts).map(([category, count]) => ({
      name: CATEGORY_LABELS[category] || category,
      count,
    }));
  }, [events]);

  const totalEvents = summary?.total_events ?? events.length;
  const activeEvents = summary?.active_events ?? events.filter((e) => e.is_active).length;
  const paidEvents = events.filter(isPaidEvent).length;

  const maxCategory = Math.max(1, ...categoryData.map((c) => c.count));
  const sortedCategories = [...categoryData].sort((x, y) => y.count - x.count);
  const trendTotal = revenueTrend.reduce((sum, p) => sum + p.revenue, 0);
  const rangeLabel = REVENUE_RANGES.find((r) => r.days === revenueRangeDays)?.label;

  return (
    <div className="p-5 md:p-8 max-w-[1200px]">
      <div className="mb-6">
        <h1 className="font-display text-ink text-3xl font-extrabold tracking-tight">Overview</h1>
      </div>

      {error && <p className="text-red-600 text-sm mb-6">{error}</p>}

      {pendingPayouts ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-marigold bg-butter px-5 py-4 mb-5">
          <div>
            <p className="text-ink font-bold text-sm">
              {pendingPayouts} payout{pendingPayouts === 1 ? "" : "s"} waiting for approval
            </p>
            <p className="text-muted text-xs mt-0.5">Organisers are waiting to withdraw their earnings.</p>
          </div>
          <Link
            href={resolveAdminHref(pathname, "/payouts")}
            className="rounded-full bg-ink px-4 py-2 text-xs font-bold text-white hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
          >
            Review payouts
          </Link>
        </div>
      ) : (
        <p className="mb-5 rounded-2xl bg-mint px-5 py-3.5 text-sm font-semibold text-stamp-green">
          {pendingPayouts === 0 ? "No payouts waiting for approval." : "Checking payouts…"}
        </p>
      )}

      <section className="rounded-3xl bg-brand text-white p-5 md:p-8 mb-5 overflow-hidden">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-bold text-white/80">Total revenue</p>
            <p className="font-display text-5xl md:text-7xl font-extrabold tracking-tight tabular-nums mt-1">
              {loading || !summary ? "—" : fmtNaira(Number(summary.total_revenue))}
            </p>
            <p className="text-sm text-white/80 mt-2 tabular-nums">
              {trendLoading ? "Loading…" : `${fmtNaira(trendTotal)} in the last ${rangeLabel === "6M" ? "6 months" : rangeLabel === "1Y" ? "year" : rangeLabel}`}
            </p>
          </div>
          <div className="flex items-center gap-1 rounded-full bg-white/15 p-1" role="group" aria-label="Revenue range">
            {REVENUE_RANGES.map((r) => (
              <button
                key={r.days}
                onClick={() => setRevenueRangeDays(r.days)}
                aria-pressed={revenueRangeDays === r.days}
                className={`rounded-full px-3 py-1 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white ${
                  revenueRangeDays === r.days ? "bg-white text-brand-dark" : "text-white hover:bg-white/15"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        <div className="h-56 md:h-64 relative mt-6 -mx-2">
          {!trendLoading && revenueTrend.every((p) => p.revenue === 0) && (
            <p className="absolute inset-0 flex items-center justify-center text-white/80 text-sm pointer-events-none z-10">
              No revenue in this period
            </p>
          )}
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={revenueTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.18)" vertical={false} />
              <XAxis
                dataKey="day"
                tick={{ fill: "rgba(255,255,255,0.8)", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                interval={revenueRangeDays > 14 ? Math.ceil(revenueRangeDays / 8) : 0}
              />
              <YAxis
                tick={{ fill: "rgba(255,255,255,0.8)", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={fmtNairaCompact}
                domain={[0, (max: number) => Math.max(max, 1000)]}
                allowDecimals={false}
              />
              <Tooltip
                cursor={{ stroke: "rgba(255,255,255,0.4)" }}
                contentStyle={{ background: "#fff", border: "none", borderRadius: 12, fontSize: 12, color: "#14161C", boxShadow: "0 12px 30px rgba(20,22,28,0.25)" }}
                formatter={(value) => [fmtNaira(Number(value)), "Revenue"]}
              />
              <Line
                type="monotone"
                dataKey="revenue"
                stroke="#fff"
                strokeWidth={3}
                dot={revenueRangeDays <= 14 ? { r: 3.5, fill: "#fff", stroke: "#3669F6", strokeWidth: 2 } : false}
                activeDot={{ r: 5, fill: "#FFC93C", stroke: "#fff", strokeWidth: 2 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-3 rounded-3xl border border-line bg-white mb-5 md:divide-x divide-y md:divide-y-0 divide-line">
        <Stat
          label="Events"
          value={loading ? "—" : totalEvents}
          note={`${loading ? "—" : activeEvents} active, ${summary?.private_events ?? 0} private, ${summary?.draft_events ?? 0} drafts`}
        />
        <Stat
          label="Paid events"
          value={loading ? "—" : paidEvents}
          note={`${loading ? "—" : events.length - paidEvents} free`}
        />
        <Stat
          label="Tickets sold"
          value={loading || !summary ? "—" : summary.total_tickets_sold.toLocaleString()}
          note="Across all events"
        />
      </section>

      <section className="rounded-3xl border border-line bg-white p-5 md:p-6">
        <h2 className="font-display text-ink text-lg font-extrabold">Events by category</h2>
        {!loading && sortedCategories.length === 0 ? (
          <p className="text-muted text-sm mt-4">No events yet. They show up here once organisers create them.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {sortedCategories.map((c) => (
              <li key={c.name} className="grid grid-cols-[minmax(0,9rem)_1fr_2rem] items-center gap-3 text-sm">
                <span className="truncate font-semibold text-[#3B4252]" title={c.name}>{c.name}</span>
                <span className="h-2.5 rounded-full bg-mist overflow-hidden">
                  <span
                    className="block h-full rounded-full bg-brand"
                    style={{ width: `${(c.count / maxCategory) * 100}%` }}
                  />
                </span>
                <span className="text-right font-bold tabular-nums text-ink">{c.count}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: string | number; note: string }) {
  return (
    <div className="px-5 py-5 md:px-6">
      <p className="text-sm font-bold text-muted">{label}</p>
      <p className="font-display text-4xl font-extrabold tabular-nums text-ink mt-1">{value}</p>
      <p className="text-xs text-faint mt-1">{note}</p>
    </div>
  );
}
