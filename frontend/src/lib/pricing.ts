/**
 * Single source of truth for Byro's ticket service fee on the frontend.
 * Must mirror Backend/bryo/pricing.py exactly - the backend amount is what
 * actually gets charged on the Paystack checkout page.
 *
 * - subtotal >= NGN 2,500: 8% service fee + a flat NGN 100.
 * - subtotal <  NGN 2,500: 8% service fee only, no flat NGN 100.
 */

const FREE_THRESHOLD = 2500;
const FEE_RATE = 0.08;
const FLAT_FEE = 100;

export interface TicketFees {
  subtotal: number;
  serviceFee: number;
  total: number;
}

export function calculateTicketFees(subtotal: number): TicketFees {
  if (subtotal <= 0) {
    return { subtotal: 0, serviceFee: 0, total: 0 };
  }

  let serviceFee = Math.round(subtotal * FEE_RATE);
  if (subtotal >= FREE_THRESHOLD) {
    serviceFee += FLAT_FEE;
  }

  return { subtotal, serviceFee, total: subtotal + serviceFee };
}
