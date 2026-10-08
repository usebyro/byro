"""Check-in at the door: who can do it, which tickets get in, and what the page is told."""
from django.contrib.auth import get_user_model

from .models import EventCoHost, Ticket
from .test_payments import PaymentTestBase

User = get_user_model()


def ticket(event, status='free', email='guest@example.com', name='Guest One', **kw):
    return Ticket.objects.create(
        event=event, original_owner_name=name, original_owner_email=email,
        current_owner_name=name, current_owner_email=email, payment_status=status, **kw,
    )


class CheckInTests(PaymentTestBase):

    def setUp(self):
        super().setUp()
        self.client.force_authenticate(self.owner)
        self.url = f'/api/events/{self.event.slug}/checkin/'

    def scan(self, t):
        return self.client.post(self.url, {'qr_token': str(t.qr_token)}, format='json')

    def test_a_valid_ticket_gets_in_and_the_counter_moves(self):
        a, b = ticket(self.event, email='a@example.com'), ticket(self.event, status='paid', email='b@example.com')
        res = self.scan(a)
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertTrue(body['success'])
        self.assertEqual(body['attendee']['name'], 'Guest One')
        self.assertEqual(body['attendee']['tier_name'], 'General admission')
        self.assertEqual(body['counts'], {'checked_in': 1, 'total': 2})
        b.refresh_from_db()
        self.assertFalse(b.checked_in)

    def test_scanning_twice_says_so_and_does_not_count_twice(self):
        t = ticket(self.event)
        self.scan(t)
        again = self.scan(t).json()
        self.assertTrue(again['already_checked_in'])
        self.assertEqual(again['counts']['checked_in'], 1)
        self.assertIsNotNone(again['attendee']['checked_in_at'])

    def test_a_ticket_that_was_never_paid_for_does_not_get_in(self):
        for status in ('pending', 'failed'):
            t = ticket(self.event, status=status, email=f'{status}@example.com')
            res = self.scan(t)
            self.assertEqual(res.status_code, 400, status)
            self.assertIn('not been paid', res.json()['error'])
            t.refresh_from_db()
            self.assertFalse(t.checked_in)

    def test_a_ticket_for_another_event_is_not_found(self):
        from .test_payments import make_event
        other = make_event(self.owner, name='Other')
        res = self.scan(ticket(other))
        self.assertEqual(res.status_code, 404)

    def test_check_in_helpers_can_scan_but_strangers_cannot(self):
        t = ticket(self.event)
        helper = User.objects.create_user(email='door@example.com')
        EventCoHost.objects.create(
            event=self.event, user=helper, added_by=self.owner,
            status=EventCoHost.STATUS_ACCEPTED, role=EventCoHost.ROLE_CHECKIN,
        )
        self.client.force_authenticate(helper)
        self.assertEqual(self.scan(t).status_code, 200)
        stranger = User.objects.create_user(email='nobody@example.com')
        self.client.force_authenticate(stranger)
        self.assertEqual(self.scan(ticket(self.event, email='z@example.com')).status_code, 403)
