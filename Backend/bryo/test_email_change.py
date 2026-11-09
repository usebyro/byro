"""Staff change the email on an account; the new address confirms; nothing is lost."""
from datetime import timedelta
from unittest.mock import patch

from django.utils import timezone

from .community import record_stamp
from .models import AdminAction, AdminMember, EmailChange, Follow, Stamp, Ticket
from .services.workos_api import WorkOSAPIError
from .test_admin_tools import AdminBase
from .test_checkin import ticket


class ChangeBase(AdminBase):
    def setUp(self):
        super().setUp()
        AdminMember.objects.filter(email='boss@example.com').update(role='owner')
        self.person = self.fan('old@example.com')
        self.person.workos_id = 'user_01OLD'
        self.person.save()
        p = patch('bryo.mailer.send_email')
        self.sent = p.start()
        self.addCleanup(p.stop)
        p = patch('bryo.email_change.workos_api.update_user_email')
        self.workos = p.start()
        self.addCleanup(p.stop)

    def request(self, new='new@example.com', user=None, **extra):
        self.as_(user or self.boss)
        return self.client.post(f'/api/admin/users/{self.person.pk}/email-change/',
                                {'new_email': new, **extra}, format='json')

    def token(self):
        return self.person.email_changes.first().token

    def confirm(self, token=None):
        self.client.force_authenticate(None)
        return self.client.post(f'/api/email-changes/{token or self.token()}/confirm/')


class RequestTests(ChangeBase):

    def test_owner_sends_a_link_to_the_new_address_and_nothing_changes_yet(self):
        r = self.request(reason='Left the company')
        self.assertEqual(r.status_code, 201)
        change = self.person.email_changes.get()
        self.assertEqual((change.old_email, change.new_email, change.state), ('old@example.com', 'new@example.com', 'live'))
        kwargs = self.sent.call_args.kwargs
        self.assertEqual(kwargs['to'], 'new@example.com')
        self.assertIn(f'/confirm-email/{change.token}', kwargs['html'])
        self.assertNotIn('—', kwargs['html'] + kwargs['text'])
        self.person.refresh_from_db()
        self.assertEqual(self.person.email, 'old@example.com')
        self.workos.assert_not_called()
        self.assertTrue(AdminAction.objects.filter(action=AdminAction.ACTION_USER_EMAIL_CHANGE_SENT).exists())

    def test_only_owners_may_ask(self):
        self.assertEqual(self.request(user=self.viewer).status_code, 403)
        AdminMember.objects.filter(email='boss@example.com').update(role='admin')
        self.assertEqual(self.request().status_code, 403)

    def test_refused_for_bad_taken_same_or_unlinked(self):
        self.assertEqual(self.request(new='nope').status_code, 400)
        self.fan('taken@example.com')
        self.assertEqual(self.request(new='TAKEN@example.com').status_code, 400)
        self.assertEqual(self.request(new='old@example.com').status_code, 400)
        self.person.workos_id = None
        self.person.save()
        self.assertEqual(self.request().status_code, 400)

    def test_admin_team_members_are_refused(self):
        self.person.email = 'boss@example.com'
        self.assertIn('admin team', ' '.join(__import__('bryo.email_change', fromlist=['x']).blockers(self.person, 'x@example.com')))

    def test_a_new_request_revokes_the_old_one_and_it_can_be_cancelled(self):
        self.request()
        first = self.token()
        self.request(new='other@example.com')
        self.assertEqual(EmailChange.objects.get(token=first).state, 'revoked')
        r = self.client.delete(f'/api/admin/users/{self.person.pk}/email-change/')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(self.person.email_changes.first().state, 'revoked')


class ConfirmTests(ChangeBase):

    def test_confirming_moves_the_account_and_everything_stored_by_email(self):
        event = self.event
        t1 = ticket(event, email='old@example.com')           # bought as the person
        record_stamp(t1)
        other = ticket(event, email='someone@example.com')    # someone else's: must not move
        Follow.objects.create(follower=self.person, following=self.owner)
        self.request()
        r = self.confirm()
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.json()['changed'])

        self.person.refresh_from_db()
        self.assertEqual(self.person.email, 'new@example.com')
        self.assertTrue(self.person.email_verified)
        self.workos.assert_called_once_with('user_01OLD', 'new@example.com')
        t1.refresh_from_db()
        other.refresh_from_db()
        self.assertEqual(t1.current_owner_email, 'new@example.com')
        self.assertEqual(t1.original_owner_email, 'new@example.com')
        self.assertEqual(other.current_owner_email, 'someone@example.com')
        self.assertEqual(Stamp.objects.get().email, 'new@example.com')
        self.assertTrue(Follow.objects.filter(follower=self.person).exists())  # same account row
        self.assertEqual(self.person.email_changes.first().state, 'confirmed')
        self.assertTrue(AdminAction.objects.filter(action=AdminAction.ACTION_USER_EMAIL_CHANGED).exists())
        # The old address hears about it.
        self.assertEqual(self.sent.call_args.kwargs['to'], 'old@example.com')

    def test_a_link_works_once(self):
        self.request()
        token = self.token()
        self.assertEqual(self.confirm(token).status_code, 200)
        self.assertEqual(self.confirm(token).status_code, 410)

    def test_expired_and_revoked_links_are_refused(self):
        self.request()
        EmailChange.objects.update(expires_at=timezone.now() - timedelta(minutes=1))
        self.assertEqual(self.confirm().status_code, 410)
        self.assertEqual(self.confirm('not-a-token').status_code, 404)

    def test_if_workos_refuses_nothing_changes(self):
        self.request()
        self.workos.side_effect = WorkOSAPIError('boom')
        r = self.confirm()
        self.assertEqual(r.status_code, 502)
        self.person.refresh_from_db()
        self.assertEqual(self.person.email, 'old@example.com')
        self.assertEqual(self.person.email_changes.first().state, 'live')  # can try again

    def test_the_address_is_checked_again_at_confirm_time(self):
        self.request()
        self.fan('new@example.com')  # someone registered it meanwhile
        self.assertEqual(self.confirm().status_code, 409)
        self.person.refresh_from_db()
        self.assertEqual(self.person.email, 'old@example.com')

    def test_the_preview_shows_only_the_new_address(self):
        self.request()
        self.client.force_authenticate(None)
        body = self.client.get(f'/api/email-changes/{self.token()}/').json()
        self.assertEqual(body, {'state': 'live', 'new_email': 'new@example.com'})
