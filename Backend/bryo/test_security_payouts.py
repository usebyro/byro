"""Payout integrity: no negative or zero amounts, no double withdrawal, no reversing a finished payout."""
from decimal import Decimal

from django.db import IntegrityError, transaction
from rest_framework.test import APIClient

from . import merch
from .models import AdminMember, PayoutRequest
from .test_merch import MerchBase, User
from .views import compute_available_balance


class PayoutIntegrityTests(MerchBase):
    def earn(self):
        order = self.paid('pickup')            # ₦12,000
        merch.advance(order, 'ready')
        merch.advance(order, 'picked_up', code=order.pickup_code)

    def withdraw(self, amount, user=None):
        self.client.force_authenticate(user or self.seller)
        return self.client.post('/api/payouts/', {
            'amount': amount, 'method': 'bank', 'bank_name': 'GTB',
            'account_number': '0123456789', 'account_name': 'Seller'}, format='json')

    def test_negative_amount_is_refused_and_balance_is_unchanged(self):
        self.earn()
        for bad in ('-500000', '-0.01', '0', '0.00'):
            self.assertEqual(self.withdraw(bad).status_code, 400, bad)
        self.assertEqual(PayoutRequest.objects.count(), 0)
        self.assertEqual(compute_available_balance(self.seller), Decimal('12000.00'))

    def test_cannot_withdraw_more_than_the_balance(self):
        self.earn()
        self.assertEqual(self.withdraw('12000.01').status_code, 400)
        self.assertEqual(self.withdraw('12000').status_code, 201)
        self.assertEqual(self.withdraw('1').status_code, 400)

    def test_database_refuses_a_non_positive_payout_even_if_code_slips(self):
        for bad in (Decimal('-1'), Decimal('0')):
            with self.assertRaises(IntegrityError), transaction.atomic():
                PayoutRequest.objects.create(user=self.seller, amount=bad, method='bank')


class AdminPayoutMovesTests(MerchBase):
    def setUp(self):
        super().setUp()
        self.admin = User.objects.create_user(email='boss@example.com')
        AdminMember.objects.create(email='boss@example.com', role=AdminMember.ROLE_OWNER)

    def patch(self, payout, status):
        c = APIClient()
        c.force_authenticate(self.admin)
        return c.patch(f'/api/admin/payouts/{payout.pk}/', {'status': status}, format='json')

    def payout(self, status='pending'):
        return PayoutRequest.objects.create(user=self.seller, amount=Decimal('5000'), method='bank', status=status)

    def test_a_processed_payout_cannot_be_rejected_to_free_the_money(self):
        p = self.payout()
        self.assertEqual(self.patch(p, 'processed').status_code, 200)
        self.assertEqual(self.patch(p, 'rejected').status_code, 400)
        p.refresh_from_db()
        self.assertEqual(p.status, 'processed')

    def test_a_rejected_payout_cannot_be_paid_later(self):
        p = self.payout()
        self.assertEqual(self.patch(p, 'rejected').status_code, 200)
        self.assertEqual(self.patch(p, 'processed').status_code, 400)

    def test_a_held_payout_can_still_be_processed_or_rejected(self):
        self.assertEqual(self.patch(self.payout('on_hold'), 'processed').status_code, 200)
        self.assertEqual(self.patch(self.payout('on_hold'), 'rejected').status_code, 200)
