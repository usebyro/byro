"""
Tests for WorkOS authentication, account migration and co-host invitations.

These run entirely offline. A throwaway RSA keypair signs tokens that look
exactly like WorkOS access tokens, and the JWKS lookup is patched to return the
matching public key — so the real verification path (signature, issuer, expiry,
required claims) is exercised without any network access.
"""

import datetime
from types import SimpleNamespace
from unittest.mock import patch

import jwt
from cryptography.hazmat.primitives.asymmetric import rsa
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework.throttling import ScopedRateThrottle

from .models import Event, EventCoHost, UserProfile
from .services import workos_auth
from .services.workos_api import WorkOSAPIError

User = get_user_model()

CLIENT_ID = 'client_test123'
BASE_URL = 'https://api.workos.com'
ISSUER = f'{BASE_URL}/user_management/{CLIENT_ID}'

_private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)

# Every WorkOS setting is overridden explicitly so the suite is hermetic: a real
# Backend/.env must never change the result of a test run.
WORKOS_TEST_SETTINGS = dict(
    WORKOS_CLIENT_ID=CLIENT_ID,
    WORKOS_API_BASE_URL=BASE_URL,
    WORKOS_API_KEY='sk_test',
    WORKOS_ISSUER=ISSUER,
)


def make_event(name, owner, **kw):
    """Event has several non-null columns; keep the required set in one place."""
    return Event.objects.create(
        name=name,
        owner=owner,
        day=timezone.now().date() + datetime.timedelta(days=7),
        time_from=datetime.time(18, 0),
        time_to=datetime.time(21, 0),
        location='Lagos',
        **kw,
    )


def make_token(sub='user_01TEST', issuer=ISSUER, expires_in=300, key=None, **extra):
    """Mint a token shaped like a WorkOS access token."""
    now = datetime.datetime.now(datetime.timezone.utc)
    payload = {
        'iss': issuer,
        'sub': sub,
        'sid': 'session_01TEST',
        'jti': '01TESTJTI',
        'iat': now,
        'exp': now + datetime.timedelta(seconds=expires_in),
        **extra,
    }
    return jwt.encode(payload, key or _private_key, algorithm='RS256')


def fake_workos_user(sub='user_01TEST', email='new@example.com', verified=True,
                     first_name='Ada', last_name='Lovelace'):
    """Stands in for the SDK's User model (attribute access, not a dict)."""
    return SimpleNamespace(
        id=sub, email=email, email_verified=verified,
        first_name=first_name, last_name=last_name,
    )


def fake_auth_response(sub='user_01TEST', email='new@example.com', verified=True,
                       first_name='Ada', last_name='Lovelace'):
    """Stands in for the SDK's AuthenticateResponse."""
    return SimpleNamespace(
        user=fake_workos_user(sub, email, verified, first_name, last_name),
        access_token=make_token(sub=sub),
        refresh_token='refresh_tok_01TEST',
    )


class WorkOSAuthTestCase(TestCase):
    """Base: patches JWKS resolution to hand back our local public key."""

    def setUp(self):
        super().setUp()
        cache.clear()
        workos_auth.reset_jwks_client()

        self.set_throttle_rates({k: None for k in ScopedRateThrottle.THROTTLE_RATES})

        class _FakeSigningKey:
            key = _private_key.public_key()

        patcher = patch.object(
            workos_auth, '_get_jwks_client',
            return_value=type('C', (), {
                'get_signing_key_from_jwt': staticmethod(lambda token: _FakeSigningKey())
            })(),
        )
        self.addCleanup(patcher.stop)
        patcher.start()

        self.client = APIClient()

    def auth(self, token):
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')

    def set_throttle_rates(self, rates):
        """Patch the class attribute DRF actually reads, for the test's duration."""
        patcher = patch.object(ScopedRateThrottle, 'THROTTLE_RATES', rates)
        patcher.start()
        self.addCleanup(patcher.stop)


