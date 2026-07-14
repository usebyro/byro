"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useSelector } from "react-redux";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Camera01Icon,
  Calendar01Icon,
  Clock01Icon,
  Location01Icon,
  ArrowLeft01Icon,
  Add01Icon,
  Delete01Icon,
  Edit01Icon,
  DragDropVerticalIcon,
} from "@hugeicons/core-free-icons";
import API from "../../services/api";
import RichTextEditor from "./RichTextEditor";

/* ── Category options ── */
const CATEGORIES = [
  {
    id: "entertainment",
    label: "Concerts",
    gradient: "from-purple-600 to-pink-500",
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
        <path d="M9 18V5l12-2v13" />
        <circle cx="6" cy="18" r="3" />
        <circle cx="18" cy="16" r="3" />
      </svg>
    ),
  },
  {
    id: "fitness",
    label: "Sports",
    gradient: "from-orange-500 to-amber-400",
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
        <circle cx="12" cy="12" r="10" />
        <path d="M4.93 4.93l4.24 4.24M14.83 14.83l4.24 4.24M4.93 19.07l4.24-4.24M14.83 9.17l4.24-4.24" />
      </svg>
    ),
  },
  {
    id: "art_culture",
    label: "Nightlife",
    gradient: "from-pink-600 to-rose-400",
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
        <path d="M21 10.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
      </svg>
    ),
  },
  {
    id: "conference",
    label: "Conferences",
    gradient: "from-teal-600 to-emerald-400",
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
        <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
        <line x1="12" y1="19" x2="12" y2="22" />
        <line x1="8" y1="22" x2="16" y2="22" />
      </svg>
    ),
  },
];

const fmt = (n) =>
  new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", minimumFractionDigits: 0 }).format(n);

const convertTo24Hour = (t) => (!t ? "00:00:00" : `${t}:00`);

const formatDisplayDate = (dateStr) => {
  if (!dateStr) return null;
  const d = new Date(dateStr + "T00:00:00");
  return {
    main: d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
    day: d.toLocaleDateString("en-US", { weekday: "long" }),
  };
};

