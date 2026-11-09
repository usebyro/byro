"""
Changing the email on someone's account, done by Byro staff, confirmed by the new address.

  GET    /api/admin/users/<pk>/email-change/  state of the latest request; owner role
  POST   /api/admin/users/<pk>/email-change/  send the confirmation link to the new address; owner role
  DELETE /api/admin/users/<pk>/email-change/  cancel the live request; owner role
  GET    /api/email-changes/<token>/          what the confirm page shows, no sign-in
  POST   /api/email-changes/<token>/confirm/  the new address confirms; moves the account

The person stays the same account row, so follows, community, events and anything tied to the user
come along. Tickets, stamps, transfers and invites keep the email as plain text, so those are
rewritten in the same transaction. WorkOS is changed first: sign-in syncs the email from WorkOS,
so a change made only here would be undone at the next login.
"""
import logging
import secrets
from datetime import timedelta
from urllib.parse import quote

from django.conf import settings
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.validators import validate_email
from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from .accounts import DELETED_DOMAIN
from .models import (
    ActivityLog, AdminAction, AdminMember, EmailChange, EventCoHost, Payment, Stamp, Ticket,
    TicketTransfer, WaitList,
)
from .permissions import IsAdminMember
from .services import workos_api
from .services.workos_api import WorkOSAPIError

logger = logging.getLogger(__name__)

CHANGE_HOURS = 48

UNUSABLE = {
    'confirmed': 'This email has already been confirmed.',
    'revoked': 'This link is no longer valid. Ask the Byro team to send you a new one.',
    'expired': 'This link has expired. Ask the Byro team to send you a new one.',
}


def _frontend_url():
    fallback = 'http://localhost:3000' if settings.DEBUG else 'https://usebyro.com'
    return (settings.FRONTEND_URL or fallback).rstrip('/')


def blockers(user, new_email):
    """Reasons this account can't move to `new_email` right now. Empty means go ahead."""
    from django.contrib.auth import get_user_model
    User = get_user_model()
    reasons = []
    if user.email.endswith(DELETED_DOMAIN):
        reasons.append('This account has been deleted.')
    if not user.workos_id:
        reasons.append("They haven't signed in with the current login yet, so their email can't be changed.")
    if new_email.lower() == user.email.lower():
        reasons.append('That is their email already.')
    if User.objects.filter(email__iexact=new_email).exclude(pk=user.pk).exists():
        reasons.append('Another account already uses that email.')
    if (AdminMember.objects.filter(email__iexact=user.email).exists()
            or user.email.lower() in (settings.ADMIN_BOOTSTRAP_EMAILS or [])):
        reasons.append('They are on the Byro admin team. Change their email in Team first.')
    return reasons


def apply_email_change(user, new_email):
    """Move the account and every plain-text copy of its email. Raises WorkOSAPIError if WorkOS refuses."""
    from django.contrib.auth import get_user_model
    User = get_user_model()
    old = user.email
    new_email = new_email.strip().lower()

    with transaction.atomic():
        user = User.objects.select_for_update().get(pk=user.pk)
        old = user.email
        problems = blockers(user, new_email)
        if problems:
            raise ValueError(problems[0])

        workos_api.update_user_email(user.workos_id, new_email)
        try:
            Ticket.objects.filter(current_owner_email__iexact=old).update(current_owner_email=new_email)
            Ticket.objects.filter(original_owner_email__iexact=old).update(original_owner_email=new_email)
            TicketTransfer.objects.filter(from_user_email__iexact=old).update(from_user_email=new_email)
            TicketTransfer.objects.filter(to_user_email__iexact=old).update(to_user_email=new_email)
            Stamp.objects.filter(email__iexact=old).update(email=new_email)
            Payment.objects.filter(customer_email__iexact=old).update(customer_email=new_email)
            ActivityLog.objects.filter(actor_email__iexact=old).update(actor_email=new_email)
            EventCoHost.objects.filter(invited_email__iexact=old).update(invited_email=new_email)
            # The waitlist is unique by email: if the new address is already on it, drop the old row.
            if WaitList.objects.filter(email__iexact=new_email).exists():
                WaitList.objects.filter(email__iexact=old).delete()
            else:
                WaitList.objects.filter(email__iexact=old).update(email=new_email)

            user.email = new_email
            if (user.username or '').lower() == old.lower():
                user.username = new_email
            user.email_verified = True
            user.save()
        except Exception:
            # Our side failed after WorkOS changed: put WorkOS back so sign-in stays consistent.
            try:
                workos_api.update_user_email(user.workos_id, old)
            except Exception:
                logger.exception("Could not restore WorkOS email for %s after a failed change", user.pk)
            raise
    return old, new_email


def send_confirm_email(change):
    """Best-effort: the request is saved, so a mail failure must not undo it."""
    from .emails import email_change_confirm_email
    from .mailer import send_email
    try:
        url = f"{_frontend_url()}/confirm-email/{change.token}"
        data = email_change_confirm_email(
            change.new_email, url, expires_on=f"{change.expires_at.day} {change.expires_at:%B}",
        )
        send_email(to=change.new_email, subject=data['subject'], html=data['html'], text=data['text'])
        return True
    except Exception as e:
        logger.error("Failed to send email-change confirmation to %s: %s", change.new_email, e)
        return False


