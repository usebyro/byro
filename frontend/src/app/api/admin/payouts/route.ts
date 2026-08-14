import { NextResponse } from "next/server";
import { cookies } from "next/headers";

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/")
  .replace(/\/+$/, "") + "/";

// GET /api/admin/payouts  →  proxies GET /api/admin/payouts/ with X-Admin-Token.
// The admin_token cookie is set (httpOnly) after a correct password login and
// equals ADMIN_SECRET, so we forward it as the backend's X-Admin-Token.
export async function GET() {
  const token = (await cookies()).get("admin_token")?.value;
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const res = await fetch(`${API_BASE}admin/payouts/`, {
    headers: { "X-Admin-Token": token },
    cache: "no-store",
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
