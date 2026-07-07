"use client";

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
  Notification01Icon,
  Ticket01Icon,
} from "@hugeicons/core-free-icons";
import { useWeb3AuthDisconnect } from "@web3auth/modal/react";
import { Providers } from "@/redux/Providers";
import { useSelector, useDispatch } from "react-redux";
import { signOut } from "@/redux/auth/authSlice";
import UserMenu from "@/components/auth/UserMenu";

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

  const handleLogout = async () => {
    await disconnect();
    dispatch(signOut());
    router.push("/");
  };

  return (
    <div className="flex h-screen overflow-hidden bg-[#F5F7FB]">

      {/* ── White sidebar ── */}
      <aside className="w-[220px] bg-white border-r border-gray-100 flex flex-col shrink-0">

        {/* Logo */}
        <div className="px-5 h-[60px] flex items-center gap-2.5 border-b border-gray-100 shrink-0">
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

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {NAV.map((item) => {
            const active = item.exact
              ? pathname === item.href
              : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-colors ${
                  active
                    ? "bg-[#4F6EF7] text-white"
                    : "text-gray-500 hover:text-gray-800 hover:bg-gray-50"
                }`}
              >
                <HugeiconsIcon icon={item.icon} size={16} color="currentColor" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Back to site */}
        <div className="px-3 pb-5 pt-3 border-t border-gray-100 shrink-0">
          <Link
            href="/"
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium text-gray-400 hover:text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <HugeiconsIcon icon={ArrowLeft01Icon} size={16} color="currentColor" />
            Back to site
          </Link>
        </div>
      </aside>

      {/* ── Main ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Top bar */}
        <header className="h-[60px] bg-white border-b border-gray-100 flex items-center px-6 gap-4 shrink-0">
          <div className="flex-1 flex justify-center">
            <div className="relative w-full max-w-sm">
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                width="13" height="13" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" strokeWidth="2"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" />
              </svg>
              <input
                type="search"
                placeholder="Search events, attendees..."
                className="w-full pl-9 pr-4 py-2 bg-[#F5F7FB] border border-gray-100 rounded-xl text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
              />
            </div>
          </div>
          <button className="relative p-2 text-gray-400 hover:text-gray-600 rounded-xl hover:bg-gray-50 transition-colors">
            <HugeiconsIcon icon={Notification01Icon} size={18} color="currentColor" />
          </button>
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
