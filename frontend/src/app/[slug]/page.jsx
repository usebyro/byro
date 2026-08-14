import ViewEventClient from "./ViewEventClient";

/* ── API helpers (server-side only) ── */
const API_BASE = (() => {
  const raw = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/+$/, "");
  return raw.endsWith("/api") ? raw + "/" : raw + "/api/";
})();

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://usebyro.com").replace(/\/+$/, "");

async function fetchEventData(slug) {
  try {
    const res = await fetch(`${API_BASE}events/${slug}/`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function resolveImageUrl(event) {
  const raw = event?.event_image_url || event?.event_image;
  if (!raw) return null;
  if (raw.startsWith("http")) return raw;
  const base = (process.env.NEXT_PUBLIC_API_URL || "https://byro.onrender.com").replace(/\/api\/?$/, "");
  return `${base}${raw}`;
}

/* Strip HTML tags and collapse whitespace for plain-text description fields. */
function toPlainText(html) {
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

/* Safely serialize a JSON-LD object for embedding in a <script> tag.
   JSON.stringify does NOT escape <, >, or &, so event-controlled fields
   (name/description) could otherwise break out of the script element
   (via </script>) and inject markup. Escaping these three characters
   fully neutralizes the breakout while keeping the JSON valid. */
function serializeJsonLd(obj) {
  return JSON.stringify(obj)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}

/* Combine a "YYYY-MM-DD" day and "HH:MM[:SS]" time into an ISO-ish string.
   Timezone is left unqualified (local to the event) — schema.org accepts this. */
function combineDateTime(day, t) {
  if (!day) return null;
  if (!t) return day;
  const time = t.length === 5 ? `${t}:00` : t; // HH:MM -> HH:MM:SS
  return `${day}T${time}`;
}

/* Build schema.org Event JSON-LD for Google rich results. */
function buildEventJsonLd(event, pageUrl) {
  if (!event) return null;

  const imageUrl = resolveImageUrl(event);
  const isVirtual = Boolean(event.virtual_link);
  const organizerName = event.hosted_by || event.owner_handle;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: event.name || "Event",
    url: pageUrl,
    eventStatus: "https://schema.org/EventScheduled",
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

  if (imageUrl) jsonLd.image = [imageUrl];

  if (isVirtual) {
    jsonLd.location = { "@type": "VirtualLocation", url: event.virtual_link };
  } else if (event.location) {
    jsonLd.location = {
      "@type": "Place",
      name: event.location,
      address: event.location,
    };
  }

  if (organizerName) {
    jsonLd.organizer = {
      "@type": "Organization",
      name: organizerName,
      ...(event.owner_handle && { url: `${SITE_URL}/u/${event.owner_handle}` }),
    };
  }

  // Offer: paid tickets carry a price; free events advertise price 0.
  const price = event.ticket_price != null ? String(event.ticket_price) : null;
  if (price != null) {
    jsonLd.offers = {
      "@type": "Offer",
      price,
      priceCurrency: "NGN",
      availability: "https://schema.org/InStock",
      url: pageUrl,
      ...(event.day && { validFrom: event.created_at || undefined }),
    };
  }

  return jsonLd;
}

/* ── Open Graph / Twitter metadata ── */
export async function generateMetadata({ params }) {
  const { slug } = await params;
  const event = await fetchEventData(slug);

  if (!event) {
    return { title: "Event not found" };
  }

  const title       = event.name || "Event";
  const plain       = toPlainText(event.description);
  const description = plain ? plain.slice(0, 160) : `Join us for ${title} on Byro`;
  const imageUrl    = resolveImageUrl(event);
  const pageUrl     = `${SITE_URL}/${slug}`;

  return {
    title,
    description,
    alternates: { canonical: pageUrl },
    openGraph: {
      type:        "website",
      url:         pageUrl,
      title,
      description,
      ...(imageUrl && {
        images: [{ url: imageUrl, width: 1200, height: 630, alt: title }],
      }),
    },
    twitter: {
      card:        imageUrl ? "summary_large_image" : "summary",
      title,
      description,
      ...(imageUrl && { images: [imageUrl] }),
    },
  };
}

/* ── Page ── */
export default async function EventPage({ params }) {
  const { slug } = await params;
  const event = await fetchEventData(slug); // deduped with generateMetadata's fetch
  const jsonLd = buildEventJsonLd(event, `${SITE_URL}/${slug}`);

  return (
    <>
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
        />
      )}
      <ViewEventClient slug={slug} />
    </>
  );
}
