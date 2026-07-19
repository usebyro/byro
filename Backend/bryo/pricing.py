"""Single source of truth for Byro's ticket pricing.

Rules:
- Byro service fee = 6.5% of the ticket subtotal. This is Byro's revenue and
  the only fee Byro itself charges.
- The amount SENT to Paystack is `subtotal + service_fee` (the ``total`` field
  below). Paystack is configured so its own charge is added on top of this
  amount at checkout (fees borne by the customer), so the buyer ultimately
  pays a little more than ``total``.
- Paystack's local-transaction fee is 1.5% + NGN 100, where the flat NGN 100
  is waived when the charge is under NGN 2,500, and the total fee is capped at
  NGN 2,000. We SIMULATE this in ``paystack_fee`` / ``display_total`` so the
  cart can show the buyer their true all-in payment before checkout - no fee
  should jump at them on the Paystack page.

Two numbers, two jobs:
- ``total``        -> what the backend actually sends to Paystack (raw).
- ``display_total``-> what the frontend cart shows (grossed up so it equals
                      what Paystack will really charge the buyer).

NEVER send ``display_total`` to Paystack, or its fee would be applied twice.
This module is mirrored by frontend/src/lib/pricing.ts - keep them in sync.
"""
from decimal import Decimal, ROUND_HALF_UP

# Byro's service fee.
FEE_RATE = Decimal('0.065')

# Paystack local-transaction fee parameters (for simulation only).
PAYSTACK_RATE = Decimal('0.015')
PAYSTACK_FLAT = Decimal('100')
PAYSTACK_FLAT_WAIVER_THRESHOLD = Decimal('2500')  # flat fee waived under this charge
PAYSTACK_FEE_CAP = Decimal('2000')                # max fee per transaction

_ZERO = Decimal('0')
_ONE = Decimal('1')
_NAIRA = Decimal('1')
_KOBO = Decimal('0.01')


def _simulate_paystack_fee(amount):
    """Simulate the Paystack fee added on top of `amount`.

    Solves for the charge that nets Byro `amount` after Paystack deducts
    1.5% + NGN 100 (the flat 100 waived when the charge is under 2,500),
    with the fee capped at NGN 2,000. Returns the fee (charge - amount).
    """
    # Assume the charge lands under 2,500 first (flat fee waived).
    charged = (amount / (_ONE - PAYSTACK_RATE)).quantize(_KOBO, rounding=ROUND_HALF_UP)
    if charged >= PAYSTACK_FLAT_WAIVER_THRESHOLD:
        # Charge reaches 2,500+, so the flat NGN 100 applies - re-solve with it.
        charged = ((amount + PAYSTACK_FLAT) / (_ONE - PAYSTACK_RATE)).quantize(
            _KOBO, rounding=ROUND_HALF_UP
        )

    fee = charged - amount
    if fee > PAYSTACK_FEE_CAP:
        fee = PAYSTACK_FEE_CAP
    return fee


def calculate_ticket_fees(subtotal):
    """Return the fee breakdown for a ticket subtotal (price * quantity)."""
    subtotal = Decimal(str(subtotal))

    if subtotal <= _ZERO:
        return {
            'subtotal': _ZERO,
            'service_fee': _ZERO,
            'total': _ZERO,
            'paystack_fee': _ZERO,
            'display_total': _ZERO,
        }

    # Byro's service fee, and the raw amount we send to Paystack.
    service_fee = (subtotal * FEE_RATE).quantize(_NAIRA, rounding=ROUND_HALF_UP)
    total = subtotal + service_fee

    # Simulated Paystack cut and the true all-in amount the buyer will pay.
    paystack_fee = _simulate_paystack_fee(total)
    display_total = total + paystack_fee

    return {
        'subtotal': subtotal,
        'service_fee': service_fee,
        'total': total,                  # sent to Paystack (raw)
        'paystack_fee': paystack_fee,    # added on top by Paystack (simulated)
        'display_total': display_total,  # what the buyer actually pays / cart shows
    }
