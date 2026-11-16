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

    def handed_over(self, **kw):
        """A pickup handed over against the buyer's code: nothing left to wait for."""
        order = merch.advance(self.paid('pickup', **kw), 'ready')
        return merch.advance(order, 'picked_up', code=order.pickup_code)

    def wait_out(self, order):
        """Skip the 2 days an organiser-only completion waits."""
        MerchOrder.objects.filter(pk=order.pk).update(release_at=timezone.now() - timedelta(minutes=1))
        return MerchOrder.objects.get(pk=order.pk)


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


class PickupMovedNoteTests(MerchBase):
    def put(self, **body):
        self.client.force_authenticate(self.seller)
        return self.client.put('/api/dashboard/merch-orders/fulfilment/', body, format='json')

    def test_a_buyer_who_ordered_before_the_move_is_told_what_changed(self):
        before = self.paid('pickup')
        self.put(pickup_address='Hub 2, Akoka Road')
        after = self.paid('pickup')
        from .merch_views import buyer_payload
        old = buyer_payload(MerchOrder.objects.get(pk=before.pk))['pickup']
        self.assertEqual((old['address'], old['previous_address']), ('Hub 2, Akoka Road', 'Cafe One, Yaba'))
        self.assertIsNotNone(old['changed_at'])
        new = buyer_payload(MerchOrder.objects.get(pk=after.pk))['pickup']
        self.assertIsNone(new['changed_at'])         # they ordered after the move, so nothing changed for them
        self.assertEqual(new['previous_address'], '')

    def test_changing_only_the_instructions_is_not_a_move(self):
        order = self.paid('pickup')
        self.put(pickup_address='Cafe One, Yaba', pickup_instructions='Weekdays 10 to 5')
        from .merch_views import buyer_payload
        self.assertIsNone(buyer_payload(MerchOrder.objects.get(pk=order.pk))['pickup']['changed_at'])


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

    def test_new_order_and_problem_notifications_open_that_order(self):
        order = self.order()
        with self.captureOnCommitCallbacks(execute=True):
            merch.mark_paid(order, 'card')
        note = Notification.objects.get(recipient=self.seller, kind='merch_order')
        self.assertEqual(note.link, f'/dashboard/merch?tab=orders&order={order.ref}')
        merch.advance(MerchOrder.objects.get(pk=order.pk), 'ready')
        with self.captureOnCommitCallbacks(execute=True):
            merch.report_problem(MerchOrder.objects.get(pk=order.pk), 'damaged')
        problem = Notification.objects.get(recipient=self.seller, kind='merch_problem')
        self.assertEqual(problem.link, f'/dashboard/merch?tab=orders&order={order.ref}')

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
    """Merch money is available when the buyer confirms or the code is checked, and 2 days after the organiser says so alone."""

    def available(self):
        return merch.balances(self.seller)['available']

    def test_nothing_is_available_while_the_order_is_open(self):
        delivery, pickup = self.paid('delivery'), self.paid('pickup')
        self.assertEqual(self.available(), 0)
        merch.advance(MerchOrder.objects.get(pk=delivery.pk), 'pack')
        merch.advance(MerchOrder.objects.get(pk=delivery.pk), 'ship')
        merch.advance(MerchOrder.objects.get(pk=pickup.pk), 'ready')
        b = merch.balances(self.seller)
        self.assertEqual((b['available'], b['not_released']), (Decimal('0.00'), Decimal('26000.00')))   # 14,000 + 12,000
        self.assertIsNone(MerchOrder.objects.get(pk=pickup.pk).release_at)

    def test_delivered_by_the_organiser_alone_is_available_after_two_days(self):
        order = merch.advance(self.paid('delivery'), 'ship')
        self.assertEqual(self.available(), 0)
        done = merch.advance(order, 'delivered')
        b = merch.balances(self.seller)
        self.assertEqual((b['available'], b['releasing']), (Decimal('0.00'), Decimal('14000.00')))
        self.assertAlmostEqual(done.release_at, done.delivered_at + timedelta(days=merch.HOLD_DAYS), delta=timedelta(seconds=5))
        self.wait_out(done)
        self.assertEqual(self.available(), Decimal('14000.00'))
        self.assertEqual(merch.balances(self.seller)['releasing'], 0)

    def test_picked_up_with_the_code_is_available_at_once_and_without_it_after_two_days(self):
        done = self.handed_over()
        self.assertTrue(done.code_verified)
        self.assertEqual(self.available(), Decimal('12000.00'))
        without = merch.advance(merch.advance(self.paid('pickup'), 'ready'), 'picked_up')
        self.assertFalse(without.code_verified)
        b = merch.balances(self.seller)
        self.assertEqual((b['available'], b['releasing']), (Decimal('12000.00'), Decimal('12000.00')))
        self.wait_out(without)
        self.assertEqual(self.available(), Decimal('24000.00'))

    def test_a_wrong_code_is_refused_and_changes_nothing(self):
        order = merch.advance(self.paid('pickup'), 'ready')
        with self.assertRaises(merch.MerchError):
            merch.advance(order, 'picked_up', code='0000')
        order.refresh_from_db()
        self.assertEqual((order.status, self.available()), ('ready', Decimal('0.00')))

    def test_the_buyer_confirming_makes_it_available_at_once(self):
        pickup = merch.advance(self.paid('pickup'), 'ready')
        self.assertEqual(merch.confirm_by_buyer(pickup).status, 'picked_up')
        self.assertEqual(self.available(), Decimal('12000.00'))
        delivery = merch.advance(self.paid('delivery'), 'ship')
        self.assertEqual(merch.confirm_by_buyer(delivery).status, 'delivered')
        self.assertEqual(self.available(), Decimal('26000.00'))
        with self.assertRaises(merch.MerchError):
            merch.confirm_by_buyer(self.paid('delivery'))   # not shipped yet

    def test_the_next_release_date_is_the_earliest_one_still_waiting(self):
        self.assertIsNone(merch.next_release_at(self.seller))
        first = merch.advance(merch.advance(self.paid('delivery'), 'ship'), 'delivered')
        self.assertEqual(merch.next_release_at(self.seller), first.release_at)
        merch.report_problem(first, 'damaged')   # on hold: not counted down
        self.assertIsNone(merch.next_release_at(self.seller))


