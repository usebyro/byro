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


def notify(user, kind, title, *, body='', link='', audience=Notification.AUDIENCE_ORGANISER):
    try:
        if user is None or not getattr(user, 'pk', None):
            return None
        return Notification.objects.create(
            recipient=user, audience=audience, kind=kind,
            title=title[:140], body=(body or '')[:255], link=(link or '')[:255],
        )
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


def ticket_sale(event, count, *, paid_amount=None):
    """Tell the organiser tickets were sold or claimed."""
    if not event.owner_id:
        return
    noun = 'ticket' if count == 1 else 'tickets'
    if paid_amount:
        title = f"{count} {noun} sold"
        body = f"{event.name}, {_naira(paid_amount)}"
    else:
        title = f"{count} free {noun} claimed"
        body = event.name
    notify(event.owner, 'ticket_sale', title, body=body, link=f"/dashboard/events/{event.slug}")


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
