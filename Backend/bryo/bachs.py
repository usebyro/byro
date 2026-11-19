"""
Bachs (https://docs.bachs.io) — a second payment provider next to Paystack.

Which provider a NEW order uses is settings.PAYMENT_PROVIDER ('paystack' or
'bachs'). Each Payment remembers its own provider, so orders taken before a
switch keep verifying and refunding through the provider that took them.

How a Bachs order works:

1. initialize_payment creates a checkout session (POST /v1/checkout-sessions)
   with our order reference, and sends the buyer to its checkout_url.
2. Bachs redirects the buyer to BACHS_SUCCESS_URL?reference=<ours>&checkout_id=...
   The callback page calls verify/<reference>, exactly as it does for Paystack.
3. Bachs also sends checkout.completed / collection.succeeded webhooks.

Neither the redirect nor the webhook body is trusted on its own: both end in
`fetch_checkout`, which asks Bachs for the session and checks status, amount
and currency before any ticket is issued.

Money: every checkout is created with `customer_bears_fee: true`, so Bachs adds
its own processing fee on top of the amount we send (checked against the sandbox:
a 10,000.00 session charged the buyer 10,150.00 and settled 10,000.00). We send
`total` (ticket plus Byro's fee), so Byro nets exactly `total` whatever method the
buyer picks. Without the flag Bachs deducts its fee from settlement instead, and
Byro would absorb it. The checkout session's `amount` stays what we asked for; the
charge carries `amount_paid` (what the buyer was actually charged) and `fees`.
Amounts are decimal strings in naira ("5250.00"), never kobo.
"""
import hashlib
import hmac
import logging
import time
from decimal import Decimal, InvalidOperation

import requests
from django.conf import settings

logger = logging.getLogger(__name__)

TIMEOUT = 20
SIGNATURE_TOLERANCE = 300  # seconds; Bachs' recommended replay window

# Bachs checkout session states (GET /v1/checkout-sessions/{id})
CHECKOUT_COMPLETED = 'completed'
CHECKOUT_TERMINAL_FAILED = ('expired', 'cancelled')
# payment_status says "succeeded" on GET and "paid" on the webhook; accept both.
PAYMENT_SUCCEEDED = ('succeeded', 'paid')

# Bachs refund states -> ours (filled in lazily to avoid importing models here)
REFUND_STATUS = {
    'processing': 'processing',
    'success': 'processed',
    'failed': 'failed',
}


class BachsUnavailable(Exception):
    """We could not reach Bachs (timeout, network, 5xx, 429). Safe to try again later."""


class BachsError(Exception):
    """Bachs answered, but refused the request. Not worth retrying as is."""

    def __init__(self, message, code='', status=None):
        super().__init__(message)
        self.code = code
        self.status = status


def is_configured():
    return bool((settings.BACHS_SECRET_KEY or '').strip())


def _request(method, path, *, idempotency_key=None, **kwargs):
    headers = {
        'Authorization': f'Bearer {settings.BACHS_SECRET_KEY.strip()}',
        'Accept': 'application/json',
        'Content-Type': 'application/json',
    }
    if idempotency_key:
        headers['Idempotency-Key'] = idempotency_key
    try:
        res = requests.request(
            method, f'{settings.BACHS_API_BASE}{path}', headers=headers, timeout=TIMEOUT, **kwargs,
        )
    except requests.RequestException as e:
        raise BachsUnavailable(str(e)) from e
    if res.status_code >= 500 or res.status_code == 429:
        raise BachsUnavailable(f'Bachs returned {res.status_code}')
    try:
        body = res.json()
    except ValueError as e:
        raise BachsUnavailable('Bachs sent an unreadable response') from e
    if res.status_code >= 400:
        body = body if isinstance(body, dict) else {}
        raise BachsError(
            body.get('message') or body.get('detail') or body.get('error') or f'Bachs refused the request ({res.status_code})',
            code=body.get('error_code') or '', status=res.status_code,
        )
    return body


