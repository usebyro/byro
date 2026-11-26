"""
Emails to organisers (and co-hosts) about ticket sales, as chosen in Settings > Notifications.

  every  an email the moment an order completes (on_sale)
  daily  one email at 8 AM in their time zone, only on days with sales (send_daily_summaries)
  off    none; sales still show in the app

Door staff never get these. Co-hosts get them without the money lines: revenue belongs to the owner.
Nothing here raises: a failed email must never undo or slow a sale.
"""
import logging
from collections import OrderedDict
from datetime import datetime, time, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from django.conf import settings
from django.db import transaction
from django.db.models import Q, Sum
from django.db.models.functions import Coalesce
from django.utils import timezone

from .models import Event, EventCoHost, Payment, Ticket, UserProfile

logger = logging.getLogger(__name__)

SUMMARY_FROM_HOUR = 8
MAX_SUMMARY_ROWS = 10


def _site():
    return (getattr(settings, 'FRONTEND_URL', '') or 'https://usebyro.com').rstrip('/')


def _tz(profile):
    try:
        return ZoneInfo(profile.timezone if profile else 'Africa/Lagos')
    except Exception:
        return ZoneInfo('Africa/Lagos')


def _name(user):
    return (user.get_full_name() or '').strip() or user.email


def sold_count(event):
    return event.tickets.filter(payment_status__in=['paid', 'free']).count()


def recipients(event):
    """[(user, is_owner)]: the owner, and co-hosts who can see sales (not door staff)."""
    out = []
    if event.owner_id and event.owner.email:
        out.append((event.owner, True))
    for ch in event.cohosts.filter(status=EventCoHost.STATUS_ACCEPTED, role=EventCoHost.ROLE_MANAGER).select_related('user'):
        if ch.user and ch.user.email:
            out.append((ch.user, False))
    return out


def _profile(user):
    return UserProfile.objects.filter(user_id=user.pk).first()


def _tier_lines(tickets):
    counts = OrderedDict()
    for t in tickets:
        name = t.tier.name if t.tier_id else 'General admission'
        counts[name] = counts.get(name, 0) + 1
    return list(counts.items())


def _earnings(payment):
    """What the owner earns from this order: the ticket price after discounts and, if they carry it, Byro's fee."""
    from .views import ticket_net_price_expr
    return Ticket.objects.filter(payment=payment, payment_status='paid').aggregate(
        total=Coalesce(Sum(ticket_net_price_expr()), Decimal('0')))['total']


def send_sale_emails(event_id, ticket_ids, payment_id=None, buyer=''):
    """The 'every sale' emails for one completed order. Runs off the request."""
    try:
        from .emails import sale_email
        from .mailer import send_email
        event = Event.objects.select_related('owner').get(pk=event_id)
        tickets = list(Ticket.objects.filter(pk__in=ticket_ids).select_related('tier'))
        payment = Payment.objects.filter(pk=payment_id).first() if payment_id else None
        if payment is not None and not tickets:
            tickets = list(payment.tickets_purchased.select_related('tier'))
        if not tickets:
            return 0
        buyer = (buyer or (payment.customer_name if payment else '') or tickets[0].original_owner_name or 'Someone').strip()
        sold, capacity = sold_count(event), event.capacity
        earn = _earnings(payment) if payment is not None else None
        sent = 0
        for user, is_owner in recipients(event):
            profile = _profile(user)
            if (profile.sale_email_mode if profile else 'every') != 'every':
                continue
            mail = sale_email(
                buyer, event.name, _tier_lines(tickets), len(tickets), sold, capacity,
                f"{_site()}/dashboard/events/{event.slug}",
                free=payment is None, earn=earn if is_owner and payment is not None else None,
            )
            try:
                send_email(user.email, mail['subject'], mail['html'], mail['text'])
                sent += 1
            except Exception:
                logger.exception('Could not send a sale email for event %s', event_id)
        return sent
    except Exception:
        logger.exception('Sale emails failed for event %s', event_id)
        return 0


def on_sale(event, tickets=None, payment=None, buyer=''):
    """Called when an order completes. Queues the emails after the sale is committed, off the request."""
    try:
        from .services.zoho import run_in_background  # a thread that closes its database connection when done
        ids = [t.pk for t in (tickets or [])]
        pid = payment.pk if payment is not None else None
        transaction.on_commit(lambda: run_in_background(send_sale_emails, event.pk, ids, pid, buyer))
    except Exception:
        logger.exception('Could not queue sale emails for event %s', getattr(event, 'pk', None))


# ---- the daily summary ---------------------------------------------------------------

def _visible_events(user):
    return Event.objects.filter(
        Q(owner=user) | Q(cohosts__user=user, cohosts__status=EventCoHost.STATUS_ACCEPTED, cohosts__role=EventCoHost.ROLE_MANAGER)
    ).distinct().select_related('owner')


