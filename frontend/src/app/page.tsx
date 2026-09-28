import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Hero, TrendingEvents, CreateEventSteps, Badges, CommunitySection } from "@/components/landing";
import { display } from "@/components/landing/fonts";

interface Event {
  id: number;
  slug: string;
  name: string;
  category: string;
  category_display?: string;
  day: string;
  time_from: string;
  time_to: string;
  location: string;
  ticket_price: number;
  event_image_url?: string;
  is_active: boolean;
}

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
      .slice(0, 4);
  } catch {
    return [];
  }
}

export default async function Home() {
  const events = await getEvents();

  return (
    <>
      <Navbar />
      <main className={display.variable}>
        <Hero />
        <TrendingEvents initialEvents={events} />
        <CreateEventSteps />
        <Badges />
        <CommunitySection />
      </main>
      <Footer />
    </>
  );
}
