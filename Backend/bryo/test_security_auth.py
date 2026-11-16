"""Sign-in: an existing account is only linked to an identity whose email WorkOS has verified."""
from types import SimpleNamespace
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIClient

from .auth_views import upsert_user

User = get_user_model()


def identity(workos_id, email, verified):
    return {'id': workos_id, 'email': email, 'email_verified': verified, 'first_name': '', 'last_name': ''}


class LinkingTests(TestCase):
    def setUp(self):
        # An account that already exists, with money and events attached, before or after the WorkOS move.
        self.victim = User.objects.create_user(email='victim@example.com')

    def test_an_unverified_identity_cannot_take_over_an_account_by_email(self):
        with self.assertRaises(ValueError):
            upsert_user(identity('user_ATTACKER', 'victim@example.com', False))
        self.victim.refresh_from_db()
        self.assertIsNone(self.victim.workos_id)
        self.assertEqual(User.objects.count(), 1)

    def test_the_email_match_ignores_case_for_the_refusal_too(self):
        with self.assertRaises(ValueError):
            upsert_user(identity('user_ATTACKER', 'Victim@Example.com', False))

    def test_an_account_already_tied_to_someone_is_not_reassigned_by_an_unverified_identity(self):
        User.objects.filter(pk=self.victim.pk).update(workos_id='user_REAL')
        with self.assertRaises(ValueError):
            upsert_user(identity('user_ATTACKER', 'victim@example.com', False))
        self.victim.refresh_from_db()
        self.assertEqual(self.victim.workos_id, 'user_REAL')

    def test_a_verified_identity_still_links_to_the_existing_account(self):
        user, created = upsert_user(identity('user_OWNER', 'victim@example.com', True))
        self.assertFalse(created)
        self.assertEqual(user.pk, self.victim.pk)
        self.victim.refresh_from_db()
        self.assertEqual((self.victim.workos_id, self.victim.email_verified), ('user_OWNER', True))

    def test_a_returning_user_is_found_by_their_workos_id(self):
        upsert_user(identity('user_OWNER', 'victim@example.com', True))
        user, created = upsert_user(identity('user_OWNER', 'victim@example.com', False))
        self.assertFalse(created)
        self.assertEqual(user.pk, self.victim.pk)

    def test_a_brand_new_address_can_still_sign_up_unverified(self):
        user, created = upsert_user(identity('user_NEW', 'new@example.com', False))
        self.assertTrue(created)
        self.assertFalse(user.email_verified)

    def test_an_unverified_email_change_is_not_copied_onto_the_account(self):
        upsert_user(identity('user_OWNER', 'victim@example.com', True))
        upsert_user(identity('user_OWNER', 'other@example.com', False))
        self.victim.refresh_from_db()
        self.assertEqual(self.victim.email, 'victim@example.com')


class SignInEndpointTests(TestCase):
    def setUp(self):
        cache.clear()
        self.victim = User.objects.create_user(email='victim@example.com')
        self.client = APIClient()
        patch('bryo.views.check_and_remember_verification', return_value=True).start()
        self.addCleanup(patch.stopall)

    def verify(self, verified):
        auth = SimpleNamespace(user=identity('user_X', 'victim@example.com', verified), access_token='a', refresh_token='r')
        with patch('bryo.auth_views.workos_api.authenticate_with_magic_auth', return_value=auth):
            return self.client.post('/api/auth/magic/verify/', {'email': 'victim@example.com', 'code': '123456'}, format='json')

    def test_an_unverified_sign_in_for_someone_elses_address_gets_no_session(self):
        r = self.verify(False)
        self.assertNotEqual(r.status_code, 200)
        self.assertNotIn('access', r.json())
        self.victim.refresh_from_db()
        self.assertIsNone(self.victim.workos_id)

    def test_a_verified_sign_in_works(self):
        r = self.verify(True)
        self.assertEqual(r.status_code, 200)
