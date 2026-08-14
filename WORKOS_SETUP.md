# WorkOS AuthKit — backend

Web3Auth and Privy are gone from the backend. WorkOS access tokens are now the
only API credential; Byro signs nothing of its own.

**Scope note:** this change is backend-only. `frontend/` is untouched and still
posts to `/api/auth/social/`, which no longer exists — so the frontend is broken
against this backend until the AuthKit work lands, and the two must deploy
together. The contract the frontend needs to implement is in §7.

---

## 1. Environment variables

`Backend/.env`:

| Variable | Required | Notes |
|---|---|---|
| `WORKOS_CLIENT_ID` | **yes** | From the WorkOS dashboard. Determines the JWKS URL. |
| `WORKOS_API_KEY` | **yes** | Server-side secret. Used only at sign-in and for co-host invitations. |
| `SECRET_KEY` | **yes** | No default any more — Django will not boot without it. **Rotate it**: the old value was a `django-insecure-…` literal committed to git history. It no longer signs API tokens, but still covers sessions, admin and CSRF. |
| `DEBUG` | no | Now defaults to `False`. It used to be hardcoded `True`, silently overriding the env read. |
| `ALLOWED_HOSTS` | **yes in prod** | Comma-separated, e.g. `usebyro.com,www.usebyro.com,byro.onrender.com`. Was `["*"]`. Empty with `DEBUG=False` rejects everything — deliberate, so a misconfigured deploy fails loudly rather than accepting any Host header. |
| `WORKOS_ISSUER` | no | Pins the `iss` claim tokens must carry — your hosted AuthKit domain, **not** a name you choose. Run `check_workos` to discover it. Per-environment. See §4. |
| `WORKOS_API_BASE_URL` | no | Defaults to `https://api.workos.com`. Override only for tests. |

Now unused, safe to delete: `PRIVY_APP_ID`, `PRIVY_APP_SECRET`,
`PRIVY_VERIFICATION_KEY`, `WEB3AUTH_CLIENT_ID`, `WEB3AUTH_JWKS_URL`.

## 2. Install and migrate

```bash
cd Backend
pip install -r requirements.txt   # simplejwt, privy, privy-client removed
python manage.py migrate
```

Migration `0016` adds `CustomUser.workos_id` / `email_verified` plus the co-host
invite columns. Existing `EventCoHost` rows default to `accepted`, so no current
co-host loses access.

## 3. Verify the configuration

```bash
python manage.py check_workos                       # credentials, JWKS, API key
python manage.py check_workos --token "<real access token>"
```

The no-argument form checks credentials, JWKS reachability and the API key, and
**discovers your real issuer** and compares it against `WORKOS_ISSUER` — so a
wrong pin is caught before it breaks every sign-in.

The `--token` form additionally runs the exact verification path every API
request uses, naming the specific cause on failure (expired, issuer mismatch, or
wrong client id) instead of leaving you with an opaque 401. Worth running once
after the first real sign-in.

Exits non-zero on failure, so it works in CI.

## 4. The issuer

`check_workos` discovers this automatically — you do not need to look it up.

The issuer is your project's **hosted AuthKit domain**, which WorkOS generates
and which does *not* resemble your product name. For the current staging
project it is:

```
WORKOS_ISSUER=https://expansive-prophecy-54-staging.authkit.app
```

Find it for any project by running `check_workos`, or by hand:

```bash
# 1. the authorize endpoint redirects to your AuthKit domain
curl -sD - -o /dev/null \
  "https://api.workos.com/user_management/authorize?client_id=<CLIENT_ID>&response_type=code&redirect_uri=http://localhost/x" \
  | grep -i '^location:'

# 2. that domain names the issuer authoritatively
curl -s https://<your-domain>.authkit.app/.well-known/openid-configuration | jq .issuer
```

It is also shown in the WorkOS dashboard under the AuthKit / Redirects settings.

**Note:** `WORKOS_ISSUER` is per-environment. Your production WorkOS project
will have a different client id *and* a different AuthKit domain — the `-staging`
suffix above is a giveaway. Re-run `check_workos` in production.

**A wrong value rejects every token**, and no other check reveals it, which is
why `check_workos` fails loudly on a mismatch. Leaving it unset is safe: WorkOS
publishes JWKS **per client**, so a valid signature already proves the token was
issued for your client. That is the key difference from the Web3Auth code being
replaced, whose JWKS was *global* across every project — skipping the audience
check there meant any valid Web3Auth token authenticated. Here the signature
does the work; pinning the issuer is defence-in-depth on top.

## 5. How authentication works now

```
POST /api/auth/sync/   (once per sign-in)
  -> verify JWT against this client's JWKS (RS256)
  -> GET WorkOS user for their email (the token does not carry one)
  -> upsert CustomUser: workos_id -> email -> create
  -> claim any pending co-host invites
  <- {user, is_new_user, cohost_invites_claimed}

every other request
  -> verify JWT + one indexed lookup on workos_id. No network, no API call.
```

