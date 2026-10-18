"""
Account tools for the Byro admin: a person's full picture, and deleting an account on request.

Deleting anonymises rather than wipes. Payments are kept (Byro must keep financial records), and events
keep their ticket and money history, but every place the person's name or email is stored is replaced
with "Deleted user", their page, photo, links and follows are removed, and they can no longer sign in.
"""
from decimal import Decimal

from django.db import transaction
from django.db.models import Q, Sum
from django.utils import timezone

from .models import (
    ActivityLog, AdminMember, Event, EventCoHost, Follow, MerchItem, Notification, Payment,
    PayoutRequest, Refund, Stamp, Ticket, TicketTransfer, UserProfile, WaitList,
)

DELETED_NAME = 'Deleted user'
DELETED_DOMAIN = '@deleted.usebyro.com'


def deleted_email(user):
    return f'deleted-{user.pk}{DELETED_DOMAIN}'


def _mine(user, field):
    """Rows where `field` holds this person's email (any case) — tickets bought without an account too."""
    return Q(**{f'{field}__iexact': user.email})


def summary(user):
    from .views import _percent, compute_available_balance  # lazy: views imports this module's neighbours

    profile = UserProfile.objects.filter(user=user).first()
    today = timezone.localdate()
    events = Event.objects.filter(owner=user).order_by('-day')
    tickets = (Ticket.objects.filter(Q(user=user) | _mine(user, 'current_owner_email'))
               .select_related('event').order_by('-created_at'))
    payments = Payment.objects.filter(_mine(user, 'customer_email'), status='successful')
    payouts = PayoutRequest.objects.filter(user=user).order_by('-requested_at')
    return {
        'id': user.pk, 'email': user.email, 'is_active': user.is_active, 'date_joined': user.date_joined,
        'last_login': user.last_login,
        'profile': None if not profile else {
            'display_name': profile.display_name, 'handle': profile.handle, 'role': profile.role,
            'is_public': profile.is_public, 'location': profile.location,
            'messaging_blocked': profile.messaging_blocked,
        },
        'followers': Follow.objects.filter(following=user).count(),
        'following': Follow.objects.filter(follower=user).count(),
        'balance': str(max(compute_available_balance(user), Decimal('0'))),
        # Their own service fee if Byro gave them a deal (e.g. '3'), else None for the platform default.
        'fee_percent': _percent(profile.fee_rate_override) if profile and profile.fee_rate_override is not None else None,
        'events': [{
            'name': e.name, 'slug': e.slug, 'day': e.day, 'is_draft': e.is_draft, 'is_active': e.is_active,
            'cancelled': bool(e.cancelled_at), 'upcoming': e.day >= today,
            'tickets': e.tickets.filter(payment_status__in=('paid', 'free')).count(),
        } for e in events[:50]],
        'events_total': events.count(),
        'tickets': [{
            'ticket_id': str(t.ticket_id), 'event_name': t.event.name, 'event_slug': t.event.slug,
            'day': t.event.day, 'status': t.payment_status, 'checked_in': t.checked_in,
        } for t in tickets[:50]],
        'tickets_total': tickets.count(),
        'spent': {
            'orders': payments.count(),
            'total': str(payments.aggregate(t=Sum('amount'))['t'] or Decimal('0')),
        },
        'payouts': [{
            'amount': str(p.amount), 'status': p.status, 'requested_at': p.requested_at,
        } for p in payouts[:20]],
        'delete_blockers': delete_blockers(user),
    }


def delete_blockers(user):
    """Plain reasons this account can't be deleted yet. Empty list means it can."""
    from .views import compute_available_balance

    reasons = []
    today = timezone.localdate()
    live = Event.objects.filter(owner=user, day__gte=today, cancelled_at__isnull=True, is_draft=False,
                                tickets__payment_status__in=('paid', 'free')).distinct()
    if live.exists():
        names = ', '.join(live.values_list('name', flat=True)[:3])
        reasons.append(f'They have upcoming events with tickets sold ({names}). Cancel or finish them first.')
    if Refund.objects.filter(event__owner=user).exclude(status=Refund.STATUS_PROCESSED).exists():
        reasons.append('Refunds for their events are not finished yet.')
    if PayoutRequest.objects.filter(user=user, status='pending').exists():
        reasons.append('They have a payout waiting to be processed.')
    if compute_available_balance(user) > 0:
        reasons.append('Byro still owes them money. Pay it out first.')
    if AdminMember.objects.filter(email__iexact=user.email).exists():
        reasons.append('They are on the Byro admin team. Remove them from Team first.')
    return reasons


def anonymise(user):
    """Delete a person's account by anonymising it. Call only when delete_blockers(user) is empty."""
    old = user.email
    new = deleted_email(user)
    with transaction.atomic():
        profile = UserProfile.objects.filter(user=user).first()
        if profile:
            for image in (profile.avatar, profile.cover_image):
                if image:
                    image.delete(save=False)
            UserProfile.objects.filter(pk=profile.pk).update(
                display_name=DELETED_NAME, handle=None, bio='', avatar=None, cover_image=None,
                location='', website='', twitter='', instagram='', linkedin='', telegram='',
                whatsapp='', category='', is_public=False,
            )

        Follow.objects.filter(Q(follower=user) | Q(following=user)).delete()
        Notification.objects.filter(recipient=user).delete()
        MerchItem.objects.filter(owner=user).delete()
        EventCoHost.objects.filter(Q(user=user) | Q(invited_email__iexact=old)).delete()
        WaitList.objects.filter(email__iexact=old).delete()

        Ticket.objects.filter(Q(user=user) | Q(current_owner_email__iexact=old)).update(
            current_owner_name=DELETED_NAME, current_owner_email=new)
        Ticket.objects.filter(original_owner_email__iexact=old).update(
            original_owner_name=DELETED_NAME, original_owner_email=new)
        Ticket.objects.filter(user=user).update(user=None)
        TicketTransfer.objects.filter(from_user_email__iexact=old).update(from_user_name=DELETED_NAME, from_user_email=new)
        TicketTransfer.objects.filter(to_user_email__iexact=old).update(to_user_name=DELETED_NAME, to_user_email=new)
        Stamp.objects.filter(Q(user=user) | Q(email__iexact=old)).update(email=new, user=None)
        ActivityLog.objects.filter(Q(user=user) | Q(actor_email__iexact=old)).update(actor_email=new, user=None)

        # Their events stay (buyers' and Byro's records) but are taken down and no longer name them.
        Event.objects.filter(owner=user).update(is_active=False, hosted_by='Deleted organiser')

        user.email = new
        user.username = None
        user.first_name = ''
        user.last_name = ''
        user.is_active = False
        user.workos_id = None
        user.external_id = None
        user.privy_id = None
        user.set_unusable_password()
        user.save()
    return new
