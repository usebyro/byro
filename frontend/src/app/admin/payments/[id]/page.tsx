"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { toast } from "sonner";
import { useAdminMe } from "@/components/admin/AdminMe";
import { publicHref, resolveAdminHref } from "@/lib/adminNav";
import { formatNaira } from "@/lib/eventFormat";

interface Detail {
  id: string;
  reference: string;
  status: string;
  amount: string;
  channel: string | null;
  subtotal: string | null;
  service_fee: string | null;
  refundable: string;
  seats: number | null;
  attendees: { name: string; email: string }[];
  promo_code: string | null;
  tier_name: string | null;
  customer_name: string;
  customer_email: string;
  created_at: string;
  paid_at: string | null;
  event: { name: string; slug: string; day: string; cancelled: boolean; pass_fee_to_attendee: boolean };
  organizer: { email: string; name: string; handle: string | null } | null;
  refund: { status: string; amount: string; reason: string; failure_reason: string } | null;
  tickets: { ticket_id: string; holder_name: string; holder_email: string; status: string; tier: string; checked_in: boolean }[];
}

interface Check {
  paystack: { status: string; amount: string; channel: string | null; paid_at: string | null; gateway_response: string | null; customer_email: string | null };
  byro: { status: string; amount: string };
  amount_matches: boolean;
  can_issue_tickets: boolean;
}

const naira = (v: string | null) => (v == null || v === "" ? "—" : formatNaira(Number(v)));
const when = (s: string | null) =>
  s ? new Date(s).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-6 py-2 text-sm">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right text-ink">{children}</dd>
    </div>
  );
}

