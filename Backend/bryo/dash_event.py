"""
The dashboard page for one event (/dashboard/events/<slug>).

  GET  /api/dashboard/events/<slug>/summary/
       Revenue (total and per ticket type) and how many people followed you
       after getting a ticket to this event.
  GET  /api/dashboard/events/<slug>/guests/<ticket_id>/
       One guest's order: its reference, how many tickets it covered, what the
       buyer paid and what you get, and how many of your events they've had
       tickets for.
  POST /api/dashboard/events/<slug>/cohosts/<id>/resend/
       Send a pending co-host invite again.

The owner and accepted co-hosts can open the first two. Money is only given
to the owner (co-hosts don't receive it), the same rule as the analytics.
Resending an invite is for the owner only, like every other co-host change.
"""
from decimal import Decimal

from django.db.models import Count, F, OuterRef, Q, Subquery, Sum
from django.db.models.functions import Coalesce
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from .community import REGULAR_AFTER
from .models import Event, EventCoHost, Follow, Stamp, Ticket
from .views import send_cohost_invite_email, ticket_net_price_expr

CONFIRMED = ('paid', 'free')
ZERO = Decimal('0')


def _event_for(user, slug):
    """The event and the user's role on it, or (None, None) when they don't help run it."""
    event = Event.objects.filter(slug=slug).select_related('owner').first()
    if event is None:
        return None, None
    role = event.get_user_role(user)
    if not role['can_check_in']:
        return None, None
    return event, role


def _not_found():
    return Response({'error': 'Event not found'}, status=status.HTTP_404_NOT_FOUND)


class DashEventSummaryView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, slug):
        event, role = _event_for(request.user, slug)
        if event is None:
            return _not_found()

        revenue = tier_revenue = None
        if role['is_owner']:
            paid = Ticket.objects.filter(event=event, payment_status='paid')
            net = ticket_net_price_expr()
            revenue = str(paid.aggregate(t=Coalesce(Sum(net), ZERO))['t'])
            tier_revenue = {
                str(row['tier_id'] or 'none'): str(row['t'])
                for row in paid.values('tier_id').annotate(t=Coalesce(Sum(net), ZERO))
            }

        # A follower counts as "from this event" when they started following
        # after getting their first ticket to it (checkout offers the follow).
        first_ticket = (
            Ticket.objects.filter(event=event, payment_status__in=CONFIRMED)
            .filter(Q(user=OuterRef('follower')) | Q(original_owner_email__iexact=OuterRef('follower__email')))
            .order_by('created_at').values('created_at')[:1]
        )
        new_followers = 0
        if event.owner_id:
            new_followers = (
                Follow.objects.filter(following=event.owner)
                .annotate(first=Subquery(first_ticket))
                .filter(first__isnull=False, created_at__gte=F('first'))
                .count()
            )

        return Response({
            'is_owner': role['is_owner'],
            'capacity': event.effective_capacity(),
            'revenue': revenue,
            'tier_revenue': tier_revenue,
            'new_followers': new_followers,
        })


class DashEventGuestView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, slug, ticket_id):
        event, role = _event_for(request.user, slug)
        if event is None:
            return _not_found()
        ticket = (
            Ticket.objects.filter(event=event, ticket_id=ticket_id)
            .select_related('payment', 'tier').first()
        )
        if ticket is None:
            return Response({'error': 'Guest not found'}, status=status.HTTP_404_NOT_FOUND)

        order = None
        payment = ticket.payment
        if payment is not None:
            in_order = list(
                Ticket.objects.filter(payment=payment).order_by('created_at', 'pk').values_list('pk', flat=True)
            )
            order = {
                'reference': payment.paystack_reference,
                'tickets': len(in_order),
                'position': in_order.index(ticket.pk) + 1 if ticket.pk in in_order else 1,
                'channel': payment.get_channel_display() if payment.channel else '',
            }
            if role['is_owner']:
                net = (
                    Ticket.objects.filter(payment=payment, payment_status='paid')
                    .aggregate(t=Coalesce(Sum(ticket_net_price_expr()), ZERO))['t']
                )
                order.update({
                    'paid': str(payment.amount),
                    'net': str(net),
                    'fee_paid_by_buyer': bool(event.pass_fee_to_attendee),
                })

        # How this person knows you: your events they've had a ticket for, and shown up to.
        email = (ticket.current_owner_email or '').strip()
        events_with_you = attended = 0
        if email and event.owner_id:
            events_with_you = (
                Ticket.objects.filter(
                    event__owner_id=event.owner_id, payment_status__in=CONFIRMED,
                    current_owner_email__iexact=email,
                ).values('event').distinct().count()
            )
            attended = (
                Stamp.objects.filter(organizer_id=event.owner_id, email__iexact=email)
                .aggregate(n=Count('event', distinct=True))['n']
            )

        return Response({
            'ticket_id': str(ticket.ticket_id),
            'order': order,
            'events_with_you': events_with_you,
            'events_attended': attended,
            'is_regular': attended >= REGULAR_AFTER,
        })


class DashEventCohostResendView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'cohost_invite'

    def post(self, request, slug, pk):
        event, role = _event_for(request.user, slug)
        if event is None or not role['is_owner']:
            return _not_found()
        cohost = EventCoHost.objects.filter(event=event, pk=pk).first()
        if cohost is None:
            return Response({'error': 'Invite not found'}, status=status.HTTP_404_NOT_FOUND)
        if cohost.status != EventCoHost.STATUS_PENDING:
            return Response({'error': 'They have already accepted'}, status=status.HTTP_400_BAD_REQUEST)
        send_cohost_invite_email(cohost.invited_email, event, request.user, is_new_user=True, role=cohost.role)
        return Response({'message': f'Invite sent again to {cohost.invited_email}'})
