"""Merch orders: checkout, fulfilment steps, when earnings are released, problems, refunds and access."""
import hashlib
import hmac
import json
from datetime import timedelta
from decimal import Decimal
from unittest.mock import MagicMock, patch

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from . import merch
from .models import MerchItem, MerchOrder, Notification, PayoutRequest, UserProfile
from .views import compute_available_balance

User = get_user_model()


class MerchBase(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        for target in ('bryo.mailer.send_email', 'bryo.apps.posthog_client'):
            patch(target, None if 'posthog' in target else MagicMock()).start()
        self.addCleanup(patch.stopall)
        self.seller = User.objects.create_user(email='seller@example.com')
        UserProfile.objects.update_or_create(user=self.seller, defaults={
            'handle': 'lagosrun', 'display_name': 'Lagos Run Club', 'is_public': True,
            'pickup_address': 'Cafe One, Yaba', 'pickup_instructions': 'Ask for Tunde.',
            'delivery_enabled': True, 'delivery_area': 'Lagos only', 'delivery_fee': Decimal('2000'),
        })
        self.tee = MerchItem.objects.create(owner=self.seller, name='Community tee', price=Decimal('12000'), stock=5, options=['M', 'L'])
        self.cap = MerchItem.objects.create(owner=self.seller, name='Dev cap', price=Decimal('8000'))

    def order(self, fulfilment='pickup', lines=None, **extra):
        lines = lines if lines is not None else [{'item_id': self.tee.pk, 'quantity': 1, 'option': 'M'}]
        details = dict(name='Kelechi Obi', email='kelechi@example.com', phone='0803 412 5185')
        if fulfilment == 'delivery':
            details['address'] = '12B Adebayo Street, Surulere, Lagos'
        details.update(extra)
        return merch.create_order(self.seller, lines, fulfilment, **details)

    def paid(self, fulfilment='pickup', **kw):
        order, _ = merch.mark_paid(self.order(fulfilment, **kw), 'card')
        return order


class FulfilmentSettingsTests(MerchBase):
    def put(self, **body):
        self.client.force_authenticate(self.seller)
        return self.client.put('/api/dashboard/merch-orders/fulfilment/', body, format='json')

    def test_pickup_address_is_required_and_delivery_is_optional(self):
        self.assertEqual(self.put(pickup_address='  ').status_code, 400)
        r = self.put(pickup_address='Hub 2, Akoka', delivery_enabled=False)
        self.assertEqual(r.status_code, 200)
        self.assertFalse(r.json()['delivery_enabled'])
        self.assertTrue(r.json()['can_take_payment'])

    def test_a_bad_delivery_fee_is_refused(self):
        self.assertEqual(self.put(pickup_address='Hub', delivery_fee='-5').status_code, 400)
        self.assertEqual(self.put(pickup_address='Hub', delivery_fee='lots').status_code, 400)

    def test_the_public_page_says_whether_buying_is_on(self):
        info = self.client.get('/api/profile/lagosrun/').json() if False else merch.public_checkout_info(self.seller)
        self.assertTrue(info['enabled'])
        self.assertEqual(info['delivery']['fee'], '2000.00')
        UserProfile.objects.filter(user=self.seller).update(pickup_address='')
        self.assertFalse(merch.public_checkout_info(self.seller)['enabled'])

    def test_moving_the_pickup_address_tells_buyers_with_open_orders(self):
        order = self.paid('pickup')
        with patch('bryo.merch_emails.send_order_email') as send:
            r = self.put(pickup_address='Hub 2, Akoka Road')
        self.assertEqual(r.json()['told_buyers'], 1)
        send.assert_called_once()
        self.assertEqual(send.call_args.args[0].pk, order.pk)
        self.assertEqual(send.call_args.args[1], 'moved')


class CheckoutTests(MerchBase):
    def test_totals_and_stock_are_held(self):
        order = self.order('delivery', lines=[
            {'item_id': self.tee.pk, 'quantity': 2, 'option': 'L'}, {'item_id': self.cap.pk, 'quantity': 1}])
        self.assertEqual((order.subtotal, order.delivery_fee, order.amount), (Decimal('32000'), Decimal('2000'), Decimal('34000')))
        self.assertEqual((order.service_fee, order.fee_rate), (Decimal('0'), Decimal('0')))
        self.assertEqual(order.earnings, Decimal('34000'))
        self.tee.refresh_from_db()
        self.assertEqual(self.tee.stock, 3)
        self.assertRegex(order.pickup_code, r'^\d{4}$')
        self.assertTrue(order.ref.startswith('BY-'))

    @override_settings(MERCH_FEE_RATE='0.05')
    def test_a_fee_comes_off_the_items_not_the_delivery_fee(self):
        order = self.order('delivery')
        self.assertEqual((order.service_fee, order.earnings), (Decimal('600.00'), Decimal('13400.00')))
        self.assertEqual(order.amount, Decimal('14000.00'))  # the buyer pays items + delivery, no extra fee

    def test_pickup_is_free_and_needs_no_address(self):
        order = self.order('pickup')
        self.assertEqual((order.delivery_fee, order.amount), (Decimal('0'), Decimal('12000.00')))

    def test_refusals(self):
        cases = [
            ('pickup', [{'item_id': self.tee.pk, 'quantity': 1}], {}, 'option'),                       # needs a size
            ('pickup', [{'item_id': self.tee.pk, 'quantity': 1, 'option': 'XL'}], {}, 'option'),       # not a size
            ('pickup', [{'item_id': self.cap.pk, 'quantity': 1, 'option': 'M'}], {}, 'no options'),
            ('pickup', [{'item_id': self.tee.pk, 'quantity': 6, 'option': 'M'}], {}, 'Only 5'),
            ('pickup', [{'item_id': 99999, 'quantity': 1}], {}, 'no longer available'),
            ('pickup', [], {}, 'at least one'),
            ('delivery', [{'item_id': self.cap.pk, 'quantity': 1}], {'address': 'short'}, 'full delivery address'),
            ('delivery', [{'item_id': self.cap.pk, 'quantity': 1}], {'phone': ''}, 'phone number'),
            ('pickup', [{'item_id': self.cap.pk, 'quantity': 1}], {'email': 'nope'}, "doesn't look right"),
            ('walk', [{'item_id': self.cap.pk, 'quantity': 1}], {}, 'pickup or delivery'),
        ]
        for fulfilment, lines, extra, message in cases:
            with self.assertRaises(merch.MerchError, msg=message) as ctx:
                self.order(fulfilment, lines=lines, **extra)
            self.assertIn(message, ctx.exception.message)
        self.assertEqual(MerchOrder.objects.count(), 0)

    def test_no_pickup_address_means_no_payments_and_delivery_can_be_off(self):
        UserProfile.objects.filter(user=self.seller).update(delivery_enabled=False)
        with self.assertRaises(merch.MerchError) as ctx:
            self.order('delivery')
        self.assertIn("doesn't offer delivery", ctx.exception.message)
        UserProfile.objects.filter(user=self.seller).update(pickup_address='')
        with self.assertRaises(merch.MerchError) as ctx:
            self.order('pickup')
        self.assertEqual(ctx.exception.status, 409)

    def test_hidden_and_taken_down_items_cannot_be_bought(self):
        self.cap.removed_by_admin = True
        self.cap.save()
        with self.assertRaises(merch.MerchError):
            self.order(lines=[{'item_id': self.cap.pk, 'quantity': 1}])

    def test_unpaid_orders_give_their_stock_back_after_the_hold(self):
        order = self.order()
        MerchOrder.objects.filter(pk=order.pk).update(created_at=timezone.now() - timedelta(minutes=30))
        merch.release_stale_reservations()
        order.refresh_from_db()
        self.tee.refresh_from_db()
        self.assertEqual((order.status, self.tee.stock), ('failed', 5))

    def test_a_late_payment_takes_stock_again_or_refunds(self):
        order = self.order()
        merch.fail_order(order)
        with patch('bryo.merch.send_refund') as refund:
            paid, newly = merch.mark_paid(order, 'card')
        self.assertTrue(newly)
        self.assertEqual(paid.status, 'paid')
        self.tee.refresh_from_db()
        self.assertEqual(self.tee.stock, 4)
        refund.assert_not_called()
        # Sold out while they were paying: paid, then refunded straight away.
        second = self.order()
        merch.fail_order(second)
        MerchItem.objects.filter(pk=self.tee.pk).update(stock=0)
        with patch('bryo.merch.send_refund') as refund, self.captureOnCommitCallbacks(execute=True):
            late, _ = merch.mark_paid(second, 'card')
        self.assertEqual(late.status, 'refund_processing')
        refund.assert_called_once_with(second.pk)

    def test_marking_paid_twice_does_nothing_the_second_time(self):
        order = self.order()
        with self.captureOnCommitCallbacks(execute=True):
            _, first = merch.mark_paid(order, 'card')
            _, second = merch.mark_paid(order, 'card')
        self.assertEqual((first, second), (True, False))
        self.assertEqual(Notification.objects.filter(recipient=self.seller, kind='merch_order').count(), 1)


class PaystackFlowTests(MerchBase):
    def body(self, **over):
        body = {'handle': 'lagosrun', 'items': [{'item_id': self.tee.pk, 'quantity': 1, 'option': 'M'}], 'fulfilment': 'pickup',
                'name': 'Kelechi Obi', 'email': 'kelechi@example.com', 'phone': '08034125185'}
        body.update(over)
        return body

    def test_checkout_starts_a_payment_and_returns_the_buyers_key(self):
        res = MagicMock(status_code=200)
        res.json.return_value = {'status': True, 'data': {'authorization_url': 'https://pay.example/x', 'access_code': 'abc'}}
        with patch('bryo.merch_views.requests.post', return_value=res) as post:
            r = self.client.post('/api/merch-orders/checkout/', self.body(), format='json')
        self.assertEqual(r.status_code, 200, r.content)
        data = r.json()
        self.assertEqual(data['authorization_url'], 'https://pay.example/x')
        sent = post.call_args.kwargs['json']
        self.assertEqual(sent['amount'], 1200000)  # kobo
        self.assertIn(data['token'], sent['callback_url'])
        self.assertEqual(MerchOrder.objects.get().status, 'pending')

    def test_if_paystack_refuses_the_stock_goes_back(self):
        res = MagicMock(status_code=400)
        res.json.return_value = {'status': False, 'message': 'no'}
        with patch('bryo.merch_views.requests.post', return_value=res):
            r = self.client.post('/api/merch-orders/checkout/', self.body(), format='json')
        self.assertEqual(r.status_code, 400)
        self.assertIn("haven't been charged", r.json()['error'])
        self.tee.refresh_from_db()
        self.assertEqual((self.tee.stock, MerchOrder.objects.get().status), (5, 'failed'))

    def test_unknown_seller_and_bad_cart_are_clear_errors(self):
        self.assertEqual(self.client.post('/api/merch-orders/checkout/', self.body(handle='nobody'), format='json').status_code, 404)
        r = self.client.post('/api/merch-orders/checkout/', self.body(items=[]), format='json')
        self.assertEqual(r.status_code, 400)

    def test_verify_marks_it_paid_and_checks_the_amount(self):
        order = self.order()
        ok = {'status': 'success', 'amount': 1200000 + 18000, 'channel': 'card'}
        with patch('bryo.views._paystack_transaction', return_value=(ok, None)):
            r = self.client.get(f'/api/merch-orders/verify/{order.paystack_reference}/')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()['order']['status'], 'paid')
        self.assertEqual(r.json()['token'], order.access_token)
        # Underpaid: refused, and the order stays unpaid.
        other = self.order()
        short = {'status': 'success', 'amount': 100, 'channel': 'card'}
        with patch('bryo.views._paystack_transaction', return_value=(short, None)):
            r = self.client.get(f'/api/merch-orders/verify/{other.paystack_reference}/')
        self.assertEqual(r.status_code, 400)
        other.refresh_from_db()
        self.assertEqual(other.status, 'pending')

    def test_a_failed_payment_gives_the_stock_back(self):
        order = self.order()
        with patch('bryo.views._paystack_transaction', return_value=({'status': 'failed'}, None)):
            r = self.client.get(f'/api/merch-orders/verify/{order.paystack_reference}/')
        self.assertEqual(r.status_code, 400)
        self.tee.refresh_from_db()
        self.assertEqual(self.tee.stock, 5)

    def sign(self, payload):
        raw = json.dumps(payload).encode()
        return raw, hmac.new(settings.PAYSTACK_SECRET_KEY.strip().encode(), raw, hashlib.sha512).hexdigest()

    def test_the_webhook_marks_a_merch_order_paid(self):
        order = self.order()
        raw, sig = self.sign({'event': 'charge.success', 'data': {'reference': order.paystack_reference, 'amount': 1200000, 'channel': 'bank'}})
        r = self.client.post('/api/payments/webhook/', data=raw, content_type='application/json', HTTP_X_PAYSTACK_SIGNATURE=sig)
        self.assertEqual(r.status_code, 200)
        order.refresh_from_db()
        self.assertEqual((order.status, order.channel), ('paid', 'bank'))

    def test_the_refund_webhook_finishes_a_merch_refund(self):
        order = self.paid()
        with patch('bryo.merch.send_refund'):
            merch.cancel(order, 'Out of stock')
        raw, sig = self.sign({'event': 'refund.processed', 'data': {'transaction_reference': order.paystack_reference, 'status': 'processed'}})
        r = self.client.post('/api/payments/webhook/', data=raw, content_type='application/json', HTTP_X_PAYSTACK_SIGNATURE=sig)
        self.assertEqual(r.status_code, 200)
        order.refresh_from_db()
        self.assertEqual(order.status, 'refunded')


