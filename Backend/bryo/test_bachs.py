"""
Tests for the Bachs payment path next to Paystack: provider choice, checkout,
verification, webhooks (signatures included) and refunds.

Fully offline: outbound Bachs HTTP is replaced by FakeBachs, and webhook
signatures are computed locally with the test secret.
"""
import hashlib
import hmac
import json
import time
from decimal import Decimal
from unittest.mock import patch

from django.test import override_settings

from . import bachs
from .models import Payment, Refund, Ticket
from .pricing import calculate_ticket_fees
from .refunds import submit_refund
from .test_payments import FakeResponse, PaymentTestBase, make_payment

WEBHOOK_SECRET = 'whsec_test_bachs'
BACHS_SETTINGS = dict(
    PAYMENT_PROVIDER='bachs',
    BACHS_SECRET_KEY='sk_sandbox_test',
    BACHS_WEBHOOK_SECRET=WEBHOOK_SECRET,
    BACHS_API_BASE='https://sandbox-api.bachs.io',
    BACHS_SUCCESS_URL='https://usebyro.com/payment/callback',
    BACHS_PAYMENT_METHODS='',
)
INITIALIZE_URL = '/api/payments/initialize/'
WEBHOOK_URL = '/api/payments/bachs-webhook/'


def signed_headers(body, secret=WEBHOOK_SECRET, ts=None, v2=True):
    ts = int(time.time()) if ts is None else ts
    digest = hmac.new(secret.encode(), f'{ts}.{body}'.encode(), hashlib.sha256).hexdigest()
    if v2:
        return {'HTTP_X_BACHS_SIGNATURE_V2': f't={ts},v1={digest}'}
    return {'HTTP_X_BACHS_TIMESTAMP': str(ts), 'HTTP_X_BACHS_SIGNATURE': digest}


class FakeBachs:
    """Answers the Bachs endpoints Byro calls; records every request."""

    def __init__(self, checkout_status='completed', payment_status='succeeded', amount=None,
                 currency='NGN', existing_refund=None, refund_status='processing'):
        self.calls = []
        self.checkout_status = checkout_status
        self.payment_status = payment_status
        self.amount = amount
        self.currency = currency
        self.existing_refund = existing_refund
        self.refund_status = refund_status

    def checkout(self, checkout_id):
        done = self.checkout_status == 'completed'
        return {
            'checkout_id': checkout_id, 'status': self.checkout_status,
            'payment_status': self.payment_status, 'amount': self.amount, 'currency': self.currency,
            'payment_method': 'NGN_BANK_TRANSFER' if done else None,
            'charge': {'payment_id': 'ch_123', 'status': 'succeeded'} if done else None,
        }

    def __call__(self, method, url, **kwargs):
        self.calls.append((method, url, kwargs))
        path = url.split('bachs.io', 1)[1]
        if method == 'POST' and path == '/v1/checkout-sessions':
            return FakeResponse({'checkout_id': 'chk_abc', 'checkout_url': 'https://checkout.bachs.io/c/abc',
                                 'status': 'open'}, 201)
        if method == 'GET' and path.startswith('/v1/checkout-sessions/'):
            return FakeResponse(self.checkout(path.rsplit('/', 1)[1]))
        if method == 'GET' and path.startswith('/v1/refunds/by-charge/'):
            return FakeResponse({'items': [self.existing_refund] if self.existing_refund else []})
        if method == 'POST' and path == '/v1/refunds':
            return FakeResponse({'refund_id': 'rfnd_1', 'status': self.refund_status,
                                 'charge_id': kwargs['json']['charge_id']}, 201)
        if method == 'GET' and path == '/v1/balances':
            return FakeResponse({'balances': [{'currency': 'NGN', 'available_balance': '90000.00'}]})
        return FakeResponse({'message': 'not found'}, 404)

    def posted(self, path):
        return [kw['json'] for m, u, kw in self.calls if m == 'POST' and u.endswith(path)]


