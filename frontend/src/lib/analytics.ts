/**
 * GA4 event tracking helpers.
 * All functions are no-ops if gtag is not loaded (e.g. during SSR or ad-blocked).
 */

type GtagFn = (...args: unknown[]) => void;

function gtag(...args: unknown[]) {
  if (typeof window === 'undefined') return;
  const g = (window as unknown as { gtag?: GtagFn }).gtag;
  if (typeof g !== 'function') return;
  g(...args);
}

// ── Checkout / ticket flow ────────────────────────────────────────────────────

/** Fired when the checkout modal opens. */
export function trackBeginCheckout(params: {
  eventName: string;
  eventSlug: string;
  value: number;       // total ticket price in NGN
  currency?: string;
}) {
  gtag('event', 'begin_checkout', {
    event_name: params.eventName,
    event_slug: params.eventSlug,
    value: params.value,
    currency: params.currency ?? 'NGN',
  });
}

/** Fired when user advances from step 1 (ticket selection) to step 2 (details). */
export function trackSelectTicket(params: {
  eventName: string;
  eventSlug: string;
  tierName: string;
  quantity: number;
  value: number;
}) {
  gtag('event', 'select_ticket', {
    event_name: params.eventName,
    event_slug: params.eventSlug,
    tier_name: params.tierName,
    quantity: params.quantity,
    value: params.value,
    currency: 'NGN',
  });
}

/** Fired when a free ticket is confirmed or when Paystack redirects for paid tickets. */
export function trackPurchase(params: {
  transactionId: string;   // ticket_id or Paystack reference
  eventName: string;
  eventSlug: string;
  value: number;
  quantity: number;
  isFree: boolean;
}) {
  gtag('event', 'purchase', {
    transaction_id: params.transactionId,
    event_name: params.eventName,
    event_slug: params.eventSlug,
    value: params.value,
    currency: 'NGN',
    quantity: params.quantity,
    is_free: params.isFree,
  });
}

// ── Event discovery ───────────────────────────────────────────────────────────

/** Fired when an event detail page is viewed. */
export function trackViewEvent(params: {
  eventName: string;
  eventSlug: string;
  category?: string;
  isFree?: boolean;
}) {
  gtag('event', 'view_event', {
    event_name: params.eventName,
    event_slug: params.eventSlug,
    event_category: params.category,
    is_free: params.isFree,
  });
}

/** Fired when user clicks the share button on an event page. */
export function trackShareEvent(params: { eventName: string; eventSlug: string }) {
  gtag('event', 'share', {
    content_type: 'event',
    item_id: params.eventSlug,
    event_name: params.eventName,
  });
}

/** Fired when user saves/bookmarks an event. */
export function trackSaveEvent(params: { eventName: string; eventSlug: string }) {
  gtag('event', 'save_event', {
    event_name: params.eventName,
    event_slug: params.eventSlug,
  });
}

// ── Auth ──────────────────────────────────────────────────────────────────────

/** Fired after successful sign-in. */
export function trackLogin(method: string) {
  gtag('event', 'login', { method });
}

/** Fired after successful sign-up. */
export function trackSignUp(method: string) {
  gtag('event', 'sign_up', { method });
}

// ── Organiser flow ────────────────────────────────────────────────────────────

/** Fired when an organiser publishes a new event. */
export function trackCreateEvent(params: { eventName: string; category?: string }) {
  gtag('event', 'create_event', {
    event_name: params.eventName,
    event_category: params.category,
  });
}