class BalanceTests(MerchBase):
    def fulfilled(self):
        return self.handed_over()

    def test_the_four_buckets(self):
        self.paid('delivery')                                                               # 14,000 still to fulfil
        merch.advance(self.paid('pickup'), 'ready')                                         # 12,000 ready, not collected yet
        self.fulfilled()                                                                    # 12,000 available
        merch.advance(merch.advance(self.paid('pickup'), 'ready'), 'picked_up')             # 12,000 releasing (organiser alone)
        merch.report_problem(merch.advance(self.paid('pickup'), 'ready'), 'not_received')   # 12,000 on hold
        b = merch.balances(self.seller)
        self.assertEqual({k: str(v) for k, v in b.items()},
                         {'available': '12000.00', 'releasing': '12000.00', 'on_hold': '12000.00', 'not_released': '26000.00'})

    def test_refunded_and_cancelled_orders_count_for_nothing(self):
        order = self.paid('pickup')
        with patch('bryo.merch.send_refund'):
            merch.cancel(order, 'Sorry')
        self.assertEqual(sum(merch.balances(self.seller).values()), Decimal('0'))

    def test_fulfilled_merch_money_joins_the_withdrawable_balance_and_can_be_withdrawn(self):
        order = merch.advance(self.paid('pickup'), 'ready')
        self.assertEqual(compute_available_balance(self.seller), Decimal('0'))
        merch.advance(order, 'picked_up', code=order.pickup_code)
        self.assertEqual(compute_available_balance(self.seller), Decimal('12000.00'))
        PayoutRequest.objects.create(user=self.seller, amount=Decimal('5000'), method='bank', status='pending')
        self.assertEqual(compute_available_balance(self.seller), Decimal('7000.00'))

    def test_a_refund_after_money_was_withdrawn_takes_the_balance_below_zero(self):
        order = self.fulfilled()
        PayoutRequest.objects.create(user=self.seller, amount=Decimal('12000'), method='bank', status='processed')
        with patch('bryo.merch.send_refund'):
            merch.admin_refund(MerchOrder.objects.get(pk=order.pk), 'Buyer emailed support after it was marked complete')
        self.assertEqual(compute_available_balance(self.seller), Decimal('-12000.00'))


