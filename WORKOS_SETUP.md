# WorkOS AuthKit — backend

Web3Auth and Privy are gone from the backend. WorkOS access tokens are now the
only API credential; Byro signs nothing of its own.

Byro renders its **own** sign-in screen (the `/auth-preview` design), so Django
drives authentication rather than redirecting to AuthKit's hosted page. The
official `workos` Python SDK does the talking.

**Scope note:** this change is backend-only. `frontend/` is untouched and still
posts to `/api/auth/social/`, which no longer exists — so the frontend is broken
against this backend until the sign-in screen is wired up, and the two must
deploy together. The contract the frontend needs to implement is in §8.

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
| `WORKOS_OAUTH_REDIRECT_URI` | for Google/Apple | Where WorkOS returns the browser after social sign-in. Must match a Redirect URI registered in the dashboard. Defaults to `{FRONTEND_URL}/auth/callback`. Never taken from the request — a client-supplied redirect would be an open redirect. |
| `WORKOS_API_BASE_URL` | no | Defaults to `https://api.workos.com`. Override only for tests. |
| `ADMIN_BOOTSTRAP_EMAILS` | **recommended in prod** | Comma-separated emails allowed to claim the admin panel when its team is empty, and always treated as owners. If unset, the **first person to sign in at `/admin/login` becomes the owner** — fine locally, risky on a public deploy where anyone can create an account. See §9. |

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

Django owns sign-in because the UI is ours. Two routes in, both ending in the
same place:

```
Magic Auth (the email field)
  POST /api/auth/magic/send/    -> WorkOS emails a 6-digit code
  POST /api/auth/magic/verify/  -> redeem it

OAuth (the Google / Apple buttons)
  POST /api/auth/oauth/authorize/ -> {authorization_url}, browser goes there
  POST /api/auth/oauth/callback/  -> exchange the returned code

both then:
  -> upsert CustomUser: workos_id -> email -> create
  -> claim any pending co-host invites
  <- {user, tokens{access, refresh}, is_new_user}

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

No WorkOS SDK is needed on the frontend. Every call below is plain JSON to
Django, and no WorkOS credential is ever exposed to the browser.

### Email sign-in (the email field)

**Step 1 — request a code.**

```
POST /api/auth/magic/send/     {"email": "someone@example.com"}
-> 200 {"success": true, "message": "...", "expires_in": 600}
```

Always 200 for any well-formed address, whether or not an account exists —
that is deliberate, so the endpoint cannot be used to discover who has an
account. Only a malformed address gives 400. Throttled to 15/hour.

**Step 2 — redeem it.** The design needs a second state here for the 6-digit
code; it does not exist in `/auth-preview` yet.

```
POST /api/auth/magic/verify/   {"email": "...", "code": "123456"}
-> 200  (see "session response" below)
-> 401  {"error": "That code is incorrect or has expired.", "code": "invalid_code"}
```

### Google / Apple

```
POST /api/auth/oauth/authorize/  {"provider": "google"}   // or "apple"
-> 200 {"authorization_url": "https://..."}               // send the browser there
```

WorkOS returns the browser to `WORKOS_OAUTH_REDIRECT_URI` (default
`{FRONTEND_URL}/auth/callback`) with `?code=`. Post that code back:

```
POST /api/auth/oauth/callback/   {"code": "..."}
-> 200  (session response)
-> 401  {"error": "...", "code": "invalid_code"}
```

Posting the code rather than letting Django redirect keeps tokens out of URLs
and browser history.

### Session response

Returned identically by `magic/verify/` and `oauth/callback/`:

```jsonc
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
  },
  "tokens": { "access": "eyJ...", "refresh": "..." }
}
```

### Staying signed in

```
POST /api/auth/refresh/   {"refresh_token": "..."}  -> 200 {"tokens": {...}}
                                                    -> 401 session is over
