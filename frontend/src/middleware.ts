import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// A valid admin session is the httpOnly `admin_token` cookie whose value
// matches ADMIN_SECRET (set by POST /api/admin-auth after a correct password).
function isAuthed(request: NextRequest) {
  const token = request.cookies.get("admin_token")?.value;
  const secret = process.env.ADMIN_SECRET;
  return Boolean(secret) && token === secret;
}

export function middleware(request: NextRequest) {
  const hostname = request.headers.get("host") || "";
  const pathname = request.nextUrl.pathname;

  const isAdminSubdomain = hostname.startsWith("admin.");
  const isAdminPath = pathname === "/admin" || pathname.startsWith("/admin/");

  // Not the admin area at all → nothing to do.
  if (!isAdminSubdomain && !isAdminPath) return NextResponse.next();

  const withNoIndex = (res: NextResponse) => {
    // The admin area is internal-only and must never be indexed.
    res.headers.set("X-Robots-Tag", "noindex, nofollow");
    return res;
  };

  // Always let Next.js internals and API routes through.
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/assets") ||
    pathname.startsWith("/api/")
  ) {
    return withNoIndex(NextResponse.next());
  }

  // --- Path-based access on the main domain (e.g. usebyro.com/admin/...) ----
  if (!isAdminSubdomain) {
    const isLogin = pathname === "/admin/login";
    if (!isLogin && !isAuthed(request)) {
      return withNoIndex(NextResponse.redirect(new URL("/admin/login", request.url)));
    }
    return withNoIndex(NextResponse.next());
  }

  // --- Subdomain access (admin.usebyro.com/...) -----------------------------
  // On the subdomain the public path is unprefixed: "/", "/login", "/payouts".
  const isLogin = pathname === "/login" || pathname === "/admin/login";
  if (!isLogin && !isAuthed(request)) {
    return withNoIndex(NextResponse.redirect(new URL("/login", request.url)));
  }

  // Already rewritten internally — don't double-prefix.
  if (pathname.startsWith("/admin")) {
    return withNoIndex(NextResponse.next());
  }

  // Rewrite subdomain path to /admin/* internally.
  const rewritePath = pathname === "/" ? "/admin" : `/admin${pathname}`;
  return withNoIndex(NextResponse.rewrite(new URL(rewritePath, request.url)));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
