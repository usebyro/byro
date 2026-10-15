"""
Web Push: notifications on a phone or computer, even when Byro isn't open.

A device signs up from the admin's bell (PushSubscription). Every Notification created for
that person and audience is also pushed to their devices, from a background thread so the
request that caused it never waits on a push service. Devices the push service says are gone
(404/410) are forgotten.
"""
import json
import logging
import threading

from django.conf import settings
from django.db import connection
from django.utils import timezone

from .models import PushSubscription

logger = logging.getLogger(__name__)

TTL_SECONDS = 24 * 60 * 60  # a phone that's off for a day still gets it when it's back


def configured():
    return bool(getattr(settings, 'VAPID_PUBLIC_KEY', '') and getattr(settings, 'VAPID_PRIVATE_KEY', ''))


def send(user_id, audience, payload):
    """Push one payload to every device this person signed up for this audience."""
    from pywebpush import WebPushException, webpush

    data = json.dumps(payload)
    for sub in PushSubscription.objects.filter(user_id=user_id, audience=audience):
        try:
            webpush(
                subscription_info={'endpoint': sub.endpoint, 'keys': {'p256dh': sub.p256dh, 'auth': sub.auth}},
                data=data,
                vapid_private_key=settings.VAPID_PRIVATE_KEY,
                vapid_claims={'sub': settings.VAPID_SUBJECT},
                ttl=TTL_SECONDS,
                timeout=10,
            )
            PushSubscription.objects.filter(pk=sub.pk).update(last_sent_at=timezone.now())
        except WebPushException as exc:
            status = getattr(exc.response, 'status_code', None)
            if status in (404, 410):
                sub.delete()
            else:
                logger.warning('Web push to subscription %s failed (%s): %s', sub.pk, status, exc)
        except Exception:
            logger.exception('Web push to subscription %s failed', sub.pk)


def _start(run):
    threading.Thread(target=run, daemon=True).start()


def push_notification(notification):
    """Send a just-created Notification to the recipient's devices, in the background."""
    if not configured():
        return
    user_id, audience = notification.recipient_id, notification.audience
    if not PushSubscription.objects.filter(user_id=user_id, audience=audience).exists():
        return
    payload = {
        'title': notification.title,
        'body': notification.body,
        'link': notification.link,
        'audience': audience,
        'tag': f'byro-{notification.pk}',
    }

    def run():
        try:
            send(user_id, audience, payload)
        finally:
            connection.close()

    _start(run)
