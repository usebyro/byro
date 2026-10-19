"""In-app notifications: the bell in the organiser dashboard and the admin panel.

`notify` and `notify_admins` never raise: a failed notification must not break
the sale, payout or moderation step that triggered it. Emails stay as they are;
this is the in-app copy.
"""

import logging

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import AdminMember, Notification
from .permissions import IsAdminMember

logger = logging.getLogger(__name__)

KEEP_LATEST = 30

# What organisers can turn off in Settings. Payouts and events going on hold always reach them.
MUTABLE_KINDS = ['ticket_sale', 'new_follower', 'milestone', 'cohost_joined', 'event_reminder', 'milestone_email']


def is_muted(user, kind):
    """Read fresh: a user object held during a sale may carry a profile from before they changed Settings."""
    from .models import UserProfile
    muted = UserProfile.objects.filter(user_id=user.pk).values_list('muted_notifications', flat=True).first()
    return kind in (muted or [])


def notify(user, kind, title, *, body='', link='', audience=Notification.AUDIENCE_ORGANISER):
    try:
        if user is None or not getattr(user, 'pk', None):
            return None
        if audience == Notification.AUDIENCE_ORGANISER and is_muted(user, kind):
            return None
        n = Notification.objects.create(
            recipient=user, audience=audience, kind=kind,
            title=title[:140], body=(body or '')[:255], link=(link or '')[:255],
        )
        from .push import push_notification  # also to their phone or computer, if they turned that on
        push_notification(n)
        return n
    except Exception:
        logger.exception('Could not create notification %s', kind)
        return None


def notify_admins(kind, title, *, body='', link=''):
    """Tell everyone on the admin team (matched to accounts by email)."""
    try:
        emails = [e.lower() for e in AdminMember.objects.values_list('email', flat=True)]
        User = get_user_model()
        users = [u for u in User.objects.filter(is_active=True) if (u.email or '').lower() in emails]
        for user in users:
            notify(user, kind, title, body=body, link=link, audience=Notification.AUDIENCE_ADMIN)
    except Exception:
        logger.exception('Could not notify admins about %s', kind)


def _naira(amount):
    try:
        return f"₦{float(amount):,.0f}"
    except (TypeError, ValueError):
        return str(amount)


def ticket_sale(event, count, *, paid_amount=None, payment=None, buyer=''):
    """Tell the organiser tickets were sold or claimed, and the admin team when money came in."""
    noun = 'ticket' if count == 1 else 'tickets'
    if paid_amount:
        notify_admins(
            'payment', f"{_naira(paid_amount)} paid",
            body=f"{count} {noun}, {event.name}",
            link=f"/payments/{payment.pk}" if payment is not None else '/payments',
        )
    if not event.owner_id:
        return
    buyer = (buyer or (getattr(payment, 'customer_name', '') if payment is not None else '') or '').strip()
    # The bell shows the title in bold with the body after it: "Tunde Bello bought 2 tickets for …".
    if buyer:
        title = buyer
        if paid_amount:
            body = f"bought {count} {noun} for {event.name}, {_naira(paid_amount)}."
        else:
            body = f"claimed {count} free {noun} for {event.name}."
    elif paid_amount:
        title = f"{count} {noun} sold"
        body = f"{event.name}, {_naira(paid_amount)}"
    else:
        title = f"{count} free {noun} claimed"
        body = event.name
    notify(event.owner, 'ticket_sale', title, body=body, link=f"/dashboard/events/{event.slug}")


def milestone(event, sold):
    """A sales milestone (10, 25, 50, then every 100), alongside the milestone email."""
    if not event.owner_id:
        return
    notify(
        event.owner, 'milestone', f"{sold:,} tickets sold.",
        body=f"{event.name} just hit a new milestone.", link=f"/dashboard/events/{event.slug}",
    )


def cohost_joined(invite, user):
    """Someone invited by email signed up and took their co-host place."""
    event = invite.event
    recipient = invite.added_by or event.owner
    if recipient is None:
        return
    profile = getattr(user, 'profile', None)
    name = (profile.display_name if profile else '') or user.get_full_name() or user.email
    notify(
        recipient, 'cohost_joined', name,
        body=f"accepted your co-host invite for {event.name}.", link=f"/dashboard/events/{event.slug}",
    )


def event_reminder(user, event, days):
    """A heads-up a few days before an event, sent once per person per event."""
    link = f"/dashboard/events/{event.slug}"
    if Notification.objects.filter(recipient=user, kind='event_reminder', link=link).exists():
        return
    notify(
        user, 'event_reminder', f"{event.name} is in {days} days.",
        body="Test your check-in scanner before the day.", link=link,
    )


def _payload(n):
    return {
        'id': n.pk, 'kind': n.kind, 'title': n.title, 'body': n.body, 'link': n.link,
        'read': n.read_at is not None, 'created_at': n.created_at,
    }


class _NotificationsBase(APIView):
    audience = Notification.AUDIENCE_ORGANISER

    def _mine(self, request):
        return Notification.objects.filter(recipient=request.user, audience=self.audience)

    def get(self, request):
        mine = self._mine(request)
        return Response({
            'unread': mine.filter(read_at__isnull=True).count(),
            'results': [_payload(n) for n in mine[:KEEP_LATEST]],
        })


class _NotificationsReadBase(_NotificationsBase):
    def post(self, request):
        """Mark some (`ids`) or all notifications read."""
        mine = self._mine(request).filter(read_at__isnull=True)
        ids = request.data.get('ids')
        if isinstance(ids, list):
            mine = mine.filter(pk__in=[i for i in ids if isinstance(i, int)])
        mine.update(read_at=timezone.now())
        return Response({'unread': self._mine(request).filter(read_at__isnull=True).count()})


class NotificationSettingsView(APIView):
    """GET/PATCH /api/notifications/settings/  {muted: [...kinds]} for the signed-in organiser."""
    permission_classes = [IsAuthenticated]

    def _profile(self, request):
        from .models import UserProfile
        return UserProfile.objects.get_or_create(user=request.user)[0]

    def get(self, request):
        profile = self._profile(request)
        return Response({'muted': [k for k in (profile.muted_notifications or []) if k in MUTABLE_KINDS]})

    def patch(self, request):
        muted = request.data.get('muted')
        if not isinstance(muted, list):
            return Response({'error': 'Send the list of notifications to turn off.'}, status=400)
        profile = self._profile(request)
        profile.muted_notifications = sorted({k for k in muted if k in MUTABLE_KINDS})
        profile.save(update_fields=['muted_notifications'])
        return Response({'muted': profile.muted_notifications})


class MyNotificationsView(_NotificationsBase):
    permission_classes = [IsAuthenticated]


class MyNotificationsReadView(_NotificationsReadBase):
    permission_classes = [IsAuthenticated]


class AdminNotificationsView(_NotificationsBase):
    audience = Notification.AUDIENCE_ADMIN
    permission_classes = [IsAdminMember]


class AdminNotificationsReadView(_NotificationsReadBase):
    audience = Notification.AUDIENCE_ADMIN
    permission_classes = [IsAdminMember]
