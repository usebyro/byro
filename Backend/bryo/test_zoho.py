"""Zoho Campaigns: the client, the role-list sync, and the newsletter endpoints. Zoho is always mocked."""
import time
from unittest.mock import MagicMock, patch

import requests
from django.contrib.auth import get_user_model
from django.core.cache import cache
from datetime import timedelta

from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from .models import Event, NewsletterSignup, UserProfile
from .services import zoho

User = get_user_model()

ZOHO_ON = dict(
    ZOHO_ENABLED=True, ZOHO_CLIENT_ID='cid', ZOHO_CLIENT_SECRET='csecret', ZOHO_REFRESH_TOKEN='rtoken',
    ZOHO_LISTKEY_ORGANISERS='LK-ORG', ZOHO_LISTKEY_ATTENDEES='LK-ATT', ZOHO_LISTKEY_NEWSLETTER='LK-NEWS',
)


def reply(_http=200, **body):
    r = MagicMock()
    r.status_code = _http
    r.json.return_value = body
    return r


TOKEN = reply(access_token='ACCESS-1', expires_in=3600)
OK = reply(status='success', code='0', message='done')


def zoho_api(*campaign_replies):
    """requests.post stand-in: token calls get a token, API calls get the replies in order."""
    queue = list(campaign_replies)

    def post(url, **kwargs):
        if 'oauth/v2/token' in url:
            return TOKEN
        return queue.pop(0) if len(queue) > 1 else queue[0]
    return post


class ZohoBase(TestCase):
    def setUp(self):
        zoho._reset()
        cache.clear()
        p = patch('bryo.services.zoho.time.sleep')  # no real backoff waits
        p.start()
        self.addCleanup(p.stop)


