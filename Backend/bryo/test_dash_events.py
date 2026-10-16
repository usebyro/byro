"""The dashboard Events list: which events show up, and the numbers on each row."""
import datetime
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.utils import timezone

from .models import EventCoHost, Ticket, TicketTier
from .test_payments import PaymentTestBase, make_event

User = get_user_model()
URL = '/api/dashboard/events/'


def ticket(event, status='free', email='guest@example.com', **kw):
    return Ticket.objects.create(
        event=event, original_owner_name='Guest', original_owner_email=email,
        current_owner_name='Guest', current_owner_email=email, payment_status=status, **kw,
    )


class DashboardEventsTests(PaymentTestBase):

    def setUp(self):
        super().setUp()
        self.client.force_authenticate(self.owner)

    def rows(self):
        res = self.client.get(URL)
        self.assertEqual(res.status_code, 200)
        return {r['slug']: r for r in res.json()['events']}

    def test_needs_sign_in(self):
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get(URL).status_code, 401)

    def test_counts_sold_checked_in_and_revenue(self):
        ticket(self.event, status='paid', email='a@example.com', checked_in=True)
        ticket(self.event, status='paid', email='b@example.com')
        ticket(self.event, status='pending', email='c@example.com')
        row = self.rows()[self.event.slug]
        self.assertEqual(row['sold'], 2)
        self.assertEqual(row['checked_in'], 1)
        self.assertEqual(row['capacity'], 100)
        self.assertGreater(Decimal(row['revenue']), 0)
        self.assertFalse(row['is_free'])
        self.assertFalse(row['is_past'])
        self.assertTrue(row['is_owner'])

    def test_drafts_past_and_cancelled_are_listed_and_flagged(self):
        draft = make_event(self.owner, name='Draft', is_draft=True)
        past = make_event(self.owner, name='Past')
        past.day = timezone.localdate() - datetime.timedelta(days=3)
        past.save()
        cancelled = make_event(self.owner, name='Cancelled', cancelled_at=timezone.now())
        rows = self.rows()
        self.assertTrue(rows[draft.slug]['is_draft'])
        self.assertTrue(rows[past.slug]['is_past'])
        self.assertTrue(rows[cancelled.slug]['is_cancelled'])
        self.assertFalse(rows[self.event.slug]['is_draft'])

    def test_capacity_falls_back_to_tier_limits_and_free_events(self):
        ev = make_event(self.owner, name='Tiers', ticket_price=Decimal('0'))
        TicketTier.objects.create(event=ev, name='A', price=0, capacity=30)
        TicketTier.objects.create(event=ev, name='B', price=0, capacity=20)
        row = self.rows()[ev.slug]
        self.assertEqual(row['capacity'], 50)
        self.assertTrue(row['is_free'])

    def test_cohosts_see_the_event_but_not_its_revenue_and_strangers_see_nothing(self):
        ticket(self.event, status='paid')
        helper = User.objects.create_user(email='cohost@example.com')
        EventCoHost.objects.create(
            event=self.event, user=helper, added_by=self.owner, status=EventCoHost.STATUS_ACCEPTED,
        )
        self.client.force_authenticate(helper)
        row = self.rows()[self.event.slug]
        self.assertEqual(row['sold'], 1)
        self.assertIsNone(row['revenue'])
        self.assertFalse(row['is_owner'])

        self.client.force_authenticate(User.objects.create_user(email='stranger@example.com'))
        self.assertEqual(self.rows(), {})
