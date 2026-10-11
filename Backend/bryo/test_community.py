"""The community loop: follow at checkout, tell followers, stamp at the door, show the numbers."""
from unittest.mock import patch

from django.contrib.auth import get_user_model

from .community import (
    community_stats, notify_followers, record_stamp, unfollow_from_token, unfollow_token,
)
from .models import Follow, Stamp, Ticket, UserProfile
from .test_checkin import ticket
from .test_payments import PaymentTestBase, make_event

User = get_user_model()


class CommunityBase(PaymentTestBase):
    def setUp(self):
        super().setUp()
        UserProfile.objects.update_or_create(
            user=self.owner, defaults={'handle': 'lagosrun', 'display_name': 'Lagos Run Club'},
        )

    def fan(self, email='fan@example.com'):
        return User.objects.create_user(email=email)


class AutoFollowTests(CommunityBase):

    def register(self, user, **extra):
        self.client.force_authenticate(user)
        return self.client.post(
            f'/api/events/{self.event.slug}/register/',
            {'name': 'Fan', 'email': user.email, **extra}, format='json',
        )

    def test_registering_follows_the_organiser(self):
        fan = self.fan()
        self.event.ticket_price = 0
        self.event.save()
        self.assertEqual(self.register(fan).status_code, 201)
        self.assertTrue(Follow.objects.filter(follower=fan, following=self.owner).exists())

    def test_the_buyer_can_opt_out(self):
        fan = self.fan()
        self.event.ticket_price = 0
        self.event.save()
        self.register(fan, follow_organizer=False)
        self.assertFalse(Follow.objects.filter(follower=fan).exists())

    def test_the_organiser_never_follows_themselves(self):
        self.event.ticket_price = 0
        self.event.save()
        self.register(self.owner)
        self.assertFalse(Follow.objects.exists())


class FollowerEmailTests(CommunityBase):

    def setUp(self):
        super().setUp()
        self.sent = patch('bryo.community.send_email').start()

    def test_followers_hear_about_a_new_public_event_once(self):
        Follow.objects.create(follower=self.fan('a@example.com'), following=self.owner)
        Follow.objects.create(follower=self.fan('b@example.com'), following=self.owner)
        self.assertEqual(notify_followers(self.event), 2)
        self.assertEqual(notify_followers(self.event), 0)  # a second publish never re-sends
        self.assertEqual(self.sent.call_count, 2)
        to, subject, html, text = self.sent.call_args[0]
        self.assertIn('Lagos Run Club', subject)
        self.assertIn('/unfollow?t=', html)

    def test_drafts_and_private_events_stay_quiet(self):
        Follow.objects.create(follower=self.fan(), following=self.owner)
        draft = make_event(self.owner, name='Draft', is_draft=True)
        private = make_event(self.owner, name='Private', visibility='private')
        self.assertEqual(notify_followers(draft), 0)
        self.assertEqual(notify_followers(private), 0)
        self.sent.assert_not_called()

    def test_one_bad_address_does_not_stop_the_rest(self):
        Follow.objects.create(follower=self.fan('a@example.com'), following=self.owner)
        Follow.objects.create(follower=self.fan('b@example.com'), following=self.owner)
        self.sent.side_effect = [RuntimeError('bounce'), None]
        self.assertEqual(notify_followers(self.event), 1)

    def test_the_unfollow_link_works_without_signing_in(self):
        fan = self.fan()
        Follow.objects.create(follower=fan, following=self.owner)
        token = unfollow_token(fan.pk, self.owner.pk)
        res = self.client.post('/api/community/unfollow/', {'token': token}, format='json')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()['name'], 'Lagos Run Club')
        self.assertFalse(Follow.objects.exists())

    def test_a_forged_unfollow_link_is_refused(self):
        fan = self.fan()
        Follow.objects.create(follower=fan, following=self.owner)
        res = self.client.post('/api/community/unfollow/', {'token': 'nope'}, format='json')
        self.assertEqual(res.status_code, 400)
        self.assertTrue(Follow.objects.exists())
        self.assertIsNone(unfollow_from_token('nope'))


