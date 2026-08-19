"""
Authentication endpoints.

Byro renders its own sign-in screen rather than redirecting to AuthKit's hosted
page, so Django drives authentication: it asks WorkOS to email a Magic Auth
code, redeems it, and exchanges OAuth codes for the Google/Apple buttons. On
success it returns the WorkOS access and refresh tokens to the client.

    POST /api/auth/magic/send/       {email}                -> always 200
    POST /api/auth/magic/verify/     {email, code}          -> {user, tokens}
    POST /api/auth/oauth/authorize/  {provider}             -> {authorization_url}
    POST /api/auth/oauth/callback/   {code}                 -> {user, tokens}
    POST /api/auth/refresh/          {refresh_token}        -> {tokens}
    GET  /api/auth/me/                                      -> {user}

Every other endpoint in the API authenticates locally against the returned
access token via WorkOSAuthentication; nothing here is on that path.

Note: tokens are returned in the JSON body, so they are reachable by
JavaScript. That is a deliberate product decision — the alternative was
httpOnly cookies set by Django. It means an XSS on the frontend can exfiltrate
a session, so keep the access token in memory rather than localStorage if you
can, and treat the short access-token lifetime as the mitigation.
"""

import logging

from django.db import IntegrityError, transaction
from django.utils import timezone
from rest_framework import authentication, status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from . import apps
from .models import EventCoHost, UserProfile
from .services import workos_api
from .services.workos_api import WorkOSAPIError

logger = logging.getLogger(__name__)

from django.contrib.auth import get_user_model  # noqa: E402

User = get_user_model()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _client_meta(request):
    """IP and user agent, forwarded to WorkOS for its own abuse detection."""
    forwarded = request.META.get('HTTP_X_FORWARDED_FOR', '')
    ip = forwarded.split(',')[0].strip() if forwarded else request.META.get('REMOTE_ADDR')
    return {
        'ip_address': ip or None,
        'user_agent': request.META.get('HTTP_USER_AGENT') or None,
    }


def _normalize_email(email):
    return User.objects.normalize_email((email or '').strip()).lower()


def _workos_user_fields(workos_user):
    """
    Flatten the SDK's User model into the handful of fields we store.

    Accepts a dict too, so tests can pass plain fixtures.
    """
    if workos_user is None:
        return {}
    get = workos_user.get if isinstance(workos_user, dict) else lambda k, d=None: getattr(workos_user, k, d)
    return {
        'id': get('id'),
        'email': get('email') or '',
        'first_name': get('first_name') or '',
        'last_name': get('last_name') or '',
        'email_verified': bool(get('email_verified', False)),
    }


def _user_payload(user, profile):
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


def _token_payload(auth_response):
    return {
        'access': auth_response.access_token,
        'refresh': auth_response.refresh_token,
    }


