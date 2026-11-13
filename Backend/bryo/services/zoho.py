"""
Zoho Campaigns: the role mailing lists (Organisers, Attendees) and the newsletter.

Every public function returns a Result and never raises, so a Zoho outage can't break
signup, onboarding or the newsletter form. With ZOHO_ENABLED off, or any setting missing,
everything is a no-op that logs one warning, so local dev and tests never reach Zoho.

Zoho can answer HTTP 200 with an error in the body, so the body is always read.
Auth is OAuth 2 with a long-lived refresh token; access tokens (about an hour) are cached
in memory and renewed a few minutes early. Tokens and secrets are never logged.
"""
import json
import logging
import threading
import time
from dataclasses import dataclass
from typing import Optional

import requests
from django.conf import settings

logger = logging.getLogger(__name__)

TIMEOUT_SECONDS = 10
MAX_RETRIES = 2            # on top of the first try
REFRESH_MARGIN = 300       # renew the access token this many seconds before it expires
BACKOFF_SECONDS = 0.5      # doubles each retry

LIST_ORGANISERS = 'organisers'
LIST_ATTENDEES = 'attendees'
LIST_NEWSLETTER = 'newsletter'

_ROLE_LISTS = {'organizer': LIST_ORGANISERS, 'attendee': LIST_ATTENDEES}

_lock = threading.Lock()   # one token refresh at a time; the others wait and reuse it
_token = None
_expires_at = 0.0
_warned = False


@dataclass
class Result:
    ok: bool
    error: Optional[str] = None


def _reset():
    """Forget the cached token and the one-time warning (tests)."""
    global _token, _expires_at, _warned
    with _lock:
        _token, _expires_at, _warned = None, 0.0, False


def mask_email(email):
    """a***@domain.com, for logs."""
    local, _, domain = (email or '').partition('@')
    return f"{local[:1]}***@{domain}" if domain else '***'


def _setting(name, default=''):
    return (getattr(settings, name, default) or default)


def _list_key(name):
    return _setting({
        LIST_ORGANISERS: 'ZOHO_LISTKEY_ORGANISERS',
        LIST_ATTENDEES: 'ZOHO_LISTKEY_ATTENDEES',
        LIST_NEWSLETTER: 'ZOHO_LISTKEY_NEWSLETTER',
    }[name])


def is_enabled():
    """True when switched on and fully configured. Logs a single warning otherwise."""
    global _warned
    if getattr(settings, 'ZOHO_ENABLED', False):
        required = ('ZOHO_CLIENT_ID', 'ZOHO_CLIENT_SECRET', 'ZOHO_REFRESH_TOKEN',
                    'ZOHO_LISTKEY_ORGANISERS', 'ZOHO_LISTKEY_ATTENDEES', 'ZOHO_LISTKEY_NEWSLETTER')
        missing = [k for k in required if not _setting(k)]
        if not missing:
            return True
        reason = f"missing {', '.join(missing)}"
    else:
        reason = 'ZOHO_ENABLED is off'
    if not _warned:
        _warned = True
        logger.warning("Zoho Campaigns is disabled (%s); contacts will not be synced", reason)
    return False


def get_access_token(force=False):
    """A valid access token, cached. Raises RuntimeError when Zoho refuses to issue one."""
    global _token, _expires_at
    with _lock:
        if not force and _token and time.time() < _expires_at - REFRESH_MARGIN:
            return _token
        resp = requests.post(
            f"{_setting('ZOHO_ACCOUNTS_URL', 'https://accounts.zoho.com').rstrip('/')}/oauth/v2/token",
            data={
                'refresh_token': _setting('ZOHO_REFRESH_TOKEN'),
                'client_id': _setting('ZOHO_CLIENT_ID'),
                'client_secret': _setting('ZOHO_CLIENT_SECRET'),
                'grant_type': 'refresh_token',
            },
            timeout=TIMEOUT_SECONDS,
        )
        body = _json(resp)
        token = body.get('access_token')
        if resp.status_code != 200 or not token:
            _token = None
            # Zoho's error name only (for example invalid_code), never the request or any token.
            raise RuntimeError(f"Zoho token refresh failed ({resp.status_code}: {body.get('error', 'unknown')})")
        _token = token
        _expires_at = time.time() + int(body.get('expires_in') or 3600)
        return _token


def _clear_token():
    global _token, _expires_at
    with _lock:
        _token, _expires_at = None, 0.0


def _json(resp):
    try:
        data = resp.json()
        return data if isinstance(data, dict) else {}
    except ValueError:
        return {}


def _body_error(body):
    """Zoho's error text if the body says it failed, else None."""
    status = str(body.get('status', '')).lower()
    if status == 'success':
        return None
    code = str(body.get('code', body.get('Code', '')))
    if status == 'error' or (code and code != '0'):
        return str(body.get('message') or body.get('Message') or f"code {code or 'unknown'}")[:200]
    return None