class StampTests(CommunityBase):

    def test_checking_in_gives_one_stamp(self):
        self.client.force_authenticate(self.owner)
        t = ticket(self.event, email='Fan@Example.com')
        url = f'/api/events/{self.event.slug}/checkin/'
        self.client.post(url, {'qr_token': str(t.qr_token)}, format='json')
        self.client.post(url, {'qr_token': str(t.qr_token)}, format='json')
        stamp = Stamp.objects.get()
        self.assertEqual(stamp.email, 'fan@example.com')
        self.assertEqual(stamp.organizer, self.owner)

    def test_record_stamp_is_idempotent(self):
        t = ticket(self.event)
        record_stamp(t)
        record_stamp(t)
        self.assertEqual(Stamp.objects.count(), 1)

    def test_my_stamps_matches_by_account_or_email(self):
        fan = self.fan('fan@example.com')
        record_stamp(ticket(self.event, email='fan@example.com'))
        self.client.force_authenticate(fan)
        body = self.client.get('/api/stamps/').json()
        self.assertEqual(body['count'], 1)
        self.assertEqual(body['stamps'][0]['organizer_handle'], 'lagosrun')


class CommunityStatsTests(CommunityBase):

    def attend(self, event, email):
        record_stamp(ticket(event, email=email))

    def test_regulars_and_repeat_rate(self):
        e2, e3 = make_event(self.owner, name='Two'), make_event(self.owner, name='Three')
        for e in (self.event, e2, e3):
            self.attend(e, 'regular@example.com')
        for e in (self.event, e2):
            self.attend(e, 'twice@example.com')
        self.attend(self.event, 'once@example.com')
        stats = community_stats(self.owner)
        self.assertEqual(stats['attendees'], 3)
        self.assertEqual(stats['regulars'], 1)
        self.assertEqual(stats['repeat_attendees'], 2)
        self.assertEqual(stats['repeat_rate'], 67)

    def test_no_attendance_gives_zeroes_not_an_error(self):
        self.assertEqual(community_stats(self.owner)['repeat_rate'], 0)

    def test_the_dashboard_card_needs_sign_in(self):
        self.assertIn(self.client.get('/api/dashboard/community/').status_code, (401, 403))
        self.client.force_authenticate(self.owner)
        Follow.objects.create(follower=self.fan(), following=self.owner)
        body = self.client.get('/api/dashboard/community/').json()
        self.assertEqual(body['followers'], 1)
        self.assertEqual(body['new_followers_30d'], 1)

    def test_the_public_page_carries_the_numbers(self):
        self.attend(self.event, 'a@example.com')
        body = self.client.get('/api/profile/lagosrun/').json()
        self.assertEqual(body['community']['attendees'], 1)


    def test_public_profile_lists_the_events_the_viewer_was_at(self):
        fan = self.fan('fan@example.com')
        record_stamp(ticket(self.event, email='fan@example.com'))
        url = '/api/profile/lagosrun/'
        self.assertEqual(self.client.get(url).json()['viewer_attended'], [])
        self.client.force_authenticate(self.fan('stranger@example.com'))
        self.assertEqual(self.client.get(url).json()['viewer_attended'], [])
        self.client.force_authenticate(fan)
        self.assertEqual(self.client.get(url).json()['viewer_attended'], [self.event.slug])


class DirectoryTests(CommunityBase):

    def test_lists_organisers_with_a_live_public_event(self):
        quiet = User.objects.create_user(email='quiet@example.com')
        UserProfile.objects.update_or_create(user=quiet, defaults={'handle': 'quiet', 'display_name': 'Quiet'})
        body = self.client.get('/api/communities/').json()
        self.assertEqual([c['handle'] for c in body['results']], ['lagosrun'])
        self.assertEqual(body['total'], 1)

    def test_hidden_profiles_and_drafts_are_left_out(self):
        UserProfile.objects.filter(user=self.owner).update(is_public=False)
        self.assertEqual(self.client.get('/api/communities/').json()['total'], 0)

    def test_search_filter_and_followers(self):
        Follow.objects.create(follower=self.fan(), following=self.owner)
        res = self.client.get('/api/communities/?q=lagos').json()
        self.assertEqual(res['results'][0]['followers'], 1)
        self.assertEqual(res['results'][0]['next_event']['slug'], self.event.slug)
        self.assertEqual(self.client.get('/api/communities/?q=zzz').json()['total'], 0)

    def test_is_following_is_per_viewer(self):
        fan = self.fan()
        Follow.objects.create(follower=fan, following=self.owner)
        self.client.force_authenticate(fan)
        self.assertTrue(self.client.get('/api/communities/').json()['results'][0]['is_following'])