@override_settings(**ZOHO_ON)
class ClientTests(ZohoBase):

    def test_subscribe_sends_the_documented_request(self):
        with patch('bryo.services.zoho.requests.post', side_effect=zoho_api(OK)) as post:
            r = zoho.subscribe(zoho.LIST_NEWSLETTER, '  Ada@Example.COM ', 'Ada', 'Lovelace')
        self.assertTrue(r.ok)
        url = post.call_args.args[0]
        self.assertEqual(url, 'https://campaigns.zoho.com/api/v1.1/json/listsubscribe')
        kw = post.call_args.kwargs
        self.assertEqual(kw['headers'], {'Authorization': 'Zoho-oauthtoken ACCESS-1'})
        self.assertEqual(kw['timeout'], 10)
        self.assertEqual(kw['data']['listkey'], 'LK-NEWS')
        self.assertEqual(kw['data']['resfmt'], 'JSON')
        self.assertEqual(kw['data']['contactinfo'],
                         '{"Contact Email": "ada@example.com", "First Name": "Ada", "Last Name": "Lovelace"}')

    def test_unsubscribe_uses_the_unsubscribe_action(self):
        with patch('bryo.services.zoho.requests.post', side_effect=zoho_api(OK)) as post:
            zoho.unsubscribe(zoho.LIST_NEWSLETTER, 'a@example.com')
        self.assertTrue(post.call_args.args[0].endswith('/listunsubscribe'))

    def test_the_access_token_is_cached_between_calls(self):
        with patch('bryo.services.zoho.requests.post', side_effect=zoho_api(OK)) as post:
            zoho.subscribe(zoho.LIST_NEWSLETTER, 'a@example.com')
            zoho.subscribe(zoho.LIST_NEWSLETTER, 'b@example.com')
        token_calls = [c for c in post.call_args_list if 'oauth/v2/token' in c.args[0]]
        self.assertEqual(len(token_calls), 1)

    def test_the_token_is_renewed_five_minutes_before_it_expires(self):
        with patch('bryo.services.zoho.requests.post', side_effect=zoho_api(OK)) as post:
            zoho.subscribe(zoho.LIST_NEWSLETTER, 'a@example.com')
            zoho._expires_at = time.time() + 200  # inside the five-minute margin
            zoho.subscribe(zoho.LIST_NEWSLETTER, 'b@example.com')
        self.assertEqual(len([c for c in post.call_args_list if 'oauth/v2/token' in c.args[0]]), 2)

    def test_an_error_inside_a_200_body_is_a_failure(self):
        err = reply(status='error', code='2001', message='List not found')
        with patch('bryo.services.zoho.requests.post', side_effect=zoho_api(err)):
            r = zoho.subscribe(zoho.LIST_NEWSLETTER, 'a@example.com')
        self.assertFalse(r.ok)
        self.assertIn('List not found', r.error)

    def test_already_on_the_list_counts_as_success(self):
        dup = reply(status='error', code='2002', message='Contact already exists in the list')
        with patch('bryo.services.zoho.requests.post', side_effect=zoho_api(dup)):
            self.assertTrue(zoho.subscribe(zoho.LIST_NEWSLETTER, 'a@example.com').ok)

    def test_a_5xx_is_retried_then_succeeds(self):
        with patch('bryo.services.zoho.requests.post', side_effect=zoho_api(reply(503), reply(500), OK)) as post:
            r = zoho.subscribe(zoho.LIST_NEWSLETTER, 'a@example.com')
        self.assertTrue(r.ok)
        api_calls = [c for c in post.call_args_list if 'oauth/v2/token' not in c.args[0]]
        self.assertEqual(len(api_calls), 3)

    def test_it_gives_up_after_two_retries_and_never_raises(self):
        with patch('bryo.services.zoho.requests.post', side_effect=zoho_api(reply(500))) as post:
            r = zoho.subscribe(zoho.LIST_NEWSLETTER, 'a@example.com')
        self.assertFalse(r.ok)
        self.assertEqual(len([c for c in post.call_args_list if 'oauth/v2/token' not in c.args[0]]), 3)

    def test_a_network_error_never_raises(self):
        def post(url, **kw):
            if 'oauth/v2/token' in url:
                return TOKEN
            raise requests.ConnectionError('down')
        with patch('bryo.services.zoho.requests.post', side_effect=post):
            r = zoho.subscribe(zoho.LIST_NEWSLETTER, 'a@example.com')
        self.assertFalse(r.ok)

    def test_a_401_clears_the_token_refreshes_once_and_retries(self):
        with patch('bryo.services.zoho.requests.post', side_effect=zoho_api(reply(401), OK)) as post:
            r = zoho.subscribe(zoho.LIST_NEWSLETTER, 'a@example.com')
        self.assertTrue(r.ok)
        self.assertEqual(len([c for c in post.call_args_list if 'oauth/v2/token' in c.args[0]]), 2)

    def test_logs_mask_the_email_and_never_show_secrets(self):
        err = reply(status='error', code='9', message='nope')
        with patch('bryo.services.zoho.requests.post', side_effect=zoho_api(err)):
            with self.assertLogs('bryo.services.zoho', level='ERROR') as logs:
                zoho.subscribe(zoho.LIST_ORGANISERS, 'ada@example.com')
        text = ' '.join(logs.output)
        self.assertIn('a***@example.com', text)
        for secret in ('ada@example.com', 'ACCESS-1', 'rtoken', 'csecret'):
            self.assertNotIn(secret, text)


@override_settings(**ZOHO_ON)
class RoleTests(ZohoBase):

    def person(self, role='', email='ada@example.com'):
        user = User.objects.create_user(email=email)
        UserProfile.objects.update_or_create(user=user, defaults={'role': role, 'display_name': 'Ada Lovelace'})
        return User.objects.get(pk=user.pk)

    def test_role_picks_the_list_and_sends_the_name(self):
        for role, key in (('organizer', 'LK-ORG'), ('attendee', 'LK-ATT')):
            user = self.person(role, email=f'{role}@example.com')
            with patch('bryo.services.zoho.requests.post', side_effect=zoho_api(OK)) as post:
                zoho._reset()
                self.assertTrue(zoho.add_user_by_role(user).ok)
            data = [c for c in post.call_args_list if 'oauth' not in c.args[0]][0].kwargs['data']
            self.assertEqual(data['listkey'], key)
            self.assertIn('"First Name": "Ada"', data['contactinfo'])
            self.assertIn('"Last Name": "Lovelace"', data['contactinfo'])

    def test_no_role_means_nothing_is_sent(self):
        with patch('bryo.services.zoho.requests.post') as post:
            r = zoho.add_user_by_role(self.person(''))
        self.assertFalse(r.ok)
        post.assert_not_called()

    def test_deleted_and_guest_accounts_are_never_synced(self):
        user = self.person('attendee', email='deleted-4@deleted.usebyro.com')
        guest = self.person('attendee', email='guest@example.com')
        guest.auth_provider = 'guest'
        with patch('bryo.services.zoho.requests.post') as post:
            zoho.add_user_by_role(user)
            zoho.add_user_by_role(guest)
        post.assert_not_called()


