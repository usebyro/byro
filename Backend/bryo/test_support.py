"""Admin support tools: find an order, resend a ticket, fix a check-in, refund one order."""
from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import override_settings

from .models import AdminAction, AdminMember, Refund, Stamp, Ticket
from .test_payments import PAYMENT_SETTINGS, PaymentTestBase
from .test_refunds import FakePaystack, paid_order
from .views import compute_available_balance

User = get_user_model()


@override_settings(**PAYMENT_SETTINGS)
class SupportBase(PaymentTestBase):
    def setUp(self):
        super().setUp()
        self.sent = patch('bryo.mailer.send_email').start()
        self.addCleanup(patch.stopall)
        self.admin = User.objects.create_user(email='admin@byro.test')
        AdminMember.objects.create(email='admin@byro.test', role='admin', added_by_email='test')
        self.viewer = User.objects.create_user(email='viewer@byro.test')
        AdminMember.objects.create(email='viewer@byro.test', role='viewer', added_by_email='test')
        self.order = paid_order(self.event, seats=2)
        self.ticket = Ticket.objects.filter(payment=self.order).first()
        self.client.force_authenticate(self.admin)


class LookupTests(SupportBase):

    def test_find_by_email_reference_or_ticket_id(self):
        for q in (self.order.customer_email, self.order.paystack_reference, str(self.ticket.ticket_id)):
            orders = self.client.get('/api/admin/support/', {'q': q}).json()['orders']
            self.assertEqual(len(orders), 1, q)
            o = orders[0]
            self.assertEqual(o['payment']['reference'], self.order.paystack_reference)
            self.assertEqual(len(o['tickets']), 2)
            self.assertEqual(o['payment']['refundable'], '5000.00')
            self.assertIsNone(o['refund'])

    def test_part_of_a_name_email_or_reference_is_enough(self):
        holder = self.ticket.current_owner_name.split()[0]
        for q in (holder.lower(), self.order.customer_email.split('@')[0][:4], self.order.paystack_reference[-6:]):
            orders = self.client.get('/api/admin/support/', {'q': q}).json()['orders']
            self.assertEqual(len(orders), 1, q)

    def test_short_or_unknown_searches(self):
        self.assertEqual(self.client.get('/api/admin/support/', {'q': 'ab'}).status_code, 400)
        self.assertEqual(self.client.get('/api/admin/support/', {'q': 'nobody@nowhere.test'}).json()['orders'], [])

    def test_viewers_can_look_but_not_act(self):
        self.client.force_authenticate(self.viewer)
        self.assertEqual(self.client.get('/api/admin/support/', {'q': self.order.customer_email}).status_code, 200)
        self.assertEqual(self.client.post(f'/api/admin/support/tickets/{self.ticket.ticket_id}/resend/').status_code, 403)
        self.assertEqual(self.client.post(f'/api/admin/support/orders/{self.order.pk}/refund/', {'reason': 'x'}, format='json').status_code, 403)

    def test_strangers_are_refused(self):
        self.client.force_authenticate(User.objects.create_user(email='rando@example.com'))
        self.assertEqual(self.client.get('/api/admin/support/', {'q': self.order.customer_email}).status_code, 403)


class ResendAndCheckinTests(SupportBase):

    def test_resend_goes_to_the_current_holder_and_is_logged(self):
        self.ticket_email.reset_mock()  # PaymentTestBase stands in for the real ticket email
        res = self.client.post(f'/api/admin/support/tickets/{self.ticket.ticket_id}/resend/')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()['sent_to'], self.ticket.current_owner_email)
        ticket, name, email, event = self.ticket_email.call_args.args
        self.assertEqual((ticket.pk, email), (self.ticket.pk, self.ticket.current_owner_email))
        self.assertTrue(AdminAction.objects.filter(action=AdminAction.ACTION_TICKET_RESENT).exists())

    def test_check_in_and_undo(self):
        url = f'/api/admin/support/tickets/{self.ticket.ticket_id}/checkin/'
        self.assertTrue(self.client.post(url, {'checked_in': True}, format='json').json()['checked_in'])
        self.assertTrue(Stamp.objects.filter(ticket=self.ticket).exists())
        self.assertFalse(self.client.post(url, {'checked_in': False}, format='json').json()['checked_in'])
        self.assertFalse(Stamp.objects.filter(ticket=self.ticket).exists())
        self.assertEqual(AdminAction.objects.filter(target_type='ticket').count(), 2)


class OrderRefundTests(SupportBase):

    def refund(self, reason='Bought twice by mistake', paystack=None):
        with patch('bryo.refunds.requests.request', side_effect=paystack or FakePaystack()):
            return self.client.post(f'/api/admin/support/orders/{self.order.pk}/refund/', {'reason': reason}, format='json')

    def test_refunds_the_ticket_price_voids_the_tickets_and_emails_the_buyer(self):
        before = compute_available_balance(self.owner)
        paystack = FakePaystack()
        self.sent.reset_mock()
        res = self.refund(paystack=paystack)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()['amount'], '5000.00')
        self.assertIn('Bought twice by mistake', str(paystack.posts[0]))
        refund = Refund.objects.get(payment=self.order)
        self.assertEqual((refund.amount, refund.reason), (Decimal('5000.00'), 'Bought twice by mistake'))
        self.assertFalse(Ticket.objects.filter(payment=self.order, payment_status='paid').exists())
        self.assertLess(compute_available_balance(self.owner), before)
        self.event.refresh_from_db()
        self.assertIsNone(self.event.cancelled_at)  # the event goes ahead
        subjects = [c.args[1] for c in self.sent.call_args_list]
        self.assertIn(f'Your refund for {self.event.name}', subjects)
        self.assertTrue(AdminAction.objects.filter(action=AdminAction.ACTION_ORDER_REFUNDED).exists())

    def test_cannot_refund_twice_or_without_a_reason(self):
        self.assertEqual(self.refund(reason='  ').status_code, 400)
        self.assertEqual(self.refund().status_code, 200)
        self.assertEqual(self.refund().status_code, 400)
        self.assertEqual(Refund.objects.count(), 1)

    def test_refunded_tickets_cannot_be_resent_or_checked_in(self):
        self.refund()
        self.assertEqual(self.client.post(f'/api/admin/support/tickets/{self.ticket.ticket_id}/resend/').status_code, 400)
        url = f'/api/admin/support/tickets/{self.ticket.ticket_id}/checkin/'
        self.assertEqual(self.client.post(url, {'checked_in': True}, format='json').status_code, 400)

    def test_paystack_refusal_is_reported_and_kept_for_retry(self):
        res = self.refund(paystack=FakePaystack(fail_with='Transaction already refunded'))
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()['status'], Refund.STATUS_FAILED)
        self.assertIn('already refunded', res.json()['failure_reason'])
