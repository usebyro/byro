"""Handing a pitched draft event to its organiser through a claim link."""
from datetime import timedelta
from unittest.mock import patch

from django.utils import timezone

from .models import AdminAction, Event, EventClaim, EventCoHost, Ticket
from .test_admin_tools import AdminBase


class ClaimBase(AdminBase):
    def setUp(self):
        super().setUp()
        # The event is built by staff: owned by the boss, still a draft.
        self.event.owner = self.boss
        self.event.is_draft = True
        self.event.save()
        p = patch('bryo.mailer.send_email')
        self.sent = p.start()
        self.addCleanup(p.stop)

    def send(self, user=None, email='jane@company.com'):
        self.as_(user or self.boss)
        return self.client.post(f'/api/admin/events/{self.event.pk}/claim/', {'email': email}, format='json')

    def token(self):
        return self.event.claims.first().token


class SendingTests(ClaimBase):

    def test_admin_sends_a_link_and_the_organiser_is_emailed(self):
        r = self.send()
        self.assertEqual(r.status_code, 201)
        self.assertTrue(r.json()['email_sent'])
        claim = self.event.claims.get()
        self.assertEqual((claim.email, claim.state), ('jane@company.com', 'live'))
        kwargs = self.sent.call_args.kwargs
        self.assertEqual(kwargs['to'], 'jane@company.com')
        self.assertIn(f'/claim/{claim.token}'.replace('/', '%2F'), kwargs['html'])
        self.assertIn('email=jane%40company.com', kwargs['html'])
        self.assertIn('Set up your profile', kwargs['html'])
        self.assertRegex(kwargs['text'], r'works until \d{1,2} [A-Z][a-z]+ and can be used once')
        self.assertNotIn('\u2014', kwargs['html'] + kwargs['text'])
        self.assertTrue(AdminAction.objects.filter(action=AdminAction.ACTION_EVENT_CLAIM_SENT).exists())

    def test_nothing_changes_on_the_event_until_it_is_claimed(self):
        self.send()
        self.event.refresh_from_db()
        self.assertEqual(self.event.owner, self.boss)
        self.assertTrue(self.event.is_draft)

    def test_sending_again_revokes_the_earlier_link(self):
        self.send()
        first = self.token()
        self.send(email='jane@other.com')
        self.assertEqual(EventClaim.objects.get(token=first).state, 'revoked')
        self.assertEqual(self.event.claims.filter(revoked_at__isnull=True).count(), 1)

    def test_only_draft_events_without_tickets_can_be_sent(self):
        self.event.is_draft = False
        self.event.save()
        self.assertEqual(self.send().status_code, 400)
        self.event.is_draft = True
        self.event.save()
        self.assertEqual(self.send().status_code, 201)

    def test_bad_email_is_refused(self):
        self.assertEqual(self.send(email='nope').status_code, 400)

    def test_viewers_and_organisers_cannot_send(self):
        self.assertEqual(self.send(user=self.viewer).status_code, 403)
        self.assertEqual(self.send(user=self.owner).status_code, 403)

    def test_an_admin_cannot_send_someone_elses_event(self):
        self.event.owner = self.owner
        self.event.save()
        self.assertEqual(self.send().status_code, 403)

    def test_revoking_kills_the_link(self):
        self.send()
        self.as_(self.boss)
        r = self.client.delete(f'/api/admin/events/{self.event.pk}/claim/')
        self.assertEqual(r.status_code, 200)
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get(f'/api/event-claims/{self.token()}/').status_code, 410)

    def test_admin_sees_the_state_of_the_latest_link(self):
        self.as_(self.boss)
        self.assertIsNone(self.client.get(f'/api/admin/events/{self.event.pk}/claim/').json()['claim'])
        self.send()
        claim = self.client.get(f'/api/admin/events/{self.event.pk}/claim/').json()['claim']
        self.assertEqual((claim['email'], claim['state']), ('jane@company.com', 'live'))