class AccountTests(MerchBase):
    def test_the_payouts_balance_endpoint_shows_merch_money_and_any_shortfall(self):
        self.client.force_authenticate(self.seller)
        order = merch.advance(self.paid('pickup'), 'ready')
        r = self.client.get('/api/payouts/balance/').json()
        self.assertEqual(Decimal(r['available']), 0)
        self.assertEqual((r['merch']['not_released'], r['merch']['on_hold'], Decimal(r['shortfall'])), ('12000.00', '0.00', 0))
        self.assertEqual(set(r['merch']), {'not_released', 'on_hold', 'releasing', 'next_release_at'})
        merch.advance(MerchOrder.objects.get(pk=order.pk), 'picked_up', code=order.pickup_code)
        self.assertEqual(Decimal(self.client.get('/api/payouts/balance/').json()['available']), 12000)
        PayoutRequest.objects.create(user=self.seller, amount=Decimal('12000'), method='bank', status='processed')
        with patch('bryo.merch.send_refund'):
            merch.admin_refund(MerchOrder.objects.get(pk=order.pk), 'Late complaint')
        r = self.client.get('/api/payouts/balance/').json()
        self.assertEqual((Decimal(r['available']), Decimal(r['shortfall'])), (0, 12000))

    def test_an_organiser_with_open_merch_orders_cannot_be_deleted(self):
        from .accounts import delete_blockers
        self.assertFalse([r for r in delete_blockers(self.seller) if 'merch' in r])
        order = self.paid('pickup')
        self.assertTrue([r for r in delete_blockers(self.seller) if 'merch orders' in r])
        merch.advance(merch.advance(order, 'ready'), 'picked_up', code=order.pickup_code)
        self.assertFalse([r for r in delete_blockers(self.seller) if 'merch orders' in r])


