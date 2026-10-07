"""
Refunds when an event is cancelled.

The rules under test: nobody can ask for a refund, cancelling an event is the
only trigger, and a buyer gets back the ticket price only, never Byro's service
fee or the payment charge. Paystack is faked throughout.
"""
import datetime
import hashlib
import hmac
import json
from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import override_settings
from django.utils import timezone

from .models import AdminMember, Refund, Ticket
from .refunds import MAX_ATTEMPTS, refundable_amount
from .test_payments import (
    PAYMENT_SETTINGS, TEST_SECRET, WEBHOOK_URL, FakeResponse, PaymentTestBase, make_event, make_payment,
)
from .views import _fulfil_payment, compute_available_balance

User = get_user_model()

_ref = iter(range(1000, 9999))


def paid_order(event, *, subtotal='5000.00', fee='250.00', seats=2, **kw):
    """A fulfilled order: the buyer paid ticket price + service fee, and got `seats` tickets."""
    n = next(_ref)
    total = Decimal(subtotal) + Decimal(fee)
    payment = make_payment(
        event, reference=f'EVT-test-{n}', amount=str(total), seats=seats,
        metadata={'subtotal': subtotal, 'service_fee': fee, **kw.pop('metadata', {})}, **kw,
    )
    _fulfil_payment(payment, None)
    payment.refresh_from_db()
    return payment


class FakePaystack:
    """Stands in for Paystack's /refund endpoints and records what we sent."""

    def __init__(self, existing=None, post_status='pending', fail_with=None, unreachable=False,
                 balance=Decimal('10000000')):
        self.balance = balance
        self.existing = existing or []
        self.post_status = post_status
        self.fail_with = fail_with
        self.unreachable = unreachable
        self.posts = []
        self.next_id = 100

    def __call__(self, method, url, **kw):
        if self.unreachable:
            import requests
            raise requests.ConnectionError('network down')
        if method == 'GET' and url.endswith('/balance'):
            return FakeResponse({'status': True, 'data': [{'currency': 'NGN', 'balance': int(self.balance * 100)}]})
        if method == 'GET':
            return FakeResponse({'status': True, 'data': self.existing})
        self.posts.append(kw['json'])
        if self.fail_with:
            return FakeResponse({'status': False, 'message': self.fail_with}, status_code=400)
        self.next_id += 1
        return FakeResponse({'status': True, 'data': {'id': self.next_id, 'status': self.post_status}})


@override_settings(**PAYMENT_SETTINGS)
class RefundTestBase(PaymentTestBase):
    def setUp(self):
        super().setUp()
        self.sent = patch('bryo.mailer.send_email').start()
        self.client.force_authenticate(self.owner)
        self.cancel_url = f'/api/events/{self.event.slug}/cancel/'
        # A Byro admin, who alone can send refunds. (Created first, so nobody
        # else is bootstrapped into the admin team by reaching an admin URL.)
        self.admin = User.objects.create_user(email='admin@byro.test')
        AdminMember.objects.create(email='admin@byro.test', role='admin', added_by_email='test')

    @property
    def admin_url(self):
        return f'/api/admin/events/{self.event.pk}/refunds/'

    def cancel(self, reason='The venue fell through'):
        return self.client.post(self.cancel_url, {'reason': reason}, format='json')

    def as_admin(self, post=None, **body):
        """Call the admin refunds endpoint as the Byro admin."""
        self.client.force_authenticate(self.admin)
        res = self.client.post(self.admin_url, body, format='json')
        self.client.force_authenticate(self.owner)
        return res

    def run_with(self, paystack, fn=None):
        with patch('bryo.refunds.requests.request', side_effect=paystack):
            return (fn or self.cancel)()

    def cancel_and_send(self, paystack, **send):
        """Cancel, then have a Byro admin approve and send the refunds."""
        with patch('bryo.refunds.requests.request', side_effect=paystack):
            self.cancel()
            return self.as_admin(action='send', **send)

    def recipients(self):
        return [c.args[0] for c in self.sent.call_args_list]


