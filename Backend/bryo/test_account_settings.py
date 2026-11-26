"""Settings > Account and Privacy."""
import io
import zipfile
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from django.contrib.auth import get_user_model
from django.core import signing
from django.core.cache import cache
from rest_framework.test import APIClient

from .account_settings import EXPORT_SALT
from .community import record_stamp
from .models import UserProfile
from .test_checkin import ticket
from .test_community import CommunityBase
from .test_refunds import paid_order

User = get_user_model()


class Base(CommunityBase):
    def setUp(self):
        super().setUp()
        cache.clear()
        self.client = APIClient()
        self.client.force_authenticate(self.owner)


class AccountTests(Base):

    def test_get_returns_name_email_and_time_zone(self):
        body = self.client.get('/api/account/').json()
        self.assertEqual(body['email'], 'owner@example.com')
        self.assertEqual(body['timezone'], 'Africa/Lagos')

    def test_the_name_is_saved_as_first_and_last(self):
        res = self.client.patch('/api/account/', {'name': '  Sam   Ajayi Jr '}, format='json')
        self.assertEqual(res.json()['name'], 'Sam Ajayi Jr')
        self.owner.refresh_from_db()
        self.assertEqual((self.owner.first_name, self.owner.last_name), ('Sam', 'Ajayi Jr'))

    def test_a_blank_name_is_refused(self):
        self.assertEqual(self.client.patch('/api/account/', {'name': '  '}, format='json').status_code, 400)

    def test_time_zone_must_be_from_the_list(self):
        self.assertEqual(self.client.patch('/api/account/', {'timezone': 'Mars/Base'}, format='json').status_code, 400)
        res = self.client.patch('/api/account/', {'timezone': 'Africa/Accra'}, format='json')
        self.assertEqual(res.json()['timezone'], 'Africa/Accra')

    def test_the_email_cannot_be_changed_here(self):
        self.client.patch('/api/account/', {'email': 'new@example.com', 'name': 'Sam'}, format='json')
        self.owner.refresh_from_db()
        self.assertEqual(self.owner.email, 'owner@example.com')

    def test_it_needs_a_sign_in(self):
        self.assertEqual(APIClient().get('/api/account/').status_code, 401)


class SessionTests(Base):

    def sessions(self):
        mk = lambda sid, ua: SimpleNamespace(id=sid, status='active', user_agent=ua, created_at='2026-11-20T10:00:00Z')
        return [mk('s_here', 'Mozilla/5.0 (iPhone) Safari'), mk('s_mac', 'Mozilla/5.0 (Macintosh) Chrome/120'),
                mk('s_old', 'Mozilla/5.0 (Linux; Android 13) Chrome/120')]

    def patch_workos(self):
        client = MagicMock()
        client.user_management.list_sessions.return_value = SimpleNamespace(data=self.sessions())
        self.owner.workos_id = 'user_01'
        self.owner.save(update_fields=['workos_id'])
        p = patch('bryo.services.workos_api.client', return_value=client)
        p.start()
        self.addCleanup(p.stop)
        self.client.force_authenticate(self.owner, token={'sid': 's_here'})
        return client

    def test_lists_devices_with_this_one_first(self):
        self.patch_workos()
        rows = self.client.get('/api/account/sessions/').json()['sessions']
        self.assertEqual(rows[0]['id'], 's_here')
        self.assertTrue(rows[0]['current'])
        self.assertEqual(rows[0]['name'], 'iPhone · Safari')
        self.assertEqual({r['name'] for r in rows}, {'iPhone · Safari', 'Mac · Chrome', 'Android · Chrome'})

    def test_signs_one_other_device_out(self):
        client = self.patch_workos()
        self.assertEqual(self.client.delete('/api/account/sessions/s_mac/').status_code, 200)
        client.user_management.revoke_session.assert_called_once_with(session_id='s_mac')

    def test_this_device_and_strangers_sessions_cannot_be_revoked_here(self):
        client = self.patch_workos()
        self.assertEqual(self.client.delete('/api/account/sessions/s_here/').status_code, 400)
        self.assertEqual(self.client.delete('/api/account/sessions/someone_elses/').status_code, 404)
        client.user_management.revoke_session.assert_not_called()

    def test_sign_out_everywhere_else_keeps_this_device(self):
        client = self.patch_workos()
        self.assertEqual(self.client.post('/api/account/sessions/sign-out-others/').status_code, 200)
        revoked = {c.kwargs['session_id'] for c in client.user_management.revoke_session.call_args_list}
        self.assertEqual(revoked, {'s_mac', 's_old'})

    def test_a_workos_failure_is_a_plain_error(self):
        client = self.patch_workos()
        client.user_management.list_sessions.side_effect = RuntimeError('down')
        self.assertEqual(self.client.get('/api/account/sessions/').status_code, 502)


