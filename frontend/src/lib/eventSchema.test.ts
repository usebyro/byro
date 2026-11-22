import { describe, expect, it } from "vitest";
import { buildEventJsonLd } from "./eventSchema";

const SITE = "https://www.usebyro.com";
const URL = `${SITE}/discover/abc`;
const event = {
  name: "Paint & Yap",
  description: "<p>An evening of painting.</p>",
  day: "2026-11-28",
  time_from: "15:00:00",
  time_to: "18:00:00",
  timezone: "Africa/Lagos",
  location: "Abuja",
  hosted_by: "The Buj Playhouse",
  owner_handle: "the-buj-playhouse",
  ticket_price: "10000.00",
  event_image_url: "https://img.example/e.png",
};
const before = new Date("2026-11-20T12:00:00Z");
const after = new Date("2026-12-05T12:00:00Z");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const build = (e: object, now: Date) => buildEventJsonLd(e, URL, SITE, now) as Record<string, any>;

describe("Event JSON-LD", () => {
  it("upcoming: scheduled, with the ticket offer and the original dates", () => {
    const ld = build(event, before);
    expect(ld.eventStatus).toBe("https://schema.org/EventScheduled");
    expect(ld.startDate).toBe("2026-11-28T15:00:00");
    expect(ld.endDate).toBe("2026-11-28T18:00:00");
    expect(ld.offers).toMatchObject({ price: "10000.00", priceCurrency: "NGN", availability: "https://schema.org/InStock" });
    expect(ld.organizer.url).toBe(`${SITE}/u/the-buj-playhouse`);
    expect(ld.image).toEqual(["https://img.example/e.png"]);
  });

  it("ended: still EventScheduled with the same dates, and no offer", () => {
    const ld = build(event, after);
    expect(ld.eventStatus).toBe("https://schema.org/EventScheduled");
    expect(ld.startDate).toBe("2026-11-28T15:00:00");
    expect(ld.endDate).toBe("2026-11-28T18:00:00");
    expect(ld.offers).toBeUndefined();
  });

  it("cancelled: EventCancelled and no offer, even before the date", () => {
    const ld = build({ ...event, cancelled_at: "2026-11-15T09:00:00Z" }, before);
    expect(ld.eventStatus).toBe("https://schema.org/EventCancelled");
    expect(ld.offers).toBeUndefined();
  });

  it("missing end time: uses the start to decide and keeps the start date", () => {
    const e = { ...event, time_to: undefined };
    expect(build(e, before).offers).toBeDefined();
    const ended = build(e, after);
    expect(ended.offers).toBeUndefined();
    expect(ended.startDate).toBe("2026-11-28T15:00:00");
    expect(ended.endDate).toBe("2026-11-28"); // falls back to the day, as before
  });

  it("escapes markup in event text so it can't break out of the script tag", async () => {
    const { serializeJsonLd } = await import("./eventSchema");
    const out = serializeJsonLd({ name: "</script><b>x</b> & y" });
    expect(out).not.toMatch(/[<>&]/);
  });

  it("returns nothing for a missing event", () => {
    expect(buildEventJsonLd(null, URL, SITE)).toBeNull();
  });
});
