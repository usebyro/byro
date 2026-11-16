"use client";

import { useCallback, useEffect, useState } from "react";
import axiosInstance from "@/utils/axios";
import SectionError from "@/components/dashboard/v2/SectionError";
import { naira, shortDate } from "@/lib/merchOrders";

export const ACTIVITY_FILTERS = [
  ["all", "All"],
  ["tickets", "Tickets"],
  ["merch", "Merch"],
  ["refunds", "Refunds"],
];
const PAGE = 10;
const SOURCE_LABEL = { tickets: "Tickets", merch: "Merch", refunds: "Refunds", withdrawals: "Withdrawal" };

// "+₦12,000" for money in, "−₦5,000" for money out.
export const signedNaira = (amount) => {
  const n = Number(amount || 0);
  return `${n < 0 ? "−" : "+"}${naira(Math.abs(n))}`;
};

/** Everything that moved the balance, newest first, so a total on the Payouts page can always be explained. */
export default function MoneyActivity() {
  const [rows, setRows] = useState(null);
  const [failed, setFailed] = useState(false);
  const [filter, setFilter] = useState("all");
  const [shown, setShown] = useState(PAGE);

  const load = useCallback(() => {
    setFailed(false);
    axiosInstance
      .get("payouts/activity/")
      .then((res) => setRows(res.data?.results ?? []))
      .catch(() => setFailed(true));
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const count = (f) => (f === "all" ? rows?.length ?? 0 : (rows || []).filter((r) => r.source === f).length);
  const list = (rows || []).filter((r) => filter === "all" || r.source === filter);

  return (
    <section aria-label="Money activity" className="v-card v-bf min-w-0 overflow-hidden" style={{ "--i": 4 }}>
      <div className="flex flex-wrap items-center gap-3 px-[22px] py-5">
        <div className="flex min-w-0 grow flex-col gap-0.5">
          <h2 className="v-h2">Money activity</h2>
          <p className="v-hint m-0">Everything that changed your balance, newest first.</p>
        </div>
        {rows && rows.length > 0 && (
          <div role="group" aria-label="Filter activity" className="v-seg">
            {ACTIVITY_FILTERS.map(([value, label]) => (
              <button key={value} type="button" aria-pressed={filter === value} onClick={() => { setFilter(value); setShown(PAGE); }}>
                {label}
                <span className="n">{count(value)}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {failed ? (
        <SectionError what="your money activity" onRetry={load} />
      ) : rows === null ? (
        <div aria-busy="true" aria-label="Loading activity" className="flex flex-col gap-4 px-[22px] pb-5">
          {[0, 1, 2].map((i) => <span key={i} className="v-skel h-10 w-full" />)}
        </div>
      ) : list.length === 0 ? (
        <p className="v-hint m-0 px-[22px] pb-6">
          {rows.length === 0 ? "Nothing yet. Ticket sales, released merch money, refunds and withdrawals show up here." : "Nothing here yet."}
        </p>
      ) : (
        <>
          <ul className="m-0 list-none p-0">
            {list.slice(0, shown).map((r, i) => (
              <li key={`${r.at}-${i}`} className="flex items-center gap-3.5 border-t border-hairline px-[22px] py-3">
                <span className="v-tab w-[72px] shrink-0 text-[13px] text-muted">{shortDate(r.at)}</span>
                <span className="flex min-w-0 grow flex-col gap-0.5">
                  <span className="truncate text-[15px] font-bold">{r.description}</span>
                  {r.detail && <span className="v-hint truncate">{r.detail}</span>}
                </span>
                <span className="hidden shrink-0 rounded-full bg-[#F1F3F7] px-2.5 py-0.5 text-xs font-extrabold text-[#3B4252] sm:inline">{SOURCE_LABEL[r.source] || r.source}</span>
                <span className={`v-tab shrink-0 text-[15px] font-extrabold ${Number(r.amount) < 0 ? "text-body" : "text-[#1F7A52]"}`}>{signedNaira(r.amount)}</span>
              </li>
            ))}
          </ul>
          {list.length > shown && (
            <div className="border-t border-hairline px-[22px] py-3">
              <button type="button" className="v-btn v-btn-s v-btn-sm max-md:!h-11" onClick={() => setShown((n) => n + PAGE)}>Show more</button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