class RefundAmountTests(RefundTestBase):
    """The buyer gets the ticket price, not the fees that were added on top."""

    def test_service_fee_is_not_refunded(self):
        payment = paid_order(self.event, subtotal='5000.00', fee='250.00')
        self.assertEqual(payment.amount, Decimal('5250.00'))
        self.assertEqual(refundable_amount(payment), Decimal('5000.00'))

    def test_a_promo_discount_is_respected(self):
        # 2 tickets at 5,000 with 1,000 off: the buyer paid 9,000 + 5% fee
        payment = paid_order(self.event, subtotal='9000.00', fee='450.00')
        self.assertEqual(refundable_amount(payment), Decimal('9000.00'))

    def test_payments_from_before_we_stored_the_subtotal_still_work(self):
        payment = paid_order(self.event, subtotal='5000.00', fee='250.00')
        payment.metadata = {}
        self.assertEqual(refundable_amount(payment), Decimal('5000.00'))  # 5,250 / 1.05

    def test_legacy_payment_when_the_organiser_absorbed_the_fee(self):
        self.event.pass_fee_to_attendee = False
        self.event.save()
        payment = paid_order(self.event, subtotal='5000.00', fee='0.00')
        payment.metadata = {}
        self.assertEqual(refundable_amount(payment), Decimal('5000.00'))


