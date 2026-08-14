"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import axiosInstance from "@/utils/axios";
import { resolveAdminHref } from "@/lib/adminNav";

interface Event {
  id: number;
  category: string;
  ticket_price: number;
  is_active: boolean;
  created_at: string;
}

interface AnalyticsSummary {
  total_tickets_sold: number;
  total_revenue: number;
  total_events: number;
  active_events: number;
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

function StatCard({ label, value, sublabel }: { label: string; value: string | number; sublabel?: string }) {
  return (
    <div className="bg-[#1a1d27] border border-white/10 rounded-xl px-5 py-4">
      <p className="text-gray-400 text-xs uppercase tracking-wider mb-1">{label}</p>
      <p className="text-white text-2xl font-bold">{value}</p>
      {sublabel && <p className="text-gray-500 text-xs mt-1">{sublabel}</p>}
    </div>
  );
}

function fmtNaira(n: number) {
  return `₦${n.toLocaleString()}`;
}

const CATEGORY_LABELS: Record<string, string> = {
  entertainment: "Entertainment",
  web3_crypto: "Web3 & Crypto",
  art_culture: "Nightlife & Parties",
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
      axiosInstance
        .get("events/")
        .then((res) => {
          const data: Event[] = Array.isArray(res.data) ? res.data : res.data?.results ?? [];
          setEvents(data);
        }),
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
  const paidEvents = events.filter((e) => Number(e.ticket_price) > 0).length;

  return (
    <div className="p-5 md:p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-white text-xl font-bold">Overview</h1>
        <p className="text-gray-400 text-sm mt-1">Platform activity at a glance</p>
      </div>

      {error && <p className="text-red-400 text-sm mb-6">{error}</p>}

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Total Events" value={loading ? "—" : totalEvents} sublabel={`${loading ? "—" : activeEvents} active`} />
        <StatCard label="Paid Events" value={loading ? "—" : paidEvents} sublabel={`${loading ? "—" : events.length - paidEvents} free`} />
        <StatCard
          label="Tickets Sold"
          value={loading || !summary ? "—" : summary.total_tickets_sold.toLocaleString()}
        />
        <StatCard
          label="Revenue"
          value={loading || !summary ? "—" : fmtNaira(Number(summary.total_revenue))}
        />
      </div>

      {/* Payouts callout */}
      <div className="flex items-center justify-between bg-[#1a1d27] border border-white/10 rounded-xl px-5 py-4 mb-8">
        <div>
          <p className="text-white font-semibold text-sm">
            {pendingPayouts ?? "—"} pending payout{pendingPayouts === 1 ? "" : "s"}
          </p>
          <p className="text-gray-400 text-xs mt-0.5">Organizers waiting for withdrawal approval</p>
        </div>
        <Link
          href={resolveAdminHref(pathname, "/payouts")}
          className="text-xs font-semibold text-blue-400 hover:text-blue-300 bg-blue-500/10 px-3 py-2 rounded-lg transition-colors"
        >
          Review payouts →
        </Link>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-[#1a1d27] border border-white/10 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-white font-semibold text-sm">Events by category</h2>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={categoryData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="name" tick={{ fill: "#9ca3af", fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={60} />
                <YAxis tick={{ fill: "#9ca3af", fontSize: 11 }} allowDecimals={false} />
                <Tooltip contentStyle={{ background: "#1a1d27", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-[#1a1d27] border border-white/10 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <h2 className="text-white font-semibold text-sm">Revenue</h2>
              {trendLoading && (
                <span className="text-[10px] text-gray-500 bg-white/5 px-2 py-0.5 rounded-full">Loading…</span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {REVENUE_RANGES.map((r) => (
                <button
                  key={r.days}
                  onClick={() => setRevenueRangeDays(r.days)}
                  className={`text-[11px] font-semibold px-2.5 py-1 rounded-lg transition-colors ${
                    revenueRangeDays === r.days
                      ? "bg-blue-600/20 text-blue-400"
                      : "text-gray-400 hover:text-white hover:bg-white/5"
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={revenueTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis
                  dataKey="day"
                  tick={{ fill: "#9ca3af", fontSize: 11 }}
                  interval={revenueRangeDays > 14 ? Math.ceil(revenueRangeDays / 8) : 0}
                />
                <YAxis tick={{ fill: "#9ca3af", fontSize: 11 }} tickFormatter={(v) => `₦${(v / 1000).toFixed(0)}k`} />
                <Tooltip
                  contentStyle={{ background: "#1a1d27", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }}
                  formatter={(value) => [fmtNaira(Number(value)), "Revenue"]}
                />
                <Line type="monotone" dataKey="revenue" stroke="#22c55e" strokeWidth={2} dot={revenueRangeDays <= 14} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
