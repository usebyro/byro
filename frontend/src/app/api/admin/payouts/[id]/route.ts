import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { cookies } from "next/headers";

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/")
  .replace(/\/+$/, "") + "/";

// PATCH /api/admin/payouts/:id  →  proxies PATCH /api/admin/payouts/:id/.
// Forwards the httpOnly admin_token cookie (== ADMIN_SECRET) as X-Admin-Token.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = (await cookies()).get("admin_token")?.value;
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();

  const res = await fetch(`${API_BASE}admin/payouts/${id}/`, {
    method: "PATCH",
    headers: { "X-Admin-Token": token, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
