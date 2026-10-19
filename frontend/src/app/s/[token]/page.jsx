import Link from "next/link";
import Navbar from "@/components/Navbar";
import Stamp from "@/components/brand/Stamp";
import { fetchSharedStamp, SITE_URL } from "@/lib/eventShare";
import { stampLook, stampWords } from "@/lib/stamps";

// A stamp someone shared (board 31): "Adaeze was at Tech Meetup", and a way in for whoever opened it.

export async function generateMetadata({ params }) {
  const { token } = await params;
  const s = await fetchSharedStamp(token);
  if (!s) return { title: "Stamp not found", robots: { index: false } };
  const who = s.first_name ? `${s.first_name} was at` : "At";
  const title = `${who} ${s.event_name}`;
  const description = "On Byro, you collect a stamp every time you check in at an event.";
  const image = `${SITE_URL}/s/${token}/og`;
  return {
    title,
    description,
    robots: { index: false },
    openGraph: { title, description, url: `${SITE_URL}/s/${token}`, images: [{ url: image, width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

export default async function SharedStampPage({ params }) {
  const { token } = await params;
  const s = await fetchSharedStamp(token);

  if (!s) {
    return (
      <div className="flex min-h-screen flex-col bg-butter font-body text-ink">
        <Navbar />
        <main className="mx-auto flex max-w-[560px] flex-1 flex-col items-center justify-center gap-4 px-4 py-20 text-center">
          <h1 className="font-display text-4xl font-bold tracking-[-0.03em]">This stamp isn&apos;t available</h1>
          <p className="text-[17px] text-body">The link may be wrong, or the event was removed.</p>
          <Link href="/discover" className="flex min-h-12 items-center rounded-full bg-brand px-6 text-[15px] font-bold text-white">
            Find events near you
          </Link>
        </main>
      </div>
    );
  }

  const look = stampLook({ id: s.id, event_name: s.event_name, day: s.day, category: s.category, location: s.location });
  const place = (s.location || "").split(",").pop().trim();
  const line = [stampWords(s.day), place, s.organizer_name && `with ${s.organizer_name}`].filter(Boolean).join(" · ");
  const next = s.organizer_handle ? { href: `/u/${s.organizer_handle}`, label: `See ${s.organizer_name}'s next events` } : null;

  return (
    <div className="flex min-h-screen flex-col bg-butter font-body text-ink">
      <Navbar />
      <main className="flex flex-1 items-center justify-center px-4 py-[clamp(32px,7vw,88px)]">
        <div className="flex w-full max-w-[560px] flex-col items-center gap-7 text-center">
          <div role="img" aria-label={`Stamp: ${look.label}`} className="stamp-land">
            <Stamp name={look.name} city={look.city} date={look.date} ink={look.ink} shape={look.shape} tilt={look.tilt} size={220} filled />
          </div>
          <div className="stamp-rise flex flex-col items-center gap-2">
            <p className="text-base font-bold text-muted">{s.first_name ? `${s.first_name} was at` : "A Byro stamp from"}</p>
            <h1 className="text-balance font-display text-[clamp(36px,6vw,52px)] font-bold leading-[1.02] tracking-[-0.035em] [overflow-wrap:anywhere]">
              {s.event_name}
            </h1>
            {line && <p className="text-[17px] text-body">{line}</p>}
          </div>
          <div className="stamp-rise flex w-full flex-col justify-center gap-2.5 sm:w-auto sm:flex-row">
            {next && (
              <Link href={next.href} className="flex min-h-12 items-center justify-center rounded-full bg-brand px-6 text-[15px] font-bold text-white transition-[background-color,scale] hover:bg-[#2F5EE0] active:scale-[0.97]">
                {next.label}
              </Link>
            )}
            <Link
              href="/discover"
              className={`flex min-h-12 items-center justify-center rounded-full px-6 text-[15px] font-bold transition-[background-color,scale] active:scale-[0.97] ${
                next ? "border border-line bg-white text-ink hover:bg-mist" : "bg-brand text-white hover:bg-[#2F5EE0]"
              }`}
            >
              Find events near you
            </Link>
          </div>
          <p className="stamp-rise max-w-[40ch] text-sm text-muted">On Byro, you collect a stamp every time you check in at an event.</p>
        </div>
      </main>
    </div>
  );
}
