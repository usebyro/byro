"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import axiosInstance from "@/utils/axios";
import SectionError from "@/components/dashboard/v2/SectionError";
import BusyButton from "@/components/dashboard/v2/BusyButton";
import Sheet from "@/components/merch/Sheet";
import {
  BULK_HINT, BULK_LABEL, REPORT_REASON, bulkKey, dateTime, itemsText, naira, nextStep, packingSlip,
  releaseLine, shortDate, dayMonth, statusOf,
} from "@/lib/merchOrders";

const FILTERS = [
  ["need", "Needs action"],
  ["shipped", "Ready or shipped"],
  ["done", "Completed"],
  ["all", "All"],
];
const POLL_MS = 60_000;

const errorText = (err, fallback) => err?.response?.data?.error || fallback;

function Icon({ path, size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={path} />
    </svg>
  );
}
const PIN = "M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z";
const TRUCK = "M3 6h11v10H3zM14 9h4l3 3v4h-7";

function TypeTag({ fulfilment }) {
  const pickup = fulfilment === "pickup";
  return (
    <span className="inline-flex h-6 items-center gap-1.5 rounded-full bg-[#F1F3F7] px-2.5 text-xs font-extrabold text-[#3B4252]">
      <Icon path={pickup ? PIN : TRUCK} size={12} />
      {pickup ? "Pickup" : "Delivery"}
    </span>
  );
}

function Status({ order }) {
  const [text, ink, dot] = statusOf(order);
  return (
    <span className={`v-status ${ink}`}>
      <span className={`v-dot ${dot}`} />
      {text}
    </span>
  );
}

// The list's filter, search and open order live in the address bar, so a refresh, a shared link or a
// notification lands where you were, and an order can be opened in a new tab.
const urlParam = (key) => (typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get(key) || "");
function syncUrl(changes) {
  const url = new URL(window.location.href);
  Object.entries(changes).forEach(([key, value]) => (value ? url.searchParams.set(key, value) : url.searchParams.delete(key)));
  window.history.replaceState(null, "", url);
}
const orderHref = (ref) => {
  const url = new URL(window.location.href);
  url.searchParams.set("tab", "orders");
  url.searchParams.set("order", ref);
  return `${url.pathname}${url.search}`;
};

