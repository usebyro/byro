import { eventState, type EventTiming } from "./eventStatus";

/**
 * schema.org Event data for a public event page.
 *
 * Dates stay as the organiser set them. schema.org has no "ended" status, so a finished event stays
 * EventScheduled with its past dates; only a cancelled one says EventCancelled. Neither carries a
 * ticket offer, because there is nothing left to buy.
 */

type JsonLdEvent = EventTiming & {
  name?: string;
  description?: string;
  location?: string;
  virtual_link?: string | null;
  event_image_url?: string | null;
  event_image?: string | null;
  hosted_by?: string;
  owner_handle?: string;
  ticket_price?: number | string | null;
  created_at?: string | null;
};

export function toPlainText(html?: string | null): string {
  if (!html) return "";
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

/** Escape <, > and & so event-controlled text can't break out of the <script> tag. */
export function serializeJsonLd(obj: unknown): string {
  return JSON.stringify(obj).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
}

function combineDateTime(day?: string | null, t?: string | null) {
  if (!day) return null;
  if (!t) return day;
  return `${day}T${t.length === 5 ? `${t}:00` : t}`;
}

function resolveImageUrl(event: JsonLdEvent, apiBase?: string) {
  const raw = event.event_image_url || event.event_image;
  if (!raw) return null;
  if (raw.startsWith("http")) return raw;
  const base = (apiBase || "https://byro-production.up.railway.app").replace(/\/api\/?$/, "");
  return `${base}${raw}`;
}

export function buildEventJsonLd(
  event: JsonLdEvent | null | undefined,
  pageUrl: string,
  siteUrl: string,
  now: Date = new Date(),
  apiBase?: string,
) {
  if (!event) return null;
  const state = eventState(event, now);
  const isVirtual = Boolean(event.virtual_link);
  const organizerName = event.hosted_by || event.owner_handle;

  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: event.name || "Event",
    url: pageUrl,
    eventStatus: state === "cancelled" ? "https://schema.org/EventCancelled" : "https://schema.org/EventScheduled",
    eventAttendanceMode: isVirtual
      ? "https://schema.org/OnlineEventAttendanceMode"
      : "https://schema.org/OfflineEventAttendanceMode",
  };

  const description = toPlainText(event.description);
  if (description) jsonLd.description = description.slice(0, 500);

  const startDate = combineDateTime(event.day, event.time_from);
  if (startDate) jsonLd.startDate = startDate;
  const endDate = combineDateTime(event.day, event.time_to);
  if (endDate) jsonLd.endDate = endDate;

  const imageUrl = resolveImageUrl(event, apiBase);
  if (imageUrl) jsonLd.image = [imageUrl];

  if (isVirtual) {
    jsonLd.location = { "@type": "VirtualLocation", url: event.virtual_link };
  } else if (event.location) {
    jsonLd.location = { "@type": "Place", name: event.location, address: event.location };
  }

  if (organizerName) {
    jsonLd.organizer = {
      "@type": "Organization",
      name: organizerName,
      ...(event.owner_handle && { url: `${siteUrl}/u/${event.owner_handle}` }),
    };
  }

  const price = event.ticket_price != null ? String(event.ticket_price) : null;
  if (price != null && state === "upcoming") {
    jsonLd.offers = {
      "@type": "Offer",
      price,
      priceCurrency: "NGN",
      availability: "https://schema.org/InStock",
      url: pageUrl,
      ...(event.created_at ? { validFrom: event.created_at } : {}),
    };
  }

  return jsonLd;
}
