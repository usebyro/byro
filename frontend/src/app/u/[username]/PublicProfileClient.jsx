"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Share01Icon,
  Location01Icon,
  Calendar01Icon,
  MusicNote01Icon,
  Moon02Icon,
  FootballIcon,
  Mic01Icon,
  HappyIcon,
  FireworksIcon,
} from "@hugeicons/core-free-icons";
import API from "@/services/api";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { toast } from "sonner";

const CATEGORY_ICONS = {
  entertainment: MusicNote01Icon,
  art_culture: Moon02Icon,
  fitness: FootballIcon,
  conference: Mic01Icon,
  comedy: HappyIcon,
  festivals: FireworksIcon,
};

const CATEGORY_LABELS = {
  entertainment: "CONCERTS & MUSIC",
  web3_crypto: "WEB3 & CRYPTO",
  art_culture: "NIGHTLIFE & PARTIES",
  conference: "CONFERENCES",
  fitness: "SPORTS",
  technology: "TECHNOLOGY",
  other: "OTHER",
};

const fmtPrice = (price) => {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    minimumFractionDigits: 0,
  }).format(price);
};

export default function PublicProfileClient({ username }) {
  const router = useRouter();
  const [profile, setProfile] = useState(null);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isFollowing, setIsFollowing] = useState(false);
  const [activeTab, setActiveTab] = useState("upcoming");
  const [avatarError, setAvatarError] = useState(false);

  useEffect(() => {
    if (!username) return;

    const fetchData = async () => {
      try {
        setLoading(true);
        // Fetch public profile
        const profileData = await API.getPublicProfile(username);
        setProfile(profileData);

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
      if (evtDate >= now) {
        upcoming.push(evt);
      } else {
        past.push(evt);
      }
    });

    // Sort upcoming events ascending (soonest first)
    upcoming.sort((a, b) => new Date(a.day) - new Date(b.day));
    // Sort past events descending (most recent first)
    past.sort((a, b) => new Date(b.day) - new Date(a.day));

    return { upcomingEvents: upcoming, pastEvents: past };
  }, [events]);

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({ title: profile?.display_name, url: window.location.href });
    } else {
      navigator.clipboard.writeText(window.location.href).then(() => {
        toast.success("Profile link copied to clipboard!");
      });
    }
  };

  const handleFollowToggle = () => {
    setIsFollowing((f) => !f);
    toast.success(isFollowing ? `Unfollowed ${profile?.display_name}` : `Following ${profile?.display_name}`);
  };

  if (loading) {
    return (
      <div className="flex flex-col min-h-screen bg-[#F8F9FA]">
        <Navbar />
        <div className="flex-1 flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-blue-600" />
        </div>
        <Footer />
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="flex flex-col min-h-screen bg-[#F8F9FA]">
        <Navbar />
        <div className="flex-1 flex flex-col items-center justify-center py-20 text-center px-4">
          <h1 className="text-2xl font-bold text-gray-800 mb-2">Profile Not Found</h1>
          <p className="text-gray-500 mb-6">The organizer profile you are looking for does not exist.</p>
          <button
            onClick={() => router.push("/")}
            className="px-6 py-2.5 bg-blue-600 text-white rounded-full font-semibold hover:bg-blue-700 transition-colors shadow-sm"
          >
            Go to Home
          </button>
        </div>
        <Footer />
      </div>
    );
  }

  const initials = `${profile.display_name?.[0] || profile.handle?.[0] || "?"}`.toUpperCase();
  const categoriesList = Array.from(new Set(events.map((e) => e.category))).filter(Boolean);

  return (
    <div className="flex flex-col min-h-screen bg-[#F8F9FA]">
      <Navbar />

      {/* ── Banner Section ── */}
      <div className="relative w-full h-[220px] md:h-[280px] bg-gradient-to-r from-[#310E3D] via-[#651A67] to-[#DF3C82] overflow-hidden">
        {/* Decorative elements for background depth */}
        <div className="absolute top-[-50px] right-[-50px] w-[300px] h-[300px] bg-white/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-[-100px] left-[10%] w-[400px] h-[400px] bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />
      </div>

      {/* ── Profile Header Container ── */}
      <div className="max-w-6xl mx-auto w-full px-4 md:px-8 relative z-10 -mt-16 mb-8">
        <div className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-gray-100/80">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
            
            {/* Avatar & Info */}
            <div className="flex flex-col md:flex-row items-center md:items-start gap-6 text-center md:text-left">
              {/* Avatar Box (Squircle box overlapping banner style) */}
              <div className="w-24 h-24 md:w-28 md:h-28 rounded-2xl md:rounded-3xl bg-gradient-to-br from-blue-500 to-indigo-600 border-4 border-white shadow-md flex items-center justify-center text-white text-3xl md:text-4xl font-extrabold shrink-0 relative overflow-hidden">
                {profile.avatar_url && !avatarError ? (
                  <Image
                    src={profile.avatar_url}
                    alt={profile.display_name}
                    fill
                    sizes="112px"
                    className="object-cover"
                    onError={() => setAvatarError(true)}
                  />
                ) : (
                  <span>{initials}</span>
                )}
              </div>

              {/* Bio details */}
              <div className="mt-2">
                <div className="flex items-center justify-center md:justify-start gap-2 flex-wrap">
                  <h1 className="text-2xl md:text-3xl font-extrabold text-gray-900 leading-tight">
                    {profile.display_name || profile.handle}
                  </h1>
                  <span className="inline-flex items-center justify-center w-5 h-5 bg-blue-500 text-white rounded-full shrink-0">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  </span>
                </div>

                <div className="flex flex-wrap items-center justify-center md:justify-start gap-x-4 gap-y-2 mt-3 text-xs md:text-sm text-gray-500 font-medium">
                  {categoriesList.length > 0 && (
                    <span className="flex items-center gap-1">
                      <HugeiconsIcon icon={MusicNote01Icon} size={14} className="text-gray-400" />
                      {categoriesList.map(c => CATEGORY_LABELS[c] || c).join(" · ")}
                    </span>
                  )}
                  {profile.location && (
                    <span className="flex items-center gap-1">
                      <HugeiconsIcon icon={Location01Icon} size={14} className="text-gray-400" />
                      {profile.location}
                    </span>
                  )}
                  <span className="text-gray-400">·</span>
                  <span className="font-semibold text-gray-800">
                    {isFollowing ? "1.2k" : "1.2k"} followers
                  </span>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-center gap-3 w-full md:w-auto mt-4 md:mt-2">
              <button
                onClick={handleFollowToggle}
                className={`flex-1 md:flex-none px-6 py-2.5 rounded-full font-bold text-sm shadow-sm transition-all duration-200 ${
                  isFollowing
                    ? "bg-gray-100 text-gray-700 hover:bg-gray-200"
                    : "bg-blue-600 text-white hover:bg-blue-700 hover:shadow"
                }`}
              >
                {isFollowing ? "Following" : "Follow"}
              </button>
              <button
                onClick={handleShare}
                className="px-4 py-2.5 border border-gray-200 rounded-full hover:bg-gray-50 text-gray-600 transition-colors shadow-sm"
                aria-label="Share Profile"
              >
                <HugeiconsIcon icon={Share01Icon} size={16} />
              </button>
            </div>

          </div>

          {/* Bio text */}
          {profile.bio && (
            <p className="mt-6 text-sm text-gray-600 leading-relaxed text-center md:text-left border-t border-gray-50 pt-5">
              {profile.bio}
            </p>
          )}
        </div>
      </div>

      {/* ── Tabs & Events Grid ── */}
      <div className="max-w-6xl mx-auto w-full px-4 md:px-8 mb-16 flex-1">
        
        {/* Navigation Tabs */}
        <div className="flex items-center border-b border-gray-200 gap-8 mb-8">
          <button
            onClick={() => setActiveTab("upcoming")}
            className={`pb-4 text-sm font-semibold relative transition-colors ${
              activeTab === "upcoming" ? "text-blue-600" : "text-gray-500 hover:text-gray-800"
            }`}
          >
            Upcoming · {upcomingEvents.length}
            {activeTab === "upcoming" && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 rounded-full" />
            )}
          </button>
          <button
            onClick={() => setActiveTab("past")}
            className={`pb-4 text-sm font-semibold relative transition-colors ${
              activeTab === "past" ? "text-blue-600" : "text-gray-500 hover:text-gray-800"
            }`}
          >
            Past · {pastEvents.length}
            {activeTab === "past" && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 rounded-full" />
            )}
          </button>
          <button
            onClick={() => setActiveTab("about")}
            className={`pb-4 text-sm font-semibold relative transition-colors ${
              activeTab === "about" ? "text-blue-600" : "text-gray-500 hover:text-gray-800"
            }`}
          >
            About
            {activeTab === "about" && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 rounded-full" />
            )}
          </button>
        </div>

        {/* Tab Contents */}
        {activeTab === "upcoming" && (
          upcomingEvents.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {upcomingEvents.map((evt) => (
                <EventCard key={evt.slug} event={evt} />
              ))}
            </div>
          ) : (
            <EmptyState message="No upcoming events scheduled." />
          )
        )}

        {activeTab === "past" && (
          pastEvents.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {pastEvents.map((evt) => (
                <EventCard key={evt.slug} event={evt} />
              ))}
            </div>
          ) : (
            <EmptyState message="No past events found." />
          )
        )}

        {activeTab === "about" && (
          <div className="bg-white rounded-3xl p-6 md:p-8 border border-gray-100 shadow-sm space-y-6">
            <div>
              <h3 className="font-bold text-gray-900 text-lg mb-2">About Organizer</h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                {profile.bio || "No description provided."}
              </p>
            </div>

            {(profile.location || profile.website) && (
              <div className="border-t border-gray-100 pt-5 space-y-3">
                {profile.location && (
                  <div className="flex items-center gap-3 text-sm text-gray-600">
                    <HugeiconsIcon icon={Location01Icon} size={16} className="text-gray-400" />
                    <span>Based in {profile.location}</span>
                  </div>
                )}
                {profile.website && (
                  <div className="flex items-center gap-3 text-sm text-gray-600">
                    <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9s2.015-9 4.5-9m0 0a9.003 9.003 0 018.716 3.253M12 3a9.003 9.003 0 00-8.716 3.253" />
                    </svg>
                    <a href={profile.website} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                      {profile.website}
                    </a>
                  </div>
                )}
              </div>
            )}

            {/* Social Links */}
            {(profile.twitter || profile.instagram || profile.linkedin || profile.telegram) && (
              <div className="border-t border-gray-100 pt-5">
                <h4 className="font-bold text-gray-900 text-sm mb-3">Connect on Socials</h4>
                <div className="flex flex-wrap gap-4">
                  {profile.twitter && (
                    <a href={`https://twitter.com/${profile.twitter}`} target="_blank" rel="noopener noreferrer" className="text-sm px-4 py-2 bg-gray-50 rounded-xl hover:bg-gray-100 text-gray-700 transition-colors font-medium">
                      Twitter
                    </a>
                  )}
                  {profile.instagram && (
                    <a href={`https://instagram.com/${profile.instagram}`} target="_blank" rel="noopener noreferrer" className="text-sm px-4 py-2 bg-gray-50 rounded-xl hover:bg-gray-100 text-gray-700 transition-colors font-medium">
                      Instagram
                    </a>
                  )}
                  {profile.linkedin && (
                    <a href={`https://linkedin.com/in/${profile.linkedin}`} target="_blank" rel="noopener noreferrer" className="text-sm px-4 py-2 bg-gray-50 rounded-xl hover:bg-gray-100 text-gray-700 transition-colors font-medium">
                      LinkedIn
                    </a>
                  )}
                  {profile.telegram && (
                    <a href={`https://t.me/${profile.telegram}`} target="_blank" rel="noopener noreferrer" className="text-sm px-4 py-2 bg-gray-50 rounded-xl hover:bg-gray-100 text-gray-700 transition-colors font-medium">
                      Telegram
                    </a>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

      </div>

      <Footer />
    </div>
  );
}

// ── Card component for event grid (matches the style of Eko Live Entertainment cards) ──
function EventCard({ event }) {
  const router = useRouter();
  const [imageError, setImageError] = useState(false);

  const formattedDate = useMemo(() => {
    if (!event.day) return "";
    return new Date(event.day).toLocaleDateString("en-US", {
      day: "numeric",
      month: "short",
    });
  }, [event.day]);

  const formattedTime = useMemo(() => {
    if (!event.time_from) return "";
    return new Date(`1970-01-01T${event.time_from}`).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  }, [event.time_from]);

  const getImageUrl = () => {
    if (event.event_image_url) return event.event_image_url;
    if (!event.event_image) return null;
    if (event.event_image.startsWith("http")) return event.event_image;
    const base = (process.env.NEXT_PUBLIC_API_URL || "https://byro.onrender.com").replace(/\/api\/?$/, "");
    return `${base}${event.event_image}`;
  };

  const imageUrl = getImageUrl();
  const badgeLabel = CATEGORY_LABELS[event.category] || event.category?.toUpperCase();
  const ticketPrice = parseFloat(event.ticket_price ?? 0);
  const isFree = ticketPrice === 0;

  return (
    <div
      onClick={() => router.push(`/${event.slug}`)}
      className="group bg-white rounded-3xl overflow-hidden border border-gray-100/80 shadow-sm hover:shadow-md transition-all duration-300 flex flex-col h-[380px] cursor-pointer relative"
    >
      {/* Event Image / Gradient */}
      <div className="h-[200px] w-full relative overflow-hidden shrink-0 bg-gradient-to-br from-[#4a148c] via-[#7b1fa2] to-[#ec407a]">
        {imageUrl && !imageError ? (
          <Image
            src={imageUrl}
            alt={event.name}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="object-cover group-hover:scale-105 transition-transform duration-500"
            onError={() => setImageError(true)}
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-tr from-purple-900/90 via-purple-700/60 to-pink-500/40" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />

        {/* Category Badge overlay */}
        <span className="absolute top-4 left-4 bg-white/20 backdrop-blur-md border border-white/20 text-white text-[10px] font-bold tracking-wider px-3 py-1.5 rounded-full uppercase">
          {badgeLabel}
        </span>

        {/* Heart Icon overlay */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            toast.success("Saved event!");
          }}
          className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center hover:bg-white/30 transition-colors"
          aria-label="Save Event"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
        </button>

        {/* Date Tag Overlay on bottom left */}
        <div className="absolute bottom-4 left-4 text-white text-xs font-semibold flex items-center gap-1.5 opacity-90">
          <HugeiconsIcon icon={Calendar01Icon} size={12} color="white" />
          <span>{formattedDate} · {formattedTime}</span>
        </div>
      </div>

      {/* Info details */}
      <div className="p-5 flex-1 flex flex-col justify-between">
        <div>
          <h3 className="font-serif text-lg font-bold text-gray-900 line-clamp-2 leading-tight group-hover:text-blue-600 transition-colors">
            {event.name}
          </h3>
          <p className="text-xs text-gray-500 flex items-center gap-1 mt-2 font-medium">
            <HugeiconsIcon icon={Location01Icon} size={12} className="text-gray-400" />
            <span className="truncate">{event.location || "TBD"}</span>
          </p>
        </div>

        {/* Action row */}
        <div className="flex items-center justify-between border-t border-gray-50 pt-4 mt-3 shrink-0">
          <div>
            <span className="text-[10px] font-bold text-gray-400 tracking-wider uppercase block">From</span>
            <span className="text-base font-extrabold text-gray-900">
              {isFree ? "Free" : fmtPrice(ticketPrice)}
            </span>
          </div>

          <button className="bg-blue-600 text-white font-semibold text-xs px-4 py-2.5 rounded-full hover:bg-blue-700 transition-colors flex items-center gap-1 group-hover:shadow shadow-sm">
            <span>Get tickets</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Empty State Component ──
function EmptyState({ message }) {
  return (
    <div className="bg-white rounded-3xl py-16 px-4 border border-gray-100 shadow-sm flex flex-col items-center justify-center text-center">
      <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 mb-3">
        <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
        </svg>
      </div>
      <p className="text-sm font-medium text-gray-500">{message}</p>
    </div>
  );
}
