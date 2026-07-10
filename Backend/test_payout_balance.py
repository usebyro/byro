#!/usr/bin/env python
"""
Standalone test for payout balance calculation.
Tests compute_available_balance() and the /api/payouts/ validation.
"""
import os
import sys
import django
from decimal import Decimal
from datetime import date, time

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'api.settings')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
django.setup()

from django.contrib.auth import get_user_model
from django.test import TestCase, RequestFactory
from bryo.models import Event, Ticket, TicketTier, PayoutRequest
from bryo.views import compute_available_balance, PayoutRequestView
from rest_framework.test import force_authenticate
import json

User = get_user_model()


def _make_ticket(event, status='paid', tier=None, tag='b'):
    return Ticket.objects.create(
        event=event,
        tier=tier,
        payment_status=status,
        original_owner_name=tag,
        original_owner_email=f'{tag}@test.com',
        current_owner_name=tag,
        current_owner_email=f'{tag}@test.com',
    )


class PayoutBalanceTest(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username='organizer@test.com',
            email='organizer@test.com',
            password='testpass',
        )
        self.event = Event.objects.create(
            owner=self.user,
            name='Test Event',
            slug='test-event',
            ticket_price=Decimal('1000.00'),
            day=date(2026, 12, 1),
            time_from=time(18, 0),
            time_to=time(22, 0),
            location='Lagos',
            description='A test event.',
            capacity=100,
        )

    def test_balance_with_no_tickets_sold(self):
        """Balance should be 0 when no tickets are sold."""
        self.assertEqual(compute_available_balance(self.user), Decimal('0'))

    def test_balance_with_paid_tickets_flat_price(self):
        """Balance = ticket_price × number of paid tickets."""
        for i in range(3):
            _make_ticket(self.event, tag=f'buyer{i}')
        self.assertEqual(compute_available_balance(self.user), Decimal('3000.00'))

    def test_balance_with_tier_pricing(self):
        """Tickets with a tier should use tier.price, not the flat price."""
        vip = TicketTier.objects.create(event=self.event, name='VIP', price=Decimal('2500.00'))
        gen = TicketTier.objects.create(event=self.event, name='General', price=Decimal('1500.00'))
        for i in range(2):
            _make_ticket(self.event, tier=vip, tag=f'vip{i}')
        for i in range(3):
            _make_ticket(self.event, tier=gen, tag=f'gen{i}')
        expected = Decimal('2500.00') * 2 + Decimal('1500.00') * 3
        self.assertEqual(compute_available_balance(self.user), expected)

    def test_free_and_pending_tickets_excluded(self):
        """Only 'paid' tickets count — free/pending/failed contribute nothing."""
        for st in ('free', 'pending', 'failed'):
            _make_ticket(self.event, status=st, tag=st)
        self.assertEqual(compute_available_balance(self.user), Decimal('0'))

    def test_pending_and_processed_payouts_subtracted(self):
        """Pending + processed payouts reduce balance; rejected does not."""
        for i in range(4):
            _make_ticket(self.event, tag=f'b{i}')  # 4 × 1000 = 4000 earned
        PayoutRequest.objects.create(user=self.user, amount=Decimal('1000'), method='bank', status='processed')
        PayoutRequest.objects.create(user=self.user, amount=Decimal('500'), method='bank', status='pending')
        PayoutRequest.objects.create(user=self.user, amount=Decimal('9999'), method='bank', status='rejected')
        # 4000 - 1000 - 500 = 2500 (rejected 9999 ignored)
        self.assertEqual(compute_available_balance(self.user), Decimal('2500'))

    def _post_payout(self, amount):
        factory = RequestFactory()
        request = factory.post(
            '/api/payouts/',
            data=json.dumps({
                'method': 'bank', 'amount': str(amount), 'currency': 'NGN',
                'bank_name': 'Test Bank', 'account_number': '0123456789',
                'account_name': 'Test Organizer',
            }),
            content_type='application/json',
        )
        force_authenticate(request, user=self.user)
        return PayoutRequestView.as_view()(request)

    def test_post_rejected_when_balance_zero(self):
        """POST /api/payouts/ must reject when balance is 0 (no tickets sold)."""
        resp = self._post_payout(Decimal('100'))
        self.assertEqual(resp.status_code, 400)
        self.assertIn('no funds', str(resp.data).lower())

    def test_post_rejected_when_amount_exceeds_balance(self):
        """POST must reject when requested amount > available balance."""
        _make_ticket(self.event)  # 1000 available
        resp = self._post_payout(Decimal('5000'))
        self.assertEqual(resp.status_code, 400)
        self.assertIn('exceeds', str(resp.data).lower())

    def test_post_succeeds_within_balance(self):
        """POST succeeds when balance is positive and amount is within it."""
        for i in range(2):
            _make_ticket(self.event, tag=f'b{i}')  # 2000 available
        resp = self._post_payout(Decimal('1500'))
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(PayoutRequest.objects.filter(user=self.user).count(), 1)
