"""The community loop: follow at checkout, tell followers, stamp at the door, show the numbers."""
from unittest.mock import patch

from django.contrib.auth import get_user_model

from .community import (
    community_stats, notify_followers, record_stamp, unfollow_from_token, unfollow_token,
)
from .community import event_host_name, host_name_for_new_event
from .models import Event, EventCoHost, Follow, Message, Stamp, Ticket, UserProfile
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


class MessageTests(CommunityBase):
    URL = '/api/dashboard/messages/'

    def setUp(self):
        super().setUp()
        from django.core.cache import cache
        cache.clear()  # the per-hour send limit lives in the cache; start each test fresh
        self.client.force_authenticate(self.owner)
        # Send inline so the tests can look at the result.
        for target in ('bryo.messaging.deliver_in_background',):
            p = patch(target, side_effect=lambda m, r: __import__('bryo.messaging', fromlist=['x']).deliver(m, r))
            p.start()
            self.addCleanup(p.stop)
        p = patch('bryo.messaging.send_email')
        self.mail = p.start()
        self.addCleanup(p.stop)

    def follower(self, email, events=0):
        person = self.fan(email)
        Follow.objects.create(follower=person, following=self.owner)
        for _ in range(events):
            record_stamp(ticket(make_event(self.owner), email=email))
        return person

    def post(self, **kw):
        body = dict(kind='announce', audience='followers', subject='Hello', body='News for you.')
        body.update(kw)
        return self.client.post(self.URL, body, format='json')

    def sent_to(self):
        return sorted(c.args[0] for c in self.mail.call_args_list)

    def test_announcement_reaches_followers_with_an_unfollow_link(self):
        self.follower('a@example.com')
        self.follower('b@example.com')
        res = self.post()
        self.assertEqual(res.status_code, 201)
        self.assertEqual(self.sent_to(), ['a@example.com', 'b@example.com'])
        self.assertIn('/unfollow?t=', self.mail.call_args_list[0].args[2])
        m = Message.objects.get()
        self.assertEqual((m.status, m.recipients_count, m.sent_count, m.failed_count), ('sent', 2, 2, 0))

    def test_members_and_regulars_are_followers_who_showed_up(self):
        self.follower('never@example.com')
        self.follower('once@example.com', events=1)
        self.follower('often@example.com', events=3)
        counts = self.client.get(self.URL).json()['audiences']
        self.assertEqual(counts, {'followers': 3, 'members': 2, 'regulars': 1})
        self.post(audience='members')
        self.assertEqual(self.sent_to(), ['often@example.com', 'once@example.com'])
        self.mail.reset_mock()
        self.post(audience='regulars')
        self.assertEqual(self.sent_to(), ['often@example.com'])

    def test_someone_who_unfollowed_is_not_emailed(self):
        gone = self.follower('gone@example.com')
        self.follower('stays@example.com')
        Follow.objects.filter(follower=gone).delete()
        self.post()
        self.assertEqual(self.sent_to(), ['stays@example.com'])

    def test_event_update_goes_to_ticket_holders_only_and_cannot_be_unfollowed(self):
        ticket(self.event, email='holder@example.com')
        ticket(self.event, email='unpaid@example.com', status='pending')
        ticket(self.event, email='refunded@example.com', status='refunded')
        self.follower('follower@example.com')
        res = self.post(kind='update', audience='event', event=self.event.slug)
        self.assertEqual(res.status_code, 201)
        self.assertEqual(self.sent_to(), ['holder@example.com'])
        self.assertNotIn('unfollow', self.mail.call_args_list[0].args[2].lower())

    def test_two_announcements_a_week(self):
        self.follower('a@example.com')
        self.assertEqual(self.post().status_code, 201)
        self.assertEqual(self.post().status_code, 201)
        res = self.post()
        self.assertEqual(res.status_code, 400)
        self.assertEqual(self.client.get(self.URL).json()['announcements_left'], 0)
        ticket(self.event, email='holder@example.com')
        self.assertEqual(self.post(kind='update', audience='event', event=self.event.slug).status_code, 201)

    def test_test_send_goes_only_to_the_organiser_and_is_not_saved(self):
        self.follower('a@example.com')
        res = self.post(test=True)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(self.sent_to(), [self.owner.email])
        self.assertTrue(self.mail.call_args_list[0].args[1].startswith('[Test]'))
        self.assertEqual(Message.objects.count(), 0)

    def test_nothing_to_send_and_bad_input_are_refused(self):
        self.assertEqual(self.post().status_code, 400)  # no followers yet
        self.follower('a@example.com')
        self.assertEqual(self.post(subject='  ').status_code, 400)
        self.assertEqual(self.post(body='').status_code, 400)
        self.assertEqual(self.post(audience='everyone').status_code, 400)
        self.assertEqual(self.post(kind='update', audience='event').status_code, 400)  # no event
        self.assertEqual(Message.objects.count(), 0)

    def test_cannot_message_another_organisers_event(self):
        ticket(self.event, email='holder@example.com')
        self.client.force_authenticate(self.fan('rival@example.com'))
        res = self.post(kind='update', audience='event', event=self.event.slug)
        self.assertEqual(res.status_code, 400)
        self.mail.assert_not_called()

    def test_signed_out_cannot_use_it(self):
        self.client.force_authenticate(None)
        self.assertIn(self.client.get(self.URL).status_code, (401, 403))
        self.assertIn(self.post().status_code, (401, 403))

    def test_event_card_is_attached_when_asked(self):
        self.follower('a@example.com')
        self.post(attach_event=True, event=self.event.slug)
        self.assertIn(f'/discover/{self.event.slug}', self.mail.call_args_list[0].args[2])
        self.mail.reset_mock()
        self.post()
        self.assertNotIn('/discover/', self.mail.call_args_list[0].args[2])

    def test_replies_go_to_the_organiser_and_the_sender_name_is_theirs(self):
        self.follower('a@example.com')
        self.post()
        kwargs = self.mail.call_args_list[0].kwargs
        self.assertEqual(kwargs['reply_to'], self.owner.email)
        self.assertEqual(kwargs['from_name'], 'Lagos Run Club')

    def test_one_bounce_is_counted_and_the_rest_still_go(self):
        self.follower('a@example.com')
        self.follower('b@example.com')
        calls = []

        def flaky(to, *a, **k):
            calls.append(to)
            if to == 'a@example.com':
                raise RuntimeError('bounce')

        self.mail.side_effect = flaky
        self.post()
        m = Message.objects.get()
        self.assertEqual((m.status, m.sent_count, m.failed_count), ('sent', 1, 1))
        self.assertEqual(sorted(calls), ['a@example.com', 'b@example.com'])

    def test_no_automatic_greeting_and_name_tag_is_opt_in(self):
        person = self.follower('ada@example.com')
        UserProfile.objects.filter(user=person).update(display_name='Ada Obi')
        self.post(body='Doors open at 6.')
        html, text = self.mail.call_args_list[0].args[2], self.mail.call_args_list[0].args[3]
        self.assertNotIn('Hi ', html)
        self.assertNotIn('Hi', text.split('\n')[0])
        self.assertTrue(text.startswith('Doors open at 6.'))
        self.mail.reset_mock()
        self.post(subject='See you, {{name}}', body='Hi {{ Name }},\n\nDoors open at 6.')
        args = self.mail.call_args_list[0].args
        self.assertEqual(args[1], 'See you, Ada')
        self.assertIn('Hi Ada,', args[3])
        self.assertNotIn('{{', args[2])

    def test_name_tag_falls_back_to_there(self):
        from .emails import merge_name
        self.assertEqual(merge_name('Hi {{name}},', ''), 'Hi there,')
        self.assertEqual(merge_name('Hi {{name}},', None), 'Hi there,')
        self.assertEqual(merge_name('Hi {{name}},', '  Chidi  Eze '), 'Hi Chidi,')
        self.assertEqual(merge_name('No tag here', 'Ada'), 'No tag here')


    def when(self, **delta):
        from datetime import timedelta
        from django.utils import timezone
        return (timezone.now() + timedelta(**delta)).isoformat()

    def test_scheduling_saves_it_without_sending(self):
        self.follower('a@example.com')
        res = self.post(scheduled_for=self.when(hours=2))
        self.assertEqual(res.status_code, 201)
        self.assertEqual(res.json()['status'], 'scheduled')
        self.mail.assert_not_called()
        self.assertEqual(Message.objects.get().status, 'scheduled')

    def test_schedule_time_limits(self):
        self.follower('a@example.com')
        self.assertEqual(self.post(scheduled_for=self.when(minutes=1)).status_code, 400)
        self.assertEqual(self.post(scheduled_for=self.when(days=31)).status_code, 400)
        self.assertEqual(self.post(scheduled_for='next tuesday').status_code, 400)
        self.assertEqual(Message.objects.count(), 0)

    def test_due_messages_go_out_once_to_the_current_audience(self):
        from datetime import timedelta
        from django.utils import timezone
        from .messaging import send_due
        stays = self.follower('stays@example.com')
        gone = self.follower('gone@example.com')
        self.post(scheduled_for=self.when(hours=1))
        Follow.objects.filter(follower=gone).delete()
        self.assertEqual(send_due(), 0)  # not due yet
        later = timezone.now() + timedelta(hours=2)
        self.assertEqual(send_due(now=later), 1)
        self.assertEqual(self.sent_to(), ['stays@example.com'])
        m = Message.objects.get()
        self.assertEqual((m.status, m.recipients_count, m.sent_count), ('sent', 1, 1))
        self.assertEqual(send_due(now=later), 0)  # never twice
        self.assertEqual(len(self.mail.call_args_list), 1)

    def test_cancel_a_scheduled_message(self):
        from datetime import timedelta
        from django.utils import timezone
        from .messaging import send_due
        self.follower('a@example.com')
        mid = self.post(scheduled_for=self.when(hours=1)).json()['id']
        self.assertEqual(self.client.delete(f'{self.URL}{mid}/').status_code, 200)
        self.assertEqual(Message.objects.get().status, 'cancelled')
        self.assertEqual(send_due(now=timezone.now() + timedelta(hours=2)), 0)
        self.mail.assert_not_called()
        # Cancelling again, or someone else's message, is refused.
        self.assertEqual(self.client.delete(f'{self.URL}{mid}/').status_code, 400)

    def test_cannot_cancel_another_organisers_message(self):
        self.follower('a@example.com')
        mid = self.post(scheduled_for=self.when(hours=1)).json()['id']
        self.client.force_authenticate(self.fan('rival@example.com'))
        self.assertEqual(self.client.delete(f'{self.URL}{mid}/').status_code, 400)
        self.assertEqual(Message.objects.get().status, 'scheduled')

    def test_scheduled_announcements_count_toward_the_weekly_limit_and_cancelled_ones_free_it(self):
        self.follower('a@example.com')
        first = self.post(scheduled_for=self.when(hours=1)).json()['id']
        self.post(scheduled_for=self.when(hours=2))
        self.assertEqual(self.post().status_code, 400)
        self.client.delete(f'{self.URL}{first}/')
        self.assertEqual(self.post().status_code, 201)

    def test_the_command_sends_due_messages(self):
        from io import StringIO
        from django.core.management import call_command
        from datetime import timedelta
        from django.utils import timezone
        self.follower('a@example.com')
        self.post(scheduled_for=self.when(hours=1))
        Message.objects.update(scheduled_for=timezone.now() - timedelta(minutes=1))
        out = StringIO()
        call_command('send_scheduled_messages', stdout=out)
        self.assertIn('Sent 1', out.getvalue())
        self.assertEqual(self.sent_to(), ['a@example.com'])