def send_changed_notice(old_email, new_email):
    from .emails import email_changed_notice_email
    from .mailer import send_email
    try:
        data = email_changed_notice_email(old_email, new_email)
        send_email(to=old_email, subject=data['subject'], html=data['html'], text=data['text'])
    except Exception as e:
        logger.error("Failed to send email-changed notice to %s: %s", old_email, e)


def _log(actor_email, action, user, label, detail=''):
    try:
        AdminAction.objects.create(
            actor_email=actor_email, action=action, target_type='user',
            target_id=str(user.pk), target_label=label, detail=detail[:255],
        )
    except Exception as e:
        logger.error("Failed to log admin action %s: %s", action, e)


def _summary(change):
    return {
        'new_email': change.new_email,
        'state': change.state,
        'sent_at': change.created_at,
        'expires_at': change.expires_at,
        'confirmed_at': change.confirmed_at,
    }


class AdminUserEmailChangeView(APIView):
    permission_classes = [IsAdminMember]
    min_role = AdminMember.ROLE_OWNER
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'cohost_invite'

    def get(self, request, pk):
        from django.contrib.auth import get_user_model
        user = get_object_or_404(get_user_model(), pk=pk)
        change = user.email_changes.first()
        return Response({'change': _summary(change) if change else None})

    def post(self, request, pk):
        from django.contrib.auth import get_user_model
        user = get_object_or_404(get_user_model(), pk=pk)
        new_email = (request.data.get('new_email') or '').strip().lower()
        reason = (request.data.get('reason') or '').strip()[:255]
        try:
            validate_email(new_email)
        except DjangoValidationError:
            return Response({'error': 'Enter a valid email address.'}, status=status.HTTP_400_BAD_REQUEST)
        problems = blockers(user, new_email)
        if problems:
            return Response({'error': problems[0], 'blockers': problems}, status=status.HTTP_400_BAD_REQUEST)

        now = timezone.now()
        with transaction.atomic():
            user.email_changes.filter(confirmed_at__isnull=True, revoked_at__isnull=True).update(revoked_at=now)
            change = EmailChange.objects.create(
                user=user, old_email=user.email, new_email=new_email,
                token=secrets.token_urlsafe(32), reason=reason,
                requested_by_email=request.admin_member.email,
                expires_at=now + timedelta(hours=CHANGE_HOURS),
            )
        sent = send_confirm_email(change)
        _log(request.admin_member.email, AdminAction.ACTION_USER_EMAIL_CHANGE_SENT, user, user.email,
             f"to {new_email}" + (f": {reason}" if reason else ''))
        return Response({'change': _summary(change), 'email_sent': sent}, status=status.HTTP_201_CREATED)

    def delete(self, request, pk):
        from django.contrib.auth import get_user_model
        user = get_object_or_404(get_user_model(), pk=pk)
        updated = user.email_changes.filter(confirmed_at__isnull=True, revoked_at__isnull=True).update(
            revoked_at=timezone.now()
        )
        if not updated:
            return Response({'error': 'There is no live request to cancel.'}, status=status.HTTP_400_BAD_REQUEST)
        return Response({'cancelled': True})


class EmailChangePreviewView(APIView):
    """What the confirm page shows before anything happens. Reveals only the new address (the reader's own)."""
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'claim'

    def get(self, request, token):
        change = EmailChange.objects.filter(token=token).first()
        if change is None:
            return Response({'error': 'This link is not valid.'}, status=status.HTTP_404_NOT_FOUND)
        state = change.state
        if state != 'live':
            return Response({'state': state, 'message': UNUSABLE[state]}, status=status.HTTP_410_GONE)
        return Response({'state': 'live', 'new_email': change.new_email})


class EmailChangeConfirmView(APIView):
    """The token went to the new address, so using it proves that address is theirs."""
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'claim'

    def post(self, request, token):
        with transaction.atomic():
            change = EmailChange.objects.select_for_update().select_related('user').filter(token=token).first()
            if change is None:
                return Response({'error': 'This link is not valid.'}, status=status.HTTP_404_NOT_FOUND)
            state = change.state
            if state != 'live':
                return Response({'state': state, 'error': UNUSABLE[state]}, status=status.HTTP_410_GONE)
            try:
                old, new = apply_email_change(change.user, change.new_email)
            except ValueError as e:
                return Response({'error': str(e)}, status=status.HTTP_409_CONFLICT)
            except WorkOSAPIError:
                return Response({'error': "We couldn't update your sign-in just now. Nothing was changed. Try again in a minute."},
                                status=status.HTTP_502_BAD_GATEWAY)
            change.confirmed_at = timezone.now()
            change.save(update_fields=['confirmed_at'])

        _log(change.requested_by_email, AdminAction.ACTION_USER_EMAIL_CHANGED, change.user, old, f"to {new}")
        send_changed_notice(old, new)
        return Response({
            'changed': True, 'email': new,
            'login_url': f"{_frontend_url()}/login?email={quote(new, safe='')}",
        })
