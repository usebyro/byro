"""The activity log says what changed when an organiser edits an event, not just that they did."""
from decimal import Decimal

from .changes import EVENT_FIELDS, describe, snapshot
from .models import ActivityLog, TicketTier
from .test_community import CommunityBase


class DescribeTests(CommunityBase):

    def test_names_old_and_new_values_and_notes_long_text_and_files(self):
        before = snapshot(self.event, EVENT_FIELDS)
        self.event.name = 'Lagos Run 5k'
        self.event.ticket_price = Decimal('6000.00')
        self.event.description = 'Something else entirely'
        after = snapshot(self.event, EVENT_FIELDS)
        text = describe(before, after, EVENT_FIELDS)
        self.assertIn('name: ', text)
        self.assertIn('→ Lagos Run 5k', text)
        self.assertIn('ticket price: ', text)
        self.assertIn('→ 6000', text)
        self.assertIn('description changed', text)
        self.assertNotIn('Something else entirely', text)  # long text isn't copied into the log

    def test_nothing_changed_says_nothing_and_publishing_is_named(self):
        same = snapshot(self.event, EVENT_FIELDS)
        self.assertEqual(describe(same, dict(same), EVENT_FIELDS), '')
        self.assertEqual(describe({'is_draft': True}, {'is_draft': False}, []), 'published')

    def test_long_values_are_shortened(self):
        text = describe({'name': 'a' * 90}, {'name': 'b'}, [('name', 'name', 'text')])
        self.assertTrue(text.startswith('name: ' + 'a' * 39 + '…'))


class LoggedEditsTests(CommunityBase):

    def last(self):
        return ActivityLog.objects.filter(action='event.updated').latest('id')

    def test_an_event_edit_logs_the_fields_that_changed(self):
        self.client.force_authenticate(self.owner)
        r = self.client.patch(f'/api/events/{self.event.slug}/', {'location': 'Lekki Phase 1'}, format='json')
        self.assertEqual(r.status_code, 200)
        self.assertIn('location: ', self.last().detail)
        self.assertIn('→ Lekki Phase 1', self.last().detail)

    def test_saving_without_changes_says_so(self):
        self.client.force_authenticate(self.owner)
        self.client.patch(f'/api/events/{self.event.slug}/', {'name': self.event.name}, format='json')
        self.assertEqual(self.last().detail, 'saved, nothing changed')

    def test_ticket_type_changes_are_logged_with_the_old_and_new_price(self):
        self.client.force_authenticate(self.owner)
        r = self.client.post(f'/api/events/{self.event.slug}/tiers/', {'name': 'VIP', 'price': '5000', 'capacity': 50}, format='json')
        self.assertEqual(r.status_code, 201, r.content)
        self.assertIn("added ticket type 'VIP'", self.last().detail)
        tier = TicketTier.objects.get(event=self.event, name='VIP')
        self.client.patch(f'/api/events/{self.event.slug}/tiers/{tier.pk}/', {'price': '7500'}, format='json')
        self.assertIn("ticket type 'VIP': price: 5000 → 7500", self.last().detail)
        self.client.delete(f'/api/events/{self.event.slug}/tiers/{tier.pk}/')
        self.assertIn("removed ticket type 'VIP'", self.last().detail)


class DateAndTimeTests(CommunityBase):

    def last(self):
        return ActivityLog.objects.filter(action='event.updated').latest('id')

    def test_moving_the_date_and_time_is_logged_in_plain_words(self):
        self.client.force_authenticate(self.owner)
        r = self.client.patch(
            f'/api/events/{self.event.slug}/',
            {'day': '2031-03-14', 'time_from': '19:30:00', 'time_to': '22:00:00'}, format='json',
        )
        self.assertEqual(r.status_code, 200, r.content)
        detail = self.last().detail
        self.assertIn('date: ', detail)
        self.assertIn('→ Fri 14 Mar 2031', detail)
        self.assertIn('start time: ', detail)
        self.assertIn('→ 7:30 PM', detail)
        self.assertIn('end time: ', detail)
        self.assertIn('→ 10:00 PM', detail)
