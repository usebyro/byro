import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/")
  .replace(/\/+$/, "") + "/";

export const ACCESS_COOKIE = "admin_access";
export const REFRESH_COOKIE = "admin_refresh";

const cookieOpts = (maxAge: number) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge,
});

export function setAdminCookies(res: NextResponse, access: string, refresh: string) {
  res.cookies.set(ACCESS_COOKIE, access, cookieOpts(60 * 60 * 24));
  res.cookies.set(REFRESH_COOKIE, refresh, cookieOpts(60 * 60 * 24 * 30));
}

export function clearAdminCookies(res: NextResponse) {
  res.cookies.delete(ACCESS_COOKIE);
  res.cookies.delete(REFRESH_COOKIE);
}

async function refreshTokens(refresh: string): Promise<{ access: string; refresh: string } | null> {
  try {
    const res = await fetch(`${API_BASE}auth/refresh/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refresh }),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = await res.json();
    const t = data?.tokens;
    return t?.access && t?.refresh ? { access: t.access, refresh: t.refresh } : null;
  } catch {
    return null;
  }
}

/**
 * Forward an admin-panel request to Django as the signed-in WorkOS user.
 *
 * Reads the httpOnly access/refresh cookies, refreshes once on a 401, and
 * re-sets the cookies on the response when it did. Django decides what the
 * user's admin role may do; this never grants anything itself.
 */
export async function adminProxy(
  req: NextRequest,
  path: string,
  opts: { method?: string; passQuery?: boolean; body?: boolean } = {},
): Promise<NextResponse> {
  let access = req.cookies.get(ACCESS_COOKIE)?.value;
  let refresh = req.cookies.get(REFRESH_COOKIE)?.value;
  let rotated = false;

  if (!access && !refresh) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const method = opts.method ?? req.method;
  const body = opts.body === false || method === "GET" || method === "DELETE" ? undefined : await req.text();
  const url = `${API_BASE}${path}${opts.passQuery === false ? "" : req.nextUrl.search}`;

  const call = (token: string) =>
    fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body,
      cache: "no-store",
    });

  if (!access && refresh) {
    const t = await refreshTokens(refresh);
    if (!t) return unauthorized();
    access = t.access;
    refresh = t.refresh;
    rotated = true;
  }

  let res = await call(access!);
  if (res.status === 401 && refresh && !rotated) {
    const t = await refreshTokens(refresh);
    if (!t) return unauthorized();
    access = t.access;
    refresh = t.refresh;
    rotated = true;
    res = await call(access);
  }

  const out =
    res.status === 204
      ? new NextResponse(null, { status: 204 })
      : NextResponse.json(await res.json().catch(() => ({})), { status: res.status });
  if (rotated && access && refresh) setAdminCookies(out, access, refresh);
  return out;
}

function unauthorized() {
  const res = NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  clearAdminCookies(res);
  return res;
}