class CancelEventTests(RefundTestBase):

    def test_only_the_owner_can_cancel(self):
        self.client.force_authenticate(None)
        self.assertEqual(self.cancel().status_code, 401)
        stranger = User.objects.create_user(email='stranger@example.com')
        self.client.force_authenticate(stranger)
        self.assertEqual(self.cancel().status_code, 403)
        self.event.refresh_from_db()
        self.assertIsNone(self.event.cancelled_at)

    def test_a_reason_is_required(self):
        self.assertEqual(self.cancel(reason='  ').status_code, 400)
        self.event.refresh_from_db()
        self.assertIsNone(self.event.cancelled_at)

    def test_preview_changes_nothing_and_shows_the_refund_total(self):
        paid_order(self.event, subtotal='5000.00', fee='250.00')
        paid_order(self.event, subtotal='3000.00', fee='150.00', seats=1)
        res = self.client.get(self.cancel_url)
        self.assertEqual(res.status_code, 200)
        preview = res.json()['preview']
        self.assertEqual(preview['paid_orders'], 2)
        self.assertEqual(preview['paid_tickets'], 3)
        self.assertEqual(Decimal(preview['refund_total']), Decimal('8000.00'))
        self.event.refresh_from_db()
        self.assertIsNone(self.event.cancelled_at)

    def test_cancelling_voids_tickets_and_records_what_is_owed_but_moves_no_money(self):
        paid_order(self.event, subtotal='5000.00', fee='250.00')
        free = Ticket.objects.create(
            event=self.event, original_owner_name='Free Fan', original_owner_email='free@example.com',
            current_owner_name='Free Fan', current_owner_email='free@example.com', payment_status='free',
        )
        paystack = FakePaystack()
        res = self.run_with(paystack)
        self.assertEqual(res.status_code, 200)
        self.event.refresh_from_db()
        self.assertIsNotNone(self.event.cancelled_at)
        self.assertEqual(self.event.cancel_reason, 'The venue fell through')
        self.assertEqual(set(self.event.tickets.values_list('payment_status', flat=True)), {'refunded', 'cancelled'})
        free.refresh_from_db()
        self.assertEqual(free.payment_status, 'cancelled')
        refund = self.event.refunds.get()
        self.assertEqual(refund.amount, Decimal('5000.00'))
        self.assertEqual(refund.status, Refund.STATUS_AWAITING)
        self.assertEqual(paystack.posts, [], 'cancelling must not move any money')
        self.assertEqual(res.json()['progress']['awaiting'], 1)

    def test_buyers_are_told_the_event_is_off_and_a_refund_is_being_arranged_not_that_it_was_sent(self):
        paid_order(self.event, subtotal='5000.00', fee='250.00')
        self.run_with(FakePaystack())
        self.assertEqual(self.recipients().count('buyer@example.com'), 1)
        mail = next(c for c in self.sent.call_args_list if c.args[0] == 'buyer@example.com')
        self.assertIn('being arranged', mail.args[2])
        self.assertNotIn('Refund sent', mail.args[2])
        self.assertNotIn('is on its way', mail.args[2])
        self.assertNotIn('sent', mail.args[1])  # the subject does not claim it was sent

    def test_byro_is_alerted_when_there_is_money_to_refund(self):
        paid_order(self.event)
        self.run_with(FakePaystack())
        self.assertIn('support@usebyro.com', self.recipients())

    def test_cancelled_tickets_leave_the_organisers_balance(self):
        paid_order(self.event, subtotal='5000.00', fee='250.00', seats=1)
        self.assertEqual(compute_available_balance(self.owner), Decimal('5000.00'))
        self.run_with(FakePaystack())
        self.assertEqual(compute_available_balance(self.owner), Decimal('0'))

    def test_cannot_cancel_twice(self):
        self.run_with(FakePaystack())
        self.assertEqual(self.run_with(FakePaystack()).status_code, 400)

    def test_a_draft_or_past_event_cannot_be_cancelled(self):
        self.event.day = timezone.now().date() - datetime.timedelta(days=1)
        self.event.save()
        self.assertEqual(self.cancel().status_code, 400)
        self.event.day = timezone.now().date() + datetime.timedelta(days=3)
        self.event.is_draft = True
        self.event.save()
        self.assertEqual(self.cancel().status_code, 400)

    def test_organisers_cannot_set_the_cancelled_flag_by_editing(self):
        res = self.client.patch(f'/api/events/{self.event.slug}/', {'cancelled_at': '2026-01-01T00:00:00Z'}, format='json')
        self.event.refresh_from_db()
        self.assertIsNone(self.event.cancelled_at, res.content)

    def test_a_cancelled_event_stops_selling_and_leaves_the_listings(self):
        self.run_with(FakePaystack())
        self.client.force_authenticate(None)
        with patch('bryo.views.check_and_remember_verification', return_value=True):
            res = self.client.post('/api/payments/initialize/', {
                'event_slug': self.event.slug, 'customer_email': 'late@example.com',
                'customer_name': 'Late Buyer', 'quantity': 1,
            }, format='json')
        self.assertEqual(res.status_code, 400)
        self.assertIn('cancelled', res.json()['error'])
        reg = self.client.post(f'/api/events/{self.event.slug}/register/', {'name': 'X', 'email': 'x@example.com'}, format='json')
        self.assertEqual(reg.status_code, 400)
        listing = self.client.get('/api/events/')
        slugs = [e['slug'] for e in (listing.json().get('results') if isinstance(listing.json(), dict) else listing.json())]
        self.assertNotIn(self.event.slug, slugs)
        # ...but the page itself still opens, so people can see why
        page = self.client.get(f'/api/events/{self.event.slug}/')
        self.assertEqual(page.status_code, 200)
        self.assertIsNotNone(page.json()['cancelled_at'])

    def test_a_cancelled_ticket_cannot_be_checked_in(self):
        paid_order(self.event)
        self.run_with(FakePaystack())
        qr = self.event.tickets.first().qr_token
        res = self.client.post(f'/api/events/{self.event.slug}/checkin/', {'qr_token': str(qr)}, format='json')
        self.assertEqual(res.status_code, 400)
        self.assertIn('cancelled', res.json()['error'])

    def test_the_organiser_can_watch_progress_but_not_send_money(self):
        paid_order(self.event)
        self.run_with(FakePaystack())
        url = f'/api/events/{self.event.slug}/refunds/'
        self.assertEqual(self.client.get(url).status_code, 200)
        self.assertEqual(self.client.post(url).status_code, 405)


