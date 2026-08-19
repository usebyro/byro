"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSelector, useDispatch } from "react-redux";
import { HugeiconsIcon } from "@hugeicons/react";
import { CompassIcon, UserGroupIcon, Calendar02Icon } from "@hugeicons/core-free-icons";
import API from "@/services/api";
import axiosInstance from "@/utils/axios";
import { signOut, authSuccess } from "@/redux/auth/authSlice";
import UserMenu from "@/components/auth/UserMenu";

type NavLink = {
  label: string;
  href: string;
  icon: typeof CompassIcon;
  disabled?: boolean;
};

const navLinks: NavLink[] = [
  { label: "Discover", href: "/discover", icon: CompassIcon },
  { label: "Events", href: "/home", icon: Calendar02Icon },
  { label: "Communities", href: "/communities", icon: UserGroupIcon },
];

const Navbar = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const pathname = usePathname();
  const dispatch = useDispatch();
  const router = useRouter();
  const { user, token } = useSelector(
    (state: { auth: { user: { display_name?: string; email?: string } | null; token: unknown } }) => state.auth
  );
  const isLoggedIn = !!token;

  useEffect(() => {
    if (token) {
      API.setAuthToken(token);
    }
  }, [token]);

  // Revalidate the session on load — also proactively refreshes an expired
  // access token via axios.jsx's interceptor before any other request needs it.
  useEffect(() => {
    if (!token) return;
    axiosInstance
      .get("auth/me/")
      .then(({ data }) => {
        dispatch(authSuccess({ user: data.user, token }));
      })
      .catch(() => {
        // A hard failure here (refresh also failed) already triggers
        // sign-out via axios.jsx's response interceptor.
      });
    // Only ever needs to run once per mount, not on every token write.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isActive = (href: string) => pathname === href;

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = searchQuery.trim();
    router.push(trimmed ? `/discover?search=${encodeURIComponent(trimmed)}` : "/discover");
  };

  const pathnameRef = useRef(pathname);
  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  // Live-filter Discover as the user types, without waiting for submit.
  // Skip the very first run so mounting with an empty query doesn't
  // clobber a ?search= param the user arrived with via a direct link.
  const skippedInitialSearchEffect = useRef(false);
  useEffect(() => {
    if (!skippedInitialSearchEffect.current) {
      skippedInitialSearchEffect.current = true;
      return;
    }
    if (pathnameRef.current !== "/discover") return;
    const trimmed = searchQuery.trim();
    const handle = setTimeout(() => {
      router.replace(trimmed ? `/discover?search=${encodeURIComponent(trimmed)}` : "/discover");
    }, 300);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  const handleLogout = () => {
    dispatch(signOut());
  };

  return (
    <nav className="bg-white border-b border-gray-100 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="hidden lg:flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex-shrink-0">
            <Image
              src="/assets/images/logo.svg"
              alt="byro"
              width={80}
              height={32}
              className="h-8 w-auto"
              priority
            />
          </Link>

          {/* Nav Links */}
          <div className="flex items-center space-x-6">
            {navLinks
              .filter((link) => link.label !== "Events" || isLoggedIn)
              .map((link) => {
              const isDisabled = link.disabled;
              return isDisabled ? (
                <span
                  key={link.label}
                  aria-disabled="true"
                  title="Coming soon"
                  className="flex items-center gap-1.5 text-sm font-medium text-gray-300 cursor-not-allowed select-none"
                >
                  {link.icon && <HugeiconsIcon icon={link.icon} size={16} color="currentColor" />}
                  {link.label}
                </span>
              ) : (
                <Link
                  key={link.label}
                  href={link.href}
                  className={`flex items-center gap-1.5 text-sm font-medium transition-colors ${
                    isActive(link.href)
                      ? "text-blue-600"
                      : "text-gray-600 hover:text-gray-900"
                  }`}
                >
                  {link.icon && <HugeiconsIcon icon={link.icon} size={16} color="currentColor" />}
                  {link.label}
                </Link>
              );
            })}
          </div>

          {/* Search Bar */}
          {pathname !== "/" && (
            <form onSubmit={handleSearchSubmit} className="flex-1 max-w-md mx-8">
              <div className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search events"
                  className="w-full bg-gray-50 border border-gray-200 text-black rounded-full py-2 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <button
                  type="submit"
                  aria-label="Search"
                  className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="8" />
                    <path d="M21 21l-4.35-4.35" />
                  </svg>
                </button>
              </div>
            </form>
          )}

          {/* Right Actions */}
          <div className="flex items-center space-x-4">
            {isLoggedIn ? (
              <>
                <Link
                  href="/events/create"
                  className="bg-blue-600 text-white text-sm font-medium py-2 px-4 rounded-full hover:bg-blue-700 transition-colors flex items-center gap-2"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                  Create event
                </Link>
                <UserMenu user={user} onLogout={handleLogout} />
              </>
            ) : (
              <>
                <Link
                  href="/login"
                  className="text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors"
                >
                  Sign in
                </Link>
                <Link
                  href="/login?redirect=/events/create"
                  className="bg-blue-600 text-white text-sm font-medium py-2 px-4 rounded-full hover:bg-blue-700 transition-colors flex items-center gap-2"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                  Create event
                </Link>
              </>
            )}
          </div>
        </div>

        {/* Mobile View */}
        <div className="lg:hidden flex items-center justify-between h-14">
          <Link href="/" className="flex-shrink-0">
            <Image
              src="/assets/images/logo.svg"
              alt="byro"
              width={60}
              height={24}
              className="h-6 w-auto"
              priority
            />
          </Link>
          <div className="flex items-center space-x-3">
            {isLoggedIn ? (
              <>
                <Link
                  href="/events/create"
                  className="bg-blue-600 text-white text-xs font-medium py-1.5 px-3 rounded-full"
                >
                  + Create
                </Link>
                <UserMenu user={user} onLogout={handleLogout} size="sm" />
              </>
            ) : (
              <>
                <Link href="/login" className="text-sm font-medium text-gray-700">
                  Sign in
                </Link>
                <button
                  onClick={() => setIsMenuOpen(!isMenuOpen)}
                  className="text-gray-600 p-1"
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    {isMenuOpen ? (
                      <path d="M6 18L18 6M6 6l12 12" />
                    ) : (
                      <path d="M4 6h16M4 12h16M4 18h16" />
                    )}
                  </svg>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Mobile Menu */}
        {isMenuOpen && !isLoggedIn && (
          <div className="lg:hidden pb-4 border-t border-gray-100">
            <div className="pt-4 space-y-2">
              {navLinks
                .filter((link) => link.label !== "Events")
                .map((link) => {
                const isDisabled = link.disabled;
                return isDisabled ? (
                  <span
                    key={link.label}
                    aria-disabled="true"
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-300 cursor-not-allowed select-none"
                  >
                    {link.icon && <HugeiconsIcon icon={link.icon} size={16} color="currentColor" />}
                    {link.label}
                  </span>
                ) : (
                  <Link
                    key={link.label}
                    href={link.href}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 rounded-lg"
                    onClick={() => setIsMenuOpen(false)}
                  >
                    {link.icon && <HugeiconsIcon icon={link.icon} size={16} color="currentColor" />}
                    {link.label}
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </nav>
  );
};

export default Navbar;
