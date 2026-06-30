import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const hostname = request.headers.get("host") || "";
  const pathname = request.nextUrl.pathname;

  const isAdminSubdomain =
    hostname.startsWith("admin.") ||
    // Local dev: access via localhost:3000/admin directly (no rewrite needed)
    (process.env.NODE_ENV === "development" && false);

  if (!isAdminSubdomain) return NextResponse.next();

  // Skip rewrites for Next.js internals
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/assets")
  ) {
    return NextResponse.next();
  }

  // Check admin auth (skip for login page and the auth API route)
  const isPublic =
    pathname === "/login" ||
    pathname.startsWith("/api/admin-auth");

  if (!isPublic) {
    const token = request.cookies.get("admin_token")?.value;
    if (!token || token !== process.env.ADMIN_SECRET) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/login";
      return NextResponse.redirect(loginUrl);
    }
  }

  // Rewrite subdomain path to /admin/* internally
  const rewritePath = pathname === "/" ? "/admin" : `/admin${pathname}`;
  return NextResponse.rewrite(new URL(rewritePath, request.url));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
