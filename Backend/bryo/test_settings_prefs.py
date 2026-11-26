"""Settings > Notifications: the saved choices and the emails that respect them."""
import datetime
from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.utils import timezone
from rest_framework.test import APIClient

from .models import EventCoHost, UserProfile
from .test_payments import PaymentTestBase, make_event
from .test_refunds import paid_order

User = get_user_model()


class PreferenceApiTests(PaymentTestBase):

    def setUp(self):
        super().setUp()
        self.client = APIClient()
        self.client.force_authenticate(self.owner)
        self.url = '/api/notifications/settings/'

    def test_the_defaults(self):
        body = self.client.get(self.url).json()
        self.assertEqual(body, {'muted': [], 'sale_email': 'every', 'merch_email': 'every', 'byro_picks': True})

    def test_sale_and_merch_email_choices_are_saved(self):
        res = self.client.patch(self.url, {'sale_email': 'daily', 'merch_email': 'off'}, format='json')
        self.assertEqual(res.status_code, 200, res.content)
        body = self.client.get(self.url).json()
        self.assertEqual((body['sale_email'], body['merch_email']), ('daily', 'off'))

    def test_a_bad_choice_is_refused_and_nothing_changes(self):
        res = self.client.patch(self.url, {'sale_email': 'hourly'}, format='json')
        self.assertEqual(res.status_code, 400)
        self.assertEqual(self.client.get(self.url).json()['sale_email'], 'every')

    def test_the_new_email_switches_can_be_turned_off(self):
        kinds = ['event_reminder_email', 'ticket_reminder_email', 'new_event_email']
        res = self.client.patch(self.url, {'muted': kinds + ['nonsense']}, format='json')
        self.assertEqual(sorted(res.json()['muted']), sorted(kinds))

    def test_byro_picks_is_the_newsletter_and_changing_one_thing_keeps_the_rest(self):
        self.client.patch(self.url, {'muted': ['milestone']}, format='json')
        res = self.client.patch(self.url, {'byro_picks': False}, format='json')
        self.assertFalse(res.json()['byro_picks'])
        self.assertEqual(res.json()['muted'], ['milestone'])
        self.assertFalse(UserProfile.objects.get(user=self.owner).newsletter_subscribed)

    def test_an_empty_change_is_refused(self):
        self.assertEqual(self.client.patch(self.url, {}, format='json').status_code, 400)


class SwitchesAreHonouredTests(PaymentTestBase):

    def setUp(self):
        super().setUp()
        tomorrow = timezone.now().date() + datetime.timedelta(days=1)
        self.event = make_event(self.owner, name='Tomorrow Event', ticket_price=Decimal('5000'), capacity=100)
        self.event.day = tomorrow
        self.event.save()
        self.helper = User.objects.create_user(email='cohost@example.com')
        EventCoHost.objects.create(event=self.event, user=self.helper, added_by=self.owner,
                                   status=EventCoHost.STATUS_ACCEPTED, role='manager')

    def mute(self, user, *kinds):
        UserProfile.objects.filter(user=user).update(muted_notifications=list(kinds))

    def run_reminders(self):
        sent = []
        with patch('bryo.mailer.send_email', side_effect=lambda to, subject, html, text=None, **kw: sent.append((to, subject))):
            call_command('send_event_reminders')
        return sent

    def test_organiser_reminders_skip_whoever_turned_them_off(self):
        paid_order(self.event, subtotal='5000.00', fee='250.00', seats=1)
        self.mute(self.helper, 'event_reminder_email')
        recipients = {to for to, _ in self.run_reminders() if 'starts tomorrow' in _}
        self.assertEqual(recipients, {'owner@example.com'})

    def test_ticket_reminders_skip_an_attendee_who_turned_them_off(self):
        paid_order(self.event, subtotal='5000.00', fee='250.00', seats=1)
        ticket = self.event.tickets.first()
        buyer = User.objects.create_user(email=ticket.current_owner_email)
        ticket.user = buyer
        ticket.save(update_fields=['user'])
        self.mute(buyer, 'ticket_reminder_email')
        sent = self.run_reminders()
        self.assertFalse([1 for to, subject in sent if to == ticket.current_owner_email and 'tomorrow' in subject])
