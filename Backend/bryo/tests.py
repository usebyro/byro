"""
Tests for WorkOS authentication, account migration and co-host invitations.

These run entirely offline. A throwaway RSA keypair signs tokens that look
exactly like WorkOS access tokens, and the JWKS lookup is patched to return the
matching public key — so the real verification path (signature, issuer, expiry,
required claims) is exercised without any network access.
"""

import datetime
from unittest.mock import patch

import jwt
from cryptography.hazmat.primitives.asymmetric import rsa
from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from .models import Event, EventCoHost, UserProfile
from .services import workos_auth

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


class WorkOSAuthTestCase(TestCase):
    """Base: patches JWKS resolution to hand back our local public key."""

    def setUp(self):
        super().setUp()
        workos_auth.reset_jwks_client()

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
class AuthSyncTests(WorkOSAuthTestCase):
    URL = '/api/auth/sync/'

    def workos_user(self, email='new@example.com', **kw):
        return {
            'id': 'user_01TEST', 'email': email, 'email_verified': True,
            'first_name': kw.get('first_name', 'Ada'),
            'last_name': kw.get('last_name', 'Lovelace'),
        }

    def test_creates_user_and_profile(self):
        self.auth(make_token(sub='user_new'))
        with patch('bryo.auth_views.workos_api.get_user', return_value=self.workos_user()):
            res = self.client.post(self.URL)

        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.json()['is_new_user'])
        user = User.objects.get(workos_id='user_new')
        self.assertEqual(user.email, 'new@example.com')
        self.assertTrue(user.email_verified)
        self.assertEqual(user.auth_provider, 'workos')
        self.assertEqual(UserProfile.objects.get(user=user).display_name, 'Ada Lovelace')

    def test_existing_account_is_linked_and_keeps_its_data(self):
        """
        The migration test. A Web3Auth-era user signing in with WorkOS must land
        on their existing row — same id, same events, same tickets — not a
        duplicate account.
        """
        legacy = User.objects.create_user(
            email='organiser@example.com', auth_provider='web3auth', external_id='web3-xyz',
        )
        event = make_event(name='Legacy Event', owner=legacy)
        legacy_id = legacy.id

        self.auth(make_token(sub='user_workos_new'))
        with patch('bryo.auth_views.workos_api.get_user',
                   return_value=self.workos_user(email='organiser@example.com')):
            res = self.client.post(self.URL)

        self.assertEqual(res.status_code, 200)
        self.assertFalse(res.json()['is_new_user'])
        self.assertEqual(res.json()['user']['id'], legacy_id)

        legacy.refresh_from_db()
        self.assertEqual(legacy.workos_id, 'user_workos_new')
        self.assertEqual(User.objects.filter(email='organiser@example.com').count(), 1)
        event.refresh_from_db()
        self.assertEqual(event.owner_id, legacy_id)

    def test_email_match_is_case_insensitive(self):
        existing = User.objects.create_user(email='mixed@example.com')
        self.auth(make_token(sub='user_case'))
        with patch('bryo.auth_views.workos_api.get_user',
                   return_value=self.workos_user(email='MIXED@Example.com')):
            res = self.client.post(self.URL)
        self.assertEqual(res.json()['user']['id'], existing.id)
        self.assertEqual(User.objects.count(), 1)

    def test_repeat_signin_is_idempotent(self):
        for _ in range(3):
            self.auth(make_token(sub='user_repeat'))
            with patch('bryo.auth_views.workos_api.get_user', return_value=self.workos_user()):
                self.assertEqual(self.client.post(self.URL).status_code, 200)
        self.assertEqual(User.objects.filter(workos_id='user_repeat').count(), 1)

    def test_invalid_token_rejected(self):
        self.auth(make_token(sub='user_x', expires_in=-60))
        self.assertEqual(self.client.post(self.URL).status_code, 401)

    def test_missing_token_rejected(self):
        self.assertEqual(self.client.post(self.URL).status_code, 401)

    def test_provider_unreachable_on_first_signin_is_502(self):
        """
        Never invent a placeholder email. Creating users with fabricated
        addresses is precisely the mess this migration is cleaning up.
        """
        self.auth(make_token(sub='user_unreachable'))
        with patch('bryo.auth_views.workos_api.get_user', return_value=None):
            res = self.client.post(self.URL)
        self.assertEqual(res.status_code, 502)
        self.assertFalse(User.objects.filter(workos_id='user_unreachable').exists())

    def test_workos_user_without_email_is_refused_not_500(self):
        """
        create_user('') raises ValueError, so this used to be a 500. Refusing is
        correct: fabricating a placeholder address is what produced the
        @web3auth.user accounts this migration exists to undo.
        """
        self.auth(make_token(sub='user_noemail'))
        with patch('bryo.auth_views.workos_api.get_user', return_value={
            'id': 'user_noemail', 'email': None, 'email_verified': False,
            'first_name': '', 'last_name': '',
        }):
            res = self.client.post(self.URL)
        self.assertEqual(res.status_code, 502)
        self.assertFalse(User.objects.filter(workos_id='user_noemail').exists())

    def test_provider_unreachable_for_known_user_still_succeeds(self):
        User.objects.create_user(email='known@example.com', workos_id='user_known2')
        self.auth(make_token(sub='user_known2'))
        with patch('bryo.auth_views.workos_api.get_user', return_value=None):
            self.assertEqual(self.client.post(self.URL).status_code, 200)

    def test_display_name_set_by_user_is_not_overwritten(self):
        user = User.objects.create_user(email='keep@example.com', workos_id='user_keep')
        profile = UserProfile.objects.get(user=user)
        profile.display_name = 'Chosen Name'
        profile.save()

        self.auth(make_token(sub='user_keep'))
        with patch('bryo.auth_views.workos_api.get_user',
                   return_value=self.workos_user(email='keep@example.com')):
            self.client.post(self.URL)

        profile.refresh_from_db()
        self.assertEqual(profile.display_name, 'Chosen Name')


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

        self.auth(make_token(sub='user_newcomer'))
        with patch('bryo.auth_views.workos_api.get_user', return_value={
            'id': 'user_newcomer', 'email': 'newcomer@example.com', 'email_verified': True,
            'first_name': 'New', 'last_name': 'Comer',
        }):
            res = self.client.post('/api/auth/sync/')

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

        self.auth(make_token(sub='user_impostor'))
        with patch('bryo.auth_views.workos_api.get_user', return_value={
            'id': 'user_impostor', 'email': 'newcomer@example.com', 'email_verified': False,
            'first_name': '', 'last_name': '',
        }):
            res = self.client.post('/api/auth/sync/')

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
