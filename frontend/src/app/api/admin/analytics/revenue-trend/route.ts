import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { cookies } from "next/headers";

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/")
  .replace(/\/+$/, "") + "/";

// GET /api/admin/analytics/revenue-trend?days=N
//   →  proxies GET /api/admin/analytics/revenue-trend/?days=N.
// Forwards the httpOnly admin_token cookie (== ADMIN_SECRET) as X-Admin-Token.
export async function GET(request: NextRequest) {
  const token = (await cookies()).get("admin_token")?.value;
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const days = request.nextUrl.searchParams.get("days") || "30";

  const res = await fetch(
    `${API_BASE}admin/analytics/revenue-trend/?days=${encodeURIComponent(days)}`,
    {
      headers: { "X-Admin-Token": token },
      cache: "no-store",
    }
  );
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
