"""
Tests for the Paystack payment path: fee math, verification, webhooks and
the duplicate-ticket race fix.

These run entirely offline — every outbound Paystack call is patched, and
webhook signatures are computed locally with the overridden test secret.
"""

import datetime
import hashlib
import hmac
import json
import threading
import time
from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.db import connection, transaction
from django.test import TestCase, TransactionTestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from . import views
from .models import Event, Payment, PromoCode, Ticket, TicketTier
from .pricing import calculate_ticket_fees
from .views import _fulfil_payment

User = get_user_model()

TEST_SECRET = 'sk_test_1234567890abcdef'
PAYMENT_SETTINGS = dict(PAYSTACK_SECRET_KEY=TEST_SECRET)

INITIALIZE_URL = '/api/payments/initialize/'
WEBHOOK_URL = '/api/payments/webhook/'


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def make_event(owner, **kw):
    """Event has several non-null columns; keep the required set in one place."""
    kw.setdefault('slug', None)
    return Event.objects.create(
        name=kw.pop('name', 'Test Event'),
        owner=owner,
        day=timezone.now().date() + datetime.timedelta(days=7),
        time_from=datetime.time(18, 0),
        time_to=datetime.time(21, 0),
        location='Lagos',
        description='A test event.',
        **kw,
    )


def make_payment(event, *, reference='EVT-test-00000000-abcdef12',
                 amount='5250.00', seats=2, **kw):
    """A pending payment for `seats` attendee slots, as initialize_payment stores it."""
    attendees = [
        {'name': f'Attendee {i + 1}', 'email': f'attendee{i + 1}@example.com'}
        for i in range(seats)
    ]
    metadata = {
        'quantity': seats,
        'seats': seats,
        'attendees': attendees,
        'user_id': None,
    }
    metadata.update(kw.pop('metadata', {}))
    return Payment.objects.create(
        event=event,
        customer_email='buyer@example.com',
        customer_name='Buyer One',
        amount=Decimal(amount),
        paystack_reference=reference,
        status='pending',
        metadata=metadata,
        **kw,
    )


def make_promo(event, code='SAVE10', **kw):
    return PromoCode.objects.create(
        event=event, code=code, amount=Decimal('100'), **kw,
    )


class FakeResponse:
    """Stand-in for requests.Response (status_code + .json() only)."""

    def __init__(self, payload, status_code=200):
        self.status_code = status_code
        self._payload = payload

    def json(self):
        return self._payload


def verify_payload(amount_kobo, txn_status='success', channel='card'):
    return FakeResponse({
        'status': True,
        'data': {'status': txn_status, 'amount': amount_kobo, 'channel': channel},
    })


def webhook_body(reference, amount_kobo, event_type='charge.success'):
    return json.dumps({
        'event': event_type,
        'data': {'reference': reference, 'amount': amount_kobo, 'channel': 'card'},
    })


def sign(body, secret=TEST_SECRET):
    raw = body.encode('utf-8') if isinstance(body, str) else body
    return hmac.new(secret.encode('utf-8'), raw, hashlib.sha512).hexdigest()


class PaymentTestBase(TestCase):
    """Shared setup: an event, a pending payment, and all side effects silenced."""

    def setUp(self):
        self.client = APIClient()

        # Silence every external side effect the fulfilment path can trigger.
        self.ticket_email = patch('bryo.views.send_ticket_confirmation_email').start()
        self.addCleanup(patch.stopall)
        patch('bryo.mailer.send_email').start()
        patch('bryo.apps.posthog_client', None).start()

        self.owner = User.objects.create_user(email='owner@example.com')
        self.event = make_event(self.owner, ticket_price=Decimal('5000.00'), capacity=100)

    def fulfilment_callbacks(self):
        """Wrap a request so transaction.on_commit hooks (emails) actually run."""
        return self.captureOnCommitCallbacks(execute=True)


# ---------------------------------------------------------------------------
# Fee math — mirrors Backend/bryo/pricing.py
# ---------------------------------------------------------------------------

