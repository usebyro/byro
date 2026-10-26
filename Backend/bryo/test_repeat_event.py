"""Repeating an event on more dates: each date is its own copy."""
from datetime import timedelta
from decimal import Decimal

from django.utils import timezone

from .models import EventFormQuestion, Ticket, TicketTier
from .test_admin_tools import AdminBase


class RepeatEventTests(AdminBase):

    def setUp(self):
        super().setUp()
        self.event.day = timezone.localdate() + timedelta(days=7)
        self.event.save()
        TicketTier.objects.create(event=self.event, name='VIP', price=Decimal('5000'), capacity=20, order=0)
        EventFormQuestion.objects.create(event=self.event, question='Shirt size?', order=0)
        self.url = f'/api/events/{self.event.slug}/repeat/'

    def days(self, *offsets):
        return [(self.event.day + timedelta(days=o)).isoformat() for o in offsets]

    def test_each_date_becomes_its_own_copy_with_tiers_and_questions(self):
        self.as_(self.owner)
        r = self.client.post(self.url, {'dates': self.days(7, 14)}, format='json')
        self.assertEqual(r.status_code, 201)
        slugs = [e['slug'] for e in r.json()['events']]
        self.assertEqual(len(set(slugs + [self.event.slug])), 3)
        copy = type(self.event).objects.get(slug=slugs[0])
        self.assertEqual((copy.name, copy.day), (self.event.name, self.event.day + timedelta(days=7)))
        self.assertEqual(copy.owner, self.event.owner)
        self.assertEqual(list(copy.tiers.values_list('name', 'price')), [('VIP', Decimal('5000.00'))])
        self.assertEqual(list(copy.form_questions.values_list('question', flat=True)), ['Shirt size?'])
        self.assertEqual(self.event.tiers.count(), 1)  # the original keeps its own

    def test_nothing_sold_is_copied_and_state_starts_fresh(self):
        self.event.sales_closed = True
        self.event.reminder_sent_at = timezone.now()
        self.event.save()
        self.as_(self.owner)
        r = self.client.post(self.url, {'dates': self.days(7)}, format='json')
        copy = type(self.event).objects.get(slug=r.json()['events'][0]['slug'])
        self.assertFalse(copy.sales_closed)
        self.assertIsNone(copy.reminder_sent_at)
        self.assertEqual(Ticket.objects.filter(event=copy).count(), 0)

    def test_own_date_past_dates_and_repeats_are_skipped(self):
        self.as_(self.owner)
        r = self.client.post(self.url, {'dates': self.days(0, -10, 7, 7)}, format='json')
        self.assertEqual([e['day'] for e in r.json()['events']], self.days(7))

    def test_bad_requests_are_refused(self):
        self.as_(self.owner)
        self.assertEqual(self.client.post(self.url, {}, format='json').status_code, 400)
        self.assertEqual(self.client.post(self.url, {'dates': ['soon']}, format='json').status_code, 400)
        self.assertEqual(self.client.post(self.url, {'dates': self.days(0)}, format='json').status_code, 400)
        self.assertEqual(self.client.post(self.url, {'dates': self.days(*range(1, 60))}, format='json').status_code, 400)

    def test_only_the_owner_can_repeat_an_event(self):
        self.as_(self.fan('someone@example.com'))
        self.assertIn(self.client.post(self.url, {'dates': self.days(7)}, format='json').status_code, (403, 404))
        self.as_(None)
        self.assertEqual(self.client.post(self.url, {'dates': self.days(7)}, format='json').status_code, 401)
