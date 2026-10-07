"""
Refunds when an event is cancelled.

The rules, which are product decisions, not accidents:

* Buyers cannot ask for refunds. The only time money goes back is when the
  organiser cancels the event.
* A buyer gets back the TICKET PRICE they paid, after any promo discount. They
  do not get back Byro's service fee or the payment processor's charge.
  Both were added on top of the ticket price at checkout, so the refund is
  simply the order's discounted subtotal.
* Paid tickets become 'refunded', free and unpaid ones 'cancelled'. Everything
  that counts sales (capacity, guest list, organiser balance, analytics) only
  counts 'paid' and 'free', so cancelled tickets drop out of all of it with
  no extra bookkeeping.

Cancelling only RECORDS what is owed (Refund rows, status 'awaiting') and tells
everyone. It moves no money: the Paystack balance is Byro's, so a Byro admin
checks it and approves the send (`authorise_refunds`) from the admin panel.
Approved refunds then go out in small batches (one Paystack call per order is
slow): `process_event_refunds` is called repeatedly while the admin has the
screen open, and `manage.py process_refunds` finishes anything left behind.
"""
import logging
from datetime import timedelta
from decimal import Decimal, ROUND_HALF_UP

import requests
from django.conf import settings
from django.db import transaction
from django.db.models import F, Q, Sum
from django.db.models.functions import Coalesce
from django.utils import timezone

from .emails import event_cancelled_email
from .models import Payment, Refund, Ticket
from .pricing import FEE_RATE

logger = logging.getLogger(__name__)

REFUND_BATCH = 10          # orders sent to Paystack per call
NOTICE_BATCH = 25          # cancellation emails (no money) per call
STALE_SUBMITTING = timedelta(minutes=5)
MAX_ATTEMPTS = 5
PAYSTACK_TIMEOUT = 15

# Paystack's refund statuses -> ours
PAYSTACK_STATUS = {
    'pending': Refund.STATUS_PROCESSING,
    'processing': Refund.STATUS_PROCESSING,
    'processed': Refund.STATUS_PROCESSED,
    'failed': Refund.STATUS_FAILED,
    'needs-attention': Refund.STATUS_NEEDS_ATTENTION,
}


class EventCancellationError(Exception):
    """The event cannot be cancelled (already cancelled, a draft, already over)."""


class PaystackRefundError(Exception):
    """Paystack answered, but refused the refund. Not worth retrying as is."""


class PaystackUnavailable(Exception):
    """We could not reach Paystack (timeout, network, 5xx). Safe to try again later."""


# ---------------------------------------------------------------------------
# What is owed
# ---------------------------------------------------------------------------

def refundable_amount(payment):
    """
    The ticket price this order paid, after any promo discount.

    Checkout stores the discounted subtotal on the payment. Older payments
    predate that, so fall back to taking the service fee back off the total:
    the payment amount is subtotal + service fee when the buyer paid the fee,
    and just the subtotal when the organiser absorbed it.
    """
    meta = payment.metadata or {}
    stored = meta.get('subtotal')
    if stored not in (None, ''):
        return Decimal(str(stored)).quantize(Decimal('0.01'))
    if payment.event.pass_fee_to_attendee:
        return (payment.amount / (Decimal('1') + FEE_RATE)).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    return payment.amount.quantize(Decimal('0.01'))


def _paid_orders(event):
    return Payment.objects.filter(event=event, status='successful').select_related('event')


def cancellation_preview(event):
    """What cancelling would do, shown to the organiser before they confirm."""
    paid_tickets = event.tickets.filter(payment_status='paid')
    refund_total = sum(
        (refundable_amount(p) for p in _paid_orders(event).filter(refund__isnull=True)),
        Decimal('0'),
    )
    return {
        'paid_tickets': paid_tickets.count(),
        'free_tickets': event.tickets.filter(payment_status='free').count(),
        'paid_orders': _paid_orders(event).filter(refund__isnull=True).count(),
        'refund_total': refund_total,
    }


# ---------------------------------------------------------------------------
# Cancelling
# ---------------------------------------------------------------------------