class FulfilmentStepsTests(MerchBase):
    def test_a_delivery_goes_paid_packed_shipped_delivered(self):
        order = self.paid('delivery')
        order = merch.advance(order, 'pack')
        self.assertEqual(order.status, 'packed')
        order = merch.advance(order, 'ship', courier='GIG', tracking='GIG-1')
        self.assertEqual((order.status, order.courier, order.tracking), ('shipped', 'GIG', 'GIG-1'))
        order = merch.advance(order, 'delivered')
        self.assertEqual(order.status, 'delivered')

    def test_steps_cannot_be_skipped_or_crossed(self):
        delivery, pickup = self.paid('delivery'), self.paid('pickup')
        with self.assertRaises(merch.MerchError):
            merch.advance(delivery, 'delivered')   # not shipped yet
        with self.assertRaises(merch.MerchError):
            merch.advance(delivery, 'ready')       # a pickup step
        with self.assertRaises(merch.MerchError):
            merch.advance(pickup, 'pack')          # a delivery step
        with self.assertRaises(merch.MerchError):
            merch.advance(pickup, 'picked_up')     # not ready yet

    def test_a_pickup_goes_paid_ready_picked_up_and_emails_the_buyer(self):
        order = self.paid('pickup')
        with patch('bryo.merch._email') as email, self.captureOnCommitCallbacks(execute=True):
            order = merch.advance(order, 'ready')
        email.assert_called_with(order, 'ready')
        self.assertEqual(merch.advance(order, 'picked_up').status, 'picked_up')


