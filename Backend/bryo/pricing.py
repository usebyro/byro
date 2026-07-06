"""Single source of truth for Byro's ticket service fee.

Rules:
- subtotal >= NGN 2,500: 8% service fee + a flat NGN 100.
- subtotal <  NGN 2,500: 8% service fee only, no flat NGN 100.
- Of the resulting service fee, Paystack's processing cut is 1.5% of the
  service fee, plus the flat NGN 100 where applicable (that NGN 100 passes
  straight through to Paystack). The remainder is Byro's platform fee.
  This split does not change what the buyer is charged - it's only for
  revenue bookkeeping.

This is the amount actually sent to Paystack, so anything the frontend
displays before checkout must be computed with the same formula.
"""
from decimal import Decimal, ROUND_HALF_UP

FREE_THRESHOLD = Decimal('2500')
FEE_RATE = Decimal('0.08')
FLAT_FEE = Decimal('100')
PAYSTACK_CUT_RATE = Decimal('0.015')

_ZERO = Decimal('0')


def calculate_ticket_fees(subtotal):
    """Return the fee breakdown for a ticket subtotal (price * quantity)."""
    subtotal = Decimal(str(subtotal))

    if subtotal <= _ZERO:
        return {
            'subtotal': _ZERO,
            'service_fee': _ZERO,
            'total': _ZERO,
            'paystack_fee': _ZERO,
            'platform_fee': _ZERO,
        }

    service_fee = (subtotal * FEE_RATE).quantize(Decimal('1'), rounding=ROUND_HALF_UP)
    flat_fee_applies = subtotal >= FREE_THRESHOLD
    if flat_fee_applies:
        service_fee += FLAT_FEE

    paystack_fee = (service_fee * PAYSTACK_CUT_RATE).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    if flat_fee_applies:
        paystack_fee += FLAT_FEE
    platform_fee = service_fee - paystack_fee

    return {
        'subtotal': subtotal,
        'service_fee': service_fee,
        'total': subtotal + service_fee,
        'paystack_fee': paystack_fee,
        'platform_fee': platform_fee,
    }