def _data(body):
    """Some Bachs responses wrap the object in {"data": ...}; accept both shapes."""
    if isinstance(body, dict) and isinstance(body.get('data'), dict) and 'checkout_id' not in body:
        return body['data']
    return body


def money(value):
    """Decimal from a Bachs amount string, or None."""
    try:
        return Decimal(str(value)).quantize(Decimal('0.01'))
    except (InvalidOperation, TypeError, ValueError):
        return None


def amount_string(amount):
    return f'{Decimal(amount).quantize(Decimal("0.01"))}'


# ---------------------------------------------------------------------------
# Checkout
# ---------------------------------------------------------------------------

def create_checkout(*, reference, amount, email, name, success_url, cancel_url, metadata, expires_in_minutes,
                    customer_bears_fee=True):
    """
    POST /v1/checkout-sessions. Returns the session (checkout_id, checkout_url, ...).

    `customer_bears_fee` makes Bachs add its fee on top of `amount` instead of deducting it from
    what Byro settles. It is always sent explicitly so the account-level default never decides it.
    """
    payload = {
        'pricing': {'currency': 'NGN', 'amount': amount_string(amount)},
        'customer': {'email': email, 'name': name},
        'reference': reference,
        'success_url': success_url,
        'cancel_url': cancel_url,
        'metadata': {k: str(v) for k, v in metadata.items() if v is not None},
        'expires_in_minutes': expires_in_minutes,
        'customer_bears_fee': bool(customer_bears_fee),
    }
    methods = [m.strip() for m in (settings.BACHS_PAYMENT_METHODS or '').split(',') if m.strip()]
    if methods:
        payload['payment_method_types'] = methods
    return _data(_request('POST', '/v1/checkout-sessions', json=payload, idempotency_key=f'chk-{reference}'))


def fetch_checkout(checkout_id):
    return _data(_request('GET', f'/v1/checkout-sessions/{checkout_id}'))


def charge_id_of(checkout):
    charge = checkout.get('charge') or {}
    return str(charge.get('payment_id') or charge.get('id') or '')


def channel_of(checkout):
    """Our Payment.channel for the method the buyer used."""
    method = (checkout.get('payment_method') or (checkout.get('charge') or {}).get('payment_method') or '').upper()
    if not method:
        return None
    if 'CARD' in method:
        return 'card'
    if 'BANK_TRANSFER' in method:
        return 'bank_transfer'
    if method.startswith('MOMO') or method == 'MOBILE_MONEY':
        return 'mobile_money'
    if method.startswith('CRYPTO'):
        return 'crypto'
    return None


def charge_money(checkout):
    """(processing fee, amount the buyer was charged) from a completed checkout's charge; None where absent."""
    charge = checkout.get('charge') or {}
    fee = money((charge.get('fees') or {}).get('amount'))
    paid = money(charge.get('amount_paid'))
    return fee, paid


def checkout_outcome(checkout, expected_amount):
    """
    'success', 'failed', 'pending' or 'mismatch' for a checkout session,
    judged against the amount and currency we asked Bachs to charge.
    """
    state = (checkout.get('status') or '').lower()
    pay_state = (checkout.get('payment_status') or '').lower()
    if state == CHECKOUT_COMPLETED and pay_state in PAYMENT_SUCCEEDED:
        amount = money(checkout.get('amount'))
        currency = (checkout.get('currency') or '').upper()
        expected = Decimal(expected_amount).quantize(Decimal('0.01'))
        if amount != expected or currency != 'NGN':
            return 'mismatch'
        # With the fee on top, the buyer pays more than the session amount; never less.
        _, paid = charge_money(checkout)
        if paid is not None and paid < expected:
            return 'mismatch'
        return 'success'
    if state in CHECKOUT_TERMINAL_FAILED or pay_state in ('failed', 'canceled', 'cancelled'):
        return 'failed'
    return 'pending'


