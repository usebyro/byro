"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import EventImage from "@/components/brand/EventImage";
import FollowButton from "@/components/community/FollowButton";
import API from "@/services/api";
import { categoryTone, dayParts, eventInitials, formatTime } from "@/lib/eventFormat";

const INKS = ["#3669F6", "#D0668E", "#2F9E6E", "#C9971C", "#1F2A44"];
const TINTS = ["#E6F2FC", "#FCECEE", "#E9F7EF", "#FFFDE9", "#F3F6FB"];

const hashOf = (s) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);

/** Shape one row of /api/communities/ for the cards. */
function toCommunity(row) {
  const slot = hashOf(row.handle) % INKS.length;
  return {
    handle: row.handle,
    name: row.name,
    bio: row.bio || "",
    location: row.location || "",
    avatar: row.avatar_url || null,
    followers: row.followers ?? 0,
    attendees: row.attendees ?? 0,
    regulars: row.regulars ?? 0,
    isFollowing: !!row.is_following,
    total: row.events_total ?? 0,
    upcomingCount: row.upcoming_count ?? 0,
    next: row.next_event || null,
    cover: row.cover_url ? { name: row.name, category: "other", event_image_url: row.cover_url } : null,
    categories: row.categories || [],
    ink: INKS[slot],
    tint: TINTS[slot],
  };
}

const PAGE_SIZE = 12;

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
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [interest, setInterest] = useState("all");
  const [categories, setCategories] = useState([]);

  // Search waits for a pause in typing, so each keystroke is not a request.
  useEffect(() => {
    const t = setTimeout(() => setSearch(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    API.getCommunities({ q: search || undefined, category: interest === "all" ? undefined : interest, page_size: PAGE_SIZE })
      .then((data) => {
        if (cancelled) return;
        const rows = (data.results || []).map(toCommunity);
        setCommunities(rows);
        setTotal(data.total || 0);
        setPage(1);
        // Remember the interests seen on the unfiltered list so the chips don't vanish when one is picked.
        if (!search && interest === "all") setCategories([...new Set(rows.flatMap((c) => c.categories))]);
      })
      .catch((err) => console.error(err))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [search, interest]);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const data = await API.getCommunities({
        q: search || undefined,
        category: interest === "all" ? undefined : interest,
        page: page + 1,
        page_size: PAGE_SIZE,
      });
      setCommunities((list) => [...list, ...(data.results || []).map(toCommunity)]);
      setPage((p) => p + 1);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingMore(false);
    }
  };

  const interests = useMemo(
    () => [{ value: "all", label: "All" }, ...categories.map((v) => ({ value: v, label: categoryTone(v).label }))],
    [categories]
  );
  const filtered = communities;

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
                {!search && interest === "all" ? "No communities yet" : "No communities match"}
              </p>
              <p className="text-muted">
                {!search && interest === "all"
                  ? "Communities appear here once organisers publish events."
                  : "Try a different search or interest."}
              </p>
              <Link href="/events/create" className="mt-1 flex h-12 items-center rounded-full bg-brand px-6 font-bold text-white transition-[filter,scale] hover:brightness-90 active:scale-[0.96]">
                Host an event
              </Link>
            </div>
          ) : (
            <>
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
                      FEATURED
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
                        <b>{featured.followers.toLocaleString()}</b>{" "}
                        <span className="text-muted">{featured.followers === 1 ? "follower" : "followers"}</span>
                      </span>
                      <span>
                        <b>{featured.total}</b> <span className="text-muted">{featured.total === 1 ? "event" : "events"} hosted</span>
                      </span>
                      {featured.attendees > 0 && (
                        <span>
                          <b>{featured.attendees.toLocaleString()}</b>{" "}
                          <span className="text-muted">{featured.attendees === 1 ? "has attended" : "have attended"}</span>
                          {featured.regulars > 0 && <span className="text-muted"> · {featured.regulars} regular{featured.regulars === 1 ? "" : "s"}</span>}
                        </span>
                      )}
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
                              {c.followers.toLocaleString()} {c.followers === 1 ? "follower" : "followers"}
                            </span>
                            <span className="flex h-[30px] items-center rounded-full bg-mist px-2.5 text-xs font-bold">
                              {c.total} {c.total === 1 ? "event" : "events"}
                            </span>
                            {c.attendees > 0 && (
                              <span className="flex h-[30px] items-center rounded-full bg-mist px-2.5 text-xs font-bold">
                                {c.attendees.toLocaleString()} {c.attendees === 1 ? "has" : "have"} attended
                              </span>
                            )}
                            <span className="flex h-[30px] items-center rounded-full px-2.5 text-xs font-bold" style={{ background: c.tint }}>
                              {c.upcomingCount} upcoming
                            </span>
                          </div>
                          <div className="flex-1" />
                          <div className="mt-2.5 flex items-center gap-2">
                            <FollowButton
                              handle={c.handle}
                              initialFollowing={c.isFollowing}
                              onChange={(count) =>
                                setCommunities((list) => list.map((x) => (x.handle === c.handle ? { ...x, followers: count } : x)))
                              }
                              className="h-[46px] flex-1 text-[15px]"
                            />
                            <Link
                              href={`/u/${c.handle}`}
                              aria-label={`Open ${c.name}`}
                              className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-full border border-line transition-[background-color,scale] hover:bg-mist active:scale-[0.96] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                            >
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="M5 12h14M13 6l6 6-6 6" />
                              </svg>
                            </Link>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                  {communities.length < total && (
                    <button
                      type="button"
                      onClick={loadMore}
                      disabled={loadingMore}
                      className="mt-2 flex h-[50px] items-center justify-center self-center rounded-full border border-line px-8 text-[15px] font-bold transition-[background-color,scale] hover:bg-mist active:scale-[0.96] disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                    >
                      {loadingMore ? "Loading…" : "Show more communities"}
                    </button>
                  )}
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
