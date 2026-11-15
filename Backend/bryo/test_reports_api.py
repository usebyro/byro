"""The finance sheet's read-only sales report: key-only access, and the numbers it adds up."""
from datetime import timedelta
from decimal import Decimal

from django.core.cache import cache
from django.test import override_settings
from django.utils import timezone

from .models import Payment, PayoutRequest, Refund, Ticket
from .test_community import CommunityBase

URL = '/api/reports/sales/'
KEY = 'k' * 40


@override_settings(REPORTS_API_KEY=KEY)
class SalesReportTests(CommunityBase):
    def setUp(self):
        super().setUp()
        cache.clear()
        self.event.is_draft = False
        self.event.pass_fee_to_attendee = True
        self.event.save()

    def get(self, key=KEY, **params):
        headers = {'HTTP_X_API_KEY': key} if key is not None else {}
        return self.client.get(URL, params, **headers)

    def order(self, subtotal='10000', fee='500', tickets=2, **extra):
        payment = Payment.objects.create(
            event=self.event, customer_email='buyer@example.com', customer_name='Buyer',
            amount=Decimal(subtotal) + Decimal(fee), fee_rate=Decimal('0.0500'),
            paystack_reference=f'ref-{Payment.objects.count()}', status='successful', paid_at=timezone.now(),
            metadata={'subtotal': subtotal, 'service_fee': fee}, **extra,
        )
        for _ in range(tickets):
            Ticket.objects.create(
                event=self.event, payment=payment, payment_status='paid',
                original_owner_name='Buyer', original_owner_email='buyer@example.com',
                current_owner_name='Buyer', current_owner_email='buyer@example.com',
            )
        return payment

    def row(self):
        rows = [r for r in self.get().json()['results'] if r['event_id'] == self.event.pk]
        self.assertEqual(len(rows), 1)
        return rows[0]

    def test_a_missing_or_wrong_key_is_401_and_other_sign_in_does_not_work(self):
        self.assertEqual(self.get(key=None).status_code, 401)
        self.assertEqual(self.get(key='nope').status_code, 401)
        # A normal sign-in token is not accepted here.
        self.assertEqual(self.client.get(URL, HTTP_AUTHORIZATION='Bearer some.workos.token').status_code, 401)

    @override_settings(REPORTS_API_KEY='')
    def test_with_no_key_configured_nothing_gets_in(self):
        self.assertEqual(self.get(key='').status_code, 401)

    def test_the_numbers_for_a_paid_event(self):
        self.order('10000', '500', tickets=2)
        self.order('5000', '250', tickets=1)
        row = self.row()
        self.assertEqual((row['tickets_sold'], row['gross_sales'], row['platform_fee']), (3, '15000.00', '750.00'))
        self.assertEqual((row['fee_rate'], row['processing_fee']), ('0.0500', '0.00'))
        self.assertEqual((row['payout_status'], row['payout_amount'], row['payout_date']), ('pending', None, None))
        self.assertEqual(row['organiser'], 'Lagos Run Club')

    def test_refunded_orders_do_not_count(self):
        kept = self.order('10000', '500', tickets=1)
        gone = self.order('4000', '200', tickets=1)
        Refund.objects.create(payment=gone, event=self.event, amount=Decimal('4000'))
        gone.tickets_purchased.update(payment_status='refunded')
        row = self.row()
        self.assertEqual((row['tickets_sold'], row['gross_sales'], row['platform_fee']), (1, '10000.00', '500.00'))
        self.assertTrue(kept)

    def test_a_processed_payout_marks_the_event_paid(self):
        self.order()
        PayoutRequest.objects.create(
            user=self.owner, event=self.event, amount=Decimal('9500'), method='bank',
            status='processed', processed_at=timezone.now(),
        )
        PayoutRequest.objects.create(user=self.owner, event=self.event, amount=Decimal('1'), method='bank', status='pending')
        row = self.row()
        self.assertEqual((row['payout_status'], row['payout_amount']), ('paid', '9500.00'))
        self.assertEqual(row['payout_date'], timezone.now().date().isoformat())

    def test_drafts_are_left_out_and_since_filters_by_event_date(self):
        self.event.is_draft = True
        self.event.save()
        self.assertEqual([r for r in self.get().json()['results'] if r['event_id'] == self.event.pk], [])
        self.event.is_draft = False
        self.event.save()
        later = (self.event.day + timedelta(days=1)).isoformat()
        self.assertEqual([r for r in self.get(since=later).json()['results'] if r['event_id'] == self.event.pk], [])
        self.assertEqual(self.get(since=self.event.day.isoformat()).status_code, 200)
        self.assertEqual(self.get(since='soon').status_code, 400)

    def test_no_attendee_details_are_in_the_response(self):
        self.order()
        text = self.get().content.decode()
        self.assertNotIn('buyer@example.com', text)
        self.assertNotIn('Buyer', text)
