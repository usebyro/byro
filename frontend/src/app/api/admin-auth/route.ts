import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// POST /api/admin-auth  →  login
export async function POST(request: NextRequest) {
  const { password } = await request.json();

  if (!process.env.ADMIN_SECRET || password !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }

  const response = NextResponse.json({ success: true });
  response.cookies.set("admin_token", process.env.ADMIN_SECRET, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });
  return response;
}

// DELETE /api/admin-auth  →  logout
export async function DELETE() {
  const response = NextResponse.json({ success: true });
  response.cookies.delete("admin_token");
  return response;
}
