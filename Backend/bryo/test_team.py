"""Settings > Team: invites, roles and removal across all of an organiser's events."""
import datetime
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient

from .auth_views import claim_pending_cohost_invites
from .models import Event, EventCoHost, Notification, TeamMember
from .test_payments import PaymentTestBase, make_event

User = get_user_model()


class TeamBase(PaymentTestBase):
    def setUp(self):
        super().setUp()
        self.client = APIClient()
        self.client.force_authenticate(self.owner)
        today = timezone.localdate()
        self.soon = self.event  # a week away
        self.later = make_event(self.owner, name='Later')
        self.later.day = today + datetime.timedelta(days=30)
        self.later.save()
        self.past = make_event(self.owner, name='Past')
        self.past.day = today - datetime.timedelta(days=5)
        self.past.save()
        self.cancelled = make_event(self.owner, name='Cancelled')
        self.cancelled.cancelled_at = timezone.now()
        self.cancelled.save()
        self.mail = patch('bryo.mailer.send_email').start()

    def invite(self, email='new@example.com', role='manager', client=None):
        return (client or self.client).post('/api/team/', {'email': email, 'role': role}, format='json')


class InviteTests(TeamBase):

    def test_inviting_someone_new_makes_a_pending_grant_on_every_upcoming_event_and_sends_one_email(self):
        res = self.invite('new@example.com', 'manager')
        self.assertEqual(res.status_code, 201, res.content)
        member = TeamMember.objects.get()
        self.assertEqual((member.status, member.role), ('pending', 'manager'))
        events = set(EventCoHost.objects.filter(invited_email='new@example.com').values_list('event__name', flat=True))
        self.assertEqual(events, {'Test Event', 'Later'})  # not the past or cancelled ones
        self.assertEqual(self.mail.call_count, 1)
        self.assertEqual(self.mail.call_args.args[0], 'new@example.com')

    def test_someone_with_an_account_is_on_the_team_straight_away_with_real_access(self):
        helper = User.objects.create_user(email='helper@example.com')
        self.invite('Helper@Example.com', 'checkin')
        self.assertEqual(TeamMember.objects.get().status, 'accepted')
        role = self.soon.get_user_role(helper)
        self.assertTrue(role['is_cohost'])
        self.assertTrue(role['can_check_in'])
        self.assertFalse(role['can_edit'])

    def test_a_co_host_can_edit_and_door_staff_cannot(self):
        a, b = User.objects.create_user(email='a@example.com'), User.objects.create_user(email='b@example.com')
        self.invite('a@example.com', 'manager')
        self.invite('b@example.com', 'checkin')
        self.assertTrue(self.later.get_user_role(a)['can_edit'])
        self.assertFalse(self.later.get_user_role(b)['can_edit'])

    def test_bad_requests_are_refused(self):
        self.assertEqual(self.invite('nope').status_code, 400)
        self.assertEqual(self.invite('x@example.com', 'boss').status_code, 400)
        self.assertEqual(self.invite('OWNER@example.com').status_code, 400)  # yourself
        self.invite('dup@example.com')
        self.assertEqual(self.invite('dup@example.com').status_code, 400)
        self.assertEqual(TeamMember.objects.count(), 1)

    def test_an_email_failure_still_leaves_them_on_the_team(self):
        self.mail.side_effect = RuntimeError('down')
        self.assertEqual(self.invite().status_code, 201)
        self.assertEqual(TeamMember.objects.count(), 1)

    def test_a_new_event_gets_the_whole_team(self):
        self.invite('new@example.com')
        fresh = make_event(self.owner, name='Brand new')
        self.assertTrue(EventCoHost.objects.filter(event=fresh, invited_email='new@example.com').exists())

    def test_someone_elses_events_are_untouched(self):
        other = User.objects.create_user(email='other-owner@example.com')
        theirs = make_event(other, name='Theirs')
        self.invite('new@example.com')
        self.assertFalse(EventCoHost.objects.filter(event=theirs).exists())


class ManageTests(TeamBase):

    def setUp(self):
        super().setUp()
        self.helper = User.objects.create_user(email='helper@example.com')
        self.invite('helper@example.com', 'manager')
        self.member = TeamMember.objects.get()

    def test_changing_the_role_changes_it_on_every_event(self):
        res = self.client.patch(f'/api/team/{self.member.pk}/', {'role': 'checkin'}, format='json')
        self.assertEqual(res.status_code, 200)
        roles = set(EventCoHost.objects.filter(user=self.helper).values_list('role', flat=True))
        self.assertEqual(roles, {'checkin'})
        self.assertFalse(self.soon.get_user_role(self.helper)['can_edit'])

    def test_removing_takes_the_access_away_everywhere(self):
        res = self.client.delete(f'/api/team/{self.member.pk}/')
        self.assertEqual(res.status_code, 200)
        self.assertFalse(EventCoHost.objects.filter(user=self.helper).exists())
        self.assertFalse(TeamMember.objects.exists())
        self.assertFalse(self.soon.get_user_role(self.helper)['is_cohost'])

    def test_only_the_organiser_can_manage_their_team(self):
        stranger = APIClient()
        stranger.force_authenticate(User.objects.create_user(email='stranger@example.com'))
        self.assertEqual(stranger.patch(f'/api/team/{self.member.pk}/', {'role': 'checkin'}, format='json').status_code, 404)
        self.assertEqual(stranger.delete(f'/api/team/{self.member.pk}/').status_code, 404)
        self.assertEqual(stranger.get('/api/team/').json()['members'], [])
        # a co-host does not get the owner's team either
        cohost = APIClient()
        cohost.force_authenticate(self.helper)
        self.assertEqual(cohost.get('/api/team/').json()['members'], [])

    def test_the_list_names_the_owner_and_each_role(self):
        body = self.client.get('/api/team/').json()
        self.assertEqual(body['owner']['email'], 'owner@example.com')
        self.assertEqual([m['email'] for m in body['members']], ['helper@example.com'])
        self.assertEqual([r['label'] for r in body['roles']], ['Owner', 'Co-host', 'Door staff'])

    def test_it_needs_a_sign_in(self):
        self.assertEqual(APIClient().get('/api/team/').status_code, 401)


class SignUpTests(TeamBase):

    def test_signing_up_with_the_invited_email_takes_the_place_and_tells_the_organiser_once(self):
        self.invite('newbie@example.com', 'manager')
        newbie = User.objects.create_user(email='newbie@example.com', email_verified=True)
        claim_pending_cohost_invites(newbie)
        member = TeamMember.objects.get()
        self.assertEqual((member.status, member.user_id), ('accepted', newbie.pk))
        self.assertEqual(EventCoHost.objects.filter(user=newbie, status='accepted').count(), 2)
        self.assertTrue(self.soon.get_user_role(newbie)['is_cohost'])
        notes = Notification.objects.filter(recipient=self.owner, kind='cohost_joined')
        self.assertEqual(notes.count(), 1)

    def test_an_unverified_email_takes_nothing(self):
        self.invite('newbie@example.com')
        newbie = User.objects.create_user(email='newbie@example.com', email_verified=False)
        claim_pending_cohost_invites(newbie)
        self.assertEqual(TeamMember.objects.get().status, 'pending')
