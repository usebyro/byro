"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import EventImage from "@/components/brand/EventImage";
import API from "@/services/api";
import { categoryTone, dayParts, eventInitials, formatTime, isPast } from "@/lib/eventFormat";

const INKS = ["#3669F6", "#D0668E", "#2F9E6E", "#C9971C", "#1F2A44"];
const TINTS = ["#E6F2FC", "#FCECEE", "#E9F7EF", "#FFFDE9", "#F3F6FB"];

const hashOf = (s) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);

/** A community is an organiser's public page. Group public events by organiser handle. */
function buildCommunities(events, profiles) {
  const map = new Map();
  for (const e of events) {
    const handle = e.owner_handle;
    if (!handle) continue;
    if (!map.has(handle)) map.set(handle, { handle, events: [] });
    map.get(handle).events.push(e);
  }
  return [...map.values()].map((c) => {
    const profile = profiles[c.handle] || {};
    const upcoming = c.events
      .filter((e) => !isPast(e))
      .sort((a, b) => (a.day + a.time_from).localeCompare(b.day + b.time_from));
    const cover = upcoming.find((e) => e.event_image_url) || c.events.find((e) => e.event_image_url) || null;
    const name = profile.display_name || c.events[0]?.hosted_by || c.handle;
    const slot = hashOf(c.handle) % INKS.length;
    return {
      handle: c.handle,
      name,
      bio: profile.bio || "",
      location: profile.location || "",
      avatar: profile.avatar_url || null,
      total: c.events.length,
      upcoming,
      next: upcoming[0] || null,
      cover,
      categories: [...new Set(c.events.map((e) => e.category).filter(Boolean))],
      ink: INKS[slot],
      tint: TINTS[slot],
    };
  });
}

