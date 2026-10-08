"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { StackTile } from "@/components/brand/EventTile";
import API from "@/services/api";
import { dayGroupLabel, lowestPrice, type EventLike } from "@/lib/eventFormat";

type Event = EventLike & { id: number; is_active: boolean };

interface Option {
  value: string;
  label: string;
  count?: number;
}

const PAGE_SIZE = 9;
const PRICE_SPLIT = 20000;

const WHEN_OPTIONS = [
  { value: "", label: "Any date" },
  { value: "today", label: "Today" },
  { value: "weekend", label: "This weekend" },
  { value: "month", label: "This month" },
];

const PRICE_OPTIONS = [
  { value: "any", label: "Any price" },
  { value: "free", label: "Free only" },
  { value: "u20", label: "Up to ₦20,000" },
  { value: "o20", label: "₦20,000 and above" },
];

const SORT_OPTIONS = [
  { value: "trending", label: "Trending" },
  { value: "recent", label: "Most recent" },
  { value: "price_asc", label: "Price: low to high" },
  { value: "price_desc", label: "Price: high to low" },
];

const chevron = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M6 9l6 6 6-6" />
  </svg>
);

const tick = (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
);

const rowBtn =
  "-mx-2.5 flex h-11 items-center gap-3 rounded-xl px-2.5 text-left text-[15px] font-bold text-ink transition-colors hover:bg-mist focus:outline-none focus-visible:ring-2 focus-visible:ring-brand";

function DiscoverPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const search = searchParams.get("search") || "";
  const [query, setQuery] = useState(search);
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<Option[]>([]);
  const [locations, setLocations] = useState<Option[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [when, setWhen] = useState("");
  const [selectedAreas, setSelectedAreas] = useState<string[]>([]);
  const [price, setPrice] = useState("any");
  const [sortBy, setSortBy] = useState("trending");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [filtersOpen, setFiltersOpen] = useState(false);

  useEffect(() => setQuery(search), [search]);

  useEffect(() => {
    API.getCategories()
      .then((data) => {
        const cats: Option[] = data?.categories || [];
        if (cats.length > 0) setCategories(cats);
      })
      .catch(() => {});
    API.getLocations()
      .then((data) => {
        const locs: Option[] = data?.locations || [];
        if (locs.length > 0) setLocations(locs);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const fetchEvents = async () => {
      setLoading(true);
      try {
        const params: Record<string, string | number> = {};
        if (search.trim()) params.search = search.trim();
        if (selectedCategories.length > 0) params.category = selectedCategories[0];
        if (when) params.when = when;
        if (selectedAreas.length > 0) params.area = selectedAreas[0];
        if (price === "free") params.max_price = 0;
        if (price === "u20") params.max_price = PRICE_SPLIT;
        if (price === "o20") params.min_price = PRICE_SPLIT;
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
  }, [search, selectedCategories, when, selectedAreas, price, sortBy]);

  // Escape closes the phone sheet; the page behind stays put while it is open.
  useEffect(() => {
    if (!filtersOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFiltersOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [filtersOpen]);

  const reset = () => setVisibleCount(PAGE_SIZE);

  const toggleCategory = (value: string) => {
    setSelectedCategories((prev) => (prev.includes(value) ? prev.filter((c) => c !== value) : [...prev, value]));
    reset();
  };
  const toggleArea = (value: string) => {
    setSelectedAreas((prev) => (prev.includes(value) ? prev.filter((a) => a !== value) : [...prev, value]));
    reset();
  };
  const pickWhen = (value: string) => {
    setWhen(value);
    reset();
  };
  const pickPrice = (value: string) => {
    setPrice(value);
    reset();
  };
  const clearAll = () => {
    setSelectedCategories([]);
    setWhen("");
    setSelectedAreas([]);
    setPrice("any");
    reset();
  };

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    router.push(q ? `/discover?search=${encodeURIComponent(q)}` : "/discover");
    reset();
  };

  const activeCount = selectedCategories.length + selectedAreas.length + (when ? 1 : 0) + (price !== "any" ? 1 : 0);
  const whenLabel = WHEN_OPTIONS.find((w) => w.value === when)?.label ?? "Any date";
  const areaLabel =
    selectedAreas.length === 0
      ? "All areas"
      : selectedAreas.length === 1
      ? locations.find((l) => l.value === selectedAreas[0])?.label || selectedAreas[0]
      : `${selectedAreas.length} areas`;

  // Server handles single-value filters; client-side handles multi-select edge cases.
  let filteredEvents = events.filter((event) => {
    if (selectedCategories.length > 1 && !selectedCategories.includes(event.category)) return false;
    const p = lowestPrice(event);
    if (price === "free" && p > 0) return false;
    if (price === "u20" && p > PRICE_SPLIT) return false;
    if (price === "o20" && p < PRICE_SPLIT) return false;
    return true;
  });
  if (sortBy === "price_asc") {
    filteredEvents = [...filteredEvents].sort((a, b) => lowestPrice(a) - lowestPrice(b));
  } else if (sortBy === "price_desc") {
    filteredEvents = [...filteredEvents].sort((a, b) => lowestPrice(b) - lowestPrice(a));
  }

  const visibleEvents = filteredEvents.slice(0, visibleCount);
  const hasMore = visibleCount < filteredEvents.length;

  // Group what is visible by day, keeping the chosen sort order inside each day.
  const groups: { day: string; events: Event[] }[] = [];
  [...visibleEvents]
    .sort((a, b) => (a.day || "").localeCompare(b.day || ""))
    .forEach((e) => {
      const g = groups.find((x) => x.day === e.day);
      if (g) g.events.push(e);
      else groups.push({ day: e.day, events: [e] });
    });

  const checkRow = (label: string, on: boolean, onClick: () => void) => (
    <button key={label} type="button" aria-pressed={on} onClick={onClick} className={`${rowBtn} ${on ? "bg-mist" : ""}`}>
      <span
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-[1.5px] ${
          on ? "border-brand bg-brand text-white" : "border-[#C9D0DC] bg-white text-transparent"
        }`}
      >
        {tick}
      </span>
      <span className="min-w-0 truncate">{label}</span>
    </button>
  );

  const groupTitle = "mb-1.5 text-xs font-extrabold tracking-[0.08em] text-muted";

  /* One filter body, shown in the desktop sidebar and the phone sheet. */
  const filterBody = (
    <div className="flex flex-col gap-7">
      <div role="group" aria-label="Category" className="flex flex-col gap-1">
        <span className={groupTitle}>CATEGORY</span>
        {categories.length === 0 && <p className="text-sm text-muted">No categories yet.</p>}
        {categories.map((c) => checkRow(c.label, selectedCategories.includes(c.value), () => toggleCategory(c.value)))}
      </div>
      <span aria-hidden="true" className="h-px bg-hairline" />
      <div role="group" aria-label="Area" className="flex flex-col gap-1">
        <span className={groupTitle}>AREA</span>
        {locations.length === 0 && <p className="text-sm text-muted">No areas yet.</p>}
        {locations.map((a) => checkRow(a.label, selectedAreas.includes(a.value), () => toggleArea(a.value)))}
      </div>
      <span aria-hidden="true" className="h-px bg-hairline" />
      <div role="radiogroup" aria-label="Price" className="flex flex-col gap-1">
        <span className={groupTitle}>PRICE</span>
        {PRICE_OPTIONS.map((p) => {
          const on = price === p.value;
          return (
            <button
              key={p.value}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => pickPrice(p.value)}
              className={`${rowBtn} ${on ? "bg-mist" : ""}`}
            >
              <span className={`h-5 w-5 shrink-0 rounded-full bg-white ${on ? "border-[6px] border-brand" : "border-[1.5px] border-[#C9D0DC]"}`} />
              <span>{p.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );

  const whenSwitch = (
    <div role="group" aria-label="When" className="flex gap-0.5 overflow-x-auto rounded-full bg-mist p-1">
      {WHEN_OPTIONS.map((w) => (
        <button
          key={w.label}
          type="button"
          aria-pressed={when === w.value}
          onClick={() => pickWhen(w.value)}
          className={`h-10 shrink-0 rounded-full px-4 text-sm font-bold transition-[background-color,box-shadow] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
            when === w.value ? "bg-white shadow-[0_4px_14px_rgba(20,22,28,0.10)]" : "text-ink hover:bg-white/60"
          }`}
        >
          {w.label}
        </button>
      ))}
    </div>
  );

  const sortSelect = (id: string, className = "") => (
    <div className={`relative ${className}`}>
      <select
        id={id}
        value={sortBy}
        onChange={(e) => setSortBy(e.target.value)}
        className="h-12 w-full cursor-pointer appearance-none rounded-full border border-line bg-white pl-4 pr-10 text-sm font-bold text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        {SORT_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2">{chevron}</span>
    </div>
  );

  return (
    <>
      <Navbar />
      <main className="bg-white font-body text-ink">
        <div className="mx-auto max-w-[1440px] px-4 pb-16 pt-6 md:px-12 md:pt-9 xl:px-24">
          <h1 className="font-display text-[44px] font-bold leading-none tracking-[-0.035em] md:text-[56px]">Discover</h1>

          {/* Search: what · where · when */}
          <form
            onSubmit={submitSearch}
            className="mt-5 flex h-14 items-center rounded-full border border-line bg-white pl-1 pr-1.5 shadow-[0_14px_40px_rgba(54,105,246,0.10)] focus-within:ring-2 focus-within:ring-brand md:mt-6 md:h-[70px] md:px-2"
          >
            <label className="flex h-full min-w-0 flex-1 flex-col justify-center gap-px px-5 md:h-[54px] md:px-[22px]">
              <span className="hidden text-[11px] font-extrabold tracking-[0.08em] text-faint md:block">WHAT</span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search events, artists, venues"
                className="min-w-0 bg-transparent text-[15px] text-ink placeholder:text-faint focus:outline-none md:text-base"
              />
            </label>
            <span aria-hidden="true" className="hidden h-[34px] w-px bg-line md:block" />
            <div className="hidden h-[54px] w-[220px] flex-col justify-center gap-px px-[22px] md:flex">
              <span className="text-[11px] font-extrabold tracking-[0.08em] text-faint">WHERE</span>
              <span className="truncate text-base font-bold">{areaLabel}</span>
            </div>
            <span aria-hidden="true" className="hidden h-[34px] w-px bg-line md:block" />
            <div className="hidden h-[54px] w-[220px] flex-col justify-center gap-px px-[22px] md:flex">
              <span className="text-[11px] font-extrabold tracking-[0.08em] text-faint">WHEN</span>
              <span className="text-base font-bold">{whenLabel}</span>
            </div>
            <button
              type="submit"
              className="flex h-11 w-11 shrink-0 items-center justify-center gap-2 rounded-full bg-brand text-white transition-[filter,scale] hover:brightness-90 active:scale-[0.96] focus:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 md:h-[54px] md:w-auto md:px-7 md:text-base md:font-bold"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
                <circle cx="11" cy="11" r="7" />
                <path d="M20 20l-3.5-3.5" />
              </svg>
              <span className="hidden md:inline">Search</span>
              <span className="sr-only md:hidden">Search</span>
            </button>
          </form>

          <div className="mt-6 flex items-start gap-10 md:mt-10">
            <aside aria-label="Filters" className="hidden w-[272px] shrink-0 flex-col gap-7 rounded-3xl border border-hairline bg-white p-6 lg:flex">
              <div className="flex items-center justify-between">
                <span className="font-display text-[22px] font-bold tracking-[-0.01em]">Filters</span>
                {activeCount > 0 && (
                  <button type="button" onClick={clearAll} className="h-11 text-sm font-bold text-brand-dark hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand">
                    Clear all
                  </button>
                )}
              </div>
              {filterBody}
            </aside>

            <div className="flex min-w-0 flex-1 flex-col gap-8">
              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setFiltersOpen(true)}
                  className="flex h-12 items-center gap-2 rounded-full border border-line bg-white px-4 text-sm font-bold text-ink transition-colors hover:bg-mist focus:outline-none focus-visible:ring-2 focus-visible:ring-brand lg:hidden"
                >
                  Filters
                  {activeCount > 0 && (
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1 text-xs text-white">{activeCount}</span>
                  )}
                </button>
                <div className="order-last w-full min-w-0 md:order-none md:w-auto">{whenSwitch}</div>
                <div className="flex-1" />
                <label htmlFor="sort" className="hidden text-sm text-muted md:block">Sort</label>
                {sortSelect("sort", "min-w-[150px]")}
              </div>

              {loading ? (
                <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3" aria-busy="true">
                  {[...Array(6)].map((_, i) => (
                    <div key={i} className="flex animate-pulse flex-col gap-3">
                      <div className="h-52 rounded-[22px] bg-mist md:h-[200px]" />
                      <div className="h-4 w-1/3 rounded bg-mist" />
                      <div className="h-5 w-3/4 rounded bg-mist" />
                      <div className="h-4 w-1/2 rounded bg-mist" />
                    </div>
                  ))}
                </div>
              ) : visibleEvents.length === 0 ? (
                <div className="flex flex-col items-start gap-3 rounded-[30px] bg-mist p-8 md:p-12">
                  <p className="font-display text-2xl font-bold">No events match</p>
                  <p className="text-muted">
                    {activeCount > 0 || search ? "Remove a filter or change your search to see more." : "Nothing is on yet. Check back soon."}
                  </p>
                  {(activeCount > 0 || search) && (
                    <button
                      type="button"
                      onClick={() => {
                        clearAll();
                        if (search) router.push("/discover");
                      }}
                      className="mt-1 h-12 rounded-full bg-brand px-6 font-bold text-white transition-[filter,scale] hover:brightness-90 active:scale-[0.96]"
                    >
                      Clear filters
                    </button>
                  )}
                </div>
              ) : (
                <>
                  <p role="status" className="sr-only">{filteredEvents.length} events</p>
                  {groups.map((g) => {
                    const label = dayGroupLabel(g.day);
                    return (
                      <section key={g.day} className="flex flex-col gap-5" aria-label={`${label.label}, ${label.sub}`}>
                        <div className="flex items-baseline gap-3.5 border-b border-hairline pb-3.5">
                          <h2 className="font-display text-[26px] font-bold tracking-[-0.02em] md:text-[30px]">{label.label}</h2>
                          <span className="text-[15px] font-semibold text-muted">{label.sub}</span>
                        </div>
                        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                          {g.events.map((event) => (
                            <StackTile key={event.id} event={event} />
                          ))}
                        </div>
                      </section>
                    );
                  })}
                  {hasMore && (
                    <button
                      type="button"
                      onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                      className="h-[52px] self-center rounded-full border border-line bg-white px-7 text-[15px] font-bold transition-[background-color,scale] hover:bg-mist active:scale-[0.96] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                    >
                      Show more events
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Below desktop: the same filters in a sheet */}
        {filtersOpen && (
          <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Filters">
            <div className="absolute inset-0 bg-ink/50" onClick={() => setFiltersOpen(false)} />
            <div className="absolute inset-x-0 bottom-0 max-h-[88vh] overflow-y-auto rounded-t-[30px] bg-white px-5 pb-6 pt-4">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-display text-2xl font-bold">Filters</h2>
                <button type="button" onClick={() => setFiltersOpen(false)} aria-label="Close filters" className="flex h-11 w-11 items-center justify-center rounded-full bg-mist text-xl">
                  ×
                </button>
              </div>
              {filterBody}
              <div className="sticky bottom-0 -mx-5 mt-6 flex gap-3 border-t border-hairline bg-white px-5 pt-4">
                <button type="button" onClick={clearAll} className="h-12 rounded-full border border-line px-5 text-sm font-bold">
                  Clear all
                </button>
                <button
                  type="button"
                  onClick={() => setFiltersOpen(false)}
                  className="h-12 flex-1 rounded-full bg-brand text-sm font-bold text-white transition-[filter,scale] hover:brightness-90 active:scale-[0.96]"
                >
                  Show {filteredEvents.length} {filteredEvents.length === 1 ? "event" : "events"}
                </button>
              </div>
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
    <Suspense fallback={<div className="min-h-screen bg-white" />}>
      <DiscoverPageContent />
    </Suspense>
  );
}