@override_settings(**WORKOS_TEST_SETTINGS)
class TokenVerificationTests(WorkOSAuthTestCase):

    def test_valid_token_verifies(self):
        claims = workos_auth.verify_access_token(make_token(sub='user_abc'))
        self.assertIsNotNone(claims)
        self.assertEqual(claims['sub'], 'user_abc')

    def test_expired_token_rejected(self):
        self.assertIsNone(workos_auth.verify_access_token(make_token(expires_in=-120)))

    @override_settings(WORKOS_ISSUER=ISSUER)
    def test_wrong_issuer_rejected_when_pinned(self):
        other = make_token(issuer='https://someone-else.authkit.app')
        self.assertIsNone(workos_auth.verify_access_token(other))

    @override_settings(WORKOS_ISSUER=ISSUER)
    def test_correct_issuer_accepted_when_pinned(self):
        self.assertIsNotNone(workos_auth.verify_access_token(make_token(issuer=ISSUER)))

    @override_settings(WORKOS_ISSUER='')
    def test_any_issuer_accepted_when_unpinned(self):
        """
        WORKOS_ISSUER unset accepts any issuer *by design*, because the JWKS is
        client-scoped: the signature already proves the token belongs to this
        WorkOS client. The Web3Auth code this replaced was different and unsafe
        — its JWKS was global across all projects, so skipping the audience
        check let any Web3Auth token in. See test_token_signed_by_unknown_key_
        rejected for the check actually doing the work here.
        """
        self.assertIsNotNone(
            workos_auth.verify_access_token(make_token(issuer='https://anything.example'))
        )

    def test_token_signed_by_unknown_key_rejected(self):
        attacker_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        self.assertIsNone(workos_auth.verify_access_token(make_token(key=attacker_key)))

    def test_tampered_token_rejected(self):
        token = make_token()
        head, payload, sig = token.split('.')
        self.assertIsNone(workos_auth.verify_access_token(f'{head}.{payload}x.{sig}'))

    def test_garbage_and_empty_rejected(self):
        self.assertIsNone(workos_auth.verify_access_token('not-a-jwt'))
        self.assertIsNone(workos_auth.verify_access_token(''))


@override_settings(**WORKOS_TEST_SETTINGS)
class AuthenticationClassTests(WorkOSAuthTestCase):

    def setUp(self):
        super().setUp()
        self.user = User.objects.create_user(email='someone@example.com', workos_id='user_known')

    def test_known_user_authenticates(self):
        self.auth(make_token(sub='user_known'))
        self.assertEqual(self.client.get('/api/dashboard/').status_code, 200)

    def test_valid_token_unknown_user_is_401(self):
        """A real WorkOS identity with no Byro row must sync first, not 500."""
        self.auth(make_token(sub='user_never_synced'))
        self.assertEqual(self.client.get('/api/dashboard/').status_code, 401)

    def test_expired_token_is_401(self):
        self.auth(make_token(sub='user_known', expires_in=-60))
        self.assertEqual(self.client.get('/api/dashboard/').status_code, 401)

    def test_no_credentials_is_401(self):
        self.assertEqual(self.client.get('/api/dashboard/').status_code, 401)

    def test_inactive_user_rejected(self):
        self.user.is_active = False
        self.user.save(update_fields=['is_active'])
        self.auth(make_token(sub='user_known'))
        self.assertEqual(self.client.get('/api/dashboard/').status_code, 401)

    def test_public_endpoint_still_open_to_anonymous(self):
        """Guest browsing must survive the auth swap."""
        self.assertEqual(self.client.get('/api/events/').status_code, 200)


