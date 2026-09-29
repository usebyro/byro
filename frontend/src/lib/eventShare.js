// Server-side helpers for how an event looks when its link is shared
// (Open Graph / Twitter cards and the generated fallback image).

const API_BASE = (() => {
  const raw = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/+$/, "");
  return raw.endsWith("/api") ? raw + "/" : raw + "/api/";
})();

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://usebyro.com").replace(/\/+$/, "");

export async function fetchShareEvent(slug) {
  try {
    const res = await fetch(`${API_BASE}events/${slug}/`, { next: { revalidate: 60 } });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/** The uploaded event image as an absolute https URL, or null. */
export function shareImageUrl(event) {
  let raw = event?.event_image_url || event?.event_image;
  if (!raw) return null;
  if (!raw.startsWith("http")) {
    const base = (process.env.NEXT_PUBLIC_API_URL || "https://byro.onrender.com").replace(/\/api\/?$/, "");
    raw = `${base}${raw}`;
  }
  // Some apps refuse plain-http images. Keep http only for local development.
  if (raw.startsWith("http://") && !/^http:\/\/(localhost|127\.0\.0\.1)/.test(raw)) {
    raw = raw.replace("http://", "https://");
  }
  return raw;
}

export function plainText(html) {
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

/** "Sat, 12 Sep 2026 at 9:59 AM" (the date is a plain calendar day, so no timezone shift). */
export function whenText(event) {
  if (!event?.day) return "";
  const date = new Date(`${event.day}T00:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
  if (!event.time_from) return date;
  const [h, m] = event.time_from.split(":").map(Number);
  return `${date} at ${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

/** "Free", or "From ₦5,000" using the cheapest tier (or the flat price). */
export function priceText(event) {
  const tierPrices = (event?.tiers || []).map((t) => Number(t.price)).filter((n) => !Number.isNaN(n));
  const prices = tierPrices.length ? tierPrices : [Number(event?.ticket_price ?? 0)];
  const lowest = Math.min(...prices);
  if (!lowest) return "Free";
  const naira = `₦${new Intl.NumberFormat("en-NG", { maximumFractionDigits: 0 }).format(lowest)}`;
  return prices.length > 1 ? `From ${naira}` : naira;
}

/** The line shown under the title in a link preview: when, where, price, then the description. */
export function shareDescription(event) {
  const facts = [whenText(event), event?.location, priceText(event)].filter(Boolean).join(", ");
  const about = plainText(event?.description);
  const text = about ? `${facts}. ${about}` : `${facts}. Get your ticket on Byro.`;
  return text.length > 200 ? `${text.slice(0, 197).trimEnd()}...` : text;
}
