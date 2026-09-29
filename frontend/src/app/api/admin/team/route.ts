import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { cookies } from "next/headers";

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/")
  .replace(/\/+$/, "") + "/";

// GET /api/admin/team  →  proxies GET /api/admin/team/.
// Forwards the httpOnly admin_token cookie (== ADMIN_SECRET) as X-Admin-Token.
export async function GET() {
  const token = (await cookies()).get("admin_token")?.value;
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const res = await fetch(`${API_BASE}admin/team/`, {
    headers: { "X-Admin-Token": token },
    cache: "no-store",
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

// POST /api/admin/team  →  proxies POST /api/admin/team/. Body: { email: string }
export async function POST(request: NextRequest) {
  const token = (await cookies()).get("admin_token")?.value;
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();

  const res = await fetch(`${API_BASE}admin/team/`, {
    method: "POST",
    headers: { "X-Admin-Token": token, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
