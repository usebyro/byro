import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/")
  .replace(/\/+$/, "") + "/";

// POST /api/admin-auth/send  {email, turnstile_token}  →  emails a sign-in code.
// Server-side relay so the admin subdomain never needs cross-origin access to
// the API. Django answers the same whether or not the address has an account.
export async function POST(request: NextRequest) {
  const { email, turnstile_token } = await request.json().catch(() => ({}));
  const res = await fetch(`${API_BASE}auth/magic/send/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, turnstile_token }),
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
