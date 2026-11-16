"""Merch fraud: the pickup code stays with the buyer, nobody buys their own merch, stock can't be hoarded,
and the buyer hears about steps the organiser marks on their own."""
from unittest.mock import patch

from rest_framework.test import APIClient

from . import merch
from .models import MerchOrder
from .test_merch import MerchBase, User
from .views import compute_available_balance


class PickupCodeTests(MerchBase):
    def act(self, order, **body):
        self.client.force_authenticate(self.seller)
        return self.client.post(f'/api/dashboard/merch-orders/{order.ref}/action/', body, format='json')

    def test_the_organiser_never_sees_the_buyers_code(self):
        order = self.paid('pickup')
        merch.advance(order, 'ready')
        self.client.force_authenticate(self.seller)
        detail = self.client.get(f'/api/dashboard/merch-orders/{order.ref}/').json()
        self.assertNotIn('pickup_code', detail)
        self.assertNotIn(order.pickup_code, str(detail))
        listing = self.client.get('/api/dashboard/merch-orders/?filter=all').json()
        self.assertNotIn(order.pickup_code, str(listing))

    def test_the_buyer_still_sees_their_code_once_it_is_ready(self):
        order = self.paid('pickup')
        merch.advance(order, 'ready')
        body = APIClient().get(f'/api/merch-orders/{order.ref}/?token={order.access_token}').json()
        self.assertEqual(body['pickup_code'], order.pickup_code)

    def test_new_codes_are_six_digits(self):
        for _ in range(20):
            order = self.order('pickup')
            self.assertRegex(order.pickup_code, r'^\d{6}$')
            merch.fail_order(order)

    def test_the_right_code_releases_the_money_straight_away(self):
        order = self.paid('pickup')
        self.act(order, action='ready')
        r = self.act(order, action='picked_up', code=order.pickup_code)
        self.assertEqual(r.status_code, 200)
        self.assertEqual(compute_available_balance(self.seller), order.earnings)

    def test_guessing_codes_is_cut_off_and_the_right_code_stops_working(self):
        order = self.paid('pickup')
        self.act(order, action='ready')
        wrong = '000000' if order.pickup_code != '000000' else '111111'
        for _ in range(merch.MAX_CODE_ATTEMPTS):
            self.assertEqual(self.act(order, action='picked_up', code=wrong).status_code, 400)
        order.refresh_from_db()
        self.assertEqual(order.code_attempts, merch.MAX_CODE_ATTEMPTS)
        r = self.act(order, action='picked_up', code=order.pickup_code)
        self.assertEqual(r.status_code, 429)
        order.refresh_from_db()
        self.assertEqual(order.status, MerchOrder.READY)
        self.assertEqual(compute_available_balance(self.seller), 0)

    def test_handing_over_without_a_code_still_works_but_waits_out_the_window(self):
        order = self.paid('pickup')
        self.act(order, action='ready')
        self.assertEqual(self.act(order, action='picked_up').status_code, 200)
        self.assertEqual(compute_available_balance(self.seller), 0)


class SelfPurchaseAndHoardingTests(MerchBase):
    def line(self, qty=1):
        return [{'item_id': self.tee.pk, 'quantity': qty, 'option': 'M'}]

    def test_a_seller_cannot_buy_their_own_merch(self):
        with self.assertRaises(merch.MerchError) as e:
            merch.create_order(self.seller, self.line(), 'pickup', buyer=self.seller, name='Me', email='someone@else.com')
        self.assertEqual(e.exception.status, 403)

    def test_the_sellers_own_email_is_refused_even_when_signed_out(self):
        with self.assertRaises(merch.MerchError):
            merch.create_order(self.seller, self.line(), 'pickup', name='Me', email='  SELLER@example.com ')

    def test_someone_else_can_still_buy(self):
        self.assertTrue(self.order('pickup').pk)

    def test_one_email_cannot_hold_stock_with_endless_unpaid_orders(self):
        for _ in range(merch.MAX_OPEN_PER_EMAIL):
            self.order('pickup', lines=[{'item_id': self.cap.pk, 'quantity': 1, 'option': ''}])
        with self.assertRaises(merch.MerchError) as e:
            self.order('pickup', lines=[{'item_id': self.cap.pk, 'quantity': 1, 'option': ''}])
        self.assertEqual(e.exception.status, 429)

    def test_a_paid_order_frees_a_slot(self):
        orders = [self.order('pickup', lines=[{'item_id': self.cap.pk, 'quantity': 1, 'option': ''}])
                  for _ in range(merch.MAX_OPEN_PER_EMAIL)]
        merch.mark_paid(orders[0], 'card')
        self.assertTrue(self.order('pickup', lines=[{'item_id': self.cap.pk, 'quantity': 1, 'option': ''}]).pk)


class BuyerToldTests(MerchBase):
    def steps(self, order, action, **kw):
        with patch('bryo.merch_emails.send_order_email') as send, self.captureOnCommitCallbacks(execute=True):
            merch.advance(order, action, **kw)
        return [c.args[1] for c in send.call_args_list]

    def test_the_buyer_is_emailed_when_delivery_is_marked_without_them(self):
        order = self.paid('delivery')
        self.assertEqual(self.steps(order, 'ship', courier='GIG', tracking='1'), ['shipped'])
        self.assertEqual(self.steps(order, 'delivered'), ['delivered'])

    def test_the_buyer_is_emailed_when_pickup_is_marked_without_the_code(self):
        order = self.paid('pickup')
        self.assertEqual(self.steps(order, 'ready'), ['ready'])
        self.assertEqual(self.steps(order, 'picked_up'), ['collected'])

    def test_no_extra_email_when_the_buyers_own_code_was_used(self):
        order = self.paid('pickup')
        self.steps(order, 'ready')
        self.assertEqual(self.steps(order, 'picked_up', code=order.pickup_code), [])

    def test_no_email_when_the_buyer_confirmed_it_themselves(self):
        order = self.paid('delivery')
        self.steps(order, 'ship')
        order.refresh_from_db()
        with patch('bryo.merch_emails.send_order_email') as send, self.captureOnCommitCallbacks(execute=True):
            merch.confirm_by_buyer(order)
        send.assert_not_called()