@override_settings(**BACHS_SETTINGS)
class BachsInitializeTests(PaymentTestBase):

    def initialize(self, fake):
        with patch('bryo.views.check_and_remember_verification', return_value=True), \
                patch('bryo.bachs.requests.request', side_effect=fake):
            return self.client.post(INITIALIZE_URL, {
                'event_slug': self.event.slug, 'customer_email': 'buyer@example.com',
                'customer_name': 'Buyer One', 'quantity': 1,
            }, format='json')

    def test_new_order_opens_a_bachs_checkout_for_the_all_in_price(self):
        fake = FakeBachs()
        res = self.initialize(fake)
        self.assertEqual(res.status_code, 200)
        data = res.json()['data']
        self.assertEqual(data['authorization_url'], 'https://checkout.bachs.io/c/abc')
        self.assertEqual(data['provider'], 'bachs')

        payment = Payment.objects.get()
        self.assertEqual(payment.provider, 'bachs')
        self.assertEqual(payment.bachs_checkout_id, 'chk_abc')
        fees = calculate_ticket_fees(Decimal('5000.00'), pass_fee_to_attendee=self.event.pass_fee_to_attendee,
                                     rate=payment.fee_rate)
        self.assertEqual(payment.amount, fees['total'])
        sent = fake.posted('/v1/checkout-sessions')[0]
        self.assertEqual(sent['pricing'], {'currency': 'NGN', 'amount': str(fees['display_total'])})
        self.assertEqual(sent['reference'], payment.paystack_reference)
        self.assertIn(f'reference={payment.paystack_reference}', sent['success_url'])

    def test_seat_is_released_when_bachs_refuses(self):
        refuse = lambda *a, **k: FakeResponse({'error_code': 'VALIDATION_ERROR', 'message': 'bad'}, 422)
        res = self.initialize(refuse)
        self.assertEqual(res.status_code, 400)
        self.assertEqual(Payment.objects.get().status, 'failed')

    @override_settings(BACHS_SECRET_KEY='')
    def test_checkout_is_refused_when_bachs_has_no_key(self):
        with patch('bryo.views.check_and_remember_verification', return_value=True), \
                patch('bryo.views.requests.post') as paystack:
            res = self.client.post(INITIALIZE_URL, {
                'event_slug': self.event.slug, 'customer_email': 'b@example.com',
                'customer_name': 'B', 'quantity': 1,
            }, format='json')
        self.assertEqual(res.status_code, 503)
        self.assertFalse(Payment.objects.exists(), 'no seat is held')
        paystack.assert_not_called()


@override_settings(**{**BACHS_SETTINGS, 'PAYMENT_PROVIDER': 'paystack',
                      'BACHS_TEST_EMAILS': {'tester@usebyro.com', 'second@example.com'}})
class BachsTestEmailTests(PaymentTestBase):
    """While Paystack is the default, only buyers on BACHS_TEST_EMAILS are sent to Bachs."""

    def provider_for(self, email):
        from .views import _provider_for_new_order
        return _provider_for_new_order(email)

    def test_listed_buyer_pays_through_bachs(self):
        fake = FakeBachs()
        with patch('bryo.views.check_and_remember_verification', return_value=True), \
                patch('bryo.bachs.requests.request', side_effect=fake):
            res = self.client.post(INITIALIZE_URL, {
                'event_slug': self.event.slug, 'customer_email': 'tester@usebyro.com',
                'customer_name': 'Tester', 'quantity': 1,
            }, format='json')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()['data']['provider'], 'bachs')
        self.assertEqual(Payment.objects.get().provider, 'bachs')

    def test_everyone_else_stays_on_paystack(self):
        self.assertEqual(self.provider_for('customer@example.com'), 'paystack')
        self.assertEqual(self.provider_for(''), 'paystack')
        self.assertEqual(self.provider_for(None), 'paystack')

    def test_list_ignores_capitals_and_spaces(self):
        self.assertEqual(self.provider_for('  Tester@UseByro.com '), 'bachs')

    def test_signed_in_account_email_also_counts(self):
        from .views import _provider_for_new_order
        self.assertEqual(_provider_for_new_order('other@example.com', 'second@example.com'), 'bachs')

    @override_settings(BACHS_TEST_EMAILS=set())
    def test_empty_list_keeps_everyone_on_paystack(self):
        self.assertEqual(self.provider_for('tester@usebyro.com'), 'paystack')

    @override_settings(PAYMENT_PROVIDER='bachs', BACHS_TEST_EMAILS=set())
    def test_switching_on_bachs_sends_everyone_there(self):
        self.assertEqual(self.provider_for('customer@example.com'), 'bachs')


