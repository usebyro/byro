"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { FaXTwitter, FaInstagram, FaLinkedinIn, FaTelegram, FaWhatsapp } from "react-icons/fa6";
import API from "@/services/api";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import ShareMenu from "@/components/ShareMenu";
import FollowButton from "@/components/community/FollowButton";
import VerifiedBadge from "@/components/community/VerifiedBadge";
import EventImage from "@/components/brand/EventImage";
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

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col bg-white font-body">
        <Navbar />
        <div className="mx-auto w-full max-w-[1120px] animate-pulse px-4 pt-8 md:px-8">
          <div className="h-[180px] rounded-[20px] bg-mist md:h-[280px]" />
          <div className="mt-6 h-12 w-1/2 rounded-2xl bg-mist" />
          <div className="mt-4 h-24 rounded-3xl bg-mist" />
        </div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="flex min-h-screen flex-col bg-white font-body text-ink">
        <Navbar />
        <div className="mx-auto flex w-full max-w-xl flex-1 flex-col items-start gap-4 px-4 pt-20 md:px-8">
          <h1 className="font-display text-[44px] font-bold leading-none tracking-[-0.04em] md:text-6xl">Community not found</h1>
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

  const hasTabs = merchItems.length > 0;
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
          {hasTabs && (
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
                  onClick={() => setPage(t.id)}
                  className={`-mb-px h-[52px] border-b-2 text-base font-bold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
                    page === t.id ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink"
                  }`}
                >
                  {t.label} <span className="font-semibold text-muted">{t.count}</span>
                </button>
              ))}
            </div>
          )}

          {page === "events" && (
            <section
              id="panel-events"
              role={hasTabs ? "tabpanel" : undefined}
              aria-labelledby={hasTabs ? "tab-events" : undefined}
              aria-label={hasTabs ? undefined : "Events"}
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

          {hasTabs && page === "merch" && (
            <section id="panel-merch" role="tabpanel" aria-labelledby="tab-merch">
              <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                {merchItems.map((item) => (
                  <MerchTile key={item.id} item={item} />
                ))}
              </ul>
            </section>
          )}
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
function MerchTile({ item }) {
  const hasStock = item.stock !== null && item.stock !== undefined;
  const soldOut = hasStock && item.stock <= 0;
  const price = item.price ? `₦${Number(item.price).toLocaleString("en-NG")}` : "Price on request";
  const linked = !!item.purchase_link && !soldOut;

  const inner = (
    <>
      <div className="relative flex h-[180px] items-center justify-center overflow-hidden rounded-[20px] bg-mist text-[#3B4252]">
        {item.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.image_url} alt="" className="h-full w-full object-cover" />
        ) : (
          <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 8h14l-1 13H6zM9 8V6a3 3 0 0 1 6 0v2" />
          </svg>
        )}
        {soldOut && <span className="absolute left-3 top-3 flex h-7 items-center rounded-full bg-white px-2.5 text-xs font-extrabold">Sold out</span>}
      </div>
      <div className="flex items-baseline justify-between gap-2.5">
        <span className="text-base font-extrabold">{item.name}</span>
        <span className="whitespace-nowrap text-[15px] font-bold">{price}</span>
      </div>
    </>
  );

  return (
    <li>
      {linked ? (
        <a
          href={item.purchase_link}
          target="_blank"
          rel="noopener noreferrer"
          className="flex flex-col gap-2.5 transition-[scale] active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          {inner}
          <span className="sr-only">(opens the organiser&apos;s store)</span>
        </a>
      ) : (
        <div className="flex flex-col gap-2.5">{inner}</div>
      )}
    </li>
  );
}
