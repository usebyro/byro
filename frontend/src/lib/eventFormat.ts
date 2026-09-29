export interface TicketTierLike {
  id?: string | number;
  name?: string;
  price: number | string;
  capacity?: number | null;
  remaining?: number | null;
  sold?: number | null;
}

export interface EventLike {
  id?: number;
  slug: string;
  name: string;
  category: string;
  category_display?: string;
  day: string;
  time_from: string;
  time_to?: string;
  location: string;
  ticket_price: number | string;
  event_image_url?: string;
  is_sold_out?: boolean;
  tiers?: TicketTierLike[];
}

export const formatNaira = (n: number) => "₦" + Math.round(n).toLocaleString("en-NG");

/** Cheapest price on offer, from tiers when there are any. */
export function lowestPrice(event: Pick<EventLike, "ticket_price" | "tiers">): number {
  const base = parseFloat(String(event.ticket_price ?? 0)) || 0;
  if (event.tiers && event.tiers.length > 0) {
    return Math.min(...event.tiers.map((t) => parseFloat(String(t.price)) || 0));
  }
  return base;
}

/** "Free", "₦5,000" or "From ₦8,000" when more than one price is on offer. */
export function priceLabel(event: Pick<EventLike, "ticket_price" | "tiers">): string {
  const low = lowestPrice(event);
  if (low === 0) return "Free";
  const prices = new Set((event.tiers ?? []).map((t) => parseFloat(String(t.price)) || 0));
  return prices.size > 1 ? `From ${formatNaira(low)}` : formatNaira(low);
}

/** Parses YYYY-MM-DD without the timezone shift `new Date("YYYY-MM-DD")` causes. */
export function parseDay(day: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(day || "");
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAY_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function dayParts(day: string) {
  const d = parseDay(day);
  if (!d) return { month: "", dd: "", weekday: "", short: day, long: day, dayMonth: day };
  return {
    month: MONTH[d.getMonth()].toUpperCase(),
    dd: String(d.getDate()).padStart(2, "0"),
    weekday: WEEKDAY[d.getDay()],
    short: `${WEEKDAY[d.getDay()]} ${d.getDate()} ${MONTH[d.getMonth()]}`,
    long: `${WEEKDAY_LONG[d.getDay()]}, ${d.getDate()} ${MONTH_LONG[d.getMonth()]}`,
    dayMonth: `${d.getDate()} ${MONTH_LONG[d.getMonth()]}`,
  };
}

export function formatTime(time?: string) {
  if (!time) return "";
  const [h, m] = time.split(":");
  const hours = parseInt(h, 10);
  if (Number.isNaN(hours)) return time;
  return `${hours % 12 || 12}:${m ?? "00"} ${hours >= 12 ? "PM" : "AM"}`;
}

/** Heading for a day group in a results list: Today, Tomorrow, or "Sat 4 Oct". */
export function dayGroupLabel(day: string, now = new Date()) {
  const d = parseDay(day);
  if (!d) return { label: day, sub: "" };
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.round((d.getTime() - start.getTime()) / 86400000);
  const parts = dayParts(day);
  if (diff === 0) return { label: "Today", sub: parts.dayMonth };
  if (diff === 1) return { label: "Tomorrow", sub: parts.dayMonth };
  return { label: WEEKDAY_LONG[d.getDay()], sub: parts.dayMonth };
}

export function isPast(event: Pick<EventLike, "day" | "time_from" | "time_to">) {
  if (!event.day) return false;
  const end = new Date(`${event.day}T${event.time_to || event.time_from || "23:59:59"}`);
  return !Number.isNaN(end.getTime()) && new Date() > end;
}

type Tone = { label: string; ink: string; bg: string; text: string };

const TONES: Record<string, Tone> = {
  entertainment: { label: "Concerts & music", ink: "#3669F6", bg: "#E6F2FC", text: "#2451D6" },
  nightlife: { label: "Nightlife", ink: "#D0668E", bg: "#FCECEE", text: "#8C2E52" },
  art_culture: { label: "Art & culture", ink: "#C9971C", bg: "#FFFDE9", text: "#8A6508" },
  fitness: { label: "Sports & fitness", ink: "#2F9E6E", bg: "#E9F7EF", text: "#1F7A52" },
  conference: { label: "Conferences", ink: "#3669F6", bg: "#E6F2FC", text: "#2451D6" },
  technology: { label: "Technology", ink: "#5B6272", bg: "#F3F6FB", text: "#3B4252" },
  web3_crypto: { label: "Web3 & crypto", ink: "#C9971C", bg: "#FFFDE9", text: "#8A6508" },
  other: { label: "Other", ink: "#5B6272", bg: "#F3F6FB", text: "#3B4252" },
};

export function categoryTone(category: string, display?: string): Tone {
  const t = TONES[category] ?? TONES.other;
  return display ? { ...t, label: display } : t;
}

export function eventInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
}
