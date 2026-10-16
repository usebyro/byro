"use client";

import { useState } from "react";

// Area + line chart for the Overview's revenue card. Values are plain numbers,
// labels are already formatted ("Fri 9 Oct", "Q4 '25"). Start, peak and end are
// labelled on the line; hover or the arrow keys read any point.
export default function OverviewRevenueChart({ values, labels, format, compact, unit, periodName, endLabel, endSuffix }) {
  const [hi, setHi] = useState(null);
  const n = values.length;
  const top = Math.max(...values) * 1.12 || 1;
  const x = (i) => (n === 1 ? 50 : (i / (n - 1)) * 100);
  const y = (v) => 100 - (v / top) * 100;
  const line =
    n === 1
      ? `M0 ${y(values[0]).toFixed(2)} L100 ${y(values[0]).toFixed(2)}`
      : values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(2)} ${y(v).toFixed(2)}`).join(" ");
  const area = `${line} L100 100 L0 100 Z`;
  const short = (l) => l.replace(/^[A-Z][a-z]{2} /, "");

  const peak = values.indexOf(Math.max(...values));
  const mark = (i, text, weight) => ({
    i, text, weight,
    size: i === n - 1 ? 10 : 8,
    // Keep labels inside the chart: anchor left near the start, right near the end.
    shift: n === 1 ? "-50%" : i === 0 || x(i) < 20 ? "0" : i === n - 1 || x(i) > 80 ? "-100%" : "-50%",
  });
  const marks = n === 1
    ? [mark(0, `${compact(values[0])}${endSuffix}`, 800)]
    : [
        mark(0, compact(values[0]), 700),
        ...(peak !== 0 && peak !== n - 1 && values[peak] > 0 ? [mark(peak, `Peak ${compact(values[peak])} · ${short(labels[peak])}`, 800)] : []),
        mark(n - 1, `${compact(values[n - 1])}${endSuffix}`, 800),
      ];

  const point = hi !== null && hi < n ? hi : null;
  const move = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const i = Math.round(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * (n - 1));
    if (i !== hi) setHi(i);
  };
  const key = (e) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const c = point === null ? n - 1 : point;
    setHi(Math.max(0, Math.min(n - 1, c + (e.key === "ArrowRight" ? 1 : -1))));
  };
  const total = values.reduce((a, b) => a + b, 0);

  return (
    <figure className="m-0 flex flex-col gap-2.5">
      <div className="relative mt-7 h-[200px]">
        <div className="v-reveal absolute inset-0">
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" width="100%" height="100%" aria-hidden="true" className="block overflow-visible">
            <path d={area} fill="#E8EEFE" />
            <path d={line} fill="none" stroke="#3669F6" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          </svg>
        </div>
        {marks.map((m) => (
          <span key={m.i} aria-hidden="true">
            <span
              className="v-fade absolute rounded-full bg-brand shadow-[0_0_0_2px_#FFFFFF]"
              style={{ left: `${x(m.i)}%`, top: `${y(values[m.i])}%`, width: m.size, height: m.size, translate: "-50% -50%" }}
            />
            <span
              className="v-fade absolute whitespace-nowrap text-[13px] text-ink"
              style={{ left: `${x(m.i)}%`, top: `${y(values[m.i])}%`, translate: `${m.shift} calc(-100% - 10px)`, fontWeight: m.weight }}
            >
              {m.text}
            </span>
          </span>
        ))}
        {point !== null && (
          <>
            <div aria-hidden="true" className="pointer-events-none absolute h-[22px] w-[22px] rounded-full bg-[rgba(54,105,246,.16)]" style={{ left: `${x(point)}%`, top: `${y(values[point])}%`, translate: "-50% -50%" }} />
            <div aria-hidden="true" className="pointer-events-none absolute h-2.5 w-2.5 rounded-full bg-brand shadow-[0_0_0_2px_#FFFFFF]" style={{ left: `${x(point)}%`, top: `${y(values[point])}%`, translate: "-50% -50%" }} />
            <div
              className="v-tip"
              style={{
                left: `${x(point)}%`,
                top: `${y(values[point])}%`,
                transform: `translate(${x(point) < 12 ? "-16px" : x(point) > 88 ? "calc(-100% + 16px)" : "-50%"}, calc(-100% - 16px))`,
              }}
            >
              <b>{format(values[point])}</b>
              <span>{labels[point]}</span>
            </div>
          </>
        )}
        <div
          tabIndex={0}
          role="img"
          aria-label={`Revenue by ${unit}, ${periodName}. Total ${format(total)}. Use left and right arrow keys to read each ${unit}.`}
          onMouseMove={move}
          onMouseLeave={() => setHi(null)}
          onBlur={() => setHi(null)}
          onKeyDown={key}
          className="absolute inset-x-0 -inset-y-2 rounded-lg"
        />
        {point !== null && (
          <span className="sr-only" aria-live="polite">{`${labels[point]}: ${format(values[point])}`}</span>
        )}
      </div>
      <div aria-hidden="true" className="flex justify-between text-[13px] text-muted">
        <span>{short(labels[0])}</span>
        <span>{endLabel}</span>
      </div>
    </figure>
  );
}