@override_settings(**WORKOS_TEST_SETTINGS)
class MagicAuthTests(WorkOSAuthTestCase):
    SEND = '/api/auth/magic/send/'
    VERIFY = '/api/auth/magic/verify/'

    def test_send_requests_a_code(self):
        with patch('bryo.auth_views.workos_api.send_magic_auth_code', return_value=True) as send:
            res = self.client.post(self.SEND, {'email': 'someone@example.com'}, format='json')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(send.call_args.args[0], 'someone@example.com')

    def test_send_normalises_the_email(self):
        with patch('bryo.auth_views.workos_api.send_magic_auth_code', return_value=True) as send:
            self.client.post(self.SEND, {'email': '  MiXeD@Example.COM '}, format='json')
        self.assertEqual(send.call_args.args[0], 'mixed@example.com')

    def test_send_does_not_leak_whether_an_account_exists(self):
        """
        Identical response either way, or this endpoint becomes an account
        enumeration oracle.
        """
        User.objects.create_user(email='known@example.com', workos_id='user_known')
        with patch('bryo.auth_views.workos_api.send_magic_auth_code', return_value=True):
            known = self.client.post(self.SEND, {'email': 'known@example.com'}, format='json')
        with patch('bryo.auth_views.workos_api.send_magic_auth_code', return_value=False):
            unknown = self.client.post(self.SEND, {'email': 'nobody@example.com'}, format='json')

        self.assertEqual(known.status_code, unknown.status_code)
        self.assertEqual(known.json()['success'], unknown.json()['success'])

    def test_send_rejects_a_malformed_email(self):
        res = self.client.post(self.SEND, {'email': 'not-an-email'}, format='json')
        self.assertEqual(res.status_code, 400)

    def test_verify_creates_the_user_and_returns_tokens(self):
        with patch('bryo.auth_views.workos_api.authenticate_with_magic_auth',
                   return_value=fake_auth_response(sub='user_new')):
            res = self.client.post(self.VERIFY, {'email': 'new@example.com', 'code': '123456'},
                                   format='json')

        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertTrue(body['is_new_user'])
        self.assertIn('access', body['tokens'])
        self.assertIn('refresh', body['tokens'])

        user = User.objects.get(workos_id='user_new')
        self.assertEqual(user.email, 'new@example.com')
        self.assertTrue(user.email_verified)
        self.assertEqual(UserProfile.objects.get(user=user).display_name, 'Ada Lovelace')

    def test_verify_links_an_existing_account_and_keeps_its_data(self):
        """
        The migration test. A Web3Auth-era user signing in must land on their
        existing row — same id, same events — not a duplicate account.
        """
        legacy = User.objects.create_user(
            email='organiser@example.com', auth_provider='web3auth', external_id='web3-xyz',
        )
        event = make_event(name='Legacy Event', owner=legacy)

        with patch('bryo.auth_views.workos_api.authenticate_with_magic_auth',
                   return_value=fake_auth_response(sub='user_wk', email='organiser@example.com')):
            res = self.client.post(self.VERIFY, {'email': 'organiser@example.com', 'code': '123456'},
                                   format='json')

        self.assertEqual(res.status_code, 200)
        self.assertFalse(res.json()['is_new_user'])
        self.assertEqual(res.json()['user']['id'], legacy.id)

        legacy.refresh_from_db()
        self.assertEqual(legacy.workos_id, 'user_wk')
        self.assertEqual(User.objects.filter(email='organiser@example.com').count(), 1)
        event.refresh_from_db()
        self.assertEqual(event.owner_id, legacy.id)

    def test_verify_matches_email_case_insensitively(self):
        existing = User.objects.create_user(email='mixed@example.com')
        with patch('bryo.auth_views.workos_api.authenticate_with_magic_auth',
                   return_value=fake_auth_response(sub='user_case', email='MIXED@Example.com')):
            res = self.client.post(self.VERIFY, {'email': 'mixed@example.com', 'code': '123456'},
                                   format='json')
        self.assertEqual(res.json()['user']['id'], existing.id)
        self.assertEqual(User.objects.count(), 1)

    def test_verify_is_idempotent(self):
        for _ in range(3):
            with patch('bryo.auth_views.workos_api.authenticate_with_magic_auth',
                       return_value=fake_auth_response(sub='user_repeat')):
                res = self.client.post(self.VERIFY, {'email': 'new@example.com', 'code': '123456'},
                                       format='json')
                self.assertEqual(res.status_code, 200)
        self.assertEqual(User.objects.filter(workos_id='user_repeat').count(), 1)

    def test_verify_rejects_a_bad_code(self):
        with patch('bryo.auth_views.workos_api.authenticate_with_magic_auth',
                   side_effect=WorkOSAPIError('That code is incorrect or has expired.',
                                              code='invalid_code')):
            res = self.client.post(self.VERIFY, {'email': 'new@example.com', 'code': '000000'},
                                   format='json')
        self.assertEqual(res.status_code, 401)
        self.assertEqual(res.json()['code'], 'invalid_code')
        self.assertFalse(User.objects.exists())

    def test_verify_requires_both_fields(self):
        self.assertEqual(self.client.post(self.VERIFY, {'email': 'a@b.com'}, format='json').status_code, 400)
        self.assertEqual(self.client.post(self.VERIFY, {'code': '123456'}, format='json').status_code, 400)

    def test_verify_refuses_a_workos_user_with_no_email(self):
        """
        create_user('') raises, so this used to be a 500. Refusing is correct:
        fabricating an address is what produced the @web3auth.user accounts.
        """
        with patch('bryo.auth_views.workos_api.authenticate_with_magic_auth',
                   return_value=fake_auth_response(sub='user_noemail', email=None)):
            res = self.client.post(self.VERIFY, {'email': 'x@example.com', 'code': '123456'},
                                   format='json')
        self.assertEqual(res.status_code, 502)
        self.assertFalse(User.objects.filter(workos_id='user_noemail').exists())

    def test_display_name_set_by_the_user_is_not_overwritten(self):
        user = User.objects.create_user(email='keep@example.com', workos_id='user_keep')
        profile = UserProfile.objects.get(user=user)
        profile.display_name = 'Chosen Name'
        profile.save()

        with patch('bryo.auth_views.workos_api.authenticate_with_magic_auth',
                   return_value=fake_auth_response(sub='user_keep', email='keep@example.com')):
            self.client.post(self.VERIFY, {'email': 'keep@example.com', 'code': '123456'},
                             format='json')

        profile.refresh_from_db()
        self.assertEqual(profile.display_name, 'Chosen Name')


