"""
Verify the WorkOS configuration end to end.

Written because the JWKS URL and issuer format in services/workos_auth.py were
derived without network access to the WorkOS docs. This command proves them
against the real service, so a misconfiguration surfaces here rather than as an
opaque 401 during sign-in.

    python manage.py check_workos
    python manage.py check_workos --token "<a real access token>"

The no-argument form is enough on its own: it discovers this project's real
issuer from WorkOS and tells you whether WORKOS_ISSUER matches. The --token form
additionally runs the exact verification path every authenticated request uses,
which is worth doing once after the first real sign-in.
"""

import json
from urllib.parse import urlparse

import requests
from django.conf import settings
from django.core.management.base import BaseCommand

from bryo.services import workos_api, workos_auth


class Command(BaseCommand):
    help = "Check WorkOS credentials, JWKS reachability, and optionally verify a real access token."

    def add_arguments(self, parser):
        parser.add_argument(
            "--token",
            help="A real WorkOS access token. Verifies it exactly as the API does and prints its claims.",
        )
        parser.add_argument(
            "--timeout", type=int, default=15, help="HTTP timeout in seconds (default 15).",
        )

    def handle(self, *args, **options):
        self.failures = []
        self.timeout = options["timeout"]

        self._check_settings()
        self._check_jwks()
        self._check_api_key()
        self._check_issuer()

        if options["token"]:
            self._check_token(options["token"])

        self.stdout.write("")
        if self.failures:
            self.stdout.write(self.style.ERROR(f"{len(self.failures)} check(s) failed:"))
            for f in self.failures:
                self.stdout.write(self.style.ERROR(f"  - {f}"))
            raise SystemExit(1)

        self.stdout.write(self.style.SUCCESS("All WorkOS checks passed."))

    # -- individual checks -------------------------------------------------

    def _ok(self, msg):
        self.stdout.write(self.style.SUCCESS(f"  OK    {msg}"))

    def _fail(self, msg, detail=None):
        self.stdout.write(self.style.ERROR(f"  FAIL  {msg}"))
        if detail:
            self.stdout.write(f"        {detail}")
        self.failures.append(msg)

    def _skip(self, msg):
        """A check that could not run because an earlier one failed. Not counted twice."""
        self.stdout.write(self.style.WARNING(f"  SKIP  {msg}"))

    def _check_settings(self):
        self.stdout.write(self.style.MIGRATE_HEADING("Settings"))

        client_id = getattr(settings, "WORKOS_CLIENT_ID", "")
        api_key = getattr(settings, "WORKOS_API_KEY", "")

        if client_id:
            self._ok(f"WORKOS_CLIENT_ID = {client_id}")
        else:
            self._fail("WORKOS_CLIENT_ID is not set", "Add it to Backend/.env")

        if api_key:
            # Never print the secret; the prefix is enough to spot a wrong-env key.
            self._ok(f"WORKOS_API_KEY is set ({api_key[:7]}…, {len(api_key)} chars)")
            if not api_key.startswith("sk_"):
                self.stdout.write(
                    "        note: WorkOS secret keys normally start with 'sk_' — check you "
                    "haven't pasted the client id here."
                )
        else:
            self._fail("WORKOS_API_KEY is not set", "Add it to Backend/.env")

        self.stdout.write(f"        base URL: {workos_api._base_url()}")

    def _check_jwks(self):
        self.stdout.write(self.style.MIGRATE_HEADING("\nJWKS (used to verify every request)"))

        if not getattr(settings, "WORKOS_CLIENT_ID", ""):
            self._skip("no client id configured")
            return False

        url = workos_auth.jwks_url()
        self.stdout.write(f"        URL: {url}")

        try:
            response = requests.get(url, timeout=self.timeout)
        except requests.RequestException as e:
            self._fail("Could not reach the JWKS endpoint", e)
            return False

        if response.status_code != 200:
            self._fail(
                f"JWKS returned HTTP {response.status_code}",
                "A 404 here means the JWKS URL shape in services/workos_auth.py is wrong.",
            )
            return False

        try:
            keys = response.json().get("keys", [])
        except ValueError:
            self._fail("JWKS response was not JSON")
            return False

        if not keys:
            self._fail("JWKS returned no signing keys")
            return False

        self._ok(f"Reachable, {len(keys)} signing key(s): {[k.get('kid', '?') for k in keys]}")
        return True

    def _check_api_key(self):
        self.stdout.write(
            self.style.MIGRATE_HEADING("\nManagement API (used at sign-in and for co-host invites)")
        )

        if not getattr(settings, "WORKOS_API_KEY", ""):
            self._skip("no API key configured")
            return

        url = f"{workos_api._base_url()}/user_management/users"
        try:
            response = requests.get(
                url, headers=workos_api._headers(), params={"limit": 1}, timeout=self.timeout,
            )
        except requests.RequestException as e:
            self._fail("Could not reach the Management API", e)
            return

        if response.status_code == 401:
            self._fail("API key rejected (401)", "Check WORKOS_API_KEY matches this environment.")
            return
        if response.status_code != 200:
            self._fail(
                f"Management API returned HTTP {response.status_code}",
                response.text[:300],
            )
            return

        try:
            count = len(response.json().get("data", []))
        except ValueError:
            count = 0
        self._ok(f"API key accepted (users endpoint returned {count} record(s))")

    def _discover_issuer(self):
        """
        Find this project's real issuer without needing an access token.

        The authorize endpoint 302s to the tenant's hosted AuthKit domain (the
        redirect_uri below is intentionally bogus — we only want the Location
        header, and an invalid one still reveals the domain). That domain then
        serves an OIDC discovery document naming the issuer authoritatively.
        """
        client_id = getattr(settings, "WORKOS_CLIENT_ID", "")
        if not client_id:
            return None, "no client id configured"

        authorize = (
            f"{workos_api._base_url()}/user_management/authorize"
            f"?client_id={client_id}&response_type=code"
            f"&redirect_uri=http%3A%2F%2Flocalhost%2F__issuer_probe__"
        )
        try:
            response = requests.get(authorize, timeout=self.timeout, allow_redirects=False)
        except requests.RequestException as e:
            return None, f"could not reach the authorize endpoint: {e}"

        location = response.headers.get("location", "")
        if not location:
            return None, f"authorize returned HTTP {response.status_code} with no redirect"

        parsed = urlparse(location)
        if not parsed.scheme or not parsed.netloc:
            return None, f"could not parse the AuthKit domain from: {location[:200]}"
        domain = f"{parsed.scheme}://{parsed.netloc}"

        try:
            discovery = requests.get(
                f"{domain}/.well-known/openid-configuration", timeout=self.timeout,
            )
        except requests.RequestException as e:
            return None, f"could not reach OIDC discovery on {domain}: {e}"

        if discovery.status_code != 200:
            return None, f"OIDC discovery on {domain} returned HTTP {discovery.status_code}"

        try:
            return discovery.json().get("issuer"), None
        except ValueError:
            return None, f"OIDC discovery on {domain} did not return JSON"

    def _check_issuer(self):
        self.stdout.write(self.style.MIGRATE_HEADING("\nIssuer"))

        configured = getattr(settings, "WORKOS_ISSUER", "") or None
        actual, problem = self._discover_issuer()

        if problem:
            self.stdout.write(f"        Could not auto-discover: {problem}")
            if configured:
                self.stdout.write(
                    f"        WORKOS_ISSUER is pinned to {configured} but is unverified. "
                    f"Confirm with --token, or unset it (still secure — the JWKS is "
                    f"client-scoped)."
                )
            return

        self.stdout.write(f"        This project's real issuer: {actual}")

        if configured == actual:
            self._ok("WORKOS_ISSUER matches — tokens will validate")
        elif configured:
            # The dangerous case: a wrong pin rejects every token, and no other
            # check in this command would reveal it.
            self._fail(
                f"WORKOS_ISSUER is WRONG — every sign-in will fail with 401",
                f"configured: {configured}\n"
                f"        should be: {actual}\n"
                f"        Fix Backend/.env:\n"
                f"            WORKOS_ISSUER={actual}",
            )
        else:
            self.stdout.write(
                self.style.WARNING(
                    f"        WORKOS_ISSUER is unset. That is secure as-is, but you can pin it:\n"
                    f"            WORKOS_ISSUER={actual}"
                )
            )

    def _check_token(self, token):
        self.stdout.write(self.style.MIGRATE_HEADING("\nAccess token verification"))

        issuer = workos_auth.expected_issuer()
        self.stdout.write(
            f"        issuer pinning: {issuer}" if issuer
            else "        issuer pinning: off (WORKOS_ISSUER unset)"
        )

        claims = workos_auth.verify_access_token(token)

        if claims is None:
            self._fail(
                "Token failed verification",
                "This is the exact path every API request uses. See the diagnosis below.",
            )
            self._dump_unverified(token, issuer)
            return

        self._ok("Token verified — signature, expiry and required claims all good")
        self.stdout.write("        claims: " + json.dumps(claims, indent=8, default=str))

        # The whole reason this command exists: report the real issuer so it can
        # be pinned, rather than guessing at its format.
        actual_iss = claims.get("iss")
        if actual_iss and not issuer:
            self.stdout.write(
                self.style.WARNING(
                    f"\n        Your tokens are issued by:  {actual_iss}\n"
                    f"        Pin it by adding this to Backend/.env:\n"
                    f"            WORKOS_ISSUER={actual_iss}"
                )
            )
        elif not actual_iss:
            self.stdout.write(
                "        note: these tokens carry no `iss` claim, so leave WORKOS_ISSUER unset."
            )

        if "email" in claims:
            self.stdout.write(
                "        note: this token carries an `email` claim, so the Management API "
                "lookup in /api/auth/sync/ could be skipped as an optimisation."
            )

        sub = claims.get("sub")
        from django.contrib.auth import get_user_model
        from django.db.utils import DatabaseError

        try:
            user = get_user_model().objects.filter(workos_id=sub).first()
        except DatabaseError as e:
            # Most likely migration 0016 has not been applied yet.
            self._fail(
                "Could not look up the local user",
                f"{e}\n        Run `python manage.py migrate` — the workos_id column "
                f"is added by migration 0016.",
            )
            return

        if user:
            self._ok(f"Local user found for sub={sub}: {user.email} (id={user.id})")
        else:
            self.stdout.write(
                f"  INFO  No local user for sub={sub} yet. That is expected before this "
                f"identity has called POST /api/auth/sync/ — the API would return 401 until then."
            )

    def _dump_unverified(self, token, pinned_issuer):
        """Decode without verifying, purely to show what the token actually claims."""
        import datetime

        try:
            import jwt

            unverified = jwt.decode(token, options={"verify_signature": False})
        except Exception as e:
            self.stdout.write(f"        (could not decode the token at all: {e})")
            self.stdout.write(
                "        That means it is not a well-formed JWT — check you copied the "
                "*access* token, not the refresh token or a session cookie."
            )
            return

        self.stdout.write("        token's actual claims (UNVERIFIED, for diagnosis only):")
        self.stdout.write("        " + json.dumps(unverified, indent=8, default=str))

        # Work through the plausible causes in order and name the specific one.
        exp = unverified.get("exp")
        if exp:
            expires = datetime.datetime.fromtimestamp(exp, datetime.timezone.utc)
            now = datetime.datetime.now(datetime.timezone.utc)
            if expires < now:
                age = int((now - expires).total_seconds())
                self.stdout.write(
                    self.style.WARNING(
                        f"\n        CAUSE: the token expired {age}s ago "
                        f"(at {expires:%H:%M:%S UTC}). WorkOS access tokens are "
                        f"short-lived — grab a fresh one and re-run."
                    )
                )
                return

        actual_iss = unverified.get("iss")
        if pinned_issuer and actual_iss and actual_iss != pinned_issuer:
            self.stdout.write(
                self.style.WARNING(
                    f"\n        CAUSE: issuer mismatch.\n"
                    f"          WORKOS_ISSUER: {pinned_issuer}\n"
                    f"          token says:    {actual_iss}\n"
                    f"        Update WORKOS_ISSUER in Backend/.env to the second value."
                )
            )
            return

        self.stdout.write(
            self.style.WARNING(
                "\n        CAUSE: not expiry or issuer, so the signature did not verify "
                "against this client's JWKS. Most likely the token was issued for a "
                "different WORKOS_CLIENT_ID, or the JWKS fetch above failed."
            )
        )