function Avatar({ community, size, className = "" }) {
  return (
    <span
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full border-4 border-white font-display font-extrabold text-white ${className}`}
      style={{ width: size, height: size, background: community.ink, fontSize: size * 0.32 }}
    >
      {community.avatar ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={community.avatar} alt="" className="h-full w-full object-cover" />
      ) : (
        eventInitials(community.name)
      )}
    </span>
  );
}

export default function CommunitiesPage() {
  const [communities, setCommunities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [interest, setInterest] = useState("all");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await API.getEvents({ sort: "recent" });
        const events = Array.isArray(data) ? data : data?.events || data?.results || data?.data || [];
        const handles = [...new Set(events.map((e) => e.owner_handle).filter(Boolean))].slice(0, 24);
        const entries = await Promise.all(
          handles.map((h) =>
            API.getPublicProfile(h)
              .then((p) => [h, p])
              .catch(() => [h, null])
          )
        );
        const profiles = Object.fromEntries(entries.filter(([, p]) => p));
        if (!cancelled) setCommunities(buildCommunities(events, profiles));
      } catch (err) {
        console.error(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const interests = useMemo(() => {
    const cats = [...new Set(communities.flatMap((c) => c.categories))];
    return [{ value: "all", label: "All" }, ...cats.map((v) => ({ value: v, label: categoryTone(v).label }))];
  }, [communities]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return communities
      .filter((c) => interest === "all" || c.categories.includes(interest))
      .filter((c) => !q || `${c.name} ${c.handle} ${c.bio} ${c.location}`.toLowerCase().includes(q))
      .sort((a, b) => b.upcoming.length - a.upcoming.length || b.total - a.total);
  }, [communities, query, interest]);

  const [featured, ...rest] = filtered;

  return (
    <>
      <Navbar />
      <main className="bg-white font-body text-ink">
        <div className="mx-auto max-w-[1440px] px-4 pb-16 pt-8 md:px-12 md:pt-10 xl:px-24">
          <section className="flex flex-col gap-6 md:flex-row md:items-end md:gap-10">
            <div className="flex flex-1 flex-col gap-3.5">
              <h1 className="font-display text-[48px] font-bold leading-[0.98] tracking-[-0.045em] md:text-[72px]">
                Find your <span className="text-brand">people.</span>
              </h1>
              <p className="max-w-[520px] text-pretty text-base leading-[1.6] text-muted md:text-lg">
                Meet the crews behind the nights you love. See what they&apos;re planning next and what you missed.
              </p>
            </div>
            <div className="flex h-14 w-full items-center gap-3 rounded-full border border-line bg-white pl-[22px] pr-2 shadow-[0_14px_40px_rgba(54,105,246,0.10)] focus-within:ring-2 focus-within:ring-brand md:h-[62px] md:w-[520px]">
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#8A91A0" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <circle cx="11" cy="11" r="7" />
                <path d="M20 20l-3.5-3.5" />
              </svg>
              <label htmlFor="community-search" className="sr-only">Search communities</label>
              <input
                id="community-search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search run clubs, collectives, meetups"
                className="min-w-0 flex-1 bg-transparent text-[15px] text-ink placeholder:text-faint focus:outline-none"
              />
            </div>
          </section>

          {interests.length > 1 && (
            <div role="group" aria-label="Interests" className="-mx-4 mt-7 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:overflow-visible md:px-0">
              {interests.map((i) => (
                <button
                  key={i.value}
                  type="button"
                  aria-pressed={interest === i.value}
                  onClick={() => setInterest(i.value)}
                  className={`h-[42px] shrink-0 rounded-full px-4 text-sm font-bold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
                    interest === i.value ? "bg-ink text-white" : "bg-mist text-ink hover:bg-line"
                  }`}
                >
                  {i.label}
                </button>
              ))}
            </div>
          )}

          {loading ? (
            <div className="mt-8 grid gap-6 md:grid-cols-2 lg:grid-cols-3" aria-busy="true">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-[320px] animate-pulse rounded-[28px] bg-mist" />
              ))}
            </div>
          ) : !featured ? (
            <div className="mt-8 flex flex-col items-start gap-3 rounded-[30px] bg-mist p-8 md:p-12">
              <p className="font-display text-2xl font-bold">
                {communities.length === 0 ? "No communities yet" : "No communities match"}
              </p>
              <p className="text-muted">
                {communities.length === 0
                  ? "Communities appear here once organisers publish events."
                  : "Try a different search or interest."}
              </p>
              <Link href="/events/create" className="mt-1 flex h-12 items-center rounded-full bg-brand px-6 font-bold text-white transition-[filter,scale] hover:brightness-90 active:scale-[0.96]">
                Host an event
              </Link>
            </div>
          ) : (
            <>
              {/* Featured */}
              <section className="mt-8">
                <Link
                  href={`/u/${featured.handle}`}
                  className="flex flex-col overflow-hidden rounded-[30px] bg-sky focus:outline-none focus-visible:ring-4 focus-visible:ring-brand/40 md:min-h-[340px] md:flex-row md:rounded-[36px]"
                  style={{ background: featured.tint }}
                >
                  <div className="relative h-56 shrink-0 md:h-auto md:w-[45%]">
                    {featured.cover ? (
                      <EventImage event={featured.cover} sizes="(min-width: 768px) 45vw, 100vw" />
                    ) : (
                      <div className="absolute inset-0" style={{ background: featured.ink, opacity: 0.15 }} />
                    )}
                  </div>
                  <div className="flex flex-1 flex-col gap-3 p-6 md:px-11 md:py-10">
                    <span className="flex h-7 items-center self-start rounded-full bg-white px-3 text-xs font-extrabold tracking-[0.08em] text-brand">
                      MOST ACTIVE
                    </span>
                    <div className="flex items-center gap-3.5">
                      <Avatar community={featured} size={60} />
                      <div className="flex min-w-0 flex-col">
                        <span className="truncate font-display text-[26px] font-bold tracking-[-0.02em] md:text-[32px]">{featured.name}</span>
                        <span className="truncate text-sm text-muted">
                          @{featured.handle}
                          {featured.location ? ` · ${featured.location}` : ""}
                        </span>
                      </div>
                    </div>
                    {featured.bio && <p className="line-clamp-3 max-w-[480px] text-base leading-[1.55] text-[#3B4252]">{featured.bio}</p>}
                    <div className="flex-1" />
                    <div className="flex flex-wrap items-center gap-x-[18px] gap-y-3 text-[15px]">
                      <span>
                        <b>{featured.total}</b> <span className="text-muted">{featured.total === 1 ? "event" : "events"} hosted</span>
                      </span>
                      {featured.next && (
                        <span>
                          <b>Next:</b>{" "}
                          <span className="text-muted">
                            {dayParts(featured.next.day).short} · {formatTime(featured.next.time_from)}
                          </span>
                        </span>
                      )}
                      <span className="ml-auto flex h-[46px] items-center rounded-full bg-brand px-[22px] text-[15px] font-bold text-white">
                        View community
                      </span>
                    </div>
                  </div>
                </Link>
              </section>

              {rest.length > 0 && (
                <section className="mt-12 flex flex-col gap-5 md:mt-14">
                  <h2 className="font-display text-[28px] font-bold tracking-[-0.025em] md:text-[34px]">All communities</h2>
                  <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {rest.map((c) => (
                      <article key={c.handle} className="flex flex-col overflow-hidden rounded-[28px] border border-hairline bg-white">
                        <div className="relative h-[120px]" style={{ background: c.tint }}>
                          {c.cover && <EventImage event={c.cover} sizes="(min-width: 1024px) 30vw, 100vw" className="opacity-90" />}
                          <Avatar community={c} size={64} className="absolute -bottom-8 left-[22px]" />
                        </div>
                        <div className="flex flex-1 flex-col gap-2 px-[22px] pb-[22px] pt-[42px]">
                          <Link
                            href={`/u/${c.handle}`}
                            className="font-display text-[22px] font-bold tracking-[-0.01em] hover:text-brand focus:outline-none focus-visible:underline"
                          >
                            {c.name}
                          </Link>
                          <span className="text-[13px] text-muted">
                            @{c.handle}
                            {c.location ? ` · ${c.location}` : ""}
                          </span>
                          {c.bio && <p className="line-clamp-3 text-[15px] leading-[1.5] text-[#3B4252]">{c.bio}</p>}
                          <div className="mt-1 flex flex-wrap gap-2">
                            <span className="flex h-[30px] items-center rounded-full bg-mist px-2.5 text-xs font-bold">
                              {c.total} {c.total === 1 ? "event" : "events"}
                            </span>
                            <span className="flex h-[30px] items-center rounded-full px-2.5 text-xs font-bold" style={{ background: c.tint }}>
                              {c.upcoming.length} upcoming
                            </span>
                          </div>
                          <div className="flex-1" />
                          <Link
                            href={`/u/${c.handle}`}
                            className="mt-2.5 flex h-[46px] items-center justify-center rounded-full border border-line text-[15px] font-bold transition-[background-color,scale] hover:bg-mist active:scale-[0.96] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                          >
                            View community
                          </Link>
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