class AdminSendingTests(RefundTestBase):
    """Only a Byro admin can send refunds, and only after the balance check."""

    def setUp(self):
        super().setUp()
        paid_order(self.event, subtotal='5000.00', fee='250.00')

    def test_the_organiser_cannot_send_refunds(self):
        paystack = FakePaystack()
        with patch('bryo.refunds.requests.request', side_effect=paystack):
            self.cancel()
            self.client.force_authenticate(self.owner)
            res = self.client.post(self.admin_url, {'action': 'send'}, format='json')
        self.assertEqual(res.status_code, 403)
        self.assertEqual(paystack.posts, [])

    def test_a_read_only_team_member_cannot_send_refunds(self):
        viewer = User.objects.create_user(email='viewer@byro.test')
        AdminMember.objects.create(email='viewer@byro.test', role='viewer', added_by_email='test')
        paystack = FakePaystack()
        with patch('bryo.refunds.requests.request', side_effect=paystack):
            self.cancel()
            self.client.force_authenticate(viewer)
            res = self.client.post(self.admin_url, {'action': 'send'}, format='json')
        self.assertEqual(res.status_code, 403)
        self.assertEqual(paystack.posts, [])

    def test_an_admin_sends_and_it_is_audit_logged(self):
        from .models import AdminAction
        res = self.cancel_and_send(FakePaystack())
        self.assertEqual(res.status_code, 200)
        self.assertEqual(Refund.objects.get().status, Refund.STATUS_PROCESSING)
        log = AdminAction.objects.get(action=AdminAction.ACTION_REFUNDS_SENT)
        self.assertEqual(log.actor_email, 'admin@byro.test')

    def test_a_low_paystack_balance_stops_the_send_unless_the_admin_confirms(self):
        low = FakePaystack(balance=Decimal('1000'))
        res = self.cancel_and_send(low)
        self.assertEqual(res.status_code, 409)
        self.assertEqual(res.json()['code'], 'low_balance')
        self.assertEqual(low.posts, [])
        self.assertEqual(Refund.objects.get().status, Refund.STATUS_AWAITING)
        with patch('bryo.refunds.requests.request', side_effect=low):
            ok = self.as_admin(action='send', confirm_low_balance=True)
        self.assertEqual(ok.status_code, 200)
        self.assertEqual(len(low.posts), 1)

    def test_the_admin_list_shows_balance_and_what_is_waiting(self):
        self.run_with(FakePaystack())
        self.client.force_authenticate(self.admin)
        with patch('bryo.refunds.requests.request', side_effect=FakePaystack(balance=Decimal('250000'))):
            res = self.client.get('/api/admin/refunds/')
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertEqual(Decimal(body['paystack_balance']), Decimal('250000'))
        self.assertEqual(Decimal(body['awaiting_total']), Decimal('5000'))
        self.assertEqual(body['events'][0]['progress']['awaiting'], 1)


