"""
GET /api/dashboard/overview/?period=7d|30d|all

Everything the dashboard Overview shows for one period, scoped to events the
organiser runs (owned, or co-hosted and accepted). Drafts and switched-off
events are ignored.

  - revenue      : total, the same-length period before (null for all time),
                   and a series: one point per day for 7d/30d, per quarter for all
  - tickets      : tickets sold in the period, a matching series, and which events sold
  - checked_in   : people checked in, a matching series, the event with the most
                   check-ins and its turnout (all time: average turnout of past events)
  - followers    : new followers in the period, a series, the total, and how many
                   followers have been to one of your events
  - community    : new followers, people who became regulars, and the share of
                   people who showed up that had been before
  - next_event   : the soonest upcoming event with sold of capacity, revenue and per-tier sales
  - recent_sales : the five latest orders (buyer, tier, event, time, amount)

Revenue uses the same net-of-fee rule as the payout balance and the analytics
view (ticket_net_price_expr), for events you own only (co-hosts don't receive it).
Days are Lagos days, so "today" matches the organisers' clock.
"""
from datetime import datetime, time, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from django.db.models import Count, Min, Q, Sum
from django.db.models.functions import Coalesce, TruncDate, TruncQuarter
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .community import REGULAR_AFTER
from .models import Event, EventCoHost, Follow, Stamp, Ticket, TicketTier, UserProfile
from .views import ticket_net_price_expr

LAGOS = ZoneInfo('Africa/Lagos')
PERIOD_DAYS = {'7d': 7, '30d': 30}
SOLD = ['paid', 'free']
ZERO = Decimal('0')


def _quarter(dt):
    return dt.year, (dt.month - 1) // 3 + 1


def _quarters(first, last):
    """Every (year, quarter) from first to last, inclusive."""
    out, (y, q) = [], first
    while (y, q) <= last:
        out.append((y, q))
        y, q = (y + 1, 1) if q == 4 else (y, q + 1)
    return out


def _person_name(user):
    profile = UserProfile.objects.filter(user=user).first()
    return ((profile.display_name if profile else '') or user.get_full_name() or user.email.split('@')[0]).strip()


