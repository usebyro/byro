"""Service fee: a default set in the admin, special rates for chosen organisers, and old orders never change."""
from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import override_settings

from .models import AdminAction, AdminMember, Payment, PlatformSettings, UserProfile
from .pricing import calculate_ticket_fees, fee_rate_for
from .test_payments import PAYMENT_SETTINGS, PaymentTestBase, make_event
from .test_refunds import paid_order
from .views import compute_available_balance

User = get_user_model()


@override_settings(**PAYMENT_SETTINGS)
class FeeTests(PaymentTestBase):
    def setUp(self):
        super().setUp()
        self.boss = User.objects.create_user(email='boss@byro.test')
        AdminMember.objects.create(email='boss@byro.test', role='owner', added_by_email='test')
        self.admin = User.objects.create_user(email='admin@byro.test')
        AdminMember.objects.create(email='admin@byro.test', role='admin', added_by_email='test')

    def as_(self, user):
        self.client.force_authenticate(user)

    def set_default(self, pct, who=None):
        self.as_(who or self.boss)
        return self.client.patch('/api/admin/settings/', {'default_fee_percent': pct}, format='json')

    def set_deal(self, user, pct, who=None):
        self.as_(who or self.boss)
        return self.client.patch(f'/api/admin/users/{user.pk}/fee/', {'fee_percent': pct}, format='json')

    def test_the_default_is_5_percent_and_can_be_changed_by_owners_only(self):
        self.assertEqual(fee_rate_for(self.owner), Decimal('0.05'))
        self.assertEqual(self.set_default('4', who=self.admin).status_code, 403)
        res = self.set_default('4')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()['default_fee_percent'], '4')
        self.assertEqual(fee_rate_for(self.owner), Decimal('0.04'))
        self.assertEqual(AdminAction.objects.get(action=AdminAction.ACTION_FEE_DEFAULT_CHANGED).detail, '5% -> 4%')

    def test_limits(self):
        for bad in ('-1', '16', 'abc', ''):
            self.assertEqual(self.set_default(bad).status_code, 400, bad)
        self.assertEqual(self.set_default('0').status_code, 200)
        self.assertEqual(self.set_default('15').status_code, 200)
        self.assertEqual(self.set_default('2.5').json()['default_fee_percent'], '2.5')

    def test_a_special_rate_for_one_organiser(self):
        other = User.objects.create_user(email='other@example.com')
        self.set_deal(self.owner, '3')
        self.assertEqual(fee_rate_for(self.owner), Decimal('0.03'))
        self.assertEqual(fee_rate_for(other), Decimal('0.05'))
        self.set_default('6')
        self.assertEqual(fee_rate_for(self.owner), Decimal('0.03'))  # the deal wins
        self.assertEqual(fee_rate_for(other), Decimal('0.06'))
        res = self.set_deal(self.owner, None)
        self.assertEqual(res.json(), {'fee_percent': None, 'effective_percent': '6'})
        self.assertEqual(self.set_deal(self.owner, '3', who=self.admin).status_code, 403)
        listed = self.as_(self.admin) or self.client.get('/api/admin/settings/').json()
        self.assertEqual(listed['organiser_fees'], [])

    def test_checkout_charges_the_organisers_rate_and_records_it(self):
        self.set_deal(self.owner, '3')
        self.as_(None)
        from .test_payments import FakeResponse, INITIALIZE_URL
        turnstile = patch('bryo.views.check_and_remember_verification', return_value=True)
        paystack = patch('bryo.views.requests.post', return_value=FakeResponse({
            'status': True, 'data': {'authorization_url': 'https://checkout.paystack.com/abc', 'access_code': 'abc'}}))
        with turnstile, paystack:
            res = self.client.post(INITIALIZE_URL, {
                'event_slug': self.event.slug, 'customer_email': 'buyer@example.com',
                'customer_name': 'Buyer One', 'quantity': 1,
            }, format='json')
        self.assertIn(res.status_code, (200, 201), res.content[:300])
        p = Payment.objects.latest('created_at')
        self.assertEqual(p.fee_rate, Decimal('0.03'))
        self.assertEqual(p.metadata['fee_rate'], '0.0300')
        self.assertEqual(Decimal(p.metadata['service_fee']), (Decimal(p.metadata['subtotal']) * Decimal('0.03')).quantize(Decimal('1')))

    def test_old_orders_keep_their_fee_when_the_fee_changes(self):
        # Organiser absorbs the fee: their earnings depend on the fee rate of each order.
        type(self.event).objects.filter(pk=self.event.pk).update(pass_fee_to_attendee=False)
        paid_order(self.event, subtotal='10000.00', fee='0.00', seats=2)
        before = compute_available_balance(self.owner)
        self.set_default('10')
        self.set_deal(self.owner, '1')
        self.assertEqual(compute_available_balance(self.owner), before)

    def test_the_event_page_and_the_fee_lookup_show_the_right_rate(self):
        self.set_deal(self.owner, '3.5')
        self.as_(None)
        self.assertEqual(self.client.get(f'/api/events/{self.event.slug}/').json()['fee_rate'], '0.0350')
        self.assertEqual(self.client.get('/api/settings/fees/').json(), {'default_percent': '5'})
        self.as_(self.owner)
        self.assertEqual(self.client.get('/api/settings/fees/').json()['my_percent'], '3.5')

    def test_calculation_uses_the_given_rate(self):
        self.assertEqual(calculate_ticket_fees(Decimal('10000'), True, rate=Decimal('0.03'))['service_fee'], Decimal('300'))
        self.assertEqual(calculate_ticket_fees(Decimal('10000'), True)['service_fee'], Decimal('500'))

    def test_settings_show_the_change_history(self):
        self.set_default('4')
        self.set_deal(self.owner, '2')
        data = (self.as_(self.admin) or self.client.get('/api/admin/settings/')).json()
        self.assertEqual([h['kind'] for h in data['history']], ['organiser', 'default'])
        self.assertEqual(data['history'][1]['change'], '5% -> 4%')
        self.assertEqual(data['history'][0]['who'], 'boss@byro.test')
        self.assertEqual(data['organiser_fees'][0]['fee_percent'], '2')
