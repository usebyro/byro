"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { useAdminMe } from "@/components/admin/AdminMe";
import { useConfirm } from "@/components/admin/ui";
import { publicHref } from "@/lib/adminNav";
import { formatNaira } from "@/lib/eventFormat";
import SupportRequests from "@/components/admin/SupportRequests";

interface SupportTicket {
  ticket_id: string;
  holder_name: string;
  holder_email: string;
  buyer_email: string;
  status: string;
  tier: string;
  checked_in: boolean;
  checked_in_at: string | null;
  transferred: boolean;
}

interface SupportOrder {
  key: string;
  payment: null | {
    id: string;
    reference: string;
    status: string;
    amount: string;
    channel: string | null;
    customer_name: string;
    customer_email: string;
    created_at: string;
    paid_at: string | null;
    refundable: string;
  };
  refund: null | { status: string; amount: string; reason: string; failure_reason: string };
  event: { name: string; slug: string; day: string; cancelled: boolean };
  tickets: SupportTicket[];
}

const TICKET_STATUS: Record<string, { label: string; style: string }> = {
  paid: { label: "Paid", style: "bg-good-tint text-good" },
  free: { label: "Free", style: "bg-good-tint text-good" },
  pending: { label: "Unpaid", style: "bg-waiting-tint text-waiting" },
  failed: { label: "Payment failed", style: "bg-danger-tint text-danger" },
  refunded: { label: "Refunded", style: "bg-mist text-muted" },
  cancelled: { label: "Cancelled", style: "bg-mist text-muted" },
};

const REFUND_LABEL: Record<string, string> = {
  awaiting: "Refund waiting for approval",
  pending: "Refund queued",
  submitting: "Refund being sent",
  processing: "Refund on its way",
  processed: "Refunded",
  failed: "Refund failed",
  needs_attention: "Refund needs attention",
};

const date = (s: string | null) =>
  s ? new Date(s).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

async function post(url: string, body?: unknown) {
  const res = await fetch(url, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || "Try again.");
  return data;
}

export default function AdminSupportPage() {
  return (
    <Suspense fallback={null}>
      <SupportPage />
    </Suspense>
  );
}