const formatDisplayTime = (timeStr) => {
  if (!timeStr) return null;
  const [h, m] = timeStr.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, "0")} ${ampm}`;
};

const formatDateForServer = (d) => {
  if (!d?.trim()) { toast.error("Event date is required"); return null; }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) { toast.error("Invalid date format"); return null; }
  return d;
};

/* ── Default tiers ── */
const DEFAULT_TIERS = [];

export default function EventCreationForm({ editSlug = null, initialData = null }) {
  const router = useRouter();
  const { token } = useSelector((state) => state.auth);
  const fileInputRef = useRef(null);
  const venueTimerRef = useRef(null);

  /* form state */
  const [eventName, setEventName] = useState("");
  const [categories, setCategories] = useState(CATEGORIES);
  const [category, setCategory] = useState("entertainment");
  const [showAddCategoryInput, setShowAddCategoryInput] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState("");
  const [timeFrom, setTimeFrom] = useState("");
  const [venue, setVenue] = useState("");
  const [virtualLink, setVirtualLink] = useState("");
  const [eventVisibility, setEventVisibility] = useState(true);
  const [showRemainingCount, setShowRemainingCount] = useState(false);
  const [ticketsTransferable, setTicketsTransferable] = useState(false);
  const [capacity, setCapacity] = useState("Unlimited");

  /* venue autocomplete */
  const [venueCoords, setVenueCoords] = useState(null);
  const [venueSuggestions, setVenueSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  /* image */
  const [eventImage, setEventImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [isImageLoading, setIsImageLoading] = useState(false);

  /* ticket tiers (UI only — we submit the first tier's price to the API) */
  const [tiers, setTiers] = useState(DEFAULT_TIERS);
  const [originalTiers, setOriginalTiers] = useState([]); // snapshot of saved tiers, for edit diffing
  const [editingTierId, setEditingTierId] = useState(null);
  const [editTierData, setEditTierData] = useState({});

  /* submission */
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [eventCreated, setEventCreated] = useState(false);
  const [eventSlug, setEventSlug] = useState(null);

  /* pre-fill when editing */
  useEffect(() => {
    if (!initialData) return;
    const d = initialData;
    setEventName(d.name || "");
    setDate(d.day || "");
    setTimeFrom(d.time_from ? d.time_from.slice(0, 5) : "");
    setVenue(d.location || "");
    setVirtualLink(d.virtual_link || "");
    setDescription(d.description || "");
    setTicketsTransferable(d.transferable || false);
    setCategory(d.category || "entertainment");
    setEventVisibility(d.visibility === "public");
    if (d.event_image_url || d.event_image) {
      const base = (process.env.NEXT_PUBLIC_API_URL || "https://byro.onrender.com").replace(/\/api\/?$/, "");
      const imgUrl = d.event_image_url || (d.event_image?.startsWith("http") ? d.event_image : `${base}${d.event_image}`);
      setImagePreview(imgUrl);
    }
  }, [initialData]);

  /* Load existing tiers when editing */
  useEffect(() => {
    if (!editSlug) return;
    API.getEventTiers(editSlug)
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          const mapped = data.map((t) => ({
            id: t.id, // real numeric backend ID — won't match "tier_" filter, so won't be re-POSTed
            name: t.name,
            price: t.price != null ? String(t.price) : "",
            available: t.capacity != null ? String(t.capacity) : "Unlimited",
            admits: t.admits_count != null ? String(t.admits_count) : "1",
          }));
          setTiers(mapped);
          // Deep-copy snapshot so we can diff for PATCH/DELETE on save
          setOriginalTiers(mapped.map((t) => ({ ...t })));
        }
      })
      .catch(() => {}); // silently fail — form still works without pre-loaded tiers
  }, [editSlug]);

  const handleImageChange = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("Please upload an image file"); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error("Image must be under 5MB"); return; }
    setIsImageLoading(true);
    setEventImage(file);
    const reader = new FileReader();
    reader.onloadend = () => { setImagePreview(reader.result); setIsImageLoading(false); };
    reader.readAsDataURL(file);
  }, []);

  /* Tier editing helpers */
  const startEditTier = (tier) => {
    setEditingTierId(tier.id);
    setEditTierData({ name: tier.name, available: tier.available, price: tier.price, admits: tier.admits ?? "1" });
  };

  const saveEditTier = () => {
    setTiers(prev => prev.map(t => t.id === editingTierId ? { ...t, ...editTierData } : t));
    setEditingTierId(null);
  };

  const deleteTier = (id) => {
    setTiers(prev => prev.filter(t => t.id !== id));
  };

  const addTier = () => {
    const newId = `tier_${Date.now()}`;
    setTiers(prev => [...prev, { id: newId, name: "New Tier", available: "100", price: "", admits: "1" }]);
    setEditingTierId(newId);
    setEditTierData({ name: "New Tier", available: "100", price: "", admits: "1" });
  };

  const handleVenueChange = useCallback((val) => {
    setVenue(val);
    setVenueCoords(null);
    if (venueTimerRef.current) clearTimeout(venueTimerRef.current);
    if (!val.trim() || val.length < 3) {
      setVenueSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    venueTimerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(val)}&limit=5`,
          { headers: { "Accept-Language": "en" } }
        );
        const data = await res.json();
        setVenueSuggestions(data);
        setShowSuggestions(data.length > 0);
      } catch {
        setVenueSuggestions([]);
      }
    }, 600);
  }, []);

  /* Submit */
  const handleSubmit = async (isDraft = false) => {
    if (!eventName.trim()) { toast.error("Event name is required"); return; }
    if (!date.trim()) { toast.error("Event date is required"); return; }
    if (!timeFrom) { toast.error("Start time is required"); return; }
    if (!venue.trim() && !virtualLink.trim()) { toast.error("Please add a venue or virtual link"); return; }

    const formattedDate = formatDateForServer(date);
    if (!formattedDate) return;

    /* Set auth token */
    if (token) {
      API.setAuthToken(token);
    } else {
      let stored = localStorage.getItem("authToken");
      if (!stored) { try { const raw = localStorage.getItem("token"); stored = raw ? JSON.parse(raw) : null; } catch { stored = null; } }
      if (stored) API.setAuthToken(stored);
      else { toast.error("Please log in to create an event"); return; }
    }

    /* Derive ticket_price from first tier */
    const firstTierPrice = tiers[0]?.price;
    const ticketPrice = firstTierPrice && !isNaN(parseFloat(firstTierPrice)) ? String(parseFloat(firstTierPrice)) : "0.00";

    const formData = new FormData();
    const fields = {
      name: eventName,
      day: formattedDate,
      time_from: convertTo24Hour(timeFrom),
      time_to: convertTo24Hour(timeFrom), // same for now; no end-time in design
      ticket_price: ticketPrice,
      transferable: ticketsTransferable.toString(),
      visibility: isDraft ? "private" : (eventVisibility ? "public" : "private"),
      category,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "GMT+01:00",
    };
    if (venue) fields.location = venue;
    if (virtualLink) fields.virtual_link = virtualLink;
    if (description) fields.description = description;
    if (capacity !== "Unlimited") fields.capacity = capacity;

    Object.entries(fields).forEach(([k, v]) => formData.append(k, v));
    if (eventImage instanceof File) formData.append("event_image", eventImage);

    const parseCapacity = (val) => {
      if (!val || val === "Unlimited") return null;
      const n = parseInt(String(val).replace(/,/g, ""), 10);
      return isNaN(n) ? null : n;
    };

    const parseAdmits = (val) => {
      const n = parseInt(String(val ?? "1"), 10);
      return isNaN(n) || n < 1 ? 1 : n;
    };

    const tierPayload = (tier, idx) => ({
      name: tier.name,
      price: parseFloat(tier.price) || 0,
      capacity: parseCapacity(tier.available),
      admits_count: parseAdmits(tier.admits),
      order: idx,
    });

    try {
      setIsSubmitting(true);
      const response = editSlug
        ? await API.updateEvent(editSlug, formData)
        : await API.createEvent(formData);

      if (response) {
        const slug = editSlug || response.slug;

        let tierOps;
        if (editSlug) {
          // Diff against the snapshot loaded from the server:
          //  • new tiers (temp "tier_" id)      → POST
          //  • existing tiers with changed fields → PATCH
          //  • saved tiers no longer present      → DELETE
          const currentIds = new Set(tiers.map((t) => String(t.id)));
          const ops = [];
          tiers.forEach((tier, idx) => {
            if (String(tier.id).startsWith("tier_")) {
              ops.push(API.createTier(slug, tierPayload(tier, idx)));
              return;
            }
            const orig = originalTiers.find((o) => String(o.id) === String(tier.id));
            const changed =
              !orig ||
              orig.name !== tier.name ||
              orig.price !== tier.price ||
              orig.available !== tier.available ||
              (orig.admits ?? "1") !== (tier.admits ?? "1");
            if (changed) ops.push(API.updateTier(slug, tier.id, tierPayload(tier, idx)));
          });
          originalTiers.forEach((orig) => {
            if (!currentIds.has(String(orig.id))) {
              ops.push(API.deleteTier(slug, orig.id));
            }
          });
          tierOps = ops;
        } else {
          tierOps = tiers.map((tier, idx) => API.createTier(slug, tierPayload(tier, idx)));
        }

        if (tierOps.length > 0) {
          const results = await Promise.allSettled(tierOps);
          const failures = results.filter((r) => r.status === "rejected");
          if (failures.length > 0) {
            toast.error(`Event saved but ${failures.length} tier change(s) failed: ${failures[0]?.reason?.message || "unknown error"}`);
          }
        }

        toast.success(editSlug ? "Event updated!" : isDraft ? "Draft saved!" : "Event published!");
        if (editSlug) {
          router.push(`/dashboard/events/${editSlug}`);
        } else {
          setEventSlug(response.slug || response.id);
          setEventCreated(true);
          router.push(`/${response.slug}?preview=true`);
        }
      }
    } catch (err) {
      console.error(err);
      toast.error(err.message || "Failed to save event");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F5F6FA]">
      {/* ── Top bar ── */}
      <div className="bg-white border-b border-gray-100 px-3 sm:px-6 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <button onClick={() => router.back()} className="flex items-center justify-center w-7 h-7 rounded-lg text-gray-500 hover:text-gray-800 hover:bg-gray-50 transition-colors shrink-0">
            <HugeiconsIcon icon={ArrowLeft01Icon} size={14} color="#6b7280" />
          </button>
          <span className="text-gray-200 text-sm">/</span>
          <h1 className="text-base sm:text-lg font-bold text-gray-900 truncate">
            {editSlug ? "Edit event" : "Create event"}
          </h1>
        </div>
        <div className="grid grid-cols-2 gap-2 w-full sm:flex sm:w-auto sm:items-center sm:gap-2.5">
          <button
            onClick={() => handleSubmit(true)}
            disabled={isSubmitting}
            className="border border-gray-200 text-gray-700 text-[11px] sm:text-xs font-semibold px-2.5 py-2 rounded-xl hover:bg-gray-50 transition-colors disabled:opacity-40 text-center w-full sm:w-auto"
          >
            Save draft
          </button>
          <button
            onClick={() => handleSubmit(false)}
            disabled={isSubmitting}
            className="bg-blue-600 text-white text-[11px] sm:text-xs font-semibold px-2.5 py-2 rounded-xl hover:bg-blue-700 transition-colors flex items-center justify-center gap-1 sm:gap-1.5 disabled:opacity-40 w-full sm:w-auto"
          >
            {isSubmitting ? (
              <svg className="animate-spin" width="12" height="12" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" /><path d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" fill="currentColor" className="opacity-75" /></svg>
            ) : (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
            )}
            {isSubmitting ? "Saving..." : "Publish event"}
          </button>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 flex flex-col lg:flex-row gap-6 items-start">

        {/* Left column */}
        <div className="flex-1 min-w-0 space-y-5">

          {/* Event details card */}
          <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
            <h2 className="font-bold text-gray-900 text-base mb-5">Event details</h2>

            {/* Name */}
            <div className="mb-5">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Event name</label>
              <input
                type="text"
                value={eventName}
                onChange={e => setEventName(e.target.value)}
                placeholder="Give your event a name"
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-gray-400"
              />
            </div>

            {/* Category */}
            <div className="mb-5">
              <label className="block text-sm font-medium text-gray-700 mb-3">Category</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {categories.map(cat => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setCategory(cat.id)}
                    className={`relative flex flex-col items-center justify-center p-5 rounded-2xl bg-gradient-to-br ${cat.gradient} transition-all ${
                      category === cat.id
                        ? "ring-2 ring-offset-2 ring-blue-500 scale-[1.02]"
                        : "opacity-70 hover:opacity-90"
                    }`}
                  >
                    {cat.icon}
                    <span className="text-white text-xs font-semibold mt-2">{cat.label}</span>
                    {category === cat.id && (
                      <div className="absolute top-2 right-2 w-4 h-4 bg-white rounded-full flex items-center justify-center">
                        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
                      </div>
                    )}
                  </button>
                ))}

                {!showAddCategoryInput && (
                  <button
                    type="button"
                    onClick={() => setShowAddCategoryInput(true)}
                    className="flex flex-col items-center justify-center p-5 rounded-2xl border-2 border-dashed border-gray-200 hover:border-blue-500 hover:bg-blue-50/20 transition-all text-gray-400 hover:text-blue-600 min-h-[108px]"
                  >
                    <HugeiconsIcon icon={Add01Icon} size={24} color="currentColor" />
                    <span className="text-xs font-semibold mt-2">Add New</span>
                  </button>
                )}
              </div>

              {showAddCategoryInput && (
                <div className="mt-3 p-4 border border-blue-100 bg-blue-50/30 rounded-xl flex flex-col sm:flex-row items-center gap-2">
                  <input
                    type="text"
                    value={newCategoryName}
                    onChange={e => setNewCategoryName(e.target.value)}
                    placeholder="e.g. Workshops, Festivals"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <div className="flex gap-2 w-full sm:w-auto shrink-0 justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        if (!newCategoryName.trim()) return;
                        const id = newCategoryName.trim().toLowerCase().replace(/\s+/g, "_");
                        if (categories.some(c => c.id === id)) {
                          toast.error("Category already exists");
                          return;
                        }
                        const newCat = {
                          id,
                          label: newCategoryName.trim(),
                          gradient: "from-indigo-600 to-blue-500",
                          icon: (
                            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                            </svg>
                          )
                        };
                        setCategories(prev => [...prev, newCat]);
                        setCategory(id);
                        setNewCategoryName("");
                        setShowAddCategoryInput(false);
                        toast.success(`Category "${newCategoryName.trim()}" added!`);
                      }}
                      className="bg-blue-600 text-white text-xs font-semibold px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      Add
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowAddCategoryInput(false);
                        setNewCategoryName("");
                      }}
                      className="border border-gray-200 text-gray-600 text-xs font-medium px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Description</label>
              <RichTextEditor
                value={description}
                onChange={setDescription}
              />
            </div>
          </div>

          {/* Date & location card */}
          <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
            <h2 className="font-bold text-gray-900 text-base mb-5">Date &amp; location</h2>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                {/* Date */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Date</label>
                  <div className="relative">
                    <HugeiconsIcon icon={Calendar01Icon} size={15} color="#9ca3af" className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="date"
                      value={date}
                      onChange={e => setDate(e.target.value)}
                      className="w-full border border-gray-200 rounded-xl pl-9 pr-4 py-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>
                {/* Start time */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Start time</label>
                  <div className="relative">
                    <HugeiconsIcon icon={Clock01Icon} size={15} color="#9ca3af" className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="time"
                      value={timeFrom}
                      onChange={e => setTimeFrom(e.target.value)}
                      className="w-full border border-gray-200 rounded-xl pl-9 pr-4 py-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>
              </div>

              {/* Venue */}
              <div className="relative">
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Venue</label>
                <div className="relative">
                  <HugeiconsIcon icon={Location01Icon} size={15} color="#9ca3af" className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={venue}
                    onChange={e => handleVenueChange(e.target.value)}
                    onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                    onFocus={() => venueSuggestions.length > 0 && setShowSuggestions(true)}
                    placeholder="Eko Convention Centre, Victoria Island"
                    className="w-full border border-gray-200 rounded-xl pl-9 pr-4 py-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-gray-400"
                    autoComplete="off"
                  />
                </div>

                {/* Suggestions dropdown */}
                {showSuggestions && venueSuggestions.length > 0 && (
                  <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
                    {venueSuggestions.map((s, i) => (
                      <button
                        key={i}
                        type="button"
                        onMouseDown={() => {
                          const label = s.display_name.split(",").slice(0, 3).join(", ").trim();
                          setVenue(label);
                          setVenueCoords({ lat: parseFloat(s.lat), lon: parseFloat(s.lon) });
                          setShowSuggestions(false);
                          setVenueSuggestions([]);
                        }}
                        className="w-full text-left px-4 py-3 text-sm text-gray-700 hover:bg-blue-50 border-b border-gray-50 last:border-0 flex items-start gap-2.5"
                      >
                        <HugeiconsIcon icon={Location01Icon} size={13} color="#9ca3af" className="shrink-0 mt-0.5" />
                        <span className="leading-snug line-clamp-2">{s.display_name}</span>
                      </button>
                    ))}
                  </div>
                )}

                {/* Map preview */}
                {venueCoords && (
                  <div className="mt-3 rounded-xl overflow-hidden border border-gray-200" style={{ height: "200px" }}>
                    <iframe
                      title="venue-map-preview"
                      width="100%"
                      height="100%"
                      style={{ border: "none" }}
                      loading="lazy"
                      src={`https://www.openstreetmap.org/export/embed.html?bbox=${venueCoords.lon - 0.01},${venueCoords.lat - 0.01},${venueCoords.lon + 0.01},${venueCoords.lat + 0.01}&layer=mapnik&marker=${venueCoords.lat},${venueCoords.lon}`}
                    />
                  </div>
                )}
              </div>

              {/* Virtual link */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Virtual link <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <input
                  type="url"
                  value={virtualLink}
                  onChange={e => setVirtualLink(e.target.value)}
                  placeholder="https://meet.example.com/..."
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-gray-400"
                />
              </div>
            </div>
          </div>

          {/* Ticket tiers card */}
          <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-bold text-gray-900 text-base">Ticket tiers</h2>
              <button
                type="button"
                onClick={addTier}
                className="flex items-center gap-1.5 text-blue-600 text-sm font-semibold hover:text-blue-700 transition-colors"
              >
                <HugeiconsIcon icon={Add01Icon} size={15} color="#2563eb" />
                Add tier
              </button>
            </div>

            <div className="space-y-2">
              {tiers.map((tier, idx) => (
                <div key={tier.id}>
                  {editingTierId === tier.id ? (
                    /* Editing state */
                    <div className="border border-blue-200 bg-blue-50/40 rounded-xl p-4 space-y-3">
                      <div className="grid grid-cols-3 gap-3">
                        <div className="col-span-2">
                          <label className="text-xs font-medium text-gray-600 mb-1 block">Tier name</label>
                          <input
                            type="text"
                            value={editTierData.name}
                            onChange={e => setEditTierData(p => ({ ...p, name: e.target.value }))}
                            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-gray-600 mb-1 block">Available</label>
                          <input
                            type="text"
                            value={editTierData.available}
                            onChange={e => setEditTierData(p => ({ ...p, available: e.target.value }))}
                            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="100"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-gray-600 mb-1 block">Price (₦) — leave blank for free</label>
                        <input
                          type="number"
                          min="0"
                          step="100"
                          value={editTierData.price}
                          onChange={e => setEditTierData(p => ({ ...p, price: e.target.value }))}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder="e.g. 8500"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-gray-600 mb-1 block">People per ticket</label>
                        <input
                          type="number"
                          min="1"
                          step="1"
                          value={editTierData.admits ?? "1"}
                          onChange={e => setEditTierData(p => ({ ...p, admits: e.target.value }))}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder="1"
                        />
                        <p className="text-[11px] text-gray-400 mt-1">
                          For group tickets (e.g. &quot;Group of 4&quot; → 4). This is one ticket that admits that many people; the buyer fills in each guest&apos;s details at checkout.
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button type="button" onClick={saveEditTier} className="bg-blue-600 text-white text-xs font-semibold px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors">Save</button>
                        <button type="button" onClick={() => setEditingTierId(null)} className="border border-gray-200 text-gray-600 text-xs font-medium px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors">Cancel</button>
                      </div>
                    </div>
                  ) : (
                    /* Display state */
                    <div className="flex items-center gap-3 p-4 border border-gray-100 rounded-xl hover:border-gray-200 transition-colors">
                      <span className="text-gray-300 cursor-grab">
                        <HugeiconsIcon icon={DragDropVerticalIcon} size={16} color="#d1d5db" />
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900 text-sm">{tier.name}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {tier.available} available
                          {parseInt(tier.admits, 10) > 1 ? ` · admits ${tier.admits} per ticket` : ""}
                        </p>
                      </div>
                      <span className="font-bold text-gray-900 text-sm mr-2">
                        {tier.price ? fmt(parseFloat(tier.price)) : "Free"}
                      </span>
                      <button type="button" onClick={() => startEditTier(tier)} className="text-gray-400 hover:text-gray-700 transition-colors p-1">
                        <HugeiconsIcon icon={Edit01Icon} size={15} color="currentColor" />
                      </button>
                      {tiers.length > 1 && (
                        <button type="button" onClick={() => deleteTier(tier.id)} className="text-red-400 hover:text-red-600 transition-colors p-1">
                          <HugeiconsIcon icon={Delete01Icon} size={15} color="currentColor" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <p className="text-xs text-gray-400 mt-4">
              Free event? Skip this section. For paid events, add at least one tier with a price, the first tier&apos;s price becomes the event ticket price.
            </p>
          </div>
        </div>

        {/* Right column */}
        <div className="lg:w-64 xl:w-72 shrink-0 w-full space-y-4">

          {/* Cover image */}
          <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
            <h3 className="font-bold text-gray-900 text-sm mb-4">Cover image</h3>
            <input type="file" ref={fileInputRef} onChange={handleImageChange} className="hidden" accept="image/*" />
            <div
              onClick={() => fileInputRef.current?.click()}
              className="rounded-xl overflow-hidden cursor-pointer relative"
              style={{ height: "160px" }}
            >
              {imagePreview ? (
                <img src={imagePreview} alt="Cover" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-purple-700 to-pink-500 flex flex-col items-center justify-center gap-2">
                  {isImageLoading ? (
                    <svg className="animate-spin" width="20" height="20" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="white" strokeWidth="4" className="opacity-25" /><path d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" fill="white" className="opacity-75" /></svg>
                  ) : (
                    <HugeiconsIcon icon={Camera01Icon} size={24} color="white" />
                  )}
                </div>
              )}
              {imagePreview && (
                <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                  <span className="bg-white text-gray-900 text-xs font-semibold px-3 py-1.5 rounded-full flex items-center gap-1.5">
                    <HugeiconsIcon icon={Camera01Icon} size={12} color="#111827" />
                    Replace cover
                  </span>
                </div>
              )}
            </div>
            <p className="text-xs text-gray-400 mt-2.5">1600×900px recommended. JPG or PNG, max 5MB.</p>
          </div>

          {/* Settings */}
          <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
            <h3 className="font-bold text-gray-900 text-sm mb-4">Settings</h3>
            <div className="space-y-4">
              {[
                { label: "Public event", value: eventVisibility, toggle: () => setEventVisibility(v => !v) },
                { label: "Show remaining count", value: showRemainingCount, toggle: () => setShowRemainingCount(v => !v) },
                { label: "Transferable tickets", value: ticketsTransferable, toggle: () => setTicketsTransferable(v => !v) },
              ].map(({ label, value, toggle }) => (
                <div key={label} className="flex items-center justify-between">
                  <span className="text-sm text-gray-700">{label}</span>
                  <button
                    type="button"
                    onClick={toggle}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${value ? "bg-blue-600" : "bg-gray-200"}`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${value ? "translate-x-6" : "translate-x-1"}`} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {editSlug && (
            <button
              type="button"
              onClick={() => router.push(`/dashboard/events/${editSlug}`)}
              className="w-full border border-gray-200 text-gray-600 font-medium py-2.5 rounded-xl hover:bg-gray-50 transition-colors text-sm"
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
