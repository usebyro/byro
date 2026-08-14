"""
WorkOS Management API client.

Deliberately kept separate from workos_auth.py: that module verifies tokens
locally on every request, this one makes outbound HTTPS calls and must never be
touched on the request path. It is used at sign-in (to read a user's email,
which the access token does not carry) and when inviting a co-host.

Implemented with `requests` rather than the official `workos` SDK to match the
existing Paystack calls in views.py and to avoid a dependency for two endpoints.
Swapping in the SDK later means reimplementing these two functions and nothing
else.

Requires WORKOS_API_KEY — a server-side secret. Never expose it to the client.
"""

import logging

import requests
from django.conf import settings

logger = logging.getLogger(__name__)

TIMEOUT = 30


def _base_url() -> str:
    return getattr(settings, 'WORKOS_API_BASE_URL', 'https://api.workos.com').rstrip('/')


def _headers() -> dict:
    return {
        'Authorization': f"Bearer {settings.WORKOS_API_KEY.strip()}",
        'Content-Type': 'application/json',
    }


def get_user(workos_user_id: str):
    """
    Fetch a user's profile from WorkOS.

    Returns the user dict (with `email`, `first_name`, `last_name`,
    `email_verified`) or None on any failure — callers must treat None as
    "could not resolve" rather than "user has no email".
    """
    if not settings.WORKOS_API_KEY:
        logger.error("WORKOS_API_KEY is not configured; cannot fetch user")
        return None

    try:
        response = requests.get(
            f"{_base_url()}/user_management/users/{workos_user_id}",
            headers=_headers(),
            timeout=TIMEOUT,
        )
    except requests.RequestException as e:
        logger.error("WorkOS get_user request failed: %s", e)
        return None

    if response.status_code != 200:
        logger.error(
            "WorkOS get_user returned %s for %s: %s",
            response.status_code, workos_user_id, response.text[:500],
        )
        return None

    try:
        return response.json()
    except ValueError:
        logger.error("WorkOS get_user returned non-JSON body")
        return None


def send_invitation(email: str, expires_in_days: int = 7):
    """
    Invite someone who has no WorkOS account yet.

    Used when an organiser adds a co-host by an email that has never signed in.
    Returns the invitation dict, or None on failure — the caller decides whether
    that is fatal (it is not: the co-host row is still created as pending, and
    Byro sends its own invite email regardless).
    """
    if not settings.WORKOS_API_KEY:
        logger.error("WORKOS_API_KEY is not configured; cannot send invitation")
        return None

    try:
        response = requests.post(
            f"{_base_url()}/user_management/invitations",
            headers=_headers(),
            json={'email': email, 'expires_in_days': expires_in_days},
            timeout=TIMEOUT,
        )
    except requests.RequestException as e:
        logger.error("WorkOS send_invitation request failed: %s", e)
        return None

    # 201 on success. 422 usually means "already a member" — not worth failing
    # the co-host invite over, since the person can simply sign in.
    if response.status_code not in (200, 201):
        logger.warning(
            "WorkOS send_invitation returned %s for %s: %s",
            response.status_code, email, response.text[:500],
        )
        return None

    try:
        return response.json()
    except ValueError:
        return None
