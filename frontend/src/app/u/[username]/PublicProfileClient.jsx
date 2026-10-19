"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { FaXTwitter, FaInstagram, FaLinkedinIn, FaTelegram, FaWhatsapp } from "react-icons/fa6";
import API from "@/services/api";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import ShareMenu from "@/components/ShareMenu";
import FollowButton from "@/components/community/FollowButton";
import VerifiedBadge from "@/components/community/VerifiedBadge";
import ReportButton from "@/components/ReportButton";
import EventImage from "@/components/brand/EventImage";
import MerchSlideshow from "@/components/merch/MerchSlideshow";
import Delayed from "@/components/dashboard/v2/Delayed";
import { categoryTone, dayParts, eventInitials, formatTime, priceLabel } from "@/lib/eventFormat";

const PAST_PAGE = 6;

// What the organiser picked for their community; matches the backend's UserProfile.CATEGORY_CHOICES.
const CATEGORY_LABELS = { tech: "Tech", music: "Music", fitness: "Fitness", faith: "Faith", food: "Food", art_culture: "Art and culture" };

const socialLink =
  "flex h-10 w-10 items-center justify-center rounded-full border border-line text-ink transition-[background-color,scale] hover:bg-mist active:scale-[0.96] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand";

export default function PublicProfileClient({ username }) {
  const [profile, setProfile] = useState(null);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("upcoming");
  const [followers, setFollowers] = useState(0);
  const [page, setPage] = useState("events"); // events | merch
  const [openMerch, setOpenMerch] = useState(null);

  // Arrow keys move between the Events and Merch tabs, and focus follows.
  const onTabKey = (e) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const next = page === "events" ? "merch" : "events";
    setPage(next);
    document.getElementById(`tab-${next}`)?.focus();
  };
  const [showAllPast, setShowAllPast] = useState(false);

  useEffect(() => {
    if (!username) return;

    const fetchData = async () => {
      try {
        setLoading(true);
        // Fetch public profile
        const profileData = await API.getPublicProfile(username);
        setProfile(profileData);
        setFollowers(profileData.followers_count ?? 0);

        // Fetch all public events to filter client-side
        const eventsRes = await API.getEvents();
        const allEvents = Array.isArray(eventsRes)
          ? eventsRes
          : Array.isArray(eventsRes?.results)
          ? eventsRes.results
          : [];

        // This community's events: matched by its handle. Email addresses are private, so the
        // server doesn't send them and the page doesn't rely on them.
        const handle = (profileData.handle || username || "").toLowerCase();
        const filtered = allEvents.filter((evt) => (evt.owner_handle || "").toLowerCase() === handle);

        setEvents(filtered);
      } catch (err) {
        console.error(err);
        setError(err.message || "Failed to load profile");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [username]);

  // Separate upcoming and past events
  const { upcomingEvents, pastEvents } = useMemo(() => {
    const now = new Date();
    const upcoming = [];
    const past = [];

    events.forEach((evt) => {
      const evtDate = new Date(`${evt.day}T${evt.time_from || "00:00:00"}`);
      if (evtDate >= now) upcoming.push(evt);
      else past.push(evt);
    });

    upcoming.sort((a, b) => new Date(a.day) - new Date(b.day));
    past.sort((a, b) => new Date(b.day) - new Date(a.day));

    return { upcomingEvents: upcoming, pastEvents: past };
  }, [events]);

  // Shaped like the loaded page (board 35): cover, avatar, name, stats, then the real tabs.
  if (loading) {
    return (
      <div className="flex min-h-screen flex-col bg-white font-body text-ink">
        <Navbar />
        <Delayed slowAfter={null}>
          <main aria-busy="true" className="mx-auto flex w-full max-w-[1120px] flex-col gap-12 px-4 pb-16 pt-6 md:gap-14 md:px-8 md:pt-8">
            <section className="flex flex-col">
              <div className="h-[180px] rounded-[20px] bg-[#EEF1F6] animate-pulse motion-reduce:animate-none md:h-[280px]" />
              <div className="relative z-10 -mt-9 flex items-end gap-3 px-2 md:-mt-11 md:px-8">
                <span className="h-[88px] w-[88px] shrink-0 rounded-full border-4 border-white bg-[#E3E8F0] md:h-[104px] md:w-[104px]" />
                <span className="flex-1" />
                <span className="h-12 w-12 rounded-full bg-[#EEF1F6] animate-pulse motion-reduce:animate-none" />
                <span className="h-12 w-[124px] rounded-full bg-[#EEF1F6] animate-pulse motion-reduce:animate-none" />
              </div>
              <div className="flex flex-col gap-3 px-2 pt-4 md:px-8">
                <span className="h-9 w-full max-w-[360px] rounded-xl bg-[#EEF1F6] animate-pulse motion-reduce:animate-none md:h-10" />
                <span className="h-3.5 w-48 rounded bg-[#EEF1F6] animate-pulse motion-reduce:animate-none" />
                <span className="h-3.5 w-full max-w-[560px] rounded bg-[#EEF1F6] animate-pulse motion-reduce:animate-none" />
                <span className="h-3.5 w-2/3 max-w-[420px] rounded bg-[#EEF1F6] animate-pulse motion-reduce:animate-none" />
                <span className="mt-2 h-5 w-64 rounded bg-[#EEF1F6] animate-pulse motion-reduce:animate-none" />
                <span className="mt-1 flex gap-2.5">
                  {[0, 1, 2, 3].map((i) => (
                    <span key={i} className="h-10 w-10 rounded-full bg-[#EEF1F6] animate-pulse motion-reduce:animate-none" />
                  ))}
                </span>
              </div>
            </section>
            <div className="flex flex-col gap-6">
              <div className="flex gap-8 border-b border-line px-1">
                <span className="-mb-px flex h-[52px] items-center border-b-2 border-ink text-base font-bold">Events</span>
                <span className="flex h-[52px] items-center text-base font-bold text-muted">Merch</span>
              </div>
              {[0, 1].map((i) => (
                <div key={i} className="flex items-center gap-5">
                  <span className="h-[96px] w-[152px] shrink-0 rounded-2xl bg-[#EEF1F6] animate-pulse motion-reduce:animate-none" />
                  <span className="flex flex-1 flex-col gap-2.5">
                    <span className="h-3 w-24 rounded bg-[#EEF1F6] animate-pulse motion-reduce:animate-none" />
                    <span className="h-5 w-3/5 rounded bg-[#EEF1F6] animate-pulse motion-reduce:animate-none" />
                    <span className="h-3 w-2/5 rounded bg-[#EEF1F6] animate-pulse motion-reduce:animate-none" />
                  </span>
                  <span className="hidden h-11 w-[118px] rounded-full bg-[#EEF1F6] animate-pulse motion-reduce:animate-none md:block" />
                </div>
              ))}
            </div>
          </main>
        </Delayed>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="flex min-h-screen flex-col bg-white font-body text-ink">
        <Navbar />
        <div className="mx-auto flex w-full max-w-xl flex-1 flex-col items-start gap-4 px-4 pt-20 md:px-8">
          <h1 className="font-display text-[44px] font-bold leading-none tracking-[-0.04em] md:text-6xl">Page not found</h1>
          <p className="text-lg leading-relaxed text-muted">We couldn&apos;t find that organiser. The link may be wrong, or the page may have moved.</p>
          <Link href="/communities" className="mt-2 flex h-[52px] items-center rounded-full bg-brand px-7 text-base font-bold text-white transition-[filter,scale] hover:brightness-90 active:scale-[0.96]">
            Browse communities
          </Link>
        </div>
        <Footer />
      </div>
    );
  }

  const name = profile.display_name || profile.handle || username;
  const cover = profile.cover_image_url
    ? { name, category: "other", event_image_url: profile.cover_image_url }
    : upcomingEvents.find((e) => e.event_image_url) || events.find((e) => e.event_image_url) || null;
  const merchItems = profile.merch_items || [];
  const categoryLabels = [...new Set(events.map((e) => e.category).filter(Boolean))].map((c) => categoryTone(c).label);
  const meta = [profile.location, CATEGORY_LABELS[profile.category] || categoryLabels[0]].filter(Boolean).join(" · ") || `@${profile.handle || username}`;

  // Events of this community the signed-in viewer was checked in to.
  const attended = new Set(profile.viewer_attended || []);
  const attendedCount = attended.size;

  const socials = [
    profile.instagram && { label: "Instagram", href: `https://instagram.com/${profile.instagram}`, icon: <FaInstagram size={17} aria-hidden="true" /> },
    profile.whatsapp && { label: "WhatsApp group", href: /^https?:\/\//i.test(profile.whatsapp) ? profile.whatsapp : `https://${profile.whatsapp}`, icon: <FaWhatsapp size={17} aria-hidden="true" /> },
    profile.twitter && { label: "X", href: `https://x.com/${profile.twitter}`, icon: <FaXTwitter size={16} aria-hidden="true" /> },
    profile.telegram && { label: "Telegram", href: `https://t.me/${profile.telegram}`, icon: <FaTelegram size={17} aria-hidden="true" /> },
    profile.linkedin && { label: "LinkedIn", href: `https://linkedin.com/in/${profile.linkedin}`, icon: <FaLinkedinIn size={16} aria-hidden="true" /> },
    profile.website && {
      label: "Website",
      href: profile.website,
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" />
        </svg>
      ),
    },
  ].filter(Boolean);

  const visiblePast = showAllPast ? pastEvents : pastEvents.slice(0, PAST_PAGE);

  const seg = (on) =>
    `h-[38px] rounded-full px-4 text-sm font-bold text-ink transition-[background-color,box-shadow] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
      on ? "bg-white shadow-[0_4px_14px_rgba(20,22,28,0.10)]" : "hover:bg-white/60"
    }`;

  const dot = <span aria-hidden="true" className="h-1 w-1 rounded-full bg-line" />;

  return (
    <div className="flex min-h-screen flex-col bg-white font-body text-ink">
      <Navbar />

      <main className="mx-auto flex w-full max-w-[1120px] flex-1 flex-col gap-12 px-4 pb-16 pt-6 md:gap-14 md:px-8 md:pt-8">
        <section aria-label="About" className="flex flex-col">
          <div className="relative h-[180px] overflow-hidden rounded-[20px] bg-mist md:h-[280px]">
            {cover && <EventImage event={cover} sizes="(min-width: 1120px) 1056px, 100vw" priority />}
          </div>

          <div className="relative z-10 -mt-9 flex items-end gap-3 px-2 md:-mt-11 md:px-8">
            <span className="flex h-[88px] w-[88px] shrink-0 items-center justify-center overflow-hidden rounded-full border-4 border-white bg-ink font-display text-3xl font-bold text-white md:h-[104px] md:w-[104px] md:text-4xl">
              {profile.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" />
              ) : (
                eventInitials(name)
              )}
            </span>
            <div className="flex-1" />
            <ShareMenu
              url={typeof window !== "undefined" ? window.location.href : ""}
              title={name}
              campaign="profile_share"
              content={username}
              className="flex h-12 w-12 items-center justify-center rounded-full border border-line bg-white text-ink transition-[background-color,scale] hover:bg-mist active:scale-[0.96]"
              aria-label="Share community"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 4v12M7 9l5-5 5 5M5 14v5h14v-5" />
              </svg>
              <span className="sr-only">Share community</span>
            </ShareMenu>
            <FollowButton
              handle={profile.handle || username}
              initialFollowing={!!profile.is_following}
              onChange={(count) => setFollowers(count)}
              className="h-12 min-w-[124px] px-[26px] text-[15px]"
            />
          </div>

          <div className="flex flex-col gap-2.5 px-2 pt-4 md:px-8">
            <h1 className="text-balance font-display text-[34px] font-bold leading-none tracking-[-0.035em] md:text-[44px]">
              {name}
              {profile.verified && <VerifiedBadge size={28} className="ml-2 -mt-1" />}
            </h1>
            <span className="text-[15px] text-muted">{meta}</span>
            {profile.bio?.trim() && (
              <p className="max-w-[62ch] text-pretty text-[17px] leading-[1.55] text-[#3B4252]">{profile.bio}</p>
            )}

            <div className="mt-2 flex flex-wrap items-center gap-x-3.5 gap-y-3">
              <span className="text-[15px] text-muted">
                <b className="font-display text-xl font-bold tracking-[-0.01em] text-ink">{followers.toLocaleString()}</b>{" "}
                {followers === 1 ? "follower" : "followers"}
              </span>
              {dot}
              <span className="text-[15px] text-muted">
                <b className="font-display text-xl font-bold tracking-[-0.01em] text-ink">{events.length}</b>{" "}
                {events.length === 1 ? "event" : "events"}
              </span>
              {attendedCount > 0 && (
                <>
                  {dot}
                  <Link
                    href="/profile"
                    className="flex items-center gap-2 text-[15px] font-bold text-brand-dark transition-[scale] active:scale-[0.97] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  >
                    <svg width="26" height="26" viewBox="0 0 100 100" aria-hidden="true" style={{ transform: "rotate(-10deg)" }}>
                      <circle cx="50" cy="50" r="44" fill="none" stroke="#3669F6" strokeWidth="6" />
                      <circle cx="50" cy="50" r="33" fill="none" stroke="#3669F6" strokeWidth="3.5" strokeDasharray="6 6" />
                      <text x="50" y="64" textAnchor="middle" fontFamily="inherit" fontSize="40" fontWeight="800" fill="#3669F6">
                        {attendedCount}
                      </text>
                    </svg>
                    You&apos;ve been to {attendedCount}
                  </Link>
                </>
              )}
              <div className="flex-1" />
              {socials.length > 0 && (
                <div className="flex gap-2">
                  {socials.map((s) => (
                    <a key={s.label} href={s.href} target="_blank" rel="noopener noreferrer" aria-label={s.label} title={s.label} className={socialLink}>
                      {s.icon}
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>

        <div className="flex flex-col gap-6">
          <div role="tablist" aria-label="Community sections" className="flex gap-8 border-b border-line px-1">
              {[
                { id: "events", label: "Events", count: events.length },
                { id: "merch", label: "Merch", count: merchItems.length },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  id={`tab-${t.id}`}
                  aria-selected={page === t.id}
                  aria-controls={`panel-${t.id}`}
                  tabIndex={page === t.id ? 0 : -1}
                  onClick={() => setPage(t.id)}
                  onKeyDown={onTabKey}
                  className={`-mb-px h-[52px] border-b-2 text-base font-bold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
                    page === t.id ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink"
                  }`}
                >
                  {t.label} <span className="font-semibold text-muted">{t.count}</span>
                </button>
              ))}
            </div>

          {page === "events" && (
            <section
              id="panel-events"
              role="tabpanel"
              aria-labelledby="tab-events"
              className="flex flex-col gap-6"
            >
              <div className="flex">
                <div role="group" aria-label="Which events" className="flex gap-0.5 rounded-full bg-mist p-1">
                  <button type="button" aria-pressed={tab === "upcoming"} onClick={() => setTab("upcoming")} className={seg(tab === "upcoming")}>
                    Upcoming · {upcomingEvents.length}
                  </button>
                  <button type="button" aria-pressed={tab === "past"} onClick={() => setTab("past")} className={seg(tab === "past")}>
                    Past · {pastEvents.length}
                  </button>
                </div>
              </div>

              {tab === "upcoming" &&
                (upcomingEvents.length > 0 ? (
                  <div className="flex flex-col border-b border-hairline">
                    {upcomingEvents.map((evt) => {
                      const parts = dayParts(evt.day);
                      const free = priceLabel(evt) === "Free";
                      return (
                        <Link
                          key={evt.slug}
                          href={`/discover/${evt.slug}`}
                          className="flex items-center gap-4 border-t border-hairline py-4 transition-[scale] active:scale-[0.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand md:gap-5"
                        >
                          <div className="relative h-20 w-28 shrink-0 overflow-hidden rounded-xl md:h-24 md:w-[152px]">
                            <EventImage event={evt} sizes="152px" />
                          </div>
                          <div className="flex min-w-0 flex-1 flex-col gap-1">
                            <span className="text-sm font-bold text-brand-dark">
                              {parts.short} · {formatTime(evt.time_from)}
                            </span>
                            <span className="font-display text-lg font-bold leading-tight tracking-[-0.02em] md:text-[22px]">{evt.name}</span>
                            <span className="text-sm text-muted">
                              {evt.location}
                              <span className="sm:hidden"> · {priceLabel(evt)}</span>
                            </span>
                          </div>
                          <span className="hidden whitespace-nowrap text-[15px] font-bold sm:block">{priceLabel(evt)}</span>
                          <span className="hidden h-11 items-center whitespace-nowrap rounded-full bg-brand px-5 text-[15px] font-bold text-white sm:flex">
                            {free ? "Register" : "Get tickets"}
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                ) : (
                  <EmptyState message="Nothing coming up right now." />
                ))}

              {tab === "past" &&
                (pastEvents.length > 0 ? (
                  <div className="flex flex-col gap-7">
                    <div className="grid gap-x-5 gap-y-7 sm:grid-cols-2 lg:grid-cols-3">
                      {visiblePast.map((evt) => (
                        <Link
                          key={evt.slug}
                          href={`/discover/${evt.slug}`}
                          className="flex flex-col gap-2.5 transition-[scale] active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                        >
                          <div className="relative h-[200px] overflow-hidden rounded-[20px]">
                            <EventImage event={evt} sizes="(min-width: 1024px) 352px, 100vw" />
                          </div>
                          <div className="flex items-baseline justify-between gap-2.5">
                            <span className="text-base font-extrabold">{evt.name}</span>
                            <span className="whitespace-nowrap text-sm text-muted">{dayParts(evt.day).dayMonth}</span>
                          </div>
                          {attended.has(evt.slug) && <span className="-mt-1.5 text-[13px] font-bold text-brand-dark">You were there</span>}
                        </Link>
                      ))}
                    </div>
                    {!showAllPast && pastEvents.length > PAST_PAGE && (
                      <button
                        type="button"
                        onClick={() => setShowAllPast(true)}
                        className="flex h-11 items-center self-center rounded-full border border-line px-5 text-[15px] font-bold transition-[background-color,scale] hover:bg-mist active:scale-[0.96] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                      >
                        See all {pastEvents.length} past events
                      </button>
                    )}
                  </div>
                ) : (
                  <EmptyState message="No past events yet." />
                ))}
            </section>
          )}

          {page === "merch" && (
            <section id="panel-merch" role="tabpanel" aria-labelledby="tab-merch">
              {merchItems.length === 0 ? (
                <p className="rounded-3xl bg-paper px-6 py-10 text-center text-[15px] text-muted">
                  No merch yet. When {name} adds something to buy, it shows up here.
                </p>
              ) : (
                <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                  {merchItems.map((item) => (
                    <MerchTile key={item.id} item={item} onOpen={setOpenMerch} />
                  ))}
                </ul>
              )}
            </section>
          )}
          {openMerch && <MerchDialog item={openMerch} storeName={name} onClose={() => setOpenMerch(null)} />}
        </div>
        <div className="flex justify-center pt-2">
          <ReportButton target="community" handle={profile.handle || username} name={name} />
        </div>
      </main>

      <Footer />
    </div>
  );
}

function EmptyState({ message }) {
  return (
    <div className="flex flex-col items-start gap-2 rounded-[30px] bg-mist p-8 md:p-10">
      <p className="font-display text-xl font-bold">{message}</p>
      <Link href="/discover" className="text-[15px] font-bold text-brand hover:text-brand-dark">
        Browse events
      </Link>
    </div>
  );
}

/** One merch item: a photo on a neutral tile, then name and price. Opens the organiser's store when there is one. */
const merchPrice = (item) => (item.price ? `₦${Number(item.price).toLocaleString("en-NG")}` : "Price on request");
const merchPhotos = (item) => (item.photos?.length ? item.photos.map((p) => p.url) : item.image_url ? [item.image_url] : []);
const merchStock = (item) => {
  const hasStock = item.stock !== null && item.stock !== undefined;
  if (!hasStock) return null;
  if (item.stock <= 0) return "Sold out";
  return item.stock <= 5 ? `Only ${item.stock} left` : null;
};

const bag = (
  <span className="flex h-full items-center justify-center text-[#3B4252]">
    <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 8h14l-1 13H6zM9 8V6a3 3 0 0 1 6 0v2" />
    </svg>
  </span>
);

// A tile opens a preview first (board 8c); buying happens on the organiser's own store.
function MerchTile({ item, onOpen }) {
  const stock = merchStock(item);
  const photos = merchPhotos(item);
  const picture = (
    <MerchSlideshow photos={photos} alt={item.name} className="h-[200px] rounded-[20px] bg-mist" fallback={bag}>
      {stock && <span className="absolute left-3 top-3 flex h-7 items-center rounded-full bg-white px-2.5 text-xs font-extrabold">{stock}</span>}
    </MerchSlideshow>
  );
  const label = (
    <span className="flex items-baseline justify-between gap-2.5">
      <span className="text-base font-extrabold group-hover:underline">{item.name}</span>
      <span className="whitespace-nowrap text-[15px] font-bold">{merchPrice(item)}</span>
    </span>
  );
  const open = (children) => (
    <button
      type="button"
      onClick={() => onOpen(item)}
      aria-label={`${item.name}, ${merchPrice(item)}${stock ? `, ${stock}` : ""}`}
      className="group flex w-full flex-col gap-2.5 border-0 bg-transparent p-0 text-left text-ink transition-[scale] active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
    >
      {children}
    </button>
  );

  // Several photos: the slideshow has its own buttons, so only the name and price open the preview.
  if (photos.length > 1) {
    return (
      <li className="flex flex-col gap-2.5">
        {picture}
        {open(label)}
      </li>
    );
  }
  return (
    <li>
      {open(
        <>
          <span className="block overflow-hidden rounded-[20px] [&_img]:transition-transform [&_img]:duration-300 group-hover:[&_img]:scale-[1.03] motion-reduce:[&_img]:transition-none">
            {picture}
          </span>
          {label}
        </>
      )}
    </li>
  );
}

function MerchDialog({ item, storeName, onClose }) {
  const stock = merchStock(item);
  const soldOut = stock === "Sold out";
  const closeRef = useRef(null);

  useEffect(() => {
    const opener = document.activeElement;
    closeRef.current?.focus();
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      opener?.focus?.();
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 border-0 bg-[rgba(20,22,28,.4)]" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="merch-title"
        className="relative flex max-h-[92dvh] w-full flex-col gap-4 overflow-y-auto rounded-t-[24px] bg-white p-5 shadow-[0_24px_60px_rgba(20,22,28,0.22)] sm:w-[440px] sm:rounded-[24px]"
      >
        <div className="relative">
          <MerchSlideshow photos={merchPhotos(item)} alt={item.name} className="h-[300px] rounded-[18px] bg-mist" fallback={bag} />
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full border-0 bg-white text-ink shadow-[0_4px_14px_rgba(20,22,28,0.12)] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="merch-title" className="font-display text-2xl font-bold leading-tight">{item.name}</h2>
          <span className="whitespace-nowrap text-lg font-bold">{merchPrice(item)}</span>
        </div>
        {item.description?.trim() && <p className="text-[15px] leading-[1.55] text-[#3B4252]">{item.description}</p>}
        {stock && <p className={`text-sm font-bold ${soldOut ? "text-[#B42318]" : "text-[#8A5A00]"}`}>{stock}</p>}
        {item.purchase_link && !soldOut ? (
          <>
            <a
              href={item.purchase_link}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-[52px] items-center justify-center gap-2 rounded-full bg-brand text-base font-bold text-white transition-[filter,scale] hover:brightness-90 active:scale-[0.97]"
            >
              Buy
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M7 17L17 7M9 7h8v8" />
              </svg>
              <span className="sr-only">(opens {storeName}&apos;s store)</span>
            </a>
            <p className="text-center text-[13px] text-muted">You&apos;ll pay on {storeName}&apos;s store.</p>
          </>
        ) : (
          <p className="text-center text-[13px] text-muted">
            {soldOut ? "This item is sold out." : `Ask ${storeName} how to buy this.`}
          </p>
        )}
      </div>
    </div>
  );
}