def build_summary(user, start, end, tz):
    """Orders made between start and end, newest last, for the events this person can see. None if there were none."""
    from .emails import _money
    events = {e.pk: e for e in _visible_events(user)}
    if not events:
        return None
    orders = []  # (moment, event, buyer, tiers text, tickets, money or None)
    payments = (Payment.objects.filter(event_id__in=events, status='successful', paid_at__gte=start, paid_at__lt=end)
                .prefetch_related('tickets_purchased__tier'))
    for p in payments:
        tickets = [t for t in p.tickets_purchased.all() if t.payment_status == 'paid']
        if not tickets:
            continue
        event = events[p.event_id]
        owner = event.owner_id == user.pk
        orders.append((p.paid_at, event, p.customer_name or 'Someone', ', '.join(f"{n} × {q}" for n, q in _tier_lines(tickets)),
                       len(tickets), _money(_earnings(p)) if owner else None))
    free = (Ticket.objects.filter(event_id__in=events, payment_status='free', created_at__gte=start, created_at__lt=end)
            .select_related('tier').order_by('created_at'))
    by_buyer = OrderedDict()
    for t in free:
        by_buyer.setdefault((t.event_id, (t.original_owner_email or t.original_owner_name).lower()), []).append(t)
    for (event_id, _), ts in by_buyer.items():
        orders.append((ts[0].created_at, events[event_id], ts[0].original_owner_name or 'Someone',
                       ', '.join(f"{n} × {q}" for n, q in _tier_lines(ts)) + ' (free)', len(ts), 'Free'))
    if not orders:
        return None
    orders.sort(key=lambda o: o[0])
    return orders


def summary_mail(user, start, end, tz, *, when='yesterday', on='on', label=None):
    """The summary email for what this person can see sold between start and end, or None if nothing was."""
    from .emails import _money, sales_summary_email
    orders = build_summary(user, start, end, tz)
    if not orders:
        return None
    shown, more = orders[:MAX_SUMMARY_ROWS], max(0, len(orders) - MAX_SUMMARY_ROWS)
    sections = OrderedDict()
    for _, event, buyer, tiers, qty, money in shown:
        sec = sections.setdefault(event.pk, {'event': event, 'rows': []})
        sec['rows'].append((buyer, tiers, money))
    built, first_total = [], None
    for sec in sections.values():
        event = sec['event']
        money = sum((_earnings(p) for p in Payment.objects.filter(
            event=event, status='successful', paid_at__gte=start, paid_at__lt=end)), Decimal('0'))
        sold, cap = sold_count(event), event.capacity
        built.append({'event_name': event.name, 'rows': sec['rows'],
                      'total': _money(money) if event.owner_id == user.pk and money else None})
        first_total = first_total or (built[-1]['total'], sold, cap)
    word = 'claimed' if all(o[5] == 'Free' for o in orders) else 'sold'
    total_text, sold0, cap0 = first_total
    pre = ' · '.join(x for x in [total_text, (f"{sold0} of {cap0} {word}" if cap0 else f"{sold0} {word}") if len(built) == 1 else
                                 f"{len(orders)} orders across {len(built)} events"] if x)
    if label is None:
        day = start.date()
        label = f"{day:%A}, {day.day} {day:%b}"
    return sales_summary_email(sum(o[4] for o in orders), len(orders), word, label, built, more, pre,
                               f"{_site()}/dashboard/events", when=when, on=on)


def send_daily_summaries(now=None):
    """Send each person on 'daily' their summary, once a day from 8 AM their time. Returns how many went out."""
    from .mailer import send_email
    now = now or timezone.now()
    sent = 0
    for profile in UserProfile.objects.filter(sale_email_mode='daily').select_related('user'):
        user = profile.user
        try:
            tz = _tz(profile)
            local = now.astimezone(tz)
            if local.hour < SUMMARY_FROM_HOUR or profile.last_sales_summary_on == local.date() or not user.email or not user.is_active:
                continue
            # Claim today first, so two overlapping runs cannot both send.
            if not UserProfile.objects.filter(pk=profile.pk).exclude(last_sales_summary_on=local.date()).update(
                    last_sales_summary_on=local.date()):
                continue
            start = datetime.combine(local.date() - timedelta(days=1), time.min, tzinfo=tz)
            mail = summary_mail(user, start, start + timedelta(days=1), tz)
            if mail is None:
                continue
            try:
                send_email(user.email, mail['subject'], mail['html'], mail['text'])
                sent += 1
            except Exception:
                UserProfile.objects.filter(pk=profile.pk).update(last_sales_summary_on=profile.last_sales_summary_on)  # try again next run
                logger.exception('Could not send the daily sales summary')
        except Exception:
            logger.exception('Daily sales summary failed for user %s', getattr(user, 'pk', None))
    return sent


def catchup_recipients(emails):
    """The named people who could be sent a catch-up: not on Off, and with events they can see."""
    qs = (UserProfile.objects.exclude(sale_email_mode='off').select_related('user').filter(user__is_active=True)
          .filter(user__email__in=[e.strip().lower() for e in emails]))
    return [p for p in qs if p.user.email and _visible_events(p.user).exists()]
