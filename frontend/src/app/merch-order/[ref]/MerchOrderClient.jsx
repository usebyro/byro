"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import axiosInstance from "@/utils/axios";
import { clearCart } from "@/lib/merchCart";
import { REPORT_REASON, dateTime, dayMonth, naira } from "@/lib/merchOrders";

const POLL_MS = 4000;
const POLL_LIMIT = 30; // about two minutes, then ask them to refresh

const HEADLINE = {
  paid: { pickup: ["Your order is in", "{seller} is getting your items ready. We'll email you when you can collect them."], delivery: ["Your order is in", "{seller} is packing your order. We'll email you when it ships."] },
  packed: { delivery: ["Your order is packed", "{seller} is about to send it. We'll email you with tracking if they add it."] },
  shipped: { delivery: ["Your order is on the way", "Once it arrives, tap I received it below."] },
  delivered: { delivery: ["Delivered", "Thanks for supporting {seller}."] },
  ready: { pickup: ["Your order is ready to collect", "Show your pickup code when you collect it."] },
  picked_up: { pickup: ["Collected", "Thanks for supporting {seller}."] },
  cancelled: { any: ["Your order was cancelled", "We've refunded you."] },
  refund_processing: { any: ["Your order was cancelled", "Your refund is on its way."] },
  refunded: { any: ["Your order was cancelled", "You've been refunded."] },
};

// Paystack adds ?trxref=...&reference=... to the link it sends people back to. If it lands after our own
// ?token=, the two can run together, so read each from the whole query string and cut the token at any "?".
function readLink() {
  const search = typeof window === "undefined" ? "" : window.location.search;
  const token = (/[?&]token=([^&]+)/.exec(search)?.[1] || "").split("?")[0];
  const reference = /[?&](?:reference|trxref)=([^&]+)/.exec(search)?.[1] || "";
  return { token: decodeURIComponent(token), reference: decodeURIComponent(reference) };
}

function Shell({ seller, children }) {
  return (
    <div className="min-h-[100dvh] bg-[#F6F8FB] text-ink">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-xl focus:bg-ink focus:px-4 focus:py-2.5 focus:text-sm focus:font-bold focus:text-white">Skip to content</a>
      <header className="mx-auto flex max-w-[640px] items-center justify-between gap-3 px-4 py-4">
        <Link href="/" aria-label="Byro home"><Image src="/assets/images/logo.svg" alt="Byro" width={64} height={26} style={{ width: "auto", height: 26 }} priority /></Link>
        {seller && (
          seller.handle
            ? <Link href={`/u/${seller.handle}`} className="text-sm font-bold text-[#2451D6] hover:underline">{seller.name}</Link>
            : <span className="text-sm font-bold">{seller.name}</span>
        )}
      </header>
      <main id="main" className="mx-auto flex max-w-[640px] flex-col gap-4 px-4 pb-16">{children}</main>
    </div>
  );
}

const card = "flex flex-col gap-3.5 rounded-[20px] bg-white p-5";