@override_settings(**BACHS_SETTINGS)
class BachsFulfilmentTests(PaymentTestBase):

    def setUp(self):
        super().setUp()
        self.payment = make_payment(
            self.event, provider='bachs', bachs_checkout_id='chk_abc',
            metadata={'charge_amount': '5400.00'},
        )
        self.reference = self.payment.paystack_reference

    def verify(self, fake):
        with patch('bryo.bachs.requests.request', side_effect=fake), self.fulfilment_callbacks():
            return self.client.get(f'/api/payments/verify/{self.reference}/')

    def webhook(self, fake, body=None, headers=None):
        body = body or json.dumps({'id': 'evt_1', 'type': 'checkout.completed',
                                   'data': {'checkout_id': 'chk_abc', 'reference': self.reference}})
        with patch('bryo.bachs.requests.request', side_effect=fake), self.fulfilment_callbacks():
            return self.client.post(WEBHOOK_URL, body, content_type='application/json',
                                    **(headers if headers is not None else signed_headers(body)))

    def test_verify_issues_tickets_once_and_records_the_charge(self):
        res = self.verify(FakeBachs(amount='5400.00'))
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()['payment']['status'], 'successful')
        self.assertEqual(Ticket.objects.count(), 2)
        self.payment.refresh_from_db()
        self.assertEqual(self.payment.bachs_charge_id, 'ch_123')
        self.assertEqual(self.payment.channel, 'bank_transfer')

        self.assertEqual(self.webhook(FakeBachs(amount='5400.00')).status_code, 200)
        self.assertEqual(Ticket.objects.count(), 2, 'webhook must not duplicate tickets')
        self.assertEqual(self.ticket_email.call_count, 2)

    def test_webhook_alone_fulfils(self):
        self.assertEqual(self.webhook(FakeBachs(amount='5400.00')).status_code, 200)
        self.payment.refresh_from_db()
        self.assertEqual(self.payment.status, 'successful')
        self.assertEqual(Ticket.objects.count(), 2)

    def test_wrong_amount_is_not_fulfilled(self):
        res = self.verify(FakeBachs(amount='100.00'))
        self.assertEqual(res.status_code, 400)
        self.webhook(FakeBachs(amount='100.00'))
        self.assertEqual(Ticket.objects.count(), 0)

    def test_wrong_currency_is_not_fulfilled(self):
        self.verify(FakeBachs(amount='5400.00', currency='USD'))
        self.assertEqual(Ticket.objects.count(), 0)

    def test_open_checkout_stays_pending(self):
        res = self.verify(FakeBachs(checkout_status='open', payment_status='processing', amount='5400.00'))
        self.assertEqual(res.status_code, 202)
        self.payment.refresh_from_db()
        self.assertEqual(self.payment.status, 'pending')

    def test_expired_checkout_marks_the_payment_failed(self):
        res = self.verify(FakeBachs(checkout_status='expired', payment_status=None, amount='5400.00'))
        self.assertEqual(res.status_code, 400)
        self.payment.refresh_from_db()
        self.assertEqual(self.payment.status, 'failed')

    def test_webhook_body_is_not_trusted_without_bachs_confirming(self):
        # The delivery says completed, but Bachs itself says the session is still open.
        self.webhook(FakeBachs(checkout_status='open', payment_status='processing', amount='5400.00'))
        self.assertEqual(Ticket.objects.count(), 0)

    def test_unsigned_webhook_is_rejected(self):
        res = self.webhook(FakeBachs(amount='5400.00'), headers={})
        self.assertEqual(res.status_code, 400)
        self.assertEqual(Ticket.objects.count(), 0)

    def test_webhook_signed_with_another_secret_is_rejected(self):
        body = json.dumps({'type': 'checkout.completed', 'data': {'checkout_id': 'chk_abc'}})
        res = self.webhook(FakeBachs(amount='5400.00'), body=body, headers=signed_headers(body, 'other'))
        self.assertEqual(res.status_code, 400)

    def test_webhook_returns_503_when_bachs_cannot_be_read_so_it_retries(self):
        down = lambda *a, **k: FakeResponse({}, 502)
        self.assertEqual(self.webhook(down).status_code, 503)

    def test_paystack_orders_still_verify_through_paystack(self):
        paystack_payment = make_payment(self.event, reference='EVT-test-paystack-1')
        ok = FakeResponse({'status': True, 'data': {'status': 'success',
                                                    'amount': int(paystack_payment.amount * 100),
                                                    'channel': 'card'}})
        with patch('bryo.views.requests.get', return_value=ok), self.fulfilment_callbacks():
            res = self.client.get('/api/payments/verify/EVT-test-paystack-1/')
        self.assertEqual(res.status_code, 200)
        paystack_payment.refresh_from_db()
        self.assertEqual(paystack_payment.status, 'successful')


