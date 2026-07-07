import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/")
  .replace(/\/+$/, "") + "/";

// PATCH /api/admin/payouts/:id  →  proxies PATCH /api/admin/payouts/:id/ with X-Admin-Token.
// The admin section has no login gate yet, so this uses the server's own
// ADMIN_SECRET rather than a per-session cookie/token.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();

  const res = await fetch(`${API_BASE}admin/payouts/${id}/`, {
    method: "PATCH",
    headers: { "X-Admin-Token": process.env.ADMIN_SECRET || "", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
