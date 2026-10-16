"""The dashboard page for one event: summary numbers, a guest's order, and resending a co-host invite."""
from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth import get_user_model

from .models import EventCoHost, Follow, Payment, Stamp, Ticket, TicketTier
from .test_payments import PaymentTestBase, make_event

User = get_user_model()


def ticket(event, status='free', email='guest@example.com', **kw):
    return Ticket.objects.create(
        event=event, original_owner_name='Guest', original_owner_email=email,
        current_owner_name='Guest', current_owner_email=email, payment_status=status, **kw,
    )


class DashEventTests(PaymentTestBase):

    def setUp(self):
        super().setUp()
        self.client.force_authenticate(self.owner)
        self.summary_url = f'/api/dashboard/events/{self.event.slug}/summary/'

    def cohost(self, role=EventCoHost.ROLE_MANAGER, status=EventCoHost.STATUS_ACCEPTED, email='helper@example.com'):
        user = User.objects.create_user(email=email) if status == EventCoHost.STATUS_ACCEPTED else None
        row = EventCoHost.objects.create(
            event=self.event, user=user, invited_email=email, added_by=self.owner, status=status, role=role,
        )
        return user, row

    def test_strangers_and_signed_out_get_nothing(self):
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get(self.summary_url).status_code, 401)
        self.client.force_authenticate(User.objects.create_user(email='stranger@example.com'))
        self.assertEqual(self.client.get(self.summary_url).status_code, 404)

    def test_revenue_per_tier_for_the_owner(self):
        vip = TicketTier.objects.create(event=self.event, name='VIP', price=Decimal('10000'), capacity=10)
        ticket(self.event, status='paid', tier=vip, email='a@example.com')
        ticket(self.event, status='paid', email='b@example.com')
        ticket(self.event, status='pending', tier=vip, email='c@example.com')
        data = self.client.get(self.summary_url).json()
        self.assertTrue(data['is_owner'])
        self.assertEqual(data['capacity'], 100)
        self.assertGreater(Decimal(data['tier_revenue'][str(vip.pk)]), 0)
        self.assertIn('none', data['tier_revenue'])
        self.assertEqual(
            Decimal(data['revenue']),
            sum(Decimal(v) for v in data['tier_revenue'].values()),
        )

    def test_cohosts_see_followers_but_no_money(self):
        helper, _ = self.cohost()
        self.client.force_authenticate(helper)
        data = self.client.get(self.summary_url).json()
        self.assertIsNone(data['revenue'])
        self.assertIsNone(data['tier_revenue'])
        self.assertEqual(data['new_followers'], 0)

    def test_new_followers_are_people_who_followed_after_their_ticket(self):
        fan = User.objects.create_user(email='fan@example.com')
        old = User.objects.create_user(email='old@example.com')
        Follow.objects.create(follower=old, following=self.owner)  # followed before buying
        ticket(self.event, user=old, email='old@example.com')
        ticket(self.event, user=fan, email='fan@example.com')
        Follow.objects.create(follower=fan, following=self.owner)
        stranger = User.objects.create_user(email='other@example.com')
        Follow.objects.create(follower=stranger, following=self.owner)  # no ticket here
        self.assertEqual(self.client.get(self.summary_url).json()['new_followers'], 1)

    def test_guest_order_details(self):
        payment = Payment.objects.create(
            event=self.event, customer_email='a@example.com', customer_name='A',
            amount=Decimal('10500'), paystack_reference='REF-1', status='successful', channel='card',
        )
        first = ticket(self.event, status='paid', email='a@example.com', payment=payment)
        second = ticket(self.event, status='paid', email='b@example.com', payment=payment)
        other = make_event(self.owner, name='Earlier')
        past = ticket(other, email='b@example.com')
        Stamp.objects.create(ticket=past, event=other, organizer=self.owner, email='b@example.com')

        url = f'/api/dashboard/events/{self.event.slug}/guests/{second.ticket_id}/'
        data = self.client.get(url).json()
        self.assertEqual(data['order']['reference'], 'REF-1')
        self.assertEqual(data['order']['tickets'], 2)
        self.assertEqual(data['order']['position'], 2)
        self.assertEqual(data['order']['channel'], 'Card')
        self.assertEqual(data['order']['paid'], '10500.00')
        self.assertGreater(Decimal(data['order']['net']), 0)
        self.assertEqual(data['events_with_you'], 2)
        self.assertEqual(data['events_attended'], 1)
        self.assertFalse(data['is_regular'])

        # Co-hosts see the order but not the money.
        helper, _ = self.cohost(role=EventCoHost.ROLE_CHECKIN)
        self.client.force_authenticate(helper)
        data = self.client.get(f'/api/dashboard/events/{self.event.slug}/guests/{first.ticket_id}/').json()
        self.assertEqual(data['order']['position'], 1)
        self.assertNotIn('paid', data['order'])

    def test_guest_from_another_event_is_not_found(self):
        other = make_event(self.owner, name='Other')
        t = ticket(other)
        url = f'/api/dashboard/events/{self.event.slug}/guests/{t.ticket_id}/'
        self.assertEqual(self.client.get(url).status_code, 404)

    def test_free_guest_has_no_order(self):
        t = ticket(self.event)
        data = self.client.get(f'/api/dashboard/events/{self.event.slug}/guests/{t.ticket_id}/').json()
        self.assertIsNone(data['order'])
        self.assertEqual(data['events_with_you'], 1)

    @patch('bryo.dash_event.send_cohost_invite_email')
    def test_resend_pending_invite_owner_only(self, send):
        _, pending = self.cohost(status=EventCoHost.STATUS_PENDING, email='new@example.com')
        url = f'/api/dashboard/events/{self.event.slug}/cohosts/{pending.pk}/resend/'
        self.assertEqual(self.client.post(url).status_code, 200)
        send.assert_called_once()
        self.assertEqual(send.call_args.args[0], 'new@example.com')

        helper, accepted = self.cohost(email='helper2@example.com')
        accepted_url = f'/api/dashboard/events/{self.event.slug}/cohosts/{accepted.pk}/resend/'
        self.assertEqual(self.client.post(accepted_url).status_code, 400)

        self.client.force_authenticate(helper)
        self.assertEqual(self.client.post(url).status_code, 404)
        self.assertEqual(send.call_count, 1)