class SenderNameTests(CommunityBase):
    def test_display_name_cannot_break_the_from_header(self):
        from .mailer import _display_from
        self.assertEqual(_display_from('Lagos Run Club'), 'Lagos Run Club via Byro <hello@usebyro.com>')
        evil = _display_from('Evil"\r\nBcc: x@y.com <a@b.c>')
        self.assertNotIn('\n', evil)
        self.assertNotIn('\r', evil)
        self.assertEqual(evil.count('<'), 1)
        self.assertTrue(_display_from('').startswith('Byro <'))


class HostNameTests(CommunityBase):
    """'Hosted by' is the community name, never the organiser's email."""

    def setUp(self):
        super().setUp()
        # What older events saved: the organiser's email.
        Event.objects.filter(pk=self.event.pk).update(hosted_by=self.owner.email)
        self.event.refresh_from_db()

    def rename(self, name):
        UserProfile.objects.filter(user=self.owner).update(display_name=name)
        self.event = Event.objects.select_related('owner__profile').get(pk=self.event.pk)

    def test_uses_the_community_name_and_follows_a_rename(self):
        self.assertEqual(event_host_name(self.event), 'Lagos Run Club')
        self.rename('Lagos Run Crew')
        self.assertEqual(event_host_name(self.event), 'Lagos Run Crew')

    def test_never_falls_back_to_an_email(self):
        self.rename('')
        self.assertEqual(event_host_name(self.event), 'lagosrun')  # the handle
        UserProfile.objects.filter(user=self.owner).update(handle=None)
        self.event = Event.objects.select_related('owner__profile').get(pk=self.event.pk)
        self.assertEqual(event_host_name(self.event), 'Byro')

    def test_a_real_saved_name_is_kept_when_there_is_no_community_name(self):
        self.rename('')
        Event.objects.filter(pk=self.event.pk).update(hosted_by='The Run Crew')
        self.event.refresh_from_db()
        self.assertEqual(event_host_name(self.event), 'The Run Crew')

    def test_the_public_event_and_the_ticket_show_the_name(self):
        from .serializers import EventSerializer, TicketSerializer
        self.assertEqual(EventSerializer(self.event).data['hosted_by'], 'Lagos Run Club')
        t = ticket(self.event, email='fan@example.com')
        self.assertEqual(TicketSerializer(t).data['event_hosted_by'], 'Lagos Run Club')

    def test_new_events_never_default_to_the_email(self):
        self.assertEqual(host_name_for_new_event(self.owner), 'Lagos Run Club')
        self.rename('')
        self.assertEqual(host_name_for_new_event(self.owner), 'lagosrun')
        UserProfile.objects.filter(user=self.owner).update(handle=None)
        self.assertEqual(host_name_for_new_event(User.objects.get(pk=self.owner.pk)), '')

    def test_clean_up_command_is_a_dry_run_until_applied(self):
        from io import StringIO
        from django.core.management import call_command
        out = StringIO()
        call_command('fix_hosted_by', stdout=out)
        self.assertIn('Would update 1', out.getvalue())
        self.event.refresh_from_db()
        self.assertEqual(self.event.hosted_by, self.owner.email)
        call_command('fix_hosted_by', '--apply', stdout=StringIO())
        self.event.refresh_from_db()
        self.assertEqual(self.event.hosted_by, 'Lagos Run Club')


