"use client";

import { useCallback, useEffect, useState } from "react";
import { useAdminMe } from "@/components/admin/AdminMe";
import { BTN_BRAND, BTN_DANGER, BTN_QUIET, SkeletonRows, fmtDateTime, useConfirm } from "@/components/admin/ui";

interface HeldOrder {
  ref: string;
  status: string;
  fulfilment: "pickup" | "delivery";
  buyer: { name: string; first: string; email: string; phone: string; note: string };
  seller: { name: string; handle: string | null };
  items: { name: string; option: string; quantity: number }[];
  subtotal: string;
  delivery_fee: string;
  earnings: string;
  amount: string;
  courier: string;
  tracking: string;
  delivery_address: string;
  problem: { reason: string; note: string; at: string } | null;
}

const naira = (n: string | number) => `₦${Number(n).toLocaleString("en-NG", { maximumFractionDigits: 2 })}`;
const REASON: Record<string, string> = { not_received: "Not received", wrong_item: "Wrong item", damaged: "Damaged", other: "Other" };
const itemsText = (o: HeldOrder) =>
  o.items.map((i) => `${i.name}${i.option ? ` (${i.option})` : ""}${i.quantity > 1 ? ` ×${i.quantity}` : ""}`).join(", ");

export default function AdminMerchPage() {
  const { can } = useAdminMe();
  const ask = useConfirm();
  const [orders, setOrders] = useState<HeldOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [refundRef, setRefundRef] = useState("");
  const [refundReason, setRefundReason] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const res = await fetch("/api/admin/merch-orders/held");
      if (!res.ok) throw new Error();
      setOrders((await res.json()).results ?? []);
    } catch {
      setError("Couldn't load the orders with problems.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const post = async (path: string, body: Record<string, unknown>) => {
    const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return { res, json: await res.json().catch(() => ({})) };
  };

  const decide = async (o: HeldOrder, outcome: "release" | "refund") => {
    const refund = Number(o.subtotal) + Number(o.delivery_fee);
    const ok = await ask({
      title: outcome === "release" ? `Release ${naira(o.earnings)} to ${o.seller.name}?` : `Refund ${o.buyer.first || o.buyer.name} ${naira(refund)}?`,
      body:
        outcome === "release" ? (
          <p>
            {o.seller.name} gets <b className="text-ink">{naira(o.earnings)}</b> in their balance now, and {o.buyer.first || "the buyer"} is
            told the problem is closed. The order stays as it is.
          </p>
        ) : (
          <p>
            {o.buyer.first || "The buyer"} gets <b className="text-ink">{naira(refund)}</b> back (items and delivery fee), to the card or
            bank account they paid with. Paystack&apos;s charge isn&apos;t refunded. This can&apos;t be undone, and it comes off {o.seller.name}&apos;s earnings.
          </p>
        ),
      confirmLabel: outcome === "release" ? "Release the money" : `Refund ${naira(refund)}`,
      tone: outcome === "release" ? "primary" : "danger",
    });
    if (!ok) return;
    setBusy(o.ref);
    setError("");
    setNotice("");
    const { res, json } = await post(`/api/admin/merch-orders/${o.ref}/resolve`, { outcome });
    setBusy("");
    if (!res.ok) return setError(json.error || "Couldn't save that decision. Please try again.");
    setNotice(outcome === "release" ? `${o.ref}: earnings released to ${o.seller.name}.` : `${o.ref}: refund started.`);
    load();
  };

  const refundAny = async (e: React.FormEvent) => {
    e.preventDefault();
    const ref = refundRef.trim().toUpperCase();
    if (!/^BY-[A-Z0-9]{4,9}$/.test(ref)) return setError("Enter an order number like BY-K7M4QX.");
    if (!refundReason.trim()) return setError("Add a reason. The buyer sees it.");
    const ok = await ask({
      title: `Refund order ${ref}?`,
      body: <p>The buyer gets the full amount back, whatever step the order is at. This can&apos;t be undone.</p>,
      confirmLabel: "Refund the order",
      tone: "danger",
    });
    if (!ok) return;
    setBusy("any");
    setError("");
    setNotice("");
    const { res, json } = await post(`/api/admin/merch-orders/${ref}/refund`, { reason: refundReason.trim() });
    setBusy("");
    if (!res.ok) return setError(json.error || "Couldn't refund that order.");
    setNotice(`${ref}: refund started.`);
    setRefundRef("");
    setRefundReason("");
    load();
  };

  return (
    <div className="p-5 md:p-8">
      <div className="mb-6">
        <h1 className="font-display text-ink text-3xl font-extrabold tracking-tight">Merch orders</h1>
        <p className="text-muted text-sm mt-1">
          Problems buyers reported. The organiser&apos;s earnings for the order stay on hold until you release them or refund the buyer.
        </p>
      </div>

      {error && (
        <div role="alert" className="mb-6 bg-danger-tint border border-danger-hover rounded-xl px-4 py-3">
          <p className="text-danger text-xs">{error}</p>
        </div>
      )}
      {notice && (
        <div role="status" className="mb-6 bg-white border border-line rounded-xl px-4 py-3">
          <p className="text-ink text-xs">{notice}</p>
        </div>
      )}

      {loading ? (
        <SkeletonRows rows={3} />
      ) : orders.length === 0 ? (
        <div className="bg-white border border-line rounded-xl p-6">
          <p className="text-faint text-sm text-center py-4">No merch orders have an open problem.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map((o) => (
            <section key={o.ref} aria-label={`Order ${o.ref}`} className="bg-white border border-line rounded-xl p-4 md:p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <h2 className="text-ink font-semibold">
                    {o.ref} <span className="text-faint font-normal">· {o.fulfilment === "pickup" ? "Pickup" : "Delivery"}, {o.status.replace("_", " ")}</span>
                  </h2>
                  <p className="text-muted text-xs mt-0.5">{itemsText(o)}</p>
                </div>
                {can.payouts && (
                  <div className="flex flex-wrap items-center gap-2">
                    <button type="button" disabled={busy === o.ref} onClick={() => decide(o, "release")} className={BTN_BRAND}>
                      Release to organiser
                    </button>
                    <button type="button" disabled={busy === o.ref} onClick={() => decide(o, "refund")} className={BTN_DANGER}>
                      Refund buyer
                    </button>
                  </div>
                )}
              </div>

              {o.problem && (
                <div className="mt-4 rounded-lg bg-waiting-tint px-3 py-2.5">
                  <p className="text-waiting text-sm font-semibold">
                    {REASON[o.problem.reason] ?? o.problem.reason}
                    <span className="font-normal text-xs"> · reported {fmtDateTime(o.problem.at)}</span>
                  </p>
                  {o.problem.note && <p className="text-ink text-sm mt-1">“{o.problem.note}”</p>}
                </div>
              )}

              <dl className="mt-4 grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                <div><dt className="text-faint text-xs">Buyer</dt><dd className="text-ink">{o.buyer.name}<br /><span className="text-muted text-xs">{o.buyer.email}{o.buyer.phone ? `, ${o.buyer.phone}` : ""}</span></dd></div>
                <div><dt className="text-faint text-xs">Organiser</dt><dd className="text-ink">{o.seller.name}</dd></div>
                <div><dt className="text-faint text-xs">On hold</dt><dd className="text-ink tabular-nums">{naira(o.earnings)}</dd></div>
                <div><dt className="text-faint text-xs">Buyer paid</dt><dd className="text-ink tabular-nums">{naira(o.amount)}</dd></div>
                {o.fulfilment === "delivery" && (
                  <div className="sm:col-span-2"><dt className="text-faint text-xs">Delivery</dt><dd className="text-ink whitespace-pre-line break-words">{o.delivery_address}{(o.courier || o.tracking) ? `\n${[o.courier, o.tracking].filter(Boolean).join(", ")}` : ""}</dd></div>
                )}
              </dl>
            </section>
          ))}
        </div>
      )}

      {can.payouts && (
        <form onSubmit={refundAny} className="mt-8 bg-white border border-line rounded-xl p-4 md:p-6 max-w-xl">
          <h2 className="text-ink font-semibold">Refund any order</h2>
          <p className="text-muted text-xs mt-1 mb-4">
            For a buyer who writes to support after the time to report has passed. The buyer gets the items and delivery fee back, and it comes off the organiser&apos;s earnings.
          </p>
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-xs font-semibold text-ink">
              Order number
              <input value={refundRef} onChange={(e) => setRefundRef(e.target.value)} placeholder="BY-K7M4QX" className="h-10 rounded-lg border border-line px-3 text-sm font-normal" />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-ink">
              Reason (the buyer sees it)
              <input value={refundReason} onChange={(e) => setRefundReason(e.target.value)} maxLength={300} className="h-10 rounded-lg border border-line px-3 text-sm font-normal" />
            </label>
            <div><button type="submit" disabled={busy === "any"} className={BTN_QUIET}>Refund this order</button></div>
          </div>
        </form>
      )}
    </div>
  );
}