def _is_auth_error(http_status, body):
    if http_status == 401:
        return True
    text = f"{body.get('message', '')} {body.get('Message', '')}".lower()
    return ('invalid' in text or 'expired' in text) and ('token' in text or 'oauth' in text)


def _post(action, list_name, contact):
    """listsubscribe / listunsubscribe with retries. Returns a Result."""
    refreshed = False
    last_error = 'unknown error'
    for attempt in range(MAX_RETRIES + 1):
        try:
            resp = requests.post(
                f"{_setting('ZOHO_CAMPAIGNS_URL', 'https://campaigns.zoho.com').rstrip('/')}/api/v1.1/json/{action}",
                headers={'Authorization': f"Zoho-oauthtoken {get_access_token()}"},
                data={
                    'resfmt': 'JSON',
                    'listkey': _list_key(list_name),
                    'contactinfo': json.dumps(contact),
                    'source': 'byro-app',
                },
                timeout=TIMEOUT_SECONDS,
            )
        except (requests.RequestException, RuntimeError) as exc:
            last_error = exc.__class__.__name__ if isinstance(exc, requests.RequestException) else str(exc)
        else:
            body = _json(resp)
            if _is_auth_error(resp.status_code, body) and not refreshed:
                refreshed = True
                _clear_token()
                continue  # one renewed token, then straight back round
            if resp.status_code == 429 or resp.status_code >= 500:
                last_error = f"HTTP {resp.status_code}"
            else:
                error = _body_error(body)
                if resp.status_code >= 400 and not error:
                    error = f"HTTP {resp.status_code}"
                # Adding someone who is already on the list is a success.
                if error and action == 'listsubscribe' and 'already' in error.lower():
                    error = None
                return Result(False, error) if error else Result(True)
        if attempt < MAX_RETRIES:
            time.sleep(BACKOFF_SECONDS * (2 ** attempt))
    return Result(False, last_error)


def _contact(email, first_name='', last_name=''):
    info = {'Contact Email': (email or '').strip().lower()}
    if first_name:
        info['First Name'] = first_name
    if last_name:
        info['Last Name'] = last_name
    return info


def _run(action, list_name, email, first_name='', last_name=''):
    if not is_enabled():
        return Result(False, 'disabled')
    try:
        result = _post(action, list_name, _contact(email, first_name, last_name))
    except Exception as exc:  # never let Zoho reach a caller
        result = Result(False, exc.__class__.__name__)
    if not result.ok:
        logger.error("Zoho %s failed for list=%s email=%s: %s", action, list_name, mask_email(email), result.error)
    return result


def subscribe(list_name, email, first_name='', last_name=''):
    return _run('listsubscribe', list_name, email, first_name, last_name)


def unsubscribe(list_name, email):
    return _run('listunsubscribe', list_name, email)


def list_for_role(role):
    return _ROLE_LISTS.get(role or '')


def _names(user):
    profile = getattr(user, 'profile', None)
    full = (getattr(profile, 'display_name', '') or '').strip()
    if full:
        first, _, last = full.partition(' ')
        return first[:100], last.strip()[:100]
    return (user.first_name or '')[:100], (user.last_name or '')[:100]


def syncable(user):
    """Real accounts only: not deleted, not a guest checkout, has an address."""
    from .. import accounts
    return bool(
        user and user.email and user.is_active
        and not user.email.endswith(accounts.DELETED_DOMAIN)
        and user.auth_provider != 'guest'
    )


def add_user_by_role(user, role=None):
    """Put a person on the list for their role. No role yet means nothing to do."""
    if not syncable(user):
        return Result(False, 'not syncable')
    if role is None:
        role = getattr(getattr(user, 'profile', None), 'role', '')
    list_name = list_for_role(role)
    if not list_name:
        return Result(False, 'no role')
    first, last = _names(user)
    return subscribe(list_name, user.email, first, last)


def move_role(user, old_role, new_role):
    """Role changed: leave the old list, join the new one."""
    if not syncable(user):
        return Result(False, 'not syncable')
    old_list, new_list = list_for_role(old_role), list_for_role(new_role)
    if old_list and old_list != new_list:
        unsubscribe(old_list, user.email)
    return add_user_by_role(user, new_role) if new_list else Result(True)


def set_newsletter(user, subscribed):
    if not syncable(user):
        return Result(False, 'not syncable')
    if subscribed:
        first, last = _names(user)
        return subscribe(LIST_NEWSLETTER, user.email, first, last)
    return unsubscribe(LIST_NEWSLETTER, user.email)


def run_in_background(fn, *args):
    """Off the request, so a slow Zoho never slows (or fails) a signup."""
    from django.db import connection

    def run():
        try:
            fn(*args)
        except Exception:
            logger.exception("Zoho background sync failed")
        finally:
            connection.close()

    threading.Thread(target=run, daemon=True).start()