class ReleaseRuleTests(MerchBase):
    """When an order's earnings can be withdrawn."""

    def days_from_now(self, order):
        order.refresh_from_db()
        return None if order.release_at is None else (order.release_at - timezone.now()).total_seconds() / 86400

    def test_nothing_is_released_before_the_order_is_ready_or_shipped(self):
        order = self.paid('delivery')
        self.assertIsNone(order.release_at)
        self.assertIsNone(merch.advance(order, 'pack').release_at)

    def test_pickup_with_the_buyers_code_releases_straight_away(self):
        order = merch.advance(self.paid('pickup'), 'ready')
        self.assertAlmostEqual(self.days_from_now(order), 7, delta=0.01)   # never collected: 7 days
        done = merch.advance(order, 'picked_up', code=order.pickup_code)
        self.assertTrue(done.code_verified)
        self.assertLessEqual(done.release_at, timezone.now())

    def test_a_wrong_code_is_refused_and_changes_nothing(self):
        order = merch.advance(self.paid('pickup'), 'ready')
        with self.assertRaises(merch.MerchError):
            merch.advance(order, 'picked_up', code='0000')
        order.refresh_from_db()
        self.assertEqual(order.status, 'ready')

    def test_pickup_without_the_code_waits_three_days(self):
        order = merch.advance(self.paid('pickup'), 'ready')
        done = merch.advance(order, 'picked_up')
        self.assertFalse(done.code_verified)
        self.assertAlmostEqual(self.days_from_now(done), 3, delta=0.01)

    def test_delivery_waits_three_days_after_delivered_or_ten_after_shipped(self):
        shipped = merch.advance(self.paid('delivery'), 'ship')
        self.assertAlmostEqual(self.days_from_now(shipped), 10, delta=0.01)
        delivered = merch.advance(shipped, 'delivered')
        self.assertAlmostEqual(self.days_from_now(delivered), 3, delta=0.01)

    def test_a_late_delivered_mark_never_pushes_the_release_later(self):
        shipped = merch.advance(self.paid('delivery'), 'ship')
        MerchOrder.objects.filter(pk=shipped.pk).update(release_at=timezone.now() + timedelta(days=1))
        delivered = merch.advance(MerchOrder.objects.get(pk=shipped.pk), 'delivered')
        self.assertLess(self.days_from_now(delivered), 1.01)

    def test_the_buyer_confirming_marks_it_done_with_the_same_wait(self):
        pickup = merch.advance(self.paid('pickup'), 'ready')
        self.assertEqual(merch.confirm_by_buyer(pickup).status, 'picked_up')
        self.assertAlmostEqual(self.days_from_now(pickup), 3, delta=0.01)
        delivery = merch.advance(self.paid('delivery'), 'ship')
        self.assertEqual(merch.confirm_by_buyer(delivery).status, 'delivered')
        with self.assertRaises(merch.MerchError):
            merch.confirm_by_buyer(self.paid('delivery'))   # not shipped yet


