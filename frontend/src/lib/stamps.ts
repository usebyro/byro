import type { StampInk } from "@/components/brand/Stamp";

/**
 * How a stamp looks, worked out from its event and id so it's the same everywhere it appears:
 * the passport, the ticket after check-in, the event page and the share card.
 */

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function stampInk(category?: string | null): StampInk {
  const c = category || "";
  if (/music|entertain|nightlife/.test(c)) return "pink";
  if (/tech|conference|hackathon|web3/.test(c)) return "blue";
  if (/sport|fitness/.test(c)) return "green";
  return "gold";
}

/** Last part of the location ("Cafe One, Yaba, Lagos" -> "LAGOS"), short enough for the ring. */
export function stampCity(location?: string | null) {
  return (location || "").split(",").pop()!.trim().toUpperCase().slice(0, 12) || "BYRO";
}

/** "2026-10-11" -> "11.10.26". */
export function stampDate(day?: string | null) {
  const [y, m, d] = (day || "").split("-");
  return y && m && d ? `${d}.${m}.${y.slice(2)}` : "";
}

/** "2026-10-11" -> "11 October 2026", for screen readers and captions. */
export function stampWords(day?: string | null) {
  const [y, m, d] = (day || "").split("-");
  return y && m && d ? `${Number(d)} ${MONTHS[Number(m) - 1]} ${y}` : "";
}

export function stampMonth(day?: string | null) {
  const [y, m] = (day || "").split("-");
  return y && m ? `${MONTHS[Number(m) - 1]} ${y}` : "";
}

export const stampShortName = (name: string) => (name.length > 16 ? `${name.slice(0, 15).trimEnd()}…` : name);

export interface StampLike {
  id: number;
  event_name: string;
  day?: string | null;
  category?: string | null;
  location?: string | null;
}

/** Props for <Stamp>: round for even ids, square for odd, a tilt between -8° and 8°. */
export function stampLook(s: StampLike) {
  const city = stampCity(s.location);
  return {
    name: stampShortName(s.event_name),
    city,
    date: stampDate(s.day),
    ink: stampInk(s.category),
    shape: (s.id % 2 === 0 ? "round" : "square") as "round" | "square",
    tilt: ((s.id * 37) % 17) - 8,
    label: [s.event_name, (s.location || "").split(",").pop()!.trim(), stampWords(s.day)].filter(Boolean).join(", "),
  };
}
