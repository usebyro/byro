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

function TrendBadge({ value, note, isPending }) {
  if (!value) return <p className={`text-[10px] mt-0.5 truncate ${isPending ? "text-gray-300 font-normal" : "text-gray-400 font-medium"}`}>{note || ""}</p>;
  const isUp = !value.startsWith("-");
  return (
    <p className={`text-[10px] font-semibold mt-0.5 flex items-center gap-0.5 ${isUp ? "text-green-500" : "text-red-400"}`}>
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
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
  const isPending = value === "—";
  return (
    <div className={`bg-white rounded-xl border p-4 transition-all duration-200 ${
      isPending ? "border-gray-100/80 opacity-95" : "border-gray-100 shadow-sm hover:shadow-md"
    }`}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider truncate">{label}</p>
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${iconBg} ${iconColor}`}>
          <HugeiconsIcon icon={icon} size={14} color="currentColor" />
        </div>
      </div>
      <p className={`text-xl font-extrabold mb-0.5 tracking-tight ${isPending ? "text-gray-300" : "text-gray-900"}`}>
        {value}
      </p>
      <TrendBadge value={trend} note={note} isPending={isPending} />
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
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-5">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-gray-100/50">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
            Welcome back, {firstName} 👋
          </h1>
          <p className="text-xs text-gray-400 mt-0.5">Here is how your events are performing.</p>
        </div>
        <Link
          href="/events/create"
          className="flex items-center justify-center gap-1.5 bg-[#4F6EF7] text-white text-xs font-semibold px-3.5 py-2 rounded-lg hover:bg-blue-700 transition-colors w-full sm:w-auto shrink-0 shadow-sm shadow-[#4F6EF7]/10"
        >
          <HugeiconsIcon icon={Add01Icon} size={13} color="white" />
          Create event
        </Link>
      </div>

      {/* ── Stat cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard icon={Money01Icon}        label="Revenue (30d)"  value="—"                              trend={null}   note="Pending integration" iconBg="bg-teal-50"   iconColor="text-teal-600" />
        <StatCard icon={Ticket01Icon}       label="Tickets sold"   value="—"                              trend="+24%"   note={null}               iconBg="bg-blue-50"   iconColor="text-blue-600" />
        <StatCard icon={Calendar01Icon}     label="Active events"  value={loading ? "—" : upcoming.length} trend={upcoming.length > 0 ? `+${upcoming.length}` : null} note={null} iconBg="bg-violet-50" iconColor="text-violet-600" />
        <StatCard icon={UserMultiple02Icon} label="Avg. fill rate"  value="—"                              trend={null}   note="Pending integration" iconBg="bg-amber-50"  iconColor="text-amber-600" />
      </div>

      {/* ── Revenue chart + Top by sales ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Chart */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-100/80 shadow-sm p-4 flex flex-col justify-between">
          <div className="flex items-start justify-between mb-3">
            <div>
              <p className="text-sm font-bold text-gray-800">Revenue</p>
              <p className="text-[11px] text-gray-400">Last 12 months</p>
            </div>
            <button className="text-[11px] text-gray-500 border border-gray-200 rounded-lg px-2.5 py-1 flex items-center gap-1 hover:bg-gray-50 transition-colors">
              {new Date().getFullYear()}
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6"/></svg>
            </button>
          </div>
          <div className="w-full">
            <ResponsiveContainer width="100%" height={150}>
              <BarChart data={CHART_DATA} barSize={16} barCategoryGap="25%">
                <XAxis
                  dataKey="month"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10, fill: "#9ca3af" }}
                />
                <Tooltip
                  formatter={(v) => [`₦${(v / 1e6).toFixed(1)}M`, "Revenue"]}
                  contentStyle={{ borderRadius: 8, border: "1px solid #f1f5f9", fontSize: 11, boxShadow: "0 4px 12px rgba(0,0,0,0.04)" }}
                  cursor={{ fill: "#f8fafc" }}
                />
                <Bar dataKey="value" radius={[3, 3, 0, 0]}>
                  {CHART_DATA.map((entry, i) => (
                    <Cell key={i} fill={entry.current ? "#4F6EF7" : "#DBEAFE"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Top by sales */}
        <div className="bg-white rounded-xl border border-gray-100/80 shadow-sm p-4 flex flex-col">
          <p className="text-sm font-bold text-gray-800">Top by sales</p>
          <p className="text-[11px] text-gray-400 mb-4">This month</p>

          {loading ? (
            <div className="space-y-3.5 flex-1">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-2.5 animate-pulse">
                  <div className="w-8 h-8 rounded-lg bg-gray-100 shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 bg-gray-100 rounded w-3/4" />
                    <div className="h-2.5 bg-gray-100 rounded w-1/2" />
                  </div>
                  <div className="h-3.5 w-8 bg-gray-100 rounded" />
                </div>
              ))}
            </div>
          ) : topEvents.length === 0 ? (
            <div className="flex items-center justify-center flex-1 py-6">
              <p className="text-xs text-gray-400 text-center">No events yet</p>
            </div>
          ) : (
            <div className="space-y-3 flex-1">
              {topEvents.map((e) => {
                const img  = getImageUrl(e);
                const grad = CATEGORY_GRADIENT[e.category] || CATEGORY_GRADIENT.other;
                return (
                  <div key={e.slug} className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg overflow-hidden shrink-0 relative">
                      {img ? (
                        <Image src={img} alt={e.name} fill className="object-cover" />
                      ) : (
                        <div className={`w-full h-full bg-gradient-to-br ${grad}`} />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-gray-800 truncate">{e.name}</p>
                      <p className="text-[10px] text-gray-400">— sold</p>
                    </div>
                    <p className="text-xs font-bold text-gray-800 shrink-0">—</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Your events ── */}
      <div className="bg-white rounded-xl border border-gray-100/80 shadow-sm p-4">
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-bold text-gray-800">Your events</p>
          <Link href="/dashboard/events" className="text-xs text-[#4F6EF7] font-semibold hover:text-blue-700 transition-colors">
            View all
          </Link>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3 animate-pulse">
                <div className="w-8 h-8 rounded-lg bg-gray-100 shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 bg-gray-100 rounded w-1/4" />
                  <div className="h-2 bg-gray-100 rounded w-1/5" />
                </div>
                <div className="h-1.5 w-24 bg-gray-100 rounded-full hidden sm:block" />
                <div className="h-3 w-8 bg-gray-100 rounded" />
                <div className="h-5 w-12 bg-gray-100 rounded-md" />
              </div>
            ))}
          </div>
        ) : all.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-xs text-gray-400 mb-2">No events created yet</p>
            <Link href="/events/create" className="text-xs font-bold text-[#4F6EF7] hover:text-blue-700">
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
                  className="flex items-center gap-3 py-2.5 -mx-1 px-1 rounded-lg hover:bg-gray-50/70 transition-colors group"
                >
                  {/* Thumbnail */}
                  <div className="w-8 h-8 rounded-lg overflow-hidden shrink-0 relative bg-gray-50 border border-gray-100/50">
                    {img ? (
                      <Image src={img} alt={event.name} fill className="object-cover" />
                    ) : (
                      <div className={`w-full h-full bg-gradient-to-br ${grad}`} />
                    )}
                  </div>

                  {/* Name + date */}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-gray-800 truncate group-hover:text-[#4F6EF7] transition-colors">
                      {event.name}
                    </p>
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      {formatDate(event.day)}
                      {event.time_from && ` · ${formatTime(event.time_from)}`}
                    </p>
                  </div>

                  {/* Progress bar */}
                  <div className="hidden sm:flex items-center gap-2 w-32 shrink-0">
                    {capacity > 0 ? (
                      <>
                        <div className="flex-1 h-1 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full bg-[#4F6EF7]" style={{ width: "0%" }} />
                        </div>
                        <span className="text-[10px] text-gray-400 w-6 text-right">0%</span>
                      </>
                    ) : (
                      <span className="text-[10px] text-gray-300 w-6 text-right">—</span>
                    )}
                  </div>

                  {/* Revenue placeholder */}
                  <p className="text-xs font-bold text-gray-800 w-10 text-right shrink-0">—</p>

                  {/* Status badge */}
                  <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md ${status.pill} shrink-0 w-14 justify-center`}>
                    <span className={`w-1 h-1 rounded-full ${status.dot}`} />
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