function SupportPage() {
  const params = useSearchParams();
  const me = useAdminMe();
  const confirm = useConfirm();
  const canAct = me.can.moderate;
  const [q, setQ] = useState("");
  const [orders, setOrders] = useState<SupportOrder[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [tab, setTab] = useState<"requests" | "orders">(params.get("q") ? "orders" : "requests");

  const search = async (e?: React.FormEvent, override?: string) => {
    e?.preventDefault();
    const term = (override ?? q).trim();
    if (term.length < 3) {
      setError("Type at least 3 characters of a name, email, ticket ID or payment reference.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/support?${new URLSearchParams({ q: term })}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error);
      setOrders(data.orders || []);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "Couldn't search. Try again.");
    } finally {
      setLoading(false);
    }
  };

  // From a help request: jump to order lookup with their email filled in.
  const lookup = (email: string) => {
    setTab("orders");
    setQ(email);
    search(undefined, email);
  };

  const act = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
      await search();
    } finally {
      setBusy("");
    }
  };

  // Opened from a payment page with ?q=<reference>: search straight away.
  const started = useRef(false);
  useEffect(() => {
    const initial = params.get("q");
    if (started.current || !initial) return;
    started.current = true;
    setQ(initial);
    search(undefined, initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const resend = (t: SupportTicket) =>
    act(`resend-${t.ticket_id}`, async () => {
      try {
        const data = await post(`/api/admin/support/tickets/${t.ticket_id}/resend`);
        toast.success("Ticket sent", { description: data.sent_to });
      } catch (err) {
        toast.error("Couldn't send ticket", { description: (err as Error).message });
      }
    });

  // Either way it can be flipped back, so it happens at once and the toast offers Undo.
  const toggleCheckin = (t: SupportTicket): Promise<void> =>
    act(`checkin-${t.ticket_id}`, async () => {
      try {
        await post(`/api/admin/support/tickets/${t.ticket_id}/checkin`, { checked_in: !t.checked_in });
        toast.success(t.checked_in ? "Check-in undone" : "Checked in", {
          description: t.checked_in ? `${t.holder_name || t.holder_email}'s stamp for this event was removed` : t.holder_name || t.holder_email,
          action: { label: "Undo", onClick: () => toggleCheckin({ ...t, checked_in: !t.checked_in }) },
        });
      } catch (err) {
        toast.error("Couldn't update check-in", { description: (err as Error).message });
      }
    });

  const changeEmail = async (t: SupportTicket) => {
    const email = await confirm({
      title: `Send this ticket to a different address?`,
      body: <>It&apos;s on <b>{t.holder_email}</b> now. The ticket moves to the new address and is emailed there. The old address stops being able to use it.</>,
      confirmLabel: "Move ticket",
      input: { label: "New email address", placeholder: "name@example.com", required: true },
    });
    if (typeof email !== "string") return;
    return act(`email-${t.ticket_id}`, async () => {
      try {
        await post(`/api/admin/support/tickets/${t.ticket_id}/email`, { email: email.trim() });
        toast.success("Ticket moved", { description: email.trim() });
      } catch (err) {
        toast.error("Couldn't change the email", { description: (err as Error).message });
      }
    });
  };

  const voidTicket = async (t: SupportTicket) => {
    const reason = await confirm({
      title: `Void ${t.holder_name || t.holder_email}'s ticket?`,
      body: "The ticket stops working and the holder is told by email. Free tickets only, and this can't be undone.",
      confirmLabel: "Void ticket",
      tone: "danger",
      input: { label: "Reason (the holder sees this)", placeholder: "Duplicate sign-up", required: true, multiline: true },
    });
    if (typeof reason !== "string") return;
    return act(`void-${t.ticket_id}`, async () => {
      try {
        await post(`/api/admin/support/tickets/${t.ticket_id}/void`, { reason: reason.trim() });
        toast.success("Ticket voided", { description: t.holder_email });
      } catch (err) {
        toast.error("Couldn't void the ticket", { description: (err as Error).message });
      }
    });
  };

  const refund = async (o: SupportOrder) => {
    if (!o.payment) return;
    const amount = formatNaira(Number(o.payment.refundable));
    const reason = await confirm({
      title: `Refund ${amount} to ${o.payment.customer_name || o.payment.customer_email}?`,
      body: (
        <>
          For <b>{o.event.name}</b>. Byro&apos;s fee and the payment charge are kept, and the tickets in this order stop working.
          This can&apos;t be undone.
        </>
      ),
      confirmLabel: `Refund ${amount}`,
      tone: "danger",
      input: { label: "Reason (the buyer sees this)", placeholder: "Bought twice by mistake…", required: true, multiline: true },
    });
    if (typeof reason !== "string") return;
    return act(`refund-${o.key}`, async () => {
      try {
        const data = await post(`/api/admin/support/orders/${o.payment!.id}/refund`, { reason: reason.trim() });
        if (data.status === "failed" || data.status === "needs_attention") {
          toast.error("Paystack didn't accept the refund", { description: data.failure_reason || "See the Refunds page." });
        } else {
          toast.success("Refund sent", { description: `${formatNaira(Number(data.amount))} to ${o.payment!.customer_email}` });
        }
      } catch (err) {
        toast.error("Couldn't refund order", { description: (err as Error).message });
      }
    });
  };

  return (
    <div className="p-5 md:p-8">
      <div className="mb-8">
        <h1 className="font-display text-ink text-3xl font-extrabold tracking-tight">Support</h1>
        <p className="text-muted text-sm mt-1">
          {tab === "requests"
            ? "People who asked for help on tawk.to, and who on the team is handling them"
            : "Find an order or ticket, then resend it, fix a check-in, or refund it"}
        </p>
      </div>

      <div role="tablist" aria-label="Support" className="mb-6 flex gap-6 border-b border-line">
        {([["requests", "Requests"], ["orders", "Find an order"]] as const).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            onClick={() => setTab(value)}
            className={`-mb-px border-b-2 pb-2.5 text-sm font-bold transition-colors ${tab === value ? "border-brand text-ink" : "border-transparent text-muted hover:text-ink"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "requests" ? (
        <SupportRequests onLookup={lookup} />
      ) : (
        <>
          <form onSubmit={search} className="mb-6 flex flex-wrap gap-2">
            <label htmlFor="support-q" className="sr-only">Name, email, ticket ID or payment reference</label>
            <input
              id="support-q"
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Name, email, ticket ID or payment reference…"
              autoComplete="off"
              spellCheck={false}
              className="w-full sm:w-96 bg-mist border border-line rounded-lg px-3 py-2 text-sm text-ink placeholder:text-faint focus:outline-none focus:ring-1 focus:ring-brand/40"
            />
            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white hover:bg-brand-dark disabled:opacity-60"
            >
              {loading ? "Searching…" : "Search"}
            </button>
          </form>

          {error && <p className="text-danger text-sm mb-6">{error}</p>}

          {orders !== null && orders.length === 0 && !loading && (
            <p className="bg-white border border-line rounded-xl p-6 text-faint text-sm text-center">Nothing found for that search.</p>
          )}

          <div className="flex flex-col gap-4">
            {orders?.map((o) => {
              const p = o.payment;
              const canRefund = canAct && p && p.status === "successful" && !o.refund && Number(p.refundable) > 0;
              return (
                <section key={o.key} className="bg-white border border-line rounded-xl p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <a
                        href={publicHref(`/discover/${o.event.slug}`)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-display text-lg font-bold text-ink hover:underline"
                      >
                        {o.event.name}
                      </a>
                      <p className="text-xs text-faint">
                        {o.event.day}
                        {o.event.cancelled && <span className="ml-2 font-bold text-danger">Event cancelled</span>}
                      </p>
                    </div>
                    {canRefund && (
                      <button
                        type="button"
                        onClick={() => refund(o)}
                        disabled={busy !== ""}
                        className="rounded-lg border border-danger-hover px-3 py-1.5 text-xs font-bold text-danger hover:bg-danger-tint disabled:opacity-50"
                      >
                        Refund order
                      </button>
                    )}
                  </div>

                  {p ? (
                    <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
                      <div><dt className="text-xs text-faint">Buyer</dt><dd className="text-ink truncate">{p.customer_name}<span className="block text-xs text-muted truncate">{p.customer_email}</span></dd></div>
                      <div><dt className="text-xs text-faint">Paid</dt><dd className="text-ink tabular-nums">{formatNaira(Number(p.amount))}<span className="block text-xs text-muted capitalize">{p.status}{p.channel ? ` · ${p.channel}` : ""}</span></dd></div>
                      <div><dt className="text-xs text-faint">When</dt><dd className="text-ink">{date(p.paid_at || p.created_at)}</dd></div>
                      <div><dt className="text-xs text-faint">Reference</dt><dd className="font-mono text-xs text-ink break-all">{p.reference}</dd></div>
                    </dl>
                  ) : (
                    <p className="mt-3 text-sm text-muted">Free registration</p>
                  )}

                  {o.refund && (
                    <p className={`mt-3 text-sm font-semibold ${o.refund.status === "failed" || o.refund.status === "needs_attention" ? "text-danger" : "text-muted"}`}>
                      {REFUND_LABEL[o.refund.status] || o.refund.status}: {formatNaira(Number(o.refund.amount))}
                      {o.refund.reason ? ` · ${o.refund.reason}` : ""}
                      {o.refund.failure_reason ? ` · ${o.refund.failure_reason}` : ""}
                    </p>
                  )}

                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-hairline text-left">
                          {["Ticket", "Holder", "Status", "Check-in", ""].map((h, i) => (
                            <th scope="col" key={i} className="pb-2 pr-6 text-xs text-faint font-medium">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-hairline">
                        {o.tickets.map((t) => {
                          const s = TICKET_STATUS[t.status] || { label: t.status, style: "bg-mist text-muted" };
                          const valid = t.status === "paid" || t.status === "free";
                          return (
                            <tr key={t.ticket_id}>
                              <td className="py-2.5 pr-6">
                                <span className="text-ink">{t.tier}</span>
                                <span className="block font-mono text-[11px] text-faint">{t.ticket_id.slice(0, 8)}</span>
                              </td>
                              <td className="py-2.5 pr-6 max-w-[220px]">
                                <span className="text-ink truncate block">{t.holder_name}</span>
                                <span className="block truncate text-xs text-muted">{t.holder_email}</span>
                                {t.transferred && <span className="text-[11px] text-faint">Transferred from {t.buyer_email}</span>}
                              </td>
                              <td className="py-2.5 pr-6">
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.style}`}>{s.label}</span>
                              </td>
                              <td className="py-2.5 pr-6 text-muted whitespace-nowrap">
                                {t.checked_in ? `In · ${date(t.checked_in_at)}` : "Not yet"}
                              </td>
                              <td className="py-2.5 whitespace-nowrap text-right">
                                {canAct && valid && (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => resend(t)}
                                      disabled={busy !== ""}
                                      className="mr-3 text-xs font-bold text-brand-dark hover:underline disabled:opacity-50"
                                    >
                                      Resend ticket
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => toggleCheckin(t)}
                                      disabled={busy !== ""}
                                      className="text-xs font-bold text-muted hover:text-ink hover:underline disabled:opacity-50"
                                    >
                                      {t.checked_in ? "Undo check-in" : "Check in"}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => changeEmail(t)}
                                      disabled={busy !== ""}
                                      className="ml-3 text-xs font-bold text-muted hover:text-ink hover:underline disabled:opacity-50"
                                    >
                                      Change email
                                    </button>
                                    {t.status === "free" && !t.checked_in && (
                                      <button
                                        type="button"
                                        onClick={() => voidTicket(t)}
                                        disabled={busy !== ""}
                                        className="ml-3 text-xs font-bold text-danger hover:underline disabled:opacity-50"
                                      >
                                        Void
                                      </button>
                                    )}
                                  </>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