@override_settings(**WORKOS_TEST_SETTINGS, WORKOS_OAUTH_REDIRECT_URI='https://usebyro.com/auth/callback')
class OAuthTests(WorkOSAuthTestCase):
    AUTHORIZE = '/api/auth/oauth/authorize/'
    CALLBACK = '/api/auth/oauth/callback/'

    def test_authorize_returns_a_url_for_google(self):
        with patch('bryo.auth_views.workos_api.get_authorization_url',
                   return_value='https://api.workos.com/authorize?x=1') as gen:
            res = self.client.post(self.AUTHORIZE, {'provider': 'google'}, format='json')
        self.assertEqual(res.status_code, 200)
        self.assertIn('authorization_url', res.json())
        self.assertEqual(gen.call_args.kwargs['provider'], 'google')

    def test_authorize_never_takes_the_redirect_uri_from_the_request(self):
        """A client-supplied redirect would be an open redirect and could harvest codes."""
        with patch('bryo.auth_views.workos_api.get_authorization_url',
                   return_value='https://api.workos.com/authorize') as gen:
            self.client.post(self.AUTHORIZE,
                             {'provider': 'google', 'redirect_uri': 'https://evil.example/steal'},
                             format='json')
        self.assertEqual(gen.call_args.kwargs['redirect_uri'], 'https://usebyro.com/auth/callback')

    def test_authorize_rejects_an_unknown_provider(self):
        with patch('bryo.auth_views.workos_api.get_authorization_url',
                   side_effect=WorkOSAPIError('nope', code='unsupported_provider')):
            res = self.client.post(self.AUTHORIZE, {'provider': 'myspace'}, format='json')
        self.assertEqual(res.status_code, 400)

    def test_authorize_requires_a_provider(self):
        self.assertEqual(self.client.post(self.AUTHORIZE, {}, format='json').status_code, 400)

    def test_callback_exchanges_the_code_and_signs_in(self):
        with patch('bryo.auth_views.workos_api.authenticate_with_code',
                   return_value=fake_auth_response(sub='user_oauth', email='via@google.com')):
            res = self.client.post(self.CALLBACK, {'code': 'authcode123'}, format='json')

        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.json()['is_new_user'])
        self.assertTrue(User.objects.filter(workos_id='user_oauth').exists())

    def test_callback_rejects_a_used_code(self):
        with patch('bryo.auth_views.workos_api.authenticate_with_code',
                   side_effect=WorkOSAPIError('already used', code='invalid_code')):
            res = self.client.post(self.CALLBACK, {'code': 'spent'}, format='json')
        self.assertEqual(res.status_code, 401)

    def test_callback_requires_a_code(self):
        self.assertEqual(self.client.post(self.CALLBACK, {}, format='json').status_code, 400)


@override_settings(**WORKOS_TEST_SETTINGS)
class RefreshAndMeTests(WorkOSAuthTestCase):
    REFRESH = '/api/auth/refresh/'
    ME = '/api/auth/me/'

    def test_refresh_returns_new_tokens(self):
        with patch('bryo.auth_views.workos_api.authenticate_with_refresh_token',
                   return_value=fake_auth_response(sub='user_r')):
            res = self.client.post(self.REFRESH, {'refresh_token': 'rt_123'}, format='json')
        self.assertEqual(res.status_code, 200)
        self.assertIn('access', res.json()['tokens'])

    def test_refresh_rejects_a_revoked_token(self):
        """Signing out revokes the refresh token, so this is the normal end of a session."""
        with patch('bryo.auth_views.workos_api.authenticate_with_refresh_token',
                   side_effect=WorkOSAPIError('expired', code='invalid_refresh_token')):
            res = self.client.post(self.REFRESH, {'refresh_token': 'revoked'}, format='json')
        self.assertEqual(res.status_code, 401)

    def test_refresh_requires_a_token(self):
        self.assertEqual(self.client.post(self.REFRESH, {}, format='json').status_code, 400)

    def test_me_returns_the_current_user(self):
        user = User.objects.create_user(email='me@example.com', workos_id='user_me')
        self.auth(make_token(sub='user_me'))
        res = self.client.get(self.ME)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()['user']['id'], user.id)

    def test_me_requires_authentication(self):
        self.assertEqual(self.client.get(self.ME).status_code, 401)


