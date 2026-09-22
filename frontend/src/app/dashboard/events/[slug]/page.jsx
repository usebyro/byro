"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { useParams, useRouter, notFound } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Share01Icon,
  Edit03Icon,
  Money01Icon,
  Ticket01Icon,
  UserMultiple02Icon,
  BarChartIcon,
  Search01Icon,
  ArrowLeft01Icon,
  Delete02Icon,
  CircleXIcon,
  QrCodeIcon,
  Camera01Icon,
  KeyboardIcon,
  DiscountTag01Icon,
  Copy02Icon,
  AddCircleIcon,
  MoreVerticalIcon,
} from "@hugeicons/core-free-icons";
import { useReactToPrint } from "react-to-print";
import { toast } from "sonner";
import jsQR from "jsqr";
import API from "@/services/api";
import ShareMenu from "@/components/ShareMenu";
import EventPublishedModal from "@/components/events/EventPublishedModal";
import CohostsDialog from "@/components/events/CohostsDialog";
import SharedAvatar from "@/components/ui/Avatar";
import EventImageFallback from "@/components/ui/EventImageFallback";

const BASE_URL = (process.env.NEXT_PUBLIC_API_URL || "https://byro.onrender.com").replace(/\/api\/?$/, "");

const fmtNaira = (n) =>
  new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(n);

function formatDate(d) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-US", { weekday: "short", day: "numeric", month: "short" });
}

function formatTime(t) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
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

function Avatar({ name }) {
  return <SharedAvatar name={name} className="w-7 h-7 rounded-full text-[11px]" />;
}

