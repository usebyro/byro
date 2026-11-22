import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import { shareDescription } from "./eventShare";

const event = (over = {}) => ({
  day: "2026-11-28", time_from: "15:00:00", time_to: "18:00:00", timezone: "Africa/Lagos",
  location: "Abuja", ticket_price: "10000.00", tiers: [], ...over,
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-20T12:00:00Z"));
});
afterEach(() => vi.useRealTimers());

describe("shareDescription", () => {
  it("upcoming with no description invites people to get a ticket", () => {
    expect(shareDescription(event())).toMatch(/Get your ticket on Byro\.$/);
  });

  it("ended with no description uses neutral wording", () => {
    const text = shareDescription(event({ day: "2026-11-10" }));
    expect(text).toMatch(/See details and browse upcoming events on Byro\.$/);
    expect(text).not.toMatch(/Get your ticket/);
  });

  it("cancelled with no description uses neutral wording too", () => {
    expect(shareDescription(event({ cancelled_at: "2026-11-15T09:00:00Z" }))).toMatch(/browse upcoming events/);
  });

  it("leaves an organiser-written description untouched, ended or not", () => {
    const written = "<p>An evening of painting.</p>";
    expect(shareDescription(event({ description: written }))).toMatch(/An evening of painting\.$/);
    expect(shareDescription(event({ day: "2026-11-10", description: written }))).toMatch(/An evening of painting\.$/);
  });
});
