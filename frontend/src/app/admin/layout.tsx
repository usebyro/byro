"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Calendar03Icon,
  Logout03Icon,
  DashboardSquare01Icon,
} from "@hugeicons/core-free-icons";

const navItems = [
  { label: "Events", href: "/admin/events", icon: Calendar03Icon },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = async () => {
    await fetch("/api/admin-auth", { method: "DELETE" });
    router.replace("/admin/login");
  };

  return (
    <div className="min-h-screen bg-[#0f1117] flex">
      {/* Sidebar */}
      <aside className="w-56 bg-[#1a1d27] border-r border-white/10 flex flex-col">
        {/* Logo */}
        <div className="px-5 py-5 border-b border-white/10">
          <span className="text-white font-bold text-base">Byro</span>
          <span className="ml-2 text-xs text-gray-500 bg-white/5 px-2 py-0.5 rounded-full">
            Admin
          </span>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
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

        {/* Logout */}
        <div className="px-3 py-4 border-t border-white/10">
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2 w-full rounded-lg text-sm text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
          >
            <HugeiconsIcon icon={Logout03Icon} size={16} color="currentColor" />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
