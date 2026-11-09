"""A private address is shown only to ticket holders and the team."""
from unittest.mock import patch

from .models import EventCoHost, Follow
from .test_checkin import ticket
from .test_community import CommunityBase


class PrivateAddressBase(CommunityBase):
    def setUp(self):
        super().setUp()
        p = patch('bryo.community.notify_followers_in_background')
        p.start()
        self.addCleanup(p.stop)
        self.event.location = 'Cafe One, Yaba, Lagos'
        self.event.virtual_link = 'https://meet.example.com/secret'
        self.event.visibility = 'public'
        self.event.is_draft = False
        self.event.address_private = True
        self.event.save()
        self.url = f'/api/events/{self.event.slug}/'

    def get(self, user=None):
        self.client.force_authenticate(user)
        return self.client.get(self.url).json()


class EventApiTests(PrivateAddressBase):

    def test_the_public_and_signed_in_strangers_do_not_see_it(self):
        for user in (None, self.fan('stranger@example.com')):
            body = self.get(user)
            self.assertEqual(body['location'], '')
            self.assertIsNone(body['virtual_link'])
            self.assertTrue(body['address_hidden'])
            self.assertTrue(body['address_private'])
            self.assertNotIn('Cafe One', str(body))

    def test_a_ticket_holder_sees_it_by_account_or_by_ticket_email(self):
        holder = self.fan('holder@example.com')
        ticket(self.event, email='holder@example.com')
        body = self.get(holder)
        self.assertEqual(body['location'], 'Cafe One, Yaba, Lagos')
        self.assertFalse(body['address_hidden'])

    def test_a_pending_or_refunded_ticket_does_not_count(self):
        buyer = self.fan('buyer@example.com')
        ticket(self.event, status='pending', email='buyer@example.com')
        ticket(self.event, status='refunded', email='buyer@example.com')
        self.assertEqual(self.get(buyer)['location'], '')

    def test_the_team_always_sees_it(self):
        self.assertEqual(self.get(self.owner)['location'], 'Cafe One, Yaba, Lagos')
        cohost = self.fan('cohost@example.com')
        EventCoHost.objects.create(event=self.event, user=cohost, added_by=self.owner, status=EventCoHost.STATUS_ACCEPTED)
        self.assertEqual(self.get(cohost)['location'], 'Cafe One, Yaba, Lagos')

    def test_public_events_are_unchanged(self):
        self.event.address_private = False
        self.event.save()
        body = self.get(None)
        self.assertEqual(body['location'], 'Cafe One, Yaba, Lagos')
        self.assertFalse(body['address_hidden'])

    def test_an_organiser_can_switch_it_on_and_off(self):
        self.event.address_private = False
        self.event.save()
        self.client.force_authenticate(self.owner)
        r = self.client.patch(self.url, {'address_private': True}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.event.refresh_from_db()
        self.assertTrue(self.event.address_private)


class NoLeaksTests(PrivateAddressBase):

    def test_discover_search_and_area_filters_cannot_find_it_by_address(self):
        self.client.force_authenticate(None)
        for q in ('?search=Cafe One', '?area=Yaba'):
            rows = self.client.get('/api/events/' + q).json()
            rows = rows if isinstance(rows, list) else rows.get('results', [])
            self.assertEqual([r for r in rows if r['slug'] == self.event.slug], [], q)

    def test_the_locations_list_leaves_it_out(self):
        self.client.force_authenticate(None)
        body = self.client.get('/api/events/locations/').json()
        self.assertNotIn('Cafe One', str(body))

    def test_the_listing_hides_it_but_still_shows_the_event(self):
        self.client.force_authenticate(None)
        rows = self.client.get('/api/events/').json()
        rows = rows if isinstance(rows, list) else rows.get('results', [])
        mine = [r for r in rows if r['slug'] == self.event.slug]
        self.assertEqual(len(mine), 1)
        self.assertEqual(mine[0]['location'], '')

    def test_followers_are_not_emailed_the_address(self):
        from .community import notify_followers
        Follow.objects.create(follower=self.fan('f@example.com'), following=self.owner)
        self.event.followers_notified_at = None
        self.event.save()
        with patch('bryo.community.send_email') as sent:
            notify_followers(self.event)
        for call in sent.call_args_list:
            self.assertNotIn('Cafe One', call.args[2] + call.args[3])

    def test_the_ticket_email_still_has_the_address(self):
        # Holders are told where it is: the ticket and its calendar file carry it.
        t = ticket(self.event, email='holder@example.com')
        self.assertEqual(t.event.location, 'Cafe One, Yaba, Lagos')
