"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { FaXTwitter, FaInstagram, FaLinkedinIn, FaTelegram } from "react-icons/fa6";
import API from "@/services/api";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import ShareMenu from "@/components/ShareMenu";
import FollowButton from "@/components/community/FollowButton";
import EventImage from "@/components/brand/EventImage";
import { categoryTone, dayParts, eventInitials, formatTime, priceLabel } from "@/lib/eventFormat";

const INKS = ["#3669F6", "#D0668E", "#2F9E6E", "#C9971C", "#1F2A44"];
const TINTS = ["#E6F2FC", "#FCECEE", "#E9F7EF", "#FFFDE9", "#F3F6FB"];
const hashOf = (s) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);

const pill =
  "flex h-10 items-center gap-2 rounded-full border border-line bg-white px-3.5 text-[13px] font-bold text-ink transition-colors hover:bg-paper focus:outline-none focus-visible:ring-2 focus-visible:ring-brand";

export default function PublicProfileClient({ username }) {
  const [profile, setProfile] = useState(null);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("upcoming");
  const [followers, setFollowers] = useState(0);

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

        // Filter events by profile owner email or display name match
        const filtered = allEvents.filter((evt) => {
          const isOwner = evt.owner_email === profileData.email;
          const isHost =
            evt.hosted_by?.toLowerCase().includes(profileData.display_name?.toLowerCase()) ||
            evt.hosted_by?.toLowerCase().includes(profileData.handle?.toLowerCase());
          return isOwner || isHost;
        });

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
        <div className="mx-auto w-full max-w-[1440px] animate-pulse px-4 pt-6 md:px-12 xl:px-24">
          <div className="h-[200px] rounded-[30px] bg-mist md:h-[300px] md:rounded-[36px]" />
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
  const slot = hashOf(profile.handle || username) % INKS.length;
  const ink = INKS[slot];
  const tint = TINTS[slot];
  const cover = profile.cover_image_url
    ? { name, category: "other", event_image_url: profile.cover_image_url }
    : upcomingEvents.find((e) => e.event_image_url) || events.find((e) => e.event_image_url) || null;
  const merchItems = profile.merch_items || [];
  const categoryLabels = [...new Set(events.map((e) => e.category).filter(Boolean))].map((c) => categoryTone(c).label);
  const meta = [`@${profile.handle || username}`, profile.location, categoryLabels[0]].filter(Boolean).join(" · ");

  const socials = [
    profile.instagram && { label: "Instagram", href: `https://instagram.com/${profile.instagram}`, icon: <FaInstagram size={17} color="#B23E68" aria-hidden="true" /> },
    profile.twitter && { label: "X", href: `https://x.com/${profile.twitter}`, icon: <FaXTwitter size={15} color="#14161C" aria-hidden="true" /> },
    profile.telegram && { label: "Telegram", href: `https://t.me/${profile.telegram}`, icon: <FaTelegram size={17} color="#229ED9" aria-hidden="true" /> },
    profile.linkedin && { label: "LinkedIn", href: `https://linkedin.com/in/${profile.linkedin}`, icon: <FaLinkedinIn size={16} color="#0A66C2" aria-hidden="true" /> },
    profile.website && {
      label: "Website",
      href: profile.website,
      icon: (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#14161C" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3c2.5 2.7 2.5 15.3 0 18M12 3c-2.5 2.7-2.5 15.3 0 18" />
        </svg>
      ),
    },
  ].filter(Boolean);

  const stats = [
    { value: followers.toLocaleString(), label: followers === 1 ? "follower" : "followers" },
    { value: events.length, label: events.length === 1 ? "event hosted" : "events hosted" },
    { value: upcomingEvents.length, label: "coming up" },
  ];

  const seg = (on) =>
    `h-10 rounded-full px-4 text-sm font-bold text-ink transition-[background-color,box-shadow] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
      on ? "bg-white shadow-[0_4px_14px_rgba(20,22,28,0.10)]" : "hover:bg-white/60"
    }`;

  return (
    <div className="flex min-h-screen flex-col bg-white font-body text-ink">
      <Navbar />

      <main className="flex-1 pb-16">
        {/* Cover + identity */}
        <section className="mx-auto max-w-[1440px] px-4 pt-4 md:px-12 md:pt-5 xl:px-24">
          <div className="relative h-[190px] overflow-hidden rounded-[30px] md:h-[300px] md:rounded-[36px]" style={{ background: tint }}>
            {cover ? (
              <EventImage event={cover} sizes="(min-width: 1440px) 1248px, 100vw" priority />
            ) : (
              <div aria-hidden="true" className="absolute inset-0" style={{ background: ink, opacity: 0.12 }} />
            )}
          </div>
          <div className="relative z-10 -mt-12 flex flex-wrap items-end px-2 md:-mt-[70px] md:gap-6 md:px-10">
            <span
              className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full border-[6px] border-white font-display text-3xl font-extrabold text-white md:h-[140px] md:w-[140px] md:text-[44px]"
              style={{ background: ink }}
            >
              {profile.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" />
              ) : (
                eventInitials(name)
              )}
            </span>
            <div className="order-2 ml-auto flex items-center gap-2 md:order-3 md:mb-1.5 md:ml-0">
              <FollowButton
                handle={profile.handle || username}
                initialFollowing={!!profile.is_following}
                onChange={(count) => setFollowers(count)}
                className="h-[50px] px-7 text-base"
              />
              <ShareMenu
                url={typeof window !== "undefined" ? window.location.href : ""}
                title={name}
                campaign="profile_share"
                content={username}
                className="flex h-[50px] w-[50px] items-center justify-center rounded-full border border-line bg-white text-ink transition-[background-color,scale] hover:bg-mist active:scale-[0.96]"
                aria-label="Share community"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 3v13M7 8l5-5 5 5M5 14v5h14v-5" />
                </svg>
                <span className="sr-only">Share community</span>
              </ShareMenu>
            </div>
            <div className="order-3 mt-3 flex basis-full flex-col gap-1 md:order-2 md:-mb-5 md:mt-0 md:min-w-0 md:flex-1 md:basis-0">
              <h1 className="text-balance font-display text-[32px] font-bold leading-[1.05] tracking-[-0.03em] md:text-[44px]">{name}</h1>
              <span className="text-sm text-muted md:text-[15px]">{meta}</span>
            </div>
          </div>
        </section>

        {/* About + stats */}
        <section className="mx-auto flex max-w-[1440px] flex-col gap-8 px-4 pt-8 md:flex-row md:items-start md:gap-12 md:px-12 md:pt-8 xl:px-32">
          <div className="flex min-w-0 flex-1 flex-col gap-[18px]">
            <p className="max-w-[680px] text-pretty text-[17px] leading-[1.65] text-[#3B4252] md:text-lg">
              {profile.bio || "This organiser hasn't written a bio yet."}
            </p>
            {socials.length > 0 && (
              <div className="flex flex-wrap gap-2.5">
                {socials.map((s) => (
                  <a key={s.label} href={s.href} target="_blank" rel="noopener noreferrer" className={pill}>
                    {s.icon}
                    {s.label}
                  </a>
                ))}
              </div>
            )}
          </div>
          <div className="grid w-full grid-cols-3 gap-2.5 md:w-[420px] md:shrink-0">
            {stats.map((s) => (
              <div key={s.label} className="flex flex-col gap-0.5 rounded-[22px] border border-line bg-white p-4 md:p-[18px]">
                <span className="font-display text-[28px] font-bold md:text-[32px]">{s.value}</span>
                <span className="text-[13px] font-bold text-[#3B4252]">{s.label}</span>
              </div>
            ))}
          </div>
        </section>

        {merchItems.length > 0 && (
          <nav aria-label="Sections" className="mx-auto mt-10 max-w-[1440px] px-4 md:mt-11 md:px-12 xl:px-24">
            <div className="flex gap-1.5 border-b border-hairline">
              <a href="#events" className="-mb-px flex h-[52px] items-center border-b-[3px] border-brand px-[18px] text-base font-bold text-ink">
                Events
              </a>
              <a href="#merch" className="flex h-[52px] items-center px-[18px] text-base font-bold text-faint hover:text-ink">
                Merch
              </a>
            </div>
          </nav>
        )}

        {/* Events */}
        <section id="events" className="mx-auto flex max-w-[1440px] scroll-mt-28 flex-col gap-5 px-4 pt-10 md:px-12 md:pt-9 xl:px-24">
          <div className="flex flex-wrap items-center gap-5">
            <h2 className="font-display text-[30px] font-bold tracking-[-0.02em]">Events</h2>
            <div role="group" aria-label="Show events" className="flex gap-0.5 rounded-full bg-mist p-1">
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
              <div className="grid gap-6 lg:grid-cols-2">
                {upcomingEvents.map((evt) => {
                  const parts = dayParts(evt.day);
                  const free = priceLabel(evt) === "Free";
                  return (
                    <Link
                      key={evt.slug}
                      href={`/discover/${evt.slug}`}
                      className="flex flex-col overflow-hidden rounded-[26px] border border-hairline transition-shadow hover:shadow-[0_16px_40px_rgba(20,22,28,0.08)] focus:outline-none focus-visible:ring-4 focus-visible:ring-brand/40 md:flex-row"
                    >
                      <div className="relative h-48 shrink-0 md:h-auto md:w-60">
                        <EventImage event={evt} sizes="(min-width: 768px) 240px, 100vw" />
                      </div>
                      <div className="flex flex-1 flex-col gap-1.5 p-5 md:px-6 md:py-[22px]">
                        <span className="text-[13px] font-extrabold uppercase text-brand">
                          {parts.short} · {formatTime(evt.time_from)}
                        </span>
                        <span className="font-display text-2xl font-bold leading-[1.1]">{evt.name}</span>
                        <span className="text-sm text-muted">
                          {evt.location} · {priceLabel(evt)}
                        </span>
                        <div className="min-h-3 flex-1" />
                        <span className="flex h-[42px] items-center self-start rounded-full bg-brand px-[18px] text-sm font-bold text-white">
                          {free ? "Register" : "Get tickets"}
                        </span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <EmptyState message="Nothing coming up right now." />
            ))}

          {tab === "past" &&
            (pastEvents.length > 0 ? (
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                {pastEvents.map((evt) => (
                  <Link key={evt.slug} href={`/discover/${evt.slug}`} className="group flex flex-col gap-2.5 rounded-[22px] focus:outline-none focus-visible:ring-4 focus-visible:ring-brand/40">
                    <div className="relative h-[170px] overflow-hidden rounded-[22px]">
                      <EventImage event={evt} sizes="(min-width: 1024px) 22vw, 100vw" className="saturate-[0.75] transition-transform duration-500 group-hover:scale-[1.03]" />
                    </div>
                    <span className="font-display text-[17px] font-bold">{evt.name}</span>
                    <span className="text-[13px] text-muted">
                      {dayParts(evt.day).dayMonth} · {evt.location}
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyState message="No past events yet." />
            ))}
        </section>

        {merchItems.length > 0 && (
          <section id="merch" className="mx-auto flex max-w-[1440px] scroll-mt-28 flex-col gap-5 px-4 pt-14 md:px-12 md:pt-16 xl:px-24">
            <div className="flex items-baseline gap-3.5">
              <h2 className="font-display text-[30px] font-bold tracking-[-0.02em]">Merch</h2>
              <span className="text-sm text-muted">Sold by {name}</span>
            </div>
            <ul className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
              {merchItems.map((item) => (
                <MerchTile key={item.id} item={item} />
              ))}
            </ul>
          </section>
        )}
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

/** One merch item: a photo on a single neutral tile, then name, price and a Buy link. */
function MerchTile({ item }) {
  const hasStock = item.stock !== null && item.stock !== undefined;
  const soldOut = hasStock && item.stock <= 0;
  const price = item.price ? `₦${Number(item.price).toLocaleString("en-NG")}` : "Price on request";
  return (
    <li className="flex flex-col gap-3">
      <div className="relative flex h-[260px] items-center justify-center overflow-hidden rounded-3xl bg-mist">
        {item.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.image_url} alt={item.name} className="h-full w-full object-cover" />
        ) : (
          <svg width="96" height="96" viewBox="0 0 24 24" fill="none" stroke="#8A91A0" strokeWidth="1.1" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 8h14l-1 13H6zM9 8V6a3 3 0 0 1 6 0v2" />
          </svg>
        )}
        <span className="absolute left-3 top-3 flex h-7 items-center rounded-full bg-white px-2.5 text-xs font-extrabold">
          {soldOut ? "Sold out" : hasStock ? `${item.stock} left` : "In stock"}
        </span>
      </div>
      <div className="flex flex-col gap-0.5 px-1">
        <span className="font-display text-[19px] font-bold leading-tight">{item.name}</span>
        <span className="text-[15px] font-extrabold">{price}</span>
      </div>
      {item.purchase_link && !soldOut && (
        <a
          href={item.purchase_link}
          target="_blank"
          rel="noopener noreferrer"
          className="flex h-11 items-center justify-center gap-2 rounded-full border border-line text-sm font-bold text-ink transition-[background-color,scale] hover:bg-mist active:scale-[0.96] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          Buy
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M7 17L17 7M9 7h8v8" />
          </svg>
          <span className="sr-only">(opens the organiser&apos;s store)</span>
        </a>
      )}
    </li>
  );
}
