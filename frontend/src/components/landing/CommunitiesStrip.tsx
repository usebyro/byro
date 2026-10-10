import Link from "next/link";
import { Reveal } from "./Reveal";

type Community = {
  handle: string;
  name: string;
  location: string;
  avatar_url: string | null;
  followers: number;
  attendees: number;
  upcoming_count: number;
  next_event: { name: string; day: string } | null;
};

const INKS = ["#3669F6", "#D0668E", "#2F9E6E", "#C9971C", "#1F2A44"];
const hashOf = (s: string) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);

async function getCommunities(): Promise<Community[]> {
  try {
    const rawBase = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/+$/, "");
    const apiBase = rawBase.endsWith("/api") ? rawBase + "/" : rawBase + "/api/";
    const res = await fetch(`${apiBase}communities/?page_size=4`, { next: { revalidate: 300 } });
    if (!res.ok) return [];
    const data = await res.json();
    return data.results || [];
  } catch {
    return [];
  }
}

const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "B";

/** Real organiser communities, ranked by followers. Renders nothing until there are some to show. */
export default async function CommunitiesStrip() {
  const communities = await getCommunities();
  if (communities.length === 0) return null;

  return (
    <section className="mx-auto max-w-[1440px] px-4 pt-14 md:px-12 md:pt-[120px] xl:px-24">
      <Reveal>
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-balance font-display text-[34px] font-bold leading-none tracking-[-0.035em] md:text-[56px]">
              Follow the crews
              <br className="hidden md:block" /> behind the nights.
            </h2>
            <p className="mt-3 max-w-[460px] text-[15px] leading-[1.55] text-muted md:text-lg">
              Follow a community and you&apos;ll hear first when they announce their next event.
            </p>
          </div>
          <Link href="/communities" className="text-[15px] font-bold text-brand hover:text-brand-dark">
            Browse all communities →
          </Link>
        </div>
        <ul className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {communities.map((c) => (
            <li key={c.handle}>
              <Link
                href={`/u/${c.handle}`}
                className="flex h-full flex-col gap-3 rounded-[26px] border border-hairline bg-white p-5 transition-[box-shadow,scale] hover:shadow-[0_14px_34px_rgba(20,22,28,0.08)] active:scale-[0.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                <span
                  className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full font-display text-lg font-extrabold text-white"
                  style={{ background: INKS[hashOf(c.handle) % INKS.length] }}
                >
                  {c.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.avatar_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    initials(c.name)
                  )}
                </span>
                <span className="font-display text-xl font-bold tracking-[-0.01em]">{c.name}</span>
                <span className="text-[13px] text-muted">
                  {c.followers.toLocaleString()} {c.followers === 1 ? "follower" : "followers"}
                  {c.attendees > 0 ? ` · ${c.attendees.toLocaleString()} attended` : ""}
                </span>
                <span className="mt-auto pt-1 text-sm font-bold text-ink">
                  {c.next_event ? `Next: ${c.next_event.name}` : `${c.upcoming_count} upcoming`}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Reveal>
    </section>
  );
}