class DeleteTests(Base):

    def test_needs_the_email_typed_exactly(self):
        res = self.client.post('/api/account/delete/', {'confirm_email': 'wrong@example.com'}, format='json')
        self.assertEqual(res.status_code, 400)
        self.owner.refresh_from_db()
        self.assertTrue(self.owner.is_active)

    def test_upcoming_events_with_sales_block_it_in_plain_words(self):
        paid_order(self.event, subtotal='5000.00', fee='250.00', seats=1)
        listed = self.client.get('/api/account/delete/').json()['blockers']
        self.assertTrue(any(b.startswith('You have upcoming events') for b in listed))
        res = self.client.post('/api/account/delete/', {'confirm_email': 'owner@example.com'}, format='json')
        self.assertEqual(res.status_code, 400)
        self.owner.refresh_from_db()
        self.assertTrue(self.owner.is_active)

    def test_a_clear_account_is_deleted(self):
        quiet = User.objects.create_user(email='quiet@example.com')
        client = APIClient()
        client.force_authenticate(quiet)
        res = client.post('/api/account/delete/', {'confirm_email': 'QUIET@example.com'}, format='json')
        self.assertEqual(res.status_code, 200, res.content)
        quiet.refresh_from_db()
        self.assertFalse(quiet.is_active)
        self.assertNotEqual(quiet.email, 'quiet@example.com')


class PrivacyTests(Base):

    def test_defaults_and_saving(self):
        self.assertEqual(self.client.get('/api/account/privacy/').json(), {'listed': True, 'show_passport': True})
        res = self.client.patch('/api/account/privacy/', {'listed': False}, format='json')
        self.assertEqual(res.json(), {'listed': False, 'show_passport': True})

    def test_choices_must_be_on_or_off(self):
        self.assertEqual(self.client.patch('/api/account/privacy/', {'listed': 'maybe'}, format='json').status_code, 400)
        self.assertEqual(self.client.patch('/api/account/privacy/', {}, format='json').status_code, 400)

    def test_turning_the_listing_off_removes_the_community_from_the_directory(self):
        self.event.is_active = True
        self.event.save()
        anon = APIClient()
        self.assertIn('Lagos Run Club', str(anon.get('/api/communities/').json()))
        self.client.patch('/api/account/privacy/', {'listed': False}, format='json')
        self.assertNotIn('Lagos Run Club', str(anon.get('/api/communities/').json()))

    def test_the_listing_switch_never_undoes_an_admin_hiding_the_community(self):
        UserProfile.objects.filter(user=self.owner).update(hidden_from_directory=True)
        self.client.patch('/api/account/privacy/', {'listed': True}, format='json')
        self.assertNotIn('Lagos Run Club', str(APIClient().get('/api/communities/').json()))

    def test_a_hidden_passport_shows_nobody_else_but_still_the_owner(self):
        fan = self.fan('fan@example.com')
        UserProfile.objects.filter(user=fan).update(handle='fan1', is_public=True)
        record_stamp(ticket(self.event, email=fan.email))
        public = APIClient()
        self.assertEqual(public.get('/api/profile/fan1/').json()['stamps_count'], 1)
        UserProfile.objects.filter(user=fan).update(show_passport=False)
        self.assertEqual(public.get('/api/profile/fan1/').json()['stamps_count'], 0)
        mine = APIClient()
        mine.force_authenticate(fan)
        self.assertEqual(mine.get('/api/profile/fan1/').json()['stamps_count'], 1)


class DataExportTests(Base):

    def request_link(self):
        with patch('bryo.mailer.send_email') as send:
            res = self.client.post('/api/account/data-export/')
        return res, send

    def test_requesting_emails_a_link_to_the_owner_only(self):
        res, send = self.request_link()
        self.assertEqual(res.status_code, 200)
        to, subject, html = send.call_args.args[:3]
        self.assertEqual(to, 'owner@example.com')
        self.assertIn('/dashboard/settings/privacy?export=', html)

    def test_only_one_request_an_hour(self):
        self.request_link()
        res, send = self.request_link()
        self.assertEqual(res.status_code, 429)
        send.assert_not_called()

    def token(self, user=None):
        return signing.dumps({'u': (user or self.owner).pk}, salt=EXPORT_SALT)

    def test_the_download_is_a_zip_of_three_csv_files(self):
        paid_order(self.event, subtotal='5000.00', fee='250.00', seats=1)
        res = self.client.get('/api/account/data-export/download/', {'t': self.token()})
        self.assertEqual(res.status_code, 200)
        z = zipfile.ZipFile(io.BytesIO(res.content))
        self.assertEqual(sorted(z.namelist()), ['events.csv', 'guest-list.csv', 'sales.csv'])
        self.assertIn(self.event.name, z.read('events.csv').decode())
        self.assertIn('attendee1@example.com', z.read('guest-list.csv').decode())
        sales = z.read('sales.csv').decode()
        self.assertIn('Ticket total', sales)
        self.assertIn('5000', sales)         # one ticket at the price the organiser set
        self.assertNotIn('5250', sales)      # never the buyer's charge, which includes Byro's fee

    def test_someone_elses_link_does_not_work_for_you(self):
        other = self.fan('other@example.com')
        res = self.client.get('/api/account/data-export/download/', {'t': self.token(other)})
        self.assertEqual(res.status_code, 403)

    def test_a_forged_or_signed_out_request_gets_nothing(self):
        self.assertEqual(self.client.get('/api/account/data-export/download/', {'t': 'junk'}).status_code, 400)
        self.assertEqual(APIClient().get('/api/account/data-export/download/', {'t': self.token()}).status_code, 401)

    def test_values_that_look_like_formulas_stay_text(self):
        from .account_settings import _csv
        self.assertIn("'=HYPERLINK", _csv([('=HYPERLINK("x")',)], ['a']))
