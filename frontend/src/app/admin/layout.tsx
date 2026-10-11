"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Calendar03Icon,
  DashboardSquare01Icon,
  Wallet01Icon,
  Money01Icon,
  CreditCardIcon,
  Coupon01Icon,
  Clock01Icon,
  Activity01Icon,
  UserMultipleIcon,
  UserGroupIcon,
  Menu01Icon,
  Cancel01Icon,
} from "@hugeicons/core-free-icons";
import { resolveAdminHref } from "@/lib/adminNav";
import NotificationBell from "@/components/admin/NotificationBell";
import { AdminMeContext, ROLE_LABEL, type AdminMe } from "@/components/admin/AdminMe";

const navItems = [
  { label: "Overview", href: "/", icon: DashboardSquare01Icon },
  { label: "Events", href: "/events", icon: Calendar03Icon },
  { label: "Users", href: "/users", icon: UserMultipleIcon },
  { label: "Payments", href: "/payments", icon: CreditCardIcon },
  { label: "Payouts", href: "/payouts", icon: Wallet01Icon },
  { label: "Refunds", href: "/refunds", icon: Money01Icon },
  { label: "Promo codes", href: "/promos", icon: Coupon01Icon },
  { label: "Activity", href: "/activity", icon: Activity01Icon },
  { label: "Audit log", href: "/audit-log", icon: Clock01Icon },
  { label: "Team", href: "/team", icon: UserGroupIcon },
];

// Grouped by what the admin is doing: looking at the platform, moving money, or checking who did what.
const navGroups = [
  { title: null, items: navItems.slice(0, 3) },
  { title: "Finance", items: navItems.slice(3, 7) },
  { title: "Oversight", items: navItems.slice(7) },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/admin" || pathname === "/admin/";
  return pathname.startsWith(`/admin${href}`);
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [me, setMe] = useState<AdminMe | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const isLoginPage = pathname === "/admin/login" || pathname === "/login";

  // Close the mobile drawer whenever the route changes
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    setMobileOpen(false);
  }

  // Who is signed in and what their role allows. Anyone who isn't on the admin
  // team (or whose session has ended) goes back to the sign-in page.
  useEffect(() => {
    if (isLoginPage) return;
    let cancelled = false;
    fetch("/api/admin/me")
      .then(async (res) => {
        if (res.ok) {
          if (!cancelled) setMe(await res.json());
          return;
        }
        await fetch("/api/admin-auth", { method: "DELETE" });
        router.replace(resolveAdminHref(pathname, "/login"));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [isLoginPage, pathname, router]);

  const signOut = async () => {
    await fetch("/api/admin-auth", { method: "DELETE" });
    router.replace(resolveAdminHref(pathname, "/login"));
  };

  // Reflect the current admin section in the browser tab title
  useEffect(() => {
    const page = navItems.find((item) => isActive(pathname, item.href));
    document.title = page ? `${page.label} · Byro Admin` : "Byro Admin";
  }, [pathname]);

  const sidebarContent = (
    <>
      <div className="px-5 pt-6 pb-5 flex items-center gap-2.5">
        <Image
          src="/assets/images/logo.svg"
          alt="Byro"
          width={60}
          height={24}
          className="h-6 w-auto"
        />
        <span className="font-display text-[11px] font-bold text-white bg-ink px-2 py-0.5 rounded-full">
          Admin
        </span>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-4">
        {navGroups.map((group, i) => (
          <div key={i} className={i === 0 ? "" : "mt-5"}>
            {group.title && (
              <p className="px-3 pb-1.5 text-xs font-bold text-faint">{group.title}</p>
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const active = isActive(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={resolveAdminHref(pathname, item.href)}
                    aria-current={active ? "page" : undefined}
                    className={`relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
                      active
                        ? "bg-brand/10 font-bold text-brand-dark"
                        : "font-semibold text-muted hover:bg-mist hover:text-ink"
                    }`}
                  >
                    {active && (
                      <span className="absolute -left-3 top-2 bottom-2 w-1 rounded-r-full bg-brand" />
                    )}
                    <HugeiconsIcon icon={item.icon} size={17} color="currentColor" />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {me && (
        <div className="m-3 rounded-2xl bg-mist px-4 py-3.5">
          <p className="text-ink text-[13px] font-bold truncate" title={me.email}>{me.email}</p>
          <div className="flex items-center justify-between mt-1.5">
            <span className="text-[11px] font-bold text-brand-dark bg-white px-2 py-0.5 rounded-full border border-line">
              {ROLE_LABEL[me.role]}
            </span>
            <button onClick={signOut} className="text-xs font-bold text-muted hover:text-ink">
              Sign out
            </button>
          </div>
        </div>
      )}
    </>
  );

  // The login page renders its own full-screen layout — showing the
  // authenticated sidebar/topbar behind it leaks the nav to logged-out
  // visitors and looks broken while the password form is unauthenticated.
  if (isLoginPage) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-paper flex">
      <aside className="hidden md:flex w-60 shrink-0 bg-white border-r border-line flex-col sticky top-0 h-screen">
        {sidebarContent}
      </aside>

      <div className="md:hidden fixed top-0 inset-x-0 z-40 h-14 bg-white border-b border-line flex items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <Image
            src="/assets/images/logo.svg"
            alt="Byro"
            width={52}
            height={20}
            className="h-5 w-auto"
          />
          <span className="font-display text-[10px] font-bold text-white bg-ink px-2 py-0.5 rounded-full">
            Admin
          </span>
        </div>
        <div className="flex items-center gap-1">
          <NotificationBell />
          <button
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
            className="text-ink p-1"
          >
            <HugeiconsIcon icon={Menu01Icon} size={22} color="currentColor" />
          </button>
        </div>
      </div>

      <div className="hidden md:flex fixed top-0 right-0 left-60 z-30 h-14 bg-white/85 backdrop-blur border-b border-line items-center justify-end px-6">
        <NotificationBell />
      </div>

      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div
            className="absolute inset-0 bg-ink/40"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative w-72 bg-white border-r border-line flex flex-col">
            <button
              onClick={() => setMobileOpen(false)}
              aria-label="Close menu"
              className="absolute top-5 right-4 text-muted hover:text-ink"
            >
              <HugeiconsIcon icon={Cancel01Icon} size={18} color="currentColor" />
            </button>
            {sidebarContent}
          </aside>
        </div>
      )}

      <main className="flex-1 overflow-y-auto min-w-0 pt-14">
        <AdminMeContext.Provider value={me}>{children}</AdminMeContext.Provider>
      </main>
    </div>
  );
}
