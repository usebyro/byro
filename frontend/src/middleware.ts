import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const hostname = request.headers.get("host") || "";
  const pathname = request.nextUrl.pathname;

  const isAdminSubdomain = hostname.startsWith("admin.");

  if (!isAdminSubdomain) return NextResponse.next();

  // Every response served from the admin subdomain must tell search engines
  // not to index it — it's internal-only and has shown up in Google results.
  const withNoIndex = (res: NextResponse) => {
    res.headers.set("X-Robots-Tag", "noindex, nofollow");
    return res;
  };

  // Skip Next.js internals and API routes (API routes map to /api directly)
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/assets") ||
    pathname.startsWith("/api/")
  ) {
    return withNoIndex(NextResponse.next());
  }

  // Already rewritten internally — don't double-prefix
  if (pathname.startsWith("/admin")) {
    return withNoIndex(NextResponse.next());
  }

  // Rewrite subdomain path to /admin/* internally
  const rewritePath = pathname === "/" ? "/admin" : `/admin${pathname}`;
  return withNoIndex(NextResponse.rewrite(new URL(rewritePath, request.url)));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
