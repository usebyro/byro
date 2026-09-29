"use client";
import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSelector, useDispatch } from "react-redux";
import API from "@/services/api";
import axiosInstance from "@/utils/axios";
import { signOut, authSuccess } from "@/redux/auth/authSlice";
import UserMenu from "@/components/auth/UserMenu";

type NavLink = { label: string; href: string; authOnly?: boolean };

const navLinks: NavLink[] = [
  { label: "Discover", href: "/discover" },
  { label: "Communities", href: "/communities" },
  { label: "Events", href: "/home", authOnly: true },
  { label: "Pricing", href: "/pricing" },
  { label: "Blog", href: "/blog" },
];

const Navbar = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const pathname = usePathname();
  const dispatch = useDispatch();
  const { user, token } = useSelector(
    (state: { auth: { user: { display_name?: string; email?: string } | null; token: unknown } }) => state.auth
  );
  const isLoggedIn = !!token;
  const createHref = isLoggedIn ? "/events/create" : "/login?redirect=/events/create";
  const links = navLinks.filter((l) => !l.authOnly || isLoggedIn);

  useEffect(() => {
    if (token) API.setAuthToken(token);
  }, [token]);

  // Revalidate the session on load; axios.jsx refreshes an expired access token
  // and signs out on a hard failure.
  useEffect(() => {
    if (!token) return;
    axiosInstance
      .get("auth/me/")
      .then(({ data }) => dispatch(authSuccess({ user: data.user, token })))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setIsMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!isMenuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsMenuOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isMenuOpen]);

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const handleLogout = () => dispatch(signOut());

  const pill =
    "rounded-full border border-hairline bg-white/85 shadow-[0_8px_30px_rgba(20,22,28,0.05)] backdrop-blur";

  return (
    <div className="sticky top-0 z-50 px-3 pt-3 font-body md:px-8 md:pt-5 xl:px-16">
      <nav aria-label="Main" className="mx-auto max-w-[1312px]">
        <div className={`${pill} flex h-14 items-center gap-2 pl-4 pr-1.5 md:h-16 md:gap-7 md:pl-6 md:pr-2.5`}>
          <Link href="/" className="flex shrink-0" aria-label="byro home">
            <Image src="/assets/images/logo.svg" alt="byro" width={63} height={36} className="h-7 w-auto md:h-9" priority />
          </Link>

          <ul className="hidden items-center gap-1 text-[15px] font-semibold md:flex">
            {links.map((l) => (
              <li key={l.label}>
                <Link
                  href={l.href}
                  aria-current={isActive(l.href) ? "page" : undefined}
                  className={`flex h-10 items-center rounded-full px-3.5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
                    isActive(l.href) ? "bg-mist text-ink" : "text-muted hover:text-ink"
                  }`}
                >
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>

          <div className="flex-1" />

          {isLoggedIn ? (
            <>
              <Link
                href={createHref}
                className="hidden h-11 items-center rounded-full bg-ink px-5 text-[15px] font-bold text-white transition-[filter,scale] hover:brightness-125 active:scale-[0.96] md:flex"
              >
                Create an event
              </Link>
              <UserMenu user={user} onLogout={handleLogout} />
            </>
          ) : (
            <>
              <Link href="/login" className="px-2 text-sm font-semibold text-ink md:px-1 md:text-[15px]">
                Sign in
              </Link>
              <Link
                href={createHref}
                className="hidden h-11 items-center rounded-full bg-ink px-5 text-[15px] font-bold text-white transition-[filter,scale] hover:brightness-125 active:scale-[0.96] md:flex"
              >
                Create an event
              </Link>
            </>
          )}

          <button
            type="button"
            aria-label={isMenuOpen ? "Close menu" : "Open menu"}
            aria-expanded={isMenuOpen}
            aria-controls="mobile-menu"
            onClick={() => setIsMenuOpen((o) => !o)}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-ink transition-[scale] active:scale-[0.96] md:hidden"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2.2" strokeLinecap="round">
              {isMenuOpen ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 9h16M4 15h16" />}
            </svg>
          </button>
        </div>

        {isMenuOpen && (
          <div
            id="mobile-menu"
            className="mt-2 rounded-3xl border border-hairline bg-white p-3 shadow-[0_20px_50px_rgba(20,22,28,0.12)] md:hidden"
          >
            <ul className="flex flex-col">
              {links.map((l) => (
                <li key={l.label}>
                  <Link
                    href={l.href}
                    aria-current={isActive(l.href) ? "page" : undefined}
                    className={`flex h-12 items-center rounded-2xl px-4 text-base font-semibold ${
                      isActive(l.href) ? "bg-mist text-ink" : "text-muted"
                    }`}
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
            <Link
              href={createHref}
              className="mt-2 flex h-12 items-center justify-center rounded-full bg-ink text-base font-bold text-white"
            >
              Create an event
            </Link>
          </div>
        )}
      </nav>
    </div>
  );
};

export default Navbar;
