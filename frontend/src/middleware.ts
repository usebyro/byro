import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const hostname = request.headers.get("host") || "";
  const pathname = request.nextUrl.pathname;

  const isAdminSubdomain = hostname.startsWith("admin.");

  if (!isAdminSubdomain) return NextResponse.next();

  // Skip rewrites for Next.js internals
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/assets")
  ) {
    return NextResponse.next();
  }

  // Rewrite subdomain path to /admin/* internally
  const rewritePath = pathname === "/" ? "/admin" : `/admin${pathname}`;
  return NextResponse.rewrite(new URL(rewritePath, request.url));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
