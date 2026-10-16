"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import { Menu01Icon, Cancel01Icon } from "@hugeicons/core-free-icons";
import { Providers } from "@/redux/Providers";
import { useDispatch } from "react-redux";
import { useAuth } from "@/redux/useAuth";
import { signOut } from "@/redux/auth/authSlice";
import UserMenu from "@/components/auth/UserMenu";
import NotificationBell from "@/components/dashboard/NotificationBell";
import DashSearch from "@/components/dashboard/DashSearch";
import API from "@/services/api";
import "./dashboard-v2.css";

// Icons are the stroke paths from the dashboard design, so the nav matches it exactly.
const NAV = [
  { label: "Overview", href: "/dashboard/overview", icon: "M4 11l8-7 8 7v9h-5v-6H9v6H4z", exact: true },
  { label: "Events",   href: "/dashboard/events",   icon: "M4 6h16v14H4zM4 10h16M9 3v4M15 3v4" },
  { label: "Community", href: "/dashboard/community", icon: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5M16 4.5a3.5 3.5 0 0 1 0 6.5M18 14.5c2 .6 3.2 2.6 3.5 5.5" },
  { label: "Messages", href: "/dashboard/messages", icon: "M4 6h16v12H4zM4 7l8 6 8-6" },
  { label: "Merch",    href: "/dashboard/merch",    icon: "M5 8h14l-1 13H6zM9 8V6a3 3 0 0 1 6 0v2" },
  { label: "Payouts",  href: "/dashboard/payouts",  icon: "M3 7h18v10H3zM12 12m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0" },
  { label: "Profile",  href: "/dashboard/profile",  icon: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c1-4 4-6 8-6s7 2 8 6" },
];

const Stroke = ({ d, size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
    <path d={d} />
  </svg>
);

// In the collapsed rail the label stays in the DOM for screen readers, and shows as a tooltip on hover and keyboard focus.
const RailLabel = ({ label, collapsed }) =>
  collapsed ? (
    <>
      <span className="sr-only">{label}</span>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute left-full z-50 ml-3 whitespace-nowrap rounded-lg bg-ink px-2.5 py-1.5 text-xs font-bold text-white opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100 motion-reduce:transition-none"
      >
        {label}
      </span>
    </>
  ) : (
    <span className="truncate">{label}</span>
  );

function StudioShell({ children }) {
  const pathname = usePathname();
  const router   = useRouter();
  const dispatch = useDispatch();
  const { user, token, ready } = useAuth();

  const [isCollapsed, setIsCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const menuButtonRef = useRef(null);
  const [followers, setFollowers] = useState(null);
  const closeButtonRef = useRef(null);

  // Close the mobile drawer whenever the route changes
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    setMobileOpen(false);
  }

  // The dashboard is organiser-only. A visitor with no session — e.g. hitting
  // usebyro.com/dashboard directly — gets bounced to login, and back to
  // whatever dashboard page they wanted once they sign in.
  useEffect(() => {
    if (ready && !token) {
      router.replace(`/login?redirect=${encodeURIComponent(pathname)}`);
    }
  }, [ready, token, pathname, router]);

  useEffect(() => {
    if (!mobileOpen) return;
    closeButtonRef.current?.focus();
    const opener = menuButtonRef.current;
    const onKey = (e) => e.key === "Escape" && setMobileOpen(false);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      opener?.focus();
    };
  }, [mobileOpen]);

  useEffect(() => {
    if (!token) return;
    API.getCommunityStats().then((c) => setFollowers(c?.followers ?? null)).catch(() => {});
  }, [token]);

  const handleLogout = () => {
    dispatch(signOut());
    router.push("/");
  };

  if (!token) {
    return (
      <div role="status" className="min-h-dvh flex items-center justify-center bg-white">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-brand motion-reduce:animate-none" />
        <span className="sr-only">Loading…</span>
      </div>
    );
  }

  const communityName = user?.display_name || user?.displayName || user?.name || user?.handle || "Your community";
  const communityHref = user?.handle ? `/u/${user.handle}` : "/dashboard/profile";
  const followerLine = followers == null ? "Organiser" : `Organiser · ${followers.toLocaleString("en-NG")} follower${followers === 1 ? "" : "s"}`;

  const renderSidebarContent = (collapsed, closeMobile = null) => (
    <>
      <div className={`flex h-10 shrink-0 items-center ${collapsed ? "justify-center" : "justify-between pl-2.5 pr-1.5"}`}>
        {!collapsed && (
          <Link href="/" aria-label="byro home">
            <Image src="/assets/images/logo.svg" alt="byro" width={52} height={28} className="h-7 w-auto" />
          </Link>
        )}

        {!closeMobile && (
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="v-icon-btn ghost hidden text-muted md:inline-flex"
            style={{ width: 34, height: 34 }}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!collapsed}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="4" width="18" height="16" rx="3" />
              <path d="M9 4v16" />
            </svg>
          </button>
        )}

        {closeMobile && (
          <button
            ref={closeButtonRef}
            onClick={closeMobile}
            className="v-icon-btn ghost text-muted md:hidden"
            aria-label="Close menu"
          >
            <HugeiconsIcon icon={Cancel01Icon} size={18} color="currentColor" />
          </button>
        )}
      </div>

      <Link
        href={communityHref}
        title={collapsed ? undefined : "View your community page"}
        className={`v-press group relative flex h-[58px] shrink-0 items-center rounded-[14px] bg-white text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
          collapsed ? "justify-center" : "gap-2.5 px-2.5"
        }`}
      >
        <span aria-hidden="true" className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px] bg-ink font-display text-[15px] font-bold text-white">
          {communityName.trim().charAt(0).toUpperCase()}
        </span>
        {collapsed && <RailLabel label={communityName} collapsed />}
        {!collapsed && (
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-sm font-extrabold">{communityName}</span>
            <span className="truncate text-xs text-muted">{followerLine}</span>
          </span>
        )}
      </Link>

      <nav aria-label="Dashboard" className="flex flex-col gap-0.5">
        {NAV.map((item) => {
          const active = item.exact ? pathname === item.href || pathname === "/dashboard" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`group relative flex h-[42px] items-center rounded-xl text-[15px] transition-[background-color,color,scale] active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
                collapsed ? "justify-center" : "gap-3 px-3"
              } ${active ? "bg-white font-extrabold text-ink shadow-[0_1px_3px_rgba(20,22,28,.08)]" : "v-navi font-semibold text-body"}`}
            >
              <span className={active ? "text-brand" : "text-muted"}>
                <Stroke d={item.icon} />
              </span>
              <RailLabel label={item.label} collapsed={collapsed} />
            </Link>
          );
        })}
      </nav>

      <div className="flex-1" />

      <Link
        href="/home"
        className={`v-navi group relative flex h-[42px] shrink-0 items-center rounded-xl text-sm font-bold text-muted transition-[background-color,scale] active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
          collapsed ? "justify-center" : "gap-3 px-3"
        }`}
      >
        <Stroke d="M7 7h11l-3-3M17 17H6l3 3" />
        <RailLabel label="Switch to attending" collapsed={collapsed} />
      </Link>
    </>
  );

  const sidebarPad = "flex flex-col gap-[18px] px-3.5 pb-5 pt-[18px]";

  return (
    <div className="dv2 flex h-dvh overflow-hidden bg-[#F6F8FB]">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-full focus:bg-ink focus:px-4 focus:py-2.5 focus:text-sm focus:font-bold focus:text-white"
      >
        Skip to content
      </a>

      <aside aria-label="Sidebar" className={`${sidebarPad} hidden shrink-0 overflow-y-auto transition-[width] duration-300 motion-reduce:transition-none md:flex ${
        isCollapsed ? "w-[76px]" : "w-[248px]"
      }`}>
        {renderSidebarContent(isCollapsed)}
      </aside>

      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex overscroll-contain" role="dialog" aria-modal="true" aria-label="Menu">
          <div
            className="v-scrim absolute inset-0 bg-black/40 backdrop-blur-[2px]"
            onClick={() => setMobileOpen(false)}
          />
          <aside className={`${sidebarPad} relative z-10 h-full w-[264px] max-w-[84vw] overflow-y-auto overscroll-contain bg-[#F6F8FB] shadow-2xl animate-slide-in-left motion-reduce:animate-none`}>
            {renderSidebarContent(false, () => setMobileOpen(false))}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden" inert={mobileOpen}>

        <header className="flex min-h-16 shrink-0 items-center gap-3 px-4 py-3 sm:px-[clamp(16px,3vw,40px)]">
          <button
            ref={menuButtonRef}
            onClick={() => setMobileOpen(true)}
            className="v-icon-btn ghost text-muted md:hidden"
            aria-label="Open menu"
          >
            <HugeiconsIcon icon={Menu01Icon} size={20} color="currentColor" />
          </button>

          <DashSearch />
          <div className="flex-1" />
          <NotificationBell />
          <UserMenu user={user} onLogout={handleLogout} size="sm" />
        </header>

        <main id="main" tabIndex={-1} className="flex-1 overflow-y-auto focus:outline-none">
          {children}
        </main>
      </div>
    </div>
  );
}

export default function StudioLayout({ children }) {
  return (
    <Providers>
      <StudioShell>{children}</StudioShell>
    </Providers>
  );
}
