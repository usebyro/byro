"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Calendar03Icon,
  DashboardSquare01Icon,
  Wallet01Icon,
  Menu01Icon,
  Cancel01Icon,
} from "@hugeicons/core-free-icons";
import { resolveAdminHref } from "@/lib/adminNav";

const navItems = [
  { label: "Dashboard", href: "/", icon: DashboardSquare01Icon },
  { label: "Events", href: "/events", icon: Calendar03Icon },
  { label: "Payouts", href: "/payouts", icon: Wallet01Icon },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/admin" || pathname === "/admin/";
  return pathname.startsWith(`/admin${href}`);
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close the mobile drawer whenever the route changes
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    setMobileOpen(false);
  }

  // Reflect the current admin section in the browser tab title
  useEffect(() => {
    const page = navItems.find((item) => isActive(pathname, item.href));
    document.title = page ? `${page.label} · Byro Admin` : "Byro Admin";
  }, [pathname]);

  const sidebarContent = (
    <>
      {/* Logo */}
      <div className="px-5 py-5 border-b border-white/10 flex items-center gap-2">
        <Image
          src="/assets/images/logo.svg"
          alt="Byro"
          width={60}
          height={24}
          className="h-6 w-auto brightness-0 invert"
        />
        <span className="text-xs text-gray-500 bg-white/5 px-2 py-0.5 rounded-full">
          Admin
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={resolveAdminHref(pathname, item.href)}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                active
                  ? "bg-blue-600/20 text-blue-400"
                  : "text-gray-400 hover:text-white hover:bg-white/5"
              }`}
            >
              <HugeiconsIcon icon={item.icon} size={16} color="currentColor" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </>
  );

  return (
    <div className="min-h-screen bg-[#0f1117] flex">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-56 shrink-0 bg-[#1a1d27] border-r border-white/10 flex-col">
        {sidebarContent}
      </aside>

      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 inset-x-0 z-40 h-14 bg-[#1a1d27] border-b border-white/10 flex items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <Image
            src="/assets/images/logo.svg"
            alt="Byro"
            width={52}
            height={20}
            className="h-5 w-auto brightness-0 invert"
          />
          <span className="text-[10px] text-gray-500 bg-white/5 px-2 py-0.5 rounded-full">
            Admin
          </span>
        </div>
        <button
          onClick={() => setMobileOpen(true)}
          aria-label="Open menu"
          className="text-gray-300 hover:text-white p-1"
        >
          <HugeiconsIcon icon={Menu01Icon} size={22} color="currentColor" />
        </button>
      </div>

      {/* Mobile drawer + backdrop */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative w-64 bg-[#1a1d27] border-r border-white/10 flex flex-col">
            <button
              onClick={() => setMobileOpen(false)}
              aria-label="Close menu"
              className="absolute top-5 right-4 text-gray-400 hover:text-white"
            >
              <HugeiconsIcon icon={Cancel01Icon} size={18} color="currentColor" />
            </button>
            {sidebarContent}
          </aside>
        </div>
      )}

      {/* Main content */}
      <main className="flex-1 overflow-y-auto min-w-0 pt-14 md:pt-0">
        {children}
      </main>
    </div>
  );
}
