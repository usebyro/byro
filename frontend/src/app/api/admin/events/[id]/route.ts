import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { cookies } from "next/headers";

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/")
  .replace(/\/+$/, "") + "/";

// PATCH /api/admin/events/:id  →  proxies PATCH /api/admin/events/:id/.
// Forwards the httpOnly admin_token cookie (== ADMIN_SECRET) as X-Admin-Token.
// Body: { is_active?: boolean }
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

  const res = await fetch(`${API_BASE}admin/events/${id}/`, {
    method: "PATCH",
    headers: { "X-Admin-Token": token, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

// DELETE /api/admin/events/:id  →  proxies DELETE /api/admin/events/:id/.
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = (await cookies()).get("admin_token")?.value;
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const res = await fetch(`${API_BASE}admin/events/${id}/`, {
    method: "DELETE",
    headers: { "X-Admin-Token": token },
  });
  if (res.status === 204) {
    return new NextResponse(null, { status: 204 });
  }
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
