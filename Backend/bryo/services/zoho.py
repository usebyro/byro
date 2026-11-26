"""
Zoho Campaigns: the role mailing lists (Organisers, Attendees), guests who agreed to marketing (on the Attendees list, tagged) and the newsletter.

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
EVENT_GUEST_TAG = 'guest'

_ROLE_LISTS = {'organizer': LIST_ORGANISERS, 'attendee': LIST_ATTENDEES}

_lock = threading.Lock()   # one token refresh at a time; the others wait and reuse it
_token = None
_expires_at = 0.0
_warned = False
_warned_guests = False


@dataclass
class Result:
    ok: bool
    error: Optional[str] = None


def _reset():
    """Forget the cached token and the one-time warning (tests)."""
    global _token, _expires_at, _warned, _warned_guests
    with _lock:
        _token, _expires_at, _warned, _warned_guests = None, 0.0, False, False


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


UNSUBSCRIBED = 'unsubscribed'


def _is_unsubscribed(error):
    """Zoho refusing someone who opted out earlier. The docs list no code for it, so go by the words."""
    text = (error or '').lower()
    return any(w in text for w in ('unsubscrib', 'suppress', 'blocked', 'do not mail', 'opted out'))


def _post(action, list_name, contact, guest=False):
    """listsubscribe / listunsubscribe with retries. Returns a Result."""
    refreshed = False
    last_error = 'unknown error'
    for attempt in range(MAX_RETRIES + 1):
        try:
            payload = {
                'resfmt': 'JSON',
                'listkey': _list_key(list_name),
                'contactinfo': json.dumps(contact),
                'source': 'byro-app',
            }
            topic_id = _setting('ZOHO_MARKETING_TOPIC_ID')
            if action == 'listsubscribe' and topic_id:
                # Required when topic management is on; without it Zoho skips the contact in workflows.
                payload['topic_id'] = topic_id
            resp = requests.post(
                f"{_setting('ZOHO_CAMPAIGNS_URL', 'https://campaigns.zoho.com').rstrip('/')}/api/v1.1/json/{action}",
                headers={'Authorization': f"Zoho-oauthtoken {get_access_token()}"},
                data=payload,
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
                if error and action == 'listsubscribe' and ('already' in error.lower() or 'exists in this list' in error.lower()):
                    error = None
                if error:
                    # The body has no tokens or contact details, only Zoho's code and message.
                    refused = guest and _is_unsubscribed(error)
                    logger.log(logging.INFO if refused else logging.ERROR,
                               "Zoho %s answered HTTP %s: %s", action, resp.status_code, json.dumps(body)[:500])
                    if refused:
                        return Result(False, UNSUBSCRIBED)
                return Result(False, error) if error else Result(True)
        if attempt < MAX_RETRIES:
            time.sleep(BACKOFF_SECONDS * (2 ** attempt))
    return Result(False, last_error)


def _contact(email, first_name='', last_name='', extra=None):
    info = {'Contact Email': (email or '').strip().lower()}
    if extra:
        info.update(extra)
    if first_name:
        info['First Name'] = first_name
    if last_name:
        info['Last Name'] = last_name
    return info


def _run(action, list_name, email, first_name='', last_name='', extra=None, guest=False):
    if not is_enabled():
        return Result(False, 'disabled')
    try:
        result = _post(action, list_name, _contact(email, first_name, last_name, extra), guest=guest)
    except Exception as exc:  # never let Zoho reach a caller
        result = Result(False, exc.__class__.__name__)
    if not result.ok and result.error != UNSUBSCRIBED:
        logger.error("Zoho %s failed for list=%s email=%s: %s", action, list_name, mask_email(email), result.error)
    return result


def subscribe(list_name, email, first_name='', last_name='', extra=None, guest=False):
    return _run('listsubscribe', list_name, email, first_name, last_name, extra, guest=guest)


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


def add_user_by_role(user, role=None, extra=None):
    """Put a person on the list for their role. No role yet means nothing to do."""
    if not syncable(user):
        return Result(False, 'not syncable')
    if role is None:
        role = getattr(getattr(user, 'profile', None), 'role', '')
    list_name = list_for_role(role)
    if not list_name:
        return Result(False, 'no role')
    first, last = _names(user)
    return subscribe(list_name, user.email, first, last, extra)


def _split_name(full):
    first, _, last = (full or '').strip().partition(' ')
    return first.strip()[:100], last.strip()[:100]


def _tag_get(path, **params):
    """GET one of the tag endpoints. Returns (ok, error code or None). Never raises."""
    try:
        resp = requests.get(
            f"{_setting('ZOHO_CAMPAIGNS_URL', 'https://campaigns.zoho.com').rstrip('/')}/api/v1.1/{path}",
            headers={'Authorization': f"Zoho-oauthtoken {get_access_token()}"},
            params={'resfmt': 'JSON', **params},
            timeout=TIMEOUT_SECONDS,
        )
        body = _json(resp)
        if resp.status_code == 200 and str(body.get('code')) == '0':
            return True, None
        logger.warning("Zoho %s answered HTTP %s: %s", path, resp.status_code, json.dumps(body)[:500])
        return False, str(body.get('code') or resp.status_code)
    except Exception as exc:
        logger.warning("Zoho %s failed: %s", path, exc.__class__.__name__)
        return False, exc.__class__.__name__


def tag_contact(email, tag=EVENT_GUEST_TAG):
    """Put a tag on a contact (GET /tag/associate). The tag has to exist, so if Zoho says
    'Tag not found' (9001) make it (GET /tag/add) and try once more. Never raises."""
    email = (email or '').strip().lower()
    ok, code = _tag_get('tag/associate', tagName=tag, lead_email=email)
    if not ok and code == '9001':
        made, made_code = _tag_get('tag/add', tagName=tag)
        if made or made_code == '9000':  # 9000: someone made it first
            ok, code = _tag_get('tag/associate', tagName=tag, lead_email=email)
    return Result(ok, None if ok else f"tag failed: {code}")


def _guest_sync_not_configured():
    """Guests need the Attendees list and the Marketing topic (without a topic Zoho skips the
    contact). One warning, then quiet."""
    global _warned_guests
    missing = [k for k in ('ZOHO_LISTKEY_ATTENDEES', 'ZOHO_MARKETING_TOPIC_ID') if not _setting(k)]
    if not missing:
        return False
    if not _warned_guests:
        _warned_guests = True
        logger.warning("Event guests will not be synced to Zoho: %s is not set", ', '.join(missing))
    return True


def sync_event_guest_to_zoho(user_id, ticket_ids=()):
    """
    A guest who ticked the marketing box joins the Attendees list (with the Marketing topic)
    and gets the tag "guest". Only Contact Email, First Name and Last Name are sent.
    Only ever called for consented guests. Never raises, never retries someone who unsubscribed.
    Once settled the tickets are stamped, so a backfill skips them.
    """
    try:
        if not is_enabled() or _guest_sync_not_configured():
            return Result(False, 'disabled')
        from django.contrib.auth import get_user_model
        from django.utils import timezone
        from ..models import Ticket
        user = get_user_model().objects.filter(pk=user_id).first()  # fresh, so the checkout name is there
        if not user or not user.email or not user.is_active:
            return Result(False, 'no guest')
        profile = getattr(user, 'profile', None)
        first, last = _split_name(getattr(profile, 'display_name', '') or '')
        result = subscribe(LIST_ATTENDEES, user.email, first, last, guest=True)
        domain = user.email.rpartition('@')[2]
        if result.ok:
            logger.info("Zoho event guest synced (email domain %s)", domain)
            tag = tag_contact(user.email)
            if not tag.ok:
                logger.warning("Zoho event guest tag not applied (email domain %s): %s", domain, tag.error)
            if ticket_ids:
                Ticket.objects.filter(pk__in=list(ticket_ids)).update(zoho_synced_at=timezone.now())
        elif result.error == UNSUBSCRIBED:
            logger.info("Zoho event guest not added, previously unsubscribed (email domain %s)", domain)
            if ticket_ids:  # settled: don't offer them to a backfill again
                Ticket.objects.filter(pk__in=list(ticket_ids)).update(zoho_synced_at=timezone.now())
        return result
    except Exception as exc:
        logger.error("Zoho event guest sync failed: %s", exc.__class__.__name__)
        return Result(False, exc.__class__.__name__)


def sync_event_guest_after_commit(user_id, ticket_ids):
    from django.db import transaction
    ids = list(ticket_ids)
    transaction.on_commit(lambda: run_in_background(sync_event_guest_to_zoho, user_id, ids))


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


def event_public_url(event):
    """The link an attendee opens: the app's own public event page."""
    from ..views import _event_page_url
    return _event_page_url(event)