class BalancePartsAndActivityTests(MerchBase):
    def setUp(self):
        super().setUp()
        from .models import Payment, Refund, Ticket
        from .test_payments import make_event
        self.event = make_event(self.seller, ticket_price=Decimal('5000.00'), capacity=100, name='Run Day')
        self.payment = Payment.objects.create(
            event=self.event, customer_email='b@example.com', customer_name='B', amount=Decimal('10500'), fee_rate=Decimal('0.05'),
            paystack_reference='ref-activity', status='successful', paid_at=timezone.now() - timedelta(days=3), metadata={})
        for i in range(2):
            Ticket.objects.create(event=self.event, payment=self.payment, payment_status='paid', original_owner_name='B',
                                  original_owner_email='b@example.com', current_owner_name='B', current_owner_email='b@example.com')
        self.Refund = Refund

    def released_order(self):
        return self.handed_over()

    def test_the_parts_add_up_to_what_can_be_withdrawn(self):
        from .views import balance_parts
        self.released_order()
        merch.advance(self.paid('pickup'), 'ready')                       # still open: not in the parts
        PayoutRequest.objects.create(user=self.seller, amount=Decimal('5000'), method='bank', status='pending')
        PayoutRequest.objects.create(user=self.seller, amount=Decimal('999'), method='bank', status='rejected')
        parts = balance_parts(self.seller)
        self.assertEqual((parts['tickets'], parts['merch'], parts['withdrawn']), (Decimal('10000'), Decimal('12000.00'), Decimal('5000')))
        self.assertEqual(parts['tickets'] + parts['merch'] - parts['withdrawn'], compute_available_balance(self.seller))
        self.client.force_authenticate(self.seller)
        body = self.client.get('/api/payouts/balance/').json()
        self.assertEqual({k: Decimal(v) for k, v in body['parts'].items()}, parts)
        self.assertEqual(Decimal(body['available']), Decimal('17000'))

    def test_the_event_balance_has_no_merch_in_it(self):
        from .views import balance_parts
        self.released_order()
        self.assertEqual(balance_parts(self.seller, self.event)['merch'], Decimal('0'))

    def activity(self):
        self.client.force_authenticate(self.seller)
        r = self.client.get('/api/payouts/activity/')
        self.assertEqual(r.status_code, 200)
        return r.json()['results']

    def test_everything_that_moved_the_balance_is_listed_newest_first(self):
        self.released_order()
        self.Refund.objects.create(payment=self.payment, event=self.event, amount=Decimal('5000'))
        PayoutRequest.objects.create(user=self.seller, amount=Decimal('5000'), method='bank', status='processed')
        rows = self.activity()
        by_source = {r['source']: r for r in rows}
        self.assertEqual(set(by_source), {'tickets', 'merch', 'refunds', 'withdrawals'})
        self.assertEqual((by_source['tickets']['description'], by_source['tickets']['amount'], by_source['tickets']['detail']), ('2 tickets sold', '10000.00', 'Run Day'))
        self.assertEqual((by_source['merch']['amount'], by_source['merch']['description'].startswith('Merch order BY-')), ('12000.00', True))
        self.assertEqual((by_source['refunds']['amount'], by_source['refunds']['detail']), ('-5000.00', 'Run Day'))
        self.assertEqual((by_source['withdrawals']['amount'], by_source['withdrawals']['status']), ('-5000.00', 'paid'))
        times = [r['at'] for r in rows]
        self.assertEqual(times, sorted(times, reverse=True))

    def test_money_that_has_not_moved_yet_is_not_listed(self):
        merch.advance(self.paid('pickup'), 'ready')                                            # still open
        merch.report_problem(merch.advance(self.paid('pickup'), 'ready'), 'damaged')           # on hold
        merch.advance(merch.advance(self.paid('pickup'), 'ready'), 'picked_up')                # inside its 2 days
        sources = [r['source'] for r in self.activity()]
        self.assertNotIn('merch', sources)
        self.assertNotIn('withdrawals', sources)

    def test_every_payout_is_listed_with_where_it_stands(self):
        for status in ('pending', 'on_hold', 'processed', 'rejected'):
            PayoutRequest.objects.create(user=self.seller, amount=Decimal('1000'), method='bank', status=status,
                                         bank_name='GTBank', account_number='0123454821')
        rows = [r for r in self.activity() if r['source'] == 'withdrawals']
        self.assertEqual(sorted(r['status'] for r in rows), ['on_hold', 'paid', 'pending', 'unpaid'])
        self.assertEqual({r['description'] for r in rows}, {'Payout to GTBank ••••4821'})

    def test_money_is_listed_once_its_two_days_are_up(self):
        order = merch.advance(merch.advance(self.paid('pickup'), 'ready'), 'picked_up')
        self.wait_out(order)
        self.assertIn('merch', [r['source'] for r in self.activity()])

    def test_other_organisers_and_signed_out_visitors_see_nothing_of_it(self):
        other = User.objects.create_user(email='other@example.com')
        self.client.force_authenticate(other)
        self.assertEqual(self.client.get('/api/payouts/activity/').json()['results'], [])
        self.client.force_authenticate(None)
        self.assertIn(self.client.get('/api/payouts/activity/').status_code, (401, 403))