def cancel_event(event, reason):
    """
    Cancel `event`: close it to sales, void its tickets, and record the refunds owed.

    Returns the preview numbers for what was cancelled. Nothing is sent to
    Paystack here; see process_event_refunds.
    """
    from .models import Event

    reason = (reason or '').strip()[:500]
    with transaction.atomic():
        locked = Event.objects.select_for_update().get(pk=event.pk)
        if locked.cancelled_at:
            raise EventCancellationError('This event is already cancelled.')
        if locked.is_draft:
            raise EventCancellationError('A draft has no tickets to cancel. Delete it instead.')
        if locked.day < timezone.localdate():
            raise EventCancellationError('This event has already happened, so it can no longer be cancelled.')

        summary = cancellation_preview(locked)

        locked.cancelled_at = timezone.now()
        locked.cancel_reason = reason
        locked.save(update_fields=['cancelled_at', 'cancel_reason', 'updated_at'])

        for payment in _paid_orders(locked).filter(refund__isnull=True):
            Refund.objects.create(payment=payment, event=locked, amount=refundable_amount(payment), currency=payment.currency)

        locked.tickets.filter(payment_status='paid').update(payment_status='refunded')
        locked.tickets.filter(payment_status__in=['free', 'pending', 'failed']).update(payment_status='cancelled')

    event.cancelled_at, event.cancel_reason = locked.cancelled_at, locked.cancel_reason
    return summary


# ---------------------------------------------------------------------------
# Paystack
# ---------------------------------------------------------------------------

def _headers():
    return {
        'Authorization': f'Bearer {settings.PAYSTACK_SECRET_KEY.strip()}',
        'Content-Type': 'application/json',
    }


def _paystack(method, path, **kwargs):
    """One Paystack call. Raises PaystackUnavailable for anything worth retrying."""
    try:
        res = requests.request(
            method, f'{settings.PAYSTACK_API_BASE}{path}',
            headers=_headers(), timeout=PAYSTACK_TIMEOUT, **kwargs,
        )
    except requests.RequestException as e:
        raise PaystackUnavailable(str(e)) from e
    if res.status_code >= 500:
        raise PaystackUnavailable(f'Paystack returned {res.status_code}')
    try:
        body = res.json()
    except ValueError as e:
        raise PaystackUnavailable('Paystack sent an unreadable response') from e
    return res.status_code, body


def find_paystack_refund(reference):
    """
    A refund Paystack already holds for this payment, if any.

    Checked before creating one, so a retry after a timeout adopts the refund
    that did go through instead of sending the money back twice.
    """
    status, body = _paystack('GET', '/refund', params={'reference': reference})
    if status != 200 or not body.get('status'):
        return None
    for item in body.get('data') or []:
        if PAYSTACK_STATUS.get(item.get('status')) != Refund.STATUS_FAILED:
            return item
    return None


def create_paystack_refund(reference, amount, note):
    kobo = int((amount * 100).to_integral_value(rounding=ROUND_HALF_UP))
    status, body = _paystack('POST', '/refund', json={
        'transaction': reference,
        'amount': kobo,
        'currency': 'NGN',
        'customer_note': note,
        'merchant_note': note,
    })
    if status >= 400 or not body.get('status'):
        raise PaystackRefundError(body.get('message') or f'Paystack refused the refund ({status})')
    return body.get('data') or {}


# ---------------------------------------------------------------------------
# Sending
# ---------------------------------------------------------------------------

def _mail(to, mail):
    try:
        from .mailer import send_email
        send_email(to, mail['subject'], mail['html'], mail['text'])
        return True
    except Exception:  # an email problem must never undo or block a refund
        logger.exception('Could not send cancellation email to %s', to)
        return False


def _event_mail(event, name, refund_amount=None, state='arranged'):
    from .views import _event_page_url  # lazy: views imports this module
    return event_cancelled_email(
        name=name,
        event_name=event.name,
        date=event.day.strftime('%A, %B %d, %Y') if event.day else '',
        time=event.time_from.strftime('%I:%M %p').lstrip('0') if event.time_from else '',
        location=event.location,
        reason=event.cancel_reason,
        refund_amount=refund_amount,
        refund_state=state,
        event_url=_event_page_url(event),
    )


