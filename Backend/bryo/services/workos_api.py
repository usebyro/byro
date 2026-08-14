"""
WorkOS Management + authentication calls, via the official Python SDK.

Byro renders its own sign-in UI (see frontend `/auth-preview`) rather than
redirecting to AuthKit's hosted page, so Django drives authentication itself:
it sends the Magic Auth code, verifies it, and exchanges OAuth codes. All of
those need the API key, so they belong here on the server.

Deliberately separate from workos_auth.py, which verifies tokens locally on
every request and must never make a network call. Everything in this module
does I/O and is only reached on sign-in.

Every function returns `None` (or raises WorkOSAPIError where the caller needs
to distinguish causes) rather than leaking SDK exception types upward.
"""

import logging

from django.conf import settings
from workos import (
    AuthenticationError,
    BadRequestError,
    NotFoundError,
    RateLimitExceededError,
    WorkOSClient,
    WorkOSError,
)

logger = logging.getLogger(__name__)

_client = None


class WorkOSAPIError(Exception):
    """A WorkOS call failed in a way the caller needs to react to."""

    def __init__(self, message, code=None):
        super().__init__(message)
        self.code = code


def base_url() -> str:
    """The WorkOS API root, without a trailing slash."""
    return (getattr(settings, 'WORKOS_API_BASE_URL', '') or 'https://api.workos.com').rstrip('/')


def client() -> WorkOSClient:
    """The shared SDK client. Built once; it holds a pooled httpx session."""
    global _client
    if _client is None:
        _client = WorkOSClient(
            api_key=settings.WORKOS_API_KEY,
            client_id=settings.WORKOS_CLIENT_ID,
            base_url=getattr(settings, 'WORKOS_API_BASE_URL', None) or None,
        )
    return _client


def reset_client() -> None:
    """Drop the cached client. Used by tests and after a settings change."""
    global _client
    _client = None


# ---------------------------------------------------------------------------
# Management
# ---------------------------------------------------------------------------

def get_user(workos_user_id: str):
    """
    Fetch a user's profile. Returns the SDK `User` model, or None on failure.

    Callers must treat None as "could not resolve", never as "has no email" —
    creating an account without a real address is what produced the
    @web3auth.user rows this migration exists to undo.
    """
    try:
        return client().user_management.get_user(workos_user_id)
    except NotFoundError:
        logger.error("WorkOS has no user %s", workos_user_id)
        return None
    except WorkOSError as e:
        logger.error("WorkOS get_user(%s) failed: %s", workos_user_id, e)
        return None


def send_invitation(email: str, expires_in_days: int = 7, inviter_user_id: str = None):
    """
    Invite someone who has no WorkOS account yet, used when an organiser adds a
    co-host by an unknown email.

    Returns the invitation, or None. None is not fatal to the caller: the
    pending co-host row still stands and Byro sends its own invite email.
    """
    try:
        return client().user_management.send_invitation(
            email=email,
            expires_in_days=expires_in_days,
            **({'inviter_user_id': inviter_user_id} if inviter_user_id else {}),
        )
    except WorkOSError as e:
        # A 422 usually means "already a member", which is not worth failing
        # the co-host invite over — they can simply sign in.
        logger.warning("WorkOS send_invitation(%s) failed: %s", email, e)
        return None


# ---------------------------------------------------------------------------
# Magic Auth — the email field on our sign-in screen
# ---------------------------------------------------------------------------

def send_magic_auth_code(email: str, ip_address: str = None, user_agent: str = None):
    """
    Email a one-time code to `email`. WorkOS owns generation, the 10 minute
    expiry, and attempt limits, so none of that is reimplemented here.

    Returns True on success. The caller must respond identically whether this
    succeeded or not — a differing response turns the endpoint into an account
    enumeration oracle.
    """
    try:
        client().user_management.create_magic_auth(
            email=email,
            **({'ip_address': ip_address} if ip_address else {}),
            **({'user_agent': user_agent} if user_agent else {}),
        )
        return True
    except RateLimitExceededError as e:
        # Worth its own line: this means WorkOS is throttling us, not that the
        # address was bad, and it will look like silent failure to the user.
        logger.error("WorkOS rate-limited magic auth for %s: %s", email, e)
        return False
    except WorkOSError as e:
        logger.warning("WorkOS create_magic_auth(%s) failed: %s", email, e)
        return False


