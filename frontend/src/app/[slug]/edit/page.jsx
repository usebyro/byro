import { permanentRedirect } from "next/navigation";

// /<slug>/edit moved to /discover/<slug>/edit alongside the event page itself.
export default async function LegacyEventEditRedirect({ params }) {
  const { slug } = await params;
  permanentRedirect(`/discover/${slug}/edit`);
}
