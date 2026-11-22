import { notFound } from "next/navigation";
import { SITE_URL } from "@/lib/site";
import PublicProfileClient from "./PublicProfileClient";

const API_BASE = (() => {
  const raw = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/+$/, "");
  return raw.endsWith("/api") ? raw + "/" : raw + "/api/";
})();


async function fetchProfileData(handle) {
  try {
    const res = await fetch(`${API_BASE}profile/${handle}/`, {
      next: { revalidate: 60 },
    });
    if (res.status === 404) return { profile: null, missing: true };
    if (!res.ok) return { profile: null, missing: false };
    return { profile: await res.json(), missing: false };
  } catch {
    return { profile: null, missing: false };
  }
}

export async function generateMetadata({ params }) {
  const { username } = await params;
  const { profile } = await fetchProfileData(username);

  // Unknown or unreachable: nothing to preview, and keep it out of search.
  if (!profile) {
    return { title: "Page not found | Byro", robots: { index: false, follow: false } };
  }

  const name = profile.display_name || profile.handle || "Organiser";
  const bio = profile.bio ? profile.bio.slice(0, 160) : `Check out ${name}'s public profile on Byro.`;
  const imageUrl = profile.avatar_url;
  const pageUrl = `${SITE_URL}/u/${username}`;
  const pageTitle = `${name} (@${profile.handle || username}) – Byro`;

  return {
    title: { absolute: pageTitle },
    description: bio,
    alternates: { canonical: pageUrl },
    openGraph: {
      type: "profile",
      url: pageUrl,
      title: pageTitle,
      description: bio,
      ...(imageUrl && {
        images: [{ url: imageUrl, width: 400, height: 400, alt: name }],
      }),
    },
    twitter: {
      card: imageUrl ? "summary" : "summary",
      title: pageTitle,
      description: bio,
      ...(imageUrl && { images: [imageUrl] }),
    },
  };
}

export default async function UserProfilePage({ params }) {
  const { username } = await params;
  // Same fetch as generateMetadata, so it costs nothing extra. A handle nobody has is a real 404.
  const { missing } = await fetchProfileData(username);
  if (missing) notFound();
  return <PublicProfileClient username={username} />;
}