def _claim(refund):
    """Take the row for sending. False if someone else has it or it is not due."""
    stale = timezone.now() - STALE_SUBMITTING
    claimed = Refund.objects.filter(pk=refund.pk).filter(
        Q(status=Refund.STATUS_PENDING) | Q(status=Refund.STATUS_SUBMITTING, last_attempt_at__lt=stale)
    ).update(status=Refund.STATUS_SUBMITTING, attempts=F('attempts') + 1, last_attempt_at=timezone.now())
    if claimed:
        refund.refresh_from_db()
    return bool(claimed)


def submit_refund(refund):
    """Send one order's refund to Paystack and record the outcome."""
    if not _claim(refund):
        return refund

    payment = refund.payment
    try:
        data = find_paystack_refund(payment.paystack_reference) or create_paystack_refund(
            payment.paystack_reference, refund.amount,
            f'{refund.event.name} was cancelled',
        )
    except PaystackUnavailable as e:
        # Could not reach Paystack: leave it to be tried again, until we give up.
        refund.status = (
            Refund.STATUS_NEEDS_ATTENTION if refund.attempts >= MAX_ATTEMPTS else Refund.STATUS_PENDING
        )
        refund.failure_reason = str(e)[:500]
        refund.save(update_fields=['status', 'failure_reason', 'updated_at'])
        return refund
    except PaystackRefundError as e:
        refund.status = Refund.STATUS_FAILED
        refund.failure_reason = str(e)[:500]
        refund.save(update_fields=['status', 'failure_reason', 'updated_at'])
        logger.error('Paystack refused refund %s for %s: %s', refund.pk, payment.paystack_reference, e)
        return refund

    refund.status = PAYSTACK_STATUS.get(data.get('status'), Refund.STATUS_PROCESSING)
    refund.paystack_refund_id = str(data.get('id') or '')
    refund.failure_reason = ''
    if refund.status == Refund.STATUS_PROCESSED:
        refund.processed_at = timezone.now()
    refund.save()
    _notify_refund(refund)
    return refund


def _notify_refund(refund):
    """Tell the buyer their refund has gone to Paystack (once)."""
    if refund.status in (Refund.STATUS_AWAITING, Refund.STATUS_PENDING, Refund.STATUS_SUBMITTING,
                         Refund.STATUS_FAILED, Refund.STATUS_NEEDS_ATTENTION):
        return
    if refund.notified_at:
        return
    payment = refund.payment
    if _mail(payment.customer_email, _event_mail(refund.event, payment.customer_name, refund.amount, 'sent')):
        Refund.objects.filter(pk=refund.pk).update(notified_at=timezone.now())


def send_arranged_notice(refund):
    """Tell a buyer the event is cancelled and their refund is being arranged (once)."""
    if refund.arranged_notified_at:
        return
    payment = refund.payment
    if _mail(payment.customer_email, _event_mail(refund.event, payment.customer_name, refund.amount, 'arranged')):
        Refund.objects.filter(pk=refund.pk).update(arranged_notified_at=timezone.now())


def send_cancellation_notices(event, limit=NOTICE_BATCH):
    """
    Tell everyone the event is off, at most `limit` emails per call.

    Buyers hear about their refund. Everyone else (free tickets, tickets that
    were bought for them by someone else) hears about the cancellation only.
    """
    sent = 0
    for refund in event.refunds.filter(arranged_notified_at__isnull=True).select_related('payment', 'event')[:limit]:
        send_arranged_notice(refund)
        sent += 1

    for ticket in event.tickets.filter(
        payment_status__in=['cancelled', 'refunded'], cancellation_notified_at__isnull=True,
    ).select_related('payment')[: max(limit - sent, 0)]:
        payment = ticket.payment
        buyer_already_told = (
            payment is not None
            and Refund.objects.filter(payment=payment).exists()
            and ticket.current_owner_email.strip().lower() == payment.customer_email.strip().lower()
        )
        if not buyer_already_told:
            _mail(ticket.current_owner_email, _event_mail(event, ticket.current_owner_name))
        Ticket.objects.filter(pk=ticket.pk).update(cancellation_notified_at=timezone.now())
        sent += 1
    return sent


def authorise_refunds(event):
    """A Byro admin approves sending: awaiting refunds become pending. Returns how many."""
    return event.refunds.filter(status=Refund.STATUS_AWAITING).update(status=Refund.STATUS_PENDING)


