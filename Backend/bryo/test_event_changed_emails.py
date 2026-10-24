"""Ticket holders are emailed when the organiser (or Byro) moves an event's date, time or place."""
import datetime
from unittest.mock import patch

from django.utils import timezone

from .models import AdminMember, Event, Ticket
from .test_admin_tools import AdminBase


class EventChangedEmailTests(AdminBase):

    def setUp(self):
        super().setUp()
        self.today = timezone.localdate()
        Event.objects.filter(pk=self.event.pk).update(
            day=self.today + datetime.timedelta(days=10), time_from=datetime.time(18, 0), time_to=datetime.time(21, 0),
            location='Yaba', is_draft=False, is_active=True,
        )
        self.event.refresh_from_db()
        self.holders = [self.ticket('ada@example.com', 'Ada'), self.ticket('bayo@example.com', 'Bayo', status='free')]
        self.ticket('dup@example.com', 'Dup')
        self.ticket('dup@example.com', 'Dup again')          # same person twice: one email
        self.ticket('failed@example.com', 'Nope', status='failed')   # never paid: no email
        p = patch('bryo.event_changes._spawn', side_effect=lambda fn: fn())
        p.start()
        self.addCleanup(p.stop)
        p = patch('bryo.event_changes.send_email')
        self.send = p.start()
        self.addCleanup(p.stop)

    def ticket(self, email, name, status='paid'):
        return Ticket.objects.create(event=self.event, original_owner_name=name, original_owner_email=email,
                                     current_owner_name=name, current_owner_email=email, payment_status=status)

    def organiser_edits(self, **body):
        self.client.force_authenticate(self.owner)
        return self.client.patch(f'/api/events/{self.event.slug}/', body, format='json')

    def recipients(self):
        return sorted(c.kwargs['to'] for c in self.send.call_args_list)

    def test_moving_the_date_and_time_emails_each_holder_once_with_old_and_new(self):
        new_day = (self.today + datetime.timedelta(days=17)).isoformat()
        r = self.organiser_edits(day=new_day, time_from='19:30:00', time_to='22:00:00')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(self.recipients(), ['ada@example.com', 'bayo@example.com', 'dup@example.com'])
        mail = next(c.kwargs for c in self.send.call_args_list if c.kwargs['to'] == 'ada@example.com')
        self.assertEqual(mail['subject'], f'{self.event.name} has changed')
        for expected in ('Date', 'Time', '6:00 PM to 9:00 PM WAT', '7:30 PM to 10:00 PM WAT', 'still valid'):
            self.assertIn(expected, mail['text'])
        self.assertNotIn('Location', mail['text'])
        self.assertIn('/ticket/', mail['text'])

    def test_a_new_location_emails_holders(self):
        self.organiser_edits(location='Lekki Phase 1')
        self.assertEqual(len(self.recipients()), 3)
        self.assertIn('Yaba -> Lekki Phase 1', self.send.call_args.kwargs['text'])

    def test_other_edits_send_nothing(self):
        self.organiser_edits(name='A better name', description='New words')
        self.send.assert_not_called()

    def test_saving_the_same_values_sends_nothing(self):
        self.organiser_edits(location='Yaba', time_from='18:00:00')
        self.send.assert_not_called()

    def test_drafts_cancelled_suspended_and_finished_events_send_nothing(self):
        for fields in ({'is_draft': True}, {'cancelled_at': timezone.now()}, {'is_active': False},
                       {'day': self.today - datetime.timedelta(days=2)}):
            Event.objects.filter(pk=self.event.pk).update(**fields)
            self.organiser_edits(location='Somewhere else ' + str(sorted(fields)))
            self.send.assert_not_called()
            Event.objects.filter(pk=self.event.pk).update(is_draft=False, cancelled_at=None, is_active=True,
                                                          day=self.today + datetime.timedelta(days=10))

    def test_a_failing_address_does_not_stop_the_rest(self):
        self.send.side_effect = [RuntimeError('bounce'), None, None]
        self.organiser_edits(location='Lekki Phase 1')
        self.assertEqual(self.send.call_count, 3)

    def test_byro_fixing_the_location_tells_holders_too(self):
        self.client.force_authenticate(self.boss)
        r = self.client.patch(f'/api/admin/events/{self.event.pk}/', {'location': 'Lekki Phase 1'}, format='json')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(len(self.recipients()), 3)