class BalanceTests(MerchBase):
    def release(self, order, days):
        MerchOrder.objects.filter(pk=order.pk).update(release_at=timezone.now() + timedelta(days=days))

    def test_the_four_buckets(self):
        not_yet = self.paid('delivery')                                    # 14,000
        releasing = merch.advance(self.paid('pickup'), 'ready')            # 12,000, ready: releases in 7 days
        available = merch.advance(self.paid('pickup'), 'ready')
        self.release(available, -1)                                        # 12,000, window passed
        held = merch.advance(self.paid('pickup'), 'ready')
        merch.report_problem(held, 'not_received')                         # 12,000
        b = merch.balances(self.seller)
        self.assertEqual({k: str(v) for k, v in b.items()}, {
            'available': '12000.00', 'releasing': '12000.00', 'on_hold': '12000.00', 'not_released': '14000.00'})
        self.assertTrue(not_yet and releasing)

    def test_refunded_and_cancelled_orders_count_for_nothing(self):
        order = self.paid('pickup')
        with patch('bryo.merch.send_refund'):
            merch.cancel(order, 'Sorry')
        self.assertEqual(sum(merch.balances(self.seller).values()), Decimal('0'))

    def test_released_merch_money_joins_the_withdrawable_balance_and_can_be_withdrawn(self):
        order = merch.advance(self.paid('pickup'), 'ready')
        self.assertEqual(compute_available_balance(self.seller), Decimal('0'))
        self.release(order, -1)
        self.assertEqual(compute_available_balance(self.seller), Decimal('12000.00'))
        PayoutRequest.objects.create(user=self.seller, amount=Decimal('5000'), method='bank', status='pending')
        self.assertEqual(compute_available_balance(self.seller), Decimal('7000.00'))

    def test_a_refund_after_money_was_withdrawn_takes_the_balance_below_zero(self):
        order = merch.advance(self.paid('pickup'), 'ready')
        self.release(order, -1)
        PayoutRequest.objects.create(user=self.seller, amount=Decimal('12000'), method='bank', status='processed')
        with patch('bryo.merch.send_refund'):
            merch.admin_refund(MerchOrder.objects.get(pk=order.pk), 'Buyer emailed support after the window')
        self.assertEqual(compute_available_balance(self.seller), Decimal('-12000.00'))