class TicketFeeMathTests(TestCase):

    def test_standard_fee_breakdown(self):
        """5,000 ticket: 5% service fee, then the simulated Paystack cut on top."""
        fees = calculate_ticket_fees(5000)
        self.assertEqual(fees['subtotal'], Decimal('5000'))
        self.assertEqual(fees['service_fee'], Decimal('250'))
        self.assertEqual(fees['total'], Decimal('5250'))
        self.assertEqual(fees['paystack_fee'], Decimal('181.47'))
        self.assertEqual(fees['display_total'], Decimal('5431.47'))

    def test_organizer_absorbs_the_service_fee(self):
        """Fee still reported for the payout deduction, but not charged to the buyer."""
        fees = calculate_ticket_fees(5000, pass_fee_to_attendee=False)
        self.assertEqual(fees['service_fee'], Decimal('250'))
        self.assertEqual(fees['total'], Decimal('5000'))
        self.assertEqual(fees['paystack_fee'], Decimal('177.66'))
        self.assertEqual(fees['display_total'], Decimal('5177.66'))

    def test_zero_subtotal_is_all_zeroes(self):
        fees = calculate_ticket_fees(0)
        self.assertEqual(
            fees,
            {
                'subtotal': Decimal('0'),
                'service_fee': Decimal('0'),
                'total': Decimal('0'),
                'paystack_fee': Decimal('0'),
                'display_total': Decimal('0'),
            },
        )

    def test_paystack_fee_is_capped_at_2000(self):
        fees = calculate_ticket_fees(1000000)
        self.assertEqual(fees['service_fee'], Decimal('50000'))
        self.assertEqual(fees['total'], Decimal('1050000'))
        self.assertEqual(fees['paystack_fee'], Decimal('2000'))
        self.assertEqual(fees['display_total'], Decimal('1052000'))


# ---------------------------------------------------------------------------
# initialize_payment — reference uniqueness
# ---------------------------------------------------------------------------

@override_settings(**PAYMENT_SETTINGS)
class InitializePaymentTests(PaymentTestBase):

    def _initialize(self):
        turnstile = patch('bryo.views.check_and_remember_verification', return_value=True)
        paystack = patch('bryo.views.requests.post', return_value=FakeResponse({
            'status': True,
            'data': {
                'authorization_url': 'https://checkout.paystack.com/abc',
                'access_code': 'abc',
            },
        }))
        with turnstile, paystack:
            return self.client.post(INITIALIZE_URL, {
                'event_slug': self.event.slug,
                'customer_email': 'buyer@example.com',
                'customer_name': 'Buyer One',
                'quantity': 1,
            }, format='json')

    def test_two_initializes_in_the_same_second_get_different_references(self):
        first = self._initialize()
        second = self._initialize()

        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 200)
        ref_a = first.json()['data']['reference']
        ref_b = second.json()['data']['reference']
        self.assertNotEqual(ref_a, ref_b)
        self.assertTrue(ref_a.startswith(f'EVT-{self.event.slug}-'))
        self.assertTrue(ref_b.startswith(f'EVT-{self.event.slug}-'))

        self.assertEqual(
            set(Payment.objects.values_list('paystack_reference', flat=True)),
            {ref_a, ref_b},
        )


# ---------------------------------------------------------------------------
# initialize_payment — seats are reserved before Paystack is called
# ---------------------------------------------------------------------------

PAYSTACK_OK = {'status': True, 'data': {'authorization_url': 'https://checkout.paystack.com/abc', 'access_code': 'abc'}}


@override_settings(**PAYMENT_SETTINGS)
class SeatReservationTests(PaymentTestBase):
    """The last seat must be held while the first buyer is still at Paystack."""

    def setUp(self):
        super().setUp()
        self.event = make_event(self.owner, ticket_price=Decimal('5000.00'), capacity=1)

    def _initialize(self, email='buyer@example.com'):
        with patch('bryo.views.check_and_remember_verification', return_value=True):
            return self.client.post(INITIALIZE_URL, {
                'event_slug': self.event.slug, 'customer_email': email,
                'customer_name': 'Buyer', 'quantity': 1,
            }, format='json')

    def test_seat_is_held_while_the_first_buyer_is_still_at_paystack(self):
        seen = {}

        def paystack_call(*args, **kwargs):
            # The first buyer's request is "in flight" at Paystack right now.
            if 'second' not in seen:
                seen['pending_during_call'] = Payment.objects.filter(
                    event=self.event, status='pending').count()
                seen['second'] = self._initialize('second@example.com')
            return FakeResponse(PAYSTACK_OK)

        with patch('bryo.views.requests.post', side_effect=paystack_call):
            first = self._initialize('first@example.com')

        self.assertEqual(first.status_code, 200)
        self.assertEqual(seen['pending_during_call'], 1, "the seat must already be reserved")
        self.assertEqual(seen['second'].status_code, 400, "second buyer must be turned away")
        self.assertEqual(Payment.objects.filter(event=self.event).count(), 1)

    def test_paystack_details_are_stored_on_the_reserved_payment(self):
        with patch('bryo.views.requests.post', return_value=FakeResponse(PAYSTACK_OK)):
            r = self._initialize()
        self.assertEqual(r.status_code, 200)
        payment = Payment.objects.get(event=self.event)
        self.assertEqual(payment.status, 'pending')
        self.assertEqual(payment.paystack_access_code, 'abc')
        self.assertEqual(payment.paystack_authorization_url, 'https://checkout.paystack.com/abc')
        self.assertEqual(payment.paystack_reference, r.json()['data']['reference'])

    def test_seat_is_released_when_paystack_refuses_the_order(self):
        refused = FakeResponse({'status': False, 'message': 'Invalid key'}, status_code=400)
        with patch('bryo.views.requests.post', return_value=refused):
            first = self._initialize('first@example.com')
        self.assertEqual(first.status_code, 400)
        self.assertEqual(Payment.objects.get(event=self.event).status, 'failed')

        with patch('bryo.views.requests.post', return_value=FakeResponse(PAYSTACK_OK)):
            second = self._initialize('second@example.com')
        self.assertEqual(second.status_code, 200, "the seat should be free again")

    def test_seat_is_released_when_paystack_is_unreachable(self):
        import requests as _requests

        with patch('bryo.views.requests.post', side_effect=_requests.exceptions.ConnectionError('down')):
            first = self._initialize('first@example.com')
        self.assertEqual(first.status_code, 503)
        self.assertEqual(Payment.objects.get(event=self.event).status, 'failed')

        with patch('bryo.views.requests.post', return_value=FakeResponse(PAYSTACK_OK)):
            self.assertEqual(self._initialize('second@example.com').status_code, 200)


