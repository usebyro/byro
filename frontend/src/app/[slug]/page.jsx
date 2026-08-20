import { permanentRedirect } from "next/navigation";

// Events used to live at /<slug>. They now live at /discover/<slug> — this
// keeps every link already shared (social posts, co-host invite emails,
// bookmarks, QR codes) working by forwarding to the new address.
export default async function LegacyEventRedirect({ params, searchParams }) {
  const { slug } = await params;
  const sp = await searchParams;

  const qs = new URLSearchParams(
    Object.entries(sp || {}).filter(([, v]) => typeof v === "string")
  ).toString();

  permanentRedirect(`/discover/${slug}${qs ? `?${qs}` : ""}`);
}
