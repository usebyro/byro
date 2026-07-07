import { NextResponse } from "next/server";

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/")
  .replace(/\/+$/, "") + "/";

// GET /api/admin/payouts  →  proxies GET /api/admin/payouts/ with X-Admin-Token.
// The admin section has no login gate yet, so this uses the server's own
// ADMIN_SECRET rather than a per-session cookie/token.
export async function GET() {
  const res = await fetch(`${API_BASE}admin/payouts/`, {
    headers: { "X-Admin-Token": process.env.ADMIN_SECRET || "" },
    cache: "no-store",
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
