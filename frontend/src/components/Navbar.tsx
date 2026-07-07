"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { useWeb3AuthConnect, useWeb3AuthDisconnect, useIdentityToken } from "@web3auth/modal/react";
import { usePathname, useRouter } from "next/navigation";
import { useSelector, useDispatch } from "react-redux";
import { toast } from "react-toastify";
import API from "@/services/api";
import { signOut, authSuccess } from "@/redux/auth/authSlice";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const navLinks = [
  { label: "Discover", href: "/discover" },
  { label: "Events", href: "/events" },
  { label: "Pricing", href: "/pricing" },
  { label: "Blog", href: "/blog" },
];

const Navbar = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const { connect, isConnected, loading: connectLoading } = useWeb3AuthConnect();
  const { disconnect } = useWeb3AuthDisconnect();
  const { getIdentityToken } = useIdentityToken();
  const pathname = usePathname();
  const [isProfileDropdownOpen, setIsProfileDropdownOpen] = useState(false);
  const profileDropdownRef = useRef<HTMLDivElement>(null);
  const dispatch = useDispatch();
  const router = useRouter();
  const { user, token } = useSelector(
    (state: { auth: { user: { display_name?: string; email?: string } | null; token: string | null } }) => state.auth
  );
  const isLoggedIn = !!token;

  const exchangeWithBackend = useCallback(async () => {
    try {
      const idToken = await getIdentityToken();
      if (!idToken) return false;
      const res = await fetch(`${API_URL}auth/social/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "web3auth", token: idToken }),
      });
      const data = await res.json();
      if (data.success) {
        API.setAuthToken(data.tokens.access);
        dispatch(authSuccess({ user: data.user, token: data.tokens.access }));
        return true;
      }
      console.error("[Auth] backend rejected:", data.error);
      await disconnect();
      return false;
    } catch (err) {
      console.error("[Auth] exchange failed:", err);
      await disconnect();
      return false;
    }
  }, [getIdentityToken, disconnect, dispatch]);

  const handleSignIn = async () => {
    setIsSigningIn(true);
    try {
      const provider = await connect();
      if (!provider) return;
      const success = await exchangeWithBackend();
      if (success) {
        router.push("/events");
      } else {
        toast.error("Sign in failed. Please try again.");
      }
    } catch (err) {
      console.error("[Auth] sign in failed:", err);
      toast.error("Sign in failed. Please try again.");
    } finally {
      setIsSigningIn(false);
    }
  };

  useEffect(() => {
    if (isConnected && !token) {
      exchangeWithBackend();
    }
  }, [isConnected, token, exchangeWithBackend]);

  useEffect(() => {
    if (token) {
      API.setAuthToken(token);
    }
  }, [token]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        profileDropdownRef.current &&
        !profileDropdownRef.current.contains(event.target as Node)
      ) {
        setIsProfileDropdownOpen(false);
      }
    }
    if (isProfileDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isProfileDropdownOpen]);

  const isActive = (href: string) => pathname === href;

  const handleLogout = async () => {
    await disconnect();
    dispatch(signOut());
    setIsProfileDropdownOpen(false);
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
            {navLinks.map((link) => (
              <Link
                key={link.label}
                href={link.href}
                className={`text-sm font-medium transition-colors ${
                  isActive(link.href)
                    ? "text-blue-600"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                {link.label}
              </Link>
            ))}
          </div>

          {/* Search Bar */}
          <div className="flex-1 max-w-md mx-8">
            <div className="relative">
              <input
                type="text"
                placeholder="Search events"
                className="w-full bg-gray-50 border border-gray-200 text-black rounded-full py-2 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <svg
                className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="M21 21l-4.35-4.35" />
              </svg>
            </div>
          </div>

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
                <div className="relative" ref={profileDropdownRef}>
                  <button
                    onClick={() => setIsProfileDropdownOpen(!isProfileDropdownOpen)}
                    className="w-9 h-9 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-medium hover:bg-blue-700 transition-colors"
                  >
                    {user?.display_name?.charAt(0)?.toUpperCase() || user?.email?.charAt(0)?.toUpperCase() || "U"}
                  </button>
                  {isProfileDropdownOpen && (
                    <div className="absolute right-0 mt-2 w-56 bg-white border border-gray-100 rounded-xl shadow-lg z-50 overflow-hidden">
                      <div className="p-3 border-b border-gray-100">
                        <p className="font-semibold text-gray-900 text-sm">{user?.display_name || "User"}</p>
                        <p className="text-xs text-gray-500 truncate">{user?.email || ""}</p>
                      </div>
                      <div className="p-2">
                        <Link
                          href="/profile"
                          className="block px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-lg"
                          onClick={() => setIsProfileDropdownOpen(false)}
                        >
                          Profile
                        </Link>
                        <Link
                          href="/events"
                          className="block px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-lg"
                          onClick={() => setIsProfileDropdownOpen(false)}
                        >
                          My Events
                        </Link>
                        <button
                          onClick={handleLogout}
                          className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg"
                        >
                          Log Out
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                <button
                  onClick={handleSignIn}
                  disabled={connectLoading || isSigningIn}
                  className="text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors disabled:opacity-50"
                >
                  {connectLoading || isSigningIn ? "Signing in..." : "Sign in"}
                </button>
                <Link
                  href="/events/create"
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
                <div className="relative" ref={profileDropdownRef}>
                  <button
                    onClick={() => setIsProfileDropdownOpen(!isProfileDropdownOpen)}
                    className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-medium"
                  >
                    {user?.display_name?.charAt(0)?.toUpperCase() || user?.email?.charAt(0)?.toUpperCase() || "U"}
                  </button>
                  {isProfileDropdownOpen && (
                    <div className="absolute right-0 mt-2 w-56 bg-white border border-gray-100 rounded-xl shadow-lg z-50 overflow-hidden">
                      <div className="p-3 border-b border-gray-100">
                        <p className="font-semibold text-gray-900 text-sm">{user?.display_name || "User"}</p>
                        <p className="text-xs text-gray-500 truncate">{user?.email || ""}</p>
                      </div>
                      <div className="p-2">
                        <Link
                          href="/profile"
                          className="block px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-lg"
                          onClick={() => setIsProfileDropdownOpen(false)}
                        >
                          Profile
                        </Link>
                        <Link
                          href="/events"
                          className="block px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-lg"
                          onClick={() => setIsProfileDropdownOpen(false)}
                        >
                          My Events
                        </Link>
                        <button
                          onClick={handleLogout}
                          className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg"
                        >
                          Log Out
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                <button
                  onClick={handleSignIn}
                  disabled={connectLoading || isSigningIn}
                  className="text-sm font-medium text-gray-700"
                >
                  Sign in
                </button>
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
              {navLinks.map((link) => (
                <Link
                  key={link.label}
                  href={link.href}
                  className="block px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 rounded-lg"
                  onClick={() => setIsMenuOpen(false)}
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </nav>
  );
};

export default Navbar;
