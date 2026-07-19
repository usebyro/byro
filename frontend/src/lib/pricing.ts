/**
 * Single source of truth for Byro's ticket pricing on the frontend.
 * Mirrors Backend/bryo/pricing.py exactly.
 *
 * - Byro service fee = 6.5% of the ticket subtotal (Byro's revenue).
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
 * The backend recomputes everything itself, so these values are for display.
 */

const FEE_RATE = 0.065;

// Paystack local-transaction fee parameters (for simulation only).
const PAYSTACK_RATE = 0.015;
const PAYSTACK_FLAT = 100;
const PAYSTACK_FLAT_WAIVER_THRESHOLD = 2500; // flat fee waived under this charge
const PAYSTACK_FEE_CAP = 2000; // max fee per transaction

export interface TicketFees {
  subtotal: number;
  serviceFee: number;
  total: number; // sent to Paystack (raw)
  paystackFee: number; // added on top by Paystack (simulated)
  displayTotal: number; // what the buyer actually pays / cart shows
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

export function calculateTicketFees(subtotal: number): TicketFees {
  if (subtotal <= 0) {
    return { subtotal: 0, serviceFee: 0, total: 0, paystackFee: 0, displayTotal: 0 };
  }

  const serviceFee = Math.round(subtotal * FEE_RATE);
  const total = subtotal + serviceFee;
  const paystackFee = simulatePaystackFee(total);
  const displayTotal = total + paystackFee;

  return { subtotal, serviceFee, total, paystackFee, displayTotal };
}