export default function AdminPaymentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const pathname = usePathname();
  const me = useAdminMe();
  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  const [check, setCheck] = useState<Check | null>(null);
  const [checking, setChecking] = useState(false);
  const [issuing, setIssuing] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/payments/${id}`);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body?.error || "Couldn't load this payment.");
      return;
    }
    setData(body);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const runCheck = async () => {
    setChecking(true);
    try {
      const res = await fetch(`/api/admin/payments/${id}/paystack`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error);
      setCheck(body);
    } catch (err) {
      toast.error("Couldn't check Paystack", { description: (err as Error).message || "Try again." });
    } finally {
      setChecking(false);
    }
  };

  const issue = async () => {
    if (!data) return;
    if (!window.confirm(`Paystack shows this as paid. Issue the tickets and email them to ${data.customer_email}?`)) return;
    setIssuing(true);
    try {
      const res = await fetch(`/api/admin/payments/${id}/paystack`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error);
      toast.success("Tickets issued", { description: `${body.issued} ticket(s) sent to ${data.customer_email}` });
      setCheck(null);
      await load();
    } catch (err) {
      toast.error("Couldn't issue tickets", { description: (err as Error).message || "Try again." });
    } finally {
      setIssuing(false);
    }
  };

  const back = (
    <Link href={resolveAdminHref(pathname, "/payments")} className="text-sm font-semibold text-muted hover:text-ink">
      ← Payments
    </Link>
  );

  if (error) {
    return (
      <div className="p-5 md:p-8">
        {back}
        <p className="mt-6 text-red-600 text-sm">{error}</p>
      </div>
    );
  }
  if (!data) return <div className="p-5 md:p-8">{back}<p className="mt-6 text-faint text-sm">Loading…</p></div>;

  return (
    <div className="p-5 md:p-8">
      {back}
      <div className="mt-4 mb-8 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-ink text-3xl font-extrabold tracking-tight">{naira(data.amount)}</h1>
          <p className="text-muted text-sm mt-1">
            {data.customer_name} · <span className="capitalize">{data.status}</span>
            {data.channel ? ` · ${data.channel}` : ""}
          </p>
          <p className="font-mono text-xs text-faint mt-1 break-all">{data.reference}</p>
        </div>
        <Link
          href={resolveAdminHref(pathname, `/support?q=${encodeURIComponent(data.reference)}`)}
          className="rounded-lg border border-line bg-white px-3 py-2 text-sm font-bold text-ink hover:bg-mist"
        >
          Open in Support
        </Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="bg-white border border-line rounded-xl p-5">
          <h2 className="text-sm font-bold text-ink mb-2">Money</h2>
          <dl className="divide-y divide-hairline">
            <Row label="Tickets">{naira(data.subtotal)}</Row>
            <Row label={data.event.pass_fee_to_attendee ? "Byro fee (paid by buyer)" : "Byro fee (absorbed by organiser)"}>{naira(data.service_fee)}</Row>
            <Row label="Buyer paid">{naira(data.amount)}</Row>
            {data.promo_code && <Row label="Promo code">{data.promo_code}</Row>}
            {data.status === "successful" && <Row label="Refundable (ticket price)">{naira(data.refundable)}</Row>}
          </dl>
          {data.refund && (
            <p className={`mt-3 text-sm font-semibold ${data.refund.status === "failed" ? "text-red-600" : "text-muted"}`}>
              Refund {data.refund.status}: {naira(data.refund.amount)}
              {data.refund.reason ? ` · ${data.refund.reason}` : ""}
              {data.refund.failure_reason ? ` · ${data.refund.failure_reason}` : ""}
            </p>
          )}
        </section>

        <section className="bg-white border border-line rounded-xl p-5">
          <h2 className="text-sm font-bold text-ink mb-2">Order</h2>
          <dl className="divide-y divide-hairline">
            <Row label="Event">
              <a href={publicHref(`/discover/${data.event.slug}`)} target="_blank" rel="noopener noreferrer" className="hover:underline">
                {data.event.name}
              </a>
              {data.event.cancelled && <span className="ml-2 text-xs font-bold text-red-600">Cancelled</span>}
            </Row>
            <Row label="Date">{data.event.day}</Row>
            {data.tier_name && <Row label="Ticket type">{data.tier_name}</Row>}
            <Row label="Buyer">{data.customer_name}<span className="block text-xs text-muted">{data.customer_email}</span></Row>
            {data.organizer && (
              <Row label="Organiser">{data.organizer.name}<span className="block text-xs text-muted">{data.organizer.email}</span></Row>
            )}
            <Row label="Started">{when(data.created_at)}</Row>
            <Row label="Paid">{when(data.paid_at)}</Row>
          </dl>
        </section>
      </div>

      <section className="mt-4 bg-white border border-line rounded-xl p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-ink">Paystack</h2>
            <p className="text-xs text-muted">Compare this order with what Paystack has on record.</p>
          </div>
          <button
            type="button"
            onClick={runCheck}
            disabled={checking}
            className="rounded-lg border border-line bg-white px-3 py-2 text-sm font-bold text-ink hover:bg-mist disabled:opacity-60"
          >
            {checking ? "Checking…" : "Check with Paystack"}
          </button>
        </div>
        {check && (
          <div className="mt-4">
            <dl className="divide-y divide-hairline">
              <Row label="Status at Paystack / Byro"><span className="capitalize">{check.paystack.status}</span> / <span className="capitalize">{check.byro.status}</span></Row>
              <Row label="Amount at Paystack / Byro">{naira(check.paystack.amount)} / {naira(check.byro.amount)}</Row>
              <Row label="Paystack says">{check.paystack.gateway_response || "—"}</Row>
              <Row label="Paid at Paystack">{when(check.paystack.paid_at)}</Row>
            </dl>
            {!check.amount_matches && (
              <p className="mt-3 text-sm font-semibold text-red-600">The amounts don&apos;t match. Don&apos;t issue tickets; contact Paystack.</p>
            )}
            {check.can_issue_tickets && (
              <div className="mt-4 rounded-lg bg-amber-50 border border-amber-200 p-4 text-sm text-amber-900">
                <p className="font-semibold">Paystack shows this as paid, but the buyer never got their tickets.</p>
                {me.can.moderate ? (
                  <button
                    type="button"
                    onClick={issue}
                    disabled={issuing}
                    className="mt-3 rounded-lg bg-brand px-3 py-2 text-sm font-bold text-white hover:bg-brand-dark disabled:opacity-60"
                  >
                    {issuing ? "Issuing…" : "Issue tickets"}
                  </button>
                ) : (
                  <p className="mt-1 text-xs">Ask an Admin or Owner to issue them.</p>
                )}
              </div>
            )}
          </div>
        )}
      </section>

      <section className="mt-4 bg-white border border-line rounded-xl p-5">
        <h2 className="text-sm font-bold text-ink mb-3">Tickets ({data.tickets.length})</h2>
        {data.tickets.length === 0 ? (
          <p className="text-sm text-faint">No tickets were issued for this order.</p>
        ) : (
          <ul className="divide-y divide-hairline text-sm">
            {data.tickets.map((t) => (
              <li key={t.ticket_id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <span>
                  <span className="text-ink">{t.holder_name}</span>
                  <span className="block text-xs text-muted">{t.holder_email} · {t.tier}</span>
                </span>
                <span className="text-xs text-muted capitalize">
                  {t.status}
                  {t.checked_in ? " · checked in" : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
