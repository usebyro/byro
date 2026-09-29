import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { cookies } from "next/headers";

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/")
  .replace(/\/+$/, "") + "/";

// GET /api/admin/events/:id/attendees  →  proxies GET /api/admin/events/:slug/attendees/.
// Despite the folder name (kept as `id` to match the sibling PATCH/DELETE
// route, which Next.js requires dynamic segments at the same level to
// agree on), the value passed here is the event's slug.
//
// Forwards the httpOnly admin_token cookie (== ADMIN_SECRET) as X-Admin-Token,
// so the admin panel can see attendees for any event, not just ones the
// platform admin happens to own or co-host (which the JWT-authenticated
// /api/events/:slug/attendees/ endpoint is restricted to).
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = (await cookies()).get("admin_token")?.value;
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: slug } = await params;
  const query = request.nextUrl.search;

  const res = await fetch(`${API_BASE}admin/events/${slug}/attendees/${query}`, {
    headers: { "X-Admin-Token": token },
    cache: "no-store",
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