class BachsSignatureTests(PaymentTestBase):

    def check(self, headers, body='{"a":1}', secret=WEBHOOK_SECRET):
        meta = {k[5:].replace('_', '-').title().replace('Bachs', 'Bachs'): v for k, v in headers.items()}
        return bachs.verify_signature(body.encode(), meta, secret=secret)

    def test_v2_and_legacy_headers_verify(self):
        self.assertTrue(self.check(signed_headers('{"a":1}')))
        self.assertTrue(self.check(signed_headers('{"a":1}', v2=False)))

    def test_stale_timestamp_is_rejected(self):
        self.assertFalse(self.check(signed_headers('{"a":1}', ts=int(time.time()) - 3600)))

    def test_tampered_body_is_rejected(self):
        self.assertFalse(self.check(signed_headers('{"a":1}'), body='{"a":2}'))

    def test_any_v1_matches_during_secret_rotation(self):
        ts = int(time.time())
        good = hmac.new(WEBHOOK_SECRET.encode(), f'{ts}.{{"a":1}}'.encode(), hashlib.sha256).hexdigest()
        header = {'X-Bachs-Signature-V2': f't={ts},v1={"0" * 64},v1={good}'}
        self.assertTrue(bachs.verify_signature(b'{"a":1}', header, secret=WEBHOOK_SECRET))

    def test_no_secret_rejects_everything(self):
        self.assertFalse(self.check(signed_headers('{"a":1}'), secret=''))