# ---------------------------------------------------------------------------
# verify + webhook — idempotent fulfilment
# ---------------------------------------------------------------------------

@override_settings(**PAYMENT_SETTINGS)
class PaymentFulfilmentTests(PaymentTestBase):

    def setUp(self):
        super().setUp()
        self.payment = make_payment(self.event)
        self.reference = self.payment.paystack_reference
        self.amount_kobo = int(self.payment.amount * 100)

    def verify(self, txn_status='success', amount_kobo=None):
        payload = verify_payload(
            self.amount_kobo if amount_kobo is None else amount_kobo, txn_status,
        )
        with patch('bryo.views.requests.get', return_value=payload):
            with self.fulfilment_callbacks():
                return self.client.get(f'/api/payments/verify/{self.reference}/')

    def webhook(self, *, signature=None, amount_kobo=None, secret=TEST_SECRET):
        body = webhook_body(
            self.reference, self.amount_kobo if amount_kobo is None else amount_kobo,
        )
        headers = {'HTTP_X_PAYSTACK_SIGNATURE': signature or sign(body, secret)}
        with self.fulfilment_callbacks():
            return self.client.post(WEBHOOK_URL, body,
                                    content_type='application/json', **headers)

    # -- happy path, both orders ------------------------------------------

    def test_verify_then_webhook_fulfils_exactly_once(self):
        res = self.verify()
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()['payment']['status'], 'successful')
        self.assertEqual(Ticket.objects.count(), 2)
        self.assertEqual(self.ticket_email.call_count, 2)

        res = self.webhook()
        self.assertEqual(res.status_code, 200)

        self.payment.refresh_from_db()
        self.assertEqual(self.payment.status, 'successful')
        self.assertEqual(Ticket.objects.count(), 2, 'webhook must not duplicate tickets')
        self.assertEqual(self.ticket_email.call_count, 2, 'no second round of emails')

    def test_webhook_then_verify_fulfils_exactly_once(self):
        res = self.webhook()
        self.assertEqual(res.status_code, 200)
        self.assertEqual(Ticket.objects.count(), 2)
        self.assertEqual(self.ticket_email.call_count, 2)

        res = self.verify()
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.json()['tickets']), 2)

        self.payment.refresh_from_db()
        self.assertEqual(self.payment.status, 'successful')
        self.assertEqual(Ticket.objects.count(), 2, 'verify must not duplicate tickets')
        self.assertEqual(self.ticket_email.call_count, 2, 'no second round of emails')

    def test_verify_twice_fulfils_exactly_once(self):
        self.verify()
        res = self.verify()
        self.assertEqual(res.status_code, 200)
        self.assertEqual(Ticket.objects.count(), 2)
        self.assertEqual(self.ticket_email.call_count, 2)

    def test_promo_code_redeemed_exactly_once(self):
        promo = make_promo(self.event)
        self.payment.promo_code = promo
        self.payment.save(update_fields=['promo_code'])

        self.verify()
        self.webhook()

        promo.refresh_from_db()
        self.assertEqual(promo.redeemed_count, 1)

    # -- rejection paths ---------------------------------------------------

    def test_webhook_with_bad_signature_is_rejected(self):
        res = self.webhook(signature='f' * 128)
        self.assertEqual(res.status_code, 400)
        self.payment.refresh_from_db()
        self.assertEqual(self.payment.status, 'pending')
        self.assertEqual(Ticket.objects.count(), 0)

    def test_webhook_with_missing_signature_is_rejected(self):
        body = webhook_body(self.reference, self.amount_kobo)
        res = self.client.post(WEBHOOK_URL, body, content_type='application/json')
        self.assertEqual(res.status_code, 400)
        self.assertEqual(Ticket.objects.count(), 0)

    def test_webhook_signed_with_the_wrong_secret_is_rejected(self):
        res = self.webhook(secret='sk_test_wrong')
        self.assertEqual(res.status_code, 400)
        self.assertEqual(Ticket.objects.count(), 0)

    def test_verify_amount_mismatch_is_not_fulfilled(self):
        res = self.verify(amount_kobo=self.amount_kobo + 10000)
        self.assertEqual(res.status_code, 400)
        self.payment.refresh_from_db()
        self.assertEqual(self.payment.status, 'pending')
        self.assertEqual(Ticket.objects.count(), 0)
        self.assertEqual(self.ticket_email.call_count, 0)

    def test_webhook_amount_mismatch_is_not_fulfilled(self):
        res = self.webhook(amount_kobo=self.amount_kobo + 10000)
        # 200 so Paystack stops retrying, but nothing is fulfilled.
        self.assertEqual(res.status_code, 200)
        self.payment.refresh_from_db()
        self.assertEqual(self.payment.status, 'pending')
        self.assertEqual(Ticket.objects.count(), 0)
        self.assertEqual(self.ticket_email.call_count, 0)

    # -- non-terminal Paystack statuses ------------------------------------

    def test_pending_paystack_status_does_not_mark_the_payment_failed(self):
        res = self.verify(txn_status='pending')
        self.assertEqual(res.status_code, 202)
        self.assertEqual(res.json()['status'], 'processing')
        self.payment.refresh_from_db()
        self.assertEqual(self.payment.status, 'pending')
        self.assertEqual(Ticket.objects.count(), 0)

    def test_abandoned_paystack_status_leaves_the_payment_pending(self):
        res = self.verify(txn_status='abandoned')
        self.assertEqual(res.status_code, 202)
        self.payment.refresh_from_db()
        self.assertEqual(self.payment.status, 'pending')

    def test_failed_paystack_status_marks_the_payment_failed(self):
        res = self.verify(txn_status='failed')
        self.assertEqual(res.status_code, 400)
        self.payment.refresh_from_db()
        self.assertEqual(self.payment.status, 'failed')
        self.assertEqual(Ticket.objects.count(), 0)

    def test_reversed_paystack_status_marks_the_payment_failed(self):
        res = self.verify(txn_status='reversed')
        self.assertEqual(res.status_code, 400)
        self.payment.refresh_from_db()
        self.assertEqual(self.payment.status, 'failed')


