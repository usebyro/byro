"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Avatar from "@/components/ui/Avatar";
import { HugeiconsIcon } from "@hugeicons/react";
import { UserIcon, Logout01Icon, ArrowDataTransferHorizontalIcon, Passport01Icon } from "@hugeicons/core-free-icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

// Callers may still pass `size`; the avatar is one size now (a 44px touch target).
export default function UserMenu({
  user,
  onLogout,
  className = "",
}) {
  const sizeClasses = "w-11 h-11 text-sm";
  const avatarUrl = user?.avatar_url || user?.avatarUrl || null;
  // On the public site the menu offers a way into the organiser dashboard (the dashboard has its own way back).
  const inDashboard = (usePathname() || "").startsWith("/dashboard");
  const accountName = user?.display_name || user?.displayName || user?.name || user?.email || "";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Account menu"
          className={cn(
            "rounded-full flex items-center justify-center shrink-0 select-none overflow-hidden",
            "hover:opacity-90 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2",
            sizeClasses,
            className
          )}
        >
          <Avatar src={avatarUrl} name={accountName} className="w-full h-full rounded-full" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <p className="font-semibold text-gray-900 text-sm truncate">
            {user?.display_name || user?.displayName || user?.name || "User"}
          </p>
          <p className="text-xs text-gray-500 font-normal truncate">
            {user?.handle ? `@${user.handle}` : user?.email || ""}
          </p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/dashboard/profile">
            <HugeiconsIcon icon={UserIcon} size={15} color="currentColor" />
            Profile
          </Link>
        </DropdownMenuItem>
        {!inDashboard && (
          <DropdownMenuItem asChild>
            <Link href="/home?tab=passport">
              <HugeiconsIcon icon={Passport01Icon} size={15} color="currentColor" />
              Passport
            </Link>
          </DropdownMenuItem>
        )}
        {!inDashboard && (
          <DropdownMenuItem asChild>
            <Link href="/dashboard/overview">
              <HugeiconsIcon icon={ArrowDataTransferHorizontalIcon} size={15} color="currentColor" />
              Switch to hosting
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={onLogout}>
          <HugeiconsIcon icon={Logout01Icon} size={15} color="currentColor" />
          Log Out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