def first_event_fields(event):
    """What Zoho learns when an organiser's first event goes live."""
    return {'Has Published Event': 'Yes', 'Event URL': event_public_url(event)}


def is_first_published_event(event):
    """True when this is the owner's only live (published, not draft) event."""
    from ..models import Event
    if not event.owner_id or event.is_draft or not event.is_active:
        return False
    return not Event.objects.filter(owner_id=event.owner_id, is_active=True, is_draft=False).exclude(pk=event.pk).exists()


def sync_first_event(event):
    """
    Called after an event goes live. Only the owner's first one sends anything, in a single
    Organisers-list call, so later events never overwrite Event URL. Never raises.
    """
    try:
        if not is_first_published_event(event):
            return Result(False, 'not first')
        fields = first_event_fields(event)
        return add_user_by_role(event.owner, 'organizer', extra=fields)
    except Exception as exc:
        logger.error("Zoho first-event sync failed: %s", exc.__class__.__name__)
        return Result(False, exc.__class__.__name__)


def sync_first_event_after_commit(event):
    from django.db import transaction
    transaction.on_commit(lambda: run_in_background(sync_first_event, event))


def list_topics():
    """[(id, name)] of the account's topics, for finding ZOHO_MARKETING_TOPIC_ID. Raises on failure."""
    resp = requests.get(
        f"{_setting('ZOHO_CAMPAIGNS_URL', 'https://campaigns.zoho.com').rstrip('/')}/api/v1.1/topics",
        headers={'Authorization': f"Zoho-oauthtoken {get_access_token()}"},
        params={'details': json.dumps({'from_index': 0, 'range': 100})},
        timeout=TIMEOUT_SECONDS,
    )
    body = _json(resp)
    if resp.status_code != 200 or 'topicDetails' not in body:
        raise RuntimeError(f"Zoho topics call failed (HTTP {resp.status_code}): {json.dumps(body)[:300]}")
    return [(str(t.get('topicId')), t.get('topicName')) for t in body['topicDetails']]


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
