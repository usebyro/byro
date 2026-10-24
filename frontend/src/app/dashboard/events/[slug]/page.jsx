"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { useParams, useRouter, notFound } from "next/navigation";
import { useReactToPrint } from "react-to-print";
import { toast } from "sonner";
import API from "@/services/api";
import ShareMenu from "@/components/ShareMenu";
import EventPublishedModal from "@/components/events/EventPublishedModal";
import CancelEventDialog from "@/components/events/CancelEventDialog";
import CancelledPanel from "@/components/events/CancelledPanel";
import PrintableGuestList from "@/components/events/PrintableGuestList";
import EventImageFallback from "@/components/ui/EventImageFallback";
import EventSalesChart from "@/components/dashboard/v2/EventSalesChart";
import EventGuestSheet from "@/components/dashboard/v2/EventGuestSheet";
import EventTeamPanel from "@/components/dashboard/v2/EventTeamPanel";
import SectionError from "@/components/dashboard/v2/SectionError";

const BASE_URL = (process.env.NEXT_PUBLIC_API_URL || "https://byro.onrender.com").replace(/\/api\/?$/, "");
const PAGE_SIZE = 25;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const fmtNaira = (n) => `₦${Math.round(Number(n || 0)).toLocaleString("en-NG")}`;
const num = (n) => Number(n || 0).toLocaleString("en-NG");

