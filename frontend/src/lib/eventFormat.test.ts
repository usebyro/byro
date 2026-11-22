import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isPast } from "./eventFormat";

// This is what decides which events the "More to go to" row leaves out.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-20T19:00:00Z")); // 8pm in Lagos on Fri 20 Nov
});
afterEach(() => vi.useRealTimers());

describe("isPast", () => {
  it("keeps a later day and drops an earlier one", () => {
    expect(isPast({ day: "2026-11-28", time_from: "15:00:00", time_to: "18:00:00" })).toBe(false);
    expect(isPast({ day: "2026-11-10", time_from: "15:00:00", time_to: "18:00:00" })).toBe(true);
  });

  it("keeps today's event while it is still running, and drops it once it ends", () => {
    expect(isPast({ day: "2026-11-20", time_from: "18:00:00", time_to: "21:00:00" })).toBe(false);
    expect(isPast({ day: "2026-11-20", time_from: "16:00:00", time_to: "19:30:00" })).toBe(true);
  });

  it("keeps an event with no end time until the end of its day", () => {
    expect(isPast({ day: "2026-11-20", time_from: "18:00:00" })).toBe(false);
  });

  it("keeps an event that runs past midnight until the morning", () => {
    expect(isPast({ day: "2026-11-20", time_from: "22:00:00", time_to: "02:00:00" })).toBe(false);
  });

  it("never drops an event whose date is missing", () => {
    expect(isPast({ day: "", time_from: "" })).toBe(false);
  });
});
