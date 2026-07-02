import PublicProfileClient from "./PublicProfileClient";

const API_BASE = (() => {
  const raw = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/+$/, "");
  return raw.endsWith("/api") ? raw + "/" : raw + "/api/";
})();

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://usebyro.com").replace(/\/+$/, "");

async function fetchProfileData(handle) {
  try {
    const res = await fetch(`${API_BASE}profile/${handle}/`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }) {
  const { username } = await params;
  const profile = await fetchProfileData(username);

  if (!profile) {
    return { title: "Profile not found | Byro" };
  }

  const name = profile.display_name || profile.handle || "Organizer";
  const bio = profile.bio ? profile.bio.slice(0, 160) : `Check out ${name}'s public profile on Byro.`;
  const imageUrl = profile.avatar_url;
  const pageUrl = `${SITE_URL}/u/${username}`;

  return {
    title: `${name} | Byro`,
    description: bio,
    openGraph: {
      type: "profile",
      url: pageUrl,
      title: `${name} | Byro`,
      description: bio,
      ...(imageUrl && {
        images: [{ url: imageUrl, width: 400, height: 400, alt: name }],
      }),
    },
    twitter: {
      card: imageUrl ? "summary" : "summary",
      title: `${name} | Byro`,
      description: bio,
      ...(imageUrl && { images: [imageUrl] }),
    },
  };
}

export default async function UserProfilePage({ params }) {
  const { username } = await params;
  return <PublicProfileClient username={username} />;
}
