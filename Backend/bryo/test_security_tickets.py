"""Ticket-side guards: no ticket ids in the logs, promo codes that can't be guessed or oversold."""
import io
import uuid
from contextlib import redirect_stdout
from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIClient

from .models import Payment, PromoCode, Ticket
from .test_payments import FakeResponse, INITIALIZE_URL, make_event, make_promo

User = get_user_model()


class TicketLookupTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(email='owner@example.com')
        self.event = make_event(self.owner, ticket_price=Decimal('0'))
        self.ticket = Ticket.objects.create(
            event=self.event, original_owner_name='A', current_owner_name='A', current_owner_email='a@example.com',
            original_owner_email='a@example.com', payment_status='free')

    def test_a_missing_ticket_is_a_404_and_prints_nothing(self):
        out = io.StringIO()
        with redirect_stdout(out):
            r = APIClient().get(f'/api/tickets/{uuid.uuid4()}/qr/')
        self.assertEqual(r.status_code, 404)
        self.assertNotIn(str(self.ticket.ticket_id), out.getvalue())
        self.assertEqual(out.getvalue().strip(), '')

    def test_a_real_ticket_still_loads(self):
        r = APIClient().get(f'/api/tickets/{self.ticket.ticket_id}/qr/')
        self.assertEqual(r.status_code, 200)


class PromoTests(TestCase):
    def setUp(self):
        cache.clear()
        self.owner = User.objects.create_user(email='owner@example.com')
        self.client = APIClient()

    def buy(self, event, code, email='buyer@example.com'):
        paystack = patch('bryo.views.requests.post', return_value=FakeResponse({
            'status': True, 'data': {'access_code': 'ac', 'authorization_url': 'https://pay.example/x'}}))
        with patch('bryo.views.check_and_remember_verification', return_value=True), paystack:
            return self.client.post(INITIALIZE_URL, {
                'event_slug': event.slug, 'customer_email': email, 'customer_name': 'Buyer',
                'quantity': 1, 'promo_code': code}, format='json')

    def test_guessing_promo_codes_is_rate_limited(self):
        event = make_event(self.owner, ticket_price=Decimal('5000'))
        codes = [self.client.post(f'/api/events/{event.slug}/validate-promo/', {'code': f'GUESS{i}'}, format='json').status_code
                 for i in range(80)]
        self.assertIn(429, codes)
        self.assertEqual(codes[0], 404)

    def test_a_limited_code_cannot_be_taken_by_more_buyers_than_it_has_uses(self):
        event = make_event(self.owner, ticket_price=Decimal('5000'))
        promo = PromoCode.objects.create(event=event, code='FIRST2', amount=Decimal('10'), discount_type='percentage', max_redemptions=2)
        results = [self.buy(event, 'FIRST2', f'b{i}@example.com').status_code for i in range(4)]
        self.assertEqual(results, [200, 200, 400, 400])
        self.assertEqual(Payment.objects.filter(promo_code=promo).count(), 2)

    def test_an_abandoned_order_gives_its_use_back(self):
        event = make_event(self.owner, ticket_price=Decimal('5000'))
        PromoCode.objects.create(event=event, code='ONE', amount=Decimal('10'), discount_type='percentage', max_redemptions=1)
        self.assertEqual(self.buy(event, 'ONE', 'a@example.com').status_code, 200)
        self.assertEqual(self.buy(event, 'ONE', 'b@example.com').status_code, 400)
        Payment.objects.update(status='failed')
        self.assertEqual(self.buy(event, 'ONE', 'b@example.com').status_code, 200)

    def test_a_free_ticket_code_cannot_be_used_past_its_limit(self):
        event = make_event(self.owner, ticket_price=Decimal('5000'))
        PromoCode.objects.create(event=event, code='FREE1', amount=Decimal('100'), discount_type='percentage', max_redemptions=1)
        with patch('bryo.views._email_tickets'):
            first = self.buy(event, 'FREE1', 'a@example.com').status_code
            second = self.buy(event, 'FREE1', 'b@example.com').status_code
        self.assertEqual((first, second), (201, 400))
        self.assertEqual(Ticket.objects.filter(event=event).count(), 1)

    def test_an_unlimited_code_is_unaffected(self):
        event = make_event(self.owner, ticket_price=Decimal('5000'))
        make_promo(event, code='ANY')
        PromoCode.objects.filter(code='ANY').update(amount=Decimal('10'), discount_type='percentage')
        self.assertEqual([self.buy(event, 'ANY', f'x{i}@example.com').status_code for i in range(3)], [200, 200, 200])