class AccountTests(MerchBase):
    def test_the_payouts_balance_endpoint_shows_merch_money_and_any_shortfall(self):
        self.client.force_authenticate(self.seller)
        releasing = merch.advance(self.paid('pickup'), 'ready')
        r = self.client.get('/api/payouts/balance/').json()
        self.assertEqual(Decimal(r['available']), 0)
        self.assertEqual((r['merch']['releasing'], r['merch']['not_released'], Decimal(r['shortfall'])), ('12000.00', '0.00', 0))
        MerchOrder.objects.filter(pk=releasing.pk).update(release_at=timezone.now() - timedelta(hours=1))
        self.assertEqual(Decimal(self.client.get('/api/payouts/balance/').json()['available']), 12000)
        PayoutRequest.objects.create(user=self.seller, amount=Decimal('12000'), method='bank', status='processed')
        with patch('bryo.merch.send_refund'):
            merch.admin_refund(MerchOrder.objects.get(pk=releasing.pk), 'Late complaint')
        r = self.client.get('/api/payouts/balance/').json()
        self.assertEqual((Decimal(r['available']), Decimal(r['shortfall'])), (0, 12000))

    def test_an_organiser_with_open_merch_orders_cannot_be_deleted(self):
        from .accounts import delete_blockers
        self.assertFalse([r for r in delete_blockers(self.seller) if 'merch' in r])
        order = self.paid('pickup')
        self.assertTrue([r for r in delete_blockers(self.seller) if 'merch orders' in r])
        merch.advance(merch.advance(order, 'ready'), 'picked_up', code=order.pickup_code)
        self.assertFalse([r for r in delete_blockers(self.seller) if 'merch orders' in r])


class ProblemTests(MerchBase):
    def test_reporting_holds_the_money_until_byro_decides(self):
        order = merch.advance(self.paid('delivery'), 'ship')
        reported = merch.report_problem(order, 'not_received', 'Nothing came.')
        self.assertTrue(reported.on_hold)
        self.assertEqual(merch.balances(self.seller)['on_hold'], Decimal('14000.00'))
        with self.assertRaises(merch.MerchError):
            merch.report_problem(order, 'damaged')            # already open

    def test_a_bad_reason_or_a_closed_window_is_refused(self):
        order = merch.advance(self.paid('pickup'), 'ready')
        with self.assertRaises(merch.MerchError):
            merch.report_problem(order, 'rude')
        MerchOrder.objects.filter(pk=order.pk).update(release_at=timezone.now() - timedelta(hours=1))
        with self.assertRaises(merch.MerchError) as ctx:
            merch.report_problem(MerchOrder.objects.get(pk=order.pk), 'damaged')
        self.assertIn('has passed', ctx.exception.message)

    def test_releasing_pays_the_organiser_now(self):
        order = merch.report_problem(merch.advance(self.paid('pickup'), 'ready'), 'other')
        released = merch.resolve_report(order, 'release')
        self.assertFalse(released.on_hold)
        self.assertEqual(merch.balances(self.seller)['available'], Decimal('12000.00'))

    def test_refunding_cancels_the_order_and_asks_paystack(self):
        order = merch.report_problem(merch.advance(self.paid('delivery'), 'ship'), 'not_received')
        with patch('bryo.merch.send_refund') as refund, self.captureOnCommitCallbacks(execute=True):
            result = merch.resolve_report(order, 'refund')
        self.assertEqual(result.status, 'refund_processing')
        self.assertEqual(result.refund_amount, Decimal('14000.00'))   # items and delivery fee
        refund.assert_called_once_with(order.pk)

    def test_buyer_endpoints_need_the_token(self):
        order = merch.advance(self.paid('pickup'), 'ready')
        url = f'/api/merch-orders/{order.ref}/'
        self.assertEqual(self.client.get(url).status_code, 404)
        self.assertEqual(self.client.get(url, {'token': 'wrong'}).status_code, 404)
        r = self.client.get(url, {'token': order.access_token})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()['pickup_code'], order.pickup_code)
        self.assertNotIn('buyer_email', json.dumps(r.json()))
        r = self.client.post(url + 'report/', {'token': order.access_token, 'reason': 'damaged', 'note': 'Torn'}, format='json')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()['problem']['reason'], 'damaged')
        self.assertEqual(self.client.post(url + 'confirm/', {'token': 'x'}, format='json').status_code, 404)