export default function MerchOrders({ onChanged }) {
  const [filter, setFilter] = useState(() => (FILTERS.some(([value]) => value === urlParam("filter")) ? urlParam("filter") : "need"));
  const [q, setQ] = useState(() => urlParam("q"));
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [sel, setSel] = useState([]);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkCourier, setBulkCourier] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);

  const [openRef, setOpenRef] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailFailed, setDetailFailed] = useState(false);
  const req = useRef(0);

  // ---- the list ---------------------------------------------------------
  const load = useCallback(
    async (silent = false) => {
      const mine = ++req.current;
      if (!silent) setLoading(true);
      try {
        const { data: res } = await axiosInstance.get("dashboard/merch-orders/", { params: { filter, q: q.trim() || undefined } });
        if (mine !== req.current) return;
        setData(res);
        setFailed(false);
        onChanged?.(res.counts?.need ?? 0);
        window.dispatchEvent(new CustomEvent("byro:merch-need", { detail: res.counts?.need ?? 0 }));
      } catch {
        if (mine === req.current && !silent) setFailed(true);
      } finally {
        if (mine === req.current && !silent) setLoading(false);
      }
    },
    [filter, q, onChanged]
  );

  useEffect(() => {
    const t = setTimeout(() => load(), q ? 250 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  useEffect(() => {
    const refresh = () => document.visibilityState !== "hidden" && load(true);
    window.addEventListener("focus", refresh);
    const timer = setInterval(refresh, POLL_MS);
    return () => {
      window.removeEventListener("focus", refresh);
      clearInterval(timer);
    };
  }, [load]);

  // ---- bulk -------------------------------------------------------------
  const rows = data?.results || [];
  const byRef = Object.fromEntries(rows.map((o) => [o.ref, o]));
  const selKey = sel.length ? bulkKey(byRef[sel[0]] || {}) : "";
  const canSelect = (o) => bulkKey(o) && (!selKey || selKey === bulkKey(o));
  const toggle = (ref) => setSel((s) => (s.includes(ref) ? s.filter((r) => r !== ref) : [...s, ref]));

  const runBulk = async () => {
    setBulkBusy(true);
    try {
      const { data: res } = await axiosInstance.post("dashboard/merch-orders/bulk/", {
        action: selKey, refs: sel, courier: selKey === "ship" ? bulkCourier.trim() : "",
      });
      const done = res.done?.length || 0;
      toast.success(`${done} ${done === 1 ? "order" : "orders"} updated`, {
        description: selKey === "pack" ? undefined : "Buyers have been emailed.",
      });
      if (res.failed?.length) toast.error(`${res.failed.length} could not be updated`, { description: res.failed[0].error });
      setSel([]);
      setBulkOpen(false);
      setBulkCourier("");
      load(true);
    } catch (err) {
      toast.error("Couldn't update those orders", { description: errorText(err, "Check your connection and try again.") });
    } finally {
      setBulkBusy(false);
    }
  };

  // ---- one order --------------------------------------------------------
  const openOrder = (ref) => {
    syncUrl({ order: ref });
    setOpenRef(ref);
    setDetail(null);
    setDetailFailed(false);
    axiosInstance
      .get(`dashboard/merch-orders/${ref}/`)
      .then((res) => setDetail(res.data))
      .catch(() => setDetailFailed(true));
  };
  const closeOrder = () => {
    syncUrl({ order: "" });
    setOpenRef(null);
    setDetail(null);
  };

  // A link with ?order=BY-0003 opens that order.
  useEffect(() => {
    const ref = urlParam("order");
    if (ref) openOrder(ref);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    syncUrl({ filter: filter === "need" ? "" : filter, q: q.trim() });
  }, [filter, q]);

  const summary = data?.counts;
  const money = data?.money;
  const hasAny = (summary?.all ?? 0) > 0;
  const searching = !!q.trim();

  return (
    <div className="flex flex-col gap-5">
      {hasAny && (
        <section aria-label="Summary" className="v-card v-bf flex flex-col gap-5 p-5" style={{ "--i": 1 }}>
          <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
            <Figure label="Needs action" value={String(summary.need)} />
            <Figure label="Ready or shipped" value={String(summary.shipped)} />
          </div>
          <div className="flex flex-col gap-3 border-t border-hairline pt-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-col">
                <h2 className="m-0 text-[15px] font-extrabold">Merch earnings</h2>
                {Number(data?.fee_rate) > 0 && <span className="v-hint">After Byro&apos;s fee</span>}
              </div>
              <Link href="/dashboard/payouts" className="v-btn v-btn-s v-btn-sm max-md:!h-11">Withdraw</Link>
            </div>
            <div className="grid gap-1 rounded-2xl bg-[#F6F8FB] p-1 min-[900px]:grid-cols-3">
              <MoneyRow href="/dashboard/payouts" label="Ready to withdraw" value={naira(money?.available)} />
              <MoneyRow href="/dashboard/payouts" label="Releasing soon" value={naira(money?.releasing)} note={money?.next_release_at ? `Next release ${dayMonth(money.next_release_at)}` : "After each order's safety window"} />
              <MoneyRow onClick={() => { setFilter("need"); setQ(""); setSel([]); }} label="Orders still to hand over" value={naira(money?.not_released)} note="Pack, get ready or ship them" />
            </div>
          </div>
        </section>
      )}

      <section aria-label="Orders" className="v-card v-bf overflow-hidden" style={{ "--i": 2 }}>
        <div className="flex flex-wrap items-center gap-3 border-b border-hairline p-4">
          <div role="group" aria-label="Show" className="v-seg">
            {FILTERS.map(([value, label]) => (
              <button key={value} type="button" aria-pressed={filter === value && !searching} onClick={() => { setFilter(value); setQ(""); setSel([]); }}>
                {label}
                {summary && <span className="n">{summary[value]}</span>}
              </button>
            ))}
          </div>
          <label className="v-search min-w-0 flex-[1_1_220px] sm:ml-auto sm:flex-[0_1_300px]">
            <Icon path="M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-3.5-3.5" />
            <input type="search" value={q} onChange={(e) => { setQ(e.target.value); setSel([]); }} placeholder="Search by name or order number" aria-label="Search orders" />
          </label>
        </div>

        {sel.length > 0 && (
          <div role="region" aria-label="Selected orders" className="flex flex-wrap items-center gap-3 border-b border-hairline bg-[#F5F8FF] px-4 py-3">
            <span className="text-sm font-extrabold">{sel.length} selected</span>
            <button type="button" className="v-btn v-btn-s v-btn-sm max-md:!h-11" onClick={() => setSel([])}>Clear</button>
            <button type="button" className="v-btn v-btn-p v-btn-sm max-md:!h-11 ml-auto" onClick={() => setBulkOpen(true)}>{BULK_LABEL[selKey](sel.length)}</button>
          </div>
        )}

        {loading && !data ? (
          <div className="flex flex-col gap-4 p-5" aria-busy="true" aria-label="Loading orders">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3.5">
                <span className="v-skel h-9 w-9 shrink-0 !rounded-full" />
                <span className="flex flex-grow flex-col gap-2">
                  <span className="v-skel h-3.5 w-44 max-w-full" />
                  <span className="v-skel h-3 w-64 max-w-full" />
                </span>
              </div>
            ))}
          </div>
        ) : failed ? (
          <SectionError what="your orders" onRetry={() => load()} />
        ) : rows.length === 0 ? (
          <Empty hasAny={hasAny} searching={searching} q={q.trim()} filter={filter} onAll={() => setFilter("all")} onClear={() => setQ("")} />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="v-stack w-full min-w-[820px] border-collapse">
                <thead>
                  <tr className="border-b border-hairline">
                    <th scope="col" className="w-12 px-5 py-3.5"><span className="sr-only">Select</span></th>
                    <th scope="col" className="v-th px-3 py-3.5 text-left">Order</th>
                    <th scope="col" className="v-th px-3 py-3.5 text-left">Items</th>
                    <th scope="col" className="v-th px-3 py-3.5 text-right">Paid</th>
                    <th scope="col" className="v-th px-3 py-3.5 text-left">Date</th>
                    <th scope="col" className="v-th py-3.5 pl-6 pr-5 text-left">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((o, i) => {
                    const selectable = canSelect(o);
                    return (
                      <tr key={o.ref} className="v-row v-al border-b border-hairline last:border-b-0" style={{ "--i": Math.min(i, 10) }}>
                        <td className="px-5 py-3 max-md:hidden">
                          {bulkKey(o) ? (
                            <label className="-m-3 flex h-11 w-11 cursor-pointer items-center justify-center has-[:disabled]:cursor-not-allowed">
                              <input
                                type="checkbox"
                                checked={sel.includes(o.ref)}
                                disabled={!selectable}
                                onChange={() => toggle(o.ref)}
                                aria-label={`Select order ${o.ref}`}
                                title={selectable ? undefined : "Orders move together only when they are at the same step"}
                                className="h-[18px] w-[18px] rounded border-[#CBD3DF] text-brand focus:ring-brand/30 disabled:opacity-40"
                              />
                            </label>
                          ) : null}
                        </td>
                        <td className="px-3 py-3">
                          <a href={orderHref(o.ref)} onClick={(e) => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return; e.preventDefault(); openOrder(o.ref); }} aria-label={`Open order ${o.ref} from ${o.buyer.first}, ${statusOf(o)[0]}`} className="flex min-w-0 flex-col items-start gap-1 rounded-lg text-left">
                            <span className="flex flex-wrap items-center gap-2">
                              <span className="text-[15px] font-extrabold">{o.buyer.first || o.buyer.name}</span>
                              <span className="v-tab text-xs text-muted">{o.ref}</span>
                              <TypeTag fulfilment={o.fulfilment} />
                            </span>
                            {o.late && <span className="text-xs font-bold text-[#8A4B00]">{o.late}</span>}
                            {o.auto_cancel_on && o.days_waiting >= 10 && (
                              <span className="text-xs font-bold text-[#B42318]">Byro cancels on {dayMonth(o.auto_cancel_on)}</span>
                            )}
                          </a>
                        </td>
                        <td data-l="Items" className="max-w-[300px] px-3 py-3 text-sm text-body">
                          <span className="line-clamp-2 break-words">{itemsText(o)}</span>
                        </td>
                        <td data-l="Paid" className="v-tab whitespace-nowrap p-3 text-right text-[15px] font-extrabold">{naira(o.subtotal)}</td>
                        <td data-l="Date" className="whitespace-nowrap p-3 text-sm text-body">{shortDate(o.paid_at)}</td>
                        <td data-l="Status" className="py-3 pl-6 pr-5"><Status order={o} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="v-hint m-0 px-5 py-3.5">
              {rows.length} {rows.length === 1 ? "order" : "orders"}, newest first.
              {!searching && filter === "need" && sel.length === 0 && " Tick orders at the same step to move them on together."}
            </p>
          </>
        )}
      </section>

      {bulkOpen && (
        <Sheet title={BULK_LABEL[selKey](sel.length)} onClose={() => setBulkOpen(false)}>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {sel.map((ref) => byRef[ref] && (
              <li key={ref} className="flex flex-col gap-0.5 rounded-xl bg-[#F7F9FC] px-3.5 py-2.5">
                <span className="flex gap-2 text-sm font-extrabold"><span>{byRef[ref].buyer.first}</span><span className="v-tab font-medium text-muted">{ref}</span></span>
                <span className="v-hint">{itemsText(byRef[ref])}</span>
              </li>
            ))}
          </ul>
          {selKey === "ship" && (
            <label className="flex flex-col gap-2">
              <span className="v-lbl">Courier for all <span className="font-medium text-muted">(optional)</span></span>
              <input className="v-input" value={bulkCourier} onChange={(e) => setBulkCourier(e.target.value)} placeholder="GIG Logistics" maxLength={120} />
            </label>
          )}
          <p className="v-hint m-0">{BULK_HINT[selKey]}</p>
          <div className="mt-auto flex justify-end gap-2 pt-2">
            <button type="button" className="v-btn v-btn-s v-btn-lg" onClick={() => setBulkOpen(false)}>Cancel</button>
            <BusyButton type="button" className="v-btn v-btn-p v-btn-lg" busy={bulkBusy} busyLabel="Saving" onClick={runBulk}>{BULK_LABEL[selKey](sel.length)}</BusyButton>
          </div>
        </Sheet>
      )}

      {openRef && (
        <Sheet title={`Order ${openRef}`} subtitle={detail ? `Paid ${dateTime(detail.paid_at)}` : ""} onClose={closeOrder} wide>
          {detailFailed ? (
            <SectionError what="this order" onRetry={() => openOrder(openRef)} />
          ) : !detail ? (
            <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading order">
              <span className="v-skel h-24 w-full !rounded-2xl" />
              <span className="v-skel h-4 w-48" />
              <span className="v-skel h-4 w-64 max-w-full" />
            </div>
          ) : (
            <OrderDetail
              order={detail}
              onChange={(next) => {
                setDetail(next);
                load(true);
              }}
            />
          )}
        </Sheet>
      )}
    </div>
  );
}

// One line of the merch money: a link to Payouts, or a button that filters the list.
function MoneyRow({ href, onClick, label, value, note }) {
  const body = (
    <>
      <span className="flex min-w-0 grow flex-col gap-px">
        <span className="text-sm font-extrabold">{label}</span>
        {note && <span className="v-hint">{note}</span>}
      </span>
      <span className="whitespace-nowrap text-lg font-extrabold [font-variant-numeric:tabular-nums]">{value}</span>
      <svg className="shrink-0 text-[#646B7A]" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
    </>
  );
  const cls = "flex min-h-16 w-full items-center gap-2.5 rounded-xl border-0 bg-transparent py-2.5 pl-3.5 pr-3 text-left text-ink no-underline transition-colors hover:bg-white focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-1 focus-visible:outline-brand";
  return href ? <Link href={href} className={cls}>{body}</Link> : <button type="button" onClick={onClick} className={cls}>{body}</button>;
}

function Figure({ label, value, note }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="v-hint">{label}</span>
      <span className="v-fig v-tab">{value}</span>
      {note && <span className="v-hint">{note}</span>}
    </div>
  );
}