function formatDate(d) {
  if (!d) return "";
  return new Date(`${d.slice(0, 10)}T00:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

function formatTime(t) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

// "12 min ago", "2h ago", "Yesterday", then the date.
function boughtAgo(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  if (mins < 60 * 24 && new Date().getDate() === d.getDate()) return `${Math.round(mins / 60)}h ago`;
  const y = new Date();
  y.setDate(y.getDate() - 1);
  if (y.toDateString() === d.toDateString()) return "Yesterday";
  return `${d.getDate()} ${MONTHS[d.getMonth()]}${d.getFullYear() !== new Date().getFullYear() ? ` ${d.getFullYear()}` : ""}`;
}

function getImageUrl(event) {
  return (
    event.event_image_url ||
    (event.event_image?.startsWith("http")
      ? event.event_image
      : event.event_image
      ? `${BASE_URL}${event.event_image}`
      : null)
  );
}

// A spreadsheet must never read a cell as a formula.
const csvCell = (v) => {
  let s = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const Plus = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
);

const STATUS_INK = {
  good: { ink: "#1F7A52", dot: "#2F9E6E" },
  muted: { ink: "#5B6272", dot: "#CBD3DF" },
  waiting: { ink: "#8A5A00", dot: "#E0A100" },
  danger: { ink: "#B42318", dot: "#D92D20" },
};

function Modal({ children, labelledBy, onClose, busy }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, busy]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="v-scrim absolute inset-0 bg-[rgba(20,22,28,.4)]" onClick={() => !busy && onClose()} aria-hidden="true" />
      <div role="dialog" aria-modal="true" aria-labelledby={labelledBy} className="v-pop relative w-full max-w-sm rounded-[20px] bg-white p-6">
        {children}
      </div>
    </div>
  );
}

export default function StudioEventPage() {
  const { slug } = useParams();
  const router = useRouter();

  const [showPublished, setShowPublished] = useState(false);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("published") === "1") setShowPublished(true);
  }, []);
  const closePublished = () => {
    setShowPublished(false);
    router.replace(`/dashboard/events/${slug}`);
  };

  const [event, setEvent] = useState(null);
  const [suspended, setSuspended] = useState(null);
  const [eventRevenue, setEventRevenue] = useState(null);
  const [summary, setSummary] = useState(null);
  const [attendees, setAttendees] = useState([]);
  const [checkedInCount, setCheckedInCount] = useState(0);
  const [loadingEvent, setLoadingEvent] = useState(true);
  const [loadingAttendees, setLoadingAttendees] = useState(true);
  const [attendeesLoaded, setAttendeesLoaded] = useState(false);
  const [attendeesError, setAttendeesError] = useState(false);
  const [eventError, setEventError] = useState(false);
  const [activeTab, setActiveTab] = useState("guests");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all"); // all | in | out
  const [sort, setSort] = useState("newest");
  const [page, setPage] = useState(0);
  const [openGuestId, setOpenGuestId] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [tiers, setTiers] = useState([]);
  const [showDelete, setShowDelete] = useState(false);
  const [formQuestions, setFormQuestions] = useState([]);
  const [showCancel, setShowCancel] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const menuRef = useRef(null);
  const teamEmailRef = useRef(null);
  const detailsRef = useRef(null);

  // Discount codes
  const [discountCodes, setDiscountCodes] = useState([]);
  const [savingDiscount, setSavingDiscount] = useState(false);
  const [showDiscountModal, setShowDiscountModal] = useState(false);
  const [discountMenuOpen, setDiscountMenuOpen] = useState(null);
  const [discountToDelete, setDiscountToDelete] = useState(null);
  const [deletingDiscount, setDeletingDiscount] = useState(false);
  const [discountForm, setDiscountForm] = useState({
    code: "",
    type: "percent", // percent | fixed
    value: "",
    maxUses: "",
    expiresAt: "",
  });

  // Backend <-> UI shape mapping for promo codes.
  const mapPromoFromApi = (p) => ({
    id: p.id,
    code: p.code,
    type: p.discount_type === "percentage" ? "percent" : "fixed",
    value: Number(p.amount),
    maxUses: p.max_redemptions ?? null,
    used: p.redeemed_count ?? 0,
    expiresAt: p.expires_at ? p.expires_at.slice(0, 10) : null,
    active: p.active,
  });

  const printRef = useRef();
  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `GuestList-${slug}`,
  });

  const loadEvent = useCallback(() => {
    if (!slug) return Promise.resolve();
    return API.getEvent(slug)
      .then(setEvent)
      .catch((err) => {
        if (err?.status === 404) setEventError(true);
        else if (err?.suspended) setSuspended(err.event || {});
      });
  }, [slug]);

  useEffect(() => {
    loadEvent().finally(() => setLoadingEvent(false));
  }, [loadEvent]);

  useEffect(() => {
    document.title = event?.name ? `${event.name} | Byro` : "Event | Byro";
  }, [event]);

  useEffect(() => {
    if (!slug) return;
    API.getDashboardAnalytics()
      .then((a) => {
        const stats = a?.events?.[slug];
        // Co-hosts see sales but not the revenue: that belongs to the owner.
        setEventRevenue(stats && stats.is_owner === false ? null : Number(stats?.revenue ?? 0));
      })
      .catch(() => setEventRevenue(null));
  }, [slug]);

  const loadSummary = useCallback(() => {
    if (!slug) return;
    API.getDashEventSummary(slug).then(setSummary).catch(() => {});
  }, [slug]);
  useEffect(() => { loadSummary(); }, [loadSummary]);

  const loadAttendees = () => {
    if (!slug) return;
    setLoadingAttendees(true);
    setAttendeesError(false);
    API.getEventAttendees(slug)
      .then((res) => {
        const mapped = (res.attendees || []).map((t) => ({
          id: t.ticket_id,
          name: t.current_owner_name || t.original_owner_name || "Unknown",
          email: t.current_owner_email || t.original_owner_email || "",
          checkedIn: t.checked_in,
          checkedInAt: t.checked_in_at || "",
          paymentStatus: t.payment_status,
          qrToken: t.qr_token,
          ref: String(t.ticket_id || "").replace(/-/g, "").toUpperCase().slice(0, 12),
          tier: t.tier_name || "General admission",
          tierId: t.tier ?? null,
          registeredAt: t.created_at || "",
          answers: (t.form_answers || []).map((f) => ({
            questionId: f.question,
            question: f.question_text,
            answer: Array.isArray(f.answer) ? f.answer.join(", ") : String(f.answer ?? ""),
          })),
        }));
        setAttendees(mapped);
        setCheckedInCount(res.checked_in_count || 0);
        setAttendeesLoaded(true);
      })
      .catch(() => setAttendeesError(true))
      .finally(() => setLoadingAttendees(false));
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadAttendees(); }, [slug]);
  // Placeholders only on the first load; a refresh keeps the numbers people are reading.
  const guestsFirstLoad = loadingAttendees && !attendeesLoaded;
  const guestsUnknown = attendeesError && !attendeesLoaded;

  useEffect(() => {
    if (!slug) return;
    API.getFormQuestions(slug).then((q) => setFormQuestions(Array.isArray(q) ? q : [])).catch(() => {});
  }, [slug]);

  useEffect(() => {
    if (!slug) return;
    API.getEventTiers(slug)
      .then((d) => setTiers(Array.isArray(d) ? d : d?.tiers || []))
      .catch(() => {});
  }, [slug]);

  useEffect(() => {
    if (!slug) return;
    API.getPromoCodes(slug)
      .then((res) => setDiscountCodes((res || []).map(mapPromoFromApi)))
      .catch(() => {});
  }, [slug]);

  // The More menu closes on a click outside it or Escape.
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e) => menuRef.current && !menuRef.current.contains(e.target) && setMenuOpen(false);
    const onKey = (e) => e.key === "Escape" && setMenuOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const handleDelete = async () => {
    if (deleteConfirm.trim() !== (event?.name || "").trim()) return;
    setDeleting(true);
    try {
      await API.deleteEvent(slug);
      toast.success("Event deleted");
      router.push("/dashboard/events");
    } catch (err) {
      toast.error("Couldn't delete event", { description: err?.message });
      setDeleting(false);
      setShowDelete(false);
      setDeleteConfirm("");
    }
  };

  const generateCode = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "";
    for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)];
    setDiscountForm((f) => ({ ...f, code }));
  };

  const resetDiscountForm = () =>
    setDiscountForm({ code: "", type: "percent", value: "", maxUses: "", expiresAt: "" });

  const handleCreateDiscount = async (e) => {
    e.preventDefault();
    const code = discountForm.code.trim().toUpperCase();
    if (!code || !discountForm.value || savingDiscount) return;
    if (discountCodes.some((d) => d.code === code)) {
      toast.error(`You already have a code called ${code}`, { description: "Try another name." });
      return;
    }
    setSavingDiscount(true);
    try {
      const created = await API.createPromoCode(slug, {
        code,
        discount_type: discountForm.type === "percent" ? "percentage" : "fixed",
        amount: Number(discountForm.value),
        max_redemptions: discountForm.maxUses ? Number(discountForm.maxUses) : null,
        expires_at: discountForm.expiresAt || null,
      });
      setDiscountCodes((prev) => [mapPromoFromApi(created), ...prev]);
      toast.success("Discount code created", { description: code });
      setShowDiscountModal(false);
      resetDiscountForm();
    } catch (err) {
      toast.error("Couldn't create code", { description: err?.message });
    } finally {
      setSavingDiscount(false);
    }
  };

  const toggleDiscountActive = async (id) => {
    setDiscountMenuOpen(null);
    const current = discountCodes.find((d) => d.id === id);
    if (!current) return;
    try {
      const updated = await API.updatePromoCode(slug, id, { active: !current.active });
      setDiscountCodes((prev) => prev.map((d) => (d.id === id ? mapPromoFromApi(updated) : d)));
    } catch (err) {
      toast.error("Couldn't update code", { description: err?.message });
    }
  };

  const deleteDiscount = async () => {
    if (!discountToDelete) return;
    const { id } = discountToDelete;
    setDeletingDiscount(true);
    try {
      await API.deletePromoCode(slug, id);
      setDiscountCodes((prev) => prev.filter((d) => d.id !== id));
      setDiscountToDelete(null);
    } catch (err) {
      toast.error("Couldn't delete code", { description: err?.message });
    } finally {
      setDeletingDiscount(false);
    }
  };

  const copyDiscountCode = (code) => {
    navigator.clipboard?.writeText(code);
    toast.success("Code copied", { description: code });
  };

  const getDiscountStatus = (d) => {
    if (!d.active) return { label: "Paused", tone: "muted" };
    if (d.expiresAt && new Date(d.expiresAt) < new Date()) return { label: "Expired", tone: "danger" };
    if (d.maxUses && d.used >= d.maxUses) return { label: "Used up", tone: "waiting" };
    return { label: "Active", tone: "good" };
  };

  const copyEventLink = () => {
    navigator.clipboard
      .writeText(`${window.location.origin}/discover/${slug}`)
      .then(() => toast.success("Link copied"))
      .catch(() => toast.error("Couldn't copy link"));
  };

  // Check in from the guest sheet, by the ticket's own QR token so the right ticket is used.
  const checkInGuest = async (guest) => {
    try {
      const res = await API.checkInAttendee(slug, guest.qrToken);
      const at = res?.attendee?.checked_in_at || res?.checked_in_at || new Date().toISOString();
      setAttendees((prev) => prev.map((a) => (a.id === guest.id ? { ...a, checkedIn: true, checkedInAt: at } : a)));
      if (!res?.already_checked_in) setCheckedInCount((n) => n + 1);
      toast.success(res?.already_checked_in ? "Already checked in" : "Checked in", { description: guest.name });
    } catch (err) {
      toast.error("Couldn't check in", { description: err?.message });
    }
  };

  const exportCsv = () => {
    const questions = formQuestions.map((q) => ({ id: q.id, text: q.question }));
    const head = ["Name", "Email", "Ticket", "Ref", "Bought", "Checked in", "Checked in at", ...questions.map((q) => q.text)];
    const rows = attendees.map((a) => {
      const byQ = new Map(a.answers.map((x) => [x.questionId, x.answer]));
      return [
        a.name, a.email, a.tier, a.ref,
        a.registeredAt ? new Date(a.registeredAt).toLocaleString("en-GB") : "",
        a.checkedIn ? "Yes" : "No",
        a.checkedInAt ? new Date(a.checkedInAt).toLocaleString("en-GB") : "",
        ...questions.map((q) => byQ.get(q.id) ?? ""),
      ];
    });
    const csv = [head, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `guests-${slug}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast.success("Guest list downloaded", { description: `${attendees.length} guest${attendees.length === 1 ? "" : "s"}` });
  };

  if (eventError) return notFound();

  // A suspended event someone else runs: tell them, don't show a broken page.
  if (suspended && !event) {
    return (
      <div className="mx-auto flex w-full max-w-[1240px] flex-col gap-5 px-4 pb-12 pt-4 sm:px-[clamp(16px,3vw,40px)] md:gap-6 md:pt-2">
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm font-bold">
          <Link href="/dashboard/events" className="text-muted no-underline">Events</Link>
        </nav>
        <section className="v-card v-bf flex flex-col gap-2 p-6">
          <span className="v-status text-[13px]" style={{ color: STATUS_INK.danger.ink }}>
            <span className="v-dot" style={{ background: STATUS_INK.danger.dot }} />Suspended
          </span>
          <h1 className="v-h1">{suspended.name || "This event"}</h1>
          <p className="v-sub">This event is currently suspended, so it can&apos;t be managed here.</p>
        </section>
      </div>
    );
  }

  const img = event ? getImageUrl(event) : null;
  const isDraft = Boolean(event?.is_draft);
  const isCancelled = Boolean(event?.cancelled_at);
  const isSuspended = Boolean(event) && !event.is_active && !isDraft && !isCancelled;
  // What this person may do here: owners run everything, co-hosts depend on their permission.
  const role = event?.role || {};
  const isOwner = Boolean(role.is_owner);
  const canEdit = Boolean(role.can_edit);
  const canDelete = Boolean(role.can_delete);
  const canCheckIn = Boolean(role.can_check_in) && !isDraft && !isCancelled;
  // Compare calendar days so an event happening today can still be cancelled.
  const todayIso = new Date().toLocaleDateString("en-CA");
  const eventDay = event?.day ? event.day.slice(0, 10) : null;
  const isPast = Boolean(eventDay) && eventDay < todayIso;
  const isToday = eventDay === todayIso;
  const isFuture = Boolean(eventDay) && eventDay > todayIso;
  const canCancel = isOwner && !isDraft && !isCancelled && Boolean(eventDay) && eventDay >= todayIso;
  const daysToGo = isFuture ? Math.round((new Date(`${eventDay}T00:00:00`) - new Date(`${todayIso}T00:00:00`)) / 86400000) : 0;

  const status = !event ? null
    : isCancelled ? { label: "Cancelled", tone: "danger" }
    : isDraft ? { label: "Draft · not public", tone: "waiting" }
    : isSuspended ? { label: "Suspended by Byro", tone: "danger" }
    : isPast ? { label: "Ended", tone: "muted" }
    : isToday ? { label: event.is_sold_out ? "Sold out · happening today" : "Happening today", tone: "good" }
    : { label: `${event.is_sold_out ? "Sold out" : "On sale"} · ${daysToGo === 1 ? "tomorrow" : `${daysToGo} days to go`}`, tone: event.is_sold_out ? "muted" : "good" };

  // People who help run it: the owner, then accepted co-hosts (pending invites grant nothing).
  const cohosts = event?.cohosts || [];
  const activeHelpers = cohosts.filter((c) => c.status !== "pending");
  const hostNames = activeHelpers.filter((c) => (c.role || "manager") === "manager").map((c) => c.name || c.email);
  const lead = isOwner ? "you" : event?.owner_name || event?.hosted_by || "the organiser";
  const hostedBy = [lead, ...hostNames];
  const hostedLine = hostedBy.length <= 2
    ? hostedBy
    : [hostedBy[0], hostedBy[1], `${hostedBy.length - 2} other${hostedBy.length - 2 === 1 ? "" : "s"}`];
  const faces = [{ key: "owner", name: event?.owner_name || event?.owner_email || "Owner", owner: true }, ...activeHelpers.map((c) => ({ key: c.id, name: c.name || c.email }))];
  const facesLabel = `Hosts: ${hostedBy.join(", ")}. Open team`;

  const goTeam = () => {
    setActiveTab("team");
    setMenuOpen(false);
    detailsRef.current?.scrollIntoView({ behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
    setTimeout(() => teamEmailRef.current?.focus({ preventScroll: true }), 60);
  };

  const sold = attendees.length;
  const capacity = summary?.capacity ?? event?.capacity ?? null;
  const left = capacity ? Math.max(0, capacity - sold) : null;
  const soldPct = capacity ? Math.min(100, (sold / capacity) * 100) : 0;
  const revenue = summary?.revenue ?? (eventRevenue === null ? null : eventRevenue);
  const showRevenue = isOwner && revenue !== null && revenue !== undefined;

  const tierCounts = attendees.reduce((m, a) => {
    m[a.tier] = (m[a.tier] || 0) + 1;
    return m;
  }, {});
  const tierRows = (tiers.length ? tiers : event ? [{ id: "none", name: "General admission", price: event.ticket_price, capacity: event.capacity, flat: true }] : []).map((t) => {
    const tSold = t.flat ? sold : t.sold ?? tierCounts[t.name] ?? 0;
    const cap = Number(t.capacity) || 0;
    const price = Number(t.price) || 0;
    const tierRevenue = summary?.tier_revenue ? summary.tier_revenue[String(t.id)] ?? "0" : null;
    const soldOut = cap > 0 && tSold >= cap;
    const note = t.description || (t.max_tickets_per_person ? `Up to ${t.max_tickets_per_person} per order` : t.flat ? "One price for everyone" : "");
    return {
      key: t.id ?? t.name, name: t.name, note, price: price === 0 ? "Free" : fmtNaira(price),
      sold: tSold, cap, pct: cap > 0 ? Math.min(100, (tSold / cap) * 100) : null,
      soldLabel: cap > 0 ? `${num(tSold)} of ${num(cap)}` : `${num(tSold)}`,
      revenue: tierRevenue, soldOut,
      status: soldOut ? "Sold out" : isCancelled ? "Cancelled" : isPast ? "Ended" : isDraft ? "Not on sale yet" : "On sale",
      tone: soldOut || isPast || isDraft ? "muted" : isCancelled ? "danger" : "good",
    };
  });
  // When each limited ticket type ran out, for the chart.
  const soldOutMarks = tierRows
    .filter((t) => t.soldOut && !String(t.key).startsWith("none"))
    .map((t) => {
      const dates = attendees.filter((a) => a.tier === t.name).map((a) => a.registeredAt).filter(Boolean).sort();
      return { name: t.name, at: dates[t.cap - 1] };
    })
    .filter((m) => m.at);

  const nIn = attendees.filter((a) => a.checkedIn).length;
  const SORTERS = {
    newest:     (a, b) => (b.registeredAt || "").localeCompare(a.registeredAt || ""),
    oldest:     (a, b) => (a.registeredAt || "").localeCompare(b.registeredAt || ""),
    name:       (a, b) => a.name.localeCompare(b.name),
    notarrived: (a, b) => Number(a.checkedIn) - Number(b.checkedIn) || a.name.localeCompare(b.name),
    arrived:    (a, b) => Number(b.checkedIn) - Number(a.checkedIn) || a.name.localeCompare(b.name),
    tier:       (a, b) => a.tier.localeCompare(b.tier) || a.name.localeCompare(b.name),
  };

  const q = search.trim().toLowerCase();
  const filteredAttendees = attendees
    .filter((a) => {
      const matchSearch = !q ||
        a.name.toLowerCase().includes(q) ||
        a.email.toLowerCase().includes(q) ||
        a.ref.toLowerCase().includes(q);
      const matchFilter = filter === "all" || (filter === "in" ? a.checkedIn : !a.checkedIn);
      return matchSearch && matchFilter;
    })
    .sort(SORTERS[sort] || SORTERS.newest);
  const pages = Math.max(1, Math.ceil(filteredAttendees.length / PAGE_SIZE));
  const pageIndex = Math.min(page, pages - 1);
  const shownGuests = filteredAttendees.slice(pageIndex * PAGE_SIZE, (pageIndex + 1) * PAGE_SIZE);
  const openGuest = openGuestId ? attendees.find((a) => a.id === openGuestId) : null;

  const TABS = [
    { key: "guests", label: "Guests", n: guestsFirstLoad || guestsUnknown ? "" : num(sold) },
    ...(canEdit ? [
      { key: "tickets", label: "Tickets", n: String(tierRows.length) },
      { key: "discounts", label: "Discounts", n: String(discountCodes.length) },
    ] : []),
    ...(isOwner ? [{ key: "team", label: "Team", n: String(1 + cohosts.length) }] : []),
  ];
  const currentTab = TABS.some((t) => t.key === activeTab) ? activeTab : "guests";

  const menuItems = [
    isOwner && { key: "team", label: "Co-hosts and door staff" },
    isOwner && !isDraft && !isCancelled && { key: "email", label: "Email ticket holders", href: `/dashboard/messages?event=${encodeURIComponent(slug)}` },
    !isDraft && !isCancelled && { key: "link", label: "Copy event link" },
    canCheckIn && attendees.length > 0 && { key: "print", label: "Print guest list" },
  ].filter(Boolean);
  const dangerItems = [
    canCancel && { key: "cancel", label: "Cancel event" },
    canDelete && { key: "delete", label: "Delete event" },
  ].filter(Boolean);
  const runMenu = (key) => {
    if (key === "team") return goTeam();
    setMenuOpen(false);
    if (key === "link") copyEventLink();
    else if (key === "print") handlePrint();
    else if (key === "cancel") setShowCancel(true);
    else if (key === "delete") setShowDelete(true);
  };
  const menuRow = "v-row flex h-10 w-full cursor-pointer items-center rounded-[10px] border-0 bg-transparent px-3 text-left text-sm font-bold text-ink no-underline";

  const tone = (t) => STATUS_INK[t] || STATUS_INK.muted;

  return (
    <div className="mx-auto flex w-full max-w-[1240px] flex-col gap-5 px-4 pb-12 pt-4 sm:px-[clamp(16px,3vw,40px)] md:gap-6 md:pt-2">
      <nav aria-label="Breadcrumb" className="v-bf flex min-w-0 items-center gap-2 text-sm font-bold" style={{ "--i": 0 }}>
        <Link href="/dashboard/events" className="shrink-0 text-muted no-underline">Events</Link>
        <span aria-hidden="true" className="text-faint">/</span>
        <span aria-current="page" className="truncate">{event?.name || "Event"}</span>
      </nav>

      {isCancelled && <CancelledPanel slug={slug} reason={event.cancel_reason} />}
      {isSuspended && (
        <section aria-label="Event suspended" className="rounded-[20px] bg-danger-tint px-5 py-4 text-sm text-danger">
          <p className="m-0 font-extrabold">Byro has suspended this event.</p>
          <p className="m-0 mt-1 text-body">It&apos;s hidden from the public and nobody can buy tickets. Tickets already sold still work. Check your email for what to do next.</p>
        </section>
      )}

      <div className="v-bf relative z-20 flex flex-wrap items-end gap-4" style={{ "--i": 1 }}>
        <div className="relative h-[76px] w-[76px] shrink-0 overflow-hidden rounded-[18px] bg-mist">
          {img ? (
            <Image src={img} alt="" fill sizes="76px" className="object-cover" />
          ) : event ? (
            <EventImageFallback category={event.category} tone="soft" />
          ) : (
            <div className="v-skel h-full w-full" />
          )}
        </div>
        <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-1.5">
          {status && (
            <span className="v-status text-[13px]" style={{ color: tone(status.tone).ink }}>
              <span className="v-dot" style={{ background: tone(status.tone).dot }} />{status.label}
            </span>
          )}
          {loadingEvent ? (
            <div className="v-skel h-8 w-64 max-w-full" />
          ) : (
            <h1 className="v-h1 break-words">{event?.name}</h1>
          )}
          {event && (
            <p className="v-sub">
              {[formatDate(event.day) + (event.time_from ? `, ${formatTime(event.time_from)}` : ""), event.location].filter(Boolean).join(" · ")}
            </p>
          )}
          {event && (
            <div className="mt-1.5 flex flex-wrap items-center gap-2.5">
              {isOwner ? (
                <button type="button" onClick={goTeam} aria-label={facesLabel} className="flex cursor-pointer border-0 bg-transparent p-0">
                  {faces.slice(0, 3).map((f, i) => (
                    <span
                      key={f.key}
                      className={`v-av h-[30px] w-[30px] ${i ? "-ml-2" : ""}`}
                      style={{ boxShadow: "0 0 0 2px #FFFFFF", ...(i === 0 ? { background: "#14161C", color: "#FFFFFF" } : i === 1 ? { background: "#DCE6FD", color: "#2451D6" } : {}) }}
                    >
                      {(f.name || "?")[0].toUpperCase()}
                    </span>
                  ))}
                  {faces.length > 3 && (
                    <span className="v-av -ml-2 h-[30px] w-[30px] text-[11px]" style={{ boxShadow: "0 0 0 2px #FFFFFF" }}>+{faces.length - 3}</span>
                  )}
                </button>
              ) : null}
              <span className="text-sm text-body">
                Hosted by{" "}
                {hostedLine.map((h, i) => (
                  <span key={i}>
                    {i > 0 && (i === hostedLine.length - 1 ? " and " : ", ")}
                    <b>{h}</b>
                  </span>
                ))}
              </span>
              {isOwner && !isCancelled && (
                <button type="button" onClick={goTeam} className="v-btn v-btn-s v-btn-sm"><Plus />Add co-host</button>
              )}
            </div>
          )}
        </div>

        {event && (
          <div ref={menuRef} className="relative flex flex-wrap gap-2">
            {canCheckIn && (
              <Link href={`/checkin/${slug}`} className="v-btn v-btn-p v-btn-lg">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M4 12h16" /></svg>
                Check in
              </Link>
            )}
            {!isDraft && !isCancelled && (
              <ShareMenu
                url={typeof window !== "undefined" ? `${window.location.origin}/discover/${slug}` : ""}
                title={event?.name || ""}
                campaign="event_share"
                content={slug}
                className="v-btn v-btn-s v-btn-lg"
              >
                Share
              </ShareMenu>
            )}
            {canEdit && !isCancelled && (
              <Link href={`/dashboard/events/${slug}/edit`} className={`v-btn v-btn-lg ${isDraft ? "v-btn-p" : "v-btn-s"}`}>
                {isDraft ? "Continue editing" : "Edit"}
              </Link>
            )}
            {(menuItems.length > 0 || dangerItems.length > 0) && (
              <button
                type="button"
                className="v-icon-btn h-11 w-11"
                aria-label="More actions"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((o) => !o)}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></svg>
              </button>
            )}
            {menuOpen && (
              <div role="menu" className="v-card v-pop absolute right-0 top-[52px] z-30 flex w-60 flex-col p-1.5">
                {menuItems.map((m) =>
                  m.href ? (
                    <Link key={m.key} href={m.href} role="menuitem" className={menuRow} onClick={() => setMenuOpen(false)}>{m.label}</Link>
                  ) : (
                    <button key={m.key} type="button" role="menuitem" className={menuRow} onClick={() => runMenu(m.key)}>{m.label}</button>
                  )
                )}
                {menuItems.length > 0 && dangerItems.length > 0 && <div className="my-1 h-px bg-hairline" />}
                {dangerItems.map((m) => (
                  <button key={m.key} type="button" role="menuitem" className={`${menuRow} !text-danger`} onClick={() => runMenu(m.key)}>{m.label}</button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <section aria-label="Totals" className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(220px, 100%), 1fr))" }}>
        <div className="v-card v-bf flex flex-col gap-2.5 px-5 py-[18px]" style={{ "--i": 2 }}>
          <span className="v-eyebrow">Tickets sold</span>
          {guestsFirstLoad ? <span className="v-skel h-7 w-20" /> : (
            <span className="flex items-baseline gap-1.5">
              <span className="v-fig">{guestsUnknown ? "—" : num(sold)}</span>
              {capacity ? <span className="v-hint">of {num(capacity)}</span> : null}
            </span>
          )}
          {capacity ? (
            <>
              <div className="h-1.5 overflow-hidden rounded-full bg-[#DCE6FD]">
                <div className="v-growx h-full rounded-full bg-brand" style={{ width: `${soldPct}%` }} />
              </div>
              <span className="v-hint">{left === 0 ? "Sold out" : `${num(left)} left · ${Math.round(soldPct)}% sold`}</span>
            </>
          ) : (
            <span className="v-hint mt-auto">No limit set</span>
          )}
        </div>
        {showRevenue && (
          <div className="v-card v-bf flex flex-col gap-2.5 px-5 py-[18px]" style={{ "--i": 3 }}>
            <span className="v-eyebrow">Revenue</span>
            <span className="v-fig">{fmtNaira(revenue)}</span>
            <span className="v-hint mt-auto">Goes to your wallet as tickets sell</span>
          </div>
        )}
        <div className="v-card v-bf flex flex-col gap-2.5 px-5 py-[18px]" style={{ "--i": 4 }}>
          <span className="v-eyebrow">Checked in</span>
          {guestsFirstLoad ? <span className="v-skel h-7 w-20" /> : (
            <span className="flex items-baseline gap-1.5">
              <span className="v-fig">{guestsUnknown ? "—" : num(checkedInCount)}</span>
              <span className="v-hint">of {num(sold)}</span>
            </span>
          )}
          <span className="v-hint mt-auto">
            {isFuture || isDraft ? "Opens on event day" : sold ? `${Math.round((checkedInCount / sold) * 100)}% ${isPast ? "came" : "here so far"}` : "Nobody to check in yet"}
          </span>
        </div>
        {summary && (
          <div className="v-card v-bf flex flex-col gap-2.5 px-5 py-[18px]" style={{ "--i": 5 }}>
            <span className="v-eyebrow">New followers</span>
            <span className="v-fig">+{num(summary.new_followers)}</span>
            <span className="v-hint mt-auto">From this event</span>
          </div>
        )}
      </section>

      <div className="flex flex-wrap items-stretch gap-5">
        {guestsFirstLoad ? (
          <section aria-label="Sales over time" className="v-card flex min-w-0 flex-[3_1_480px] flex-col gap-4 p-[22px]">
            <div className="v-skel h-5 w-48" />
            <div className="v-skel h-[190px] w-full" />
          </section>
        ) : (
          <EventSalesChart
            dates={attendees.map((a) => a.registeredAt).filter(Boolean)}
            soldOut={soldOutMarks}
            endDay={isPast ? eventDay : null}
            style={{ "--i": 6 }}
          />
        )}

        <section aria-label="Ticket types" className="v-card v-bf flex min-w-0 flex-[2_1_320px] flex-col gap-[18px] p-[22px]" style={{ "--i": 7 }}>
          <div className="flex items-baseline justify-between">
            <h2 className="v-h2">Ticket types</h2>
            {canEdit && (
              <button type="button" className="v-viz-toggle" onClick={() => { setActiveTab("tickets"); detailsRef.current?.scrollIntoView({ block: "start" }); }}>Manage</button>
            )}
          </div>
          {tierRows.map((t, i) => (
            <div key={t.key} className="flex flex-col gap-2">
              <div className="flex items-baseline gap-2">
                <span className="min-w-0 flex-grow break-words text-[15px] font-extrabold">
                  {t.name} <span className="font-semibold text-muted">· {t.price}</span>
                </span>
                <span className="v-status text-[13px]" style={{ color: tone(t.tone).ink }}>{t.status}</span>
              </div>
              <div className="h-2.5 overflow-hidden rounded bg-[#DCE6FD]">
                {t.pct !== null && <div className="v-growx h-full rounded bg-brand" style={{ "--i": i, width: `${t.pct}%` }} />}
              </div>
              <span className="v-hint v-tab">
                {t.soldLabel} sold{t.revenue !== null && isOwner ? ` · ${fmtNaira(t.revenue)}` : ""}
              </span>
            </div>
          ))}
        </section>
      </div>

      <section id="details" ref={detailsRef} aria-label="Event details" className="v-card v-bf scroll-mt-4 overflow-hidden" style={{ "--i": 8 }}>
        <div role="tablist" aria-label="Event sections" className="flex gap-1 overflow-x-auto border-b border-hairline px-4">
          {TABS.map((t) => {
            const on = currentTab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                id={`tab-${t.key}`}
                aria-selected={on}
                aria-controls={`panel-${t.key}`}
                onClick={() => setActiveTab(t.key)}
                className="h-[52px] cursor-pointer whitespace-nowrap border-0 bg-transparent px-3 text-[15px] font-extrabold transition-[box-shadow,color] duration-200"
                style={{ color: on ? "#14161C" : "#5B6272", boxShadow: `inset 0 -2px 0 ${on ? "#3669F6" : "transparent"}` }}
              >
                {t.label} {t.n && <span className="font-bold text-faint">{t.n}</span>}
              </button>
            );
          })}
        </div>

        {currentTab === "guests" && (
          <div role="tabpanel" id="panel-guests" aria-labelledby="tab-guests">
            <div className="flex flex-wrap items-center gap-3 px-5 py-4">
              <label className="v-search min-w-0 flex-[1_1_220px] sm:flex-[0_1_280px]">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5B6272" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
                <input type="search" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} placeholder="Search guests…" aria-label="Search guests" />
              </label>
              <div role="group" aria-label="Filter guests" className="v-seg">
                {[["all", "All", sold], ["in", "Checked in", nIn], ["out", "Not arrived", sold - nIn]].map(([k, l, n]) => (
                  <button key={k} type="button" aria-pressed={filter === k} onClick={() => { setFilter(k); setPage(0); }}>
                    {l}<span className="n">{num(n)}</span>
                  </button>
                ))}
              </div>
              <label className="sr-only" htmlFor="guest-sort">Sort guests</label>
              <select id="guest-sort" value={sort} onChange={(e) => { setSort(e.target.value); setPage(0); }} className="h-10 cursor-pointer rounded-full border border-line bg-white px-3.5 text-[13px] font-bold text-ink">
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="name">Name A to Z</option>
                <option value="notarrived">Not arrived first</option>
                <option value="arrived">Checked in first</option>
                <option value="tier">By ticket</option>
              </select>
              <div className="hidden flex-grow sm:block" />
              <div className="flex gap-2">
                <button type="button" className="v-btn v-btn-s v-btn-sm" onClick={exportCsv} disabled={attendees.length === 0}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></svg>
                  Export CSV
                </button>
                <button type="button" className="v-btn v-btn-s v-btn-sm" onClick={handlePrint} disabled={attendees.length === 0} title="Opens the print window. Choose Save as PDF.">
                  Export PDF
                </button>
              </div>
            </div>

            {attendeesError && !attendeesLoaded ? (
              <SectionError what="your guests" onRetry={loadAttendees} className="border-t border-hairline" />
            ) : guestsFirstLoad ? (
              <div className="flex flex-col gap-3 border-t border-hairline px-5 py-4">
                {[0, 1, 2, 3, 4].map((i) => (
                  <div key={i} className="flex items-center gap-3">
                    <span className="v-skel h-8 w-8 rounded-full" />
                    <span className="flex flex-1 flex-col gap-1.5"><span className="v-skel h-3 w-32" /><span className="v-skel h-2.5 w-44 max-w-full" /></span>
                  </div>
                ))}
              </div>
            ) : filteredAttendees.length === 0 ? (
              <div className="flex flex-col items-center gap-1 border-t border-hairline px-4 py-12 text-center">
                {q || filter !== "all" ? (
                  <>
                    <p className="m-0 text-[15px] font-extrabold">No guests match</p>
                    <button type="button" className="v-btn v-btn-t v-btn-sm mt-1" onClick={() => { setSearch(""); setFilter("all"); }}>Clear search and filters</button>
                  </>
                ) : isDraft ? (
                  <>
                    <p className="m-0 text-[15px] font-extrabold">No guests yet</p>
                    <p className="v-hint m-0">This event is a draft. Publish it to start selling tickets.</p>
                    {canEdit && <Link href={`/dashboard/events/${slug}/edit`} className="v-btn v-btn-p mt-3">Continue editing</Link>}
                  </>
                ) : (
                  <>
                    <p className="m-0 text-[15px] font-extrabold">No guests yet</p>
                    <p className="v-hint m-0">Share your event link to get your first guests.</p>
                    {!isCancelled && <button type="button" className="v-btn v-btn-p mt-3" onClick={copyEventLink}>Copy event link</button>}
                  </>
                )}
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="v-stack w-full min-w-[680px] border-collapse">
                    <thead>
                      <tr className="border-y border-hairline">
                        <th scope="col" className="v-th px-5 py-3 text-left">Guest</th>
                        <th scope="col" className="v-th p-3 text-left">Ticket</th>
                        <th scope="col" className="v-th p-3 text-left">Ref</th>
                        <th scope="col" className="v-th p-3 text-left">Bought</th>
                        <th scope="col" className="v-th py-3 pl-3 pr-5 text-left">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shownGuests.map((a, i) => {
                        const st = a.checkedIn ? STATUS_INK.good : STATUS_INK.muted;
                        return (
                          <tr key={a.id} className="v-row v-al border-b border-hairline" style={{ "--i": Math.min(i, 12) }}>
                            <td className="px-5 py-2.5">
                              <button type="button" onClick={() => setOpenGuestId(a.id)} className="flex max-w-[280px] cursor-pointer items-center gap-3 border-0 bg-transparent p-0 text-left text-ink">
                                <span className="v-av">{(a.name || "?")[0].toUpperCase()}</span>
                                <span className="flex min-w-0 flex-col">
                                  <span className="truncate text-[15px] font-extrabold">{a.name}</span>
                                  <span className="truncate text-[13px] text-muted">{a.email}</span>
                                </span>
                              </button>
                            </td>
                            <td data-l="Ticket" className="px-3 py-2.5 text-sm font-bold">{a.tier}</td>
                            <td data-l="Ref" className="v-mono px-3 py-2.5">{a.ref}</td>
                            <td data-l="Bought" className="whitespace-nowrap px-3 py-2.5 text-sm text-muted">{boughtAgo(a.registeredAt)}</td>
                            <td data-l="Status" className="py-2.5 pl-3 pr-5">
                              <span className="v-status text-[13px]" style={{ color: a.checkedIn ? st.ink : "#5B6272" }}>
                                <span className="v-dot" style={{ background: st.dot }} />{a.checkedIn ? "Checked in" : "Not arrived"}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 text-[13px] text-muted">
                  <span>
                    Showing {filteredAttendees.length > PAGE_SIZE ? `${pageIndex * PAGE_SIZE + 1}–${pageIndex * PAGE_SIZE + shownGuests.length}` : shownGuests.length} of {num(filteredAttendees.length)}
                    {filteredAttendees.length !== sold ? ` (${num(sold)} in all)` : ""}
                  </span>
                  {pages > 1 && (
                    <span className="flex gap-2">
                      <button type="button" className="v-btn v-btn-s v-btn-sm" disabled={pageIndex === 0} onClick={() => setPage(pageIndex - 1)}>Previous</button>
                      <button type="button" className="v-btn v-btn-s v-btn-sm" disabled={pageIndex >= pages - 1} onClick={() => setPage(pageIndex + 1)}>Next</button>
                    </span>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {currentTab === "tickets" && (
          <div role="tabpanel" id="panel-tickets" aria-labelledby="tab-tickets">
            {!isCancelled && (
              <div className="flex justify-end px-5 py-4">
                <Link href={`/dashboard/events/${slug}/edit`} className="v-btn v-btn-p v-btn-sm"><Plus />Add ticket type</Link>
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="v-stack w-full min-w-[600px] border-collapse">
                <thead>
                  <tr className="border-y border-hairline">
                    <th scope="col" className="v-th px-5 py-3 text-left">Ticket</th>
                    <th scope="col" className="v-th p-3 text-right">Price</th>
                    <th scope="col" className="v-th p-3 text-left">Sold</th>
                    <th scope="col" className="v-th py-3 pl-3 pr-5 text-left">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {tierRows.map((t) => (
                    <tr key={t.key} className="v-row border-b border-hairline">
                      <td className="px-5 py-3.5">
                        <span className="flex flex-col">
                          <span className="text-[15px] font-extrabold">{t.name}</span>
                          {t.note && <span className="text-[13px] text-muted">{t.note}</span>}
                        </span>
                      </td>
                      <td data-l="Price" className="v-tab px-3 py-3.5 text-right text-[15px] font-extrabold">{t.price}</td>
                      <td data-l="Sold" className="px-3 py-3.5">
                        <span className="flex flex-col gap-1.5">
                          <span className="v-tab text-sm font-bold">{t.soldLabel}</span>
                          {t.pct !== null && (
                            <span className="block h-1 w-[120px] overflow-hidden rounded-full bg-[#DCE6FD]">
                              <span className="block h-full rounded-full bg-brand" style={{ width: `${t.pct}%` }} />
                            </span>
                          )}
                        </span>
                      </td>
                      <td data-l="Status" className="py-3.5 pl-3 pr-5">
                        <span className="v-status" style={{ color: tone(t.tone).ink }}>{t.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {tiers.length === 0 && (
              <p className="v-hint m-0 px-5 py-3.5">This event sells tickets at one price. Add ticket types from Edit.</p>
            )}
          </div>
        )}

        {currentTab === "discounts" && (
          <div role="tabpanel" id="panel-discounts" aria-labelledby="tab-discounts" className="flex flex-col gap-3.5 p-5">
            {discountCodes.length === 0 ? (
              <div className="flex flex-col items-center gap-1 px-4 py-10 text-center">
                <p className="m-0 text-[15px] font-extrabold">No discount codes yet</p>
                <p className="v-hint m-0">Give a group of people money off with a code they enter at checkout.</p>
                <button type="button" className="v-btn v-btn-p mt-3" onClick={() => { resetDiscountForm(); setShowDiscountModal(true); }}>New code</button>
              </div>
            ) : (
              <>
                <div className="flex justify-end">
                  <button type="button" className="v-btn v-btn-p v-btn-sm" onClick={() => { resetDiscountForm(); setShowDiscountModal(true); }}>New code</button>
                </div>
                {discountCodes.map((d) => {
                  const st = getDiscountStatus(d);
                  const usedPct = d.maxUses ? Math.min(100, (d.used / d.maxUses) * 100) : null;
                  const expired = d.expiresAt && new Date(d.expiresAt) < new Date();
                  return (
                    <div key={d.id} className="v-card v-lift relative flex flex-wrap items-center gap-x-[18px] gap-y-3 border border-hairline px-5 py-[18px]">
                      <button
                        type="button"
                        onClick={() => copyDiscountCode(d.code)}
                        aria-label={`Copy code ${d.code}`}
                        title="Copy code"
                        className="v-mono cursor-pointer rounded-lg border-[1.5px] border-dashed border-[#9DB6FF] bg-[#F5F8FF] px-3 py-1.5 text-base font-extrabold !text-ink"
                      >
                        {d.code}
                      </button>
                      <span className="flex min-w-0 flex-[1_1_200px] flex-col gap-0.5">
                        <span className="text-[15px] font-extrabold">
                          {d.type === "percent" ? `${d.value}% off any ticket` : `${fmtNaira(d.value)} off any ticket`}
                        </span>
                        <span className="v-hint">
                          {d.maxUses ? `${num(d.used)} of ${num(d.maxUses)} used` : `${num(d.used)} used · no limit`}
                          {d.expiresAt ? ` · ${expired ? "Ended" : "Ends"} ${formatDate(d.expiresAt)}` : ""}
                        </span>
                      </span>
                      {usedPct !== null && (
                        <span className="block h-1.5 w-[160px] max-w-full overflow-hidden rounded-full bg-[#DCE6FD]">
                          <span className="v-growx block h-full rounded-full bg-brand" style={{ width: `${usedPct}%` }} />
                        </span>
                      )}
                      <span className="v-status" style={{ color: tone(st.tone).ink }}>
                        <span className="v-dot" style={{ background: tone(st.tone).dot }} />{st.label}
                      </span>
                      <div className="relative">
                        <button
                          type="button"
                          className="v-icon-btn ghost h-9 w-9"
                          aria-label={`Actions for ${d.code}`}
                          aria-haspopup="menu"
                          aria-expanded={discountMenuOpen === d.id}
                          onClick={() => setDiscountMenuOpen(discountMenuOpen === d.id ? null : d.id)}
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></svg>
                        </button>
                        {discountMenuOpen === d.id && (
                          <>
                            <div className="fixed inset-0 z-10" onClick={() => setDiscountMenuOpen(null)} />
                            <div role="menu" className="v-card v-pop absolute right-0 top-10 z-20 flex w-44 flex-col p-1.5">
                              <button type="button" role="menuitem" className={menuRow} onClick={() => toggleDiscountActive(d.id)}>
                                {d.active ? "Deactivate" : "Activate"}
                              </button>
                              <button type="button" role="menuitem" className={`${menuRow} !text-danger`} onClick={() => { setDiscountMenuOpen(null); setDiscountToDelete({ id: d.id, code: d.code }); }}>
                                Delete
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        )}

        {currentTab === "team" && isOwner && (
          <div role="tabpanel" id="panel-team" aria-labelledby="tab-team">
            <EventTeamPanel
              ref={teamEmailRef}
              slug={slug}
              ownerEmail={event?.owner_email}
              ownerName={event?.owner_name}
              cohosts={cohosts}
              onChanged={() => loadEvent()}
            />
          </div>
        )}
      </section>

      {openGuest && (
        <EventGuestSheet
          key={openGuest.id}
          slug={slug}
          guest={openGuest}
          isOwner={isOwner}
          canCheckIn={canCheckIn}
          eventIsFuture={isFuture}
          onClose={() => setOpenGuestId(null)}
          onCheckIn={checkInGuest}
        />
      )}

      {canCancel && (
        <CancelEventDialog
          open={showCancel}
          onClose={() => setShowCancel(false)}
          slug={slug}
          eventName={event?.name || ""}
          onCancelled={() => {
            setShowCancel(false);
            loadEvent();
            loadAttendees();
            loadSummary();
          }}
        />
      )}

      {showDiscountModal && (
        <Modal labelledBy="discount-title" onClose={() => setShowDiscountModal(false)} busy={savingDiscount}>
          <form onSubmit={handleCreateDiscount} className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3">
              <h2 id="discount-title" className="v-h2">New discount code</h2>
              <button type="button" className="v-icon-btn ghost" aria-label="Close" onClick={() => setShowDiscountModal(false)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
              </button>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="discount-code" className="v-lbl">Code</label>
              <div className="flex gap-2">
                <input
                  id="discount-code"
                  type="text"
                  value={discountForm.code}
                  onChange={(e) => setDiscountForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
                  placeholder="e.g. EARLYBIRD"
                  autoFocus
                  autoComplete="off"
                  spellCheck={false}
                  className="v-input min-w-0 flex-1 font-bold tracking-wide"
                />
                <button type="button" onClick={generateCode} className="v-btn v-btn-s h-11 shrink-0">Generate</button>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="discount-value" className="v-lbl">Discount</label>
              <div className="flex items-center gap-2">
                <div role="group" aria-label="Discount type" className="v-seg shrink-0">
                  {[{ key: "percent", label: "%" }, { key: "fixed", label: "₦" }].map((opt) => (
                    <button key={opt.key} type="button" aria-pressed={discountForm.type === opt.key} onClick={() => setDiscountForm((f) => ({ ...f, type: opt.key }))}>
                      {opt.label}
                    </button>
                  ))}
                </div>
                <input
                  id="discount-value"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step={discountForm.type === "percent" ? "1" : "50"}
                  value={discountForm.value}
                  onChange={(e) => setDiscountForm((f) => ({ ...f, value: e.target.value }))}
                  placeholder={discountForm.type === "percent" ? "10" : "1000"}
                  required
                  className="v-input min-w-0 flex-1"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="flex min-w-0 flex-col gap-1.5">
                <label htmlFor="discount-max" className="v-lbl">Max uses</label>
                <input
                  id="discount-max"
                  type="number"
                  inputMode="numeric"
                  min="1"
                  value={discountForm.maxUses}
                  onChange={(e) => setDiscountForm((f) => ({ ...f, maxUses: e.target.value }))}
                  placeholder="No limit"
                  className="v-input"
                />
              </div>
              <div className="flex min-w-0 flex-col gap-1.5">
                <label htmlFor="discount-expires" className="v-lbl">Ends</label>
                <input
                  id="discount-expires"
                  type="date"
                  value={discountForm.expiresAt}
                  onChange={(e) => setDiscountForm((f) => ({ ...f, expiresAt: e.target.value }))}
                  className="v-input"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <button type="button" onClick={() => setShowDiscountModal(false)} className="v-btn v-btn-s flex-1">Cancel</button>
              <button type="submit" disabled={!discountForm.code.trim() || !discountForm.value || savingDiscount} className="v-btn v-btn-p flex-1">
                {savingDiscount ? "Creating…" : "Create code"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {discountToDelete && (
        <Modal labelledBy="discount-delete-title" onClose={() => setDiscountToDelete(null)} busy={deletingDiscount}>
          <h2 id="discount-delete-title" className="v-h2">Delete {discountToDelete.code}?</h2>
          <p className="v-hint mb-5 mt-2 text-sm">Anyone using it will no longer get the discount. This can&apos;t be undone.</p>
          <div className="flex gap-2">
            <button type="button" onClick={() => setDiscountToDelete(null)} disabled={deletingDiscount} className="v-btn v-btn-s flex-1">Keep it</button>
            <button type="button" onClick={deleteDiscount} disabled={deletingDiscount} className="v-btn flex-1 border-0 bg-danger text-white">
              {deletingDiscount ? "Deleting…" : "Delete code"}
            </button>
          </div>
        </Modal>
      )}

      {showDelete && (
        <Modal labelledBy="delete-title" onClose={() => { setShowDelete(false); setDeleteConfirm(""); }} busy={deleting}>
          <h2 id="delete-title" className="v-h2">Delete event?</h2>
          <p className="v-hint mb-4 mt-2 text-sm">
            This permanently deletes <b className="text-ink">{event?.name}</b> and takes its page offline. Anyone registered for free loses their spot. It can&apos;t be undone.
          </p>
          <label htmlFor="delete-confirm" className="v-lbl mb-1.5 block">
            Type <span className="font-extrabold">{event?.name}</span> to confirm
          </label>
          <input
            id="delete-confirm"
            type="text"
            value={deleteConfirm}
            onChange={(e) => setDeleteConfirm(e.target.value)}
            placeholder={event?.name || "Event name"}
            autoFocus
            autoComplete="off"
            disabled={deleting}
            className="v-input mb-5"
          />
          <div className="flex gap-2">
            <button type="button" onClick={() => { setShowDelete(false); setDeleteConfirm(""); }} disabled={deleting} className="v-btn v-btn-s flex-1">Cancel</button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting || deleteConfirm.trim() !== (event?.name || "").trim()}
              className="v-btn flex-1 border-0 bg-danger text-white"
            >
              {deleting ? "Deleting…" : "Delete event"}
            </button>
          </div>
        </Modal>
      )}

      <div style={{ display: "none" }}>
        <PrintableGuestList ref={printRef} attendees={attendees} questions={formQuestions} event={event} />
      </div>

      {showPublished && (
        <EventPublishedModal event={{ slug, name: event?.name }} onClose={closePublished} />
      )}
    </div>
  );
}
