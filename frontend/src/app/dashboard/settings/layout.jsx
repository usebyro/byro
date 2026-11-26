"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/redux/useAuth";
import "./settings.css";

const TABS = [
  { label: "Account", href: "/dashboard/settings/account" },
  { label: "Notifications", href: "/dashboard/settings/notifications" },
  { label: "Team", href: "/dashboard/settings/team" },
  { label: "Privacy", href: "/dashboard/settings/privacy" },
];

export default function SettingsLayout({ children }) {
  const pathname = usePathname();
  const { user } = useAuth();
  const community = user?.display_name || user?.displayName || user?.name || "your community";
  const subs = {
    "/dashboard/settings/account": "Your sign-in details and where your times are shown.",
    "/dashboard/settings/notifications": "Everything shows in your notification bell. Choose which emails you get as well.",
    "/dashboard/settings/team": `People who help run ${community}. Only you can manage payouts.`,
    "/dashboard/settings/privacy": "What other people can see, and your data.",
  };
  return (
    <div className="mx-auto flex w-full max-w-[1240px] flex-col gap-6 px-4 pb-12 pt-2 sm:px-[clamp(16px,3vw,40px)]">
      <div className="v-bf flex flex-col gap-3.5" style={{ "--i": 0 }}>
        <div className="flex flex-col gap-1.5">
          <h1 className="v-h1">Settings</h1>
          <p className="v-sub">{subs[pathname] || ""}</p>
        </div>
        <nav aria-label="Settings" className="v-seg max-w-full flex-nowrap self-start overflow-x-auto">
          {TABS.map((t) => {
            const here = pathname === t.href;
            return (
              <Link
                key={t.href}
                href={t.href}
                aria-current={here ? "page" : undefined}
                className={`inline-flex h-9 items-center rounded-full px-4 text-[14px] font-bold no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
                  here ? "bg-white text-ink shadow-[0_1px_2px_rgba(20,22,28,.08)]" : "text-[#5B6272]"
                }`}
              >
                {t.label}
              </Link>
            );
          })}
        </nav>
      </div>
      {children}
    </div>
  );
}
