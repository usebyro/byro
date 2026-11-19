/**
 * GA4 event tracking.
 *
 * One generic `trackEvent` does the sending; everything else is a typed wrapper that builds the
 * parameters GA expects. Nothing here may carry personal data (names, emails, phone numbers): ids,
 * slugs and tier names only. All of it is a no-op when gtag isn't loaded (SSR, ad blockers) or when
 * the visitor is in the staff area, where GA is switched off.
 */

type GtagFn = (...args: unknown[]) => void;

export const GA_MEASUREMENT_ID = "G-PKLCDNL7QC";
export const CURRENCY = "NGN";

type Params = Record<string, unknown>;

// ── Staff area ────────────────────────────────────────────────────────────────

/** Byro staff pages: admin.usebyro.com and /admin/*. Organisers use /dashboard, which stays tracked. */
export function isStaffArea(hostname: string, pathname: string): boolean {
  return hostname.startsWith("admin.") || pathname === "/admin" || pathname.startsWith("/admin/");
}

/** GA's documented switch: while set, gtag.js sends nothing for this measurement ID. */
export function setAnalyticsDisabled(disabled: boolean) {
  if (typeof window === "undefined") return;
  (window as unknown as Record<string, unknown>)[`ga-disable-${GA_MEASUREMENT_ID}`] = disabled;
}

function analyticsDisabled(): boolean {
  if (typeof window === "undefined") return true;
  return (window as unknown as Record<string, unknown>)[`ga-disable-${GA_MEASUREMENT_ID}`] === true;
}

// ── Sending ───────────────────────────────────────────────────────────────────

// A safety net, not a licence: drops any param whose name looks personal.
const PERSONAL_KEY = /(^|_)(e?mail|phone|mobile|first_?name|last_?name|full_?name|customer|attendee|address)(_|$)/i;

function clean<T>(value: T): T {
  if (Array.isArray(value)) return value.map(clean) as unknown as T;
  if (value && typeof value === "object") {
    const out: Params = {};
    for (const [k, v] of Object.entries(value as Params)) {
      if (v === undefined || v === null || (typeof v === "number" && Number.isNaN(v))) continue;
      if (PERSONAL_KEY.test(k)) continue;
      out[k] = clean(v);
    }
    return out as T;
  }
  return value;
}

function gtagFn(): GtagFn | null {
  if (typeof window === "undefined" || analyticsDisabled()) return null;
  const g = (window as unknown as { gtag?: GtagFn }).gtag;
  return typeof g === "function" ? g : null;
}

/** Send one GA4 event. Returns whether it was handed to gtag. */
export function trackEvent(name: string, params: Params = {}): boolean {
  const g = gtagFn();
  if (!g) return false;
  g("event", name, clean(params));
  return true;
}

/** Set (or clear, with null) the GA user_id. Internal id only, and only with analytics consent. */
export function setAnalyticsUserId(id: string | number | null) {
  const g = gtagFn();
  if (!g) return;
  g("set", { user_id: id === null ? null : String(id) });
}

// ── Once per order ────────────────────────────────────────────────────────────

// Only used when browser storage is unavailable (private mode), so repeats within one page are still caught.
const memory = new Set<string>();

/** True the first time a key is claimed in this browser; false on a reload, a second tab or a repeat. */
function claimOnce(key: string): boolean {
  const k = `byro:ga:${key}`;
  try {
    if (window.localStorage.getItem(k)) return false;
    window.localStorage.setItem(k, String(Date.now()));
    return true;
  } catch {
    if (memory.has(k)) return false;
    memory.add(k);
    return true;
  }
}

