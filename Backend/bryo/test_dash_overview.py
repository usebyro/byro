"""The dashboard Overview: revenue by period, tiles, next event, recent sales and community numbers."""
import datetime
from decimal import Decimal
from zoneinfo import ZoneInfo

from django.contrib.auth import get_user_model
from django.utils import timezone

from .models import EventCoHost, Follow, Stamp, Ticket, TicketTier
from .test_checkin import ticket
from .test_payments import PaymentTestBase, make_event, make_payment

User = get_user_model()
LAGOS = ZoneInfo('Africa/Lagos')
URL = '/api/dashboard/overview/'


def at(t, when):
    """Move a row's auto-set created_at."""
    type(t).objects.filter(pk=t.pk).update(created_at=when)
    return t


class OverviewBase(PaymentTestBase):
    def setUp(self):
        super().setUp()
        self.client.force_authenticate(self.owner)
        self.now = timezone.now()

    def get(self, period='30d'):
        res = self.client.get(URL, {'period': period})
        self.assertEqual(res.status_code, 200)
        return res.json()


class RevenueTests(OverviewBase):

    def test_needs_sign_in(self):
        self.client.force_authenticate(None)
        self.assertIn(self.client.get(URL).status_code, (401, 403))

    def test_revenue_counts_owned_paid_tickets_in_the_period(self):
        ticket(self.event, status='paid', email='a@example.com')
        ticket(self.event, status='free', email='b@example.com')
        at(ticket(self.event, status='paid', email='old@example.com'), self.now - datetime.timedelta(days=40))
        data = self.get('30d')
        self.assertEqual(Decimal(data['revenue']['total']), Decimal('5000'))
        self.assertEqual(Decimal(data['revenue']['previous']), Decimal('5000'))
        self.assertEqual(len(data['revenue']['series']), 30)
        self.assertEqual(len(data['labels']), 30)
        self.assertEqual(data['tickets']['total'], 2)
        self.assertEqual(data['tickets']['events'], ['Test Event'])

    def test_absorbed_fee_comes_off_revenue(self):
        self.event.pass_fee_to_attendee = False
        self.event.save()
        ticket(self.event, status='paid')
        self.assertEqual(Decimal(self.get('7d')['revenue']['total']), Decimal('4750'))

    def test_co_hosted_events_count_tickets_not_revenue(self):
        other = User.objects.create_user(email='other@example.com')
        theirs = make_event(other, name='Their Event', ticket_price=Decimal('2000'))
        EventCoHost.objects.create(event=theirs, user=self.owner, added_by=other, status=EventCoHost.STATUS_ACCEPTED)
        ticket(theirs, status='paid')
        stranger = make_event(other, name='Not Mine', ticket_price=Decimal('2000'))
        ticket(stranger, status='paid')
        data = self.get('7d')
        self.assertEqual(Decimal(data['revenue']['total']), Decimal('0'))
        self.assertEqual(data['tickets']['total'], 1)
        sale = data['recent_sales'][0]
        self.assertEqual(sale['event'], 'Their Event')
        self.assertIsNone(sale['amount'])

    def test_drafts_are_ignored(self):
        draft = make_event(self.owner, name='Draft', ticket_price=Decimal('1000'), is_draft=True)
        ticket(draft, status='paid')
        self.assertEqual(self.get('7d')['tickets']['total'], 0)

    def test_days_are_lagos_days(self):
        # 23:30 UTC yesterday is 00:30 today in Lagos.
        lagos_midnight = datetime.datetime.combine(
            timezone.localtime(self.now, LAGOS).date(), datetime.time.min, tzinfo=LAGOS,
        )
        at(ticket(self.event, status='paid'), lagos_midnight + datetime.timedelta(minutes=30))
        data = self.get('7d')
        self.assertEqual(Decimal(data['revenue']['series'][-1]), Decimal('5000'))
        self.assertEqual(data['labels'][-1], timezone.localtime(self.now, LAGOS).date().isoformat())

    def test_all_time_is_by_quarter_from_the_first_sale(self):
        at(ticket(self.event, status='paid'), self.now - datetime.timedelta(days=400))
        ticket(self.event, status='paid', email='new@example.com')
        data = self.get('all')
        self.assertEqual(data['unit'], 'quarter')
        self.assertIsNone(data['revenue']['previous'])
        self.assertGreaterEqual(len(data['labels']), 5)
        self.assertRegex(data['labels'][0], r'^\d{4}-Q[1-4]$')
        self.assertEqual(Decimal(data['revenue']['series'][0]), Decimal('5000'))
        self.assertEqual(Decimal(data['revenue']['series'][-1]), Decimal('5000'))
        self.assertEqual(Decimal(data['revenue']['total']), Decimal('10000'))

    def test_unknown_period_falls_back_to_30_days(self):
        self.assertEqual(self.get('nonsense')['period'], '30d')