def claim_pending_cohost_invites(user):
    """
    Attach any co-host invitations addressed to this user's email.

    Guarded on email_verified: invites are claimed by email, so claiming on an
    unverified address would let anyone take over a co-host grant by signing up
    with someone else's address.
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
            invite.delete()

    if claimed:
        logger.info("Claimed %s co-host invite(s) for %s", claimed, user.email)
    return claimed


def upsert_user(workos_user):
    """
    Resolve the local user from a WorkOS profile, in order:
    workos_id -> email -> create.

    The email branch is the migration path: it silently links a pre-existing
    Byro account to its WorkOS identity, so the user keeps the same row and
    therefore all of their events and tickets.

    Returns (user, created). Raises ValueError if WorkOS gave us no email —
    fabricating a placeholder address is what produced the @web3auth.user rows
    this migration exists to undo.
    """
    fields = _workos_user_fields(workos_user)
    workos_id = fields.get('id')
    email = _normalize_email(fields.get('email'))
    verified = fields.get('email_verified', False)

    if not workos_id:
        raise ValueError("WorkOS returned no user id")

    with transaction.atomic():
        user = User.objects.filter(workos_id=workos_id).first()

        if user is None and email:
            user = User.objects.filter(email__iexact=email).first()
            if user is not None:
                logger.info("Linking existing Byro account %s to WorkOS id %s", email, workos_id)

        if user is None and not email:
            raise ValueError("WorkOS returned a user with no email address")

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


def _backfill_display_name(profile, workos_user):
    """Seed display_name from WorkOS on first sign-in; never overwrite one the user set."""
    if profile.display_name:
        return
    fields = _workos_user_fields(workos_user)
    name = ' '.join(p for p in [fields.get('first_name'), fields.get('last_name')] if p).strip()
    if name:
        profile.display_name = name
        profile.save(update_fields=['display_name'])


def _identify_posthog_user(user, profile):
    """Identify the current sign-in request after its user is established."""
    if apps.posthog_client is None:
        return

    user_id = str(user.pk)
    apps.posthog_client.identify_context(user_id)
    apps.posthog_client.set(
        distinct_id=user_id,
        properties={
            'email': user.email,
            'username': user.username,
            'display_name': profile.display_name,
            'email_verified': user.email_verified,
            'auth_provider': user.auth_provider,
        },
    )


def complete_sign_in(auth_response):
    """
    Turn a successful WorkOS authentication into a Byro session response.

    Shared by every sign-in route — Magic Auth and OAuth differ only in how
    they obtain `auth_response`. The middleware saw this request as anonymous,
    so establish its PostHog identity once the local user exists.
    """
    user, created = upsert_user(auth_response.user)
    profile, _ = UserProfile.objects.get_or_create(user=user)
    _backfill_display_name(profile, auth_response.user)
    _identify_posthog_user(user, profile)
    claimed = claim_pending_cohost_invites(user)

    if apps.posthog_client is not None:
        apps.posthog_client.capture(
            'sign_in_completed',
            properties={
                'auth_provider': user.auth_provider,
                'is_new_user': created,
                'cohost_invites_claimed': claimed,
            },
        )

    return {
        'success': True,
        'is_new_user': created,
        'cohost_invites_claimed': claimed,
        'user': _user_payload(user, profile),
        'tokens': _token_payload(auth_response),
    }


class _AuthEndpoint(APIView):
    """Unauthenticated by DRF's reckoning — these routes create the session."""
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]


# ---------------------------------------------------------------------------
# Magic Auth — the email field on the sign-in screen
# ---------------------------------------------------------------------------

