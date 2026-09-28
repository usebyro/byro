"use client";

import { useState, useEffect, Suspense } from "react";
import { display, displayStyle } from "@/components/landing/fonts";
import { useSearchParams } from "next/navigation";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import EventCard from "@/components/landing/EventCard";
import API from "@/services/api";

interface Event {
  id: number;
  slug: string;
  name: string;
  category: string;
  category_display?: string;
  day: string;
  time_from: string;
  time_to: string;
  location: string;
  ticket_price: number;
  event_image_url?: string;
  is_active: boolean;
}

interface Category {
  value: string;
  label: string;
  count: number;
}

interface Location {
  value: string;
  label: string;
  count: number;
}

const PRICE_MAX = 50000;

const WHEN_OPTIONS = [
  { value: "today", label: "Today", count: null as null },
  { value: "weekend", label: "This weekend", count: null as null },
  { value: "month", label: "This month", count: null as null },
];

const SORT_OPTIONS = [
  { value: "trending", label: "Trending" },
  { value: "recent", label: "Most recent" },
  { value: "price_asc", label: "Price: Low to High" },
  { value: "price_desc", label: "Price: High to Low" },
];

function DiscoverPageContent() {
  const searchParams = useSearchParams();
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<Category[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedWhen, setSelectedWhen] = useState<string[]>([]);
  const [selectedAreas, setSelectedAreas] = useState<string[]>([]);
  const [priceMax, setPriceMax] = useState(PRICE_MAX);
  const [sortBy, setSortBy] = useState("trending");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [visibleCount, setVisibleCount] = useState(6);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const search = searchParams.get("search") || "";

  useEffect(() => {
    API.getCategories()
      .then((data) => {
        const cats: Category[] = data?.categories || [];
        if (cats.length > 0) setCategories(cats);
      })
      .catch(() => {/* keep empty, sidebar won't show categories */});

    API.getLocations()
      .then((data) => {
        const locs: Location[] = data?.locations || [];
        if (locs.length > 0) setLocations(locs);
      })
      .catch(() => {/* keep empty, sidebar won't show locations */});
  }, []);

  useEffect(() => {
    const fetchEvents = async () => {
      setLoading(true);
      try {
        const params: Record<string, string | number> = {};
        if (search.trim()) params.search = search.trim();
        if (selectedCategories.length > 0) params.category = selectedCategories[0];
        if (selectedWhen.length > 0) params.when = selectedWhen[0];
        if (selectedAreas.length > 0) params.area = selectedAreas[0];
        if (priceMax < PRICE_MAX) params.max_price = priceMax;
        params.sort = sortBy;

        const data = await API.getEvents(params);
        const raw = Array.isArray(data) ? data : data.events || data.data || [];
        const seen = new Set<number>();
        const eventList = raw.filter((e: { id: number }) => {
          if (seen.has(e.id)) return false;
          seen.add(e.id);
          return true;
        });
        setEvents(eventList);
      } catch (error) {
        console.error("Error fetching events:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchEvents();
  }, [search, selectedCategories, selectedWhen, selectedAreas, priceMax, sortBy]);

  useEffect(() => {
    if (!filtersOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFiltersOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [filtersOpen]);

  const toggleCategory = (value: string) => {
    setSelectedCategories((prev) =>
      prev.includes(value) ? prev.filter((c) => c !== value) : [...prev, value]
    );
    setVisibleCount(6);
  };

  const toggleWhen = (value: string) => {
    setSelectedWhen((prev) =>
      prev.includes(value) ? prev.filter((w) => w !== value) : [...prev, value]
    );
    setVisibleCount(6);
  };

  const toggleArea = (value: string) => {
    setSelectedAreas((prev) =>
      prev.includes(value) ? prev.filter((a) => a !== value) : [...prev, value]
    );
    setVisibleCount(6);
  };

  const activeFilters = [
    ...selectedCategories.map(
      (v) => categories.find((c) => c.value === v)?.label || v
    ),
    ...selectedWhen.map(
      (v) => WHEN_OPTIONS.find((w) => w.value === v)?.label || v
    ),
    ...selectedAreas.map(
      (v) => locations.find((a) => a.value === v)?.label || v
    ),
  ];

  const clearAll = () => {
    setSelectedCategories([]);
    setSelectedWhen([]);
    setSelectedAreas([]);
    setPriceMax(PRICE_MAX);
    setVisibleCount(6);
  };

  const removeFilter = (label: string) => {
    const cat = categories.find((c) => c.label === label);
    if (cat) setSelectedCategories((prev) => prev.filter((c) => c !== cat.value));
    const when = WHEN_OPTIONS.find((w) => w.label === label);
    if (when) setSelectedWhen((prev) => prev.filter((w) => w !== when.value));
    const area = locations.find((a) => a.label === label);
    if (area) setSelectedAreas((prev) => prev.filter((a) => a !== area.value));
  };

  // Server handles single-value filters; client-side handles multi-select edge cases
  let filteredEvents = events.filter((event) => {
    if (selectedCategories.length > 1 && !selectedCategories.includes(event.category)) {
      return false;
    }
    if (priceMax < PRICE_MAX && event.ticket_price > priceMax) {
      return false;
    }
    return true;
  });

  if (sortBy === "price_asc") {
    filteredEvents = [...filteredEvents].sort(
      (a, b) => a.ticket_price - b.ticket_price
    );
  } else if (sortBy === "price_desc") {
    filteredEvents = [...filteredEvents].sort(
      (a, b) => b.ticket_price - a.ticket_price
    );
  }

  const visibleEvents = filteredEvents.slice(0, visibleCount);
  const hasMore = visibleCount < filteredEvents.length;

  const filterPanel = (
    <>
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2 text-gray-800 font-medium text-sm">
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <line x1="4" y1="6" x2="20" y2="6" />
                    <line x1="8" y1="12" x2="16" y2="12" />
                    <line x1="11" y1="18" x2="13" y2="18" />
                  </svg>
                  Filters
                </div>
                {activeFilters.length > 0 && (
                  <button
                    onClick={clearAll}
                    className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                  >
                    Clear all
                  </button>
                )}
              </div>

              {/* Category */}
              <div className="mb-5">
                <h4 className="text-sm font-semibold text-gray-900 mb-3">
                  Category
                </h4>
                <div className="space-y-2.5">
                  {categories.map((cat) => (
                    <label
                      key={cat.value}
                      className="flex items-center gap-2.5 cursor-pointer group"
                    >
                      <input
                        type="checkbox"
                        checked={selectedCategories.includes(cat.value)}
                        onChange={() => toggleCategory(cat.value)}
                        className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 focus:ring-offset-0 cursor-pointer"
                      />
                      <span className="text-sm text-gray-600 group-hover:text-gray-900 flex-1 leading-none">
                        {cat.label}
                      </span>
                      <span className="text-xs text-gray-400">{cat.count}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="border-t border-gray-100 my-5" />

              {/* When */}
              <div className="mb-5">
                <h4 className="text-sm font-semibold text-gray-900 mb-3">
                  When
                </h4>
                <div className="space-y-2.5">
                  {WHEN_OPTIONS.map((when) => (
                    <label
                      key={when.value}
                      className="flex items-center gap-2.5 cursor-pointer group"
                    >
                      <input
                        type="checkbox"
                        checked={selectedWhen.includes(when.value)}
                        onChange={() => toggleWhen(when.value)}
                        className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 focus:ring-offset-0 cursor-pointer"
                      />
                      <span className="text-sm text-gray-600 group-hover:text-gray-900 flex-1 leading-none">
                        {when.label}
                      </span>
                      {when.count !== null && (
                        <span className="text-xs text-gray-400">
                          {when.count}
                        </span>
                      )}
                    </label>
                  ))}
                </div>
              </div>

              <div className="border-t border-gray-100 my-5" />

              {/* Price range */}
              <div className="mb-5">
                <h4 className="text-sm font-semibold text-gray-900 mb-3">
                  Price range
                </h4>
                <div className="px-1">
                  <input
                    type="range"
                    min={0}
                    max={PRICE_MAX}
                    step={1000}
                    value={priceMax}
                    onChange={(e) => {
                      setPriceMax(parseInt(e.target.value));
                      setVisibleCount(6);
                    }}
                    className="w-full h-1.5 accent-blue-600 cursor-pointer"
                  />
                  <div className="flex justify-between text-xs text-gray-500 mt-2">
                    <span>Free</span>
                    <span>
                      {priceMax < PRICE_MAX ? `Up to ₦${priceMax.toLocaleString()}` : "Any price"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="border-t border-gray-100 my-5" />

              {/* Area */}
              <div>
                <h4 className="text-sm font-semibold text-gray-900 mb-3">
                  Area
                </h4>
                <div className="space-y-2.5">
                  {locations.map((area) => (
                    <label
                      key={area.value}
                      className="flex items-center gap-2.5 cursor-pointer group"
                    >
                      <input
                        type="checkbox"
                        checked={selectedAreas.includes(area.value)}
                        onChange={() => toggleArea(area.value)}
                        className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 focus:ring-offset-0 cursor-pointer"
                      />
                      <span className="text-sm text-gray-600 group-hover:text-gray-900 flex-1 leading-none">
                        {area.label}
                      </span>
                      <span className="text-xs text-gray-400">{area.count}</span>
                    </label>
                  ))}
                </div>
              </div>
    </>
  );

  return (
    <>
      <Navbar />
      <main className={`${display.variable} min-h-screen bg-white`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Page title */}
          <h1
            className="mb-8 text-[2.5rem] font-extrabold leading-none tracking-[-0.03em] text-[#0F172A] sm:text-6xl"
            style={displayStyle}
          >
            Discover events
          </h1>

          <div className="flex gap-10">
            {/* Sidebar filters */}
            <aside className="hidden lg:block w-52 shrink-0">
              {filterPanel}
            </aside>

            {/* Main content */}
            <div className="flex-1 min-w-0">
              {/* Top bar */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setFiltersOpen(true)}
                    className="flex items-center gap-2 rounded-xl bg-white px-3.5 py-2 text-sm font-semibold text-[#0F172A] ring-2 ring-[#0F172A] transition-colors hover:bg-[#F8FAFC] focus:outline-none focus-visible:ring-[#2563EB] lg:hidden"
                  >
                    Filters
                    {activeFilters.length > 0 && (
                      <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[#2563EB] px-1 text-xs text-white">
                        {activeFilters.length}
                      </span>
                    )}
                  </button>
                  <span className="text-sm text-gray-600">
                    <span className="font-semibold text-[#0F172A]">{filteredEvents.length}</span>{" "}
                    {filteredEvents.length === 1 ? "event" : "events"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <select
                      aria-label="Sort by"
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value)}
                      className="text-sm font-medium text-[#0F172A] bg-white rounded-xl pl-4 pr-8 py-2 ring-2 ring-[#0F172A]/15 focus:outline-none focus:ring-[#2563EB] appearance-none cursor-pointer"
                    >
                      {SORT_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                    <svg
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none"
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </div>
                  <div className="flex overflow-hidden rounded-xl ring-2 ring-[#0F172A]/15">
                    <button
                      onClick={() => setViewMode("grid")}
                      className={`p-2 transition-colors ${
                        viewMode === "grid"
                          ? "bg-[#0F172A] text-white"
                          : "bg-white text-gray-400 hover:bg-gray-50"
                      }`}
                      aria-label="Grid view"
                    >
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <rect x="3" y="3" width="7" height="7" />
                        <rect x="14" y="3" width="7" height="7" />
                        <rect x="3" y="14" width="7" height="7" />
                        <rect x="14" y="14" width="7" height="7" />
                      </svg>
                    </button>
                    <button
                      onClick={() => setViewMode("list")}
                      className={`p-2 transition-colors ${
                        viewMode === "list"
                          ? "bg-[#0F172A] text-white"
                          : "bg-white text-gray-400 hover:bg-gray-50"
                      }`}
                      aria-label="List view"
                    >
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <line x1="3" y1="6" x2="21" y2="6" />
                        <line x1="3" y1="12" x2="21" y2="12" />
                        <line x1="3" y1="18" x2="21" y2="18" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>

              {/* Active filter pills */}
              {activeFilters.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-5">
                  {activeFilters.map((filter) => (
                    <span
                      key={filter}
                      className="inline-flex items-center gap-1 bg-blue-600 text-white text-sm font-medium px-3 py-1 rounded-full"
                    >
                      {filter}
                      <button
                        onClick={() => removeFilter(filter)}
                        className="ml-0.5 hover:opacity-80 transition-opacity leading-none"
                        aria-label={`Remove ${filter} filter`}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}

              {/* Events */}
              {loading ? (
                <div
                  className={`grid gap-5 ${
                    viewMode === "grid"
                      ? "grid-cols-1 sm:grid-cols-2 xl:grid-cols-3"
                      : "grid-cols-1"
                  }`}
                >
                  {[...Array(6)].map((_, i) => (
                    <div
                      key={i}
                      className="animate-pulse bg-white rounded-2xl overflow-hidden border border-gray-100"
                    >
                      <div className="h-44 bg-gray-100" />
                      <div className="p-4 space-y-3">
                        <div className="h-5 bg-gray-100 rounded w-3/4" />
                        <div className="h-4 bg-gray-100 rounded w-1/2" />
                        <div className="h-4 bg-gray-100 rounded w-2/3" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : visibleEvents.length === 0 ? (
                <div className="text-center py-20">
                  <p className="text-xl font-bold text-[#0F172A] mb-1" style={displayStyle}>
                    No events match
                  </p>
                  <p className="text-gray-500 text-sm mb-5">
                    Remove a filter to see more.
                  </p>
                  <button
                    onClick={clearAll}
                    className="text-blue-600 font-medium hover:text-blue-700 transition-colors"
                  >
                    Clear all filters
                  </button>
                </div>
              ) : (
                <div
                  className={`grid gap-5 ${
                    viewMode === "grid"
                      ? "grid-cols-1 sm:grid-cols-2 xl:grid-cols-3"
                      : "grid-cols-1"
                  }`}
                >
                  {visibleEvents.map((event) => (
                    <EventCard key={event.id} event={event} />
                  ))}
                </div>
              )}

              {/* Load more */}
              {hasMore && !loading && (
                <div className="text-center mt-10">
                  <button
                    onClick={() => setVisibleCount((prev) => prev + 6)}
                    className="rounded-xl bg-white px-8 py-3 text-sm font-semibold text-[#0F172A] ring-2 ring-[#0F172A] shadow-[0_2px_0_#0F172A] transition-colors hover:bg-[#F8FAFC] focus:outline-none focus-visible:ring-[#2563EB]"
                  >
                    Load more events
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
        {filtersOpen && (
          <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Filters">
            <div className="absolute inset-0 bg-[#0F172A]/50" onClick={() => setFiltersOpen(false)} />
            <div className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-3xl bg-white px-6 pb-6 pt-4 ring-2 ring-[#0F172A]">
              <div className="mb-3 flex justify-end">
                <button
                  onClick={() => setFiltersOpen(false)}
                  aria-label="Close filters"
                  className="rounded-full p-1 text-2xl leading-none text-gray-500 hover:text-[#0F172A] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]"
                >
                  ×
                </button>
              </div>
              {filterPanel}
              <button
                onClick={() => setFiltersOpen(false)}
                className="sticky bottom-0 mt-6 w-full rounded-xl bg-[#2563EB] py-3 text-sm font-semibold text-white transition-colors hover:brightness-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0F172A] focus-visible:ring-offset-2"
              >
                Show {filteredEvents.length} {filteredEvents.length === 1 ? "event" : "events"}
              </button>
            </div>
          </div>
        )}
      </main>
      <Footer />
    </>
  );
}

export default function DiscoverPage() {
  return (
    <Suspense fallback={null}>
      <DiscoverPageContent />
    </Suspense>
  );
}
