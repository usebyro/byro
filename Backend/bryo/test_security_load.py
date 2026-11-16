"""Staying up under load: bounded public lists, cached anonymous answers, cheap queries and rate limits."""
import runpy
from decimal import Decimal
from pathlib import Path
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.db import connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIClient

from . import views
from .models import TicketTier
from .test_payments import make_event

User = get_user_model()


def make_events(owners, count, start=0):
    for i in range(start, start + count):
        ev = make_event(owners[i % len(owners)], ticket_price=Decimal('1000'), name=f'Event {i}')
        TicketTier.objects.create(event=ev, name='GA', price=Decimal('1000'), capacity=100)


class EventListTests(TestCase):
    def setUp(self):
        cache.clear()
        self.owners = [User.objects.create_user(email=f'o{i}@example.com') for i in range(3)]
        self.anon = APIClient()

    def names(self, response):
        return [e['name'] for e in response.json()]

    def test_one_request_never_returns_more_than_the_cap(self):
        make_events(self.owners, 12)
        with patch('bryo.views.EVENT_LIST_MAX', 5):
            self.assertEqual(len(self.anon.get('/api/events/').json()), 5)
            self.assertEqual(len(self.anon.get('/api/events/?limit=100000').json()), 5)
            self.assertEqual(len(self.anon.get('/api/events/?page_size=100000').json()), 5)

    def test_limit_and_offset_page_through_the_events(self):
        make_events(self.owners, 7)
        first = self.names(self.anon.get('/api/events/?limit=3'))
        second = self.names(self.anon.get('/api/events/?limit=3&offset=3'))
        third = self.names(self.anon.get('/api/events/?limit=3&offset=6'))
        everything = first + second + third
        self.assertEqual((len(first), len(second), len(third)), (3, 3, 1))
        self.assertEqual(len(set(everything)), 7)

    def test_nonsense_limit_and_offset_fall_back_safely(self):
        make_events(self.owners, 3)
        for query in ('limit=abc', 'limit=-5&offset=-9', 'limit=0', 'offset=xyz', 'limit=1.5'):
            r = self.anon.get(f'/api/events/?{query}')
            self.assertEqual(r.status_code, 200, query)
            self.assertGreaterEqual(len(r.json()), 1, query)

    def test_the_list_is_still_a_plain_array(self):
        make_events(self.owners, 2)
        self.assertIsInstance(self.anon.get('/api/events/').json(), list)

    def test_the_cost_per_event_stays_small(self):
        make_events(self.owners, 10)
        with CaptureQueriesContext(connection) as small:
            self.anon.get('/api/events/')
        cache.clear()
        make_events(self.owners, 20, start=10)
        with CaptureQueriesContext(connection) as large:
            self.anon.get('/api/events/')
        per_event = (len(large) - len(small)) / 20
        self.assertLessEqual(per_event, 4, f'{per_event} queries per extra event')

    def test_a_repeat_visit_by_a_signed_out_visitor_is_served_from_the_cache(self):
        make_events(self.owners, 10)
        with CaptureQueriesContext(connection) as cold:
            first = self.anon.get('/api/events/')
        with CaptureQueriesContext(connection) as warm:
            second = self.anon.get('/api/events/')
        self.assertEqual(first.json(), second.json())
        self.assertLessEqual(len(warm), 3)
        self.assertGreater(len(cold), 20)

    def test_a_new_event_shows_up_at_once_despite_the_cache(self):
        make_events(self.owners, 2)
        self.assertEqual(len(self.anon.get('/api/events/').json()), 2)
        make_events(self.owners, 1, start=2)
        self.assertEqual(len(self.anon.get('/api/events/').json()), 3)

    def test_different_searches_do_not_share_an_answer(self):
        make_events(self.owners, 3)
        everything = self.anon.get('/api/events/').json()
        none = self.anon.get('/api/events/?search=zzzzzz-nothing').json()
        self.assertEqual((len(everything), len(none)), (3, 0))

    def test_signed_in_people_are_never_served_the_shared_answer(self):
        make_events(self.owners, 2)
        self.anon.get('/api/events/')                                  # fills the shared cache
        client = APIClient()
        client.force_authenticate(self.owners[0])
        r = client.get('/api/events/')
        self.assertIn('private', r['Cache-Control'])
        mine = [e for e in r.json() if e['role']['is_owner']]
        self.assertTrue(mine, 'the organiser should see their own events marked as theirs')

    def test_cache_headers_let_a_cdn_help_but_never_mix_signed_in_and_out(self):
        make_events(self.owners, 1)
        r = self.anon.get('/api/events/')
        self.assertIn('public', r['Cache-Control'])
        self.assertIn('s-maxage=30', r['Cache-Control'])
        self.assertIn('Authorization', r['Vary'])


class RateLimitTests(TestCase):
    def setUp(self):
        cache.clear()
        self.owner = User.objects.create_user(email='org@example.com')
        self.event = make_event(self.owner, ticket_price=Decimal('0'), capacity=1000)

    def test_free_registration_is_limited_per_visitor(self):
        # One proxy in front writes the real address at the right end; the caller controls the rest.
        codes = [APIClient().post(f'/api/events/{self.event.slug}/register/', {'name': 'Bot', 'email': f'v{i}@example.com'},
                                  format='json', HTTP_X_FORWARDED_FOR='198.51.100.7').status_code for i in range(70)]
        self.assertEqual(codes[:60], [201] * 60)
        self.assertIn(429, codes[60:])

    def test_a_big_group_on_different_addresses_is_not_blocked(self):
        codes = [APIClient().post(f'/api/events/{self.event.slug}/register/', {'name': 'P', 'email': f'p{i}@example.com'},
                                  format='json', HTTP_X_FORWARDED_FOR=f'203.0.113.{i + 1}').status_code for i in range(70)]
        self.assertNotIn(429, codes)

    def test_bank_account_lookups_are_limited_per_person(self):
        client = APIClient()
        client.force_authenticate(self.owner)
        fake = type('R', (), {'status_code': 200, 'json': lambda self: {'status': True, 'data': {'account_name': 'X'}}})()
        with patch('bryo.views.requests.get', return_value=fake):
            codes = [client.get('/api/paystack/resolve-account/?account_number=0123456789&bank_code=058').status_code for _ in range(45)]
        self.assertEqual(codes[:40], [200] * 40)
        self.assertIn(429, codes[40:])


class ServerSetupTests(TestCase):
    def test_gunicorn_serves_several_requests_at_once(self):
        conf = runpy.run_path(str(Path(__file__).resolve().parent.parent / 'gunicorn.conf.py'))
        self.assertEqual(conf['worker_class'], 'gthread')
        self.assertGreaterEqual(conf['workers'] * conf['threads'], 4)
        self.assertLessEqual(conf['timeout'], 30)
        self.assertGreater(conf['max_requests'], 0)

    def test_a_slow_paystack_cannot_hold_a_thread_for_long(self):
        self.assertLessEqual(views.PAYSTACK_WAIT_SECONDS, 15)