class ProblemTests(MerchBase):
    def test_reporting_holds_the_money_until_byro_decides(self):
        order = merch.advance(self.paid('delivery'), 'ship')
        reported = merch.report_problem(order, 'not_received', 'Nothing came.')
        self.assertTrue(reported.on_hold)
        self.assertEqual(merch.balances(self.seller)['on_hold'], Decimal('14000.00'))
        with self.assertRaises(merch.MerchError):
            merch.report_problem(order, 'damaged')            # already open

    def test_a_bad_reason_is_refused_and_so_is_a_report_on_a_finished_order(self):
        order = merch.advance(self.paid('pickup'), 'ready')
        with self.assertRaises(merch.MerchError):
            merch.report_problem(order, 'rude')
        done = self.wait_out(merch.advance(order, 'picked_up'))
        with self.assertRaises(merch.MerchError) as ctx:
            merch.report_problem(done, 'damaged')
        self.assertEqual(ctx.exception.status, 409)
        self.assertIn('already complete', ctx.exception.message)
        self.assertIn('support@usebyro.com', ctx.exception.message)
        delivered = self.wait_out(merch.advance(merch.advance(self.paid('delivery'), 'ship'), 'delivered'))
        with self.assertRaises(merch.MerchError):
            merch.report_problem(delivered, 'not_received')
        confirmed = merch.confirm_by_buyer(merch.advance(self.paid('pickup'), 'ready'))   # released at once: nothing left to report
        with self.assertRaises(merch.MerchError):
            merch.report_problem(confirmed, 'damaged')

    def test_a_problem_can_be_reported_during_the_two_days_and_holds_the_money(self):
        delivered = merch.advance(merch.advance(self.paid('delivery'), 'ship'), 'delivered')
        reported = merch.report_problem(delivered, 'not_received', 'Never came')
        self.assertTrue(reported.on_hold)
        b = merch.balances(self.seller)
        self.assertEqual((b['on_hold'], b['releasing'], b['available']), (Decimal('14000.00'), 0, 0))
        released = merch.resolve_report(reported, 'release')
        self.assertEqual(merch.balances(self.seller)['available'], Decimal('14000.00'))   # no more waiting
        self.assertLessEqual(released.release_at, timezone.now())

    def test_a_buyer_can_report_once_even_after_byro_has_decided(self):
        order = merch.report_problem(merch.advance(self.paid('pickup'), 'ready'), 'other')
        merch.resolve_report(order, 'release')
        with self.assertRaises(merch.MerchError) as ctx:
            merch.report_problem(MerchOrder.objects.get(pk=order.pk), 'damaged')
        self.assertIn('already reported', ctx.exception.message)

    def test_releasing_lifts_the_hold_and_the_money_follows_fulfilment(self):
        order = merch.report_problem(merch.advance(self.paid('pickup'), 'ready'), 'other')
        released = merch.resolve_report(order, 'release')
        self.assertFalse(released.on_hold)
        b = merch.balances(self.seller)
        self.assertEqual((b['available'], b['on_hold'], b['not_released']), (Decimal('0.00'), Decimal('0.00'), Decimal('12000.00')))
        merch.advance(released, 'picked_up', code=released.pickup_code)
        self.assertEqual(merch.balances(self.seller)['available'], Decimal('12000.00'))

    def test_refunding_cancels_the_order_and_asks_paystack(self):
        order = merch.report_problem(merch.advance(self.paid('delivery'), 'ship'), 'not_received')
        with patch('bryo.merch.send_refund') as refund, self.captureOnCommitCallbacks(execute=True):
            result = merch.resolve_report(order, 'refund')
        self.assertEqual(result.status, 'refund_processing')
        self.assertEqual(result.refund_amount, Decimal('14000.00'))   # items and delivery fee
        refund.assert_called_once_with(order.pk)

    def test_the_buyer_page_offers_a_report_until_the_money_is_available(self):
        order = merch.advance(self.paid('delivery'), 'ship')
        url = f'/api/merch-orders/{order.ref}/'
        body = self.client.get(url, {'token': order.access_token}).json()
        self.assertTrue(body['can_report'])
        self.assertIsNone(body['report_until'])
        done = merch.advance(MerchOrder.objects.get(pk=order.pk), 'delivered')
        body = self.client.get(url, {'token': order.access_token}).json()
        self.assertTrue(body['can_report'])
        self.assertIsNotNone(body['report_until'])
        self.wait_out(done)
        body = self.client.get(url, {'token': order.access_token}).json()
        self.assertFalse(body['can_report'])
        self.assertIsNone(body['report_until'])
        r = self.client.post(url + 'report/', {'token': order.access_token, 'reason': 'not_received'}, format='json')
        self.assertEqual(r.status_code, 409)
        self.assertIn('support@usebyro.com', r.json()['error'])

    def test_after_a_report_the_buyer_page_stops_offering_another(self):
        order = merch.advance(self.paid('pickup'), 'ready')
        merch.report_problem(order, 'damaged')
        url = f'/api/merch-orders/{order.ref}/'
        self.assertFalse(self.client.get(url, {'token': order.access_token}).json()['can_report'])

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
    def test_the_organiser_is_told_at_once_when_the_code_releases_the_money_and_only_once(self):
        order = merch.advance(self.paid('pickup'), 'ready')
        self.assertFalse(Notification.objects.filter(kind='merch_released').exists())
        with self.captureOnCommitCallbacks(execute=True):
            merch.advance(order, 'picked_up', code=order.pickup_code)
        note = Notification.objects.get(recipient=self.seller, kind='merch_released')
        self.assertIn('₦12,000 from order', note.title)
        self.assertIn("Kelechi's order was marked picked up. You can withdraw it now.", note.body)
        self.assertEqual(note.link, '/dashboard/payouts')
        self.assertEqual(merch.process_due_orders()['released'], 0)          # the cron has nothing left to say

    def test_nothing_is_said_while_the_two_days_run_and_the_cron_says_it_when_they_end(self):
        order = merch.advance(self.paid('delivery'), 'ship')
        with self.captureOnCommitCallbacks(execute=True):
            done = merch.advance(order, 'delivered')
        self.assertFalse(Notification.objects.filter(kind='merch_released').exists())
        self.assertEqual(merch.process_due_orders()['released'], 0)
        MerchOrder.objects.filter(pk=done.pk).update(delivered_at=timezone.now() - timedelta(days=2, minutes=1),
                                                     release_at=timezone.now() - timedelta(minutes=1))   # two days on
        self.assertEqual(merch.process_due_orders()['released'], 1)
        self.assertEqual(merch.process_due_orders()['released'], 0)
        self.assertIn("didn't report a problem", Notification.objects.get(recipient=self.seller, kind='merch_released').body)

    def test_a_buyer_confirming_a_delivery_says_delivered(self):
        order = merch.advance(self.paid('delivery'), 'ship')
        with self.captureOnCommitCallbacks(execute=True):
            merch.confirm_by_buyer(order)
        self.assertIn('marked delivered', Notification.objects.get(recipient=self.seller, kind='merch_released').body)

    def test_a_missed_notice_is_sent_by_the_cron_once(self):
        order = merch.advance(self.paid('pickup'), 'ready')
        merch.advance(order, 'picked_up', code=order.pickup_code)   # the after-commit notice never ran
        self.assertEqual(merch.process_due_orders()['released'], 1)
        self.assertEqual(merch.process_due_orders()['released'], 0)

    def test_nothing_is_announced_for_orders_that_are_not_fulfilled(self):
        merch.report_problem(merch.advance(self.paid('pickup'), 'ready'), 'damaged')
        merch.advance(self.paid('delivery'), 'ship')
        self.assertEqual(merch.process_due_orders()['released'], 0)

    def test_the_balance_shows_what_is_releasing(self):
        self.client.force_authenticate(self.seller)
        merch.advance(self.paid('pickup'), 'ready')
        r = self.client.get('/api/payouts/balance/').json()['merch']
        self.assertEqual(r, {'on_hold': '0.00', 'releasing': '0.00', 'not_released': '12000.00', 'next_release_at': None})


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

    def test_the_list_carries_the_money_and_whether_a_fee_applies(self):
        body = self.client.get('/api/dashboard/merch-orders/').json()
        self.assertEqual(set(body['money']), {'available', 'releasing', 'on_hold', 'not_released', 'next_release_at'})
        self.assertEqual(Decimal(body['fee_rate']), 0)
        order = merch.advance(self.paid('pickup'), 'ready')
        money = self.client.get('/api/dashboard/merch-orders/').json()['money']
        self.assertEqual((money['not_released'], money['available']), ('12000.00', '0.00'))
        merch.advance(order, 'picked_up')
        money = self.client.get('/api/dashboard/merch-orders/').json()['money']
        self.assertEqual((money['not_released'], money['releasing'], money['available']), ('0.00', '12000.00', '0.00'))
        self.assertIsNotNone(money['next_release_at'])
        self.wait_out(order)
        money = self.client.get('/api/dashboard/merch-orders/').json()['money']
        self.assertEqual((money['releasing'], money['available']), ('0.00', '12000.00'))
        with override_settings(MERCH_FEE_RATE='0.05'):
            self.assertEqual(Decimal(self.client.get('/api/dashboard/merch-orders/').json()['fee_rate']), Decimal('0.05'))

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

    def test_the_detail_shows_the_buyer_the_money_and_where_it_is(self):
        order = merch.advance(self.paid('delivery'), 'ship')
        d = self.client.get(f'/api/dashboard/merch-orders/{order.ref}/').json()
        self.assertEqual(d['buyer']['phone'], '0803 412 5185')
        self.assertEqual((d['earnings'], d['delivery_fee'], d['release_state']), ('14000.00', '2000.00', 'not_released'))
        self.assertIn('Surulere', d['delivery_address'])
        done = merch.advance(order, 'delivered')
        self.assertEqual(self.client.get(f'/api/dashboard/merch-orders/{order.ref}/').json()['release_state'], 'releasing')
        self.wait_out(done)
        self.assertEqual(self.client.get(f'/api/dashboard/merch-orders/{order.ref}/').json()['release_state'], 'available')

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

    def test_the_held_list_says_how_to_reach_the_organiser(self):
        self.client.force_authenticate(self.boss)
        row = self.client.get('/api/admin/merch-orders/held/').json()['results'][0]
        self.assertEqual(row['seller']['email'], 'seller@example.com')
        self.assertEqual(row['buyer']['email'], 'kelechi@example.com')
        self.assertEqual(row['buyer']['phone'], '0803 412 5185')

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
            (me.problem_email(reported), ['Nothing came', 'on hold', 'when Byro has decided', 'order=BY-']),
            (me.waiting_email(self.paid('pickup')), ['refund']),
        ]
        for mail, expected in cases:
            blob = mail['html'] + mail['text'] + mail['subject']
            for fact in expected:
                self.assertIn(fact, blob, f"{mail['subject']}: {fact}")
            self.assertNotIn('\u2014', blob, mail['subject'])
            self.assertNotIn('within 2 working days', blob, mail['subject'])   # no deadline we have not promised
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