class MagicAuthSendView(_AuthEndpoint):
    """
    POST /api/auth/magic/send/   {email}

    Always returns 200 with the same body, whether or not the address has an
    account and whether or not WorkOS accepted it. Anything else turns this into
    an account-enumeration oracle.
    """
    throttle_scope = 'auth_send'

    def post(self, request):
        email = _normalize_email(request.data.get('email'))
        if not email or '@' not in email:
            return Response(
                {'error': 'A valid email address is required'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        workos_api.send_magic_auth_code(email, **_client_meta(request))

        return Response({
            'success': True,
            'message': f'If an account can be created for {email}, a code is on its way.',
            'expires_in': 600,
        })


class MagicAuthVerifyView(_AuthEndpoint):
    """POST /api/auth/magic/verify/   {email, code}"""
    throttle_scope = 'auth_verify'

    def post(self, request):
        email = _normalize_email(request.data.get('email'))
        code = (request.data.get('code') or '').strip()

        if not email or not code:
            return Response(
                {'error': 'email and code are both required'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            auth_response = workos_api.authenticate_with_magic_auth(
                code=code, email=email, **_client_meta(request)
            )
        except WorkOSAPIError as e:
            return Response({'error': str(e), 'code': e.code}, status=status.HTTP_401_UNAUTHORIZED)

        try:
            return Response(complete_sign_in(auth_response))
        except ValueError as e:
            logger.error("Magic auth succeeded but the local user could not be built: %s", e)
            return Response({'error': str(e)}, status=status.HTTP_502_BAD_GATEWAY)
        except IntegrityError as e:
            logger.error("Failed to upsert user after magic auth: %s", e)
            return Response({'error': 'Could not sync this account'}, status=status.HTTP_409_CONFLICT)


# ---------------------------------------------------------------------------
# OAuth — the Google and Apple buttons
# ---------------------------------------------------------------------------

class OAuthAuthorizeView(_AuthEndpoint):
    """
    POST /api/auth/oauth/authorize/   {provider}

    Returns the URL to send the browser to. The redirect URI comes from
    settings, never from the request — accepting a client-supplied one would
    make this an open redirect and let an attacker harvest auth codes.
    """
    throttle_scope = 'auth_send'

    def post(self, request):
        provider = (request.data.get('provider') or '').strip()
        if not provider:
            return Response(
                {'error': 'provider is required', 'supported': sorted(workos_api.OAUTH_PROVIDERS)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        from django.conf import settings
        redirect_uri = getattr(settings, 'WORKOS_OAUTH_REDIRECT_URI', '')
        if not redirect_uri:
            logger.error("WORKOS_OAUTH_REDIRECT_URI is not configured")
            return Response(
                {'error': 'Social sign-in is not configured'},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        try:
            url = workos_api.get_authorization_url(
                provider=provider,
                redirect_uri=redirect_uri,
                state=request.data.get('state') or None,
            )
        except WorkOSAPIError as e:
            code = status.HTTP_400_BAD_REQUEST if e.code == 'unsupported_provider' \
                else status.HTTP_502_BAD_GATEWAY
            return Response({'error': str(e), 'code': e.code}, status=code)

        return Response({'success': True, 'authorization_url': url})


class OAuthCallbackView(_AuthEndpoint):
    """
    POST /api/auth/oauth/callback/   {code}

    The frontend receives `code` on its own callback route and posts it here to
    be exchanged, which keeps tokens out of URLs and browser history.
    """
    throttle_scope = 'auth_verify'

    def post(self, request):
        code = (request.data.get('code') or '').strip()
        if not code:
            return Response({'error': 'code is required'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            auth_response = workos_api.authenticate_with_code(code=code, **_client_meta(request))
        except WorkOSAPIError as e:
            return Response({'error': str(e), 'code': e.code}, status=status.HTTP_401_UNAUTHORIZED)

        try:
            return Response(complete_sign_in(auth_response))
        except ValueError as e:
            logger.error("OAuth succeeded but the local user could not be built: %s", e)
            return Response({'error': str(e)}, status=status.HTTP_502_BAD_GATEWAY)
        except IntegrityError as e:
            logger.error("Failed to upsert user after OAuth: %s", e)
            return Response({'error': 'Could not sync this account'}, status=status.HTTP_409_CONFLICT)


# ---------------------------------------------------------------------------
# Session
# ---------------------------------------------------------------------------

class RefreshView(_AuthEndpoint):
    """
    POST /api/auth/refresh/   {refresh_token}

    WorkOS access tokens are short-lived by design. A 401 here is the normal
    end of a session (or a sign-out elsewhere), not an alarming failure.
    """
    throttle_scope = 'auth_refresh'

    def post(self, request):
        refresh_token = (request.data.get('refresh_token') or request.data.get('refresh') or '').strip()
        if not refresh_token:
            return Response({'error': 'refresh_token is required'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            auth_response = workos_api.authenticate_with_refresh_token(
                refresh_token=refresh_token, **_client_meta(request)
            )
        except WorkOSAPIError as e:
            return Response({'error': str(e), 'code': e.code}, status=status.HTTP_401_UNAUTHORIZED)

        return Response({'success': True, 'tokens': _token_payload(auth_response)})


class MeView(APIView):
    """
    GET /api/auth/me/

    The current user and profile, for hydrating the UI after a reload. Uses the
    normal WorkOSAuthentication path, so a 401 means the access token needs
    refreshing.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        profile, _ = UserProfile.objects.get_or_create(user=request.user)
        return Response({'success': True, 'user': _user_payload(request.user, profile)})
