"""Write user activity to ActivityLog. Never raises: a logging failure must not
break the action being logged."""

import logging

from .models import ActivityLog

logger = logging.getLogger(__name__)


def client_ip(request):
    if request is None:
        return None
    forwarded = request.META.get('HTTP_X_FORWARDED_FOR', '')
    ip = forwarded.split(',')[0].strip() if forwarded else request.META.get('REMOTE_ADDR')
    return ip or None


def log_activity(action, *, request=None, user=None, email='', target_type='',
                 target_id='', target_label='', detail=''):
    """Record one action.

    The actor is `user` (or request.user when signed in); `email` covers guests
    and webhooks that have no signed-in user.
    """
    try:
        if user is None and request is not None:
            candidate = getattr(request, 'user', None)
            if candidate is not None and candidate.is_authenticated:
                user = candidate
        ActivityLog.objects.create(
            user=user,
            actor_email=(user.email if user is not None else email) or '',
            action=action,
            target_type=target_type,
            target_id=str(target_id) if target_id != '' else '',
            target_label=(target_label or '')[:255],
            detail=(detail or '')[:255],
            ip_address=client_ip(request),
        )
    except Exception as e:
        logger.error("Failed to log activity %s: %s", action, e)
