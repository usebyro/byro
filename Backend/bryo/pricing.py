"""Single source of truth for Byro's ticket pricing.

Rules:
- Byro service fee = 5% of the ticket subtotal. This is Byro's revenue and
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
FEE_RATE = Decimal('0.05')          # the original rate; old orders without a recorded rate were charged this
DEFAULT_FEE_RATE = FEE_RATE
MAX_FEE_RATE = Decimal('0.15')      # guardrail: the admin can't set more than 15%


def default_fee_rate():
    """The platform-wide service fee rate, as set by Byro owners in the admin."""
    from .models import PlatformSettings
    try:
        return PlatformSettings.get().default_fee_rate
    except Exception:  # e.g. before the migration has run
        return DEFAULT_FEE_RATE


def fee_rate_for(organizer):
    """The service fee rate for this organiser's events: their own deal if Byro set one, else the default."""
    if organizer is not None and getattr(organizer, 'pk', None):
        from .models import UserProfile
        override = UserProfile.objects.filter(user=organizer).values_list('fee_rate_override', flat=True).first()
        if override is not None:
            return override
    return default_fee_rate()

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


def calculate_ticket_fees(subtotal, pass_fee_to_attendee=True, rate=None):
    """Return the fee breakdown for a ticket subtotal (price * quantity).

    When `pass_fee_to_attendee` is False, the organiser has chosen to absorb
    Byro's service fee themselves: `service_fee` is still reported (so it can
    be deducted from their payout), but it is NOT added to `total` /
    `display_total` - the attendee is only charged the subtotal (plus
    Paystack's own fee).

    `rate` is the service fee rate for this event's organiser (see fee_rate_for); the default rate if omitted.
    """
    subtotal = Decimal(str(subtotal))
    rate = DEFAULT_FEE_RATE if rate is None else Decimal(str(rate))

    if subtotal <= _ZERO:
        return {
            'subtotal': _ZERO,
            'service_fee': _ZERO,
            'total': _ZERO,
            'paystack_fee': _ZERO,
            'display_total': _ZERO,
        }

    # Byro's service fee (always computed, even if organiser-absorbed).
    service_fee = (subtotal * rate).quantize(_NAIRA, rounding=ROUND_HALF_UP)
    # The raw amount we send to Paystack.
    total = subtotal + service_fee if pass_fee_to_attendee else subtotal

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