GET  /api/auth/me/                                  -> 200 {"user": {...}}
```

Access tokens are short-lived. On a `401` from any normal endpoint, call
`refresh` once and retry; only if *that* fails should you send the user back to
sign-in. `GET /api/auth/me/` rehydrates the UI after a page reload.

**Every other request.** Send `Authorization: Bearer <access token>`. Nothing
else changed — all existing endpoints, permissions and payloads are the same.

**Also worth knowing:**

- Tokens come back in the JSON body, which means JavaScript can read them.
  That was a deliberate call over httpOnly cookies. Keep the access token in
  memory rather than `localStorage` where you can, and rely on `refresh` — it
  limits how much an XSS can walk away with.
- Guest flows are unchanged and must keep working logged-out: browsing events
  and `POST /api/events/<slug>/register/` are both still `AllowAny`.
- `/api/auth/privy/` and `/api/auth/social/` are **deleted** and now 404.

## 9. Admin panel: sign-in and roles

The admin panel no longer uses a shared password (`ADMIN_SECRET`, the
`admin_token` cookie and `X-Admin-Token` are gone). Admins sign in with WorkOS
like everyone else; whether they may use the panel is decided by our own
`AdminMember` table.

**Sign-in.** `/admin/login` takes an email, passes Turnstile, and Django sends
a WorkOS magic code (`POST /api/admin-auth/send` relays to
`/api/auth/magic/send/`). `POST /api/admin-auth` verifies the code through
`/api/auth/magic/verify/`, then calls `GET /api/admin/me/` with the new access
token. Only if that succeeds are the tokens kept, as httpOnly cookies
(`admin_access`, `admin_refresh`). Someone who signs in fine but isn't on the
team gets "This account doesn't have admin access" and no cookies.

**Requests.** Every `/api/admin/*` Next route goes through `adminProxy`
(`frontend/src/lib/adminProxy.ts`), which sends the access token as a Bearer
header and refreshes once on a 401. Middleware only checks that a cookie
exists; Django verifies the token and the role on every call, so a forged
cookie gets an empty shell and nothing else.

**Identity.** A signed-in user is matched to an `AdminMember` by email (WorkOS
has verified it). There is no separate admin account.

**Roles** (ordered: viewer < admin < owner), enforced by `IsAdminMember` in
`Backend/bryo/permissions.py`:

| Role | Can |
|---|---|
| `viewer` | Read everything: events, users, payments, promos, payouts, audit log. |
| `admin` | Also suspend/reactivate events and users, and process or reject payouts. |
| `owner` | Also delete events and payouts, change user roles, and manage the team. |

Views declare `min_role` and, where a method needs more, `method_roles`. The UI
hides what a role can't do (`useAdminMe`), but the API is what refuses it.
Owners can't demote or remove themselves, so a team always has an owner.

**Bootstrapping.** While `AdminMember` is empty, the first person to reach the
panel becomes an owner. If `ADMIN_BOOTSTRAP_EMAILS` is set, only those emails
can claim that slot, and they stay owners afterwards. **Set it before deploying**,
or someone else may sign in first. After that, owners add people from
`/admin/team`.

**Audit log.** Every moderation, payout, role and team action writes an
`AdminAction` row including `actor_email`. Read it at `/admin/audit-log`,
`GET /api/admin/audit-log/`, or in Django admin (read-only).

**User activity.** Separate from the admin audit log, `ActivityLog` records what
users did: sign-in, event created/edited/deleted, free tickets claimed, tickets
purchased, ticket transfer started/accepted, attendee check-in and payout
requests. Rows are written by `log_activity()` (`Backend/bryo/activity.py`),
which never raises, and keep the actor's email so they survive account
deletion. Guests and webhooks are logged by email. Each row stores the client
IP (from `X-Forwarded-For`), which is personal data: mention it in the privacy
policy. Read it at `/admin/activity` or `GET /api/admin/activity/`. Prune with
`python manage.py prune_activity --days 365` — schedule it (cron or a Render
job) or the table grows without bound.

**Cleanup.** Delete `ADMIN_SECRET` from the backend and frontend environments.

## 10. Known follow-ups

- **`PrivyUser` and the `privy_id` / `external_id` / `auth_provider` columns are
  intentionally still present.** Dropping tables in the same deploy that logs
  everyone out would leave no way to diagnose a mis-linked account. Drop them in
  a follow-up migration once the cutover is verified.
- Set `WORKOS_ISSUER` once confirmed (§4).
- Set `ADMIN_BOOTSTRAP_EMAILS` before the first production deploy of the admin panel (§9).
- **Apple sign-in needs dashboard setup** before the Apple button works: an
  Apple developer account, a Service ID and a signing key configured in WorkOS.
  Google is much simpler. The backend supports both already.
- **Register the redirect URIs** in the WorkOS dashboard —
  `http://localhost:3000/auth/callback` for local work and the production
  equivalent. Social sign-in fails before reaching Django without them.
- `Backend/db.sqlite3` is committed and predates the `SECRET_KEY` rotation.
  Worth removing from the repo separately.
- `BACKEND_AND_AUTH.md` proposes building our own email OTP auth. Superseded.

## 11. Tests

```bash
cd Backend && python manage.py test bryo
```

The suite (91 tests at the time of writing) passes fully offline — they generate an RSA keypair and sign
WorkOS-shaped tokens locally, so the real verification path (signature, issuer,
expiry, required claims) runs without network. Coverage: token verification and
its failure modes, issuer pinning on and off, the authentication class, magic
auth send/verify including enumeration safety, OAuth authorize/callback
including the open-redirect guard, refresh and `me`, account linking on
migration, co-host invite claiming including the unverified-email case, and
send throttling, and admin role enforcement (viewer/admin/owner limits, actor recorded on audit entries, self-demotion guard, first-sign-in bootstrap).