class DashboardOverviewView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        period = (request.query_params.get('period') or '30d').strip().lower()
        if period not in ('7d', '30d', 'all'):
            period = '30d'
        now = timezone.now()
        today = timezone.localtime(now, LAGOS).date()

        events = Event.objects.filter(
            Q(owner=user) | Q(cohosts__user=user, cohosts__status=EventCoHost.STATUS_ACCEPTED),
            is_active=True,
            is_draft=False,
        ).distinct()
        event_ids = list(events.values_list('pk', flat=True))
        owned_ids = set(events.filter(owner=user).values_list('pk', flat=True))

        net_price = ticket_net_price_expr()
        sold = Ticket.objects.filter(event_id__in=event_ids, payment_status__in=SOLD)
        paid = Ticket.objects.filter(event_id__in=owned_ids, payment_status='paid')
        checked = Ticket.objects.filter(event_id__in=event_ids, checked_in=True, checked_in_at__isnull=False)
        follows = Follow.objects.filter(following=user)

        # Buckets: Lagos days for 7d/30d, calendar quarters for all time.
        if period in PERIOD_DAYS:
            n = PERIOD_DAYS[period]
            days = [today - timedelta(days=i) for i in range(n - 1, -1, -1)]
            start = datetime.combine(days[0], time.min, tzinfo=LAGOS)
            prev_start = start - timedelta(days=n)
            keys = days
            labels = [d.isoformat() for d in days]

            def bucket(field):
                return TruncDate(field, tzinfo=LAGOS)

            def key_of(v):
                return v.date() if isinstance(v, datetime) else v
        else:
            start = prev_start = None
            firsts = [
                v for v in (
                    sold.aggregate(m=Min('created_at'))['m'],
                    follows.aggregate(m=Min('created_at'))['m'],
                ) if v
            ]
            first_q = _quarter(timezone.localtime(min(firsts), LAGOS)) if firsts else _quarter(today)
            keys = _quarters(first_q, _quarter(today))
            labels = [f'{y}-Q{q}' for y, q in keys]

            def bucket(field):
                return TruncQuarter(field, tzinfo=LAGOS)

            def key_of(v):
                return _quarter(timezone.localtime(v, LAGOS) if isinstance(v, datetime) and timezone.is_aware(v) else v)

        def in_window(qs, field, lo=start, hi=None):
            if lo is not None:
                qs = qs.filter(**{f'{field}__gte': lo})
            if hi is not None:
                qs = qs.filter(**{f'{field}__lt': hi})
            return qs

        def series(qs, field, agg):
            rows = in_window(qs, field).annotate(b=bucket(field)).values('b').annotate(v=agg).values_list('b', 'v')
            by_key = {}
            for b, v in rows:
                if b is not None:
                    k = key_of(b)
                    by_key[k] = by_key.get(k, 0) + (v or 0)
            return [by_key.get(k, 0) for k in keys]

        # Revenue
        rev_series = series(paid, 'created_at', Sum(net_price))
        revenue_total = sum((Decimal(v) for v in rev_series), ZERO)
        previous = None
        if prev_start is not None:
            previous = in_window(paid, 'created_at', prev_start, start).aggregate(
                t=Coalesce(Sum(net_price), ZERO))['t']
        first_sale = paid.aggregate(m=Min('created_at'))['m']

        # Tickets sold, and which events sold them
        ticket_series = series(sold, 'created_at', Count('pk'))
        by_event = list(
            in_window(sold, 'created_at').values('event__name')
            .annotate(n=Count('pk')).order_by('-n').values_list('event__name', flat=True)
        )

        # Checked in, with the event that had the most people through the door
        checked_series = series(checked, 'checked_in_at', Count('pk'))
        sold_per_event = dict(sold.values('event_id').annotate(n=Count('pk')).values_list('event_id', 'n'))
        top_checked = (
            in_window(checked, 'checked_in_at').values('event_id', 'event__name', 'event__slug')
            .annotate(n=Count('pk')).order_by('-n').first()
        )
        top_event = None
        if top_checked:
            all_in = checked.filter(event_id=top_checked['event_id']).count()
            total_sold = sold_per_event.get(top_checked['event_id'], 0)
            top_event = {
                'name': top_checked['event__name'],
                'slug': top_checked['event__slug'],
                'turnout': round(100 * all_in / total_sold) if total_sold else None,
            }
        past_ids = [pk for pk in events.filter(day__lt=today).values_list('pk', flat=True) if sold_per_event.get(pk)]
        checked_per_event = dict(
            checked.filter(event_id__in=past_ids).values('event_id').annotate(n=Count('pk')).values_list('event_id', 'n')
        )
        turnouts = [min(checked_per_event.get(pk, 0) / sold_per_event[pk], 1) for pk in past_ids]

        # Followers
        follower_series = series(follows, 'created_at', Count('pk'))
        follower_emails = set(follows.values_list('follower__email', flat=True))
        stamps = Stamp.objects.filter(organizer=user)
        stamp_emails = set(stamps.values_list('email', flat=True).distinct())
        came_to_event = len({e.lower() for e in follower_emails if e} & stamp_emails)

        # Community: who became a regular in the period, and who came back.
        # A person's arrival at an event is their first stamp for it.
        arrivals = {}
        for email, first in stamps.values('email', 'event_id').annotate(first=Min('created_at')).values_list('email', 'first'):
            arrivals.setdefault(email, []).append(first)
        became_regulars = attended = came_back = 0
        for times in arrivals.values():
            times.sort()
            if len(times) >= REGULAR_AFTER and (start is None or times[REGULAR_AFTER - 1] >= start):
                became_regulars += 1
            if start is None or times[-1] >= start:
                attended += 1
                if len(times) >= 2:
                    came_back += 1

        return Response({
            'period': period,
            'unit': 'day' if period in PERIOD_DAYS else 'quarter',
            'first_name': (user.first_name or '').strip(),
            'community_name': (getattr(UserProfile.objects.filter(user=user).first(), 'display_name', '') or '').strip(),
            'labels': labels,
            'revenue': {
                'total': str(revenue_total),
                'previous': str(previous) if previous is not None else None,
                'series': [str(v) for v in rev_series],
                'since': timezone.localtime(first_sale, LAGOS).year if first_sale else None,
                'events_hosted': events.filter(day__lte=today).count(),
            },
            'tickets': {
                'total': sum(ticket_series),
                'series': ticket_series,
                'event_count': len(by_event),
                'events': by_event[:2],
            },
            'checked_in': {
                'total': sum(checked_series),
                'series': checked_series,
                'top_event': top_event,
                'average_turnout': round(100 * sum(turnouts) / len(turnouts)) if turnouts else None,
            },
            'followers': {
                'new': sum(follower_series),
                'total': follows.count(),
                'series': follower_series,
                'came_to_event': came_to_event,
            },
            'community': {
                'new_followers': sum(follower_series),
                'became_regulars': became_regulars,
                'came_back_rate': round(100 * came_back / attended) if attended else None,
            },
            'next_event': self.next_event(request, events, owned_ids, net_price, today),
            'recent_sales': self.recent_sales(event_ids, owned_ids, net_price),
        })

    def next_event(self, request, events, owned_ids, net_price, today):
        event = (
            events.filter(day__gte=today, cancelled_at__isnull=True)
            .select_related('owner').order_by('day', 'time_from').first()
        )
        if event is None:
            return None
        tickets = event.tickets.filter(payment_status__in=SOLD)
        owned = event.pk in owned_ids
        tiers = list(
            TicketTier.objects.filter(event=event)
            .annotate(n=Count('tickets', filter=Q(tickets__payment_status__in=SOLD)))
            .order_by('order', 'created_at')
        )
        is_free = event.ticket_price == 0 and not any(t.price > 0 for t in tiers)
        revenue = None
        if owned:
            revenue = str(
                tickets.filter(payment_status='paid').aggregate(t=Coalesce(Sum(net_price), ZERO))['t']
            )
        hosts = []
        if event.owner_id:
            hosts.append({'name': _person_name(event.owner), 'is_you': event.owner_id == request.user.pk})
        for cohost in event.cohosts.filter(status=EventCoHost.STATUS_ACCEPTED, user__isnull=False).select_related('user'):
            hosts.append({'name': _person_name(cohost.user), 'is_you': cohost.user_id == request.user.pk})
        return {
            'slug': event.slug,
            'name': event.name,
            'day': event.day.isoformat(),
            'time_from': event.time_from.strftime('%H:%M') if event.time_from else None,
            'location': event.location,
            'image_url': request.build_absolute_uri(event.event_image.url) if event.event_image else None,
            'category': event.category,
            'is_owner': owned,
            'is_free': is_free,
            'sold': tickets.count(),
            'capacity': event.effective_capacity(),
            'sold_out': event.is_sold_out(),
            'revenue': revenue,
            'tiers': [{'name': t.name, 'sold': t.n, 'capacity': t.capacity} for t in tiers],
            'hosts': hosts,
        }

    def recent_sales(self, event_ids, owned_ids, net_price, limit=5):
        """The latest orders. Tickets bought together (one payment) are one sale."""
        rows = (
            Ticket.objects.filter(event_id__in=event_ids, payment_status__in=SOLD)
            .select_related('tier', 'event').annotate(net=net_price).order_by('-created_at')[:60]
        )
        sales, by_key = [], {}
        for t in rows:
            # Free orders have no payment: tickets for the same buyer and event made together are one order.
            key = t.payment_id or ('free', t.event_id, t.original_owner_email.lower(), t.created_at.replace(second=0, microsecond=0))
            sale = by_key.get(key)
            if sale is None:
                if len(sales) == limit:
                    continue
                sale = {
                    'name': t.original_owner_name or t.original_owner_email.split('@')[0],
                    'tier': t.tier.name if t.tier else ('Free' if t.payment_status == 'free' else 'Ticket'),
                    'event': t.event.name,
                    'event_slug': t.event.slug,
                    'created_at': t.created_at.isoformat(),
                    'quantity': 0,
                    'amount': ZERO if t.event_id in owned_ids else None,
                }
                by_key[key] = sale
                sales.append(sale)
            sale['quantity'] += 1
            if sale['amount'] is not None and t.payment_status == 'paid':
                sale['amount'] += t.net or ZERO
        for sale in sales:
            if sale['amount'] is not None:
                sale['amount'] = str(sale['amount'])
        return sales