class SendingRefundTests(RefundTestBase):

    def test_paystack_is_asked_for_the_ticket_price_only_and_the_buyer_is_told_it_was_sent(self):
        payment = paid_order(self.event, subtotal='5000.00', fee='250.00')
        paystack = FakePaystack()
        self.cancel_and_send(paystack)

        self.assertEqual(len(paystack.posts), 1)
        sent = paystack.posts[0]
        self.assertEqual(sent['transaction'], payment.paystack_reference)
        self.assertEqual(sent['amount'], 500000)  # NGN 5,000.00 in kobo, not the 5,250 that was charged
        refund = payment.refund
        refund.refresh_from_db()
        self.assertEqual(refund.status, Refund.STATUS_PROCESSING)
        self.assertTrue(refund.paystack_refund_id)
        # two emails: "being arranged" at cancellation, "sent" now
        buyer_mails = [c for c in self.sent.call_args_list if c.args[0] == 'buyer@example.com']
        self.assertEqual(len(buyer_mails), 2)
        sent_mail = buyer_mails[1]
        self.assertIn('has been sent', sent_mail.args[1])
        self.assertIn('5,000', sent_mail.args[2])
        self.assertIn('cannot be refunded', sent_mail.args[2])

    def test_a_retry_adopts_the_refund_paystack_already_has(self):
        payment = paid_order(self.event)
        paystack = FakePaystack(existing=[{'id': 55, 'status': 'processing'}])
        self.cancel_and_send(paystack)
        self.assertEqual(paystack.posts, [], 'must not create a second refund')
        self.assertEqual(payment.refund.paystack_refund_id, '55')

    def test_a_refund_paystack_refuses_is_marked_failed_with_the_reason(self):
        payment = paid_order(self.event)
        self.cancel_and_send(FakePaystack(fail_with='Transaction has been fully reversed'))
        refund = Refund.objects.get(payment=payment)
        self.assertEqual(refund.status, Refund.STATUS_FAILED)
        self.assertIn('fully reversed', refund.failure_reason)
        buyer_mails = [c for c in self.sent.call_args_list if c.args[0] == 'buyer@example.com']
        self.assertEqual(len(buyer_mails), 1, 'only the "being arranged" notice, never "sent"')

    def test_when_paystack_is_unreachable_the_refund_waits_and_then_asks_for_help(self):
        payment = paid_order(self.event)
        down = FakePaystack(unreachable=True)
        # the balance check cannot reach Paystack either, which must not block an admin who confirms
        self.cancel_and_send(down, confirm_low_balance=True)
        refund = Refund.objects.get(payment=payment)
        self.assertEqual(refund.status, Refund.STATUS_PENDING)
        with patch('bryo.refunds.requests.request', side_effect=down):
            for _ in range(MAX_ATTEMPTS):
                self.as_admin(action='continue')
        refund.refresh_from_db()
        self.assertEqual(refund.status, Refund.STATUS_NEEDS_ATTENTION)

    def test_failed_refunds_can_be_retried_by_an_admin(self):
        payment = paid_order(self.event)
        self.cancel_and_send(FakePaystack(fail_with='Insufficient balance'))
        ok = FakePaystack()
        with patch('bryo.refunds.requests.request', side_effect=ok):
            self.as_admin(action='retry')
        self.assertEqual(Refund.objects.get(payment=payment).status, Refund.STATUS_PROCESSING)

    def test_refunds_go_out_in_batches_until_none_are_left(self):
        for _ in range(12):
            paid_order(self.event, seats=1)
        paystack = FakePaystack()
        first = self.cancel_and_send(paystack).json()
        self.assertEqual(first['total_refunds'], 12)
        self.assertEqual(first['waiting'], 2)
        self.assertFalse(first['done'])
        with patch('bryo.refunds.requests.request', side_effect=paystack):
            second = self.as_admin(action='continue').json()
        self.assertEqual(second['waiting'], 0)
        self.assertTrue(second['done'])
        self.assertEqual(len(paystack.posts), 12)

    def test_free_ticket_holders_are_told_once_and_get_no_money_details(self):
        Ticket.objects.create(
            event=self.event, original_owner_name='Free Fan', original_owner_email='free@example.com',
            current_owner_name='Free Fan', current_owner_email='free@example.com', payment_status='free',
        )
        self.run_with(FakePaystack())
        self.assertEqual(self.recipients(), ['free@example.com'])
        with patch('bryo.refunds.requests.request', side_effect=FakePaystack()):
            self.as_admin(action='continue')
        self.assertEqual(self.recipients(), ['free@example.com'], 'no second email')
        self.assertNotIn('refund of', self.sent.call_args_list[0].args[1])

    def test_a_gifted_ticket_holder_hears_about_the_cancellation_but_not_the_money(self):
        payment = paid_order(self.event, seats=2)
        gift = payment.tickets_purchased.first()
        gift.current_owner_email = 'friend@example.com'
        gift.save()
        self.run_with(FakePaystack())
        recipients = self.recipients()
        self.assertEqual(recipients.count('buyer@example.com'), 1)
        self.assertEqual(recipients.count('friend@example.com'), 1)
        friend_mail = next(c for c in self.sent.call_args_list if c.args[0] == 'friend@example.com')
        self.assertNotIn('Your refund', friend_mail.args[2])

    def test_the_organiser_reason_cannot_inject_html_into_the_email(self):
        paid_order(self.event)
        self.run_with(FakePaystack(), lambda: self.cancel(reason='<script>alert(1)</script> sorry'))
        for call in self.sent.call_args_list:
            self.assertNotIn('<script>', call.args[2])


