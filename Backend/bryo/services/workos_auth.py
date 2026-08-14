"""
WorkOS AuthKit access-token verification.

WorkOS issues RS256 access tokens signed with a per-client key published via
JWKS. This module verifies them locally: no WorkOS API call happens on the
request path, only a cached JWKS fetch on the first request after boot.

Configure in settings.py / .env:
  WORKOS_CLIENT_ID       — client ID from the WorkOS dashboard. Determines both
                           the JWKS URL and the expected issuer.
  WORKOS_API_BASE_URL    — override only for testing against a mock.

Access token claims we rely on:
  sub  — the WorkOS user id ("user_01H..."), our canonical identity key
  sid  — session id; the session is what sign-out revokes
  iss  — must match this client's issuer, see _expected_issuer()
  exp  — short-lived (minutes); the frontend refreshes via AuthKit

Note the token does NOT carry `email` by default. Email is fetched once at
sign-in through the Management API (see workos_api.get_user) and cached on
CustomUser — never fetched on the request path.
"""

import logging

import jwt
from django.conf import settings
from jwt import PyJWKClient

logger = logging.getLogger(__name__)

# JWKS keys are stable and cached in-process; this client is built once.
_jwks_client = None


def _base_url() -> str:
    return getattr(settings, 'WORKOS_API_BASE_URL', 'https://api.workos.com').rstrip('/')


def jwks_url() -> str:
    """Per-client JWKS endpoint. WorkOS namespaces signing keys by client id."""
    return f"{_base_url()}/sso/jwks/{settings.WORKOS_CLIENT_ID}"


def expected_issuer():
    """
    The `iss` to require, or None to accept any issuer.

    Set WORKOS_ISSUER in .env to pin it. Run `manage.py check_workos --token
    <real token>` to find out what your tokens actually carry — WorkOS has used
    both an AuthKit domain (https://your-app.authkit.app) and an api.workos.com
    URL depending on setup and version, so this is not safe to hardcode.

    Leaving it unset is still secure, and this is the important difference from
    the Web3Auth code this replaced. Web3Auth published one *global* JWKS shared
    by every project, so without an issuer or audience check any valid Web3Auth
    token authenticated — that was a real hole. WorkOS publishes JWKS *per
    client* (/sso/jwks/<client_id>), so a valid signature already proves the
    token was minted for this specific client. Pinning the issuer is
    defence-in-depth on top of that, not the thing doing the work.
    """
    return getattr(settings, 'WORKOS_ISSUER', '') or None


def _get_jwks_client() -> PyJWKClient:
    global _jwks_client
    if _jwks_client is None:
        _jwks_client = PyJWKClient(jwks_url(), cache_keys=True)
    return _jwks_client


def reset_jwks_client() -> None:
    """Drop the cached client. Used by tests and after a config change."""
    global _jwks_client
    _jwks_client = None


def verify_access_token(token: str):
    """
    Verify a WorkOS access token.

    Returns the decoded claims dict, or None if the token is missing, expired,
    malformed, signed by an unknown key, or issued for a different client.
    """
    if not token:
        return None

    if not settings.WORKOS_CLIENT_ID:
        logger.error("WORKOS_CLIENT_ID is not configured; refusing to verify tokens")
        return None

    issuer = expected_issuer()

    try:
        # The signing key is fetched from this client's own JWKS, so a valid
        # signature is itself proof the token belongs to this WorkOS client.
        signing_key = _get_jwks_client().get_signing_key_from_jwt(token)
        return jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            **({"issuer": issuer} if issuer else {}),
            options={
                "verify_aud": False,  # WorkOS access tokens carry no `aud`
                "require": ["exp", "sub"],
            },
            leeway=30,  # tolerate modest clock skew on short-lived tokens
        )
    except jwt.ExpiredSignatureError:
        logger.info("WorkOS access token expired")
        return None
    except jwt.InvalidIssuerError:
        logger.warning(
            "WorkOS token rejected: issuer is not %s. Run `manage.py check_workos "
            "--token <token>` to see what your tokens actually carry.",
            issuer,
        )
        return None
    except jwt.InvalidTokenError as e:
        logger.warning("Invalid WorkOS access token: %s", e)
        return None
    except Exception as e:
        # JWKS fetch failures land here. Fail closed.
        logger.error("Error verifying WorkOS access token: %s", e)
        return None