# ---------------------------------------------------------------------------
# Concurrent fulfilment — the duplicate-ticket race
# ---------------------------------------------------------------------------

class ConcurrentFulfilmentTests(TransactionTestCase):
    """
    Two callers (verify + webhook) racing on the same payment must produce the
    tickets once. Needs TransactionTestCase so threads see committed rows, and
    real row locking — which SQLite does not provide (select_for_update is a
    no-op there), so this only runs against PostgreSQL, the production engine.
    """

    def setUp(self):
        self.owner = User.objects.create_user(email='owner@example.com')
        self.event = make_event(self.owner, ticket_price=Decimal('5000.00'), capacity=100)
        self.promo = make_promo(self.event)
        self.payment = make_payment(self.event, promo_code=self.promo)

    def test_two_concurrent_fulfilments_create_the_tickets_once(self):
        if connection.vendor != 'postgresql':
            self.skipTest('row-level locking requires PostgreSQL')

        errors = []
        start = threading.Barrier(2, timeout=10)

        # Widen the race window deterministically: the first caller sleeps
        # INSIDE its transaction (while creating tickets), so the second caller
        # reads the payment row mid-flight. With select_for_update the second
        # caller blocks and then sees the finished state; without it, it sees
        # 'pending' and re-runs the fulfilment (double-redeeming the promo).
        real_create_tickets = views._create_tickets

        def slow_create_tickets(*args, **kwargs):
            time.sleep(0.3)
            return real_create_tickets(*args, **kwargs)

        def fulfil():
            try:
                start.wait()
                _fulfil_payment(self.payment, None)
            except Exception as exc:  # pragma: no cover - reported via assertion
                errors.append(exc)
            finally:
                connection.close()

        with patch('bryo.views._create_tickets', side_effect=slow_create_tickets):
            threads = [threading.Thread(target=fulfil) for _ in range(2)]
            for t in threads:
                t.start()
            for t in threads:
                t.join(timeout=30)

        self.assertEqual(errors, [])
        self.payment.refresh_from_db()
        self.assertEqual(self.payment.status, 'successful')
        self.assertEqual(
            Ticket.objects.count(), 2,
            'a concurrent second fulfilment must not duplicate tickets',
        )
        self.promo.refresh_from_db()
        self.assertEqual(
            self.promo.redeemed_count, 1,
            'a concurrent second fulfilment must not redeem the promo twice',
        )