function Empty({ hasAny, searching, q, filter, onAll, onClear }) {
  let title = "No orders yet";
  let body = "When someone buys merch on your profile and pays, their order shows up here, ready for you to prepare.";
  let action = null;
  if (searching) {
    title = `No orders match “${q}”`;
    body = "Try a first name or an order number like BY-0012. Search looks at every status.";
    action = <button type="button" className="v-btn v-btn-s mt-2" onClick={onClear}>Clear search</button>;
  } else if (hasAny && filter === "need") {
    title = "Nothing to do right now";
    body = "Every paid order has been started. New orders will show up here.";
    action = <button type="button" className="v-btn v-btn-s mt-2" onClick={onAll}>See all orders</button>;
  } else if (hasAny) {
    title = "Nothing here yet";
    body = "Orders at this step will show up here.";
  }
  return (
    <div className="flex flex-col items-center gap-2 px-5 py-12 text-center">
      <p className="v-h2 !text-[17px]">{title}</p>
      <p className="v-hint max-w-sm">{body}</p>
      {action}
    </div>
  );
}

function OrderDetail({ order: o, onChange }) {
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [shipping, setShipping] = useState(false);
  const [courier, setCourier] = useState("");
  const [tracking, setTracking] = useState("");
  const [code, setCode] = useState("");
  const [confirming, setConfirming] = useState(""); // "cancel" | "cant"
  const [reason, setReason] = useState("");
  const [copied, setCopied] = useState("");

  const first = o.buyer.first || "the buyer";
  const pickup = o.fulfilment === "pickup";
  const next = nextStep(o);
  const live = ["paid", "packed", "shipped", "ready"].includes(o.status);
  const done = ["delivered", "picked_up"].includes(o.status);
  const terminal = ["cancelled", "refunded", "refund_processing"].includes(o.status);
  const fee = Number(o.fee || 0);
  const delFee = Number(o.delivery_fee || 0);
  const refundTotal = Number(o.subtotal) + delFee;
  const release = releaseLine(o);

  const run = async (action, extra = {}, doneText) => {
    setBusy(action);
    setError("");
    try {
      const { data } = await axiosInstance.post(`dashboard/merch-orders/${o.ref}/action/`, { action, ...extra });
      onChange(data);
      setShipping(false);
      setConfirming("");
      setCode("");
      toast.success(doneText || `${o.ref} updated`);
    } catch (err) {
      setError(errorText(err, "That didn't save. Check your connection and try again."));
    } finally {
      setBusy("");
    }
  };

  const onNext = () => {
    if (!next) return;
    const action = next[3];
    if (action === "ship" && !shipping) return setShipping(true);
    if (action === "ship") return run("ship", { courier: courier.trim(), tracking: tracking.trim() }, `${o.ref} marked as shipped`);
    if (action === "picked_up") return run("picked_up", { code: code.trim() }, `${o.ref} marked as picked up`);
    return run(action, {}, `${o.ref} updated`);
  };

  const copy = async (what, text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(""), 1800);
    } catch {
      toast.error("Couldn't copy", { description: "Select the text and copy it yourself." });
    }
  };

  const print = () => {
    const frame = document.createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
    document.body.appendChild(frame);
    const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
    frame.contentDocument.write(`<pre style="font:16px/1.6 system-ui,sans-serif;white-space:pre-wrap;margin:24px">${esc(packingSlip(o))}</pre>`);
    frame.contentDocument.close();
    frame.contentWindow.focus();
    frame.contentWindow.print();
    setTimeout(() => frame.remove(), 1500);
  };

  const phoneDigits = (o.buyer.phone || "").replace(/\D/g, "");
  const whatsapp = phoneDigits ? `https://wa.me/${phoneDigits.startsWith("0") ? `234${phoneDigits.slice(1)}` : phoneDigits}` : "";

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2.5">
        <TypeTag fulfilment={o.fulfilment} />
        <Status order={o} />
      </div>

      {o.problem && !o.problem.resolved && (
        <div role="status" className="flex flex-col gap-1.5 rounded-2xl bg-[#FDF1F0] p-4 text-[#8F1D14]">
          <b className="text-[15px]">{first} reported a problem: {REPORT_REASON[o.problem.reason] || o.problem.reason}</b>
          {o.problem.note && <span className="text-sm">“{o.problem.note}”</span>}
          <span className="text-[13px]">Byro is reviewing this. We&apos;ll email you and {first} when Byro has decided. This order&apos;s earnings stay on hold until then. If you have proof of delivery, reply to that email with it.</span>
        </div>
      )}

      {live && next && !confirming && (
        <section className="flex flex-col gap-3 rounded-2xl bg-[#F5F8FF] p-4" aria-label="Next step">
          <div className="flex flex-col gap-0.5">
            <h3 className="m-0 text-[16px] font-extrabold">{shipping ? "Shipping details" : next[0]}</h3>
            <p className="v-hint m-0">{shipping ? `Both are optional. ${first} sees them on their order page.` : next[1]}</p>
          </div>
          {shipping && (
            <>
              <label className="flex flex-col gap-1.5">
                <span className="v-lbl">Courier <span className="font-medium text-muted">(optional)</span></span>
                <input className="v-input" value={courier} onChange={(e) => setCourier(e.target.value)} placeholder="GIG Logistics, a dispatch rider, or Hand delivered" maxLength={120} />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="v-lbl">Tracking number or waybill <span className="font-medium text-muted">(optional)</span></span>
                <input className="v-input" value={tracking} onChange={(e) => setTracking(e.target.value)} maxLength={120} />
              </label>
              <p className="v-hint m-0">{first} gets an email when you mark this shipped.</p>
            </>
          )}
          {next[3] === "picked_up" && (
            <label className="flex flex-col gap-1.5">
              <span className="v-lbl">Code from {first} <span className="font-medium text-muted">(optional)</span></span>
              <input className="v-input v-tab max-w-[160px] tracking-[.2em]" inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="4 digits" aria-describedby="code-hint" />
              <span id="code-hint" className="v-hint">With the code, the money is released straight away. Without it, 3 days later.</span>
            </label>
          )}
          {next[3] === "ready" && <p className="v-hint m-0">{first} gets an email with the pickup address and instructions.</p>}
          <div className="flex flex-wrap items-center gap-2">
            <BusyButton type="button" className="v-btn v-btn-p v-btn-lg" busy={!!busy && busy === next[3]} busyLabel="Saving" onClick={onNext}>
              {shipping ? "Confirm shipped" : next[2]}
            </BusyButton>
            {shipping && <button type="button" className="v-btn v-btn-s v-btn-lg" onClick={() => setShipping(false)}>Back</button>}
          </div>
        </section>
      )}

      {(done || terminal) && (
        <div className={`flex flex-col gap-0.5 rounded-2xl p-4 ${done ? "bg-[#E9F7EF]" : "bg-[#F3F6FB]"}`}>
          <b className="text-[15px]">
            {o.status === "picked_up" ? "Picked up" : o.status === "delivered" ? "Delivered" : o.status === "cancelled" ? "Cancelled" : o.status === "refunded" ? "Refunded" : "Cancelled, refund on its way"}
          </b>
          <span className="text-sm text-body">
            {done
              ? "All done. Nothing more to do on this order."
              : o.status === "refund_processing"
                ? `${first} is getting ${naira(o.refund_amount)} back. Banks usually show it within 3 to 10 working days. Nothing more for you to do.`
                : `${first} got ${naira(o.refund_amount)} back.`}
          </span>
          {o.cancel_reason && terminal && <span className="v-hint">Reason: {o.cancel_reason}</span>}
        </div>
      )}

      {error && <p role="alert" className="m-0 text-sm font-bold text-[#B42318]">{error}</p>}

      {confirming && (
        <section className="flex flex-col gap-3 rounded-2xl border border-[#F4C7C3] p-4" aria-label={confirming === "cancel" ? "Cancel and refund" : "Mark as not delivered"}>
          <h3 className="m-0 text-[16px] font-extrabold">{confirming === "cancel" ? "Cancel and refund this order?" : "Mark this order as not delivered?"}</h3>
          <p className="m-0 text-sm text-body">
            {first} gets <b>{naira(refundTotal)}</b> back{delFee > 0 ? ` (items ${naira(o.subtotal)} and delivery ${naira(delFee)})` : ""}, to the card or bank account they paid with.
            Banks usually show it within 3 to 10 working days. Byro&apos;s fee and the payment charge can&apos;t be refunded.
            {confirming === "cancel" ? " The items go back into your stock." : " The items are not added back to your stock."}
          </p>
          <label className="flex flex-col gap-1.5">
            <span className="v-lbl">Reason for {first} <span className="font-medium text-muted">(optional)</span></span>
            <input className="v-input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={confirming === "cancel" ? "Sorry, the hoodie sold out in your size" : "The rider could not reach you"} maxLength={300} />
          </label>
          <div className="flex flex-wrap gap-2">
            <BusyButton
              type="button"
              className="v-btn v-btn-danger v-btn-lg"
              busy={busy === (confirming === "cancel" ? "cancel" : "cant_deliver")}
              busyLabel="Refunding"
              onClick={() => run(confirming === "cancel" ? "cancel" : "cant_deliver", { reason: reason.trim() }, "Order cancelled. The refund is on its way.")}
            >
              Cancel and refund {naira(refundTotal)}
            </BusyButton>
            <button type="button" className="v-btn v-btn-s v-btn-lg" onClick={() => setConfirming("")}>Keep the order</button>
          </div>
        </section>
      )}

      <Steps order={o} />

      <section aria-label="Buyer" className="flex flex-col gap-2.5">
        <h3 className="v-eyebrow m-0">Buyer</h3>
        <span className="text-[15px] font-extrabold">{o.buyer.name}</span>
        {o.buyer.phone ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="v-tab text-sm">{o.buyer.phone}</span>
            <a className="v-btn v-btn-s v-btn-sm max-md:!h-11" href={`tel:${o.buyer.phone.replace(/\s+/g, "")}`}>Call</a>
            {whatsapp && <a className="v-btn v-btn-s v-btn-sm max-md:!h-11" href={whatsapp} target="_blank" rel="noopener noreferrer">WhatsApp</a>}
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <span className="v-hint">No phone number given.</span>
            <a className="v-btn v-btn-s v-btn-sm max-md:!h-11" href={`mailto:${o.buyer.email}`}>Email {first}</a>
          </div>
        )}
        {o.buyer.note && (
          <div className="rounded-xl bg-[#FFFAEB] p-3 text-sm"><span className="mb-0.5 block text-[13px] font-bold text-[#8A4B00]">Note from {first}</span>{o.buyer.note}</div>
        )}
      </section>

      <section aria-label={pickup ? "Pickup" : "Delivery address"} className="flex flex-col gap-2">
        <h3 className="v-eyebrow m-0">{pickup ? "Picking up from you at" : "Deliver to"}</h3>
        {pickup ? (
          <>
            <span className="text-sm font-extrabold">{o.pickup?.address}</span>
            {o.pickup?.instructions && <span className="v-hint">{o.pickup.instructions}</span>}
          </>
        ) : (
          <div className="flex items-start gap-3">
            <p className="m-0 min-w-0 flex-grow whitespace-pre-line break-words text-sm">{o.delivery_address}</p>
            <button type="button" className="v-btn v-btn-s v-btn-sm max-md:!h-11 shrink-0" onClick={() => copy("address", o.delivery_address)}>{copied === "address" ? "Copied" : "Copy"}</button>
          </div>
        )}
      </section>

      <section aria-label="Items and money" className="flex flex-col gap-3">
        <h3 className="v-eyebrow m-0">Items</h3>
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {o.items.map((it, i) => (
            <li key={i} className="flex items-baseline gap-3 text-sm">
              <span className="min-w-0 flex-grow break-words"><b>{it.name}</b>{it.option && <span className="text-muted"> ({it.option})</span>}</span>
              <span className="v-tab text-muted">×{it.quantity}</span>
              <span className="v-tab font-extrabold">{naira(it.total)}</span>
            </li>
          ))}
        </ul>
        <div className="flex flex-col gap-1.5 border-t border-hairline pt-3 text-sm">
          <Row label="Items" value={naira(o.subtotal)} />
          {fee > 0 && <Row label={`Byro fee (${Math.round(Number(o.fee_rate) * 1000) / 10}% of items)`} value={`−${naira(fee)}`} />}
          {delFee > 0 && <Row label="Delivery fee" value={`+${naira(delFee)}`} />}
          <Row label="You get" value={naira(o.earnings)} strong />
          {release && <p className="v-hint m-0 pt-1">{release}</p>}
          <p className="v-hint m-0">{first} paid {naira(o.amount)}{" "}before the payment charge.</p>
        </div>
      </section>

      <section aria-label="More" className="flex flex-col gap-2.5 border-t border-hairline pt-4">
        <div className="flex flex-wrap gap-2">
          <button type="button" className="v-btn v-btn-s" onClick={() => copy("slip", packingSlip(o))}>{copied === "slip" ? "Packing slip copied" : "Copy packing slip"}</button>
          <button type="button" className="v-btn v-btn-s" onClick={print}>Print packing slip</button>
        </div>
        {o.can_cancel && !confirming && (
          <button type="button" className="v-btn v-btn-t self-start !px-0 !text-[#B42318]" onClick={() => { setConfirming("cancel"); setError(""); }}>Cancel and refund this order</button>
        )}
        {o.can_cant_deliver && !confirming && (
          <button type="button" className="v-btn v-btn-t self-start !px-0 !text-[#B42318]" onClick={() => { setConfirming("cant"); setError(""); }}>Can&apos;t deliver this order</button>
        )}
      </section>
    </div>
  );
}