class PaystackRefundWebhookTests(RefundTestBase):

    def webhook(self, event_type, data):
        body = json.dumps({'event': event_type, 'data': data}).encode()
        sig = hmac.new(TEST_SECRET.encode(), body, hashlib.sha512).hexdigest()
        self.client.force_authenticate(None)
        return self.client.post(WEBHOOK_URL, body, content_type='application/json', HTTP_X_PAYSTACK_SIGNATURE=sig)

    def test_processed_and_failed_updates_reach_the_refund(self):
        payment = paid_order(self.event)
        self.cancel_and_send(FakePaystack())
        res = self.webhook('refund.processed', {'status': 'processed', 'transaction_reference': payment.paystack_reference})
        self.assertEqual(res.status_code, 200)
        refund = Refund.objects.get(payment=payment)
        self.assertEqual(refund.status, Refund.STATUS_PROCESSED)
        self.assertIsNotNone(refund.processed_at)
        # a late, stale "failed" must not undo a finished refund
        self.webhook('refund.failed', {'status': 'failed', 'transaction_reference': payment.paystack_reference})
        refund.refresh_from_db()
        self.assertEqual(refund.status, Refund.STATUS_PROCESSED)

    def test_a_failed_refund_is_recorded(self):
        payment = paid_order(self.event)
        self.cancel_and_send(FakePaystack())
        self.webhook('refund.failed', {'status': 'failed', 'transaction_reference': payment.paystack_reference})
        self.assertEqual(Refund.objects.get(payment=payment).status, Refund.STATUS_FAILED)

    def test_an_unknown_reference_is_ignored_politely(self):
        res = self.webhook('refund.processed', {'status': 'processed', 'transaction_reference': 'nope'})
        self.assertEqual(res.status_code, 200)


class LatePaymentTests(RefundTestBase):

    def test_a_buyer_who_pays_after_the_event_was_cancelled_gets_no_ticket_and_a_refund_is_recorded(self):
        payment = make_payment(
            self.event, reference='EVT-late-1', amount='5250.00', seats=1,
            metadata={'subtotal': '5000.00', 'service_fee': '250.00'},
        )
        self.run_with(FakePaystack())  # cancel while this order is still waiting on Paystack
        paystack = FakePaystack()
        with patch('bryo.refunds.requests.request', side_effect=paystack), self.captureOnCommitCallbacks(execute=True):
            tickets, all_tickets = _fulfil_payment(payment, None)
        self.assertEqual((tickets, all_tickets), ([], []))
        self.assertEqual(Ticket.objects.filter(payment=payment).count(), 0)
        self.assertEqual(paystack.posts, [], 'no money moves until a Byro admin approves')
        refund = Refund.objects.get(payment=payment)
        self.assertEqual(refund.status, Refund.STATUS_AWAITING)
        self.assertEqual(refund.amount, Decimal('5000.00'))
        self.assertIn('buyer@example.com', self.recipients(), 'the buyer is told straight away')