// Printable list for export
const PrintableList = ({ attendees, eventName, ref: r }) => (
  <div ref={r} className="p-6">
    <h1 className="text-xl font-bold mb-4">{eventName} — Guest List</h1>
    <table className="w-full border-collapse">
      <thead>
        <tr className="bg-gray-50">
          <th className="border border-gray-300 px-3 py-2 text-left text-sm">#</th>
          <th className="border border-gray-300 px-3 py-2 text-left text-sm">Name</th>
          <th className="border border-gray-300 px-3 py-2 text-left text-sm">Email</th>
          <th className="border border-gray-300 px-3 py-2 text-left text-sm">Status</th>
        </tr>
      </thead>
      <tbody>
        {attendees.map((a, i) => (
          <tr key={a.id} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
            <td className="border border-gray-300 px-3 py-2 text-sm">{i + 1}</td>
            <td className="border border-gray-300 px-3 py-2 text-sm font-medium">{a.name}</td>
            <td className="border border-gray-300 px-3 py-2 text-sm">{a.email}</td>
            <td className="border border-gray-300 px-3 py-2 text-sm">{a.checkedIn ? "Checked in" : "Not arrived"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

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
  const [eventRevenue, setEventRevenue] = useState(null);
  const [attendees, setAttendees] = useState([]);
  const [checkedInCount, setCheckedInCount] = useState(0);
  const [loadingEvent, setLoadingEvent] = useState(true);
  const [loadingAttendees, setLoadingAttendees] = useState(true);
  const [eventError, setEventError] = useState(false);
  const [activeTab, setActiveTab] = useState("attendees");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all"); // all | checkedin | vip
  const [sort, setSort] = useState("newest");
  const [tierFilter, setTierFilter] = useState([]); // selected tier names; empty = all
  const [tiers, setTiers] = useState([]);
  const [checkInModal, setCheckInModal] = useState(false);
  const [checkInValue, setCheckInValue] = useState("");
  const [checkingIn, setCheckingIn] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [showCohosts, setShowCohosts] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [checkInMode, setCheckInMode] = useState("scan"); // scan | manual
  const [cameraError, setCameraError] = useState("");

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

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const scanFrameRef = useRef(null);
  const scanLockRef = useRef(false);

  const printRef = useRef();
  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `GuestList-${slug}`,
  });

  useEffect(() => {
    if (!slug) return;
    API.getEvent(slug)
      .then(setEvent)
      .catch((err) => { if (err?.status === 404) setEventError(true); })
      .finally(() => setLoadingEvent(false));
  }, [slug]);

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

  const loadAttendees = () => {
    if (!slug) return;
    setLoadingAttendees(true);
    API.getEventAttendees(slug)
      .then((res) => {
        const mapped = (res.attendees || []).map((t) => ({
          id: t.ticket_id,
          name: t.current_owner_name || t.original_owner_name || "Unknown",
          email: t.current_owner_email || t.original_owner_email || "",
          checkedIn: t.checked_in,
          paymentStatus: t.payment_status,
          ref: String(t.ticket_id || "").replace(/-/g, "").toUpperCase().slice(0, 12),
          tier: t.tier_name || "General admission",
          registeredAt: t.created_at || "",
        }));
        setAttendees(mapped);
        setCheckedInCount(res.checked_in_count || 0);
      })
      .catch(() => {})
      .finally(() => setLoadingAttendees(false));
  };

  useEffect(() => { loadAttendees(); }, [slug]);

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

  const handleCheckIn = async (valueOverride) => {
    const value = (valueOverride ?? checkInValue).trim();
    if (!value) return;
    setCheckingIn(true);
    try {
      const res = await API.checkInAttendee(slug, value);
      if (res.already_checked_in) {
        toast.info(`${res.attendee?.name || "Attendee"} already checked in.`);
      } else {
        toast.success(`${res.attendee?.name || "Attendee"} checked in!`);
        const checkedId = res.attendee?.ticket_id;
        setAttendees((prev) =>
          prev.map((a) =>
            a.id === checkedId || a.email === res.attendee?.email
              ? { ...a, checkedIn: true }
              : a
          )
        );
        setCheckedInCount((c) => c + 1);
      }
      setCheckInValue("");
      setCheckInModal(false);
    } catch (err) {
      toast.error(err?.message || "Check-in failed.");
      scanLockRef.current = false;
    } finally {
      setCheckingIn(false);
    }
  };

  const stopScanner = () => {
    if (scanFrameRef.current) {
      cancelAnimationFrame(scanFrameRef.current);
      scanFrameRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    scanLockRef.current = false;
  };

  const scanTick = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
      scanFrameRef.current = requestAnimationFrame(scanTick);
      return;
    }
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imageData.data, imageData.width, imageData.height);

    if (code?.data && !scanLockRef.current) {
      scanLockRef.current = true;
      handleCheckIn(code.data);
    }
    scanFrameRef.current = requestAnimationFrame(scanTick);
  };

  useEffect(() => {
    if (!checkInModal || checkInMode !== "scan") {
      stopScanner();
      return;
    }
    setCameraError("");
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: "environment" } })
      .then((stream) => {
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
        scanFrameRef.current = requestAnimationFrame(scanTick);
      })
      .catch(() => {
        setCameraError("Couldn't access the camera. Check permissions, or enter the code manually.");
      });

    return stopScanner;
  }, [checkInModal, checkInMode]);

  const handleDelete = async () => {
    if (deleteConfirm.trim() !== (event?.name || "").trim()) return;
    setDeleting(true);
    try {
      await API.deleteEvent(slug);
      toast.success("Event deleted.");
      router.push("/dashboard/events");
    } catch (err) {
      toast.error(err?.message || "Failed to delete.");
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
      toast.error("That code already exists for this event.");
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
      toast.success(`Discount code ${code} created.`);
      setShowDiscountModal(false);
      resetDiscountForm();
    } catch (err) {
      toast.error(err?.message || "Failed to create discount code.");
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
      toast.error(err?.message || "Failed to update discount code.");
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
      toast.error(err?.message || "Failed to delete discount code.");
    } finally {
      setDeletingDiscount(false);
    }
  };

  const copyDiscountCode = (code) => {
    navigator.clipboard?.writeText(code);
    toast.success(`${code} copied to clipboard.`);
  };

  const getDiscountStatus = (d) => {
    if (!d.active) return { label: "Deactivated", color: "text-gray-400 bg-gray-100" };
    if (d.expiresAt && new Date(d.expiresAt) < new Date()) return { label: "Expired", color: "text-red-500 bg-red-50" };
    if (d.maxUses && d.used >= d.maxUses) return { label: "Exhausted", color: "text-amber-600 bg-amber-50" };
    return { label: "Active", color: "text-green-600 bg-green-50" };
  };

  if (eventError) return notFound();

  const img = event ? getImageUrl(event) : null;
  const isDraft = Boolean(event?.is_draft);
  // What this person may do here: owners run everything, co-hosts depend on their permission.
  const role = event?.role || {};
  const isOwner = Boolean(role.is_owner);
  const canEdit = Boolean(role.can_edit);
  const canDelete = Boolean(role.can_delete);
  const TAB_LABELS = { attendees: "Attendees", tiers: "Tiers", discounts: "Discounts" };
  const visibleTabs = ["attendees", ...(canEdit ? ["tiers", "discounts"] : [])];
  const currentTab = visibleTabs.includes(activeTab) ? activeTab : "attendees";
  const isLive = event?.is_active && !isDraft && new Date(event.day) >= new Date();

  const tierCounts = attendees.reduce((m, a) => {
    m[a.tier] = (m[a.tier] || 0) + 1;
    return m;
  }, {});

  const SORTERS = {
    newest:     (a, b) => (b.registeredAt || "").localeCompare(a.registeredAt || ""),
    oldest:     (a, b) => (a.registeredAt || "").localeCompare(b.registeredAt || ""),
    name:       (a, b) => a.name.localeCompare(b.name),
    notarrived: (a, b) => Number(a.checkedIn) - Number(b.checkedIn) || a.name.localeCompare(b.name),
    arrived:    (a, b) => Number(b.checkedIn) - Number(a.checkedIn) || a.name.localeCompare(b.name),
    tier:       (a, b) => a.tier.localeCompare(b.tier) || a.name.localeCompare(b.name),
  };

  const filteredAttendees = attendees
    .filter((a) => {
      const matchSearch = !search ||
        a.name.toLowerCase().includes(search.toLowerCase()) ||
        a.email.toLowerCase().includes(search.toLowerCase()) ||
        a.ref.toLowerCase().includes(search.toLowerCase());
      const matchFilter =
        filter === "all" ||
        (filter === "checkedin" && a.checkedIn);
      const matchTier = tierFilter.length === 0 || tierFilter.includes(a.tier);
      return matchSearch && matchFilter && matchTier;
    })
    .sort(SORTERS[sort] || SORTERS.newest);

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-5">
      {/* Back */}
      <div>
        <Link href="/dashboard/events" className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-700 transition-colors">
          <HugeiconsIcon icon={ArrowLeft01Icon} size={13} color="currentColor" />
          Back to events
        </Link>
      </div>

      {/* Event hero */}
      {/* The banner itself must not clip (the Share menu opens below it): only the image layer is clipped. */}
      <div className="relative rounded-xl shadow-sm bg-gray-950" style={{ minHeight: 130 }}>
        <div className="absolute inset-0 overflow-hidden rounded-xl">
          {img ? (
            <Image src={img} alt={event?.name || "Event Banner"} fill className="object-cover opacity-85" />
          ) : (
            <div className="absolute inset-0">
              <EventImageFallback category={event?.category} tone="solid" />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-black/10" />
        </div>
        <div className="relative z-10 p-5 md:p-6 flex flex-col md:flex-row md:items-end justify-between gap-4 h-full min-h-[130px]">
          <div className="flex-1 min-w-0">
            {isDraft && (
              <span className="inline-flex items-center gap-1 text-[11px] font-extrabold bg-white/15 backdrop-blur-sm text-white px-2 py-0.5 rounded uppercase tracking-wider mb-2">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                DRAFT · NOT PUBLIC
              </span>
            )}
            {isLive && (
              <span className="inline-flex items-center gap-1 text-[11px] font-extrabold bg-white/15 backdrop-blur-sm text-white px-2 py-0.5 rounded uppercase tracking-wider mb-2">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                LIVE · SELLING
              </span>
            )}
            {loadingEvent ? (
              <div className="h-6 bg-white/20 rounded w-60 animate-pulse" />
            ) : (
              <h1 className="text-xl md:text-2xl font-black text-white leading-tight mb-1">{event?.name}</h1>
            )}
            <p className="text-white/70 text-xs md:text-sm">
              {event && `${formatDate(event.day)}${event.time_from ? ` · ${formatTime(event.time_from)}` : ""}${event.location ? ` · ${event.location}` : ""}`}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0 w-full md:w-auto">
            {!isDraft && (
              <button
                type="button"
                onClick={() => { setCheckInMode("scan"); setCheckInModal(true); }}
                className="flex-1 md:flex-initial flex items-center justify-center gap-1.5 min-h-[40px] md:min-h-0 bg-white text-gray-900 text-xs font-semibold px-3.5 py-2 rounded-lg hover:bg-white/90 transition-colors"
              >
                <HugeiconsIcon icon={QrCodeIcon} size={13} color="currentColor" />
                Check in
              </button>
            )}
            {!isDraft && <ShareMenu
              url={typeof window !== "undefined" ? `${window.location.origin}/discover/${slug}` : ""}
              title={event?.name || ""}
              campaign="event_share"
              content={slug}
              className="flex-1 md:flex-initial flex items-center justify-center gap-1 bg-white/10 backdrop-blur-sm text-white text-xs font-semibold px-3 py-2 rounded-lg hover:bg-white/20 transition-colors border border-white/15"
            >
              <HugeiconsIcon icon={Share01Icon} size={13} color="white" />
              Share
            </ShareMenu>}
            {isOwner && (
              <button
                type="button"
                onClick={() => setShowCohosts(true)}
                className="flex-1 md:flex-initial flex items-center justify-center gap-1.5 min-h-[40px] md:min-h-0 text-white text-xs font-semibold px-3 py-2 rounded-lg transition-colors bg-white/10 backdrop-blur-sm border border-white/15 hover:bg-white/20"
              >
                <HugeiconsIcon icon={UserMultiple02Icon} size={13} color="white" />
                Co-hosts
                {(event?.cohosts?.length || 0) > 0 && (
                  <span className="rounded-full bg-white/20 px-1.5 text-[11px] leading-5">{event.cohosts.length}</span>
                )}
              </button>
            )}
            {canEdit && <Link
              href={`/dashboard/events/${slug}/edit`}
              className={`flex-1 md:flex-initial flex items-center justify-center gap-1 min-h-[40px] md:min-h-0 text-white text-xs font-semibold px-3 py-2 rounded-lg transition-colors ${
                isDraft
                  ? "bg-[#4F6EF7] hover:bg-blue-700 shadow-sm shadow-[#4F6EF7]/10"
                  : "bg-white/10 backdrop-blur-sm border border-white/15 hover:bg-white/20"
              }`}
            >
              <HugeiconsIcon icon={Edit03Icon} size={13} color="white" />
              {isDraft ? "Continue editing" : "Edit"}
            </Link>}
          </div>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        {[
          { label: "Revenue", value: eventRevenue === null ? "—" : fmtNaira(eventRevenue), icon: Money01Icon, iconBg: "bg-teal-50 text-teal-600", trend: null, note: "From paid tickets" },
          { label: "Tickets sold", value: loadingAttendees ? "—" : attendees.length, icon: Ticket01Icon, iconBg: "bg-blue-50 text-blue-600", trend: null },
          { label: "Checked in", value: loadingAttendees ? "—" : checkedInCount, icon: UserMultiple02Icon, iconBg: "bg-violet-50 text-violet-600", trend: null, note: "Live sync" },
          event?.capacity > 0
            ? { label: "Fill rate", value: loadingAttendees ? "—" : `${Math.min(100, Math.round((attendees.length / event.capacity) * 100))}%`, icon: BarChartIcon, iconBg: "bg-amber-50 text-amber-600", trend: null, note: `${attendees.length} of ${event.capacity} tickets` }
            : { label: "Capacity", value: "Unlimited", icon: BarChartIcon, iconBg: "bg-amber-50 text-amber-600", trend: null, note: "No limit set" },
        ].map((card) => {
          const isPending = card.value === "—";
          return (
            <div key={card.label} className={`bg-white rounded-xl border p-4 transition-all duration-200 ${
              isPending ? "border-gray-100/80 opacity-95" : "border-gray-100 shadow-sm hover:shadow-md"
            }`}>
              <div className="flex items-center justify-between gap-2 mb-2">
                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider truncate">{card.label}</p>
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${card.iconBg}`}>
                  <HugeiconsIcon icon={card.icon} size={14} color="currentColor" />
                </div>
              </div>
              <p className={`text-xl font-extrabold mb-0.5 tracking-tight ${isPending ? "text-gray-300" : "text-gray-900"}`}>
                {card.value}
              </p>
              {card.trend ? (
                <p className="text-xs font-semibold text-green-500 mt-0.5 flex items-center gap-0.5">• {card.trend}</p>
              ) : (
                card.note && <p className="text-xs text-gray-400 mt-0.5 truncate">{card.note}</p>
              )}
            </div>
          );
        })}
      </div>

      {/* Tabs */}
      <div className="flex gap-4 border-b border-gray-100 pb-0.5">
        {visibleTabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`pb-2 text-xs md:text-sm font-bold border-b-2 -mb-px transition-colors ${
              currentTab === tab
                ? "border-[#4F6EF7] text-gray-900"
                : "border-transparent text-gray-400 hover:text-gray-600"
            }`}
          >
            {TAB_LABELS[tab]}
          </button>
        ))}
      </div>

      {currentTab === "attendees" && (
        <div className="bg-white rounded-xl border border-gray-100/80 shadow-sm overflow-hidden">
          {/* Table header */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 px-4 py-3 border-b border-gray-100 bg-white">
            <div className="flex items-center gap-1.5">
              <p className="font-bold text-gray-800 text-sm">Guest list</p>
              <span className="text-gray-400 text-xs">({attendees.length})</span>
            </div>
            <div className="flex items-center gap-2 flex-wrap md:flex-nowrap w-full md:w-auto justify-between md:justify-end">
              {/* Filter pills */}
              <div className="flex gap-0.5 bg-gray-50 p-0.5 rounded-lg border border-gray-100/50">
                {["all", "checkedin"].map((f) => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={`text-[11px] font-semibold px-2.5 py-1 rounded-md transition-all ${
                      filter === f
                        ? "bg-[#4F6EF7] text-white shadow-sm shadow-[#4F6EF7]/10"
                        : "text-gray-500 hover:text-gray-800"
                    }`}
                  >
                    {f === "all" ? "All" : "Checked in"}
                  </button>
                ))}
              </div>
              {/* Sort */}
              <div>
                <label htmlFor="guest-sort" className="sr-only">Sort guests</label>
                <select
                  id="guest-sort"
                  value={sort}
                  onChange={(e) => setSort(e.target.value)}
                  className="py-1.5 pl-2.5 pr-7 bg-gray-50 border border-gray-100 rounded-lg text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#4F6EF7]/30"
                >
                  <option value="newest">Newest first</option>
                  <option value="oldest">Oldest first</option>
                  <option value="name">Name A to Z</option>
                  <option value="notarrived">Not arrived first</option>
                  <option value="arrived">Checked in first</option>
                  <option value="tier">By tier</option>
                </select>
              </div>
              {/* Search */}
              <div className="relative flex-1 md:flex-initial">
                <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
                </svg>
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search..."
                  className="pl-7 pr-3 py-1.5 bg-gray-50 border border-gray-100 rounded-lg text-xs text-gray-900 placeholder-gray-400 w-full md:w-28 focus:outline-none focus:ring-2 focus:ring-[#4F6EF7]/20 transition-all"
                />
              </div>
              <div className="flex items-center gap-1.5 w-full md:w-auto">
                {/* Check in */}
                <button
                  onClick={() => { setCheckInMode("scan"); setCheckInModal(true); }}
                  className="flex-1 md:flex-initial flex items-center justify-center gap-1 bg-[#4F6EF7] text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-blue-700 transition-colors shadow-sm shadow-[#4F6EF7]/10"
                >
                  <HugeiconsIcon icon={QrCodeIcon} size={11} color="white" />
                  Check in
                </button>
                {/* Export */}
                <button
                  onClick={handlePrint}
                  className="flex-1 md:flex-initial flex items-center justify-center gap-1 bg-white border border-gray-200 text-gray-600 text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  Export
                </button>
              </div>
            </div>
          </div>

          {/* Tickets by tier: tap to toggle, several at once */}
          {Object.keys(tierCounts).length > 0 && (
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-100 bg-gray-50/40">
              <span className="shrink-0 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">
                Tier
              </span>
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                {Object.entries(tierCounts).sort((x, y) => y[1] - x[1]).map(([name, count]) => {
                  const active = tierFilter.includes(name);
                  return (
                    <button
                      key={name}
                      type="button"
                      aria-pressed={active}
                      onClick={() =>
                        setTierFilter((prev) =>
                          prev.includes(name) ? prev.filter((t) => t !== name) : [...prev, name]
                        )
                      }
                      className={`shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4F6EF7] ${
                        active
                          ? "bg-[#4F6EF7] border-[#4F6EF7] text-white"
                          : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
                      }`}
                    >
                      {name}
                      <span className={active ? "text-white/80" : "text-gray-400"}>{count}</span>
                    </button>
                  );
                })}
              </div>
              {tierFilter.length > 0 && (
                <button
                  type="button"
                  onClick={() => setTierFilter([])}
                  className="shrink-0 ml-auto text-[11px] font-semibold text-[#3B57D9] hover:underline"
                >
                  Clear
                </button>
              )}
            </div>
          )}

          {/* Active filter summary */}
          {(search || filter !== "all" || tierFilter.length > 0) && (
            <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-100 bg-blue-50/40 text-xs text-gray-600">
              <span>
                Showing <span className="font-semibold text-gray-900">{filteredAttendees.length}</span> of{" "}
                {attendees.length} guests
              </span>
              <button
                type="button"
                onClick={() => { setSearch(""); setFilter("all"); setTierFilter([]); }}
                className="ml-auto font-semibold text-[#3B57D9] hover:underline"
              >
                Clear all filters
              </button>
            </div>
          )}

          {/* Column headers */}
          <div className="grid grid-cols-12 px-4 py-2 border-b border-gray-100 bg-gray-50/50">
            <div className="col-span-8 md:col-span-5 text-xs font-bold text-gray-400 tracking-wider uppercase">Attendee</div>
            <div className="hidden md:block md:col-span-3 text-xs font-bold text-gray-400 tracking-wider uppercase">Tier</div>
            <div className="hidden md:block md:col-span-2 text-xs font-bold text-gray-400 tracking-wider uppercase">Ref</div>
            <div className="col-span-4 md:col-span-2 text-xs font-bold text-gray-400 tracking-wider uppercase text-right">Status</div>
          </div>

          {/* Rows */}
          {loadingAttendees ? (
            <div className="divide-y divide-gray-50">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="grid grid-cols-12 px-4 py-3.5 animate-pulse items-center">
                  <div className="col-span-8 md:col-span-5 flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-full bg-gray-100" />
                    <div className="space-y-1.5 flex-1">
                      <div className="h-3 bg-gray-100 rounded w-28" />
                      <div className="h-2.5 bg-gray-100 rounded w-36" />
                    </div>
                  </div>
                  <div className="hidden md:flex md:col-span-3 items-center"><div className="h-5 bg-gray-100 rounded-full w-24" /></div>
                  <div className="hidden md:flex md:col-span-2 items-center"><div className="h-3 bg-gray-100 rounded w-16" /></div>
                  <div className="col-span-4 md:col-span-2 flex items-center justify-end"><div className="h-3 bg-gray-100 rounded w-12" /></div>
                </div>
              ))}
            </div>
          ) : filteredAttendees.length === 0 ? (
            <div className="text-center py-10 px-4">
              {search ? (
                <p className="text-xs text-gray-500">No attendees match your search</p>
              ) : (
                <>
                  <p className="text-sm font-semibold text-gray-700">No attendees yet</p>
                  {isDraft ? (
                    <>
                      <p className="text-xs text-gray-500 mt-0.5">This event is a draft. Publish it to start selling tickets.</p>
                      <Link
                        href={`/dashboard/events/${slug}/edit`}
                        className="inline-block mt-4 bg-[#4F6EF7] text-white text-xs font-semibold px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
                      >
                        Continue editing
                      </Link>
                    </>
                  ) : (
                    <>
                      <p className="text-xs text-gray-500 mt-0.5">Share your event link to get your first sign-ups.</p>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard
                            .writeText(`${window.location.origin}/discover/${slug}`)
                            .then(() => toast.success("Link copied!"))
                            .catch(() => toast.error("Couldn't copy the link."));
                        }}
                        className="inline-block mt-4 bg-[#4F6EF7] text-white text-xs font-semibold px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
                      >
                        Copy event link
                      </button>
                    </>
                  )}
                </>
              )}
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {filteredAttendees.map((a) => (
                <div key={a.id} className="grid grid-cols-12 px-4 py-2.5 hover:bg-gray-50/50 items-center transition-colors">
                  {/* Attendee */}
                  <div className="col-span-8 md:col-span-5 flex items-center gap-2.5 min-w-0">
                    <Avatar name={a.name} />
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-gray-800 truncate">{a.name}</p>
                      <p className="text-xs text-gray-400 truncate">{a.email}</p>
                    </div>
                  </div>
                  {/* Tier */}
                  <div className="hidden md:block md:col-span-3">
                    <span className="text-xs font-medium px-2 py-0.5 rounded-md bg-gray-100 text-gray-700">
                      {a.tier}
                    </span>
                  </div>
                  {/* Ref */}
                  <div className="hidden md:block md:col-span-2">
                    <span className="text-xs font-mono text-gray-500">{a.ref}</span>
                  </div>
                  {/* Status */}
                  <div className="col-span-4 md:col-span-2 text-right">
                    {a.checkedIn ? (
                      <span className="text-xs font-bold text-green-600 inline-flex items-center justify-end gap-0.5">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M20 6L9 17l-5-5"/></svg>
                        Checked in
                      </span>
                    ) : (
                      <span className="text-xs text-gray-500">Not arrived</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Footer */}
          {filteredAttendees.length > 0 && (
            <div className="flex items-center justify-between px-4 py-2.5 border-t border-gray-200 bg-gray-50/30">
              <p className="text-xs font-medium text-gray-400">
                Showing {filteredAttendees.length} of {attendees.length}
              </p>
            </div>
          )}
        </div>
      )}

      {currentTab === "tiers" && (
        <div className="bg-white rounded-xl border border-gray-100/80 shadow-sm">
          {tiers.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-sm font-semibold text-gray-700">No ticket tiers</p>
              <p className="text-sm text-gray-500 mt-1">This event sells tickets at one flat price.</p>
              <Link href={`/dashboard/events/${slug}/edit`} className="inline-block mt-4 text-sm font-semibold text-[#3B57D9] hover:underline">
                Add a tier
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {tiers.map((t) => {
                const sold = tierCounts[t.name] || 0;
                const cap = Number(t.capacity) || 0;
                const pct = cap > 0 ? Math.min(100, Math.round((sold / cap) * 100)) : null;
                return (
                  <div key={t.id ?? t.name} className="flex items-center justify-between gap-4 px-4 md:px-5 py-4">
                    <div className="min-w-0">
                      <p className="text-[15px] font-semibold text-gray-900 truncate">{t.name}</p>
                      <p className="text-sm text-gray-600 mt-0.5">{Number(t.price) === 0 ? "Free" : fmtNaira(Number(t.price))}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-medium text-gray-900">{cap > 0 ? `${sold} of ${cap} sold` : `${sold} sold`}</p>
                      {pct !== null && (
                        <div className="mt-1.5 h-1 w-28 ml-auto rounded-full bg-gray-100 overflow-hidden" role="presentation">
                          <div className="h-full rounded-full bg-[#4F6EF7]" style={{ width: `${pct}%` }} />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {currentTab === "discounts" && (
        <div className="bg-white rounded-xl border border-gray-100/80 shadow-sm overflow-visible">
          {/* Header */}
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-100 bg-white">
            <div className="flex items-center gap-1.5">
              <p className="font-bold text-gray-800 text-sm">Discount codes</p>
              <span className="text-gray-400 text-xs">({discountCodes.length})</span>
            </div>
            <button
              onClick={() => { resetDiscountForm(); setShowDiscountModal(true); }}
              className="flex items-center justify-center gap-1 bg-[#4F6EF7] text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-blue-700 transition-colors shadow-sm shadow-[#4F6EF7]/10"
            >
              <HugeiconsIcon icon={AddCircleIcon} size={13} color="white" />
              Create code
            </button>
          </div>

          {discountCodes.length === 0 ? (
            <div className="text-center py-10 px-4">
              <HugeiconsIcon icon={DiscountTag01Icon} size={22} color="currentColor" className="mx-auto mb-2 text-gray-300" />
              <p className="text-xs text-gray-400 mb-2">No discount codes yet</p>
              <button
                onClick={() => { resetDiscountForm(); setShowDiscountModal(true); }}
                className="inline-block bg-[#4F6EF7] text-white text-xs font-bold py-2 px-4 rounded-full hover:bg-blue-700 transition-colors"
              >
                Create your first discount code
              </button>
            </div>
          ) : (
            <>
              {/* Column headers */}
              <div className="grid grid-cols-12 px-4 py-2 border-b border-gray-100 bg-gray-50/50">
                <div className="col-span-4 md:col-span-3 text-xs font-bold text-gray-400 tracking-wider uppercase">Code</div>
                <div className="hidden md:block md:col-span-2 text-xs font-bold text-gray-400 tracking-wider uppercase">Discount</div>
                <div className="hidden md:block md:col-span-2 text-xs font-bold text-gray-400 tracking-wider uppercase">Uses</div>
                <div className="hidden md:block md:col-span-3 text-xs font-bold text-gray-400 tracking-wider uppercase">Expires</div>
                <div className="col-span-6 md:col-span-1 text-xs font-bold text-gray-400 tracking-wider uppercase text-right md:text-left">Status</div>
                <div className="col-span-2 md:col-span-1" />
              </div>

              <div className="divide-y divide-gray-50">
                {discountCodes.map((d) => {
                  const status = getDiscountStatus(d);
                  return (
                    <div key={d.id} className="grid grid-cols-12 px-4 py-2.5 hover:bg-gray-50/50 items-center transition-colors relative">
                      {/* Code */}
                      <div className="col-span-4 md:col-span-3 flex items-center gap-1.5 min-w-0">
                        <span className="text-xs font-mono font-bold text-gray-800 truncate">{d.code}</span>
                        <button onClick={() => copyDiscountCode(d.code)} aria-label="Copy code" className="text-gray-300 hover:text-gray-600 shrink-0">
                          <HugeiconsIcon icon={Copy02Icon} size={12} color="currentColor" />
                        </button>
                      </div>
                      {/* Discount */}
                      <div className="hidden md:block md:col-span-2 text-xs text-gray-600">
                        {d.type === "percent" ? `${d.value}% off` : `₦${d.value.toLocaleString()} off`}
                      </div>
                      {/* Uses */}
                      <div className="hidden md:block md:col-span-2 text-xs text-gray-600">
                        {d.used} / {d.maxUses ?? "∞"}
                      </div>
                      {/* Expires */}
                      <div className="hidden md:block md:col-span-3 text-xs text-gray-600">
                        {d.expiresAt ? formatDate(d.expiresAt) : "No expiry"}
                      </div>
                      {/* Status */}
                      <div className="col-span-6 md:col-span-1 text-right md:text-left">
                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md ${status.color}`}>
                          {status.label}
                        </span>
                      </div>
                      {/* Actions */}
                      <div className="col-span-2 md:col-span-1 flex justify-end">
                        <button
                          onClick={() => setDiscountMenuOpen(discountMenuOpen === d.id ? null : d.id)}
                          aria-label="More actions"
                          className="text-gray-400 hover:text-gray-700 p-1"
                        >
                          <HugeiconsIcon icon={MoreVerticalIcon} size={14} color="currentColor" />
                        </button>
                        {discountMenuOpen === d.id && (
                          <>
                            <div className="fixed inset-0 z-10" onClick={() => setDiscountMenuOpen(null)} />
                            <div className="absolute right-4 top-9 z-20 bg-white border border-gray-100 rounded-lg shadow-lg py-1 w-36">
                              <button
                                onClick={() => toggleDiscountActive(d.id)}
                                className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                              >
                                {d.active ? "Deactivate" : "Activate"}
                              </button>
                              <button
                                onClick={() => { setDiscountMenuOpen(null); setDiscountToDelete({ id: d.id, code: d.code }); }}
                                className="w-full text-left px-3 py-1.5 text-xs text-red-500 hover:bg-red-50"
                              >
                                Delete
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* Delete button (owner only) */}
      {canDelete && <div className="mt-4 flex justify-end">
        <button
          onClick={() => setShowDelete(true)}
          className="flex items-center gap-1.5 text-red-400 hover:text-red-650 text-xs font-bold transition-colors"
        >
          <HugeiconsIcon icon={Delete02Icon} size={13} color="currentColor" />
          Delete event
        </button>
      </div>}

      {isOwner && (
        <CohostsDialog
          open={showCohosts}
          onClose={() => setShowCohosts(false)}
          slug={slug}
          ownerEmail={event?.owner_email}
          cohosts={event?.cohosts || []}
          onChanged={() => API.getEvent(slug).then(setEvent).catch(() => {})}
        />
      )}

      {/* Check-in modal */}
      {checkInModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-xl shadow-xl p-5 w-full max-w-sm">
            <div className="flex items-center justify-between mb-3.5">
              <h3 className="text-sm font-bold text-gray-900">Check In Attendee</h3>
              <button onClick={() => setCheckInModal(false)}>
                <HugeiconsIcon icon={CircleXIcon} size={18} color="#9ca3af" />
              </button>
            </div>

            {/* Mode toggle */}
            <div className="flex bg-gray-50 rounded-lg p-0.5 mb-3.5 border border-gray-100/50">
              <button
                onClick={() => setCheckInMode("scan")}
                className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-md text-[11px] font-bold transition-all ${
                  checkInMode === "scan" ? "bg-white text-gray-900 shadow-sm" : "text-gray-400"
                }`}
              >
                <HugeiconsIcon icon={Camera01Icon} size={13} color="currentColor" />
                Scan QR
              </button>
              <button
                onClick={() => setCheckInMode("manual")}
                className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-md text-[11px] font-bold transition-all ${
                  checkInMode === "manual" ? "bg-white text-gray-900 shadow-sm" : "text-gray-400"
                }`}
              >
                <HugeiconsIcon icon={KeyboardIcon} size={13} color="currentColor" />
                Enter email
              </button>
            </div>

            {checkInMode === "scan" ? (
              <div className="mb-3.5">
                <div className="relative w-full aspect-square bg-black rounded-lg overflow-hidden border border-gray-900">
                  <video ref={videoRef} muted playsInline className="w-full h-full object-cover" />
                  <canvas ref={canvasRef} className="hidden" />
                  {!cameraError && (
                    <div className="absolute inset-5 border-2 border-white/60 rounded-lg pointer-events-none animate-pulse" />
                  )}
                  {cameraError && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/90 px-4">
                      <p className="text-white text-xs text-center leading-relaxed">{cameraError}</p>
                    </div>
                  )}
                </div>
                <p className="text-xs text-gray-400 text-center mt-2.5">
                  {checkingIn ? "Verifying ticket..." : "Align QR code inside the camera view"}
                </p>
              </div>
            ) : (
              <>
                <p className="text-xs text-gray-400 mb-3 leading-relaxed">Enter attendee email address or paste the verification token below.</p>
                <input
                  type="text"
                  value={checkInValue}
                  onChange={(e) => setCheckInValue(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCheckIn()}
                  placeholder="email@example.com"
                  autoFocus
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#4F6EF7]/20 mb-4"
                />
              </>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => setCheckInModal(false)}
                className="flex-1 py-2 rounded-lg border border-gray-200 text-xs font-semibold text-gray-500 hover:bg-gray-50"
              >
                Cancel
              </button>
              {checkInMode === "manual" && (
                <button
                  onClick={() => handleCheckIn()}
                  disabled={checkingIn || !checkInValue.trim()}
                  className="flex-1 py-2 rounded-lg bg-[#4F6EF7] text-white text-xs font-bold hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-sm shadow-[#4F6EF7]/10"
                >
                  {checkingIn ? "Checking in..." : "Check In"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Create discount modal */}
      {showDiscountModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <form
            onSubmit={handleCreateDiscount}
            className="bg-white rounded-xl shadow-xl p-5 w-full max-w-sm"
          >
            <div className="flex items-center justify-between mb-3.5">
              <h3 className="text-sm font-bold text-gray-900">Create discount code</h3>
              <button type="button" onClick={() => setShowDiscountModal(false)}>
                <HugeiconsIcon icon={CircleXIcon} size={18} color="#9ca3af" />
              </button>
            </div>

            {/* Code */}
            <label className="block text-[11px] font-semibold text-gray-500 mb-1.5">Code</label>
            <div className="flex gap-1.5 mb-3.5">
              <input
                type="text"
                value={discountForm.code}
                onChange={(e) => setDiscountForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
                placeholder="e.g. EARLYBIRD"
                autoFocus
                className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs font-mono text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#4F6EF7]/20"
              />
              <button
                type="button"
                onClick={generateCode}
                className="px-3 py-2 rounded-lg border border-gray-200 text-[11px] font-semibold text-gray-600 hover:bg-gray-50 shrink-0"
              >
                Generate
              </button>
            </div>

            {/* Type + value */}
            <label className="block text-[11px] font-semibold text-gray-500 mb-1.5">Discount</label>
            <div className="flex gap-1.5 mb-3.5">
              <div className="flex bg-gray-50 rounded-lg p-0.5 border border-gray-100/50">
                {[
                  { key: "percent", label: "%" },
                  { key: "fixed", label: "₦" },
                ].map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setDiscountForm((f) => ({ ...f, type: opt.key }))}
                    className={`w-9 py-1.5 rounded-md text-xs font-bold transition-all ${
                      discountForm.type === opt.key ? "bg-white text-gray-900 shadow-sm" : "text-gray-400"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <input
                type="number"
                min="0"
                step={discountForm.type === "percent" ? "1" : "50"}
                value={discountForm.value}
                onChange={(e) => setDiscountForm((f) => ({ ...f, value: e.target.value }))}
                placeholder={discountForm.type === "percent" ? "10" : "1000"}
                required
                className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#4F6EF7]/20"
              />
            </div>

            {/* Max uses + expiry */}
            <div className="grid grid-cols-2 gap-1.5 mb-4">
              <div>
                <label className="block text-[11px] font-semibold text-gray-500 mb-1.5">Max uses</label>
                <input
                  type="number"
                  min="1"
                  value={discountForm.maxUses}
                  onChange={(e) => setDiscountForm((f) => ({ ...f, maxUses: e.target.value }))}
                  placeholder="Unlimited"
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#4F6EF7]/20"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-gray-500 mb-1.5">Expires</label>
                <input
                  type="date"
                  value={discountForm.expiresAt}
                  onChange={(e) => setDiscountForm((f) => ({ ...f, expiresAt: e.target.value }))}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#4F6EF7]/20"
                />
              </div>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowDiscountModal(false)}
                className="flex-1 py-2 rounded-lg border border-gray-200 text-xs font-semibold text-gray-500 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!discountForm.code.trim() || !discountForm.value || savingDiscount}
                className="flex-1 py-2 rounded-lg bg-[#4F6EF7] text-white text-xs font-bold hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-sm shadow-[#4F6EF7]/10"
              >
                {savingDiscount ? "Creating..." : "Create code"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Delete discount code modal */}
      {discountToDelete && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-xl shadow-xl p-5 w-full max-w-sm border border-gray-100">
            <h3 className="text-sm font-bold text-gray-900 mb-1.5">Delete discount code?</h3>
            <p className="text-xs text-gray-400 leading-relaxed mb-4">
              This will permanently delete <span className="font-bold text-gray-800">{discountToDelete.code}</span>. Anyone using it will no longer get the discount. This action cannot be undone.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setDiscountToDelete(null)}
                disabled={deletingDiscount}
                className="flex-1 py-2 rounded-lg border border-gray-200 text-xs font-semibold text-gray-500 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={deleteDiscount}
                disabled={deletingDiscount}
                className="flex-1 py-2 rounded-lg bg-red-500 text-white text-xs font-bold hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {deletingDiscount ? "Deleting..." : "Delete code"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete modal */}
      {showDelete && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-xl shadow-xl p-5 w-full max-w-sm border border-gray-100">
            <h3 className="text-sm font-bold text-gray-900 mb-1.5">Delete event?</h3>
            <p className="text-xs text-gray-400 leading-relaxed mb-4">
              This will permanently delete <span className="font-bold text-gray-800">{event?.name}</span>. This action is final and cannot be undone.
            </p>
            <label className="block text-[11px] font-medium text-gray-500 mb-1.5">
              Type <span className="font-bold text-gray-800">{event?.name}</span> to confirm.
            </label>
            <input
              type="text"
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              placeholder={event?.name || "Event name"}
              autoFocus
              disabled={deleting}
              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500/20 mb-4 disabled:opacity-50"
            />
            <div className="flex gap-2">
              <button
                onClick={() => { setShowDelete(false); setDeleteConfirm(""); }}
                disabled={deleting}
                className="flex-1 py-2 rounded-lg border border-gray-200 text-xs font-semibold text-gray-500 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting || deleteConfirm.trim() !== (event?.name || "").trim()}
                className="flex-1 py-2 rounded-lg bg-red-500 text-white text-xs font-bold hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {deleting ? "Deleting..." : "Delete Event"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hidden printable */}
      <div style={{ display: "none" }}>
        <PrintableList ref={printRef} attendees={attendees} eventName={event?.name || ""} />
      </div>

      {showPublished && (
        <EventPublishedModal event={{ slug, name: event?.name }} onClose={closePublished} />
      )}
    </div>
  );
}