export default function MerchOrderClient({ orderRef }) {
  const [order, setOrder] = useState(null);
  const [token, setToken] = useState("");
  const [phase, setPhase] = useState("loading"); // loading | confirming | ready | missing | failed | slow
  const [error, setError] = useState("");
  const tries = useRef(0);

  const refresh = useCallback(async (tok) => {
    try {
      const { data } = await axiosInstance.get(`merch-orders/${orderRef}/`, { params: { token: tok } });
      setOrder(data);
      setPhase("ready");
    } catch {
      setPhase("missing");
    }
  }, [orderRef]);

  useEffect(() => {
    const { token: tok, reference } = readLink();
    let stopped = false;
    let timer;

    const verify = async () => {
      try {
        const { data } = await axiosInstance.get(`merch-orders/verify/${reference}/`);
        if (stopped) return;
        setToken(data.token || tok);
        setOrder(data.order);
        setPhase("ready");
        clearCart(data.order?.seller?.handle);
      } catch (err) {
        if (stopped) return;
        const status = err?.response?.status;
        if (status === 202) {
          tries.current += 1;
          if (tries.current >= POLL_LIMIT) return setPhase("slow");
          setPhase("confirming");
          timer = setTimeout(verify, POLL_MS);
        } else if (status === 400 && err.response.data?.status === "failed") {
          setPhase("failed");
        } else {
          setError(err?.response?.data?.error || "We couldn't confirm your payment yet.");
          setPhase("slow");
        }
      }
    };

    setToken(tok);
    if (reference) {
      setPhase("confirming");
      verify();
    } else if (tok) {
      refresh(tok);
    } else {
      setPhase("missing");
    }
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [refresh]);

  if (phase === "loading" || phase === "confirming") {
    return (
      <Shell>
        <section className={card} aria-busy="true" role="status">
          <h1 className="font-display text-2xl font-bold">{phase === "confirming" ? "Confirming your payment" : "Loading your order"}</h1>
          <p className="m-0 text-[15px] text-[#5B6272]">{phase === "confirming" ? "This takes a few seconds. Please don't close this page." : "One moment."}</p>
          <span className="h-1.5 w-full overflow-hidden rounded-full bg-[#E3E8F0]"><span className="block h-full w-1/3 animate-pulse rounded-full bg-brand motion-reduce:animate-none" /></span>
        </section>
      </Shell>
    );
  }
  if (phase === "failed") {
    return (
      <Shell>
        <section className={card} role="alert">
          <h1 className="font-display text-2xl font-bold">Your payment didn&apos;t go through</h1>
          <p className="m-0 text-[15px] text-[#3B4252]">You haven&apos;t been charged. Go back and try again.</p>
          <button type="button" onClick={() => window.history.back()} className="flex h-12 items-center justify-center rounded-full bg-brand px-6 text-base font-bold text-white">Go back</button>
        </section>
      </Shell>
    );
  }
  if (phase === "slow") {
    return (
      <Shell>
        <section className={card} role="alert">
          <h1 className="font-display text-2xl font-bold">We&apos;re still confirming your payment</h1>
          <p className="m-0 text-[15px] text-[#3B4252]">{error || "If you finished paying, refresh this page in a minute."} If you were charged and your order doesn&apos;t appear, email <a className="font-bold text-[#2451D6]" href="mailto:support@usebyro.com">support@usebyro.com</a>.</p>
          <button type="button" onClick={() => window.location.reload()} className="flex h-12 items-center justify-center rounded-full bg-brand px-6 text-base font-bold text-white">Refresh</button>
        </section>
      </Shell>
    );
  }
  if (phase === "missing" || !order) {
    return (
      <Shell>
        <section className={card} role="alert">
          <h1 className="font-display text-2xl font-bold">We couldn&apos;t find that order</h1>
          <p className="m-0 text-[15px] text-[#3B4252]">Use the link in your order email. It has the key that opens your order.</p>
        </section>
      </Shell>
    );
  }
  return (
    <Shell seller={order.seller}>
      <OrderView order={order} token={token} onChange={setOrder} />
    </Shell>
  );
}

function OrderView({ order: o, token, onChange }) {
  const pickup = o.fulfilment === "pickup";
  const seller = o.seller?.name || "The seller";
  const head = (HEADLINE[o.status]?.[o.fulfilment] || HEADLINE[o.status]?.any || ["Your order", ""]);
  const lead = head[1].replace("{seller}", seller);
  const refunded = ["cancelled", "refund_processing", "refunded"].includes(o.status);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");

  const post = async (path, body) => {
    setBusy(true);
    setError("");
    try {
      const { data } = await axiosInstance.post(`merch-orders/${o.ref}/${path}/`, { token, ...body });
      onChange(data);
      setReporting(false);
    } catch (err) {
      setError(err?.response?.data?.error || "That didn't go through. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  const nextIdx = o.steps.findIndex((s) => !s.at);

  return (
    <>
      <section className={card} aria-labelledby="order-title">
        <span className="text-xs font-extrabold uppercase tracking-[0.1em] text-[#5B6272]">Order {o.ref}{o.paid_at ? ` · Paid ${dayMonth(o.paid_at)}` : ""}</span>
        <h1 id="order-title" className="font-display text-[28px] font-bold leading-tight">{head[0]}</h1>
        {lead && <p className="m-0 text-[15px] leading-relaxed text-[#3B4252]">{lead}</p>}
        {refunded && o.cancel_reason && <p className="m-0 rounded-xl bg-[#FFFAEB] p-3 text-sm"><b className="mb-0.5 block text-[13px] text-[#8A4B00]">From {seller}</b>“{o.cancel_reason}”</p>}
        {refunded && (
          <p className="m-0 text-sm text-[#3B4252]">
            {naira(o.refund_amount)} goes back to the card or bank account you paid with. Banks usually show it within 3 to 10 working days. The payment charge can&apos;t be refunded.
          </p>
        )}
        {o.problem && (
          <div role="status" className="rounded-xl bg-[#FFF6E5] p-3.5 text-sm text-[#6B4A08]">
            <b className="block text-[#8A4B00]">
              {o.problem.resolved ? "Problem resolved" : `You reported a problem: ${REPORT_REASON[o.problem.reason] || o.problem.reason}.`}
            </b>
            {o.problem.resolved
              ? "Byro has reviewed what you reported. We've emailed you."
              : `We've told ${seller} and Byro. We'll email you when Byro has decided.`}
          </div>
        )}
      </section>

      {!refunded && (
        <section className={card} aria-label="Order progress">
          <ol className="m-0 flex list-none flex-col p-0">
            {o.steps.map((s, i) => {
              const done = !!s.at;
              const current = i === nextIdx;
              return (
                <li key={s.key} aria-current={current ? "step" : undefined} className="flex gap-3.5">
                  <span className="flex flex-col items-center">
                    <span aria-hidden="true" className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-extrabold ${done ? "bg-[#2F9E6E] text-white" : current ? "bg-white text-[#2451D6] shadow-[inset_0_0_0_2px_#3669F6]" : "bg-white text-[#5B6272] shadow-[inset_0_0_0_2px_#E3E8F0]"}`}>{done ? "✓" : i + 1}</span>
                    {i < o.steps.length - 1 && <span aria-hidden="true" className={`my-1 w-0.5 flex-grow ${done ? "bg-[#2F9E6E]" : "bg-[#E3E8F0]"}`} />}
                  </span>
                  <span className="flex flex-col pb-4">
                    <span className={`text-[15px] ${done || current ? "font-extrabold" : "font-semibold text-[#5B6272]"}`}>{s.label}</span>
                    <span className="text-[13px] text-[#5B6272]">{done ? dateTime(s.at) : current ? "Next" : ""}</span>
                  </span>
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {pickup && o.pickup_code && (
        <section className={`${card} !bg-[#EEF3FF]`} aria-label="Your pickup code">
          <span className="text-xs font-extrabold uppercase tracking-[0.1em] text-[#5B6272]">Pickup code</span>
          <span className="font-display text-[44px] font-extrabold leading-none tracking-[.14em]" aria-label={`Pickup code ${o.pickup_code.split("").join(" ")}`}>{o.pickup_code}</span>
          <span className="text-sm text-[#3B4252]">Show this or your order number when you collect.</span>
        </section>
      )}

      {!refunded && (
        <section className={card} aria-label={pickup ? "Collect from" : "Delivery"}>
          {pickup ? (
            <>
              <h2 className="m-0 text-xs font-extrabold uppercase tracking-[0.1em] text-[#5B6272]">Collect from</h2>
              <p className="m-0 text-[15px] font-bold">{o.pickup?.address}</p>
              {o.pickup?.changed_at && (
                <p role="status" className="m-0 rounded-xl bg-[#FFF6E5] p-3 text-[13px] text-[#6B4A08]">
                  Changed on {dayMonth(o.pickup.changed_at)}.{o.pickup.previous_address ? ` It was ${o.pickup.previous_address}.` : ""}
                </p>
              )}
              {o.pickup?.address && (
                <a className="self-start text-sm font-bold text-[#2451D6]" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(o.pickup.address)}`} target="_blank" rel="noopener noreferrer">
                  Open in Maps<span className="sr-only"> (opens in a new tab)</span>
                </a>
              )}
              {o.pickup?.instructions && (
                <div className="flex flex-col gap-0.5 border-t border-[#EEF1F6] pt-3">
                  <h3 className="m-0 text-xs font-extrabold uppercase tracking-[0.1em] text-[#5B6272]">Instructions</h3>
                  <p className="m-0 text-sm text-[#3B4252]">{o.pickup.instructions}</p>
                </div>
              )}
            </>
          ) : (
            <>
              <h2 className="m-0 text-[15px] font-extrabold">Delivering to</h2>
              <p className="m-0 whitespace-pre-line break-words text-[15px]"><b>{o.delivery?.name}</b>{o.delivery?.phone ? `, ${o.delivery.phone}` : ""}{"\n"}{o.delivery?.address}</p>
              {(o.courier || o.tracking) && (
                <p className="m-0 text-sm text-[#3B4252]">
                  {o.courier && <><span className="text-[#5B6272]">Courier</span> <b>{o.courier}</b>{" "}</>}
                  {o.tracking && <><span className="text-[#5B6272]">Tracking</span> <b>{o.tracking}</b></>}
                </p>
              )}
              {["paid", "packed"].includes(o.status) && <p className="m-0 text-[13px] text-[#5B6272]">Address wrong? Message {seller} before it ships.</p>}
            </>
          )}
        </section>
      )}

      <section className={card} aria-label="Your order">
        <h2 className="m-0 text-[15px] font-extrabold">Your order</h2>
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {o.items.map((it, i) => (
            <li key={i} className="flex items-baseline gap-3 text-[15px]">
              <span className="min-w-0 flex-grow break-words"><b>{it.name}</b>{it.option && <span className="text-[#5B6272]"> ({it.option})</span>}</span>
              <span className="text-[#5B6272]">×{it.quantity}</span>
              <span className="font-extrabold [font-variant-numeric:tabular-nums]">{naira(it.total)}</span>
            </li>
          ))}
        </ul>
        <div className="flex flex-col gap-1 border-t border-[#EEF1F6] pt-3 text-sm [font-variant-numeric:tabular-nums]">
          <div className="flex justify-between"><span className="text-[#5B6272]">Items</span><span>{naira(o.subtotal)}</span></div>
          <div className="flex justify-between"><span className="text-[#5B6272]">{pickup ? "Pickup" : "Delivery"}</span><span>{Number(o.delivery_fee) > 0 ? naira(o.delivery_fee) : "Free"}</span></div>
        </div>
      </section>

      {error && <p role="alert" className="m-0 text-sm font-bold text-[#B42318]">{error}</p>}

      {(o.can_confirm || (o.can_report && !o.problem)) && (
        <section className={card} aria-label="Order actions">
          {o.can_confirm && (
            <button type="button" disabled={busy} onClick={() => post("confirm", {})} className="flex h-12 items-center justify-center rounded-full bg-brand px-6 text-base font-bold text-white transition-[filter,scale] hover:brightness-90 active:scale-[0.97] disabled:opacity-60">
              {pickup ? "I collected it" : "I received it"}
            </button>
          )}
          {o.can_report && !o.problem && !reporting && (
            <div className="flex flex-col gap-1">
              <button type="button" onClick={() => { setReporting(true); setError(""); }} className="self-start p-0 text-sm font-bold text-[#2451D6] hover:underline">Report a problem</button>
              {o.report_until && <span className="text-[13px] text-[#5B6272]">You can report a problem until {dayMonth(o.report_until)}.</span>}
            </div>
          )}
          {reporting && (
            <form onSubmit={(e) => { e.preventDefault(); if (reason) post("report", { reason, note: note.trim() }); }} className="flex flex-col gap-3">
              <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
                <legend className="mb-1 text-[15px] font-extrabold">What went wrong?</legend>
                {Object.entries(REPORT_REASON).map(([value, label]) => (
                  <label key={value} className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-[#E3E8F0] px-3.5 py-3 text-[15px] has-[:checked]:border-2 has-[:checked]:border-brand has-[:checked]:bg-[#F5F8FF]">
                    <input type="radio" name="reason" value={value} checked={reason === value} onChange={() => setReason(value)} className="h-4 w-4 accent-[#3669F6]" />
                    {label}
                  </label>
                ))}
              </fieldset>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-bold">Tell us more <span className="font-medium text-[#5B6272]">(optional)</span></span>
                <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={500} className="rounded-xl border border-[#CBD3DF] px-3.5 py-2.5 text-base focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15" />
              </label>
              <div className="flex flex-wrap gap-2">
                <button type="submit" disabled={!reason || busy} className="flex h-12 items-center justify-center rounded-full bg-brand px-6 text-base font-bold text-white disabled:opacity-50">Send report</button>
                <button type="button" onClick={() => setReporting(false)} className="flex h-12 items-center justify-center rounded-full border border-[#D5DBE5] px-6 text-base font-bold">Cancel</button>
              </div>
            </form>
          )}
        </section>
      )}

      <p className="m-0 text-center text-[13px] text-[#5B6272]">
        Questions about your order? Write to <a className="font-bold text-[#2451D6]" href="mailto:support@usebyro.com">support@usebyro.com</a> and quote {o.ref}.
      </p>
    </>
  );
}
