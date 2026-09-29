import Image from "next/image";
import Stamp, { type StampInk } from "@/components/brand/Stamp";
import EventImage from "@/components/brand/EventImage";
import { dayParts, formatTime, type EventLike } from "@/lib/eventFormat";

const stamps: { name: string; city: string; date: string; ink: StampInk; shape: "round" | "square"; tilt: number }[] = [
  { name: "Sunday Run Club", city: "LAGOS", date: "28.09", ink: "pink", shape: "round", tilt: -8 },
  { name: "Jazz in the Park", city: "ABUJA", date: "21.09", ink: "blue", shape: "square", tilt: 6 },
  { name: "Art Walk", city: "LAGOS", date: "14.09", ink: "green", shape: "square", tilt: 4 },
  { name: "Night Market", city: "ACCRA", date: "06.09", ink: "gold", shape: "round", tilt: -5 },
  { name: "Builders Meetup", city: "YABA", date: "30.08", ink: "blue", shape: "round", tilt: 9 },
  { name: "Supper Club", city: "IKOYI", date: "23.08", ink: "pink", shape: "square", tilt: -3 },
];

/** The two-page passport illustration: your next ticket, and the stamps you've collected. Decorative. */
export default function Passport({ event }: { event?: EventLike }) {
  const parts = event ? dayParts(event.day) : null;
  return (
    <div aria-hidden="true" className="relative h-[440px] w-[600px] origin-top-left">
      <div
        className="absolute left-[14px] top-[16px] h-[440px] w-[600px] rounded-[26px] bg-brand"
        style={{ transform: "rotate(-4deg)" }}
      />
      <div
        className="absolute left-0 top-0 flex h-[440px] w-[600px] overflow-hidden rounded-[22px] shadow-[0_30px_70px_rgba(30,52,110,0.22)]"
        style={{ transform: "rotate(-4deg)" }}
      >
        <div className="flex h-[440px] w-[300px] flex-col gap-3 border-r border-[#E8ECF3] bg-white px-6 py-[26px] shadow-[inset_-18px_0_24px_-20px_rgba(20,22,28,0.18)]">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-extrabold tracking-[0.16em] text-faint">NEXT UP</span>
            <span className="text-[11px] font-extrabold tracking-[0.16em] text-brand">BYRO PASSPORT</span>
          </div>
          <div className="relative h-[180px] w-[252px] overflow-hidden rounded-[14px]">
            {event ? (
              <EventImage event={event} sizes="252px" />
            ) : (
              <Image src="/images/brand/groove.jpg" alt="" fill sizes="252px" className="object-cover" />
            )}
          </div>
          <span className="line-clamp-2 font-display text-[26px] font-bold leading-[1.05] tracking-[-0.02em]">
            {event ? event.name : "Rooftop Sessions"}
          </span>
          <span className="text-[13px] text-muted">
            {event && parts ? (
              <>
                {parts.short} · {formatTime(event.time_from)}
                <br />
                <span className="line-clamp-1">{event.location}</span>
              </>
            ) : (
              <>
                Fri, 3 Oct · 8:00 PM
                <br />
                Victoria Island, Lagos
              </>
            )}
          </span>
          <div className="flex-1" />
          <div className="flex items-center gap-3 border-t-[1.5px] border-dashed border-line pt-3">
            <span className="flex h-[52px] w-[52px] items-center justify-center rounded-[10px] bg-mist">
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#14161C" strokeWidth="1.7" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="7" />
                <rect x="14" y="3" width="7" height="7" />
                <rect x="3" y="14" width="7" height="7" />
                <path d="M14 14h3v3h-3zM18 18h3v3h-3z" />
              </svg>
            </span>
            <span className="text-[13px] font-bold">
              Admit 2
              <br />
              <span className="font-medium text-faint">Show at the door</span>
            </span>
          </div>
        </div>
        <div
          className="flex h-[440px] w-[300px] flex-col gap-3.5 bg-[#FFFEF8] px-[22px] py-[26px] shadow-[inset_18px_0_24px_-20px_rgba(20,22,28,0.14)]"
          style={{ backgroundImage: "repeating-linear-gradient(0deg, transparent 0 31px, #F1EEDF 31px 32px)" }}
        >
          <span className="text-[11px] font-extrabold tracking-[0.16em] text-faint">BEEN THERE</span>
          <div className="grid grid-cols-2 justify-items-center gap-x-2.5 gap-y-3.5">
            {stamps.map((s, i) => (
              <Stamp
                key={s.name}
                {...s}
                size={112}
                className="byro-stamp-pop"
                style={{ opacity: 0.9, animationDelay: `${0.7 + i * 0.12}s` }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
