import { SITE_URL } from "@/lib/site";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import ViewEventClient from "./ViewEventClient";
import { fetchShareEvent, shareImageUrl, shareDescription } from "@/lib/eventShare";
import { buildEventJsonLd, serializeJsonLd } from "@/lib/eventSchema";

/* ── API helpers (server-side only) ── */
const API_BASE = (() => {
  const raw = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/+$/, "");
  return raw.endsWith("/api") ? raw + "/" : raw + "/api/";
})();


/** The event, and whether the API said it doesn't exist (404). A failed or slow API is not "missing". */
async function loadEvent(slug) {
  try {
    const res = await fetch(`${API_BASE}events/${slug}/`, {
      next: { revalidate: 60 },
    });
    if (res.status === 404) return { event: null, missing: true };
    if (!res.ok) return { event: null, missing: false };
    return { event: await res.json(), missing: false };
  } catch {
    return { event: null, missing: false };
  }
}

/* ── Open Graph / Twitter metadata ── */
export async function generateMetadata({ params }) {
  const { slug } = await params;
  const event = await fetchShareEvent(slug);

  // Drafts and unknown events are not public: nothing to preview, and keep them out of search.
  if (!event) {
    return { title: "Event not found", robots: { index: false, follow: false } };
  }

  const title       = event.name || "Event";
  const pageTitle   = `${title} – Byro`;
  const description = shareDescription(event);
  const pageUrl     = `${SITE_URL}/discover/${slug}`;

  // The organiser's image when there is one, otherwise a generated card with the
  // event's name, date, place and price so the preview is never a bare link.
  const uploaded = shareImageUrl(event);
  const images = uploaded
    ? [{ url: uploaded, alt: title }]
    : [{ url: `${pageUrl}/og`, width: 1200, height: 630, alt: title }];

  return {
    title: { absolute: pageTitle },
    description,
    alternates: { canonical: pageUrl },
    openGraph: {
      type:     "website",
      siteName: "Byro",
      locale:   "en_NG",
      url:      pageUrl,
      title:    pageTitle,
      description,
      images,
    },
    twitter: {
      card: "summary_large_image",
      title: pageTitle,
      description,
      images: images.map((i) => i.url),
    },
  };
}

/* ── Page ── */
export default async function EventPage({ params }) {
  const { slug } = await params;
  const { event, missing } = await loadEvent(slug); // deduped with generateMetadata's fetch
  // An event that doesn't exist (or isn't published) is a real 404, not a 200 page that says "not found".
  if (missing) notFound();
  const jsonLd = buildEventJsonLd(event, `${SITE_URL}/discover/${slug}`, SITE_URL, new Date(), process.env.NEXT_PUBLIC_API_URL);

  return (
    <>
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
        />
      )}
      <Suspense fallback={null}>
        <ViewEventClient slug={slug} initialEvent={event?.slug ? event : null} />
      </Suspense>
    </>
  );
}
