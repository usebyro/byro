import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ value: { user: null as { id: number } | null, isAuthenticated: false, ready: true } }));
const path = vi.hoisted(() => ({ value: "/" }));
vi.mock("@/redux/useAuth", () => ({ useAuth: () => auth.value }));
vi.mock("next/navigation", () => ({ usePathname: () => path.value }));

import AnalyticsGate from "./AnalyticsGate";
import { CONSENT_KEY } from "@/lib/consent";
import { GA_MEASUREMENT_ID } from "@/lib/analytics";

const calls = () => (window as unknown as { gtag: ReturnType<typeof vi.fn> }).gtag.mock.calls;
const lastSet = () => calls().filter((c: unknown[]) => c[0] === "set").at(-1);
const allow = (analytics: boolean) => window.localStorage.setItem(CONSENT_KEY, JSON.stringify({ analytics, marketing: false }));

beforeEach(() => {
  (window as unknown as { gtag: unknown }).gtag = vi.fn();
  (window as unknown as Record<string, unknown>)[`ga-disable-${GA_MEASUREMENT_ID}`] = false;
  auth.value = { user: { id: 99 }, isAuthenticated: true, ready: true };
  path.value = "/home";
});

describe("AnalyticsGate", () => {
  it("sets user_id to the internal id when signed in with analytics consent", () => {
    allow(true);
    render(<AnalyticsGate />);
    expect(lastSet()).toEqual(["set", { user_id: "99" }]);
  });

  it("doesn't set user_id without analytics consent", () => {
    allow(false);
    render(<AnalyticsGate />);
    expect(lastSet()).toEqual(["set", { user_id: null }]);
  });

  it("clears user_id when signed out", () => {
    allow(true);
    auth.value = { user: null, isAuthenticated: false, ready: true };
    render(<AnalyticsGate />);
    expect(lastSet()).toEqual(["set", { user_id: null }]);
  });

  it("never sends the email or phone as the id", () => {
    allow(true);
    auth.value = { user: { id: 5, email: "a@b.com", phone: "0800" } as never, isAuthenticated: true, ready: true };
    render(<AnalyticsGate />);
    expect(JSON.stringify(calls())).not.toContain("a@b.com");
    expect(lastSet()).toEqual(["set", { user_id: "5" }]);
  });

  it("switches GA off on staff pages, and leaves organiser pages tracked", () => {
    path.value = "/admin/users";
    window.history.replaceState(null, "", "/admin/users");
    const { unmount } = render(<AnalyticsGate />);
    expect((window as unknown as Record<string, unknown>)[`ga-disable-${GA_MEASUREMENT_ID}`]).toBe(true);
    unmount();

    path.value = "/dashboard/events";
    window.history.replaceState(null, "", "/dashboard/events");
    render(<AnalyticsGate />);
    expect((window as unknown as Record<string, unknown>)[`ga-disable-${GA_MEASUREMENT_ID}`]).toBe(false);
  });
});
