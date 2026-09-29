import Link from "next/link";
import { PosterTile } from "@/components/brand/EventTile";
import EventImage from "@/components/brand/EventImage";
import { dayParts, formatTime, priceLabel, type EventLike } from "@/lib/eventFormat";
import { Reveal } from "./Reveal";

/** Layout of the small tiles by how many events there are, so the grid never leaves holes. */
function tileSpan(total: number, index: number) {
  if (total === 2) return "md:col-span-2 md:row-span-2";
  if (total === 3) return "md:col-span-2 md:row-span-1";
  if (total === 4) return index === 0 ? "md:col-span-2 md:row-span-1" : "md:col-span-1 md:row-span-1";
  return "md:col-span-1 md:row-span-1";
}

export default function TrendingEvents({ events }: { events: EventLike[] }) {
  const [featured, ...rest] = events;
  const small = rest.slice(0, 4);

  return (
    <section className="mx-auto max-w-[1440px] px-4 pt-16 md:px-12 md:pt-[120px] xl:px-24">
      <Reveal className="flex items-end justify-between gap-4">
        <h2 className="font-display text-4xl font-bold leading-none tracking-[-0.035em] md:text-[56px]">
          This week,
          <br />
          <span className="text-faint">near you.</span>
        </h2>
        <Link
          href="/discover"
          className="flex h-12 shrink-0 items-center gap-2 rounded-full border border-line px-5 text-[15px] font-bold text-ink transition-colors hover:bg-mist focus:outline-none focus-visible:ring-2 focus-visible:ring-brand md:px-[22px]"
        >
          <span>
            See all<span className="hidden md:inline"> events</span>
          </span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </Link>
      </Reveal>

      {!featured ? (
        <div className="mt-9 flex flex-col items-start gap-3 rounded-[30px] bg-mist p-8 md:p-12">
          <p className="font-display text-2xl font-bold">No events yet</p>
          <p className="text-muted">Be the first to put something on the calendar.</p>
          <Link href="/events/create" className="mt-2 flex h-12 items-center rounded-full bg-brand px-6 font-bold text-white transition-[filter] hover:brightness-90">
            Create an event
          </Link>
        </div>
      ) : (
        <Reveal className="mt-9">
          <div className="grid grid-cols-1 gap-5 md:grid-cols-4 md:grid-rows-[300px_300px]">
            <PosterTile
              event={featured}
              featured
              className={`h-[360px] md:h-auto ${small.length === 0 ? "md:col-span-4 md:row-span-2" : "md:col-span-2 md:row-span-2"}`}
            />
            {small.map((e, i) => (
              <PosterTile key={e.slug} event={e} className={`hidden ${tileSpan(events.length, i)} md:block`} />
            ))}
            {small.map((e) => (
              <Link key={`row-${e.slug}`} href={`/discover/${e.slug}`} className="flex items-center gap-3.5 md:hidden">
                <span className="relative h-[88px] w-[88px] shrink-0 overflow-hidden rounded-[18px]">
                  <EventImage event={e} sizes="88px" />
                </span>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-xs font-extrabold uppercase text-brand">
                    {dayParts(e.day).short} · {formatTime(e.time_from)}
                  </span>
                  <span className="truncate font-display text-lg font-bold">{e.name}</span>
                  <span className="truncate text-[13px] text-muted">
                    {e.location} · {priceLabel(e)}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </Reveal>
      )}
    </section>
  );
}
