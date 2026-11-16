import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "./middleware";

const call = (host: string, path: string) => middleware(new NextRequest(`https://${host}${path}`, { headers: { host } }));

describe("admin subdomain routing", () => {
  it("sends Sentry's tunnel straight through, signed in or not", () => {
    const res = call("admin.usebyro.com", "/monitoring");
    expect(res.headers.get("x-middleware-rewrite")).toBeNull();
    expect(res.headers.get("location")).toBeNull();
  });

  it("still rewrites admin pages to /admin and sends signed-out visitors to login", () => {
    const signedOut = call("admin.usebyro.com", "/payouts");
    expect(signedOut.headers.get("location")).toBe("https://admin.usebyro.com/login");
    const req = new NextRequest("https://admin.usebyro.com/payouts", { headers: { host: "admin.usebyro.com", cookie: "admin_access=x" } });
    expect(middleware(req).headers.get("x-middleware-rewrite")).toContain("/admin/payouts");
  });

  it("leaves the public site alone", () => {
    const res = call("usebyro.com", "/discover");
    expect(res.headers.get("x-middleware-rewrite")).toBeNull();
    expect(res.headers.get("location")).toBeNull();
  });
});