class ClaimingTests(ClaimBase):

    def setUp(self):
        super().setUp()
        self.send()
        self.token_ = self.token()
        self.jane = self.fan('jane@company.com')
        self.client.force_authenticate(None)

    def claim(self, user, token=None):
        self.client.force_authenticate(user)
        return self.client.post(f'/api/event-claims/{token or self.token_}/claim/')

    def test_preview_needs_no_sign_in_and_shows_the_event(self):
        r = self.client.get(f'/api/event-claims/{self.token_}/')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()['event']['name'], self.event.name)
        self.assertNotIn('jane@company.com', r.content.decode())

    def test_unknown_link_is_a_404(self):
        self.assertEqual(self.client.get('/api/event-claims/nope/').status_code, 404)

    def test_claiming_makes_them_the_owner_and_removes_staff_access(self):
        EventCoHost.objects.create(event=self.event, user=self.boss, invited_email=self.boss.email,
                                   added_by=self.boss, status=EventCoHost.STATUS_ACCEPTED)
        r = self.claim(self.jane)
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()['slug'], self.event.slug)
        self.event.refresh_from_db()
        self.assertEqual(self.event.owner, self.jane)
        self.assertTrue(self.event.is_draft)
        self.assertFalse(self.event.cohosts.exists())
        claim = self.event.claims.get()
        self.assertEqual((claim.state, claim.claimed_by), ('claimed', self.jane))
        self.assertTrue(AdminAction.objects.filter(action=AdminAction.ACTION_EVENT_CLAIMED).exists())

    def test_staff_no_longer_has_owner_access_afterwards(self):
        self.claim(self.jane)
        self.event.refresh_from_db()
        self.assertFalse(self.event.is_owner_or_cohost(self.boss))
        self.assertTrue(self.event.is_owner_or_cohost(self.jane))

    def test_a_different_email_can_claim_because_the_link_is_the_credential(self):
        other = self.fan('jane.personal@gmail.com')
        self.assertEqual(self.claim(other).status_code, 200)
        self.event.refresh_from_db()
        self.assertEqual(self.event.owner, other)

    def test_a_link_works_once(self):
        self.claim(self.jane)
        r = self.claim(self.fan('late@example.com'))
        self.assertEqual(r.status_code, 410)
        self.event.refresh_from_db()
        self.assertEqual(self.event.owner, self.jane)
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get(f'/api/event-claims/{self.token_}/').status_code, 410)

    def test_expired_link_cannot_be_used(self):
        EventClaim.objects.update(expires_at=timezone.now() - timedelta(minutes=1))
        self.assertEqual(self.claim(self.jane).status_code, 410)
        self.event.refresh_from_db()
        self.assertEqual(self.event.owner, self.boss)

    def test_claiming_needs_sign_in(self):
        self.client.force_authenticate(None)
        r = self.client.post(f'/api/event-claims/{self.token_}/claim/')
        self.assertIn(r.status_code, (401, 403))

    def test_the_sender_cannot_claim_their_own_event(self):
        self.assertEqual(self.claim(self.boss).status_code, 400)

    def test_an_event_that_sold_tickets_meanwhile_cannot_be_claimed(self):
        from .models import TicketTier
        tier = TicketTier.objects.create(event=self.event, name='GA', price=0, capacity=10)
        Ticket.objects.create(event=self.event, tier=tier, current_owner_email='x@example.com',
                              original_owner_email='x@example.com', payment_status='free')
        self.assertEqual(self.claim(self.jane).status_code, 409)

    def test_the_sender_is_told_when_it_is_claimed(self):
        self.claim(self.jane)
        self.assertTrue(self.boss.notifications.filter(kind='event_claimed').exists())


class PublishNeedsProfileTests(ClaimBase):
    """An event handed over can't go live until its new owner has a name and username."""

    def setUp(self):
        super().setUp()
        from .models import UserProfile
        self.UserProfile = UserProfile
        self.send()
        self.jane = self.fan('jane@company.com')
        self.client.force_authenticate(self.jane)
        self.client.post(f'/api/event-claims/{self.token()}/claim/')

    def publish(self):
        self.client.force_authenticate(self.jane)
        return self.client.patch(f'/api/events/{self.event.slug}/', {'is_draft': False}, format='json')

    def test_claim_says_whether_the_profile_is_ready(self):
        from .models import Event
        e2 = Event.objects.create(name='Second', owner=self.boss, is_draft=True, day=self.event.day,
                                  time_from=self.event.time_from, time_to=self.event.time_to, location='Lagos')
        self.as_(self.boss)
        self.client.post(f'/api/admin/events/{e2.pk}/claim/', {'email': 'x@y.com'}, format='json')
        self.client.force_authenticate(self.jane)
        r = self.client.post(f'/api/event-claims/{e2.claims.first().token}/claim/')
        self.assertEqual(r.json()['profile_complete'], False)

    def test_publishing_is_refused_until_the_profile_is_set_up(self):
        r = self.publish()
        self.assertEqual((r.status_code, r.json().get('code')), (400, 'profile_incomplete'))
        self.event.refresh_from_db()
        self.assertTrue(self.event.is_draft)

    def test_half_finished_profile_is_not_enough(self):
        self.UserProfile.objects.update_or_create(user=self.jane, defaults={'is_complete': True, 'display_name': 'Jane'})
        self.assertEqual(self.publish().status_code, 400)

    def test_publishing_works_once_the_profile_is_ready(self):
        self.UserProfile.objects.update_or_create(
            user=self.jane, defaults={'is_complete': True, 'display_name': 'Jane', 'handle': 'jane'})
        r = self.publish()
        self.assertEqual(r.status_code, 200, r.content)
        self.event.refresh_from_db()
        self.assertFalse(self.event.is_draft)

    def test_editing_a_draft_is_still_allowed(self):
        self.client.force_authenticate(self.jane)
        r = self.client.patch(f'/api/events/{self.event.slug}/', {'description': 'New words'}, format='json')
        self.assertEqual(r.status_code, 200)


class LinkHostTests(ClaimBase):
    def test_link_host_falls_back_to_localhost_in_debug_and_the_live_site_otherwise(self):
        from django.test import override_settings
        from .claims import _frontend_url
        with override_settings(FRONTEND_URL=None, DEBUG=True):
            self.assertEqual(_frontend_url(), 'http://localhost:3000')
        with override_settings(FRONTEND_URL=None, DEBUG=False):
            self.assertEqual(_frontend_url(), 'https://usebyro.com')
        with override_settings(FRONTEND_URL='https://staging.example.com/', DEBUG=True):
            self.assertEqual(_frontend_url(), 'https://staging.example.com')
