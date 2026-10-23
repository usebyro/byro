"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { formatNaira, isPaidEvent, priceLabel } from "@/lib/eventFormat";
import { useAdminMe } from "@/components/admin/AdminMe";
import { SidePanel, useConfirm, SkeletonRows, throwIfFailed, SUSPEND_EVENT_BODY } from "@/components/admin/ui";
import { publicHref } from "@/lib/adminNav";

interface EventTier {
  id?: number;
  name?: string;
  price: number | string;
}

interface Event {
  id: number;
  slug: string;
  name: string;
  category: string;
  day: string;
  time_from: string;
  location: string;
  ticket_price: number | string;
  tiers?: EventTier[];
  is_active: boolean;
  hosted_by?: string;
  visibility?: "public" | "private";
  is_draft?: boolean;
  created_at?: string;
  owner_email?: string;
  featured_until?: string | null;
  is_featured?: boolean;
  cancelled_at?: string | null;
  sales_closed?: boolean;
  description?: string;
  event_image_url?: string | null;
}

interface TierRow {
  id: number;
  name: string;
  price: string;
  capacity: number | null;
  sold: number;
  remaining: number | null;
}

interface OverviewRow {
  id: number;
  slug: string;
  tickets_sold: number;
  revenue: string;
  paid: number;
  free: number;
  pending: number;
  failed: number;
  transferred: number;
  checked_in: number;
  capacity: number | null;
  promo_redemptions: number;
  tier_breakdown: TierRow[];
  is_free: boolean;
}

interface Attendee {
  ticket_id: string;
  current_owner_name: string;
  current_owner_email: string;
  tier_name: string | null;
  payment_status: string;
  checked_in: boolean;
}

function formatDate(dateStr: string) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(dateStr?: string) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Fix what the public sees (a typo, an unsuitable photo) without suspending the event. */
function EditDetails({ event, onSaved }: { event: Event; onSaved: (updated: Event) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(event.name);
  const [location, setLocation] = useState(event.location);
  const [description, setDescription] = useState(event.description ?? "");
  const [removeImage, setRemoveImage] = useState(false);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const body: Record<string, unknown> = { name, location, description, note };
      if (removeImage) body.remove_image = true;
      const res = await fetch(`/api/admin/events/${event.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      await throwIfFailed(res);
      onSaved(await res.json());
      setRemoveImage(false);
      setNote("");
      setOpen(false);
      toast.success("Event details updated", { description: "The organiser has been told." });
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "Try again.");
    } finally {
      setSaving(false);
    }
  };

  const field = "w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink";
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-xs font-semibold text-brand-dark bg-brand/10 hover:bg-brand/20 px-3 py-2 rounded-lg transition-colors">
        Edit details
      </button>
    );
  }
  return (
    <div className="space-y-3">
      <h4 className="text-ink text-sm font-semibold">Edit details</h4>
      <p className="text-faint text-xs leading-relaxed">For typos and unsuitable content. The organiser is told what you changed.</p>
      <label className="block text-xs text-muted">Name
        <input className={`${field} mt-1`} value={name} maxLength={100} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="block text-xs text-muted">Location
        <input className={`${field} mt-1`} value={location} maxLength={255} onChange={(e) => setLocation(e.target.value)} />
      </label>
      <label className="block text-xs text-muted">Description
        <textarea className={`${field} mt-1`} rows={5} value={description} onChange={(e) => setDescription(e.target.value)} />
      </label>
      {event.event_image_url && (
        <label className="flex items-center gap-2 text-xs text-ink">
          <input type="checkbox" checked={removeImage} onChange={(e) => setRemoveImage(e.target.checked)} />
          Remove the event image
        </label>
      )}
      <label className="block text-xs text-muted">Note for the organiser (optional)
        <input className={`${field} mt-1`} value={note} maxLength={255} onChange={(e) => setNote(e.target.value)} />
      </label>
      {error && <p className="text-danger text-xs">{error}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={save} disabled={saving} className="text-xs font-semibold text-white bg-brand hover:bg-brand-dark disabled:opacity-50 px-3 py-2 rounded-lg">
          {saving ? "Saving…" : "Save changes"}
        </button>
        <button type="button" onClick={() => setOpen(false)} disabled={saving} className="text-xs font-semibold text-muted bg-mist hover:text-ink px-3 py-2 rounded-lg">
          Cancel
        </button>
      </div>
    </div>
  );
}

function getEventStatus(event: Event): "active" | "inactive" | "ended" {
  if (!event.day) return event.is_active ? "active" : "inactive";
  const eventDate = new Date(event.day);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  eventDate.setHours(0, 0, 0, 0);
  if (eventDate < today) return "ended";
  return event.is_active ? "active" : "inactive";
}

function StatusBadge({ status }: { status: "active" | "inactive" | "ended" }) {
  const styles = {
    active: "bg-good-tint text-good",
    inactive: "bg-mist text-muted",
    ended: "bg-danger-tint text-danger",
  };
  const dots = {
    active: "bg-stamp-green",
    inactive: "bg-faint",
    ended: "bg-danger-strong",
  };
  const labels = { active: "Active", inactive: "Inactive", ended: "Ended" };

  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full font-medium ${styles[status]}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${dots[status]}`} />
      {labels[status]}
    </span>
  );
}

