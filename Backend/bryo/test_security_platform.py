"""Platform guards around money: throttles that can't be dodged, an admin panel nobody can claim by being first,
and payment checks that refuse a wrong signature, amount or currency."""
import hashlib
import hmac
import json
from unittest.mock import patch

from django.conf import settings
from django.core.cache import cache
from django.test import override_settings

from .models import AdminMember
from .permissions import get_admin_member
from .test_merch import MerchBase, User


class ThrottleTests(MerchBase):
    def hammer(self, forwarded):
        cache.clear()
        codes = [self.client.post('/api/merch-orders/checkout/', {'handle': 'nobody'}, format='json',
                                  HTTP_X_FORWARDED_FOR=forwarded(i)).status_code for i in range(70)]
        return codes

    def test_a_forged_forwarded_for_header_does_not_dodge_the_limit(self):
        # One proxy in front: it appends the address it really saw, at the right end. The caller controls the rest.
        codes = self.hammer(lambda i: f'10.9.{i // 250}.{i % 250}, 203.0.113.9')
        self.assertIn(429, codes)

    def test_different_real_addresses_are_counted_separately(self):
        codes = self.hammer(lambda i: f'198.51.100.{i + 1}')
        self.assertNotIn(429, codes)


class AdminBootstrapTests(MerchBase):
    def user(self, email):
        return User.objects.create_user(email=email)

    @override_settings(ADMIN_BOOTSTRAP_OPEN=False, ADMIN_BOOTSTRAP_EMAILS=set())
    def test_in_production_nobody_becomes_owner_just_by_arriving_first(self):
        self.assertIsNone(get_admin_member(self.user('stranger@example.com')))
        self.assertFalse(AdminMember.objects.exists())
        self.client.force_authenticate(self.user('stranger2@example.com'))
        self.assertEqual(self.client.get('/api/admin/merch-orders/held/').status_code, 403)

    @override_settings(ADMIN_BOOTSTRAP_OPEN=False, ADMIN_BOOTSTRAP_EMAILS={'founder@example.com'})
    def test_a_listed_email_can_still_bootstrap_in_production(self):
        member = get_admin_member(self.user('founder@example.com'))
        self.assertEqual(member.role, AdminMember.ROLE_OWNER)
        self.assertIsNone(get_admin_member(self.user('stranger@example.com')))

    @override_settings(ADMIN_BOOTSTRAP_OPEN=True, ADMIN_BOOTSTRAP_EMAILS=set())
    def test_local_development_keeps_the_first_visitor_shortcut(self):
        self.assertEqual(get_admin_member(self.user('dev@example.com')).role, AdminMember.ROLE_OWNER)

    @override_settings(ADMIN_BOOTSTRAP_OPEN=False, ADMIN_BOOTSTRAP_EMAILS=set())
    def test_existing_team_members_are_unaffected(self):
        AdminMember.objects.create(email='ops@example.com', role=AdminMember.ROLE_ADMIN)
        self.assertEqual(get_admin_member(self.user('ops@example.com')).role, AdminMember.ROLE_ADMIN)


class PaymentCheckTests(MerchBase):
    def sign(self, payload):
        raw = json.dumps(payload).encode()
        return raw, hmac.new(settings.PAYSTACK_SECRET_KEY.strip().encode(), raw, hashlib.sha512).hexdigest()

    def hook(self, order, **data):
        raw, sig = self.sign({'event': 'charge.success', 'data': {'reference': order.paystack_reference, 'channel': 'card', **data}})
        r = self.client.post('/api/payments/webhook/', data=raw, content_type='application/json', HTTP_X_PAYSTACK_SIGNATURE=sig)
        order.refresh_from_db()
        return r, order

    def test_a_wrong_signature_is_rejected_and_nothing_is_paid(self):
        order = self.order()
        raw, _ = self.sign({'event': 'charge.success', 'data': {'reference': order.paystack_reference, 'amount': 1200000}})
        for sig in ('', 'deadbeef', 'x' * 128):
            r = self.client.post('/api/payments/webhook/', data=raw, content_type='application/json', HTTP_X_PAYSTACK_SIGNATURE=sig)
            self.assertEqual(r.status_code, 400)
        order.refresh_from_db()
        self.assertEqual(order.status, 'pending')

    def test_a_payment_in_another_currency_does_not_pay_a_naira_order(self):
        order = self.order()
        _, order = self.hook(order, amount=1200000, currency='USD')
        self.assertEqual(order.status, 'pending')

    def test_naira_pays_the_order(self):
        order = self.order()
        _, order = self.hook(order, amount=1200000, currency='NGN')
        self.assertEqual(order.status, 'paid')

    def test_a_short_or_garbled_amount_does_not_pay_the_order(self):
        for amount in (1, 1199999, 'lots', None, [], {}):
            order = self.order(lines=[{'item_id': self.cap.pk, 'quantity': 1, 'option': ''}])
            r, order = self.hook(order, amount=amount, currency='NGN')
            self.assertEqual(r.status_code, 200, amount)       # always 200 so Paystack stops retrying
            self.assertEqual(order.status, 'pending', amount)
            from . import merch
            merch.fail_order(order)

    def test_verify_refuses_a_payment_in_another_currency(self):
        order = self.order()
        with patch('bryo.views._paystack_transaction', return_value=({'status': 'success', 'amount': 1200000, 'currency': 'USD'}, None)):
            r = self.client.get(f'/api/merch-orders/verify/{order.paystack_reference}/')
        self.assertEqual(r.status_code, 400)
        order.refresh_from_db()
        self.assertEqual(order.status, 'pending')

    def test_a_wrong_order_token_is_refused_like_a_missing_order(self):
        order = self.paid()
        wrong = self.client.get(f'/api/merch-orders/{order.ref}/?token=nope').status_code
        missing = self.client.get('/api/merch-orders/BY-9999/?token=nope').status_code
        right = self.client.get(f'/api/merch-orders/{order.ref}/?token={order.access_token}').status_code
        self.assertEqual((wrong, missing, right), (404, 404, 200))