`WorkOSAuthentication` ([authentication.py](Backend/bryo/authentication.py)) is
the sole `DEFAULT_AUTHENTICATION_CLASSES` entry. Session and Basic auth were
dropped deliberately: the API is cross-origin and token-only, and leaving
`SessionAuthentication` on would expose every endpoint to CSRF via the admin
cookie.

A valid token for a `sub` with no local user gets **401**, not a lazy create —
the client must call `/api/auth/sync/` first.

What this fixes:

- **Logout works.** WorkOS revokes the session. Previously nothing could
  invalidate a token for its full 60 minutes.
- **`SECRET_KEY` no longer signs API credentials**, so a repo leak no longer
  lets anyone mint a token for any user id.
- **Emails are verified**, which matters because co-host invites key on email.

## 6. Account migration

Existing users are matched by **email** at `/api/auth/sync/`, so they land on
their existing row and keep every event and ticket. Run this against
**production Postgres** before cutting over, not the committed `db.sqlite3`:

```bash
python manage.py shell -c "
from django.contrib.auth import get_user_model
U = get_user_model()
print('web3auth:', U.objects.filter(email__endswith='@web3auth.user').count())
print('privy:', U.objects.filter(email__endswith='@privy.user').count())
print('total:', U.objects.count())
"
```

Accounts with a placeholder `@web3auth.user` / `@privy.user` address **cannot**
be matched and would get a new empty account on sign-in. If that count is
non-trivial, fix those rows by hand first — set `workos_id`, or correct the
email to the person's real address so the email match picks it up.

## 7. Co-host invitations

`add_cohost` used to 404 when the invitee had no account. Now an unknown email
creates a **pending** grant (`user=NULL`), sends a WorkOS invitation, and emails
them. It is claimed on that person's first sign-in, and only if WorkOS reports
the email verified — otherwise anyone could seize a grant by signing up with
someone else's address.

A pending grant confers **no** access. Every check routes through
`Event.is_cohost()`, which filters on `status='accepted'`.

## 8. Contract for the frontend

**Sign-in.** After AuthKit completes, call once:

```
POST /api/auth/sync/
Authorization: Bearer <WorkOS access token>
```

```jsonc
// 200
{
  "success": true,
  "is_new_user": false,
  "cohost_invites_claimed": 0,
  "user": {
    "id": 42,
    "email": "someone@example.com",
    "username": "someone@example.com",
    "email_verified": true,
    "display_name": "Ada Lovelace",
    "handle": "ada",
    "avatar_url": "https://…",
    "is_profile_complete": false
  }
}
```

Same `user` shape the old `/api/auth/social/` returned, **minus `tokens`** —
there is no Byro-issued token any more. Errors: `401` invalid/expired/missing
token, `502` WorkOS unreachable on a first-ever sign-in, `409` conflict.
Throttled to 30/hour.

**Every other request.** Send `Authorization: Bearer <access token>`. Nothing
else changed — all existing endpoints, permissions and payloads are the same.

**Important behaviours:**

- A `401` on a normal endpoint means the short-lived access token lapsed.
  Refresh via AuthKit and retry; do not log the user out.
- A `401` saying *"No Byro account for this identity"* means `/api/auth/sync/`
  has not run yet for this user. Call it, then retry.
- Do **not** put the token in `localStorage`. WorkOS keeps the session in an
  httpOnly cookie specifically so it is not readable by injected script.
- Guest flows are unchanged and must keep working logged-out: browsing events
  and `POST /api/events/<slug>/register/` are both still `AllowAny`.
- `/api/auth/privy/` and `/api/auth/social/` are **deleted** and now 404.

## 9. Known follow-ups

- **`PrivyUser` and the `privy_id` / `external_id` / `auth_provider` columns are
  intentionally still present.** Dropping tables in the same deploy that logs
  everyone out would leave no way to diagnose a mis-linked account. Drop them in
  a follow-up migration once the cutover is verified.
- Set `WORKOS_ISSUER` once confirmed (§4).
- WorkOS is called via `requests`, not the official `workos` SDK — two functions
  in [workos_api.py](Backend/bryo/services/workos_api.py). Swap in the SDK there
  if preferred.
- `Backend/db.sqlite3` is committed and predates the `SECRET_KEY` rotation.
  Worth removing from the repo separately.
- `BACKEND_AND_AUTH.md` proposes building our own email OTP auth. Superseded.

## 10. Tests

```bash
cd Backend && python manage.py test bryo
```

33 tests, all passing, fully offline — they generate an RSA keypair and sign
WorkOS-shaped tokens locally, so the real verification path (signature, issuer,
expiry, required claims) is exercised without network. Coverage: token
verification and its failure modes, issuer pinning both on and off, the
authentication class, account linking on migration, and co-host invite claiming
including the unverified-email case.
