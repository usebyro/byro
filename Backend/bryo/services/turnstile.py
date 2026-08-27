"""
Cloudflare Turnstile verification.

Gates the Magic Auth "send code" endpoint against bots that would otherwise
use it to spam OTP emails. See auth_views.MagicAuthSendView.

The widget only appears on the initial email step, not on "Resend" (same
endpoint, different screen) — so a successful check is remembered server-side
for a short window and reused for resends within that flow, instead of
trusting any client-supplied "this is a resend" flag, which a bot could just
always send.
"""

import logging

import requests
from django.conf import settings
from django.core.cache import cache

logger = logging.getLogger(__name__)

SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"

# Matches the magic-code expiry (MagicAuthSendView returns expires_in=600),
# so a verified flow never needs re-checking before the code itself expires.
VERIFIED_TTL_SECONDS = 600


def _verified_cache_key(ip, email):
    return f"turnstile_verified:{ip or 'unknown'}:{email}"


def verify_turnstile_token(token, remote_ip=None):
    """
    Returns True if the token is a valid, unused Turnstile response.

    Fails closed: any missing config, network error, or non-success response
    from Cloudflare is treated as a failed verification.
    """
    secret = getattr(settings, "TURNSTILE_SECRET_KEY", "")
    if not secret:
        logger.error("TURNSTILE_SECRET_KEY is not configured; rejecting request")
        return False

    if not token:
        return False

    payload = {"secret": secret, "response": token}
    if remote_ip:
        payload["remoteip"] = remote_ip

    try:
        resp = requests.post(SITEVERIFY_URL, data=payload, timeout=5)
        resp.raise_for_status()
        data = resp.json()
    except (requests.RequestException, ValueError) as e:
        logger.error("Turnstile verification request failed: %s", e)
        return False

    if not data.get("success"):
        logger.info("Turnstile verification rejected: %s", data.get("error-codes"))
    return bool(data.get("success"))


def check_and_remember_verification(token, email, remote_ip=None):
    """
    True if this request is allowed to proceed: either the token verifies
    now, or this (ip, email) pair already verified recently (a resend).
    """
    key = _verified_cache_key(remote_ip, email)

    if verify_turnstile_token(token, remote_ip=remote_ip):
        cache.set(key, True, VERIFIED_TTL_SECONDS)
        return True

    return bool(cache.get(key))