class CancelAndRefundTests(MerchBase):
    def test_cancelling_before_sending_refunds_items_and_delivery_and_restocks(self):
        order = self.paid('delivery')
        self.tee.refresh_from_db()
        self.assertEqual(self.tee.stock, 4)
        with patch('bryo.merch.send_refund'):
            result = merch.cancel(order, 'Sold out in your size')
        self.assertEqual((result.status, result.refund_amount), ('refund_processing', Decimal('14000.00')))
        self.tee.refresh_from_db()
        self.assertEqual(self.tee.stock, 5)

    def test_a_shipped_order_cannot_be_cancelled_but_can_be_marked_undeliverable(self):
        shipped = merch.advance(self.paid('delivery'), 'ship')
        with self.assertRaises(merch.MerchError):
            merch.cancel(shipped, 'x')
        with patch('bryo.merch.send_refund'):
            result = merch.cant_deliver(shipped, 'Rider lost it')
        self.assertEqual((result.status, result.refund_amount), ('refund_processing', Decimal('14000.00')))
        self.tee.refresh_from_db()
        self.assertEqual(self.tee.stock, 4)    # lost in the post: not back on the shelf

    def cancelled(self):
        order = self.paid('pickup')
        with patch('bryo.merch.send_refund'):
            return merch.cancel(order, 'Sorry')

    def test_the_refund_is_sent_once_and_never_twice(self):
        order = self.cancelled()
        with patch('bryo.refunds.find_paystack_refund', return_value=None), \
                patch('bryo.refunds.create_paystack_refund', return_value={'id': 777, 'status': 'pending'}) as create:
            merch.send_refund(order.pk)
            merch.send_refund(order.pk)
        create.assert_called_once()
        order.refresh_from_db()
        self.assertEqual((order.paystack_refund_id, order.status), ('777', 'refund_processing'))

    def test_a_refund_paystack_already_holds_is_adopted(self):
        order = self.cancelled()
        with patch('bryo.refunds.find_paystack_refund', return_value={'id': 55, 'status': 'processed'}), \
                patch('bryo.refunds.create_paystack_refund') as create:
            merch.send_refund(order.pk)
        create.assert_not_called()
        order.refresh_from_db()
        self.assertEqual(order.status, 'refunded')

    def test_a_failed_refund_stays_open_and_tells_the_admins(self):
        from .refunds import PaystackUnavailable
        from .models import AdminMember
        AdminMember.objects.create(email='boss@example.com', role='admin')
        User.objects.create_user(email='boss@example.com')
        order = self.cancelled()
        with patch('bryo.refunds.find_paystack_refund', side_effect=PaystackUnavailable('down')):
            merch.send_refund(order.pk)
        order.refresh_from_db()
        self.assertEqual(order.status, 'refund_processing')
        self.assertIn('down', order.refund_failure)
        self.assertTrue(Notification.objects.filter(kind='refunds_pending', title__contains=order.ref).exists())


class TimeBasedTests(MerchBase):
    def aged(self, days):
        order = self.paid('pickup')
        MerchOrder.objects.filter(pk=order.pk).update(paid_at=timezone.now() - timedelta(days=days))
        return order

    def test_unstarted_orders_are_reminded_at_ten_days_once(self):
        order = self.aged(10)
        with patch('bryo.merch._email') as email:
            first = merch.process_due_orders()
            second = merch.process_due_orders()
        self.assertEqual((first['reminded'], second['reminded']), (1, 0))
        email.assert_called_once()
        self.assertEqual(email.call_args.args[1], 'waiting')
        order.refresh_from_db()
        self.assertEqual(order.status, 'paid')

    def test_orders_untouched_for_fourteen_days_are_cancelled_and_refunded(self):
        young, old = self.aged(13), self.aged(14)
        with patch('bryo.merch.send_refund') as refund, patch('bryo.merch._email'), self.captureOnCommitCallbacks(execute=True):
            summary = merch.process_due_orders()
            merch.process_due_orders()   # a second run straight after does not send it again
        self.assertEqual(summary['cancelled'], 1)
        young.refresh_from_db()
        old.refresh_from_db()
        self.assertEqual((young.status, old.status), ('paid', 'refund_processing'))
        refund.assert_called_once_with(old.pk)

    def test_started_orders_are_left_alone(self):
        order = self.aged(20)
        merch.advance(MerchOrder.objects.get(pk=order.pk), 'ready')
        with patch('bryo.merch.send_refund') as refund:
            merch.process_due_orders()
        refund.assert_not_called()


