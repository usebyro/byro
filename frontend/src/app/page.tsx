import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import type { EventLike } from "@/lib/eventFormat";
import { Hero, TrendingEvents, StampsSection, HostsSection, TrustRow, CommunitySection } from "@/components/landing";

type Event = EventLike & { id: number; is_active?: boolean };

async function getEvents(): Promise<Event[]> {
  try {
    const rawBase = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/+$/, "");
    const apiBase = rawBase.endsWith("/api") ? rawBase + "/" : rawBase + "/api/";
    const res = await fetch(`${apiBase}events/`, { next: { revalidate: 60 } });
    if (!res.ok) return [];
    const data = await res.json();
    const raw: Event[] = Array.isArray(data) ? data : data.events || data.data || [];
    const seen = new Set<number>();
    return raw
      .filter((e) => {
        if (seen.has(e.id)) return false;
        seen.add(e.id);
        return true;
      })
      .slice(0, 12);
  } catch {
    return [];
  }
}

export default async function Home() {
  const all = await getEvents();
  // Lead with events that have a cover image so the featured tile and the passport look their best.
  const events = [
    ...all.filter((e) => e.event_image_url),
    ...all.filter((e) => !e.event_image_url),
  ].slice(0, 5);

  return (
    <>
      <Navbar />
      <main className="bg-white pb-20 font-body text-ink md:pb-32">
        <Hero event={events[0]} />
        <TrendingEvents events={events} />
        <StampsSection />
        <HostsSection />
        <TrustRow />
        <CommunitySection />
      </main>
      <Footer />
    </>
  );
}
