/**
 * Has an event ended, or been cancelled? One answer for the page, its structured data and its robots tag.
 *
 * "Ended" is the event's end date and time read in the event's own timezone (the organiser's, saved with
 * the event, Africa/Lagos when it isn't a usable zone). With no end time the event runs to the end of its
 * START DAY (23:59:59), so a 6pm event is still on at 8pm. Anything we can't read counts as NOT ended,
 * so a missing or odd value never makes an upcoming event look finished.
 */

export type EventTiming = {
  day?: string | null;
  time_from?: string | null;
  time_to?: string | null;
  timezone?: string | null;
  cancelled_at?: string | null;
};

export type EventState = "upcoming" | "ended" | "cancelled";

// Byro is a Nigerian product. Events saved with an old text label ("GMT+0:00 Lagos") use this.
const FALLBACK_ZONE = "Africa/Lagos";

function validZone(zone?: string | null): string {
  if (zone) {
    try {
      new Intl.DateTimeFormat("en", { timeZone: zone });
      return zone;
    } catch {
      // not an IANA name: use the fallback below
    }
  }
  return FALLBACK_ZONE;
}

/** How far ahead of UTC `zone` is at the instant `utcMs`, in milliseconds. */
function zoneOffsetMs(utcMs: number, zone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(utcMs));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

/** The instant a wall-clock date and time happens in `zone`, or null if it can't be read. */
function wallClockToInstant(day: string, time: string, zone: string): number | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})/.exec(day);
  const t = /^(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(time);
  if (!d || !t) return null;
  const naive = Date.UTC(+d[1], +d[2] - 1, +d[3], +t[1], +t[2], +(t[3] || 0));
  if (Number.isNaN(naive)) return null;
  // Apply the zone's offset, then once more in case the offset differs at the corrected instant (DST).
  const first = naive - zoneOffsetMs(naive, zone);
  return naive - zoneOffsetMs(first, zone);
}

/** When the event ends, as a Date, or null when its date can't be read. */
export function eventEndsAt(event: EventTiming): Date | null {
  if (!event.day) return null;
  const zone = validZone(event.timezone);
  const start = event.time_from ? wallClockToInstant(event.day, event.time_from, zone) : null;
  let end = event.time_to ? wallClockToInstant(event.day, event.time_to, zone) : null;
  // No end time: the event runs to the end of its start day.
  if (end === null) end = wallClockToInstant(event.day, "23:59:59", zone);
  if (end === null) return null;
  // An event that runs past midnight has an end time earlier than its start time.
  if (start !== null && end < start) end += 24 * 60 * 60 * 1000;
  return new Date(end);
}

export function eventHasEnded(event: EventTiming, now: Date = new Date()): boolean {
  const end = eventEndsAt(event);
  return end !== null && now.getTime() > end.getTime();
}

export function eventState(event: EventTiming | null | undefined, now: Date = new Date()): EventState {
  if (!event) return "upcoming";
  if (event.cancelled_at) return "cancelled";
  return eventHasEnded(event, now) ? "ended" : "upcoming";
}