def authenticate_with_magic_auth(code: str, email: str, ip_address: str = None, user_agent: str = None):
    """
    Redeem a Magic Auth code.

    Returns the SDK `AuthenticateResponse` (`.user`, `.access_token`,
    `.refresh_token`). Raises WorkOSAPIError when the code is wrong, expired or
    already used, so the view can return 401 rather than a generic 500.
    """
    try:
        return client().user_management.authenticate_with_magic_auth(
            code=code,
            email=email,
            **({'ip_address': ip_address} if ip_address else {}),
            **({'user_agent': user_agent} if user_agent else {}),
        )
    except (BadRequestError, AuthenticationError) as e:
        raise WorkOSAPIError("That code is incorrect or has expired.", code="invalid_code") from e
    except WorkOSError as e:
        logger.error("WorkOS authenticate_with_magic_auth failed: %s", e)
        raise WorkOSAPIError("Could not verify that code. Please try again.") from e


# ---------------------------------------------------------------------------
# OAuth — the Google and Apple buttons
# ---------------------------------------------------------------------------

# Maps the provider names our frontend uses to WorkOS's identifiers.
OAUTH_PROVIDERS = {
    'google': 'GoogleOAuth',
    'apple': 'AppleOAuth',
    'microsoft': 'MicrosoftOAuth',
    'github': 'GitHubOAuth',
}


def get_authorization_url(provider: str, redirect_uri: str, state: str = None):
    """
    Build the URL to send the browser to for a social sign-in.

    `provider` is one of OAUTH_PROVIDERS' keys. Raises WorkOSAPIError for an
    unknown provider so the view can 400 rather than hand WorkOS junk.
    """
    workos_provider = OAUTH_PROVIDERS.get(provider.lower())
    if not workos_provider:
        raise WorkOSAPIError(
            f"Unsupported provider '{provider}'. Supported: {sorted(OAUTH_PROVIDERS)}",
            code="unsupported_provider",
        )

    try:
        return client().user_management.get_authorization_url(
            provider=workos_provider,
            redirect_uri=redirect_uri,
            **({'state': state} if state else {}),
        )
    except WorkOSError as e:
        logger.error("WorkOS get_authorization_url(%s) failed: %s", provider, e)
        raise WorkOSAPIError("Could not start sign-in with that provider.") from e


def authenticate_with_code(code: str, ip_address: str = None, user_agent: str = None):
    """
    Exchange the `code` an OAuth provider redirected back with.

    Returns the SDK `AuthenticateResponse`. Raises WorkOSAPIError if the code is
    invalid or already redeemed.
    """
    try:
        return client().user_management.authenticate_with_code(
            code=code,
            **({'ip_address': ip_address} if ip_address else {}),
            **({'user_agent': user_agent} if user_agent else {}),
        )
    except (BadRequestError, AuthenticationError) as e:
        raise WorkOSAPIError("That sign-in link is invalid or has already been used.",
                             code="invalid_code") from e
    except WorkOSError as e:
        logger.error("WorkOS authenticate_with_code failed: %s", e)
        raise WorkOSAPIError("Could not complete sign-in. Please try again.") from e


def authenticate_with_refresh_token(refresh_token: str, ip_address: str = None, user_agent: str = None):
    """
    Trade a refresh token for a fresh access token.

    Returns the SDK `AuthenticateResponse`. Raises WorkOSAPIError once the
    refresh token is expired or revoked — which is what signing out does, so
    this is the normal end-of-session path, not an error worth alarming about.
    """
    try:
        return client().user_management.authenticate_with_refresh_token(
            refresh_token=refresh_token,
            **({'ip_address': ip_address} if ip_address else {}),
            **({'user_agent': user_agent} if user_agent else {}),
        )
    except (BadRequestError, AuthenticationError) as e:
        raise WorkOSAPIError("Your session has expired. Please sign in again.",
                             code="invalid_refresh_token") from e
    except WorkOSError as e:
        logger.error("WorkOS authenticate_with_refresh_token failed: %s", e)
        raise WorkOSAPIError("Could not refresh your session.") from e