@override_settings(**WORKOS_TEST_SETTINGS)
class CoHostInviteTests(WorkOSAuthTestCase):

    def setUp(self):
        super().setUp()
        self.owner = User.objects.create_user(email='owner@example.com', workos_id='user_owner')
        self.event = make_event(name='Test Event', owner=self.owner, visibility='private')

    def add_cohost(self, email):
        self.auth(make_token(sub='user_owner'))
        with patch('bryo.views.workos_api.send_invitation', return_value={'id': 'inv_1'}), \
             patch('bryo.views.send_cohost_invite_email'):
            return self.client.post(
                f'/api/events/{self.event.slug}/add_cohost/', {'email': email}, format='json',
            )

    def test_inviting_unregistered_email_creates_pending_invite(self):
        """This used to 404 because the invitee had no account."""
        res = self.add_cohost('newcomer@example.com')
        self.assertEqual(res.status_code, 201)

        invite = EventCoHost.objects.get(event=self.event)
        self.assertIsNone(invite.user)
        self.assertEqual(invite.status, EventCoHost.STATUS_PENDING)
        self.assertEqual(invite.invited_email, 'newcomer@example.com')

    def test_pending_invite_grants_no_access(self):
        """The security-critical one: a pending row must confer nothing."""
        self.add_cohost('newcomer@example.com')
        stranger = User.objects.create_user(email='newcomer@example.com', workos_id='user_stranger')

        self.assertFalse(self.event.is_cohost(stranger))
        self.assertFalse(self.event.is_owner_or_cohost(stranger))
        self.assertEqual(self.event.get_user_role(stranger)['role'], 'user')

        # And the private event must not appear in their listing.
        self.auth(make_token(sub='user_stranger'))
        body = self.client.get('/api/events/').json()
        slugs = [e['slug'] for e in (body['results'] if isinstance(body, dict) else body)]
        self.assertNotIn(self.event.slug, slugs)

    def test_invite_is_claimed_on_first_signin(self):
        self.add_cohost('newcomer@example.com')

        with patch('bryo.auth_views.workos_api.authenticate_with_magic_auth',
                   return_value=fake_auth_response(sub='user_newcomer',
                                                   email='newcomer@example.com')):
            res = self.client.post('/api/auth/magic/verify/',
                                   {'email': 'newcomer@example.com', 'code': '123456'},
                                   format='json')

        self.assertEqual(res.json()['cohost_invites_claimed'], 1)

        newcomer = User.objects.get(workos_id='user_newcomer')
        invite = EventCoHost.objects.get(event=self.event)
        self.assertEqual(invite.user, newcomer)
        self.assertEqual(invite.status, EventCoHost.STATUS_ACCEPTED)
        self.assertIsNotNone(invite.accepted_at)
        self.assertTrue(self.event.is_cohost(newcomer))
        self.assertEqual(self.event.get_user_role(newcomer)['role'], 'cohost')

    def test_unverified_email_cannot_claim_an_invite(self):
        """Otherwise anyone could seize a grant by signing up with that address."""
        self.add_cohost('newcomer@example.com')

        with patch('bryo.auth_views.workos_api.authenticate_with_magic_auth',
                   return_value=fake_auth_response(sub='user_impostor',
                                                   email='newcomer@example.com',
                                                   verified=False)):
            res = self.client.post('/api/auth/magic/verify/',
                                   {'email': 'newcomer@example.com', 'code': '123456'},
                                   format='json')

        self.assertEqual(res.json()['cohost_invites_claimed'], 0)
        self.assertEqual(
            EventCoHost.objects.get(event=self.event).status, EventCoHost.STATUS_PENDING,
        )

    def test_registered_user_is_added_as_accepted(self):
        User.objects.create_user(email='friend@example.com', workos_id='user_friend')
        res = self.add_cohost('friend@example.com')
        self.assertEqual(res.status_code, 201)

        invite = EventCoHost.objects.get(event=self.event)
        self.assertEqual(invite.status, EventCoHost.STATUS_ACCEPTED)
        self.assertIsNotNone(invite.user)

    def test_duplicate_invite_rejected(self):
        self.assertEqual(self.add_cohost('newcomer@example.com').status_code, 201)
        self.assertEqual(self.add_cohost('newcomer@example.com').status_code, 400)

    def test_cannot_invite_the_owner(self):
        self.assertEqual(self.add_cohost('owner@example.com').status_code, 400)

    def test_invalid_email_rejected(self):
        self.assertEqual(self.add_cohost('not-an-email').status_code, 400)

    def test_non_owner_cannot_invite(self):
        User.objects.create_user(email='rando@example.com', workos_id='user_rando')
        self.auth(make_token(sub='user_rando'))
        res = self.client.post(
            f'/api/events/{self.event.slug}/add_cohost/',
            {'email': 'x@example.com'}, format='json',
        )
        self.assertIn(res.status_code, (403, 404))
        self.assertFalse(EventCoHost.objects.exists())

    def test_pending_invite_can_be_revoked(self):
        self.add_cohost('newcomer@example.com')
        invite = EventCoHost.objects.get(event=self.event)

        self.auth(make_token(sub='user_owner'))
        res = self.client.delete(
            f'/api/events/{self.event.slug}/remove_cohost/',
            {'cohost_id': invite.id}, format='json',
        )
        self.assertEqual(res.status_code, 200)
        self.assertFalse(EventCoHost.objects.exists())


