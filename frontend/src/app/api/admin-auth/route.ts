import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { clearAdminCookies, setAdminCookies } from "@/lib/adminProxy";

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/")
  .replace(/\/+$/, "") + "/";

// POST /api/admin-auth  {email, code}  →  sign in with a WorkOS magic code.
// The code is verified by Django; we then ask Django whether this person is on
// the admin team and only then keep their tokens (httpOnly cookies).
export async function POST(request: NextRequest) {
  const { email, code } = await request.json().catch(() => ({}));
  if (!email || !code) {
    return NextResponse.json({ error: "Email and code are required." }, { status: 400 });
  }

  const verify = await fetch(`${API_BASE}auth/magic/verify/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, code }),
    cache: "no-store",
  });
  const session = await verify.json().catch(() => ({}));
  const access = session?.tokens?.access;
  const refresh = session?.tokens?.refresh;
  if (!verify.ok || !access || !refresh) {
    return NextResponse.json({ error: "That code didn't work. Try again." }, { status: 401 });
  }

  const me = await fetch(`${API_BASE}admin/me/`, {
    headers: { Authorization: `Bearer ${access}` },
    cache: "no-store",
  });
  if (!me.ok) {
    // Signed in fine, but not on the admin team. Keep nothing.
    return NextResponse.json(
      { error: "This account doesn't have admin access." },
      { status: 403 },
    );
  }

  const res = NextResponse.json({ success: true, ...(await me.json()) });
  setAdminCookies(res, access, refresh);
  return res;
}

// DELETE /api/admin-auth  →  sign out
export async function DELETE() {
  const res = NextResponse.json({ success: true });
  clearAdminCookies(res);
  return res;
}
