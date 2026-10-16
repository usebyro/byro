"use client";

import { useMemo, useState } from "react";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const dayLabel = (d) => `${d.getDate()} ${MONTHS[d.getMonth()]}`;

// A round number a little above the top value, so the line never touches the ceiling.
const niceMax = (m) => {
  const p = Math.pow(10, Math.floor(Math.log10(m || 1)));
  const f = m / p;
  return [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((x) => f <= x + 1e-9) * p;
};
const linePath = (vals, max) =>
  vals
    .map((v, i) => `${i ? "L" : "M"}${(vals.length === 1 ? 50 : (i / (vals.length - 1)) * 100).toFixed(2)} ${(100 - (v / max) * 100).toFixed(2)}`)
    .join(" ");

/**
 * Running total of tickets sold, one point per day from the first sale to today
 * (or to the event's day once it's over). Built from the guest list itself.
 * `soldOut` marks the day each limited ticket type ran out: [{ name, at }].
 */
export default function EventSalesChart({ dates, soldOut = [], endDay, style }) {
  const [table, setTable] = useState(false);
  const [hi, setHi] = useState(null);

  const data = useMemo(() => {
    const times = dates.map((d) => new Date(d)).filter((d) => !Number.isNaN(d.getTime())).sort((a, b) => a - b);
    if (!times.length) return null;
    const start = new Date(times[0].getFullYear(), times[0].getMonth(), times[0].getDate());
    const today = new Date();
    let end = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    if (endDay) {
      const ev = new Date(`${endDay}T00:00:00`);
      if (ev < end && ev >= start) end = ev;
    }
    const last = times[times.length - 1];
    const lastDay = new Date(last.getFullYear(), last.getMonth(), last.getDate());
    if (lastDay > end) end = lastDay;

    const perDay = {};
    times.forEach((t) => { const k = dayKey(t); perDay[k] = (perDay[k] || 0) + 1; });
    const days = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) days.push(new Date(d));
    let run = 0;
    const daily = days.map((d) => perDay[dayKey(d)] || 0);
    const cum = daily.map((v) => (run += v));
    const isToday = dayKey(end) === dayKey(today);
    return { days, daily, cum, total: run, max: niceMax(run * 1.08), isToday };
  }, [dates, endDay]);

  if (!data) {
    return (
      <section aria-label="Sales over time" className="v-card v-bf flex min-w-0 flex-[3_1_480px] flex-col gap-4 px-[22px] pb-[18px] pt-[22px]" style={style}>
        <h2 className="v-h2">Tickets sold over time</h2>
        <div className="flex min-h-[190px] flex-col items-center justify-center gap-1 rounded-xl bg-[#F6F8FB] px-4 text-center">
          <p className="text-[15px] font-extrabold">No sales yet</p>
          <p className="v-hint">Your running total shows up here after the first ticket goes.</p>
        </div>
      </section>
    );
  }

  const { days, daily, cum, total, max, isToday } = data;
  const n = cum.length;
  const pct = (i) => (n === 1 ? 50 : (i / (n - 1)) * 100);
  const yOf = (i) => 100 - (cum[i] / max) * 100;
  const line = linePath(cum, max);
  const area = `${line} L${n === 1 ? 50 : 100} 100 L${n === 1 ? 50 : 0} 100 Z`;

  const indexOfDay = (iso) => {
    const d = new Date(iso);
    const k = dayKey(d);
    return days.findIndex((x) => dayKey(x) === k);
  };
  const marks = [
    ...soldOut
      .map((s) => ({ i: indexOfDay(s.at), text: `${s.name} sold out`, weight: 700 }))
      .filter((m) => m.i >= 0 && m.i < n - 1),
    { i: n - 1, text: `${total.toLocaleString("en-NG")} sold`, weight: 800, end: true },
  ].map((m) => ({ ...m, text: m.end ? m.text : `${cum[m.i].toLocaleString("en-NG")} · ${m.text}` }));

  const h = hi !== null && hi < n ? hi : null;
  const hiShift = h === null ? "-50%" : pct(h) < 12 ? "-12px" : pct(h) > 88 ? "calc(-100% + 12px)" : "-50%";
  const move = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const i = Math.round(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * (n - 1));
    if (i !== hi) setHi(i);
  };
  const key = (e) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const c = hi === null ? n - 1 : hi;
    setHi(Math.max(0, Math.min(n - 1, c + (e.key === "ArrowRight" ? 1 : -1))));
  };
  const first = dayLabel(days[0]);
  const lastLabel = isToday ? "Today" : dayLabel(days[n - 1]);

  return (
    <section aria-label="Sales over time" className="v-card v-bf flex min-w-0 flex-[3_1_480px] flex-col gap-4 px-[22px] pb-[18px] pt-[22px]" style={style}>
      <div className="flex items-start gap-3">
        <div className="flex flex-grow flex-col gap-1">
          <h2 className="v-h2">Tickets sold over time</h2>
          <span className="v-hint">Running total since the first sale on {first}</span>
        </div>
        <button type="button" className="v-viz-toggle" aria-pressed={table} onClick={() => setTable((t) => !t)}>
          {table ? "Show chart" : "Show table"}
        </button>
      </div>

      {!table ? (
        <figure className="m-0 flex flex-col gap-2.5">
          <div className="relative mt-7 h-[190px]">
            <div className="v-reveal absolute inset-0">
              <svg viewBox="0 0 100 100" preserveAspectRatio="none" width="100%" height="100%" aria-hidden="true" className="block overflow-visible">
                <path d={area} fill="#E8EEFE" />
                <path d={line} fill="none" stroke="#3669F6" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
              </svg>
            </div>
            {marks.map((m) => (
              <span key={`${m.i}-${m.text}`} aria-hidden="true">
                <span
                  className="v-fade absolute rounded-full bg-brand"
                  style={{ left: `${pct(m.i)}%`, top: `${yOf(m.i)}%`, width: m.end ? 10 : 8, height: m.end ? 10 : 8, translate: "-50% -50%", boxShadow: "0 0 0 2px #FFFFFF" }}
                />
                <span
                  className="v-fade absolute whitespace-nowrap text-[13px] text-ink"
                  style={{ left: `${pct(m.i)}%`, top: `${yOf(m.i)}%`, translate: `${m.end || pct(m.i) > 70 ? "-100%" : pct(m.i) < 20 ? "0%" : "-50%"} calc(-100% - 10px)`, fontWeight: m.weight }}
                >
                  {m.text}
                </span>
              </span>
            ))}
            {h !== null && (
              <>
                <div aria-hidden="true" className="pointer-events-none absolute h-[22px] w-[22px] rounded-full bg-[rgba(54,105,246,.16)]" style={{ left: `${pct(h)}%`, top: `${yOf(h)}%`, translate: "-50% -50%" }} />
                <div aria-hidden="true" className="pointer-events-none absolute h-2.5 w-2.5 rounded-full bg-brand" style={{ left: `${pct(h)}%`, top: `${yOf(h)}%`, translate: "-50% -50%", boxShadow: "0 0 0 2px #FFFFFF" }} />
                <div className="v-tip" style={{ left: `${pct(h)}%`, top: `${yOf(h)}%`, transform: `translate(${hiShift}, calc(-100% - 16px))` }}>
                  <b>{cum[h].toLocaleString("en-NG")} sold</b>
                  <span>{dayLabel(days[h])} · +{daily[h]} that day</span>
                </div>
              </>
            )}
            <div
              tabIndex={0}
              role="img"
              aria-label={`Running total of tickets sold from ${first} to ${lastLabel.toLowerCase() === "today" ? "today" : lastLabel}, now ${total}. Use left and right arrow keys to read each day.`}
              onMouseMove={move}
              onMouseLeave={() => setHi(null)}
              onKeyDown={key}
              onBlur={() => setHi(null)}
              className="absolute inset-x-0 -inset-y-2 rounded-lg"
            />
          </div>
          <div aria-hidden="true" className="flex justify-between text-[13px] text-muted">
            <span>{first}</span>
            <span>{lastLabel}</span>
          </div>
        </figure>
      ) : (
        <div className="max-h-[232px] overflow-auto rounded-xl bg-[#F6F8FB]">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th scope="col" className="v-th px-3.5 py-2 text-left">Day</th>
                <th scope="col" className="v-th px-3.5 py-2 text-right">Sold that day</th>
                <th scope="col" className="v-th px-3.5 py-2 text-right">Running total</th>
              </tr>
            </thead>
            <tbody>
              {days.map((d, i) => ({ d, i })).reverse().map(({ d, i }) => (
                <tr key={i} className="border-t border-hairline">
                  <td className="px-3.5 py-2">{dayLabel(d)}</td>
                  <td className="v-tab px-3.5 py-2 text-right">{daily[i]}</td>
                  <td className="v-tab px-3.5 py-2 text-right font-bold">{cum[i]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
