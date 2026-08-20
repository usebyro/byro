import { permanentRedirect, notFound } from "next/navigation";

const API_BASE = (() => {
  const raw = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/+$/, "");
  return raw.endsWith("/api") ? raw + "/" : raw + "/api/";
})();

async function eventExists(slug) {
  try {
    const res = await fetch(`${API_BASE}events/${slug}/`, { next: { revalidate: 60 } });
    return res.ok;
  } catch {
    return false;
  }
}

// /<slug>/edit moved to /discover/<slug>/edit alongside the event page itself.
// Same guard as the parent legacy redirect: only forward a real event's edit
// link, otherwise 404 in place rather than bouncing through /discover first.
export default async function LegacyEventEditRedirect({ params }) {
  const { slug } = await params;
  if (!(await eventExists(slug))) notFound();
  permanentRedirect(`/discover/${slug}/edit`);
}