class AdminOverviewTests(MerchBase):
    def test_merch_sales_count_in_the_overview_total_and_trend(self):
        from .models import AdminMember
        boss = User.objects.create_user(email='boss@example.com')
        AdminMember.objects.create(email='boss@example.com', role='admin')
        self.client.force_authenticate(boss)
        self.paid('delivery')                                   # 12,000 + 2,000 delivery
        pickup = self.paid('pickup')                            # 12,000
        with patch('bryo.merch.send_refund'):
            merch.cancel(pickup, 'Sorry')                       # refunded orders are not revenue
        s = self.client.get('/api/admin/analytics/summary/').json()
        self.assertEqual((Decimal(str(s['merch_revenue'])), s['merch_orders']), (Decimal('14000'), 1))
        self.assertEqual(Decimal(str(s['total_revenue'])), Decimal(str(s['ticket_revenue'])) + Decimal('14000'))
        trend = self.client.get('/api/admin/analytics/revenue-trend/?days=7').json()
        self.assertEqual(sum(Decimal(str(p['revenue'])) for p in trend), Decimal('14000'))


class OrderCodeTests(MerchBase):
    def test_codes_are_short_unguessable_and_unique(self):
        import re
        a, b = self.paid('pickup'), self.paid('pickup')
        for o in (a, b):
            self.assertRegex(o.ref, r'^BY-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$')
        self.assertNotEqual(a.ref, b.ref)
        self.assertNotIn(str(a.pk).zfill(4), a.ref)

    def test_an_order_opens_by_its_code_in_any_case_and_old_numbered_links_still_work(self):
        order = merch.advance(self.paid('pickup'), 'ready')
        url = lambda ref: f'/api/merch-orders/{ref}/'
        self.assertEqual(self.client.get(url(order.ref.lower()), {'token': order.access_token}).status_code, 200)
        self.assertEqual(self.client.get(url(f'BY-{order.pk:04d}'), {'token': order.access_token}).status_code, 200)
        self.assertEqual(self.client.get(url('BY-ZZZZZZ'), {'token': order.access_token}).status_code, 404)

    def test_the_organiser_can_search_by_code_with_or_without_spaces(self):
        self.client.force_authenticate(self.seller)
        order, other = self.paid('pickup'), self.paid('pickup')
        for q in (order.ref, order.ref.lower(), order.ref[3:]):
            refs = [o['ref'] for o in self.client.get('/api/dashboard/merch-orders/', {'q': q}).json()['results']]
            self.assertEqual(refs, [order.ref])
