"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// A tab appears here once its page exists.
const TABS = [
  { label: "Account", href: "/dashboard/settings/account" },
  { label: "Notifications", href: "/dashboard/settings/notifications" },
  { label: "Privacy", href: "/dashboard/settings/privacy" },
];

export default function SettingsLayout({ children }) {
  const pathname = usePathname();
  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-5 px-4 pb-12 pt-4 sm:px-[clamp(16px,3vw,40px)] md:pt-2">
      <h1 className="v-h1">Settings</h1>
      {TABS.length > 1 && (
        <nav aria-label="Settings" className="-mx-1 flex gap-1 overflow-x-auto px-1">
          {TABS.map((t) => {
            const here = pathname === t.href;
            return (
              <Link
                key={t.href}
                href={t.href}
                aria-current={here ? "page" : undefined}
                className={`flex h-10 shrink-0 items-center rounded-full px-4 text-[14px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand motion-reduce:transition-none ${
                  here ? "bg-ink text-white" : "text-[#5B6272] hover:bg-[#EAEEF5]"
                }`}
              >
                {t.label}
              </Link>
            );
          })}
        </nav>
      )}
      {children}
    </div>
  );
}
