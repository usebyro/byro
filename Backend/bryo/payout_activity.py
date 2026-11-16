"""
Everything that moved an organiser's balance, newest first, for the Payouts page:

  ticket sales (one line per order), merch released, ticket refunds, and payouts (with where each one stands).

Merch money that is still waiting out its safety window, or on hold, has not moved the balance yet, so it is
not listed here (the Payouts page shows it as its own figures).
"""
from decimal import Decimal

from django.db.models import Q
from django.db.models.functions import Coalesce
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import MerchOrder, PayoutRequest, Refund, Ticket

LIMIT = 40
SOURCES = ('tickets', 'merch', 'refunds', 'withdrawals')


def activity(user, limit=LIMIT):
    from .views import ticket_net_price_expr  # lazy: views imports this module's neighbours

    rows = []

    # Ticket sales: one line per order (a purchase can be several tickets).
    paid = (Ticket.objects.filter(event__owner=user, payment_status='paid')
            .select_related('event', 'payment').annotate(net=ticket_net_price_expr()).order_by('-created_at')[:300])
    groups = {}
    for t in paid:
        key = ('p', t.payment_id) if t.payment_id else ('t', t.pk)
        g = groups.setdefault(key, {'at': (t.payment.paid_at if t.payment_id and t.payment.paid_at else t.created_at),
                                    'event': t.event.name, 'count': 0, 'amount': Decimal('0')})
        g['count'] += 1
        g['amount'] += t.net
    for g in groups.values():
        if g['amount'] > 0:
            rows.append({'at': g['at'], 'source': 'tickets', 'amount': g['amount'],
                         'description': f"{g['count']} {'ticket' if g['count'] == 1 else 'tickets'} sold",
                         'detail': g['event']})

    # Merch money that has been released to the balance.
    now = timezone.now()
    released = (MerchOrder.objects.filter(seller=user, status__in=[MerchOrder.DELIVERED, MerchOrder.PICKED_UP])
                .filter(Q(release_at__isnull=True) | Q(release_at__lte=now))
                .exclude(reported_at__isnull=False, report_resolved_at__isnull=True)
                .annotate(done_at=Coalesce('release_at', 'delivered_at', 'picked_up_at')).order_by('-done_at')[:100])
    for o in released:
        rows.append({'at': o.done_at, 'source': 'merch', 'amount': o.earnings,
                     'description': f"Merch order {o.ref} released", 'detail': o.buyer_name.split(' ')[0] if o.buyer_name else ''})

    # Ticket refunds, which take the refunded tickets out of the earnings.
    for r in Refund.objects.filter(event__owner=user).select_related('event').order_by('-created_at')[:60]:
        rows.append({'at': r.created_at, 'source': 'refunds', 'amount': -r.amount,
                     'description': 'Refund to a buyer', 'detail': r.event.name})

    # Every payout the organiser asked for. A pending or paid one has taken the money out of the balance; one
    # that was rejected has not (it went back), so it is listed as 'unpaid' and its amount does not count.
    for p in PayoutRequest.objects.filter(user=user).order_by('-requested_at')[:60]:
        where = (f"{p.bank_name} ••••{p.account_number[-4:]}".strip() if p.method == 'bank' and p.account_number
                 else p.bank_name or ('wallet' if p.method == 'wallet' else 'your bank'))
        rows.append({'at': p.requested_at, 'source': 'withdrawals', 'amount': -p.amount,
                     'status': {'processed': 'paid', 'on_hold': 'on_hold', 'rejected': 'unpaid'}.get(p.status, 'pending'),
                     'description': f"Payout to {where}", 'detail': p.event.name if p.event_id else ''})

    rows.sort(key=lambda r: r['at'], reverse=True)
    return rows[:limit]


class PayoutActivityView(APIView):
    """GET /api/payouts/activity/ — what moved the balance, newest first."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response({'results': [
            {**r, 'amount': f"{Decimal(r['amount']).quantize(Decimal('0.01')):.2f}"} for r in activity(request.user)
        ]})
