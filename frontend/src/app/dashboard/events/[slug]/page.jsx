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
} from "@hugeicons/core-free-icons";
import { useReactToPrint } from "react-to-print";
import { toast } from "sonner";
import jsQR from "jsqr";
import API from "@/services/api";

const BASE_URL = (process.env.NEXT_PUBLIC_API_URL || "https://byro.onrender.com").replace(/\/api\/?$/, "");

const CATEGORY_GRADIENT = {
  entertainment: "from-purple-700 via-purple-600 to-pink-500",
  fitness:       "from-orange-600 via-orange-500 to-amber-400",
  art_culture:   "from-pink-700 via-pink-600 to-rose-400",
  conference:    "from-teal-700 via-teal-600 to-emerald-400",
  technology:    "from-blue-700 via-blue-600 to-violet-500",
  web3_crypto:   "from-amber-600 via-amber-500 to-orange-400",
  other:         "from-slate-700 via-slate-600 to-gray-500",
};

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

function Avatar({ name, size = 8 }) {
  const initials = (name || "?").split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
  const colors = ["from-blue-400 to-purple-500", "from-teal-400 to-emerald-500", "from-pink-400 to-rose-500", "from-amber-400 to-orange-500", "from-blue-400 to-blue-500"];
  const color = colors[initials.charCodeAt(0) % colors.length];
  return (
    <div className={`w-${size} h-${size} rounded-full bg-gradient-to-br ${color} flex items-center justify-center text-white text-xs font-bold shrink-0 select-none`}>
      {initials}
    </div>
  );
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

  const [event, setEvent] = useState(null);
  const [attendees, setAttendees] = useState([]);
  const [checkedInCount, setCheckedInCount] = useState(0);
  const [loadingEvent, setLoadingEvent] = useState(true);
  const [loadingAttendees, setLoadingAttendees] = useState(true);
  const [eventError, setEventError] = useState(false);
  const [activeTab, setActiveTab] = useState("attendees");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all"); // all | checkedin | vip
  const [checkInModal, setCheckInModal] = useState(false);
  const [checkInValue, setCheckInValue] = useState("");
  const [checkingIn, setCheckingIn] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [checkInMode, setCheckInMode] = useState("scan"); // scan | manual
  const [cameraError, setCameraError] = useState("");

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
        }));
        setAttendees(mapped);
        setCheckedInCount(res.checked_in_count || 0);
      })
      .catch(() => {})
      .finally(() => setLoadingAttendees(false));
  };

  useEffect(() => { loadAttendees(); }, [slug]);

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
        loadAttendees();
      }
      setCheckInValue("");
      setCheckInModal(false);
    } catch (err) {
      toast.error(err?.message || "Check-in failed.");
      scanLockRef.current = false; // let scanning resume after a failed/unknown code
    } finally {
      setCheckingIn(false);
    }
  };

  // Stop the camera stream and scan loop (modal close, mode switch, unmount).
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

  // Grab a video frame, decode it for a QR code, and check in on a hit.
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
      scanLockRef.current = true; // avoid re-submitting the same held-up code every frame
      handleCheckIn(code.data);
    }
    scanFrameRef.current = requestAnimationFrame(scanTick);
  };

  // Start the camera once the modal is open in scan mode.
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkInModal, checkInMode]);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await API.deleteEvent(slug);
      toast.success("Event deleted.");
      router.push("/dashboard/events");
    } catch (err) {
      toast.error(err?.message || "Failed to delete.");
      setDeleting(false);
      setShowDelete(false);
    }
  };

  if (eventError) return notFound();

  const grad = CATEGORY_GRADIENT[event?.category] || CATEGORY_GRADIENT.other;
  const img = event ? getImageUrl(event) : null;
  const isLive = event?.is_active && new Date(event.day) >= new Date();

  const filteredAttendees = attendees.filter((a) => {
    const matchSearch = !search ||
      a.name.toLowerCase().includes(search.toLowerCase()) ||
      a.email.toLowerCase().includes(search.toLowerCase()) ||
      a.ref.toLowerCase().includes(search.toLowerCase());
    const matchFilter =
      filter === "all" ||
      (filter === "checkedin" && a.checkedIn);
    return matchSearch && matchFilter;
  });

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Back */}
      <Link href="/dashboard/events" className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 mb-5 transition-colors">
        <HugeiconsIcon icon={ArrowLeft01Icon} size={15} color="currentColor" />
        Events
      </Link>

      {/* Event hero */}
      <div className={`relative rounded-2xl overflow-hidden mb-6 ${img ? "bg-gray-900" : `bg-gradient-to-br ${grad}`}`} style={{ minHeight: 140 }}>
        {img && (
          <Image src={img} alt={event.name} fill className="object-cover" />
        )}
        <div className={`absolute inset-0 ${img ? "bg-black/45" : "bg-black/20"}`} />
        <div className="relative z-10 p-6 flex items-end justify-between gap-4">
          <div className="flex-1 min-w-0">
            {isLive && (
              <span className="inline-flex items-center gap-1.5 text-[10px] font-bold bg-white/15 backdrop-blur-sm text-white px-3 py-1 rounded-full mb-3">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                LIVE · SELLING
              </span>
            )}
            {loadingEvent ? (
              <div className="h-7 bg-white/20 rounded w-64 animate-pulse" />
            ) : (
              <h1 className="text-2xl font-bold text-white mb-1">{event?.name}</h1>
            )}
            <p className="text-white/70 text-sm">
              {event && `${formatDate(event.day)}${event.time_from ? ` · ${formatTime(event.time_from)}` : ""}${event.location ? ` · ${event.location}` : ""}`}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => {
                const url = `${window.location.origin}/${slug}`;
                navigator.clipboard?.writeText(url);
                toast.success("Link copied!");
              }}
              className="flex items-center gap-1.5 bg-white/10 backdrop-blur-sm text-white text-sm font-semibold px-4 py-2 rounded-xl hover:bg-white/20 transition-colors border border-white/20"
            >
              <HugeiconsIcon icon={Share01Icon} size={14} color="white" />
              Share
            </button>
            <Link
              href={`/${slug}/edit`}
              className="flex items-center gap-1.5 bg-blue-600 text-white text-sm font-semibold px-4 py-2 rounded-xl hover:bg-blue-700 transition-colors"
            >
              <HugeiconsIcon icon={Edit03Icon} size={14} color="white" />
              Edit
            </Link>
          </div>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Gross revenue", value: "—", icon: Money01Icon, iconBg: "bg-teal-50 text-teal-600", trend: null },
          { label: "Tickets sold", value: loadingAttendees ? "—" : attendees.length, icon: Ticket01Icon, iconBg: "bg-blue-50 text-blue-600", trend: null },
          { label: "Checked in", value: loadingAttendees ? "—" : checkedInCount, icon: UserMultiple02Icon, iconBg: "bg-violet-50 text-violet-600", trend: "live" },
          { label: "Page views", value: "—", icon: BarChartIcon, iconBg: "bg-amber-50 text-amber-600", trend: null },
        ].map((card) => (
          <div key={card.label} className="bg-white rounded-2xl border border-gray-100 p-4">
            <div className="flex items-start justify-between mb-3">
              <p className="text-xs text-gray-400">{card.label}</p>
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${card.iconBg}`}>
                <HugeiconsIcon icon={card.icon} size={15} color="currentColor" />
              </div>
            </div>
            <p className="text-2xl font-bold text-gray-900">{card.value}</p>
            {card.trend && (
              <p className="text-xs text-green-500 mt-0.5 font-medium">• {card.trend} vs last month</p>
            )}
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-6 border-b border-gray-200 mb-5">
        {["attendees", "tiers"].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`pb-3 text-sm font-semibold capitalize border-b-2 -mb-px transition-colors ${
              activeTab === tab
                ? "border-blue-600 text-gray-900"
                : "border-transparent text-gray-400 hover:text-gray-600"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === "attendees" && (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          {/* Table header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
            <div className="flex items-center gap-2">
              <p className="font-semibold text-gray-900 text-sm">Guest list</p>
              <span className="text-gray-400 text-sm">· {attendees.length}</span>
            </div>
            <div className="flex items-center gap-2">
              {/* Filter pills */}
              {["all", "checkedin"].map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${
                    filter === f
                      ? "bg-blue-600 text-white"
                      : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                  }`}
                >
                  {f === "all" ? "All" : "Checked in"}
                </button>
              ))}
              {/* Search */}
              <div className="relative">
                <svg className="absolute left-2.5 top-1/2 -translate-y-1/2" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2">
                  <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
                </svg>
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search..."
                  className="pl-8 pr-3 py-1.5 bg-gray-50 border border-gray-100 rounded-xl text-xs w-36 focus:outline-none focus:ring-2 focus:ring-blue-100"
                />
              </div>
              {/* Check in */}
              <button
                onClick={() => { setCheckInMode("scan"); setCheckInModal(true); }}
                className="flex items-center gap-1.5 bg-blue-600 text-white text-xs font-semibold px-3 py-1.5 rounded-xl hover:bg-blue-700 transition-colors"
              >
                <HugeiconsIcon icon={QrCodeIcon} size={12} color="white" />
                Check in
              </button>
              {/* Export */}
              <button
                onClick={handlePrint}
                className="flex items-center gap-1.5 bg-white border border-gray-200 text-gray-600 text-xs font-semibold px-3 py-1.5 rounded-xl hover:bg-gray-50 transition-colors"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                Export CSV
              </button>
            </div>
          </div>

          {/* Column headers */}
          <div className="grid grid-cols-12 px-5 py-2.5 border-b border-gray-50 bg-gray-50/60">
            <div className="col-span-5 text-[10px] font-bold text-gray-400 tracking-wider uppercase">Attendee</div>
            <div className="col-span-3 text-[10px] font-bold text-gray-400 tracking-wider uppercase">Tier</div>
            <div className="col-span-2 text-[10px] font-bold text-gray-400 tracking-wider uppercase">Ref</div>
            <div className="col-span-2 text-[10px] font-bold text-gray-400 tracking-wider uppercase text-right">Status</div>
          </div>

          {/* Rows */}
          {loadingAttendees ? (
            <div className="divide-y divide-gray-50">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="grid grid-cols-12 px-5 py-3.5 animate-pulse">
                  <div className="col-span-5 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-gray-100" />
                    <div className="space-y-1.5">
                      <div className="h-3.5 bg-gray-100 rounded w-28" />
                      <div className="h-3 bg-gray-100 rounded w-36" />
                    </div>
                  </div>
                  <div className="col-span-3 flex items-center"><div className="h-5 bg-gray-100 rounded-full w-28" /></div>
                  <div className="col-span-2 flex items-center"><div className="h-3 bg-gray-100 rounded w-20" /></div>
                  <div className="col-span-2 flex items-center justify-end"><div className="h-3 bg-gray-100 rounded w-16" /></div>
                </div>
              ))}
            </div>
          ) : filteredAttendees.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-sm text-gray-400">
                {search ? "No attendees match your search" : "No attendees yet"}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {filteredAttendees.map((a) => (
                <div key={a.id} className="grid grid-cols-12 px-5 py-3.5 hover:bg-gray-50/50 items-center">
                  {/* Attendee */}
                  <div className="col-span-5 flex items-center gap-3 min-w-0">
                    <Avatar name={a.name} size={8} />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{a.name}</p>
                      <p className="text-xs text-gray-400 truncate">{a.email}</p>
                    </div>
                  </div>
                  {/* Tier */}
                  <div className="col-span-3">
                    <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-gray-100 text-gray-500">
                      General Admission
                    </span>
                  </div>
                  {/* Ref */}
                  <div className="col-span-2">
                    <span className="text-xs font-mono text-gray-500">{a.ref}</span>
                  </div>
                  {/* Status */}
                  <div className="col-span-2 text-right">
                    {a.checkedIn ? (
                      <span className="text-xs font-semibold text-green-600 flex items-center justify-end gap-1">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20 6L9 17l-5-5"/></svg>
                        Checked in
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">Not arrived</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Footer */}
          {filteredAttendees.length > 0 && (
            <div className="flex items-center justify-between px-5 py-3.5 border-t border-gray-50 bg-gray-50/40">
              <p className="text-xs text-gray-400">
                Showing {filteredAttendees.length} of {attendees.length}
              </p>
            </div>
          )}
        </div>
      )}

      {activeTab === "tiers" && (
        <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center">
          <p className="text-sm text-gray-400">Ticket tiers will appear here once backend integration is ready.</p>
        </div>
      )}

      {/* Delete button */}
      <div className="mt-6 flex justify-end">
        <button
          onClick={() => setShowDelete(true)}
          className="flex items-center gap-1.5 text-red-400 hover:text-red-600 text-xs font-semibold transition-colors"
        >
          <HugeiconsIcon icon={Delete02Icon} size={14} color="currentColor" />
          Delete event
        </button>
      </div>

      {/* Check-in modal */}
      {checkInModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-gray-900">Check In Attendee</h3>
              <button onClick={() => setCheckInModal(false)}>
                <HugeiconsIcon icon={CircleXIcon} size={20} color="#9ca3af" />
              </button>
            </div>

            {/* Mode toggle */}
            <div className="flex bg-gray-100 rounded-xl p-1 mb-4">
              <button
                onClick={() => setCheckInMode("scan")}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-colors ${
                  checkInMode === "scan" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"
                }`}
              >
                <HugeiconsIcon icon={Camera01Icon} size={14} color="currentColor" />
                Scan QR
              </button>
              <button
                onClick={() => setCheckInMode("manual")}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-colors ${
                  checkInMode === "manual" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"
                }`}
              >
                <HugeiconsIcon icon={KeyboardIcon} size={14} color="currentColor" />
                Enter manually
              </button>
            </div>

            {checkInMode === "scan" ? (
              <div className="mb-4">
                <div className="relative w-full aspect-square bg-black rounded-xl overflow-hidden">
                  <video ref={videoRef} muted playsInline className="w-full h-full object-cover" />
                  <canvas ref={canvasRef} className="hidden" />
                  {!cameraError && (
                    <div className="absolute inset-6 border-2 border-white/70 rounded-xl pointer-events-none" />
                  )}
                  {cameraError && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/80 px-4">
                      <p className="text-white text-xs text-center">{cameraError}</p>
                    </div>
                  )}
                </div>
                <p className="text-xs text-gray-400 text-center mt-3">
                  {checkingIn ? "Checking in..." : "Point the camera at the attendee's ticket QR code"}
                </p>
              </div>
            ) : (
              <>
                <p className="text-sm text-gray-400 mb-4">Enter the attendee&apos;s email or paste their QR token.</p>
                <input
                  type="text"
                  value={checkInValue}
                  onChange={(e) => setCheckInValue(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCheckIn()}
                  placeholder="email@example.com or QR token"
                  autoFocus
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-200 mb-4"
                />
              </>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => setCheckInModal(false)}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
              {checkInMode === "manual" && (
                <button
                  onClick={() => handleCheckIn()}
                  disabled={checkingIn || !checkInValue.trim()}
                  className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {checkingIn ? "Checking in..." : "Check In"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete modal */}
      {showDelete && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm">
            <h3 className="text-base font-bold text-gray-900 mb-2">Delete event?</h3>
            <p className="text-sm text-gray-400 mb-6">
              This will permanently delete <span className="font-semibold text-gray-900">{event?.name}</span> and all its data. This cannot be undone.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowDelete(false)}
                disabled={deleting}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 py-2.5 rounded-xl bg-red-500 text-white text-sm font-semibold hover:bg-red-600 disabled:opacity-50 transition-colors"
              >
                {deleting ? "Deleting..." : "Yes, delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hidden printable */}
      <div style={{ display: "none" }}>
        <PrintableList ref={printRef} attendees={attendees} eventName={event?.name || ""} />
      </div>
    </div>
  );
}
