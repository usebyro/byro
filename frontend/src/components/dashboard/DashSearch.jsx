"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import API from "@/services/api";

// The header search from the V2 design: jumps to a dashboard page or one of your events.
// ⌘K / Ctrl+K focuses it from anywhere in the dashboard.
const PAGES = [
  { label: "Overview", href: "/dashboard/overview" },
  { label: "Events", href: "/dashboard/events" },
  { label: "Create event", href: "/dashboard/events/create" },
  { label: "Community", href: "/dashboard/community" },
  { label: "Messages", href: "/dashboard/messages" },
  { label: "Merch", href: "/dashboard/merch" },
  { label: "Payouts", href: "/dashboard/payouts" },
  { label: "Profile", href: "/dashboard/profile" },
  { label: "Check in", href: "/dashboard/check-in" },
];

export default function DashSearch() {
  const router = useRouter();
  const inputRef = useRef(null);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [events, setEvents] = useState(null);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Events are only fetched the first time someone searches.
  useEffect(() => {
    if (!open || events) return;
    API.getDashboard()
      .then((d) => setEvents([...(d?.hosting?.upcoming || []), ...(d?.hosting?.past || [])]))
      .catch(() => setEvents([]));
  }, [open, events]);

  const results = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return [];
    const pages = PAGES.filter((p) => p.label.toLowerCase().includes(term)).map((p) => ({ ...p, kind: "Page" }));
    const evs = (events || [])
      .filter((e) => e.name?.toLowerCase().includes(term))
      .slice(0, 6)
      .map((e) => ({ label: e.name, href: `/dashboard/events/${e.slug}`, kind: e.is_draft ? "Draft" : "Event" }));
    return [...evs, ...pages].slice(0, 8);
  }, [q, events]);

  const go = (r) => {
    setQ("");
    setOpen(false);
    document.activeElement?.blur?.();
    router.push(r.href);
  };

  const onKeyDown = (e) => {
    if (e.key === "Escape") {
      setQ("");
      inputRef.current?.blur();
    } else if (e.key === "ArrowDown" && results.length) {
      e.preventDefault();
      setActive((a) => (a + 1) % results.length);
    } else if (e.key === "ArrowUp" && results.length) {
      e.preventDefault();
      setActive((a) => (a - 1 + results.length) % results.length);
    } else if (e.key === "Enter" && results[active]) {
      e.preventDefault();
      go(results[active]);
    }
  };

  const showList = open && q.trim();

  return (
    <div className="relative min-w-0 flex-[0_1_380px]">
      <label className="v-search border-transparent">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5B6272" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.5-3.5" />
        </svg>
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setActive(0);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={onKeyDown}
          placeholder="Search events and pages…"
          aria-label="Search the dashboard"
          role="combobox"
          aria-expanded={Boolean(showList)}
          aria-controls="dash-search-list"
          aria-autocomplete="list"
        />
        <kbd className="hidden rounded-md border border-line bg-white px-1.5 py-px text-xs font-bold text-faint sm:inline">⌘K</kbd>
      </label>
      {showList && (
        <div id="dash-search-list" role="listbox" className="v-card v-pop absolute left-0 right-0 top-12 z-40 flex flex-col p-1.5" style={{ transformOrigin: "top left" }}>
          {results.length === 0 ? (
            <p className="v-hint px-3 py-2.5">{events ? "Nothing matches." : "Searching…"}</p>
          ) : (
            results.map((r, i) => (
              <button
                key={r.href + r.label}
                type="button"
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => go(r)}
                onMouseEnter={() => setActive(i)}
                className={`flex h-10 items-center gap-3 rounded-[10px] px-3 text-left text-sm font-bold ${i === active ? "bg-[#F3F6FB]" : ""}`}
              >
                <span className="min-w-0 flex-1 truncate">{r.label}</span>
                <span className="text-xs font-semibold text-faint">{r.kind}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
