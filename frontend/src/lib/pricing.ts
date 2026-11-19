/**
 * Single source of truth for Byro's ticket pricing on the frontend.
 * Mirrors Backend/bryo/pricing.py exactly.
 *
 * - Byro service fee = 5% of the ticket subtotal (Byro's revenue).
 * - The amount SENT to Paystack is `subtotal + serviceFee` (the `total` field).
 *   Paystack adds its own charge on top of that at checkout (fees borne by the
 *   customer), so the buyer pays a little more than `total`.
 * - Paystack's local fee is 1.5% + NGN 100, with the flat NGN 100 waived when
 *   the charge is under NGN 2,500 and the total fee capped at NGN 2,000. We
 *   SIMULATE it in `paystackFee` / `displayTotal` so the cart can show the
 *   buyer their true all-in payment - no fee jumps at them on Paystack.
 *
 * Two numbers, two jobs:
 * - `total`        -> what the backend sends to Paystack (raw).
 * - `displayTotal` -> what the cart shows (grossed up = what Paystack charges).
 *
 * Bachs orders: the checkout is created so Bachs adds ITS fee on top of `total`
 * (Byro nets `total`). Bachs' fee depends on the method the buyer picks on its
 * page (bank transfer 1.5% capped at NGN 2,000, local card 2%, virtual account 1%),
 * which the cart cannot know. We estimate at the bank-transfer rate, the most common
 * method, so the cart matches what Bachs shows for it. A buyer paying by card is
 * charged a little more than the cart shows.
 *
 * The backend recomputes everything itself, so these values are for display.
 */

const FEE_RATE = 0.05;

// Paystack local-transaction fee parameters (for simulation only).
const PAYSTACK_RATE = 0.015;
const PAYSTACK_FLAT = 100;
const PAYSTACK_FLAT_WAIVER_THRESHOLD = 2500; // flat fee waived under this charge
const PAYSTACK_FEE_CAP = 2000; // max fee per transaction

// Bachs' bank-transfer fee: 1.5%, capped at NGN 2,000. Cards are 2%, virtual accounts 1%.
const BACHS_ESTIMATE_RATE = 0.015;
const BACHS_ESTIMATE_CAP = 2000;

export type PaymentProvider = "paystack" | "bachs";

export interface TicketFees {
  subtotal: number;
  serviceFee: number;
  total: number; // sent to Paystack (raw)
  paystackFee: number; // the processor's fee on top (simulated for Paystack, estimated for Bachs)
  processorFee: number; // same value, named for either provider
  displayTotal: number; // what the buyer actually pays / cart shows
}

/** The processor's fee added on top of `amount`, for the provider taking new orders. */
function processorFeeFor(amount: number, provider?: string): number {
  if (provider === "bachs") return Math.min(round2(amount * BACHS_ESTIMATE_RATE), BACHS_ESTIMATE_CAP);
  return simulatePaystackFee(amount);
}

/** Simulate the Paystack fee added on top of `amount` (mirrors backend). */
function simulatePaystackFee(amount: number): number {
  // Assume the charge lands under 2,500 first (flat fee waived).
  let charged = round2(amount / (1 - PAYSTACK_RATE));
  if (charged >= PAYSTACK_FLAT_WAIVER_THRESHOLD) {
    // Charge reaches 2,500+, so the flat NGN 100 applies - re-solve with it.
    charged = round2((amount + PAYSTACK_FLAT) / (1 - PAYSTACK_RATE));
  }
  const fee = charged - amount;
  return fee > PAYSTACK_FEE_CAP ? PAYSTACK_FEE_CAP : fee;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * When `passFeeToAttendee` is false, the organiser absorbs Byro's service
 * fee: `serviceFee` is still reported (so it can be shown as deducted from
 * the organiser's payout), but it is NOT added to `total` / `displayTotal` -
 * the attendee only pays the subtotal (plus Paystack's own fee).
 */
/** Byro's standard service fee rate. Each event also carries its organiser's own rate (`event.fee_rate`). */
export const DEFAULT_FEE_RATE = FEE_RATE;

export function calculateTicketFees(
  subtotal: number,
  passFeeToAttendee: boolean = true,
  rate: number = FEE_RATE,
  provider?: string,
): TicketFees {
  if (subtotal <= 0) {
    return { subtotal: 0, serviceFee: 0, total: 0, paystackFee: 0, processorFee: 0, displayTotal: 0 };
  }

  const serviceFee = Math.round(subtotal * (Number.isFinite(rate) ? rate : FEE_RATE));
  const total = passFeeToAttendee ? subtotal + serviceFee : subtotal;
  const paystackFee = processorFeeFor(total, provider);
  const displayTotal = total + paystackFee;

  return { subtotal, serviceFee, total, paystackFee, processorFee: paystackFee, displayTotal };
}
