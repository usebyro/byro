"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  BarChart, Bar, XAxis, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Money01Icon,
  Ticket01Icon,
  Calendar01Icon,
  UserMultiple02Icon,
  Add01Icon,
} from "@hugeicons/core-free-icons";
import API from "@/services/api";
import { useSelector } from "react-redux";

const BASE_URL = (process.env.NEXT_PUBLIC_API_URL || "https://byro.onrender.com").replace(/\/api\/?$/, "");

const CHART_DATA = ["J","F","M","A","M","J","J","A","S","O","N","D"].map((m, i) => ({
  month: m,
  value: [60,90,75,110,95,130,110,160,130,145,260,180][i] * 1000,
  current: i === new Date().getMonth(),
}));

const CATEGORY_GRADIENT = {
  entertainment: "from-purple-600 to-pink-500",
  fitness:       "from-orange-500 to-amber-400",
  art_culture:   "from-pink-600 to-rose-400",
  conference:    "from-teal-600 to-emerald-400",
  technology:    "from-blue-600 to-violet-500",
  web3_crypto:   "from-amber-600 to-orange-400",
  other:         "from-gray-500 to-slate-400",
};

function getImageUrl(event) {
  return (
    event.event_image_url ||
    (event.event_image?.startsWith("http")
      ? event.event_image
      : event.event_image
      ? `${BASE_URL}${event.event_image}`
      : null)
  );
}

function formatDate(d) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-US", { weekday: "short", day: "numeric", month: "short" });
}

function formatTime(t) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

function getStatus(event) {
  const now  = new Date();
  const day  = new Date(event.day);
  if (event.is_active === false) return { label: "DRAFT", dot: "bg-gray-400",  pill: "bg-gray-100 text-gray-500" };
  const diff = Math.ceil((day - now) / 864e5);
  if (diff < 0)  return { label: "PAST",  dot: "bg-gray-300",  pill: "bg-gray-100 text-gray-400" };
  if (diff <= 14) return { label: "SOON",  dot: "bg-amber-400", pill: "bg-amber-50 text-amber-600" };
  return              { label: "LIVE",  dot: "bg-green-400", pill: "bg-green-50 text-green-600" };
}

function TrendBadge({ value, note }) {
  if (!value) return <p className="text-xs text-gray-400 mt-0.5">{note || ""}</p>;
  const isUp = !value.startsWith("-");
  return (
    <p className={`text-xs font-medium mt-0.5 flex items-center gap-0.5 ${isUp ? "text-green-500" : "text-red-400"}`}>
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
        {isUp
          ? <><path d="M22 7l-8.5 8.5-5-5L1 18"/><path d="M16 7h6v6"/></>
          : <><path d="M22 17l-8.5-8.5-5 5L1 6"/><path d="M16 17h6v-6"/></>
        }
      </svg>
      {value} vs last month
    </p>
  );
}

