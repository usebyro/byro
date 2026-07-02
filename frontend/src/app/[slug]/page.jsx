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

/* ── Open Graph / Twitter metadata ── */
export async function generateMetadata({ params }) {
  const { slug } = await params;
  const event = await fetchEventData(slug);

  if (!event) {
    return { title: "Event not found" };
  }

  const title       = event.name || "Event";
  const description = event.description
    ? event.description.slice(0, 160)
    : `Join us for ${title} on Byro`;
  const imageUrl    = resolveImageUrl(event);
  const pageUrl     = `${SITE_URL}/${slug}`;

  return {
    title,
    description,
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
  return <ViewEventClient slug={slug} />;
}