function Row({ label, value, strong = false }) {
  return (
    <div className={`flex justify-between gap-3 ${strong ? "text-[15px] font-extrabold" : ""}`}>
      <span className={strong ? "" : "text-muted"}>{label}</span>
      <span className="v-tab">{value}</span>
    </div>
  );
}

function Steps({ order: o }) {
  if (["cancelled", "refunded", "refund_processing"].includes(o.status)) return null;
  const nextIdx = o.steps.findIndex((s) => !s.at);
  return (
    <ol aria-label="Order progress" className="m-0 flex list-none flex-col gap-0 p-0">
      {o.steps.map((s, i) => {
        const doneStep = !!s.at;
        const current = i === nextIdx;
        return (
          <li key={s.key} aria-current={current ? "step" : undefined} className="flex gap-3.5">
            <span className="flex flex-col items-center">
              <span
                aria-hidden="true"
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-extrabold ${
                  doneStep ? "bg-[#2F9E6E] text-white" : current ? "bg-white text-[#2451D6] shadow-[inset_0_0_0_2px_#3669F6]" : "bg-white text-[#5B6272] shadow-[inset_0_0_0_2px_#E3E8F0]"
                }`}
              >
                {doneStep ? "✓" : i + 1}
              </span>
              {i < o.steps.length - 1 && <span aria-hidden="true" className={`my-1 w-0.5 flex-grow ${doneStep ? "bg-[#2F9E6E]" : "bg-[#E3E8F0]"}`} />}
            </span>
            <span className="flex min-w-0 flex-col pb-4">
              <span className={`text-sm ${doneStep || current ? "font-extrabold text-ink" : "font-semibold text-[#5B6272]"}`}>{s.label}</span>
              <span className="v-hint">{doneStep ? dateTime(s.at) : current ? "Next" : ""}</span>
              {s.key === "shipped" && doneStep && (o.courier || o.tracking) && <span className="v-hint">{[o.courier, o.tracking].filter(Boolean).join(", ")}</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