def process_event_refunds(event, refund_limit=REFUND_BATCH, notice_limit=NOTICE_BATCH, retry_failed=False):
    """
    Do one batch of the work a cancellation leaves behind, and report progress.

    Safe to call repeatedly and from several places at once.
    """
    stale = timezone.now() - STALE_SUBMITTING
    due = Q(status=Refund.STATUS_PENDING) | Q(status=Refund.STATUS_SUBMITTING, last_attempt_at__lt=stale)
    if retry_failed:
        due |= Q(status__in=[Refund.STATUS_FAILED, Refund.STATUS_NEEDS_ATTENTION])
        Refund.objects.filter(event=event, status__in=[Refund.STATUS_FAILED, Refund.STATUS_NEEDS_ATTENTION]).update(
            status=Refund.STATUS_PENDING, attempts=0,
        )
    for refund in event.refunds.filter(due).select_related('payment', 'event')[:refund_limit]:
        submit_refund(refund)
    send_cancellation_notices(event, notice_limit)
    return refund_progress(event)


def refund_progress(event):
    """Counts and money by outcome, for the organiser's dashboard."""
    rows = event.refunds.values('status').annotate(n=models_count(), total=Coalesce(Sum('amount'), Decimal('0')))
    by_status = {r['status']: {'count': r['n'], 'amount': r['total']} for r in rows}

    def total(*statuses, key='count'):
        return sum((by_status.get(s, {}).get(key, 0) for s in statuses), 0 if key == 'count' else Decimal('0'))

    waiting_notices = (
        event.tickets.filter(
            payment_status__in=['cancelled', 'refunded'], cancellation_notified_at__isnull=True,
        ).count()
        + event.refunds.filter(arranged_notified_at__isnull=True).count()
    )
    open_states = (Refund.STATUS_PENDING, Refund.STATUS_SUBMITTING)
    return {
        'cancelled_at': event.cancelled_at,
        'reason': event.cancel_reason,
        'total_refunds': total(*[s for s, _ in Refund.STATUS_CHOICES]),
        'total_amount': total(*[s for s, _ in Refund.STATUS_CHOICES], key='amount'),
        'awaiting': total(Refund.STATUS_AWAITING),
        'awaiting_amount': total(Refund.STATUS_AWAITING, key='amount'),
        'waiting': total(*open_states),
        'processing': total(Refund.STATUS_PROCESSING),
        'processed': total(Refund.STATUS_PROCESSED),
        'processed_amount': total(Refund.STATUS_PROCESSED, key='amount'),
        'failed': total(Refund.STATUS_FAILED, Refund.STATUS_NEEDS_ATTENTION),
        'waiting_notices': waiting_notices,
        'done': total(*open_states) == 0 and waiting_notices == 0,
    }


def paystack_balance():
    """Byro's Paystack balance in naira, or None if Paystack cannot be reached."""
    try:
        status, body = _paystack('GET', '/balance')
    except PaystackUnavailable:
        return None
    if status != 200 or not body.get('status'):
        return None
    for row in body.get('data') or []:
        if row.get('currency') == 'NGN':
            return (Decimal(str(row.get('balance', 0))) / 100).quantize(Decimal('0.01'))
    return Decimal('0.00')


def models_count():
    from django.db.models import Count
    return Count('pk')


# ---------------------------------------------------------------------------
# Paystack tells us how a refund ended
# ---------------------------------------------------------------------------

def apply_refund_webhook(event_type, data):
    """Handle refund.pending / .processing / .processed / .failed."""
    reference = data.get('transaction_reference') or (data.get('transaction') or {}).get('reference')
    if not reference:
        return False
    refund = Refund.objects.filter(payment__paystack_reference=reference).select_related('payment', 'event').first()
    if refund is None:
        return False

    new_status = PAYSTACK_STATUS.get(data.get('status') or event_type.split('.', 1)[-1])
    if not new_status or refund.status == Refund.STATUS_PROCESSED:
        return True  # unknown status, or already finished: nothing to change
    refund.status = new_status
    if new_status == Refund.STATUS_PROCESSED:
        refund.processed_at = timezone.now()
        refund.failure_reason = ''
    elif new_status == Refund.STATUS_FAILED:
        refund.failure_reason = (data.get('message') or 'Paystack reported the refund failed')[:500]
    if data.get('id') and not refund.paystack_refund_id:
        refund.paystack_refund_id = str(data['id'])
    refund.save()
    _notify_refund(refund)
    return True
