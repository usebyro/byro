"""CSV downloads for the Byro admin (accounting and records). Each export is limited to a date range."""
import csv
import io

from django.db.models import Count

from .models import Payment, PayoutRequest, Refund, UserProfile

KINDS = ('payments', 'payouts', 'refunds', 'users')


def _safe(value):
    """Stop spreadsheet apps treating a cell as a formula (CSV injection)."""
    if value is None:
        return ''
    text = str(value)
    return "'" + text if text[:1] in ('=', '+', '-', '@', '\t', '\r') else text


def _when(dt):
    return dt.strftime('%Y-%m-%d %H:%M') if dt else ''


def _rows(kind, start, end):
    if kind == 'payments':
        qs = (Payment.objects.filter(created_at__date__gte=start, created_at__date__lte=end)
              .select_related('event', 'event__owner', 'promo_code', 'refund')
              .annotate(n_tickets=Count('tickets_purchased')).order_by('created_at'))
        yield ['Created', 'Paid', 'Reference', 'Status', 'Channel', 'Event', 'Organiser email', 'Buyer name',
               'Buyer email', 'Tickets', 'Ticket price total', 'Byro fee', 'Amount paid', 'Promo code',
               'Refund status', 'Refund amount']
        for p in qs:
            meta = p.metadata or {}
            refund = getattr(p, 'refund', None)
            yield [_when(p.created_at), _when(p.paid_at), p.paystack_reference, p.status, p.channel or '',
                   p.event.name, p.event.owner.email if p.event.owner_id else '', p.customer_name, p.customer_email,
                   p.n_tickets, meta.get('subtotal', ''), meta.get('service_fee', ''), p.amount,
                   p.promo_code.code if p.promo_code_id else '',
                   refund.status if refund else '', refund.amount if refund else '']
    elif kind == 'payouts':
        qs = (PayoutRequest.objects.filter(requested_at__date__gte=start, requested_at__date__lte=end)
              .select_related('user', 'user__profile', 'event').order_by('requested_at'))
        yield ['Requested', 'Processed', 'Status', 'Organiser email', 'Organiser name', 'Event', 'Amount',
               'Method', 'Bank', 'Account name', 'Account number']
        for p in qs:
            profile = getattr(p.user, 'profile', None)
            yield [_when(p.requested_at), _when(p.processed_at), p.status, p.user.email,
                   profile.display_name if profile else '', p.event.name if p.event_id else '', p.amount,
                   p.method, p.bank_name, p.account_name, p.account_number]
    elif kind == 'refunds':
        qs = (Refund.objects.filter(created_at__date__gte=start, created_at__date__lte=end)
              .select_related('payment', 'event').order_by('created_at'))
        yield ['Created', 'Processed', 'Status', 'Event', 'Payment reference', 'Buyer email', 'Amount',
               'Reason', 'Paystack refund ID', 'Problem']
        for r in qs:
            yield [_when(r.created_at), _when(r.processed_at), r.status, r.event.name,
                   r.payment.paystack_reference, r.payment.customer_email, r.amount,
                   r.reason or ('Event cancelled' if r.event.cancelled_at else ''), r.paystack_refund_id,
                   r.failure_reason]
    elif kind == 'users':
        qs = (UserProfile.objects.filter(user__date_joined__date__gte=start, user__date_joined__date__lte=end)
              .select_related('user')
              .annotate(n_events=Count('user__owned_events', distinct=True),
                        n_followers=Count('user__follower_links', distinct=True))
              .order_by('user__date_joined'))
        yield ['Joined', 'Email', 'Name', 'Handle', 'Role', 'Active', 'Events created', 'Followers', 'Last signed in']
        for p in qs:
            yield [_when(p.user.date_joined), p.user.email, p.display_name, p.handle or '', p.role,
                   'yes' if p.user.is_active else 'no', p.n_events, p.n_followers, _when(p.user.last_login)]


def build_csv(kind, start, end):
    """(text, row_count). The first row is the header."""
    out = io.StringIO()
    writer = csv.writer(out)
    count = -1
    for row in _rows(kind, start, end):
        writer.writerow([_safe(v) for v in row])
        count += 1
    return out.getvalue(), max(count, 0)
