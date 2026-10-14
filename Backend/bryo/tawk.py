"""
tawk.to webhooks -> SupportRequest rows (Admin > Support > Requests).

tawk.to signs each call with HMAC-SHA1 of the raw body (hex) in X-Tawk-Signature, using the webhook's
secret key, and retries for up to 12 hours on anything but a 2xx. Every handler below is idempotent
(rows are keyed by chat or ticket id), so a retried call changes nothing.
"""
import hashlib
import hmac
import logging

from django.conf import settings

from .models import SupportRequest

logger = logging.getLogger(__name__)


def signature_ok(body: bytes, signature: str) -> bool:
    secret = getattr(settings, 'TAWK_WEBHOOK_SECRET', '')
    if not secret or not signature:
        return False
    expected = hmac.new(secret.encode(), body, hashlib.sha1).hexdigest()
    return hmac.compare_digest(expected, signature.strip().lower())


def _who(t):
    return {'a': 'agent', 'v': 'visitor', 's': 'system'}.get(t, t or 'system')


def _place(visitor):
    return ', '.join(x for x in [visitor.get('city'), visitor.get('country')] if x)[:120]


def handle(payload: dict):
    """Apply one tawk.to event. Returns (request, created) or (None, False) for events we ignore."""
    event = payload.get('event')
    if event in ('chat:start', 'chat:end'):
        visitor = payload.get('visitor') or {}
        req, created = SupportRequest.objects.get_or_create(
            source=SupportRequest.SOURCE_CHAT, external_id=str(payload.get('chatId') or ''),
        )
        if not req.external_id:
            return None, False
        req.name = visitor.get('name') or req.name
        req.email = (visitor.get('email') or req.email or '')[:254]
        req.location = _place(visitor) or req.location
        req.page = (payload.get('referrer') or req.page or '')[:500]
        msg = payload.get('message') or {}
        if event == 'chat:start' and not req.message and (msg.get('sender') or {}).get('type') == 'visitor':
            req.message = (msg.get('text') or '')[:5000]
        req.save()
        return req, created

    if event == 'chat:transcript_created':
        chat = payload.get('chat') or {}
        if not chat.get('id'):
            return None, False
        visitor = chat.get('visitor') or {}
        req, created = SupportRequest.objects.get_or_create(
            source=SupportRequest.SOURCE_CHAT, external_id=str(chat['id']),
        )
        lines = [{
            'who': _who((m.get('sender') or {}).get('t')),
            'name': (m.get('sender') or {}).get('n') or '',
            'text': m.get('msg') or '',
            'time': m.get('time') or '',
            'files': [((a.get('content') or {}).get('file') or {}).get('url') for a in (m.get('attchs') or [])],
        } for m in (chat.get('messages') or [])]
        req.transcript = lines
        req.name = visitor.get('name') or req.name
        req.email = (visitor.get('email') or req.email or '')[:254]
        req.location = _place(visitor) or req.location
        if not req.message:
            first = next((l['text'] for l in lines if l['who'] == 'visitor' and l['text']), '')
            req.message = first[:5000]
        req.save()
        return req, created

    if event == 'ticket:create':
        ticket = payload.get('ticket') or {}
        requester = payload.get('requester') or {}
        if not ticket.get('id'):
            return None, False
        req, created = SupportRequest.objects.get_or_create(
            source=SupportRequest.SOURCE_TICKET, external_id=str(ticket['id']),
        )
        req.reference = str(ticket.get('humanId') or '')[:40]
        req.subject = (ticket.get('subject') or '')[:300]
        req.message = (ticket.get('message') or '')[:5000]
        req.name = requester.get('name') or req.name
        req.email = (requester.get('email') or req.email or '')[:254]
        req.save()
        return req, created

    return None, False