class ReleaseNoticeTests(MerchBase):
    def test_the_organiser_is_told_once_when_money_becomes_available(self):
        order = merch.advance(self.paid('pickup'), 'ready')
        self.assertEqual(merch.process_due_orders()['released'], 0)          # still in its window
        MerchOrder.objects.filter(pk=order.pk).update(release_at=timezone.now() - timedelta(minutes=1))
        self.assertEqual(merch.process_due_orders()['released'], 1)
        self.assertEqual(merch.process_due_orders()['released'], 0)          # never twice
        note = Notification.objects.get(recipient=self.seller, kind='merch_released')
        self.assertIn('₦12,000 from order', note.title)
        self.assertEqual(note.link, '/dashboard/payouts')

    def test_held_orders_are_not_announced_until_released(self):
        order = merch.report_problem(merch.advance(self.paid('pickup'), 'ready'), 'damaged')
        MerchOrder.objects.filter(pk=order.pk).update(release_at=timezone.now() - timedelta(minutes=1))
        self.assertEqual(merch.process_due_orders()['released'], 0)

    def test_the_balance_says_when_the_next_money_arrives(self):
        self.client.force_authenticate(self.seller)
        self.assertIsNone(self.client.get('/api/payouts/balance/').json()['merch']['next_release_at'])
        order = merch.advance(self.paid('pickup'), 'ready')
        r = self.client.get('/api/payouts/balance/').json()['merch']
        self.assertIsNotNone(r['next_release_at'])
        self.assertEqual(r['releasing'], '12000.00')


class OrganiserApiTests(MerchBase):
    def setUp(self):
        super().setUp()
        self.client.force_authenticate(self.seller)

    def test_orders_are_filtered_counted_and_searchable(self):
        a = self.paid('delivery', name='Adaeze Okafor')
        b = merch.advance(self.paid('pickup', name='Tunde Bello'), 'ready')
        r = self.client.get('/api/dashboard/merch-orders/').json()
        self.assertEqual([o['ref'] for o in r['results']], [a.ref])
        self.assertEqual(r['counts'], {'need': 1, 'shipped': 1, 'done': 0, 'all': 2})
        self.assertEqual([o['ref'] for o in self.client.get('/api/dashboard/merch-orders/?filter=shipped').json()['results']], [b.ref])
        self.assertEqual([o['ref'] for o in self.client.get('/api/dashboard/merch-orders/?q=tunde').json()['results']], [b.ref])
        self.assertEqual([o['ref'] for o in self.client.get(f'/api/dashboard/merch-orders/?q={a.ref}').json()['results']], [a.ref])

    def test_unpaid_orders_never_show(self):
        self.order()
        self.assertEqual(self.client.get('/api/dashboard/merch-orders/?filter=all').json()['results'], [])

    def test_other_organisers_cannot_see_or_move_an_order(self):
        order = self.paid('pickup')
        other = User.objects.create_user(email='other@example.com')
        self.client.force_authenticate(other)
        self.assertEqual(self.client.get(f'/api/dashboard/merch-orders/{order.ref}/').status_code, 404)
        r = self.client.post(f'/api/dashboard/merch-orders/{order.ref}/action/', {'action': 'ready'}, format='json')
        self.assertEqual(r.status_code, 404)
        self.assertEqual(self.client.get('/api/dashboard/merch-orders/?filter=all').json()['results'], [])

    def test_action_endpoint_moves_an_order_and_explains_refusals(self):
        order = self.paid('delivery')
        url = f'/api/dashboard/merch-orders/{order.ref}/action/'
        r = self.client.post(url, {'action': 'delivered'}, format='json')
        self.assertEqual(r.status_code, 409)
        r = self.client.post(url, {'action': 'ship', 'courier': 'GIG', 'tracking': 'GIG-9'}, format='json')
        self.assertEqual(r.status_code, 200)
        self.assertEqual((r.json()['status'], r.json()['tracking']), ('shipped', 'GIG-9'))
        self.assertEqual(self.client.post(url, {'action': 'explode'}, format='json').status_code, 400)

    def test_the_detail_shows_the_buyer_the_money_and_when_it_arrives(self):
        order = merch.advance(self.paid('delivery'), 'ship')
        d = self.client.get(f'/api/dashboard/merch-orders/{order.ref}/').json()
        self.assertEqual(d['buyer']['phone'], '0803 412 5185')
        self.assertEqual((d['earnings'], d['delivery_fee'], d['release_state']), ('14000.00', '2000.00', 'releasing'))
        self.assertIn('Surulere', d['delivery_address'])

    def test_bulk_moves_what_it_can_and_reports_the_rest(self):
        a, b = self.paid('pickup'), self.paid('pickup')
        d = self.paid('delivery')
        r = self.client.post('/api/dashboard/merch-orders/bulk/', {'action': 'ready', 'refs': [a.ref, b.ref, d.ref, 'BY-9999']}, format='json')
        self.assertEqual(set(r.json()['done']), {a.ref, b.ref})
        self.assertEqual({f['ref'] for f in r.json()['failed']}, {d.ref, 'BY-9999'})
        self.assertEqual(self.client.post('/api/dashboard/merch-orders/bulk/', {'action': 'cancel', 'refs': [a.ref]}, format='json').status_code, 400)

    def test_the_balance_endpoint_lists_the_orders_behind_the_held_money(self):
        held = merch.report_problem(merch.advance(self.paid('pickup'), 'ready'), 'damaged')
        r = self.client.get('/api/dashboard/merch-orders/balance/').json()
        self.assertEqual(r['merch']['on_hold'], '12000.00')
        self.assertEqual([o['ref'] for o in r['orders']], [held.ref])