@override_settings(**BACHS_SETTINGS)
class BachsRefundTests(PaymentTestBase):

    def setUp(self):
        super().setUp()
        self.payment = make_payment(self.event, provider='bachs', bachs_checkout_id='chk_abc',
                                    bachs_charge_id='ch_123', metadata={'subtotal': '5000.00'})
        Payment.objects.filter(pk=self.payment.pk).update(status='successful')
        self.refund = Refund.objects.create(payment=self.payment, event=self.event, amount=Decimal('5000.00'),
                                            status=Refund.STATUS_PENDING, reason='Event cancelled')

    def test_refund_goes_to_bachs_against_the_charge(self):
        fake = FakeBachs()
        with patch('bryo.bachs.requests.request', side_effect=fake):
            submit_refund(self.refund)
        self.refund.refresh_from_db()
        self.assertEqual(self.refund.status, Refund.STATUS_PROCESSING)
        self.assertEqual(self.refund.bachs_refund_id, 'rfnd_1')
        sent = fake.posted('/v1/refunds')[0]
        self.assertEqual(sent['charge_id'], 'ch_123')
        self.assertEqual(sent['amount'], '5000.00')

    def test_retry_adopts_the_refund_bachs_already_holds(self):
        fake = FakeBachs(existing_refund={'refund_id': 'rfnd_old', 'status': 'success'})
        with patch('bryo.bachs.requests.request', side_effect=fake):
            submit_refund(self.refund)
        self.refund.refresh_from_db()
        self.assertEqual(self.refund.status, Refund.STATUS_PROCESSED)
        self.assertEqual(fake.posted('/v1/refunds'), [], 'must not refund twice')

    def test_unreachable_bachs_leaves_the_refund_queued(self):
        with patch('bryo.bachs.requests.request', side_effect=lambda *a, **k: FakeResponse({}, 503)):
            submit_refund(self.refund)
        self.refund.refresh_from_db()
        self.assertEqual(self.refund.status, Refund.STATUS_PENDING)

    def test_refund_paid_webhook_marks_it_processed(self):
        Refund.objects.filter(pk=self.refund.pk).update(status=Refund.STATUS_PROCESSING, bachs_refund_id='rfnd_1')
        body = json.dumps({'id': 'evt_2', 'type': 'refund.paid',
                           'data': {'refund_id': 'rfnd_1', 'charge_id': 'ch_123', 'status': 'success'}})
        res = self.client.post(WEBHOOK_URL, body, content_type='application/json', **signed_headers(body))
        self.assertEqual(res.status_code, 200)
        self.refund.refresh_from_db()
        self.assertEqual(self.refund.status, Refund.STATUS_PROCESSED)


@override_settings(**BACHS_SETTINGS)
class BachsBankLookupTests(PaymentTestBase):

    def setUp(self):
        super().setUp()
        self.client.force_authenticate(self.owner)

    def test_bank_list_comes_from_bachs_in_the_old_shape(self):
        banks = FakeResponse({'country': 'NG', 'banks': [{'name': 'Providus Bank', 'code': '101'}]})
        with patch('bryo.bachs.requests.request', return_value=banks) as call:
            res = self.client.get('/api/banks/', {'country': 'nigeria'})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()['data'], [{'name': 'Providus Bank', 'code': '101'}])
        self.assertEqual(call.call_args.kwargs['params'], {'country': 'NG'})

    def test_resolved_account_returns_the_name(self):
        ok = FakeResponse({'resolved': True, 'account_name': 'ADA OKAFOR', 'account_number': '0123456789'})
        with patch('bryo.bachs.requests.request', return_value=ok):
            res = self.client.get('/api/banks/resolve-account/', {'account_number': '0123456789', 'bank_code': '101'})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()['data']['account_name'], 'ADA OKAFOR')

    def test_unresolved_account_is_a_400_with_the_bachs_message(self):
        no = FakeResponse({'resolved': False, 'account_name': None, 'message': 'Account not found'})
        with patch('bryo.bachs.requests.request', return_value=no):
            res = self.client.get('/api/banks/resolve-account/', {'account_number': '0000000000', 'bank_code': '101'})
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.json()['error'], 'Account not found')


