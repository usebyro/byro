"use client";

import Link from "next/link";
import { User, Ticket, LogOut } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

function getInitial(user) {
  return (
    user?.display_name?.charAt(0)?.toUpperCase() ||
    user?.displayName?.charAt(0)?.toUpperCase() ||
    user?.name?.charAt(0)?.toUpperCase() ||
    user?.email?.charAt(0)?.toUpperCase() ||
    "U"
  );
}

export default function UserMenu({
  user,
  onLogout,
  eventsHref = "/events",
  eventsLabel = "My Events",
  size = "md",
  className = "",
}) {
  const sizeClasses = size === "sm" ? "w-8 h-8 text-xs" : "w-9 h-9 text-sm";
  const avatarUrl = user?.avatar_url || user?.avatarUrl || null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Account menu"
          className={cn(
            "rounded-full text-white flex items-center justify-center font-medium shrink-0 select-none overflow-hidden",
            !avatarUrl && "bg-gradient-to-br from-violet-500 to-purple-700",
            "hover:opacity-90 transition-opacity focus:outline-none focus:ring-2 focus:ring-blue-200",
            sizeClasses,
            className
          )}
        >
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            getInitial(user)
          )}
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
          <Link href="/profile">
            <User size={15} />
            Profile
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href={eventsHref}>
            <Ticket size={15} />
            {eventsLabel}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={onLogout}>
          <LogOut size={15} />
          Log Out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