@override_settings(**WORKOS_TEST_SETTINGS)
class ThrottlingTests(WorkOSAuthTestCase):
    """
    Sending a code emails a third party on our WorkOS quota, so the ceiling is
    the thing stopping someone mail-bombing an address. Verified explicitly
    because every other test runs with throttling off.
    """

    def test_magic_send_is_throttled(self):
        self.set_throttle_rates({**ScopedRateThrottle.THROTTLE_RATES, 'auth_send': '3/hour'})

        with patch('bryo.auth_views.workos_api.send_magic_auth_code', return_value=True):
            codes = [
                self.client.post('/api/auth/magic/send/',
                                 {'email': 'spam@example.com'}, format='json').status_code
                for _ in range(5)
            ]

        self.assertEqual(codes[:3], [200, 200, 200])
        self.assertEqual(codes[3:], [429, 429])


@override_settings(**WORKOS_TEST_SETTINGS)
class PrivateEventVisibilityTests(WorkOSAuthTestCase):
    """
    `private` means unlisted, not secret. The host shares the link themselves,
    so anyone holding it must be able to open the page and register — while the
    event stays out of every listing surface (discover, search, categories,
    locations, and the sitemap that is built from the list endpoint).
    """

    def setUp(self):
        super().setUp()
        self.owner = User.objects.create_user(email='owner@example.com', workos_id='user_owner')
        self.private = make_event(name='Private Party', owner=self.owner, visibility='private')
        self.public = make_event(name='Open Party', owner=self.owner, visibility='public')

    def listed_slugs(self, params=''):
        body = self.client.get(f'/api/events/{params}').json()
        rows = body['results'] if isinstance(body, dict) else body
        return [e['slug'] for e in rows]

    def test_anonymous_can_open_a_private_event_by_link(self):
        res = self.client.get(f'/api/events/{self.private.slug}/')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()['slug'], self.private.slug)

    def test_private_event_stays_out_of_listings(self):
        slugs = self.listed_slugs()
        self.assertIn(self.public.slug, slugs)
        self.assertNotIn(self.private.slug, slugs)

    def test_private_event_stays_out_of_search_results(self):
        self.assertNotIn(self.private.slug, self.listed_slugs('?search=Private'))

    def test_private_event_is_not_counted_in_categories(self):
        counts = {c['value']: c['count'] for c in self.client.get('/api/events/categories/').json()['categories']}
        self.assertEqual(counts[self.public.category], 1)

    def test_deactivated_event_is_hidden_even_by_link(self):
        """is_active is the other axis — a deactivated event is gone for visitors."""
        self.private.is_active = False
        self.private.save(update_fields=['is_active'])
        self.assertEqual(self.client.get(f'/api/events/{self.private.slug}/').status_code, 404)

    def test_owner_can_still_open_their_deactivated_event(self):
        self.private.is_active = False
        self.private.save(update_fields=['is_active'])
        self.auth(make_token(sub='user_owner'))
        self.assertEqual(self.client.get(f'/api/events/{self.private.slug}/').status_code, 200)
