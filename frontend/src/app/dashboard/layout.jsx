"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Cancel01Icon,
  Home01Icon,
  Calendar03Icon,
  UserGroupIcon,
  Mail01Icon,
  ShoppingBag01Icon,
  Wallet01Icon,
  UserCircleIcon,
  PlusSignIcon,
  ArrowDataTransferHorizontalIcon,
  MoreHorizontalIcon,
  SidebarLeftIcon,
} from "@hugeicons/core-free-icons";
import { Providers } from "@/redux/Providers";
import { useDispatch } from "react-redux";
import { useAuth } from "@/redux/useAuth";
import { signOut } from "@/redux/auth/authSlice";
import UserMenu from "@/components/auth/UserMenu";
import NotificationBell from "@/components/dashboard/NotificationBell";
import DashSearch from "@/components/dashboard/DashSearch";
import API from "@/services/api";
import "./dashboard-v2.css";

// Menu icons are Hugeicons, like the rest of the app.
const NAV = [
  { label: "Overview", href: "/dashboard/overview", icon: Home01Icon, exact: true },
  { label: "Events",   href: "/dashboard/events",   icon: Calendar03Icon },
  { label: "Community", href: "/dashboard/community", icon: UserGroupIcon },
  { label: "Messages", href: "/dashboard/messages", icon: Mail01Icon },
  { label: "Merch",    href: "/dashboard/merch",    icon: ShoppingBag01Icon },
  { label: "Payouts",  href: "/dashboard/payouts",  icon: Wallet01Icon },
  { label: "Profile",  href: "/dashboard/profile",  icon: UserCircleIcon },
];

// Phone tab bar: the four most used pages, the rest live under More.
const TAB_HREFS = ["/dashboard/overview", "/dashboard/events", "/dashboard/community", "/dashboard/payouts"];
const TABS = NAV.filter((n) => TAB_HREFS.includes(n.href)).map((n) => (n.label === "Overview" ? { ...n, tab: "Home" } : n));
const MORE = NAV.filter((n) => !TAB_HREFS.includes(n.href));

const NavIcon = ({ icon, size = 18 }) => (
  <HugeiconsIcon icon={icon} size={size} color="currentColor" strokeWidth={1.8} className="shrink-0" aria-hidden="true" />
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
            <NavIcon icon={SidebarLeftIcon} />
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
                <NavIcon icon={item.icon} />
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
        <NavIcon icon={ArrowDataTransferHorizontalIcon} />
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

      {/* Phone: the "More" sheet from the bottom tab bar. */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end md:hidden" role="dialog" aria-modal="true" aria-label="More">
          <button type="button" aria-label="Close menu" onClick={() => setMobileOpen(false)} className="v-scrim absolute inset-0 border-0 bg-[rgba(20,22,28,.32)]" />
          <nav aria-label="More" className="v-sheet-up relative flex flex-col gap-0.5 rounded-t-[24px] bg-white px-3 pb-[calc(20px+env(safe-area-inset-bottom))] pt-2.5 shadow-[0_-20px_50px_-20px_rgba(20,22,28,.35)]">
            <span aria-hidden="true" className="mx-auto mb-2.5 mt-0.5 h-1 w-10 rounded-full bg-[#CBD3DF]" />
            {MORE.map((item, i) => (
              <Link
                key={item.href}
                ref={i === 0 ? closeButtonRef : undefined}
                href={item.href}
                aria-current={pathname.startsWith(item.href) ? "page" : undefined}
                className="v-row flex h-[52px] items-center gap-3.5 rounded-[14px] px-3.5 text-base font-bold text-ink aria-[current=page]:text-brand-dark"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-mist text-body">
                  <NavIcon icon={item.icon} size={20} />
                </span>
                {item.label}
              </Link>
            ))}
            <div className="mx-1 my-1.5 h-px bg-hairline" />
            <Link href="/dashboard/events/create" className="v-row flex h-[52px] items-center gap-3.5 rounded-[14px] px-3.5 text-base font-bold text-ink">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#EEF3FF] text-brand-dark">
                <NavIcon icon={PlusSignIcon} size={20} />
              </span>
              Create event
            </Link>
            <Link href="/home" className="v-row flex h-[52px] items-center gap-3.5 rounded-[14px] px-3.5 text-base font-bold text-ink">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-mist text-body">
                <NavIcon icon={ArrowDataTransferHorizontalIcon} size={20} />
              </span>
              Switch to attending
            </Link>
          </nav>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden" inert={mobileOpen}>

        <header className="flex shrink-0 items-center gap-2 bg-[rgba(246,248,251,.86)] px-4 py-2.5 backdrop-blur-[20px] backdrop-saturate-[1.8] md:min-h-16 md:gap-3 md:bg-transparent md:px-[clamp(16px,3vw,40px)] md:py-3 md:backdrop-filter-none">
          {/* Phone: your community instead of the search. */}
          <Link href={communityHref} className="v-press flex h-11 min-w-0 flex-1 items-center gap-2.5 md:hidden" aria-label={`${communityName}, view your community page`}>
            <span aria-hidden="true" className="v-d flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px] bg-ink text-[15px] font-bold text-white">
              {communityName.trim().charAt(0).toUpperCase()}
            </span>
            <span className="truncate text-base font-extrabold">{communityName}</span>
          </Link>
          <div className="hidden min-w-0 flex-1 md:flex">
            <DashSearch />
          </div>
          <NotificationBell />
          <UserMenu user={user} onLogout={handleLogout} size="sm" />
        </header>

        <main id="main" tabIndex={-1} className="flex-1 overflow-y-auto pb-[92px] focus:outline-none md:pb-0">
          {children}
        </main>
      </div>

      {/* Phone: bottom tab bar. */}
      <nav
        aria-label="Dashboard"
        className="fixed inset-x-0 bottom-0 z-40 flex gap-0.5 bg-[rgba(255,255,255,.86)] px-2 pb-[calc(4px+env(safe-area-inset-bottom))] pt-1 shadow-[0_-1px_0_rgba(20,22,28,.06)] backdrop-blur-[20px] backdrop-saturate-[1.8] md:hidden"
        inert={mobileOpen}
      >
        {TABS.map((item) => {
          const active = item.exact ? pathname === item.href || pathname === "/dashboard" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`flex h-14 min-w-0 flex-1 flex-col items-center justify-center gap-[3px] rounded-[14px] text-[11px] font-bold ${active ? "text-brand-dark" : "text-muted"}`}
            >
              <NavIcon icon={item.icon} size={22} />
              {item.tab || item.label}
            </Link>
          );
        })}
        <button
          ref={menuButtonRef}
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-expanded={mobileOpen}
          aria-current={MORE.some((m) => pathname.startsWith(m.href)) ? "page" : undefined}
          className="flex h-14 min-w-0 flex-1 flex-col items-center justify-center gap-[3px] rounded-[14px] border-0 bg-transparent text-[11px] font-bold text-muted aria-[current=page]:text-brand-dark"
        >
          <NavIcon icon={MoreHorizontalIcon} size={22} />
          More
        </button>
      </nav>
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
