"""
Read-only sales report for the finance sheet.

    GET /api/reports/sales/[?since=YYYY-MM-DD]      header: X-API-Key: <REPORTS_API_KEY>

One row per live event: tickets sold, gross ticket sales, Byro's fee and the payout. No attendee
names, emails or card details. The key is a static secret set in the REPORTS_API_KEY environment
variable; with it unset or the key wrong the answer is 401, and no other sign-in works on this route.
"""
import hmac
from collections import defaultdict
from datetime import date
from decimal import Decimal, ROUND_HALF_UP

from django.conf import settings
from django.utils import timezone
from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed, ValidationError
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Event, Payment, PayoutRequest, Ticket
from .pricing import fee_rate_for
from .refunds import refundable_amount

_CENTS = Decimal('0.01')


class ReportsKeyAuthentication(BaseAuthentication):
    """The X-API-Key header against REPORTS_API_KEY, compared in constant time."""

    def authenticate(self, request):
        expected = getattr(settings, 'REPORTS_API_KEY', '') or ''
        key = request.headers.get('X-API-Key', '')
        if not expected or not hmac.compare_digest(key.encode(), expected.encode()):
            raise AuthenticationFailed('A valid API key is required.')
        return (None, key)

    def authenticate_header(self, request):
        return 'X-API-Key'  # makes a bad key a 401 rather than a 403


def _money(value):
    return f"{Decimal(value or 0).quantize(_CENTS, rounding=ROUND_HALF_UP):.2f}"


def _service_fee(payment):
    """Byro's fee on one order: the amount recorded at checkout, else worked out from its rate."""
    stored = (payment.metadata or {}).get('service_fee')
    if stored not in (None, ''):
        return Decimal(str(stored))
    return (refundable_amount(payment) * (payment.fee_rate or Decimal('0'))).quantize(Decimal('1'), rounding=ROUND_HALF_UP)


class SalesReportView(APIView):
    authentication_classes = [ReportsKeyAuthentication]
    permission_classes = [AllowAny]  # the authentication class above is the gate
    throttle_scope = 'reports'

    def get(self, request):
        events = Event.objects.filter(is_draft=False).select_related('owner', 'owner__profile').order_by('day', 'pk')
        since = request.query_params.get('since')
        if since:
            try:
                events = events.filter(day__gte=date.fromisoformat(since))
            except ValueError:
                raise ValidationError({'since': 'Use a date like 2026-09-01.'})
        events = list(events)
        ids = [e.pk for e in events]

        # Tickets that exist and still count: paid or free, not refunded or cancelled.
        sold = defaultdict(int)
        for event_id in Ticket.objects.filter(event_id__in=ids, payment_status__in=['paid', 'free']).values_list('event_id', flat=True):
            sold[event_id] += 1

        # Paid orders that were not returned to the buyer.
        orders = defaultdict(list)
        paid = Payment.objects.filter(event_id__in=ids, status='successful', refund__isnull=True)
        for payment in paid.order_by('paid_at', 'created_at'):
            orders[payment.event_id].append(payment)

        payouts = defaultdict(list)
        for payout in PayoutRequest.objects.filter(event_id__in=ids, status='processed'):
            payouts[payout.event_id].append(payout)

        results = []
        for event in events:
            event_orders = orders[event.pk]
            done = payouts[event.pk]
            rate = event_orders[-1].fee_rate if event_orders else fee_rate_for(event.owner)
            owner = event.owner
            profile = getattr(owner, 'profile', None) if owner else None
            dates = [p.processed_at for p in done if p.processed_at]
            results.append({
                'event_id': event.pk,
                'event_name': event.name,
                'organiser': ((profile.display_name if profile else '') or (owner.email if owner else '')),
                'event_date': event.day.isoformat() if event.day else None,
                'fee_rate': f"{Decimal(rate):.4f}",
                'pass_fee_to_attendee': event.pass_fee_to_attendee,
                'tickets_sold': sold[event.pk],
                'gross_sales': _money(sum((refundable_amount(p) for p in event_orders), Decimal('0'))),
                'platform_fee': _money(sum((_service_fee(p) for p in event_orders), Decimal('0'))),
                'processing_fee': '0.00',  # Paystack's charge is added on top for the buyer and is not stored per order
                'payout_status': 'paid' if done else 'pending',
                'payout_amount': _money(sum((p.amount for p in done), Decimal('0'))) if done else None,
                'payout_date': max(dates).date().isoformat() if dates else None,
            })

        return Response({'generated_at': timezone.now().isoformat(), 'results': results})