class AdminTests(MerchBase):
    def setUp(self):
        super().setUp()
        from .models import AdminMember
        self.boss = User.objects.create_user(email='boss@example.com')
        AdminMember.objects.create(email='boss@example.com', role='admin')
        self.viewer = User.objects.create_user(email='viewer@example.com')
        AdminMember.objects.create(email='viewer@example.com', role='viewer')
        self.held = merch.report_problem(merch.advance(self.paid('delivery'), 'ship'), 'not_received', 'Never came')

    def test_admins_see_held_orders_and_resolve_them(self):
        self.client.force_authenticate(self.boss)
        held = self.client.get('/api/admin/merch-orders/held/').json()['results']
        self.assertEqual([o['ref'] for o in held], [self.held.ref])
        self.assertEqual(held[0]['problem']['note'], 'Never came')
        r = self.client.post(f'/api/admin/merch-orders/{self.held.ref}/resolve/', {'outcome': 'release'}, format='json')
        self.assertEqual(r.status_code, 200)
        self.assertFalse(r.json()['on_hold'])
        self.assertEqual(self.client.get('/api/admin/merch-orders/held/').json()['results'], [])

    def test_admins_can_refund_an_order_outside_the_problem_flow(self):
        self.client.force_authenticate(self.boss)
        other = merch.advance(self.paid('pickup'), 'ready')
        url = f'/api/admin/merch-orders/{other.ref}/refund/'
        self.assertEqual(self.client.post(url, {}, format='json').status_code, 400)   # a reason is required
        with patch('bryo.merch.send_refund'):
            r = self.client.post(url, {'reason': 'Buyer emailed after the window'}, format='json')
        self.assertEqual((r.status_code, r.json()['status']), (200, 'refund_processing'))
        self.assertEqual(self.client.post(url, {'reason': 'again'}, format='json').status_code, 409)

    def test_refunding_a_held_order_closes_its_problem(self):
        with patch('bryo.merch.send_refund'):
            refunded = merch.admin_refund(self.held, 'Not received')
        self.assertFalse(refunded.on_hold)
        self.assertEqual(refunded.report_outcome, 'refund')

    def test_viewers_and_anonymous_cannot_resolve(self):
        url = f'/api/admin/merch-orders/{self.held.ref}/resolve/'
        self.assertIn(self.client.post(url, {'outcome': 'release'}, format='json').status_code, (401, 403))
        self.client.force_authenticate(self.viewer)
        self.assertEqual(self.client.post(url, {'outcome': 'release'}, format='json').status_code, 403)


class EmailTests(MerchBase):
    def test_every_email_builds_with_the_right_facts_and_no_em_dashes(self):
        from . import merch_emails as me
        pickup = merch.advance(self.paid('pickup'), 'ready')
        delivery = merch.advance(self.paid('delivery'), 'ship', courier='GIG Logistics', tracking='GIG-48213377')
        with patch('bryo.merch.send_refund'):
            cancelled = merch.cancel(self.paid('delivery'), 'Sold out')
        reported = merch.report_problem(delivery, 'not_received', 'Nothing came')
        cases = [
            (me.receipt_email(self.paid('pickup')), ['Cafe One, Yaba']),
            (me.receipt_email(self.paid('delivery')), ['Surulere', '₦14,000']),
            (me.ready_email(pickup), [pickup.pickup_code, 'Ask for Tunde', 'Cafe One']),
            (me.shipped_email(delivery), ['GIG Logistics', 'GIG-48213377']),
            (me.refunded_email(cancelled), ['₦14,000', 'Sold out', '3 to 10 working days']),
            (me.pickup_moved_email(pickup), ['Cafe One, Yaba']),
            (me.problem_email(reported), ['Nothing came', 'on hold']),
            (me.waiting_email(self.paid('pickup')), ['refund']),
        ]
        for mail, expected in cases:
            blob = mail['html'] + mail['text'] + mail['subject']
            for fact in expected:
                self.assertIn(fact, blob, f"{mail['subject']}: {fact}")
            self.assertNotIn('—', blob, mail['subject'])
            self.assertIn('token=' if 'View your order' in mail['html'] else 'dashboard', blob)

    def test_the_hook_sends_to_the_buyer_or_the_organiser(self):
        from .mailer import send_email
        order = self.paid('pickup')
        send_email.reset_mock()
        merch.advance(order, 'ready')
        with self.captureOnCommitCallbacks(execute=True):
            merch.advance(self.paid('pickup'), 'ready')
        recipients = {c.args[0] for c in send_email.call_args_list}
        self.assertIn('kelechi@example.com', recipients)
        send_email.reset_mock()
        merch.report_problem(MerchOrder.objects.get(pk=order.pk), 'damaged')
        with self.captureOnCommitCallbacks(execute=True):
            merch.report_problem(merch.advance(self.paid('pickup'), 'ready'), 'damaged')
        self.assertIn('seller@example.com', {c.args[0] for c in send_email.call_args_list})