class WithdrawalAfterCancellationTests(RefundTestBase):
    """An organiser already paid for an event that is then cancelled cannot withdraw until they have made it up."""

    def payout_post(self, event, amount):
        return self.client.post('/api/payouts/', {
            'event': event.pk, 'amount': str(amount), 'method': 'bank',
            'bank_name': 'GTBank', 'account_number': '0123456789', 'account_name': 'Test Owner',
        }, format='json')

    def test_waiting_payouts_for_the_cancelled_event_are_voided(self):
        from .models import PayoutRequest
        paid_order(self.event, subtotal='5000.00', fee='250.00', seats=1)
        waiting = PayoutRequest.objects.create(
            user=self.owner, event=self.event, amount=Decimal('4000'), method='bank', status='pending',
        )
        self.run_with(FakePaystack())
        waiting.refresh_from_db()
        self.assertEqual(waiting.status, 'rejected')

    def test_withdrawals_are_held_back_until_later_sales_cover_what_was_already_paid_out(self):
        from .models import PayoutRequest
        paid_order(self.event, subtotal='5000.00', fee='250.00', seats=1)
        PayoutRequest.objects.create(
            user=self.owner, event=self.event, amount=Decimal('5000'), method='bank', status='processed',
        )
        self.run_with(FakePaystack())  # cancelled: the 5,000 already paid out is now owed back

        other = make_event(self.owner, name='Next event', ticket_price=Decimal('5000.00'), capacity=100)
        paid_order(other, subtotal='5000.00', fee='250.00', seats=1)
        # the new event earned 5,000, but the cancelled one is 5,000 in the red
        self.assertEqual(compute_available_balance(self.owner, event=other), Decimal('5000.00'))
        self.assertEqual(compute_available_balance(self.owner), Decimal('0'))
        blocked = self.payout_post(other, 3000)
        self.assertEqual(blocked.status_code, 400, blocked.content)
        self.assertIn('cancelled', blocked.json()['error'])

        paid_order(other, subtotal='5000.00', fee='250.00', seats=1)  # more sales on the new event
        ok = self.payout_post(other, 3000)
        self.assertEqual(ok.status_code, 201, ok.content)
        too_much = self.payout_post(other, 6000)
        self.assertEqual(too_much.status_code, 400)


class DeleteGuardTests(RefundTestBase):

    def test_an_event_with_paid_tickets_cannot_be_deleted_only_cancelled(self):
        from .models import Event
        paid_order(self.event)
        res = self.client.delete(f'/api/events/{self.event.slug}/')
        self.assertEqual(res.status_code, 409)
        self.assertIn('Cancel it instead', res.json()['error'])
        self.assertTrue(Event.objects.filter(pk=self.event.pk).exists())

    def test_a_cancelled_event_cannot_be_deleted_until_its_refunds_are_done(self):
        from .models import Event
        payment = paid_order(self.event)
        self.cancel_and_send(FakePaystack())
        self.assertEqual(self.client.delete(f'/api/events/{self.event.slug}/').status_code, 409)
        Refund.objects.filter(payment=payment).update(status=Refund.STATUS_PROCESSED)
        # tickets are 'refunded' now, so nothing is owed and the owner may delete it
        self.assertEqual(self.client.delete(f'/api/events/{self.event.slug}/').status_code, 204)
        self.assertFalse(Event.objects.filter(pk=self.event.pk).exists())

    def test_an_event_with_no_sales_can_still_be_deleted(self):
        self.assertEqual(self.client.delete(f'/api/events/{self.event.slug}/').status_code, 204)

    def test_admins_cannot_delete_an_event_whose_refunds_are_unfinished(self):
        paid_order(self.event)
        self.run_with(FakePaystack())
        owner_admin = User.objects.create_user(email='boss@byro.test')
        AdminMember.objects.create(email='boss@byro.test', role='owner', added_by_email='test')
        self.client.force_authenticate(owner_admin)
        res = self.client.delete(f'/api/admin/events/{self.event.pk}/')
        self.assertEqual(res.status_code, 409)
