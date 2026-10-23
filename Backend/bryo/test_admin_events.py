"""Admin actions on events: visibility, and the other moderation tools added with it."""
from django.utils import timezone

from .models import AdminAction
from .test_admin_tools import AdminBase


class VisibilityTests(AdminBase):

    def patch(self, user, **body):
        self.as_(user)
        return self.client.patch(f'/api/admin/events/{self.event.pk}/', body, format='json')

    def test_admin_can_make_an_event_private_and_public_again(self):
        r = self.patch(self.boss, visibility='private')
        self.assertEqual((r.status_code, r.json()['visibility']), (200, 'private'))
        self.event.refresh_from_db()
        self.assertEqual(self.event.visibility, 'private')
        r = self.patch(self.boss, visibility='public')
        self.assertEqual(r.json()['visibility'], 'public')
        self.assertEqual(AdminAction.objects.filter(action=AdminAction.ACTION_EVENT_VISIBILITY).count(), 2)

    def test_going_private_stops_featuring(self):
        self.event.featured_until = timezone.now() + timezone.timedelta(days=5)
        self.event.save()
        self.patch(self.boss, visibility='private')
        self.event.refresh_from_db()
        self.assertIsNone(self.event.featured_until)

    def test_same_value_is_not_logged_and_bad_value_is_refused(self):
        self.patch(self.boss, visibility='public')
        self.assertFalse(AdminAction.objects.filter(action=AdminAction.ACTION_EVENT_VISIBILITY).exists())
        self.assertEqual(self.patch(self.boss, visibility='secret').status_code, 400)

    def test_viewers_cannot_change_visibility(self):
        self.assertEqual(self.patch(self.viewer, visibility='private').status_code, 403)
        self.event.refresh_from_db()
        self.assertEqual(self.event.visibility, 'public')


class PayoutHoldTests(AdminBase):

    def setUp(self):
        super().setUp()
        from decimal import Decimal
        from .models import PayoutRequest
        self.payout = PayoutRequest.objects.create(
            user=self.owner, amount=Decimal('5000'), method='bank',
            bank_name='GTBank', account_number='0123456789', account_name='Lagos Run',
        )

    def patch(self, user, **body):
        self.as_(user)
        return self.client.patch(f'/api/admin/payouts/{self.payout.pk}/', body, format='json')

    def test_hold_needs_a_reason_and_shows_it_to_the_organiser(self):
        self.assertEqual(self.patch(self.boss, status='on_hold').status_code, 400)
        r = self.patch(self.boss, status='on_hold', reason='We need a copy of your ID')
        self.assertEqual((r.status_code, r.json()['status'], r.json()['hold_reason']), (200, 'on_hold', 'We need a copy of your ID'))
        self.assertTrue(AdminAction.objects.filter(action=AdminAction.ACTION_PAYOUT_HELD).exists())
        self.as_(self.owner)
        mine = self.client.get('/api/payouts/').json()
        self.assertEqual(mine[0]['status'], 'on_hold')
        bal = self.client.get('/api/payouts/balance/').json()
        self.assertEqual((bal['pending'], bal['on_hold']), ('5000.00', '5000.00'))

    def test_held_money_stays_reserved(self):
        from .views import compute_available_balance
        before = compute_available_balance(self.owner)
        self.patch(self.boss, status='on_hold', reason='Checking the event')
        self.assertEqual(compute_available_balance(self.owner), before)

    def test_release_puts_it_back_to_pending_and_clears_the_reason(self):
        self.patch(self.boss, status='on_hold', reason='Checking the event')
        r = self.patch(self.boss, status='pending')
        self.assertEqual((r.json()['status'], r.json()['hold_reason']), ('pending', ''))
        self.assertTrue(AdminAction.objects.filter(action=AdminAction.ACTION_PAYOUT_RELEASED).exists())

    def test_only_pending_can_be_held_and_only_held_can_be_released(self):
        self.assertEqual(self.patch(self.boss, status='pending').status_code, 400)
        self.patch(self.boss, status='processed')
        self.assertEqual(self.patch(self.boss, status='on_hold', reason='Too late').status_code, 400)

    def test_a_held_payout_can_still_be_paid_or_rejected(self):
        self.patch(self.boss, status='on_hold', reason='Checking')
        r = self.patch(self.boss, status='rejected')
        self.assertEqual((r.json()['status'], r.json()['hold_reason']), ('rejected', ''))

    def test_viewers_cannot_hold(self):
        self.assertEqual(self.patch(self.viewer, status='on_hold', reason='nope').status_code, 403)
