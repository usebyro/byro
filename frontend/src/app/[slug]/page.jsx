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

// Events used to live at /<slug>. They now live at /discover/<slug> — this
// keeps every link already shared (social posts, co-host invite emails,
// bookmarks, QR codes) working by forwarding to the new address.
//
// This only fires the redirect for a slug that's an actual event. Any other
// unmatched path (a typo, a dead link that was never an event) 404s right
// here instead of bouncing through /discover/<junk> first.
export default async function LegacyEventRedirect({ params, searchParams }) {
  const { slug } = await params;
  if (!(await eventExists(slug))) notFound();

  const sp = await searchParams;
  const qs = new URLSearchParams(
    Object.entries(sp || {}).filter(([, v]) => typeof v === "string")
  ).toString();

  permanentRedirect(`/discover/${slug}${qs ? `?${qs}` : ""}`);
}
