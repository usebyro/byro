"""
GET /api/dashboard/events/

Every event the organiser runs (owned, or co-hosted and accepted), drafts
included, with the numbers the dashboard Events list shows per row: tickets
sold, seats (effective capacity), people checked in, and revenue.

Revenue uses the same net-of-fee rule as the payout balance and the overview
analytics, and is only given for events you own (co-hosts don't receive it).
"""
from decimal import Decimal

from django.db.models import Count, Q, Sum
from django.db.models.functions import Coalesce
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Event, EventCoHost, Ticket, TicketTier
from .views import ticket_net_price_expr


class DashboardEventsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        today = timezone.localdate()

        events = list(
            Event.objects.filter(
                Q(owner=user) | Q(
                    cohosts__user=user,
                    cohosts__status=EventCoHost.STATUS_ACCEPTED,
                ),
                is_active=True,
            ).distinct().prefetch_related('tiers').order_by('day', 'time_from')
        )
        ids = [e.pk for e in events]
        owned = {e.pk for e in events if e.owner_id == user.id}

        sold_qs = Ticket.objects.filter(event_id__in=ids, payment_status__in=['paid', 'free'])
        counts = {
            row['event_id']: row
            for row in sold_qs.values('event_id').annotate(
                sold=Count('id'), checked_in=Count('id', filter=Q(checked_in=True)),
            )
        }
        revenue = dict(
            Ticket.objects.filter(event_id__in=owned, payment_status='paid')
            .values('event_id').annotate(t=Coalesce(Sum(ticket_net_price_expr()), Decimal('0')))
            .values_list('event_id', 't')
        )
        paid_tier_events = set(
            TicketTier.objects.filter(event_id__in=ids, price__gt=0).values_list('event_id', flat=True)
        )

        def capacity(e):
            # Event.effective_capacity(), but from the prefetched tiers (one query, not one per event).
            if e.capacity:
                return e.capacity
            caps = [t.capacity for t in e.tiers.all()]
            if caps and all(c is not None for c in caps):
                return sum(caps)
            return None

        def row(e):
            c = counts.get(e.pk, {})
            is_owner = e.pk in owned
            return {
                'slug': e.slug,
                'name': e.name,
                'day': str(e.day),
                'time_from': str(e.time_from) if e.time_from else None,
                'location': e.location,
                'category': e.category,
                'event_image_url': (
                    request.build_absolute_uri(e.event_image.url) if e.event_image else None
                ),
                'is_draft': e.is_draft,
                'is_cancelled': bool(e.cancelled_at),
                'is_past': e.day < today,
                'is_owner': is_owner,
                'is_free': e.ticket_price == 0 and e.pk not in paid_tier_events,
                'capacity': capacity(e),
                'sold': c.get('sold', 0),
                'checked_in': c.get('checked_in', 0),
                'revenue': str(revenue.get(e.pk, Decimal('0'))) if is_owner else None,
            }

        return Response({'currency': 'NGN', 'events': [row(e) for e in events]})