class EmailPrivacyTests(CommunityBase):
    """Organiser and co-host email addresses never reach the public."""

    def setUp(self):
        super().setUp()
        self.cohost = self.fan('cohost@example.com')
        EventCoHost.objects.create(event=self.event, user=self.cohost, status='accepted', invited_email='cohost@example.com', added_by=self.owner)
        EventCoHost.objects.create(event=self.event, invited_email='pending@example.com', status='pending', added_by=self.owner)
        self.url = f'/api/events/{self.event.slug}/'

    def body(self, user=None):
        self.client.force_authenticate(user)
        return self.client.get(self.url).json()

    def test_signed_out_visitors_see_no_emails(self):
        data = self.body(None)
        self.assertIsNone(data['owner_email'])
        self.assertEqual(data['cohosts'], [])
        raw = str(data)
        for email in (self.owner.email, 'cohost@example.com', 'pending@example.com'):
            self.assertNotIn(email, raw)
        self.assertEqual(data['owner_handle'], 'lagosrun')
        self.assertEqual(data['owner_name'], 'Lagos Run Club')

    def test_other_signed_in_users_see_no_emails(self):
        data = self.body(self.fan('stranger@example.com'))
        self.assertIsNone(data['owner_email'])
        self.assertEqual(data['cohosts'], [])

    def test_the_owner_and_accepted_cohosts_still_see_them(self):
        owner_view = self.body(self.owner)
        self.assertEqual(owner_view['owner_email'], self.owner.email)
        self.assertEqual(len(owner_view['cohosts']), 2)
        self.assertEqual(self.body(self.cohost)['owner_email'], self.owner.email)

    def test_staff_see_them(self):
        staff = User.objects.create_user(email='staff@example.com', is_staff=True)
        self.assertEqual(self.body(staff)['owner_email'], self.owner.email)

    def test_the_events_list_is_covered_too(self):
        self.client.force_authenticate(None)
        rows = self.client.get('/api/events/').json()
        rows = rows['results'] if isinstance(rows, dict) else rows
        self.assertTrue(rows)
        self.assertNotIn(self.owner.email, str(rows))

    def test_public_profile_has_no_email_unless_you_are_the_owner(self):
        self.client.force_authenticate(None)
        self.assertNotIn('email', self.client.get('/api/profile/lagosrun/').json())
        self.client.force_authenticate(self.fan('stranger@example.com'))
        self.assertNotIn('email', self.client.get('/api/profile/lagosrun/').json())
        self.client.force_authenticate(self.owner)
        self.assertEqual(self.client.get('/api/profile/lagosrun/').json()['email'], self.owner.email)

    def test_directory_and_public_pages_carry_no_emails(self):
        self.client.force_authenticate(None)
        self.assertNotIn(self.owner.email, str(self.client.get('/api/communities/').json()))


class HostFilterTests(CommunityBase):

    def test_host_returns_only_that_organisers_events(self):
        from .models import Event, UserProfile
        UserProfile.objects.update_or_create(user=self.owner, defaults={'handle': 'lagos-run'})
        other = self.fan('other-host@example.com')
        Event.objects.create(
            name='Someone else', slug='someone-else', owner=other, day=self.event.day,
            time_from=self.event.time_from, time_to=self.event.time_to, location='Lagos', is_active=True,
        )
        res = self.client.get('/api/events/', {'host': 'LAGOS-RUN'})
        self.assertEqual(res.status_code, 200)
        rows = res.json() if isinstance(res.json(), list) else res.json().get('results', [])
        self.assertEqual({r['slug'] for r in rows}, {self.event.slug})
