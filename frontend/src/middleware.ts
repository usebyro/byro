import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Admin pages need the httpOnly WorkOS cookies set by POST /api/admin-auth.
// This only checks they exist — Django verifies the token and the admin role
// on every API call, so a forged cookie opens an empty shell at most.
function isAuthed(request: NextRequest) {
  return Boolean(
    request.cookies.get("admin_access")?.value || request.cookies.get("admin_refresh")?.value,
  );
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
