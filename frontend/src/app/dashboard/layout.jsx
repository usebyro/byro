"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import { Menu01Icon, Cancel01Icon } from "@hugeicons/core-free-icons";
import { Providers } from "@/redux/Providers";
import { useSelector, useDispatch } from "react-redux";
import { signOut } from "@/redux/auth/authSlice";
import UserMenu from "@/components/auth/UserMenu";
import NotificationBell from "@/components/dashboard/NotificationBell";

// Icons are the stroke paths from the dashboard design, so the nav matches it exactly.
const NAV = [
  { label: "Overview", href: "/dashboard/overview", icon: "M4 11l8-7 8 7v9h-5v-6H9v6H4z", exact: true },
  { label: "Events",   href: "/dashboard/events",   icon: "M4 6h16v14H4zM4 10h16M9 3v4M15 3v4" },
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

function StudioShell({ children }) {
  const pathname = usePathname();
  const router   = useRouter();
  const dispatch = useDispatch();
  const user     = useSelector((s) => s.auth?.user);
  const token    = useSelector((s) => s.auth?.token);

  const [isCollapsed, setIsCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

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
    if (!token) {
      router.replace(`/login?redirect=${encodeURIComponent(pathname)}`);
    }
  }, [token, pathname, router]);

  const handleLogout = () => {
    dispatch(signOut());
    router.push("/");
  };

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-brand" />
      </div>
    );
  }

  const communityName = user?.display_name || user?.displayName || user?.name || user?.handle || "Your community";
  const communityHref = user?.handle ? `/u/${user.handle}` : "/dashboard/profile";

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
            className="hidden h-[34px] w-[34px] items-center justify-center rounded-full text-muted transition-[background-color,scale] hover:bg-paper active:scale-[0.97] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand md:flex"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="4" width="18" height="16" rx="3" />
              <path d="M9 4v16" />
            </svg>
          </button>
        )}

        {closeMobile && (
          <button
            onClick={closeMobile}
            className="flex h-[34px] w-[34px] items-center justify-center rounded-full text-muted hover:bg-paper md:hidden"
            aria-label="Close menu"
          >
            <HugeiconsIcon icon={Cancel01Icon} size={18} color="currentColor" />
          </button>
        )}
      </div>

      <Link
        href={communityHref}
        title={collapsed ? communityName : "View your community page"}
        className={`flex h-14 shrink-0 items-center rounded-xl border border-line bg-white transition-[background-color,scale] hover:bg-paper active:scale-[0.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
          collapsed ? "justify-center" : "gap-2.5 px-2.5"
        }`}
      >
        <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink font-display text-sm font-bold text-white">
          {communityName.trim().charAt(0).toUpperCase()}
        </span>
        {!collapsed && (
          <>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm font-extrabold">{communityName}</span>
              <span className="text-xs text-muted">Organiser</span>
            </span>
            <span className="flex text-[#8A91A0]">
              <Stroke d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6" size={15} />
            </span>
          </>
        )}
      </Link>

      <nav aria-label="Dashboard" className="flex flex-col gap-0.5">
        {NAV.map((item) => {
          const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : ""}
              aria-current={active ? "page" : undefined}
              className={`flex h-[42px] items-center rounded-xl text-[15px] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
                collapsed ? "justify-center" : "gap-3 px-3"
              } ${active ? "bg-[#EEF3FF] font-extrabold text-brand-dark" : "font-semibold text-[#3B4252] hover:bg-paper"}`}
            >
              <span className={active ? "text-brand-dark" : "text-muted"}>
                <Stroke d={item.icon} />
              </span>
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      <div className="flex-1" />

      <Link
        href="/home"
        title={collapsed ? "Switch to attending" : ""}
        className={`flex h-[42px] shrink-0 items-center rounded-xl text-sm font-bold text-muted transition-colors hover:bg-paper focus:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
          collapsed ? "justify-center" : "gap-3 px-3"
        }`}
      >
        <Stroke d="M7 7h11l-3-3M17 17H6l3 3" />
        {!collapsed && <span>Switch to attending</span>}
      </Link>
    </>
  );

  const sidebarPad = "flex flex-col gap-[18px] px-3.5 pb-5 pt-[18px]";

  return (
    <div className="flex h-screen overflow-hidden bg-white">

      <aside className={`${sidebarPad} hidden shrink-0 border-r border-hairline bg-white transition-[width] duration-300 md:flex ${
        isCollapsed ? "w-[76px]" : "w-[248px]"
      }`}>
        {renderSidebarContent(isCollapsed)}
      </aside>

      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-[2px] transition-opacity duration-300"
            onClick={() => setMobileOpen(false)}
          />
          <aside className={`${sidebarPad} relative z-10 h-full w-[264px] max-w-[84vw] bg-white shadow-2xl animate-slide-in-left`}>
            {renderSidebarContent(false, () => setMobileOpen(false))}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">

        <header className="flex h-16 shrink-0 items-center gap-3 border-b border-hairline bg-white px-4 sm:px-8 lg:px-12">
          <button
            onClick={() => setMobileOpen(true)}
            className="rounded-lg p-2 text-muted transition-colors hover:bg-paper hover:text-ink md:hidden"
            aria-label="Open menu"
          >
            <HugeiconsIcon icon={Menu01Icon} size={20} color="currentColor" />
          </button>

          <label className="flex h-10 w-full max-w-[380px] items-center gap-2 rounded-full border border-paper bg-paper px-3.5 focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/25">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5B6272" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.5-3.5" />
            </svg>
            <input
              type="search"
              placeholder="Search events, people, orders"
              aria-label="Search the dashboard"
              className="w-full min-w-0 bg-transparent text-sm text-ink placeholder:text-muted focus:outline-none"
            />
          </label>

          <div className="flex-1" />
          <NotificationBell />
          <UserMenu user={user} onLogout={handleLogout} size="sm" />
        </header>

        <main className="flex-1 overflow-y-auto bg-white">
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