# ---------------------------------------------------------------------------
# Webhooks
# ---------------------------------------------------------------------------

def verify_signature(raw_body, headers, secret=None, now=None):
    """
    True if a webhook delivery was signed by Bachs with our endpoint secret.

    Digest: HMAC-SHA256 hex of "{timestamp}.{raw_body}". Prefers
    X-Bachs-Signature-V2 ("t=..,v1=..", may carry several v1 during secret
    rotation) and falls back to X-Bachs-Timestamp + X-Bachs-Signature.
    """
    secret = (secret if secret is not None else settings.BACHS_WEBHOOK_SECRET or '').strip()
    if not secret:
        return False
    timestamp, candidates = None, []
    v2 = headers.get('X-Bachs-Signature-V2')
    if v2:
        for part in v2.split(','):
            key, _, value = part.strip().partition('=')
            if key == 't':
                timestamp = value
            elif key == 'v1' and value:
                candidates.append(value)
    if not candidates:
        timestamp = headers.get('X-Bachs-Timestamp')
        if headers.get('X-Bachs-Signature'):
            candidates.append(headers['X-Bachs-Signature'])
    if not timestamp or not candidates:
        return False
    try:
        ts = int(timestamp)
    except ValueError:
        return False
    if abs((now if now is not None else time.time()) - ts) > SIGNATURE_TOLERANCE:
        return False
    raw = raw_body if isinstance(raw_body, bytes) else raw_body.encode('utf-8')
    expected = hmac.new(secret.encode('utf-8'), f'{ts}.'.encode('utf-8') + raw, hashlib.sha256).hexdigest()
    return any(hmac.compare_digest(expected, c.strip()) for c in candidates)


# ---------------------------------------------------------------------------
# Banks (organiser payout details)
# ---------------------------------------------------------------------------

def list_banks(country='NG'):
    """[{'name', 'code'}] for a two-letter country code."""
    body = _request('GET', '/v1/reference/banks', params={'country': country})
    return [{'name': b.get('name'), 'code': str(b.get('code'))}
            for b in (body or {}).get('banks') or [] if b.get('code')]


def resolve_account(account_number, bank_code, country='NG'):
    """{'resolved', 'account_name', 'account_number', 'message'} for a bank account."""
    return _request('POST', '/v1/misc/bank-accounts/resolve', json={
        'account_number': account_number, 'bank_code': bank_code, 'country': country,
    }) or {}


# ---------------------------------------------------------------------------
# Refunds and balance
# ---------------------------------------------------------------------------

def find_refund(charge_id):
    """A non-failed refund Bachs already holds for this charge, if any."""
    try:
        body = _request('GET', f'/v1/refunds/by-charge/{charge_id}')
    except BachsError as e:
        if e.status == 404:
            return None
        raise
    items = body.get('items') if isinstance(body, dict) and 'items' in body else body
    if isinstance(items, dict):
        items = [_data(items)]
    for item in items or []:
        if isinstance(item, dict) and (item.get('status') or '').lower() != 'failed':
            return item
    return None


def create_refund(*, charge_id, reference, amount, reason):
    return _data(_request('POST', '/v1/refunds', json={
        'charge_id': charge_id,
        'reference': reference,
        'amount': amount_string(amount),
        'reason': (reason or '')[:500],
        'idempotency_key': reference,
    }, idempotency_key=reference))


def ngn_balance():
    """Byro's available NGN balance at Bachs, or None if Bachs cannot be reached."""
    if not is_configured():
        return None
    try:
        body = _request('GET', '/v1/balances')
    except (BachsUnavailable, BachsError):
        return None
    for row in (body or {}).get('balances') or []:
        if (row.get('currency') or '').upper() == 'NGN':
            return money(row.get('available_balance')) or Decimal('0.00')
    return Decimal('0.00')