class NextEventAndSalesTests(OverviewBase):

    def test_next_event_has_tier_mix_and_revenue(self):
        early = TicketTier.objects.create(event=self.event, name='Early bird', price=Decimal('2000'), capacity=10, order=0)
        regular = TicketTier.objects.create(event=self.event, name='Regular', price=Decimal('5000'), capacity=10, order=1)
        ticket(self.event, status='paid', tier=early)
        ticket(self.event, status='paid', tier=regular, email='r@example.com')
        ticket(self.event, status='pending', tier=regular, email='p@example.com')
        nxt = self.get()['next_event']
        self.assertEqual(nxt['slug'], self.event.slug)
        self.assertEqual(nxt['sold'], 2)
        self.assertEqual(nxt['capacity'], 100)
        self.assertEqual(Decimal(nxt['revenue']), Decimal('7000'))
        self.assertEqual([(t['name'], t['sold']) for t in nxt['tiers']], [('Early bird', 1), ('Regular', 1)])
        self.assertTrue(nxt['hosts'][0]['is_you'])

    def test_no_upcoming_event(self):
        self.event.day = timezone.now().date() - datetime.timedelta(days=3)
        self.event.save()
        self.assertIsNone(self.get()['next_event'])

    def test_one_payment_is_one_sale(self):
        payment = make_payment(self.event, seats=2, amount='10500.00')
        for i in range(2):
            ticket(self.event, status='paid', payment=payment, email=f'g{i}@example.com', name='Chioma Eze')
        at(ticket(self.event, status='free', name='Earlier'), self.now - datetime.timedelta(hours=2))
        sales = self.get()['recent_sales']
        self.assertEqual(len(sales), 2)
        self.assertEqual(sales[0]['name'], 'Chioma Eze')
        self.assertEqual(sales[0]['quantity'], 2)
        self.assertEqual(Decimal(sales[0]['amount']), Decimal('10000'))
        self.assertEqual(sales[1]['tier'], 'Free')
        self.assertEqual(Decimal(sales[1]['amount']), Decimal('0'))


class CommunityTests(OverviewBase):

    def stamp(self, email, event, when):
        t = ticket(event, status='free', email=email)
        Ticket.objects.filter(pk=t.pk).update(checked_in=True, checked_in_at=when)
        s = Stamp.objects.create(ticket=t, event=event, organizer=self.owner, email=email)
        return at(s, when)

    def test_followers_regulars_and_came_back(self):
        fan = User.objects.create_user(email='fan@example.com')
        old_fan = User.objects.create_user(email='old@example.com')
        Follow.objects.create(follower=fan, following=self.owner)
        at(Follow.objects.create(follower=old_fan, following=self.owner), self.now - datetime.timedelta(days=90))

        events = [make_event(self.owner, name=f'E{i}') for i in range(3)]
        long_ago = self.now - datetime.timedelta(days=100)
        # fan@ comes to a third event this week: a new regular, and came back.
        self.stamp('fan@example.com', events[0], long_ago)
        self.stamp('fan@example.com', events[1], long_ago)
        self.stamp('fan@example.com', events[2], self.now - datetime.timedelta(days=1))
        # first@ shows up for the first time this week.
        self.stamp('first@example.com', events[2], self.now - datetime.timedelta(days=1))

        data = self.get('7d')
        self.assertEqual(data['followers']['new'], 1)
        self.assertEqual(data['followers']['total'], 2)
        self.assertEqual(data['followers']['came_to_event'], 1)
        self.assertEqual(data['community']['became_regulars'], 1)
        self.assertEqual(data['community']['came_back_rate'], 50)
        self.assertEqual(data['checked_in']['total'], 2)
        self.assertEqual(data['checked_in']['top_event']['name'], 'E2')
        self.assertEqual(data['checked_in']['top_event']['turnout'], 100)

    def test_nobody_showed_up(self):
        data = self.get('7d')
        self.assertIsNone(data['community']['came_back_rate'])
        self.assertIsNone(data['checked_in']['top_event'])