function EventTable({
  events,
  emptyText,
  overview,
  onSelect,
}: {
  events: Event[];
  emptyText: string;
  overview: Record<number, OverviewRow>;
  onSelect: (event: Event) => void;
}) {
  if (events.length === 0) {
    return (
      <p className="text-faint text-sm py-6 text-center">{emptyText}</p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-hairline text-left">
            <th scope="col" className="pb-3 pr-6 text-xs text-faint font-medium">Event</th>
            <th scope="col" className="pb-3 pr-6 text-xs text-faint font-medium">Date</th>
            <th scope="col" className="pb-3 pr-6 text-xs text-faint font-medium">Location</th>
            <th scope="col" className="pb-3 pr-6 text-xs text-faint font-medium">Category</th>
            <th scope="col" className="pb-3 pr-6 text-xs text-faint font-medium">Price</th>
            <th scope="col" className="pb-3 pr-6 text-xs text-faint font-medium">Created</th>
            <th scope="col" className="pb-3 pr-6 text-xs text-faint font-medium">Tickets sold</th>
            <th scope="col" className="pb-3 pr-6 text-xs text-faint font-medium">Revenue</th>
            <th scope="col" className="pb-3 text-xs text-faint font-medium">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-hairline">
          {events.map((event) => (
            <tr
              key={event.id}
              onClick={() => onSelect(event)}
              className="group cursor-pointer hover:bg-mist"
            >
              <td className="py-3 pr-6">
                <a
                  href={publicHref(`/discover/${event.slug}`)}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="text-ink group-hover:text-brand-dark transition-colors font-medium truncate block max-w-[200px]"
                >
                  {event.name}
                </a>
                {(event.visibility === "private" || event.is_draft) && (
                  <span className="mt-1 flex gap-1">
                    {event.visibility === "private" && (
                      <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-700">Private</span>
                    )}
                    {event.is_draft && (
                      <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded bg-waiting-tint text-waiting">Draft</span>
                    )}
                  </span>
                )}
              </td>
              <td className="py-3 pr-6 text-muted whitespace-nowrap">
                {formatDate(event.day)}
              </td>
              <td className="py-3 pr-6 text-muted truncate max-w-[160px]">
                {event.location || "—"}
              </td>
              <td className="py-3 pr-6 text-muted capitalize">
                {event.category?.replace(/_/g, " ") || "—"}
              </td>
              <td className="py-3 pr-6 text-body whitespace-nowrap tabular-nums">
                {priceLabel(event)}
              </td>
              <td className="py-3 pr-6 text-muted whitespace-nowrap">
                {formatDateTime(event.created_at)}
              </td>
              <td className="py-3 pr-6 text-body whitespace-nowrap tabular-nums">
                {overview[event.id]?.tickets_sold ?? "—"}
              </td>
              <td className="py-3 pr-6 text-body whitespace-nowrap tabular-nums">
                {overview[event.id] ? formatNaira(Number(overview[event.id].revenue)) : "—"}
              </td>
              <td className="py-3">
                <StatusBadge status={getEventStatus(event)} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function csvEscape(value: string) {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function downloadAttendeesCsv(event: Event | null, attendees: Attendee[]) {
  const header = ["Name", "Email", "Ticket tier", "Payment status", "Checked in"];
  const rows = attendees.map((a) => [
    a.current_owner_name || "",
    a.current_owner_email || "",
    a.tier_name || "",
    a.payment_status || "",
    a.checked_in ? "Yes" : "No",
  ]);
  const csv = [header, ...rows]
    .map((row) => row.map((cell) => csvEscape(String(cell))).join(","))
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const slug = event?.slug || "event";
  link.href = url;
  link.download = `${slug}-attendees.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export default function AdminEventsPage() {
  const { can } = useAdminMe();
  const [events, setEvents] = useState<Event[]>([]);
  const [overview, setOverview] = useState<Record<number, OverviewRow>>({});
  const [totalTicketsSold, setTotalTicketsSold] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [selected, setSelected] = useState<Event | null>(null);
  const [attendees, setAttendees] = useState<Attendee[] | null>(null);
  const [attendeesError, setAttendeesError] = useState("");
  const [attendeesLoading, setAttendeesLoading] = useState(false);

  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [actionError, setActionError] = useState("");
  const confirm = useConfirm();
  const closePanel = useCallback(() => setSelected(null), []);

  const [featuring, setFeaturing] = useState(false);
  const isFeatured = (e: Event) => Boolean(e.is_featured);

  const feature = async (event: Event, days: number) => {
    setFeaturing(true);
    try {
      const res = await fetch(`/api/admin/events/${event.id}/feature`, { method: "POST", body: JSON.stringify({ days }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Try again.");
      const patch = { featured_until: data.featured_until as string | null, is_featured: Boolean(data.is_featured) };
      setEvents((prev) => prev.map((e) => (e.id === event.id ? { ...e, ...patch } : e)));
      setSelected((prev) => (prev && prev.id === event.id ? { ...prev, ...patch } : prev));
      toast.success(days ? `Featured for ${days} days` : "No longer featured", { description: event.name });
    } catch (err) {
      toast.error("Couldn't update featuring", { description: (err as Error).message });
    } finally {
      setFeaturing(false);
    }
  };

  const openEvent = (event: Event) => {
    setSelected(event);
    setAttendees(null);
    setAttendeesError("");
    setAttendeesLoading(true);
    fetch(`/api/admin/events/${event.slug}/attendees`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || "Couldn't load attendees for this event.");
        setAttendees(data.attendees ?? []);
      })
      .catch(() => setAttendeesError("Couldn't load attendees for this event."))
      .finally(() => setAttendeesLoading(false));
  };

  useEffect(() => {
    let cancelled = false;

    // One call for every event, including private, draft and suspended ones
    // (the public events/ list hides those), with revenue, tier breakdown and
    // check-ins per event.
    fetch("/api/admin/events/overview")
      .then((res) => {
        if (!res.ok) throw new Error("overview");
        return res.json();
      })
      .then((rows: (Event & OverviewRow)[]) => {
        if (cancelled) return;
        setEvents(rows);
        setOverview(Object.fromEntries(rows.map((r) => [r.id, r])));
      })
      .catch(() => { if (!cancelled) setError("Couldn't load events. Try again."); })
      .finally(() => { if (!cancelled) setLoading(false); });

    // Platform-wide tickets-sold total, from the same admin-authorized endpoint
    // the Dashboard uses — avoids the per-event 403s skewing this number.
    fetch("/api/admin/analytics/summary")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data) setTotalTicketsSold(data.total_tickets_sold ?? null);
      })
      .catch(() => {
        if (!cancelled) setTotalTicketsSold(null);
      });

    return () => { cancelled = true; };
  }, []);

  const runAction = async (event: Event, action: "suspend" | "reactivate" | "delete") => {
    setUpdatingId(event.id);
    setActionError("");
    try {
      if (action === "delete") {
        const res = await fetch(`/api/admin/events/${event.id}`, { method: "DELETE" });
        await throwIfFailed(res);
        setEvents((prev) => prev.filter((e) => e.id !== event.id));
        setSelected(null);
      } else {
        const is_active = action === "reactivate";
        const res = await fetch(`/api/admin/events/${event.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ is_active }),
        });
        await throwIfFailed(res);
        const updated: Event = await res.json();
        setEvents((prev) => prev.map((e) => (e.id === event.id ? { ...e, ...updated } : e)));
        setSelected((prev) => (prev && prev.id === event.id ? { ...prev, ...updated } : prev));
      }
    } catch (err) {
      const reason = err instanceof Error && err.message ? err.message : "Try again.";
      setActionError(`Couldn't ${action} this event. ${reason}`);
    } finally {
      setUpdatingId(null);
    }
  };

  const setVisibility = async (event: Event, visibility: "public" | "private") => {
    const toPrivate = visibility === "private";
    const ok = await confirm({
      title: toPrivate ? `Make “${event.name}” private?` : `Make “${event.name}” public?`,
      body: toPrivate
        ? "It disappears from Discover, search and the organiser's page. Anyone with the link can still buy tickets. If it's featured, it stops being featured."
        : "It shows on Discover, search and the organiser's page again.",
      confirmLabel: toPrivate ? "Make private" : "Make public",
      tone: "primary",
    });
    if (!ok) return;
    setUpdatingId(event.id);
    setActionError("");
    try {
      const res = await fetch(`/api/admin/events/${event.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visibility }),
      });
      await throwIfFailed(res);
      const updated: Event = await res.json();
      setEvents((prev) => prev.map((e) => (e.id === event.id ? { ...e, ...updated } : e)));
      setSelected((prev) => (prev && prev.id === event.id ? { ...prev, ...updated } : prev));
      toast.success(toPrivate ? "Event is now private" : "Event is now public", { description: event.name });
    } catch (err) {
      const reason = err instanceof Error && err.message ? err.message : "Try again.";
      setActionError(`Couldn't change visibility. ${reason}`);
    } finally {
      setUpdatingId(null);
    }
  };

  const changeSales = async (event: Event, change: "close" | "reopen" | "draft") => {
    const copy = {
      close: {
        title: `Close ticket sales for “${event.name}”?`,
        body: "Nobody can buy or register from now on. The event stays up and existing tickets keep working. The organiser is told.",
        confirmLabel: "Close sales",
        tone: "danger" as const,
      },
      reopen: {
        title: `Reopen ticket sales for “${event.name}”?`,
        body: "People can buy or register again. The organiser is told.",
        confirmLabel: "Reopen sales",
        tone: "primary" as const,
      },
      draft: {
        title: `Move “${event.name}” back to draft?`,
        body: "It disappears from Byro and only the organiser can see it until they publish it again. Only possible while no tickets have been issued. It stops being featured.",
        confirmLabel: "Move to draft",
        tone: "danger" as const,
      },
    }[change];
    if (!(await confirm(copy))) return;
    setUpdatingId(event.id);
    setActionError("");
    try {
      const res = await fetch(`/api/admin/events/${event.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(change === "draft" ? { is_draft: true } : { sales_closed: change === "close" }),
      });
      await throwIfFailed(res);
      const updated: Event = await res.json();
      setEvents((prev) => prev.map((e) => (e.id === event.id ? { ...e, ...updated } : e)));
      setSelected((prev) => (prev && prev.id === event.id ? { ...prev, ...updated } : prev));
      toast.success({ close: "Ticket sales closed", reopen: "Ticket sales reopened", draft: "Moved back to draft" }[change], { description: event.name });
    } catch (err) {
      setActionError(`Couldn't update this event. ${err instanceof Error && err.message ? err.message : "Try again."}`);
    } finally {
      setUpdatingId(null);
    }
  };

  const addAccess = async (event: Event, what: "cohost" | "owner") => {
    const isOwner = what === "owner";
    const email = await confirm({
      title: isOwner ? `Transfer “${event.name}” to another account?` : `Add a co-host to “${event.name}”?`,
      body: isOwner ? (
        <>Ticket revenue and payouts for this event move to the new owner, and the current owner (<b>{event.owner_email}</b>) loses access. Both are told. Refused if the organiser has already withdrawn money from paid sales.</>
      ) : (
        "They can edit the event, see the guest list and check people in. If they have no account yet, they get an invite to join. The organiser is told."
      ),
      confirmLabel: isOwner ? "Transfer event" : "Add co-host",
      tone: isOwner ? "danger" : "primary",
      input: { label: isOwner ? "New owner's email (must have an account)" : "Co-host's email", placeholder: "name@example.com", required: true },
    });
    if (typeof email !== "string") return;
    setUpdatingId(event.id);
    setActionError("");
    try {
      const res = await fetch(`/api/admin/events/${event.id}/${isOwner ? "owner" : "cohosts"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      await throwIfFailed(res);
      if (isOwner) {
        const patch = { owner_email: email.trim().toLowerCase() };
        setEvents((prev) => prev.map((e) => (e.id === event.id ? { ...e, ...patch } : e)));
        setSelected((prev) => (prev && prev.id === event.id ? { ...prev, ...patch } : prev));
      }
      toast.success(isOwner ? "Event transferred" : "Co-host added", { description: email.trim() });
    } catch (err) {
      setActionError(`Couldn't ${isOwner ? "transfer this event" : "add the co-host"}. ${err instanceof Error && err.message ? err.message : "Try again."}`);
    } finally {
      setUpdatingId(null);
    }
  };

  const cancelEvent = async (event: Event) => {
    setActionError("");
    let preview: { paid_tickets: number; free_tickets: number; paid_orders: number; refund_total: number | string } | null = null;
    try {
      const res = await fetch(`/api/admin/events/${event.id}/cancel`);
      await throwIfFailed(res);
      const data = await res.json();
      preview = data.preview ?? null;
    } catch (err) {
      setActionError(`Couldn't check what cancelling would do. ${err instanceof Error && err.message ? err.message : "Try again."}`);
      return;
    }
    const answer = await confirm({
      title: `Cancel “${event.name}” for the organiser?`,
      body: (
        <>
          Ticket sales stop and every ticket is voided. {preview ? `${preview.paid_orders} paid order${preview.paid_orders === 1 ? "" : "s"} (₦${Number(preview.refund_total).toLocaleString()}) will be refunded from the Refunds page; Byro's fee and the payment charge aren't refunded. ` : ""}
          Buyers and the organiser are told by email. This can't be undone.
        </>
      ),
      confirmLabel: "Cancel event",
      tone: "danger",
      input: { label: "Reason (the attendees see this)", placeholder: "This event didn't meet our policies", required: true, multiline: true, maxLength: 500 },
    });
    if (!answer) return;
    setUpdatingId(event.id);
    try {
      const res = await fetch(`/api/admin/events/${event.id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: String(answer) }),
      });
      await throwIfFailed(res);
      const patch = { cancelled_at: new Date().toISOString() };
      setEvents((prev) => prev.map((e) => (e.id === event.id ? { ...e, ...patch } : e)));
      setSelected((prev) => (prev && prev.id === event.id ? { ...prev, ...patch } : prev));
      toast.success("Event cancelled", { description: "Refunds are waiting on the Refunds page." });
    } catch (err) {
      setActionError(`Couldn't cancel this event. ${err instanceof Error && err.message ? err.message : "Try again."}`);
    } finally {
      setUpdatingId(null);
    }
  };

  // One proper dialog for each action, saying exactly what will happen.
  const askAction = async (event: Event, action: "suspend" | "reactivate" | "delete") => {
    const copy = {
      suspend: {
        title: `Suspend “${event.name}”?`,
        body: SUSPEND_EVENT_BODY,
        confirmLabel: "Suspend event",
        tone: "danger" as const,
      },
      reactivate: {
        title: `Reactivate “${event.name}”?`,
        body: "It goes back on Byro and can sell tickets again. The organiser is told by email.",
        confirmLabel: "Reactivate event",
        tone: "primary" as const,
      },
      delete: {
        title: `Delete “${event.name}” for good?`,
        body: "The event and its data are removed permanently. This can't be undone. Events with paid tickets or unfinished refunds can't be deleted; suspend them instead.",
        confirmLabel: "Delete event",
        tone: "danger" as const,
      },
    }[action];
    if (await confirm(copy)) runAction(event, action);
  };

  const selectedOverview = selected ? overview[selected.id] : undefined;

  const [search, setSearch] = useState("");
  const [visibilityFilter, setVisibilityFilter] = useState<"" | "public" | "private" | "draft">("");
  const q = search.trim().toLowerCase();
  const matchesVisibility = (e: Event) =>
    !visibilityFilter ||
    (visibilityFilter === "draft" ? Boolean(e.is_draft) : e.visibility === visibilityFilter && !e.is_draft);
  const matchesSearch = (e: Event) =>
    matchesVisibility(e) && (
    !q ||
    e.name.toLowerCase().includes(q) ||
    (e.location ?? "").toLowerCase().includes(q) ||
    (e.hosted_by ?? "").toLowerCase().includes(q));

  // Stats stay platform-wide; only the tables below narrow with the search box.
  const freeEvents = events.filter((e) => !isPaidEvent(e));
  const paidEvents = events.filter(isPaidEvent);
  const visibleFreeEvents = freeEvents.filter(matchesSearch);
  const visiblePaidEvents = paidEvents.filter(matchesSearch);

  return (
    <div className="p-5 md:p-8">
      <div className="mb-8">
        <h1 className="font-display text-ink text-3xl font-extrabold tracking-tight">Events</h1>
        <p className="text-muted text-sm mt-1">All events on the platform</p>
      </div>

      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by event name, location, or host…"
        className="w-full sm:w-80 mb-8 mr-3 bg-mist border border-line rounded-lg px-3 py-2 text-sm text-ink placeholder:text-faint focus:outline-none focus:ring-1 focus:ring-brand/40"
      />
      <select
        value={visibilityFilter}
        onChange={(e) => setVisibilityFilter(e.target.value as typeof visibilityFilter)}
        aria-label="Filter by visibility"
        className="mb-8 bg-mist border border-line rounded-lg px-3 py-2 text-sm text-ink focus:outline-none"
      >
        <option value="" className="bg-white">All events</option>
        <option value="public" className="bg-white">Public</option>
        <option value="private" className="bg-white">Private</option>
        <option value="draft" className="bg-white">Drafts</option>
      </select>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-8">
        {[
          { label: "Total Events", value: events.length },
          { label: "Free Events", value: freeEvents.length },
          { label: "Paid Events", value: paidEvents.length },
          { label: "Tickets Sold", value: loading || totalTicketsSold === null ? "—" : totalTicketsSold.toLocaleString() },
        ].map((stat) => (
          <div
            key={stat.label}
            className="bg-white border border-line rounded-xl px-5 py-4"
          >
            <p className="text-muted text-xs mb-1.5">{stat.label}</p>
            <p className="text-ink text-2xl font-semibold tabular-nums">
              {loading ? "—" : stat.value}
            </p>
          </div>
        ))}
      </div>

      {error && (
        <p className="text-danger text-sm mb-6">{error}</p>
      )}

      <div className="bg-white border border-line rounded-xl p-6 mb-6">
        <div className="flex items-center gap-2 mb-5">
          <h2 className="text-ink font-semibold">Free Events</h2>
          <span className="text-xs bg-good-tint text-good px-2 py-0.5 rounded-full">
            {visibleFreeEvents.length}
          </span>
        </div>
        {loading ? (
          <p className="text-faint text-sm py-6 text-center">Loading...</p>
        ) : (
          <EventTable
            events={visibleFreeEvents}
            emptyText={search ? "No free events match your search." : "No free events yet."}
            overview={overview}
            onSelect={openEvent}
          />
        )}
      </div>

      <div className="bg-white border border-line rounded-xl p-6">
        <div className="flex items-center gap-2 mb-5">
          <h2 className="text-ink font-semibold">Paid Events</h2>
          <span className="text-xs bg-sky text-brand-dark px-2 py-0.5 rounded-full">
            {visiblePaidEvents.length}
          </span>
        </div>
        {loading ? (
          <p className="text-faint text-sm py-6 text-center">Loading...</p>
        ) : (
          <EventTable
            events={visiblePaidEvents}
            emptyText={search ? "No paid events match your search." : "No paid events yet."}
            overview={overview}
            onSelect={openEvent}
          />
        )}
      </div>

      {selected && (
        <SidePanel title={selected.name} subtitle={selected.location ? `${formatDate(selected.day)}, ${selected.location}` : `${formatDate(selected.day)}, no location set`} onClose={closePanel}>
          <div className="p-6 space-y-6">
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-mist rounded-lg px-3 py-2.5">
                <p className="text-faint text-[11px] mb-0.5">Category</p>
                <p className="text-ink text-sm capitalize">{selected.category?.replace(/_/g, " ") || "—"}</p>
              </div>
              <div className="bg-mist rounded-lg px-3 py-2.5">
                <p className="text-faint text-[11px] mb-0.5">Price</p>
                <p className="text-ink text-sm tabular-nums">
                  {priceLabel(selected)}
                </p>
              </div>
              <div className="bg-mist rounded-lg px-3 py-2.5">
                <p className="text-faint text-[11px] mb-0.5">Status</p>
                <StatusBadge status={getEventStatus(selected)} />
              </div>
              <div className="bg-mist rounded-lg px-3 py-2.5">
                <p className="text-faint text-[11px] mb-0.5">Created</p>
                <p className="text-ink text-sm">{formatDateTime(selected.created_at)}</p>
              </div>
            </div>

            {selectedOverview && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: "Revenue", value: formatNaira(Number(selectedOverview.revenue)) },
                    { label: "Tickets sold", value: selectedOverview.tickets_sold },
                    {
                      label: "Checked in",
                      value: `${selectedOverview.checked_in} / ${selectedOverview.tickets_sold}`,
                    },
                    { label: "Promo redemptions", value: selectedOverview.promo_redemptions },
                    { label: "Pending", value: selectedOverview.pending },
                    { label: "Transferred", value: selectedOverview.transferred },
                  ].map((s) => (
                    <div key={s.label} className="bg-mist rounded-lg px-3 py-2.5">
                      <p className="text-faint text-[11px] mb-0.5">{s.label}</p>
                      <p className="text-ink text-sm tabular-nums">{s.value}</p>
                    </div>
                  ))}
                </div>
                {selectedOverview.tier_breakdown.length > 0 && (
                  <div>
                    <h4 className="text-ink text-sm font-semibold mb-2">Tiers</h4>
                    <div className="space-y-2">
                      {selectedOverview.tier_breakdown.map((t) => (
                        <div
                          key={t.id}
                          className="flex items-center justify-between gap-2 bg-mist rounded-lg px-3 py-2"
                        >
                          <div className="min-w-0">
                            <p className="text-ink text-xs font-medium truncate">{t.name}</p>
                            <p className="text-faint text-[11px] tabular-nums">
                              {Number(t.price) > 0 ? formatNaira(Number(t.price)) : "Free"}
                            </p>
                          </div>
                          <p className="shrink-0 text-body text-xs tabular-nums">
                            {t.sold} sold
                            {t.remaining !== null ? ` · ${t.remaining} left` : ""}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            <a
              href={publicHref(`/discover/${selected.slug}`)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block text-xs font-semibold text-brand-dark hover:text-brand-dark"
            >
              View public event page
            </a>

            {can.moderate && !selected.cancelled_at && (
              <EditDetails
                key={selected.id}
                event={selected}
                onSaved={(updated) => {
                  setEvents((prev) => prev.map((e) => (e.id === selected.id ? { ...e, ...updated } : e)));
                  setSelected((prev) => (prev && prev.id === selected.id ? { ...prev, ...updated } : prev));
                }}
              />
            )}

            {(can.moderate || can.delete) && <div>
              <h4 className="text-ink text-sm font-semibold mb-2">Moderation</h4>
              {actionError && <p className="text-danger text-xs mb-2">{actionError}</p>}
              <div className="flex items-center gap-2 flex-wrap">
                {can.moderate && <button
                  onClick={() => askAction(selected, selected.is_active ? "suspend" : "reactivate")}
                  disabled={updatingId === selected.id}
                  className={`text-xs font-semibold px-3 py-2 rounded-lg transition-colors disabled:opacity-50 ${
                    selected.is_active
                      ? "text-waiting bg-waiting-tint hover:bg-waiting-hover"
                      : "text-good bg-good-tint hover:bg-good-hover"
                  }`}
                >
                  {selected.is_active ? "Suspend event" : "Reactivate event"}
                </button>}
                {can.moderate && !selected.is_draft && <button
                  onClick={() => setVisibility(selected, selected.visibility === "private" ? "public" : "private")}
                  disabled={updatingId === selected.id}
                  className="text-xs font-semibold text-brand-dark bg-brand/10 hover:bg-brand/20 disabled:opacity-50 px-3 py-2 rounded-lg transition-colors"
                >
                  {selected.visibility === "private" ? "Make public" : "Make private"}
                </button>}
                {can.moderate && !selected.cancelled_at && <button
                  onClick={() => addAccess(selected, "cohost")}
                  disabled={updatingId === selected.id}
                  className="text-xs font-semibold text-brand-dark bg-brand/10 hover:bg-brand/20 disabled:opacity-50 px-3 py-2 rounded-lg transition-colors"
                >
                  Add co-host
                </button>}
                {can.delete && !selected.cancelled_at && <button
                  onClick={() => addAccess(selected, "owner")}
                  disabled={updatingId === selected.id}
                  className="text-xs font-semibold text-waiting bg-waiting-tint hover:bg-waiting-hover disabled:opacity-50 px-3 py-2 rounded-lg transition-colors"
                >
                  Transfer ownership
                </button>}
                {can.moderate && !selected.is_draft && !selected.cancelled_at && <button
                  onClick={() => changeSales(selected, selected.sales_closed ? "reopen" : "close")}
                  disabled={updatingId === selected.id}
                  className="text-xs font-semibold text-brand-dark bg-brand/10 hover:bg-brand/20 disabled:opacity-50 px-3 py-2 rounded-lg transition-colors"
                >
                  {selected.sales_closed ? "Reopen sales" : "Close sales"}
                </button>}
                {can.moderate && !selected.is_draft && !selected.cancelled_at && selectedOverview?.tickets_sold === 0 && <button
                  onClick={() => changeSales(selected, "draft")}
                  disabled={updatingId === selected.id}
                  className="text-xs font-semibold text-waiting bg-waiting-tint hover:bg-waiting-hover disabled:opacity-50 px-3 py-2 rounded-lg transition-colors"
                >
                  Move to draft
                </button>}
                {can.moderate && !selected.is_draft && !selected.cancelled_at && selected.day >= new Date().toLocaleDateString("en-CA") && <button
                  onClick={() => cancelEvent(selected)}
                  disabled={updatingId === selected.id}
                  className="text-xs font-semibold text-danger bg-danger-tint hover:bg-danger-hover disabled:opacity-50 px-3 py-2 rounded-lg transition-colors"
                >
                  Cancel event
                </button>}
                {can.delete && <button
                  onClick={() => askAction(selected, "delete")}
                  disabled={updatingId === selected.id}
                  className="text-xs font-semibold text-danger bg-danger-tint hover:bg-danger-hover disabled:opacity-50 px-3 py-2 rounded-lg transition-colors"
                >
                  Delete event
                </button>}
              </div>
            </div>}

            {can.moderate && selected.is_active && !selected.is_draft && selected.visibility !== "private" && (
              <div>
                <h4 className="text-ink text-sm font-semibold mb-1">Featuring</h4>
                <p className="text-faint text-xs leading-relaxed mb-3">
                  {isFeatured(selected)
                    ? `Shown first on the landing page and Discover until ${new Date(selected.featured_until!).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}.`
                    : "Show this event first on the landing page and Discover, with a Featured label."}
                </p>
                <div className="flex flex-wrap gap-2">
                  {[7, 14, 30].map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => feature(selected, d)}
                      disabled={featuring}
                      className="text-xs font-semibold px-3 py-2 rounded-lg bg-brand/10 text-brand-dark hover:bg-brand/20 disabled:opacity-50"
                    >
                      {isFeatured(selected) ? `Extend: ${d} days from now` : `Feature for ${d} days`}
                    </button>
                  ))}
                  {isFeatured(selected) && (
                    <button
                      type="button"
                      onClick={() => feature(selected, 0)}
                      disabled={featuring}
                      className="text-xs font-semibold px-3 py-2 rounded-lg text-muted bg-mist hover:text-ink disabled:opacity-50"
                    >
                      Stop featuring
                    </button>
                  )}
                </div>
              </div>
            )}

            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-ink text-sm font-semibold">
                  Attendees{attendees ? ` (${attendees.length})` : ""}
                </h4>
                {attendees && attendees.length > 0 && (
                  <button
                    onClick={() => downloadAttendeesCsv(selected, attendees)}
                    className="text-xs font-semibold text-brand-dark bg-sky hover:bg-brand/15 px-3 py-1.5 rounded-lg transition-colors"
                  >
                    Export CSV
                  </button>
                )}
              </div>
              {attendeesLoading ? (
                <SkeletonRows rows={4} />
              ) : attendeesError ? (
                <p className="text-faint text-sm">{attendeesError}</p>
              ) : attendees && attendees.length > 0 ? (
                <div className="space-y-2">
                  {attendees.map((a) => (
                    <div
                      key={a.ticket_id}
                      className="flex items-center justify-between gap-2 bg-mist rounded-lg px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="text-ink text-xs font-medium truncate">{a.current_owner_name}</p>
                        <p className="text-faint text-[11px] truncate">{a.current_owner_email}</p>
                      </div>
                      <span
                        className={`shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                          a.checked_in ? "bg-good-tint text-good" : "bg-mist text-muted"
                        }`}
                      >
                        {a.checked_in ? "Checked in" : "Not checked in"}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-faint text-sm">No attendees yet.</p>
              )}
            </div>
          </div>
        </SidePanel>
      )}

    </div>
  );
}