@override_settings(**ZOHO_ON)
class SignalTests(ZohoBase):
    """Choosing a role at onboarding is what puts someone on a list."""

    def setUp(self):
        super().setUp()
        p = patch('bryo.zoho_signals.zoho.run_in_background', side_effect=lambda fn, *a: fn(*a))
        p.start()
        self.addCleanup(p.stop)

    def calls(self, post):
        return [(c.args[0].rsplit('/', 1)[-1], c.kwargs['data']['listkey'])
                for c in post.call_args_list if 'oauth' not in c.args[0]]

    def test_choosing_a_role_joins_that_list_and_changing_it_moves_them(self):
        user = User.objects.create_user(email='ada@example.com')
        profile, _ = UserProfile.objects.get_or_create(user=user)
        with patch('bryo.services.zoho.requests.post', side_effect=zoho_api(OK)) as post:
            with self.captureOnCommitCallbacks(execute=True):
                profile.role = 'attendee'
                profile.save()
            self.assertEqual(self.calls(post), [('listsubscribe', 'LK-ATT')])
            post.reset_mock()
            with self.captureOnCommitCallbacks(execute=True):
                profile.role = 'organizer'
                profile.save()
            self.assertEqual(self.calls(post), [('listunsubscribe', 'LK-ATT'), ('listsubscribe', 'LK-ORG')])

    def test_saving_something_else_sends_nothing(self):
        user = User.objects.create_user(email='ada@example.com')
        profile, _ = UserProfile.objects.get_or_create(user=user)
        profile.role = 'attendee'
        with self.captureOnCommitCallbacks(execute=True):
            profile.save()
        with patch('bryo.services.zoho.requests.post') as post:
            with self.captureOnCommitCallbacks(execute=True):
                profile.bio = 'hello'
                profile.save()
        post.assert_not_called()

    def test_the_newsletter_switch_syncs_the_newsletter_list(self):
        user = User.objects.create_user(email='ada@example.com')
        profile, _ = UserProfile.objects.get_or_create(user=user)
        with patch('bryo.services.zoho.requests.post', side_effect=zoho_api(OK)) as post:
            with self.captureOnCommitCallbacks(execute=True):
                profile.newsletter_subscribed = True
                profile.save()
            with self.captureOnCommitCallbacks(execute=True):
                profile.newsletter_subscribed = False
                profile.save()
        self.assertEqual(self.calls(post), [('listsubscribe', 'LK-NEWS'), ('listunsubscribe', 'LK-NEWS')])

    def test_onboarding_still_succeeds_when_zoho_is_down(self):
        user = User.objects.create_user(email='ada@example.com')
        client = APIClient()
        client.force_authenticate(user)
        with patch('bryo.services.zoho.requests.post', side_effect=requests.ConnectionError('down')):
            with self.captureOnCommitCallbacks(execute=True):
                r = client.patch('/api/profile/me/', {'role': 'organizer'}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(UserProfile.objects.get(user=user).role, 'organizer')


class DisabledTests(ZohoBase):

    def test_nothing_is_sent_and_one_warning_is_logged(self):
        with patch('bryo.services.zoho.requests.post') as post:
            with self.assertLogs('bryo.services.zoho', level='WARNING') as logs:
                zoho.subscribe(zoho.LIST_NEWSLETTER, 'a@example.com')
                zoho.subscribe(zoho.LIST_NEWSLETTER, 'b@example.com')
        post.assert_not_called()
        self.assertEqual(len([l for l in logs.output if 'disabled' in l]), 1)

    @override_settings(**{**ZOHO_ON, 'ZOHO_LISTKEY_NEWSLETTER': ''})
    def test_a_missing_setting_also_disables_it(self):
        with patch('bryo.services.zoho.requests.post') as post:
            self.assertFalse(zoho.subscribe(zoho.LIST_NEWSLETTER, 'a@example.com').ok)
        post.assert_not_called()

    def test_signals_are_inert_when_disabled(self):
        user = User.objects.create_user(email='ada@example.com')
        profile, _ = UserProfile.objects.get_or_create(user=user)
        with patch('bryo.services.zoho.requests.post') as post:
            with self.captureOnCommitCallbacks(execute=True):
                profile.role = 'organizer'
                profile.save()
        post.assert_not_called()


class NewsletterEndpointTests(ZohoBase):

    def setUp(self):
        super().setUp()
        self.client = APIClient()

    def subscribe(self, **body):
        return self.client.post('/api/newsletter/subscribe/', body, format='json')

    def test_subscribe_sends_a_confirmation_email_and_joins_nobody_yet(self):
        with patch('bryo.mailer.send_email') as sent, patch('bryo.newsletter_views.zoho.subscribe') as sub:
            r = self.subscribe(email='Ada@Example.com', first_name='Ada', last_name='Lovelace')
        self.assertEqual((r.status_code, r.json()), (200, {'success': True, 'message': 'Check your inbox to confirm'}))
        sub.assert_not_called()  # not on the list until they confirm
        kw = sent.call_args.kwargs
        self.assertEqual((kw['to'], kw['subject']), ('ada@example.com', 'Confirm your Byro subscription'))
        signup = NewsletterSignup.objects.get()
        self.assertIn(f'/newsletter/confirm/{signup.token}', kw['html'])
        self.assertIn('expires in 48 hours', kw['text'])
        self.assertNotIn('\u2014', kw['html'] + kw['text'])

    def test_bad_emails_and_long_fields_are_refused_or_trimmed(self):
        for bad in ('', 'nope', 'a@b', 'x' * 250 + '@example.com', None, 12):
            self.assertEqual(self.subscribe(email=bad).status_code, 400, bad)
        with patch('bryo.mailer.send_email'):
            self.subscribe(email='a@example.com', first_name='n' * 500)
        self.assertEqual(len(NewsletterSignup.objects.get().first_name), 100)

    def test_the_honeypot_gets_a_200_and_nothing_happens(self):
        with patch('bryo.mailer.send_email') as sent:
            r = self.subscribe(email='bot@example.com', website='http://spam.example')
        self.assertEqual(r.status_code, 200)
        sent.assert_not_called()
        self.assertFalse(NewsletterSignup.objects.exists())

    def test_if_the_email_cannot_be_sent_it_is_a_502_and_nothing_is_kept(self):
        with patch('bryo.mailer.send_email', side_effect=RuntimeError('mail down')):
            r = self.subscribe(email='a@example.com')
        self.assertEqual(r.status_code, 502)
        self.assertEqual(r.json(), {'success': False, 'error': 'Could not subscribe right now'})
        self.assertFalse(NewsletterSignup.objects.exists())

    def test_one_confirmation_email_per_address_per_minute(self):
        with patch('bryo.mailer.send_email') as sent:
            self.subscribe(email='a@example.com')
            self.subscribe(email='a@example.com')
        self.assertEqual(sent.call_count, 1)

    def token(self, email='ada@example.com'):
        with patch('bryo.mailer.send_email'):
            self.subscribe(email=email, first_name='Ada', last_name='Lovelace')
        return NewsletterSignup.objects.filter(email=email).first().token

    def test_confirming_joins_the_newsletter_list(self):
        token = self.token()
        self.assertEqual(self.client.get(f'/api/newsletter/confirm/{token}/').json(), {'state': 'live', 'email': 'ada@example.com'})
        with patch('bryo.newsletter_views.zoho.subscribe', return_value=zoho.Result(True)) as sub:
            r = self.client.post(f'/api/newsletter/confirm/{token}/')
        self.assertEqual(r.json(), {'state': 'confirmed', 'email': 'ada@example.com'})
        sub.assert_called_once_with('newsletter', 'ada@example.com', 'Ada', 'Lovelace')
        self.assertEqual(self.client.get(f'/api/newsletter/confirm/{token}/').json()['state'], 'confirmed')

    def test_confirming_twice_says_already_subscribed_and_calls_zoho_once(self):
        token = self.token()
        with patch('bryo.newsletter_views.zoho.subscribe', return_value=zoho.Result(True)) as sub:
            self.client.post(f'/api/newsletter/confirm/{token}/')
            again = self.client.post(f'/api/newsletter/confirm/{token}/')
        self.assertEqual(again.json(), {'state': 'already', 'email': 'ada@example.com'})
        self.assertEqual(sub.call_count, 1)

    def test_a_second_link_for_a_confirmed_address_says_already_subscribed(self):
        first = self.token()
        with patch('bryo.newsletter_views.zoho.subscribe', return_value=zoho.Result(True)):
            self.client.post(f'/api/newsletter/confirm/{first}/')
        NewsletterSignup.objects.update(created_at=timezone.now() - timedelta(hours=1))
        second = self.token()
        with patch('bryo.newsletter_views.zoho.subscribe') as sub:
            r = self.client.post(f'/api/newsletter/confirm/{second}/')
        self.assertEqual(r.json()['state'], 'already')
        sub.assert_not_called()

    def test_an_expired_link_is_refused_and_can_ask_for_a_new_one(self):
        token = self.token()
        NewsletterSignup.objects.update(expires_at=timezone.now() - timedelta(minutes=1),
                                        created_at=timezone.now() - timedelta(hours=49))
        with patch('bryo.newsletter_views.zoho.subscribe') as sub:
            r = self.client.post(f'/api/newsletter/confirm/{token}/')
        self.assertEqual((r.status_code, r.json()['state']), (410, 'expired'))
        sub.assert_not_called()
        with patch('bryo.mailer.send_email') as sent:
            r = self.client.post(f'/api/newsletter/resend/{token}/')
        self.assertEqual(r.json(), {'sent': True, 'email': 'ada@example.com'})
        self.assertEqual(sent.call_args.kwargs['to'], 'ada@example.com')
        self.assertEqual(NewsletterSignup.objects.count(), 2)

    def test_if_zoho_fails_at_confirm_the_same_link_still_works_later(self):
        token = self.token()
        with patch('bryo.newsletter_views.zoho.subscribe', return_value=zoho.Result(False, 'down')):
            r = self.client.post(f'/api/newsletter/confirm/{token}/')
        self.assertEqual(r.status_code, 502)
        self.assertEqual(self.client.get(f'/api/newsletter/confirm/{token}/').json()['state'], 'live')
        with patch('bryo.newsletter_views.zoho.subscribe', return_value=zoho.Result(True)):
            self.assertEqual(self.client.post(f'/api/newsletter/confirm/{token}/').json()['state'], 'confirmed')

    def test_unknown_tokens_are_404(self):
        for call in (self.client.get, self.client.post):
            self.assertEqual(call('/api/newsletter/confirm/nope/').status_code, 404)
        self.assertEqual(self.client.post('/api/newsletter/resend/nope/').status_code, 404)

    def test_unsubscribe_always_says_success_for_a_valid_email(self):
        for result in (zoho.Result(True), zoho.Result(False, 'not on the list')):
            with patch('bryo.newsletter_views.zoho.unsubscribe', return_value=result) as unsub:
                r = self.client.post('/api/newsletter/unsubscribe/', {'email': 'a@example.com'}, format='json')
            self.assertEqual((r.status_code, r.json()), (200, {'success': True}))
            unsub.assert_called_once_with('newsletter', 'a@example.com')
        self.assertEqual(self.client.post('/api/newsletter/unsubscribe/', {'email': 'nope'}, format='json').status_code, 400)

    def test_unsubscribe_honeypot_does_nothing(self):
        with patch('bryo.newsletter_views.zoho.unsubscribe') as unsub:
            r = self.client.post('/api/newsletter/unsubscribe/', {'email': 'a@example.com', 'website': 'x'}, format='json')
        self.assertEqual(r.status_code, 200)
        unsub.assert_not_called()

    def test_the_signed_in_user_can_read_and_toggle_their_subscription(self):
        user = User.objects.create_user(email='ada@example.com')
        self.client.force_authenticate(user)
        self.assertEqual(self.client.get('/api/me/newsletter/').json(), {'subscribed': False})
        self.assertEqual(self.client.put('/api/me/newsletter/', {'subscribed': True}, format='json').json(),
                         {'subscribed': True})
        self.assertTrue(UserProfile.objects.get(user=user).newsletter_subscribed)
        self.assertEqual(self.client.put('/api/me/newsletter/', {'subscribed': 'yes'}, format='json').status_code, 400)

    def test_me_newsletter_needs_a_sign_in(self):
        self.assertIn(self.client.get('/api/me/newsletter/').status_code, (401, 403))


@override_settings(SITE_URL='https://usebyro.com', **ZOHO_ON)
class FirstEventTests(ZohoBase):
    """An organiser's first live event tells Zoho its public link; later ones never overwrite it."""

    def setUp(self):
        super().setUp()
        self.owner = User.objects.create_user(email='host@example.com')
        UserProfile.objects.update_or_create(user=self.owner, defaults={'role': 'organizer'})

    def event(self, slug, **kw):
        base = dict(name=slug, slug=slug, owner=self.owner, day=timezone.now().date(),
                    time_from='18:00', time_to='20:00', location='Lagos', is_active=True)
        base.update(kw)
        return Event.objects.create(**base)

    def contacts(self, post):
        import json
        return [json.loads(c.kwargs['data']['contactinfo']) for c in post.call_args_list if 'oauth' not in c.args[0]]

    def test_first_publish_sends_both_fields_with_the_public_url(self):
        e = self.event('abc123')
        with patch('bryo.services.zoho.requests.post', side_effect=zoho_api(OK)) as post:
            self.assertTrue(zoho.sync_first_event(e).ok)
        (info,) = self.contacts(post)
        self.assertEqual(info['Has Published Event'], 'Yes')
        self.assertEqual(info['Event URL'], 'https://usebyro.com/discover/abc123')

    def test_second_publish_sends_nothing(self):
        self.event('first1')
        second = self.event('second2')
        with patch('bryo.services.zoho.requests.post', side_effect=zoho_api(OK)) as post:
            self.assertEqual(zoho.sync_first_event(second).error, 'not first')
        self.assertEqual(self.contacts(post), [])

    def test_drafts_do_not_count_and_do_not_send(self):
        draft = self.event('draft1', is_draft=True)
        with patch('bryo.services.zoho.requests.post', side_effect=zoho_api(OK)) as post:
            self.assertFalse(zoho.sync_first_event(draft).ok)
        self.assertEqual(self.contacts(post), [])
        live = self.event('live1')  # the draft isn't a published event, so this one is the first
        self.assertTrue(zoho.is_first_published_event(live))

    def test_zoho_down_never_raises(self):
        e = self.event('down1')
        with patch('bryo.services.zoho.requests.post', side_effect=requests.ConnectionError()):
            self.assertFalse(zoho.sync_first_event(e).ok)

    def test_backfill_dry_run_prints_the_first_events_url(self):
        from io import StringIO
        from django.core.management import call_command
        self.event('older1')
        self.event('newer2')
        out = StringIO()
        with patch('bryo.services.zoho.requests.post') as post:
            call_command('backfill_zoho', '--dry-run', stdout=out)
        post.assert_not_called()
        self.assertIn('Event URL: https://usebyro.com/discover/older1', out.getvalue())
        self.assertNotIn('newer2', out.getvalue())
