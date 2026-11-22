import { describe, expect, it } from "vitest";
import { eventEndsAt, eventHasEnded, eventState } from "./eventStatus";

// 2026-11-20 is a Friday. Lagos is UTC+1 all year, so 20:00 there is 19:00 UTC.
const base = { day: "2026-11-20", time_from: "18:00:00", time_to: "20:00:00", timezone: "Africa/Lagos" };
const at = (iso: string) => new Date(iso);

describe("eventState", () => {
  it("is upcoming before the end time", () => {
    expect(eventState(base, at("2026-11-20T18:59:00Z"))).toBe("upcoming");
  });

  it("is ended after the end time, read in the event's own timezone", () => {
    // 19:01 UTC is 20:01 in Lagos: over. Read as UTC it would still be running.
    expect(eventState(base, at("2026-11-20T19:01:00Z"))).toBe("ended");
  });

  it("is cancelled when the organiser cancelled it, even before it starts", () => {
    expect(eventState({ ...base, cancelled_at: "2026-11-10T09:00:00Z" }, at("2026-11-15T09:00:00Z"))).toBe("cancelled");
  });

  it("with a start time but no end time, runs to the end of the start day", () => {
    const e = { day: "2026-11-20", time_from: "18:00:00", timezone: "Africa/Lagos" };
    expect(eventState(e, at("2026-11-20T19:00:00Z"))).toBe("upcoming"); // 8pm in Lagos
    expect(eventState(e, at("2026-11-20T22:58:00Z"))).toBe("upcoming"); // 23:58 in Lagos
    expect(eventState(e, at("2026-11-20T23:00:00Z"))).toBe("ended"); // midnight in Lagos
  });

  it("with no times at all, also runs to the end of the day", () => {
    const e = { day: "2026-11-20", timezone: "Africa/Lagos" };
    expect(eventState(e, at("2026-11-20T22:00:00Z"))).toBe("upcoming"); // 23:00 in Lagos
    expect(eventState(e, at("2026-11-20T23:00:00Z"))).toBe("ended"); // 00:00 next day
  });

  it("treats an event that runs past midnight as ending the next morning", () => {
    const e = { day: "2026-11-20", time_from: "22:00:00", time_to: "02:00:00", timezone: "Africa/Lagos" };
    expect(eventState(e, at("2026-11-21T00:30:00Z"))).toBe("upcoming"); // 01:30 in Lagos
    expect(eventState(e, at("2026-11-21T01:30:00Z"))).toBe("ended");
  });

  it("uses Lagos when the saved timezone is an old text label", () => {
    const e = { ...base, timezone: "GMT+0:00 Lagos" };
    expect(eventState(e, at("2026-11-20T19:01:00Z"))).toBe("ended");
  });

  it("honours another IANA timezone", () => {
    const e = { ...base, timezone: "America/New_York" }; // UTC-5 in November: 20:00 is 01:00 UTC next day
    expect(eventState(e, at("2026-11-21T00:30:00Z"))).toBe("upcoming");
    expect(eventState(e, at("2026-11-21T01:30:00Z"))).toBe("ended");
  });

  it("never calls an event ended when its date is missing or unreadable", () => {
    expect(eventState({}, at("2030-01-01T00:00:00Z"))).toBe("upcoming");
    expect(eventState({ day: "soon", time_from: "later" }, at("2030-01-01T00:00:00Z"))).toBe("upcoming");
    expect(eventState(null, at("2030-01-01T00:00:00Z"))).toBe("upcoming");
    expect(eventState(undefined, at("2030-01-01T00:00:00Z"))).toBe("upcoming");
  });

  it("reports the end instant", () => {
    expect(eventEndsAt(base)?.toISOString()).toBe("2026-11-20T19:00:00.000Z");
    expect(eventHasEnded(base, at("2026-11-20T19:00:00Z"))).toBe(false); // exactly at the end is not yet over
  });
});