function StatCard({ icon, label, value, trend, note, iconBg, iconColor }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5">
      <div className="flex items-start justify-between mb-3">
        <p className="text-sm text-gray-500">{label}</p>
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${iconBg} ${iconColor}`}>
          <HugeiconsIcon icon={icon} size={17} color="currentColor" />
        </div>
      </div>
      <p className="text-2xl font-bold text-gray-900 mb-0.5">{value}</p>
      <TrendBadge value={trend} note={note} />
    </div>
  );
}

export default function StudioDashboard() {
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading]     = useState(true);
  const user = useSelector((s) => s.auth?.user);
  const firstName = (user?.displayName || user?.name || "").split(" ")[0] || "there";

  useEffect(() => {
    API.getDashboard()
      .then(setDashboard)
      .catch(() => setDashboard(null))
      .finally(() => setLoading(false));
  }, []);

  const upcoming = dashboard?.hosting?.upcoming || [];
  const past     = dashboard?.hosting?.past     || [];
  const all      = [...upcoming, ...past];
  const topEvents = all.slice(0, 3);

  return (
    <div className="p-6 max-w-6xl mx-auto">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-7">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mb-1">
            Welcome back, {firstName} 👋
          </h1>
          <p className="text-xs sm:text-sm text-gray-400">Here is how your events are performing.</p>
        </div>
        <Link
          href="/events/create"
          className="flex items-center justify-center gap-2 bg-[#4F6EF7] text-white text-sm font-semibold px-4 py-2.5 rounded-xl hover:bg-blue-700 transition-colors w-full sm:w-auto shrink-0"
        >
          <HugeiconsIcon icon={Add01Icon} size={14} color="white" />
          Create event
        </Link>
      </div>

      {/* ── Stat cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard icon={Money01Icon}        label="Revenue (30d)"  value="—"                              trend={null}   note="Pending backend"    iconBg="bg-teal-50"   iconColor="text-teal-600" />
        <StatCard icon={Ticket01Icon}       label="Tickets sold"   value="—"                              trend="+24%"   note={null}               iconBg="bg-blue-50"   iconColor="text-blue-600" />
        <StatCard icon={Calendar01Icon}     label="Active events"  value={loading ? "—" : upcoming.length} trend={upcoming.length > 0 ? `+${upcoming.length}` : null} note={null} iconBg="bg-violet-50" iconColor="text-violet-600" />
        <StatCard icon={UserMultiple02Icon} label="Avg. fill rate"  value="—"                              trend={null}   note="Pending backend"    iconBg="bg-amber-50"  iconColor="text-amber-600" />
      </div>

      {/* ── Revenue chart + Top by sales ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">

        {/* Chart */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 p-5">
          <div className="flex items-start justify-between mb-1">
            <div>
              <p className="font-semibold text-gray-900">Revenue</p>
              <p className="text-xs text-gray-400">Last 12 months</p>
            </div>
            <button className="text-sm text-gray-500 border border-gray-200 rounded-lg px-3 py-1.5 flex items-center gap-1 hover:border-gray-300">
              {new Date().getFullYear()}
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6"/></svg>
            </button>
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={CHART_DATA} barSize={20} barCategoryGap="25%">
              <XAxis
                dataKey="month"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 11, fill: "#9ca3af" }}
              />
              <Tooltip
                formatter={(v) => [`₦${(v / 1e6).toFixed(1)}M`, "Revenue"]}
                contentStyle={{ borderRadius: 10, border: "1px solid #f1f5f9", fontSize: 12, boxShadow: "0 4px 12px rgba(0,0,0,0.06)" }}
                cursor={{ fill: "#f8fafc" }}
              />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {CHART_DATA.map((entry, i) => (
                  <Cell key={i} fill={entry.current ? "#4F6EF7" : "#DBEAFE"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Top by sales */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <p className="font-semibold text-gray-900 mb-0.5">Top by sales</p>
          <p className="text-xs text-gray-400 mb-5">This month</p>

          {loading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-3 animate-pulse">
                  <div className="w-9 h-9 rounded-xl bg-gray-100 shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3.5 bg-gray-100 rounded w-3/4" />
                    <div className="h-3 bg-gray-100 rounded w-1/2" />
                  </div>
                  <div className="h-4 w-12 bg-gray-100 rounded" />
                </div>
              ))}
            </div>
          ) : topEvents.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">No events yet</p>
          ) : (
            <div className="space-y-4">
              {topEvents.map((e) => {
                const img  = getImageUrl(e);
                const grad = CATEGORY_GRADIENT[e.category] || CATEGORY_GRADIENT.other;
                return (
                  <div key={e.slug} className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl overflow-hidden shrink-0 relative">
                      {img ? (
                        <Image src={img} alt={e.name} fill className="object-cover" />
                      ) : (
                        <div className={`w-full h-full bg-gradient-to-br ${grad}`} />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{e.name}</p>
                      <p className="text-xs text-gray-400">— sold</p>
                    </div>
                    <p className="text-sm font-bold text-gray-900 shrink-0">—</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Your events ── */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5">
        <div className="flex items-center justify-between mb-5">
          <p className="font-semibold text-gray-900">Your events</p>
          <Link href="/dashboard/events" className="text-sm text-[#4F6EF7] font-medium hover:text-blue-700">
            View all
          </Link>
        </div>

        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-4 animate-pulse">
                <div className="w-10 h-10 rounded-xl bg-gray-100 shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-gray-100 rounded w-1/3" />
                  <div className="h-3 bg-gray-100 rounded w-1/4" />
                </div>
                <div className="h-2 w-28 bg-gray-100 rounded-full" />
                <div className="h-4 w-12 bg-gray-100 rounded" />
                <div className="h-6 w-14 bg-gray-100 rounded-full" />
              </div>
            ))}
          </div>
        ) : all.length === 0 ? (
          <div className="text-center py-10">
            <p className="text-sm text-gray-400 mb-3">No events created yet</p>
            <Link href="/events/create" className="text-sm font-semibold text-[#4F6EF7] hover:text-blue-700">
              Create your first event →
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {all.slice(0, 6).map((event) => {
              const img    = getImageUrl(event);
              const grad   = CATEGORY_GRADIENT[event.category] || CATEGORY_GRADIENT.other;
              const status = getStatus(event);
              const capacity = event.capacity || 0;

              return (
                <Link
                  key={event.slug}
                  href={`/dashboard/events/${event.slug}`}
                  className="flex items-center gap-4 py-3.5 -mx-2 px-2 rounded-xl hover:bg-gray-50 transition-colors group"
                >
                  {/* Thumbnail */}
                  <div className="w-10 h-10 rounded-xl overflow-hidden shrink-0 relative">
                    {img ? (
                      <Image src={img} alt={event.name} fill className="object-cover" />
                    ) : (
                      <div className={`w-full h-full bg-gradient-to-br ${grad}`} />
                    )}
                  </div>

                  {/* Name + date */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate group-hover:text-[#4F6EF7] transition-colors">
                      {event.name}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {formatDate(event.day)}
                      {event.time_from && ` · ${formatTime(event.time_from)}`}
                    </p>
                  </div>

                  {/* Progress bar */}
                  <div className="hidden sm:flex items-center gap-2 w-44 shrink-0">
                    {capacity > 0 ? (
                      <>
                        <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full bg-[#4F6EF7]" style={{ width: "0%" }} />
                        </div>
                        <span className="text-xs text-gray-500 w-8 text-right">0%</span>
                      </>
                    ) : (
                      <span className="text-xs text-gray-300">—</span>
                    )}
                  </div>

                  {/* Revenue placeholder */}
                  <p className="text-sm font-bold text-gray-900 w-14 text-right shrink-0">—</p>

                  {/* Status badge */}
                  <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full ${status.pill} shrink-0 w-16 justify-center`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
                    {status.label}
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
