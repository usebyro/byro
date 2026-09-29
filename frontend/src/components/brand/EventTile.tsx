import Link from "next/link";
import EventImage from "./EventImage";
import {
  categoryTone,
  dayParts,
  formatTime,
  priceLabel,
  type EventLike,
} from "@/lib/eventFormat";

/** Photo with a white info panel over the bottom, used on the landing page grid. */
export function PosterTile({
  event,
  featured = false,
  className = "",
}: {
  event: EventLike;
  featured?: boolean;
  className?: string;
}) {
  const parts = dayParts(event.day);
  const when = `${parts.short} · ${formatTime(event.time_from)}`;
  return (
    <Link
      href={`/discover/${event.slug}`}
      className={`group relative block overflow-hidden focus:outline-none focus-visible:ring-4 focus-visible:ring-brand/40 ${
        featured ? "rounded-[30px]" : "rounded-[26px]"
      } ${className}`}
    >
      <EventImage
        event={event}
        sizes={featured ? "(min-width: 1024px) 50vw, 100vw" : "(min-width: 1024px) 25vw, 50vw"}
        priority={featured}
        className="transition-transform duration-500 group-hover:scale-[1.03]"
      />
      {featured && (
        <span className="absolute left-5 top-5 flex h-8 items-center rounded-full bg-white/95 px-3.5 text-[13px] font-bold text-ink">
          Featured
        </span>
      )}
      <div
        className={`absolute inset-x-3 bottom-3 bg-white/95 text-ink ${
          featured ? "flex items-center gap-4 rounded-[22px] p-4 md:inset-x-4 md:bottom-4 md:gap-[18px] md:p-5" : "flex flex-col gap-0.5 rounded-[18px] px-4 py-3.5"
        }`}
      >
        {featured && (
          <div className="flex h-16 w-[60px] shrink-0 flex-col items-center justify-center rounded-2xl bg-sky">
            <span className="text-[11px] font-extrabold tracking-[0.08em] text-brand">{parts.month}</span>
            <span className="font-display text-[26px] font-bold leading-none">{parts.dd}</span>
          </div>
        )}
        <div className={featured ? "flex min-w-0 flex-1 flex-col gap-1" : "contents"}>
          {!featured && <span className="text-xs font-extrabold uppercase text-brand">{when}</span>}
          <span
            className={`font-display font-bold tracking-[-0.01em] ${
              featured ? "truncate text-xl md:text-[26px] md:tracking-[-0.02em]" : "line-clamp-2 text-lg leading-tight"
            }`}
          >
            {event.name}
          </span>
          <span className={`text-muted ${featured ? "truncate text-sm" : "text-[13px]"}`}>
            {featured ? `${event.location} · ${priceLabel(event)}` : `${event.location} · ${priceLabel(event)}`}
          </span>
        </div>
        {featured && (
          <span className="hidden h-11 shrink-0 items-center rounded-full bg-brand px-5 text-sm font-bold text-white md:flex">
            Get tickets
          </span>
        )}
      </div>
    </Link>
  );
}

/** Image on top, text below. Used in Discover and "more like this" rows. */
export function StackTile({ event, showCategory = true }: { event: EventLike; showCategory?: boolean }) {
  const tone = categoryTone(event.category, event.category_display);
  return (
    <Link
      href={`/discover/${event.slug}`}
      className="group flex flex-col gap-3 rounded-[22px] focus:outline-none focus-visible:ring-4 focus-visible:ring-brand/40"
    >
      <div className="relative h-52 overflow-hidden rounded-[22px] md:h-[200px]">
        <EventImage
          event={event}
          sizes="(min-width: 1280px) 22vw, (min-width: 768px) 33vw, 100vw"
          className="transition-transform duration-500 group-hover:scale-[1.03]"
        />
        <span className="absolute left-2.5 top-2.5 flex h-7 items-center rounded-full bg-white/95 px-2.5 text-xs font-extrabold text-ink">
          {formatTime(event.time_from)}
        </span>
        {event.is_sold_out && (
          <span className="absolute right-2.5 top-2.5 flex h-7 items-center rounded-full bg-ink px-2.5 text-xs font-extrabold text-white">
            Sold out
          </span>
        )}
      </div>
      <div className="flex flex-col gap-[3px] px-1">
        {showCategory && (
          <span className="text-xs font-extrabold uppercase tracking-[0.06em]" style={{ color: tone.text }}>
            {tone.label}
          </span>
        )}
        <span className="font-display text-xl font-bold leading-[1.15] tracking-[-0.01em] text-ink">{event.name}</span>
        <span className="text-sm text-muted">{event.location}</span>
        <span className="mt-1 text-[15px] font-extrabold text-ink">{priceLabel(event)}</span>
      </div>
    </Link>
  );
}
