"""Admin tools: oversight of organiser messages, and blocking an organiser from messaging."""
from datetime import timedelta
from unittest.mock import patch

from django.core.cache import cache
from django.utils import timezone

from .messaging import send_due
from .models import AdminAction, AdminMember, Follow, Message, UserProfile
from .test_community import CommunityBase


class AdminBase(CommunityBase):
    def setUp(self):
        super().setUp()
        cache.clear()
        self.boss = self.fan('boss@example.com')
        AdminMember.objects.create(email='boss@example.com', role='admin')
        self.viewer = self.fan('viewer@example.com')
        AdminMember.objects.create(email='viewer@example.com', role='viewer')
        p = patch('bryo.messaging.send_email')
        self.mail = p.start()
        self.addCleanup(p.stop)
        p = patch('bryo.messaging.deliver_in_background', side_effect=lambda m, r: __import__('bryo.messaging', fromlist=['x']).deliver(m, r))
        p.start()
        self.addCleanup(p.stop)

    def as_(self, user):
        self.client.force_authenticate(user)


class AdminMessagesTests(AdminBase):

    def setUp(self):
        super().setUp()
        Follow.objects.create(follower=self.fan('a@example.com'), following=self.owner)

    def organiser_sends(self, **kw):
        self.as_(self.owner)
        body = dict(kind='announce', audience='followers', subject='Run club news', body='See you Saturday.')
        body.update(kw)
        return self.client.post('/api/dashboard/messages/', body, format='json')

    def test_admins_see_every_message_with_its_body_and_sender(self):
        self.organiser_sends()
        self.as_(self.viewer)
        rows = self.client.get('/api/admin/messages/').json()
        self.assertEqual(len(rows), 1)
        r = rows[0]
        self.assertEqual((r['subject'], r['body'], r['status']), ('Run club news', 'See you Saturday.', 'sent'))
        self.assertEqual(r['organizer']['email'], self.owner.email)
        self.assertEqual(r['organizer']['handle'], 'lagosrun')
        self.assertEqual(len(self.client.get('/api/admin/messages/?search=lagosrun').json()), 1)
        self.assertEqual(len(self.client.get('/api/admin/messages/?search=nothing-like-this').json()), 0)
        self.assertEqual(len(self.client.get('/api/admin/messages/?status=scheduled').json()), 0)

    def test_non_admins_cannot_see_messages(self):
        self.as_(self.fan('rando@example.com'))
        self.assertEqual(self.client.get('/api/admin/messages/').status_code, 403)

    def test_an_admin_can_cancel_a_scheduled_message_and_it_is_logged(self):
        mid = self.organiser_sends(scheduled_for=(timezone.now() + timedelta(hours=1)).isoformat()).json()['id']
        self.as_(self.viewer)
        self.assertEqual(self.client.post(f'/api/admin/messages/{mid}/cancel/').status_code, 403)  # viewers read only
        self.as_(self.boss)
        res = self.client.post(f'/api/admin/messages/{mid}/cancel/')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()['status'], 'cancelled')
        self.assertEqual(send_due(now=timezone.now() + timedelta(hours=2)), 0)
        self.mail.assert_not_called()
        log = AdminAction.objects.get(action=AdminAction.ACTION_MESSAGE_CANCELLED)
        self.assertEqual(log.actor_email, 'boss@example.com')
        # Already cancelled
        self.assertEqual(self.client.post(f'/api/admin/messages/{mid}/cancel/').status_code, 400)


class MessagingBlockTests(AdminBase):

    def setUp(self):
        super().setUp()
        Follow.objects.create(follower=self.fan('a@example.com'), following=self.owner)

    def block(self, blocked=True, user=None):
        self.as_(user or self.boss)
        return self.client.post(f'/api/admin/users/{self.owner.pk}/messaging/', {'blocked': blocked}, format='json')

    def test_blocked_organisers_cannot_send_and_are_told_why(self):
        self.assertEqual(self.block().status_code, 200)
        self.as_(self.owner)
        res = self.client.post('/api/dashboard/messages/',
                               dict(kind='announce', audience='followers', subject='Hi', body='Hi.'), format='json')
        self.assertEqual(res.status_code, 403)
        self.assertIn('support', res.json()['error'])
        self.assertTrue(self.client.get('/api/dashboard/messages/').json()['blocked'])
        self.mail.assert_not_called()

    def test_blocking_cancels_what_they_scheduled(self):
        self.as_(self.owner)
        self.client.post('/api/dashboard/messages/', dict(
            kind='announce', audience='followers', subject='Later', body='Later.',
            scheduled_for=(timezone.now() + timedelta(hours=1)).isoformat()), format='json')
        self.assertEqual(self.block().json()['scheduled_cancelled'], 1)
        self.assertEqual(Message.objects.get().status, 'cancelled')
        self.assertTrue(AdminAction.objects.filter(action=AdminAction.ACTION_MESSAGING_BLOCKED).exists())

    def test_a_block_made_after_scheduling_still_stops_the_send(self):
        self.as_(self.owner)
        self.client.post('/api/dashboard/messages/', dict(
            kind='announce', audience='followers', subject='Later', body='Later.',
            scheduled_for=(timezone.now() + timedelta(hours=1)).isoformat()), format='json')
        # Blocked directly (not through the admin view), so the scheduled row is still waiting.
        UserProfile.objects.filter(user=self.owner).update(messaging_blocked=True)
        self.assertEqual(send_due(now=timezone.now() + timedelta(hours=2)), 0)
        self.assertEqual(Message.objects.get().status, 'cancelled')
        self.mail.assert_not_called()

    def test_unblocking_lets_them_send_again(self):
        self.block()
        self.block(False)
        self.as_(self.owner)
        res = self.client.post('/api/dashboard/messages/',
                               dict(kind='announce', audience='followers', subject='Hi', body='Hi.'), format='json')
        self.assertEqual(res.status_code, 201)
        self.assertTrue(AdminAction.objects.filter(action=AdminAction.ACTION_MESSAGING_UNBLOCKED).exists())

    def test_only_admins_and_owners_can_block(self):
        self.assertEqual(self.block(user=self.viewer).status_code, 403)
        self.assertEqual(self.block(user=self.fan('rando@example.com')).status_code, 403)
        self.assertFalse(UserProfile.objects.get(user=self.owner).messaging_blocked)
