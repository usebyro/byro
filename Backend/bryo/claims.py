"""
Handing a pitched event to its organiser.

Byro staff build a draft event, then send the organiser a claim link. The event
stays with staff until that person signs in and claims it, at which point they
become the owner and every grant staff had on it is removed.

  POST /api/admin/events/<pk>/claim/    send (or resend) the link; admin role
  DELETE /api/admin/events/<pk>/claim/  revoke the live link; admin role
  GET  /api/admin/events/<pk>/claim/    state of the latest link
  GET  /api/event-claims/<token>/       what the claim page shows, no sign-in
  POST /api/event-claims/<token>/claim/ take ownership, signed in
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
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from .models import AdminAction, Event, EventClaim, EventCoHost
from .permissions import IsAdminMember

logger = logging.getLogger(__name__)

CLAIM_DAYS = 14

# What the claim page says for a link that can't be used. Nothing here reveals
# who the event was meant for.
UNUSABLE = {
    'claimed': 'This event has already been claimed.',
    'revoked': 'This link is no longer valid. Ask the Byro team to send you a new one.',
    'expired': 'This link has expired. Ask the Byro team to send you a new one.',
}


def _frontend_url():
    # Locally FRONTEND_URL is usually unset; falling back to the live site would put a
    # production link in a test email that points at a claim page which isn't there.
    fallback = 'http://localhost:3000' if settings.DEBUG else 'https://usebyro.com'
    return (settings.FRONTEND_URL or fallback).rstrip('/')


def profile_ready(user):
    """Onboarding finished and the public identity guests see is filled in."""
    from .models import UserProfile
    profile = UserProfile.objects.filter(user_id=user.pk).first()  # fresh, not a cached copy
    return bool(profile and profile.is_complete and profile.handle and profile.display_name.strip())


def claim_path(token):
    return f"/claim/{token}"


def send_claim_email(claim, sender_name):
    """Best-effort: the claim is already saved, so a mail failure must not undo it."""
    from .emails import event_claim_email, format_event_date, format_event_time
    from .mailer import send_email

    try:
        event = claim.event
        url = (
            f"{_frontend_url()}/login?redirect={quote(claim_path(claim.token), safe='')}"
            f"&email={quote(claim.email, safe='')}"
        )
        data = event_claim_email(
            event_name=event.name,
            sender_name=sender_name,
            claim_url=url,
            date=format_event_date(event.day),
            time=format_event_time(event.time_from, event.timezone),
            location=event.location or '',
            expires_on=f"{claim.expires_at.day} {claim.expires_at:%B}",
        )
        send_email(to=claim.email, subject=data['subject'], html=data['html'], text=data['text'])
        return True
    except Exception as e:
        logger.error("Failed to send event claim email to %s: %s", claim.email, e)
        return False


def _log(request, action, event, detail=''):
    member = getattr(request, 'admin_member', None)
    try:
        AdminAction.objects.create(
            actor_email=member.email if member else '',
            action=action, target_type='event',
            target_id=str(event.pk), target_label=event.name, detail=detail,
        )
    except Exception as e:
        logger.error("Failed to log admin action %s: %s", action, e)


def _summary(claim):
    return {
        'email': claim.email,
        'state': claim.state,
        'sent_at': claim.created_at,
        'expires_at': claim.expires_at,
        'claimed_by': claim.claimed_by.email if claim.claimed_by_id else None,
        'claimed_at': claim.claimed_at,
    }


class AdminEventClaimView(APIView):
    permission_classes = [IsAdminMember]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'cohost_invite'
    method_roles = {'POST': 'admin', 'DELETE': 'admin'}

    def get(self, request, pk):
        event = get_object_or_404(Event, pk=pk)
        claim = event.claims.select_related('claimed_by').first()
        return Response({'claim': _summary(claim) if claim else None})

    def post(self, request, pk):
        email = (request.data.get('email') or '').strip().lower()
        try:
            validate_email(email)
        except DjangoValidationError:
            return Response({'error': 'Enter a valid email address.'}, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            event = get_object_or_404(Event.objects.select_for_update().select_related('owner'), pk=pk)
            # Only drafts staff built themselves. A live event or one with sales belongs to its
            # organiser already, and moving it would be a transfer, which Byro doesn't do.
            if not event.is_draft:
                return Response({'error': 'Only a draft event can be sent to an organiser.'},
                                status=status.HTTP_400_BAD_REQUEST)
            if event.tickets.exists():
                return Response({'error': 'This event already has tickets, so it can\'t be handed over.'},
                                status=status.HTTP_400_BAD_REQUEST)
            if event.owner_id and event.owner.email.lower() != request.admin_member.email.lower():
                return Response({'error': 'You can only send events you created. Ask the creator to send it.'},
                                status=status.HTTP_403_FORBIDDEN)
            if event.owner_id and event.owner.email.lower() == email:
                return Response({'error': 'That is the event\'s owner already.'}, status=status.HTTP_400_BAD_REQUEST)
            now = timezone.now()
            event.claims.filter(claimed_at__isnull=True, revoked_at__isnull=True).update(revoked_at=now)
            claim = EventClaim.objects.create(
                event=event, email=email, token=secrets.token_urlsafe(32),
                created_by_email=request.admin_member.email,
                expires_at=now + timedelta(days=CLAIM_DAYS),
            )

        user = request.user
        profile = getattr(user, 'profile', None)
        sender_name = (profile.display_name if profile else '') or user.get_full_name() or 'The Byro team'
        sent = send_claim_email(claim, sender_name)
        _log(request, AdminAction.ACTION_EVENT_CLAIM_SENT, event, email)
        return Response({'claim': _summary(claim), 'email_sent': sent}, status=status.HTTP_201_CREATED)

    def delete(self, request, pk):
        event = get_object_or_404(Event, pk=pk)
        updated = event.claims.filter(claimed_at__isnull=True, revoked_at__isnull=True).update(
            revoked_at=timezone.now()
        )
        if not updated:
            return Response({'error': 'There is no live link to revoke.'}, status=status.HTTP_400_BAD_REQUEST)
        _log(request, AdminAction.ACTION_EVENT_CLAIM_REVOKED, event)
        return Response({'revoked': True})


class EventClaimPreviewView(APIView):
    """What the claim page shows before anyone signs in."""
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'claim'

    def get(self, request, token):
        claim = EventClaim.objects.select_related('event').filter(token=token).first()
        if claim is None:
            return Response({'error': 'This link is not valid.'}, status=status.HTTP_404_NOT_FOUND)
        state = claim.state
        if state != 'live':
            return Response({'state': state, 'message': UNUSABLE[state]}, status=status.HTTP_410_GONE)
        event = claim.event
        image = None
        if event.event_image:
            image = request.build_absolute_uri(event.event_image.url)
        return Response({
            'state': 'live',
            'event': {
                'name': event.name,
                'day': event.day,
                'time_from': event.time_from,
                'timezone': event.timezone,
                'location': event.location,
                'image': image,
            },
        })


class EventClaimClaimView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'claim'

    def post(self, request, token):
        with transaction.atomic():
            claim = (
                EventClaim.objects.select_for_update()
                .select_related('event__owner').filter(token=token).first()
            )
            if claim is None:
                return Response({'error': 'This link is not valid.'}, status=status.HTTP_404_NOT_FOUND)
            state = claim.state
            if state != 'live':
                return Response({'state': state, 'error': UNUSABLE[state]}, status=status.HTTP_410_GONE)
            event = Event.objects.select_for_update().get(pk=claim.event_id)
            previous_owner = event.owner
            if previous_owner and previous_owner.pk == request.user.pk:
                return Response({'error': 'You already own this event.'}, status=status.HTTP_400_BAD_REQUEST)
            if event.tickets.exists():
                return Response({'error': 'This event can no longer be claimed.'}, status=status.HTTP_409_CONFLICT)

            now = timezone.now()
            event.owner = request.user
            event.save(update_fields=['owner'])
            # Whatever access staff had goes with the handover.
            EventCoHost.objects.filter(event=event).delete()
            claim.claimed_by = request.user
            claim.claimed_at = now
            claim.save(update_fields=['claimed_by', 'claimed_at'])

        try:
            AdminAction.objects.create(
                actor_email=request.user.email, action=AdminAction.ACTION_EVENT_CLAIMED,
                target_type='event', target_id=str(event.pk), target_label=event.name,
                detail=f"invited {claim.email}, claimed by {request.user.email}",
            )
        except Exception as e:
            logger.error("Failed to log event claim: %s", e)
        if previous_owner:
            from .notifications import notify
            notify(previous_owner, 'event_claimed', f"{event.name} was claimed by {request.user.email}",
                   link='/dashboard')
        return Response({
            'claimed': True, 'slug': event.slug, 'name': event.name,
            'profile_complete': profile_ready(request.user),
        })
