"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import axiosInstance from "@/utils/axios";
import SectionError from "@/components/dashboard/v2/SectionError";
import { RELEASE_RULES, heldOrderLine, itemsText, merchFigures, naira } from "@/lib/merchOrders";

/** The merch money that is not withdrawable yet. Nothing shows for an organiser with no such money. */
export function MerchFigures({ merch }) {
  const figures = merchFigures(merch);
  if (!figures.length) return null;
  return (
    <dl aria-label="Merch money that is not available yet" className="m-0 grid gap-x-6 gap-y-3 [grid-template-columns:repeat(auto-fit,minmax(150px,1fr))]">
      {figures.map((f) => (
        <div key={f.key} className="flex min-w-0 flex-col gap-0.5">
          <dt className="v-hint">{f.label}</dt>
          <dd className="m-0 text-[19px] font-extrabold [font-variant-numeric:tabular-nums]">{naira(f.value)}</dd>
          <dd className="v-hint m-0">{f.note}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Shown when a refund after a payout has taken the balance below zero. */
export function ShortfallNotice({ shortfall }) {
  const amount = Number(shortfall || 0);
  if (amount <= 0) return null;
  return (
    <div role="status" className="rounded-2xl bg-[#FFF6E5] p-4 text-sm text-[#6B4A08]">
      <b className="block text-[15px] text-[#8A4B00]">{naira(amount)} from a refunded order is being taken from your next earnings.</b>
      You had already withdrawn that money when the buyer was refunded, so your next earnings cover it first. You can withdraw again once your balance is above ₦0.
    </div>
  );
}

/** A side sheet: what is in the balance, the rules for when merch money arrives, and the orders behind the held money. */
export function BalanceBreakdown({ balance, onClose }) {
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);
  const closeRef = useRef(null);

  const load = () => {
    setFailed(false);
    axiosInstance.get("dashboard/merch-orders/balance/").then((res) => setData(res.data)).catch(() => setFailed(true));
  };
  useEffect(() => {
    load();
    closeRef.current?.focus({ preventScroll: true });
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const merch = balance?.merch || {};
  const orders = (data?.orders || []).slice(0, 5);
  const more = (data?.order_count || 0) - orders.length;

  return (
    <div className="fixed inset-0 z-50 flex justify-end max-md:flex-col max-md:justify-end">
      <button type="button" aria-label="Close" onClick={onClose} tabIndex={-1} className="v-scrim absolute inset-0 cursor-pointer border-0 bg-[rgba(20,22,28,.28)]" />
      <aside role="dialog" aria-modal="true" aria-label="What's in your balance" className="v-sheet max-md:v-sheet-up relative box-border flex h-full w-[min(480px,100%)] flex-col gap-5 overflow-y-auto bg-white p-6 max-md:max-h-[92dvh] max-md:h-auto max-md:w-full max-md:rounded-t-3xl">
        <div className="flex items-start gap-3">
          <div className="flex min-w-0 flex-grow flex-col gap-1">
            <h2 className="v-h2 !text-[22px]">What&apos;s in your balance</h2>
            <p className="v-hint m-0">Only Available can be withdrawn.</p>
          </div>
          <button ref={closeRef} type="button" className="v-icon-btn ghost max-md:!h-11 max-md:!w-11" aria-label="Close" onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>

        <section aria-label="Tickets" className="flex flex-col gap-1.5">
          <h3 className="v-eyebrow m-0">Tickets</h3>
          <p className="m-0 text-sm text-body">Ticket money is available as soon as a ticket is sold.</p>
        </section>

        <section aria-label="Merch" className="flex flex-col gap-3">
          <h3 className="v-eyebrow m-0">Merch</h3>
          <MerchFigures merch={merch} />
          {merchFigures(merch).length === 0 && <p className="m-0 text-sm text-body">Nothing is waiting. Merch money joins your balance once an order is complete.</p>}
          <div className="flex flex-col gap-1.5 rounded-2xl bg-[#F6F8FB] p-3.5">
            <b className="text-sm">When merch money becomes available</b>
            <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[13px] text-body">
              {RELEASE_RULES.map((r) => <li key={r}>{r}</li>)}
            </ul>
            <span className="v-hint">The last three only if the buyer hasn&apos;t reported a problem. A reported problem puts that order On hold while Byro reviews it.</span>
          </div>
        </section>

        <section aria-label="Orders behind these figures" className="flex flex-col gap-3">
          <h3 className="v-eyebrow m-0">Orders behind these figures</h3>
          {failed ? (
            <SectionError what="these orders" onRetry={load} />
          ) : !data ? (
            <div aria-busy="true" aria-label="Loading orders" className="flex flex-col gap-3"><span className="v-skel h-12 w-full" /><span className="v-skel h-12 w-full" /></div>
          ) : orders.length === 0 ? (
            <p className="m-0 text-sm text-body">No merch orders are waiting.</p>
          ) : (
            <>
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {orders.map((o) => (
                  <li key={o.ref}>
                    <Link href="/dashboard/merch?tab=orders" className="flex items-start gap-3 rounded-xl bg-[#F7F9FC] px-3.5 py-3 hover:bg-[#F1F4FA]">
                      <span className="flex min-w-0 flex-grow flex-col gap-0.5">
                        <span className="flex gap-2 text-sm font-extrabold"><span>{o.buyer.first}</span><span className="v-tab font-medium text-muted">{o.ref}</span></span>
                        <span className="v-hint truncate">{itemsText(o)}</span>
                        <span className="text-[13px] text-body">{heldOrderLine(o)}</span>
                      </span>
                      <span className="v-tab text-[15px] font-extrabold">{naira(o.earnings)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
              {more > 0 && <Link href="/dashboard/merch?tab=orders" className="text-sm font-bold text-brand-dark">See all {data.order_count} orders</Link>}
            </>
          )}
        </section>
      </aside>
    </div>
  );
}