@override_settings(**{**BACHS_SETTINGS, 'PAYMENT_PROVIDER': 'paystack', 'BACHS_TEST_EMAILS': set()})
class AdminPaymentProviderTests(PaymentTestBase):
    """Byro owners pick Paystack or Bachs for new orders, and keep a Bachs test list, in Admin > Settings."""

    SETTINGS_URL = '/api/admin/settings/'

    def setUp(self):
        super().setUp()
        from django.contrib.auth import get_user_model
        from .models import AdminMember
        User = get_user_model()
        self.boss = User.objects.create_user(email='boss@byro.test')
        AdminMember.objects.create(email='boss@byro.test', role='owner', added_by_email='test')
        self.admin = User.objects.create_user(email='admin@byro.test')
        AdminMember.objects.create(email='admin@byro.test', role='admin', added_by_email='test')

    def patch_as(self, user, body):
        self.client.force_authenticate(user)
        res = self.client.patch(self.SETTINGS_URL, body, format='json')
        self.client.force_authenticate(None)
        return res

    def provider_for(self, *emails):
        from .views import _provider_for_new_order
        return _provider_for_new_order(*emails)

    def buy(self, email='customer@example.com'):
        fake = FakeBachs()
        paystack = patch('bryo.views.requests.post', return_value=FakeResponse({
            'status': True, 'data': {'access_code': 'ac', 'authorization_url': 'https://checkout.paystack.com/x'}}))
        with patch('bryo.views.check_and_remember_verification', return_value=True), \
                patch('bryo.bachs.requests.request', side_effect=fake), paystack:
            res = self.client.post(INITIALIZE_URL, {
                'event_slug': self.event.slug, 'customer_email': email,
                'customer_name': 'Buyer', 'quantity': 1,
            }, format='json')
        self.assertEqual(res.status_code, 200, res.content[:300])
        return res.json()['data'].get('provider', 'paystack')

    def test_paystack_until_an_owner_chooses_otherwise(self):
        self.client.force_authenticate(self.admin)
        payments = self.client.get(self.SETTINGS_URL).json()['payments']
        self.assertEqual(payments['provider'], 'paystack')
        self.assertEqual(payments['source'], 'server')
        self.assertTrue(payments['bachs_configured'])
        self.assertEqual(payments['bachs_mode'], 'sandbox')
        self.client.force_authenticate(None)
        self.assertEqual(self.buy(), 'paystack')

    def test_owner_switches_new_orders_to_bachs_and_back(self):
        res = self.patch_as(self.boss, {'payment_provider': 'bachs'})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()['payments']['provider'], 'bachs')
        self.assertEqual(res.json()['payments']['source'], 'admin')
        self.assertEqual(self.buy(), 'bachs')
        self.assertEqual(Payment.objects.latest('created_at').provider, 'bachs')

        self.assertEqual(self.patch_as(self.boss, {'payment_provider': 'paystack'}).status_code, 200)
        self.assertEqual(self.buy('second@example.com'), 'paystack')
        self.assertEqual(Payment.objects.latest('created_at').provider, 'paystack')

        from .models import AdminAction
        changes = list(AdminAction.objects.filter(action=AdminAction.ACTION_PAYMENT_PROVIDER_CHANGED)
                       .order_by('created_at').values_list('detail', 'actor_email'))
        self.assertEqual(changes, [('Paystack -> Bachs', 'boss@byro.test'), ('Bachs -> Paystack', 'boss@byro.test')])

    def test_orders_already_taken_keep_their_provider_after_a_switch(self):
        self.patch_as(self.boss, {'payment_provider': 'bachs'})
        self.buy()
        taken = Payment.objects.latest('created_at')
        self.patch_as(self.boss, {'payment_provider': 'paystack'})
        taken.refresh_from_db()
        self.assertEqual(taken.provider, 'bachs')

    def test_admin_choice_beats_the_server_setting(self):
        with override_settings(PAYMENT_PROVIDER='bachs'):
            self.assertEqual(self.provider_for('a@example.com'), 'bachs')
            self.patch_as(self.boss, {'payment_provider': 'paystack'})
            self.assertEqual(self.provider_for('a@example.com'), 'paystack')

    def test_only_owners_can_change_it(self):
        self.assertEqual(self.patch_as(self.admin, {'payment_provider': 'bachs'}).status_code, 403)
        self.assertEqual(self.patch_as(self.admin, {'bachs_test_emails': 'x@example.com'}).status_code, 403)
        self.assertEqual(self.provider_for('x@example.com'), 'paystack')

    @override_settings(BACHS_SECRET_KEY='')
    def test_bachs_cannot_be_chosen_without_a_key(self):
        res = self.patch_as(self.boss, {'payment_provider': 'bachs'})
        self.assertEqual(res.status_code, 400)
        self.assertIn('BACHS_SECRET_KEY', res.json()['error'])
        self.assertEqual(self.provider_for('a@example.com'), 'paystack')

    def test_unknown_provider_is_refused(self):
        for bad in ('stripe', '', None):
            self.assertEqual(self.patch_as(self.boss, {'payment_provider': bad}).status_code, 400, bad)

    def test_test_list_from_the_admin_sends_only_those_buyers_to_bachs(self):
        res = self.patch_as(self.boss, {'bachs_test_emails': ' "Tester@UseByro.com", friend@example.com\nfriend@example.com '})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()['payments']['test_emails'], ['tester@usebyro.com', 'friend@example.com'])
        self.assertEqual(res.json()['payments']['provider'], 'paystack')
        self.assertEqual(self.buy('tester@usebyro.com'), 'bachs')
        self.assertEqual(self.buy('customer@example.com'), 'paystack')
        self.assertEqual(self.provider_for(None, 'FRIEND@example.com'), 'bachs')

    def test_test_list_accepts_a_list_and_can_be_emptied(self):
        self.patch_as(self.boss, {'bachs_test_emails': ['a@example.com', 'b@example.com']})
        self.assertEqual(self.provider_for('b@example.com'), 'bachs')
        res = self.patch_as(self.boss, {'bachs_test_emails': []})
        self.assertEqual(res.json()['payments']['test_emails'], [])
        self.assertEqual(self.provider_for('b@example.com'), 'paystack')

    def test_bad_email_is_refused_and_nothing_changes(self):
        self.patch_as(self.boss, {'bachs_test_emails': 'good@example.com'})
        res = self.patch_as(self.boss, {'bachs_test_emails': 'good@example.com, not-an-email',
                                        'payment_provider': 'bachs'})
        self.assertEqual(res.status_code, 400)
        self.assertIn('not-an-email', res.json()['error'])
        self.assertEqual(self.provider_for('customer@example.com'), 'paystack')
        self.client.force_authenticate(self.boss)
        self.assertEqual(self.client.get(self.SETTINGS_URL).json()['payments']['test_emails'], ['good@example.com'])

    def test_server_test_list_still_works_next_to_the_admin_list(self):
        self.patch_as(self.boss, {'bachs_test_emails': 'admin-list@example.com'})
        with override_settings(BACHS_TEST_EMAILS={'server-list@example.com'}):
            self.assertEqual(self.provider_for('server-list@example.com'), 'bachs')
            self.assertEqual(self.provider_for('admin-list@example.com'), 'bachs')
            self.assertEqual(self.provider_for('other@example.com'), 'paystack')

    def test_changing_payments_does_not_touch_the_fee_or_its_last_changed_line(self):
        from .models import PlatformSettings
        self.patch_as(self.boss, {'default_fee_percent': '4'})
        before = PlatformSettings.get()
        self.patch_as(self.admin, {})  # refused, no-op
        res = self.patch_as(self.boss, {'payment_provider': 'bachs', 'bachs_test_emails': 'x@example.com'})
        self.assertEqual(res.json()['default_fee_percent'], '4')
        after = PlatformSettings.get()
        self.assertEqual(after.updated_at, before.updated_at)
        self.assertEqual(after.default_fee_rate, Decimal('0.04'))

    def test_empty_patch_is_refused(self):
        self.assertEqual(self.patch_as(self.boss, {}).status_code, 400)

    def test_changes_are_in_the_payment_history(self):
        self.patch_as(self.boss, {'bachs_test_emails': 'a@example.com'})
        self.patch_as(self.boss, {'bachs_test_emails': 'b@example.com'})
        self.patch_as(self.boss, {'payment_provider': 'bachs'})
        self.client.force_authenticate(self.admin)
        history = self.client.get(self.SETTINGS_URL).json()['payments']['history']
        self.assertEqual([(h['kind'], h['change']) for h in history], [
            ('provider', 'Paystack -> Bachs'),
            ('test_emails', 'added b@example.com; removed a@example.com'),
            ('test_emails', 'added a@example.com'),
        ])