/** A unique id for an order that has none of its own. Never a shared literal. */
export function generateTransactionId(prefix = "order"): string {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}_${rand}`;
}

// ── Items ─────────────────────────────────────────────────────────────────────

export type AnalyticsItem = {
  item_id: string;
  item_name: string;
  item_category?: string;
  item_variant?: string;
  price: number;
  quantity: number;
};

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** A ticket line: item_id is the event's id, the variant is the tier. */
export function ticketItem(
  event: { id: string | number; name: string; category?: string | null },
  tier: { name?: string | null; price?: number | string | null } | null,
  quantity: number,
): AnalyticsItem {
  return {
    item_id: String(event.id),
    item_name: event.name,
    item_category: event.category || undefined,
    item_variant: tier?.name || undefined,
    price: num(tier?.price),
    quantity,
  };
}

/** A merch line. The id is namespaced so a merch item never shares an id with an event. */
export function merchItem(
  item: { id?: string | number | null; name: string; price?: number | string | null },
  quantity: number,
  option?: string,
): AnalyticsItem {
  return {
    item_id: item.id !== undefined && item.id !== null && item.id !== "" ? `merch_${item.id}` : `merch_${item.name}`,
    item_name: item.name,
    item_category: "merch",
    item_variant: option || undefined,
    price: num(item.price),
    quantity,
  };
}

export const itemsValue = (items: AnalyticsItem[]) => items.reduce((n, i) => n + i.price * i.quantity, 0);

// ── Funnel: view_item → add_to_cart → begin_checkout → purchase / free_ticket ─

type Context = { eventId?: string | number; eventSlug?: string; organiserId?: string | number };
const eventContext = (c: Context) => ({ event_id: c.eventId, event_slug: c.eventSlug, organiser_id: c.organiserId });

/** An event page (or a merch item) was viewed. value is optional here. */
export function trackViewItem(p: { items: AnalyticsItem[]; value?: number } & Context) {
  trackEvent("view_item", { currency: CURRENCY, value: p.value, items: p.items, ...eventContext(p) });
}

/** A tier and quantity were chosen (or an item went in the merch cart). */
export function trackAddToCart(p: { items: AnalyticsItem[]; value?: number } & Context) {
  trackEvent("add_to_cart", { currency: CURRENCY, value: p.value ?? itemsValue(p.items), items: p.items, ...eventContext(p) });
}

/**
 * The buyer moved on to pay. value is what they will be charged, service fee included; serviceFee is
 * Byro's part of it, sent separately so it can be split out in GA later.
 */
export function trackBeginCheckout(p: { items: AnalyticsItem[]; value: number; serviceFee?: number } & Context) {
  trackEvent("begin_checkout", { currency: CURRENCY, value: p.value, service_fee: p.serviceFee, items: p.items, ...eventContext(p) });
}

/**
 * A paid order, once payment is confirmed. At most once per transactionId in this browser, so a reload
 * or a second tab on the confirmation page can't count it again. Returns whether it was sent.
 */
export function trackPurchase(p: { transactionId: string; items: AnalyticsItem[]; value: number; serviceFee?: number } & Context): boolean {
  if (!p.transactionId || !gtagFn()) return false;
  if (!claimOnce(`purchase:${p.transactionId}`)) return false;
  return trackEvent("purchase", {
    transaction_id: p.transactionId,
    currency: CURRENCY,
    value: p.value,
    service_fee: p.serviceFee,
    items: p.items,
    ...eventContext(p),
  });
}

/** A free ticket was issued. Not a purchase: value is always 0. */
export function trackFreeTicket(p: { transactionId?: string; items: AnalyticsItem[] } & Context): boolean {
  const transactionId = p.transactionId || generateTransactionId("free");
  if (!gtagFn() || !claimOnce(`free_ticket:${transactionId}`)) return false;
  return trackEvent("free_ticket", {
    transaction_id: transactionId,
    currency: CURRENCY,
    value: 0,
    items: p.items,
    ...eventContext(p),
  });
}

// ── Sharing and saving ────────────────────────────────────────────────────────

/** Someone picked a share channel. item_id is the event's id (or the profile's handle); the slug rides along. */
export function trackShare(p: { method?: string; contentType: "event" | "profile"; itemId?: string | number; eventSlug?: string }) {
  trackEvent("share", {
    method: p.method,
    content_type: p.contentType,
    item_id: p.itemId === undefined ? undefined : String(p.itemId),
    event_slug: p.eventSlug,
  });
}

/**
 * Appends UTM params to a shared URL so visits coming back through it are
 * attributed to "share" traffic in GA4 rather than lumped in with
 * direct/organic traffic. `campaign` distinguishes what was shared
 * (e.g. "event_share", "profile_share"); `content` identifies the specific
 * item (event slug, username, etc). `source` names the channel the user
 * shared through (e.g. "whatsapp", "twitter") so GA4 can attribute traffic
 * per platform instead of a generic "social" bucket — defaults preserve the
 * old generic behaviour for the native OS share sheet, which can't tell us
 * the target app.
 */
export function withShareUtm(
  url: string,
  campaign: string,
  content: string,
  source: string = 'byro_share',
  medium: string = 'social',
): string {
  try {
    const u = new URL(url);
    u.searchParams.set('utm_source', source);
    u.searchParams.set('utm_medium', medium);
    u.searchParams.set('utm_campaign', campaign);
    u.searchParams.set('utm_content', content);
    return u.toString();
  } catch {
    return url;
  }
}

/** Someone saved/bookmarked an event. */
export function trackSaveEvent(p: Context) {
  trackEvent("save_event", eventContext(p));
}

// ── Auth ──────────────────────────────────────────────────────────────────────

/** After a successful sign-in (not on submit). */
export function trackLogin(method: string) {
  trackEvent("login", { method });
}

/** After a successful sign-up (not on submit). */
export function trackSignUp(method: string) {
  trackEvent("sign_up", { method });
}

// ── Community ─────────────────────────────────────────────────────────────────

/** Someone followed or unfollowed a community page. organiser_id is sent when the page knows it. */
export function trackFollow(p: { handle: string; following: boolean; organiserId?: string | number }) {
  trackEvent(p.following ? "follow" : "unfollow", {
    content_type: "community",
    organiser_handle: p.handle,
    organiser_id: p.organiserId,
  });
}

// ── Organiser flow ────────────────────────────────────────────────────────────

/** An organiser published an event (a new publish, or a draft going live). */
export function trackCreateEvent(p: Context & { category?: string }) {
  trackEvent("create_event", { ...eventContext(p), event_category: p.category });
}
