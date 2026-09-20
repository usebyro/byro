// How many tickets of a tier one buyer can put in an order, and how the stepper moves.
// The organiser sets a minimum and a maximum per tier. Min 2 and max 2 is a couples
// ticket that can only be bought as a pair.

// Used when neither the tier nor the event reports a limit (older data).
export const DEFAULT_MAX_TICKETS_PER_ORDER = 5;

/** The smallest and largest order for a tier. A group ticket (admits several people) is always exactly 1. */
export function ticketLimits(tier, event) {
  if (Number(tier?.admits_count) > 1) return { min: 1, max: 1 };
  const min = Math.max(1, Number(tier?.min_tickets_per_person) || 1);
  const own = tier?.max_tickets_per_person;
  // null = the organiser set no per-order limit, so only what is left (or a ceiling) applies.
  if (own === null) return { min, max: Math.max(min, tier?.remaining ?? 100) };
  const limit = own ?? event?.max_tickets_per_person ?? DEFAULT_MAX_TICKETS_PER_ORDER;
  return { min, max: Math.min(10, Math.max(min, Number(limit))) };
}

/** Plus: from nothing the first press jumps to the minimum (a bundle), then goes up one at a time. */
export const stepUp = (current, min, max) => (current >= max ? current : current === 0 ? min : current + 1);

/** Minus: at the minimum, one more press removes the selection instead of leaving a broken order. */
export const stepDown = (current, min) => (current <= min ? 0 : current - 1);

/** A short line describing the rule, from the tier's own settings. */
export function describeTicketLimits(tier, event) {
  if (Number(tier?.admits_count) > 1) return `Admits ${tier.admits_count} people`;
  const min = Math.max(1, Number(tier?.min_tickets_per_person) || 1);
  const raw = tier?.max_tickets_per_person;
  const max = raw === null ? null : Number(raw ?? event?.max_tickets_per_person ?? DEFAULT_MAX_TICKETS_PER_ORDER);
  if (max === null) return min > 1 ? `Sold ${min} at a time or more` : "No limit per person";
  if (min === max) return min === 1 ? "1 per person" : `${min} tickets per order`;
  if (min > 1) return `${min} to ${max} per order`;
  return `Up to ${max} per person`;
}
