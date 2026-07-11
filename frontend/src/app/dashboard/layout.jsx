"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Home01Icon,
  QrCodeIcon,
  Money01Icon,
  Settings01Icon,
  ArrowLeft01Icon,
  Ticket01Icon,
  Menu01Icon,
  Cancel01Icon,
} from "@hugeicons/core-free-icons";
import { useWeb3AuthDisconnect } from "@web3auth/modal/react";
import { Providers } from "@/redux/Providers";
import { useSelector, useDispatch } from "react-redux";
import { signOut } from "@/redux/auth/authSlice";
import UserMenu from "@/components/auth/UserMenu";
import NotificationBell from "@/components/dashboard/NotificationBell";

const NAV = [
  { label: "Dashboard", href: "/dashboard",         icon: Home01Icon,     exact: true },
  { label: "Events",    href: "/dashboard/events",   icon: Ticket01Icon },
  { label: "Check-in", href: "/dashboard/check-in", icon: QrCodeIcon },
  { label: "Payouts",  href: "/dashboard/payouts",  icon: Money01Icon },
  { label: "Settings", href: "/dashboard/settings", icon: Settings01Icon },
];

function StudioShell({ children }) {
  const pathname = usePathname();
  const router   = useRouter();
  const dispatch = useDispatch();
  const user     = useSelector((s) => s.auth?.user);
  const { disconnect } = useWeb3AuthDisconnect();

  const [isCollapsed, setIsCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close the mobile drawer whenever the route changes
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    setMobileOpen(false);
  }

  const handleLogout = async () => {
    await disconnect();
    dispatch(signOut());
    router.push("/");
  };

  const renderSidebarContent = (collapsed, closeMobile = null) => {
    return (
      <>
        {/* Logo / Header */}
        <div className={`h-[60px] flex items-center border-b border-gray-100 shrink-0 px-4 ${collapsed ? "justify-center" : "justify-between"}`}>
          {!collapsed && (
            <div className="flex items-center gap-2">
              <Image
                src="/assets/images/logo.svg"
                alt="Byro"
                width={52}
                height={20}
                className="h-[18px] w-auto"
              />
              <span className="text-[9px] font-bold text-[#4F6EF7] bg-[#EEF2FF] px-2 py-0.5 rounded tracking-widest uppercase">
                Studio
              </span>
            </div>
          )}
          
          {/* Desktop collapse button */}
          {!closeMobile && (
            <button
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="hidden md:flex p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-50 transition-colors"
              title={collapsed ? "Expand menu" : "Collapse menu"}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                {collapsed ? <path d="M9 5l7 7-7 7" /> : <path d="M15 19l-7-7 7-7" />}
              </svg>
            </button>
          )}

          {/* Mobile close button */}
          {closeMobile && (
            <button
              onClick={closeMobile}
              className="md:hidden p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-50 transition-colors"
              title="Close menu"
            >
              <HugeiconsIcon icon={Cancel01Icon} size={18} color="currentColor" />
            </button>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
          {NAV.map((item) => {
            const active = item.exact
              ? pathname === item.href
              : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                title={collapsed ? item.label : ""}
                className={`flex items-center rounded-lg text-[13px] font-medium transition-all duration-200 ${
                  collapsed ? "justify-center p-2" : "gap-2.5 px-3 py-2"
                } ${
                  active
                    ? "bg-[#4F6EF7] text-white shadow-sm shadow-[#4F6EF7]/20"
                    : "text-gray-500 hover:text-gray-800 hover:bg-gray-50"
                }`}
              >
                <HugeiconsIcon icon={item.icon} size={15} color="currentColor" className="shrink-0" />
                {!collapsed && <span>{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* Back to site */}
        <div className={`border-t border-gray-100 shrink-0 ${collapsed ? "p-2 text-center" : "px-3 pb-4 pt-2.5"}`}>
          <Link
            href="/"
            title={collapsed ? "Back to site" : ""}
            className={`flex items-center rounded-lg text-[13px] font-medium text-gray-400 hover:text-gray-700 hover:bg-gray-50 transition-colors ${
              collapsed ? "justify-center p-2" : "gap-2.5 px-3 py-2"
            }`}
          >
            <HugeiconsIcon icon={ArrowLeft01Icon} size={15} color="currentColor" className="shrink-0" />
            {!collapsed && <span>Back to site</span>}
          </Link>
        </div>
      </>
    );
  };

  return (
    <div className="flex h-screen overflow-hidden bg-[#F5F7FB]">

      {/* Desktop sidebar */}
      <aside className={`bg-white border-r border-gray-100 flex flex-col shrink-0 transition-all duration-300 ${
        isCollapsed ? "w-[72px]" : "w-[220px]"
      } hidden md:flex`}>
        {renderSidebarContent(isCollapsed)}
      </aside>

      {/* Mobile drawer + backdrop */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-[2px] transition-opacity duration-300"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative w-[240px] max-w-[80vw] bg-white h-full flex flex-col z-10 shadow-2xl animate-slide-in-left">
            {renderSidebarContent(false, () => setMobileOpen(false))}
          </aside>
        </div>
      )}

      {/* ── Main ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Top bar */}
        <header className="h-[56px] bg-white border-b border-gray-100 flex items-center px-4 sm:px-6 gap-2 sm:gap-4 shrink-0">
          
          {/* Mobile hamburger button */}
          <button
            onClick={() => setMobileOpen(true)}
            className="md:hidden p-2 text-gray-500 hover:text-gray-800 rounded-lg hover:bg-gray-50 transition-colors"
            aria-label="Open menu"
          >
            <HugeiconsIcon icon={Menu01Icon} size={20} color="currentColor" />
          </button>

          <div className="flex-1 flex justify-start">
            <div className="relative w-full max-w-[240px]">
              <svg
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400"
                width="13" height="13" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" strokeWidth="2"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" />
              </svg>
              <input
                type="search"
                placeholder="Search..."
                className="w-full pl-8 pr-4 py-1.5 bg-[#F5F7FB] border border-gray-100/50 rounded-lg text-xs text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#4F6EF7]/20 transition-all"
              />
            </div>
          </div>
          <NotificationBell />
          <UserMenu
            user={user}
            onLogout={handleLogout}
            eventsHref="/dashboard/events"
            eventsLabel="Events"
            size="sm"
          />
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
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
