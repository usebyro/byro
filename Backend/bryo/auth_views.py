"""
Auth endpoints.

There is exactly one: POST /api/auth/sync/, called once per sign-in by the
Next.js AuthKit callback. It is the only place in the codebase that talks to the
WorkOS Management API — every other request authenticates purely locally through
WorkOSAuthentication.

Byro issues no tokens of its own. The WorkOS access token is the credential.
"""

import logging

from django.db import IntegrityError, transaction
from django.utils import timezone
from rest_framework import authentication, status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from .models import EventCoHost, UserProfile
from .services import workos_api
from .services.workos_auth import verify_access_token

logger = logging.getLogger(__name__)

from django.contrib.auth import get_user_model  # noqa: E402

User = get_user_model()


def _bearer_token(request):
    parts = authentication.get_authorization_header(request).split()
    if len(parts) == 2 and parts[0].lower() == b'bearer':
        try:
            return parts[1].decode()
        except UnicodeError:
            return None
    return None


def _user_payload(user, profile):
    """
    The shape the frontend already expects from the old social_login response,
    minus `tokens` — there are no Byro-issued tokens any more.
    """
    return {
        'id': user.id,
        'email': user.email,
        'username': user.username,
        'email_verified': user.email_verified,
        'display_name': profile.display_name,
        'handle': profile.handle,
        'avatar_url': profile.avatar.url if profile.avatar else None,
        'is_profile_complete': profile.is_complete,
    }


def claim_pending_cohost_invites(user):
    """
    Attach any co-host invitations addressed to this user's email.

    Guarded on email_verified: invites are claimed by email, so claiming on an
    unverified address would let anyone take over a co-host grant by signing up
    with someone else's email.

    Returns the number of invites claimed.
    """
    if not user.email_verified or not user.email:
        return 0

    pending = EventCoHost.objects.filter(
        invited_email__iexact=user.email,
        status=EventCoHost.STATUS_PENDING,
        user__isnull=True,
    )

    claimed = 0
    for invite in pending:
        # The organiser may have added this person directly in the meantime.
        if EventCoHost.objects.filter(event=invite.event, user=user).exists():
            invite.delete()
            continue
        try:
            with transaction.atomic():
                invite.user = user
                invite.status = EventCoHost.STATUS_ACCEPTED
                invite.accepted_at = timezone.now()
                invite.save(update_fields=['user', 'status', 'accepted_at'])
            claimed += 1
        except IntegrityError:
            # Raced with another claim; the grant already exists either way.
            invite.delete()

    if claimed:
        logger.info("Claimed %s co-host invite(s) for %s", claimed, user.email)
    return claimed


class AuthSyncView(APIView):
    """
    POST /api/auth/sync/
    Header: Authorization: Bearer <WorkOS access token>

    Verifies the token, upserts the local user, claims any co-host invites, and
    returns the user + profile the frontend renders.

    Unauthenticated by DRF's reckoning — the whole point is that the local user
    may not exist yet, so WorkOSAuthentication (which 401s on unknown `sub`)
    must not run here.
    """
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'auth_sync'

    def post(self, request):
        token = _bearer_token(request)
        if not token:
            return Response(
                {'error': 'Authorization: Bearer <token> is required'},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        claims = verify_access_token(token)
        if claims is None:
            return Response(
                {'error': 'Invalid or expired token'},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        workos_id = claims.get('sub')
        if not workos_id:
            return Response(
                {'error': 'Token is missing a subject claim'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user = User.objects.filter(workos_id=workos_id).first()

        # The access token carries no email, so ask WorkOS. On a repeat sign-in
        # this also picks up an address the user changed on WorkOS's side.
        workos_user = workos_api.get_user(workos_id)

        if user is None and not (workos_user or {}).get('email'):
            # First sign-in and we cannot learn their email — either WorkOS was
            # unreachable, or it returned a user with no address. Either way we
            # refuse to create the account: inventing a placeholder is exactly
            # what produced the @web3auth.user rows this migration is undoing.
            if workos_user is None:
                logger.error("Cannot resolve WorkOS user %s and no local record exists", workos_id)
                detail = 'Could not reach the identity provider. Please try again.'
            else:
                logger.error("WorkOS user %s has no email address; refusing to create an account", workos_id)
                detail = 'This identity has no email address. Add one in WorkOS and sign in again.'
            return Response({'error': detail}, status=status.HTTP_502_BAD_GATEWAY)

        try:
            user, created = self._upsert_user(workos_id, user, workos_user)
        except IntegrityError as e:
            logger.error("Failed to upsert WorkOS user %s: %s", workos_id, e)
            return Response(
                {'error': 'Could not sync this account'},
                status=status.HTTP_409_CONFLICT,
            )

        profile, _ = UserProfile.objects.get_or_create(user=user)
        self._backfill_display_name(profile, workos_user)
        claimed = claim_pending_cohost_invites(user)

        return Response({
            'success': True,
            'is_new_user': created,
            'cohost_invites_claimed': claimed,
            'user': _user_payload(user, profile),
        })

    def _upsert_user(self, workos_id, user, workos_user):
        """
        Resolve the local user, in order: workos_id -> email -> create.

        The email branch is the migration path: it silently links a pre-existing
        Byro account to its WorkOS identity, so the user keeps the same row and
        therefore all of their events and tickets.
        """
        email = (workos_user or {}).get('email') or ''
        email = User.objects.normalize_email(email).lower() if email else ''
        verified = bool((workos_user or {}).get('email_verified', True)) if workos_user else False

        with transaction.atomic():
            if user is None and email:
                user = User.objects.filter(email__iexact=email).first()
                if user is not None:
                    logger.info("Linking existing Byro account %s to WorkOS id %s", email, workos_id)

            if user is not None:
                updates = {}
                if user.workos_id != workos_id:
                    updates['workos_id'] = workos_id
                if email and user.email.lower() != email:
                    updates['email'] = email
                if verified and not user.email_verified:
                    updates['email_verified'] = True
                if user.auth_provider != 'workos':
                    updates['auth_provider'] = 'workos'

                if updates:
                    for field, value in updates.items():
                        setattr(user, field, value)
                    user.save(update_fields=list(updates))
                return user, False

            user = User.objects.create_user(
                email=email,
                workos_id=workos_id,
                auth_provider='workos',
                email_verified=verified,
            )
            logger.info("Created Byro account %s for WorkOS id %s", email, workos_id)
            return user, True

    @staticmethod
    def _backfill_display_name(profile, workos_user):
        """Seed display_name from WorkOS on first sign-in; never overwrite one the user set."""
        if profile.display_name or not workos_user:
            return
        name = ' '.join(
            part for part in [
                workos_user.get('first_name') or '',
                workos_user.get('last_name') or '',
            ] if part
        ).strip()
        if name:
            profile.display_name = name
            profile.save(update_fields=['display_name'])
