"""
DRF authentication against WorkOS AuthKit access tokens.

This is the only credential the API accepts. Byro signs nothing.

The hot path is deliberately cheap and offline: verify the JWT against the
cached JWKS, then one indexed lookup on CustomUser.workos_id. A token for a
`sub` we have never seen is rejected with 401 rather than triggering a WorkOS
API call — the frontend is expected to call POST /api/auth/sync/ once at
sign-in, which is where a local user row gets created.
"""

from django.contrib.auth import get_user_model
from rest_framework import authentication, exceptions

from . import apps
from .services.workos_auth import verify_access_token

User = get_user_model()


class WorkOSAuthentication(authentication.BaseAuthentication):
    keyword = 'Bearer'

    def authenticate(self, request):
        auth_header = authentication.get_authorization_header(request).split()

        if not auth_header or auth_header[0].lower() != self.keyword.lower().encode():
            # No bearer credentials — let AllowAny views (public events, guest
            # registration, Paystack webhooks) proceed as anonymous.
            return None

        if len(auth_header) == 1:
            raise exceptions.AuthenticationFailed('Invalid token header: no credentials provided.')
        if len(auth_header) > 2:
            raise exceptions.AuthenticationFailed('Invalid token header: token must not contain spaces.')

        try:
            token = auth_header[1].decode()
        except UnicodeError:
            raise exceptions.AuthenticationFailed('Invalid token header: token is not valid UTF-8.')

        claims = verify_access_token(token)
        if claims is None:
            raise exceptions.AuthenticationFailed('Invalid or expired token.')

        workos_id = claims.get('sub')
        if not workos_id:
            raise exceptions.AuthenticationFailed('Token is missing a subject claim.')

        user = User.objects.filter(workos_id=workos_id).first()
        if user is None:
            # Valid token, unknown user: they have authenticated with WorkOS but
            # have no Byro record yet. /api/auth/sync/ creates it.
            raise exceptions.AuthenticationFailed('No Byro account for this identity. Call /api/auth/sync/ first.')

        if not user.is_active:
            raise exceptions.AuthenticationFailed('This account is inactive.')

        # Django's PostHog middleware opens the request context before DRF
        # authenticates bearer credentials, so it initially sees an anonymous
        # user. Tag the existing context as soon as this authenticated user is
        # known, so subsequent events and exceptions in this request attribute
        # to them — person properties are synced once at sign-in, not here,
        # to keep this hot path cheap.
        if apps.posthog_client is not None:
            apps.posthog_client.identify_context(str(user.pk))

        return (user, claims)

    def authenticate_header(self, request):
        # Makes DRF return 401 rather than 403 for unauthenticated requests.
        return self.keyword
