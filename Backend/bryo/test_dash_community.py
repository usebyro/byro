"""Dashboard > Community: the growth series, events that grew the community, and the people list."""
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.utils import timezone

from .community import record_stamp
from .models import Follow, Stamp, UserProfile
from .test_checkin import ticket
from .test_payments import PaymentTestBase, make_event

User = get_user_model()


class DashCommunityBase(PaymentTestBase):
    def setUp(self):
        super().setUp()
        UserProfile.objects.update_or_create(
            user=self.owner, defaults={'handle': 'lagosrun', 'display_name': 'Lagos Run Club'},
        )
        self.client.force_authenticate(self.owner)

    def attend(self, event, email, name='Guest One'):
        return record_stamp(ticket(event, email=email, name=name))

    def follow(self, email, name=''):
        fan = User.objects.create_user(email=email)
        if name:
            UserProfile.objects.update_or_create(user=fan, defaults={'display_name': name})
        return Follow.objects.create(follower=fan, following=self.owner)

    def members(self, **params):
        res = self.client.get('/api/dashboard/community/members/', params)
        self.assertEqual(res.status_code, 200)
        return res.json()


class SummaryTests(DashCommunityBase):

    def test_needs_sign_in(self):
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get('/api/dashboard/community/summary/').status_code, 401)

    def test_counts_new_followers_per_week_and_month(self):
        self.follow('a@example.com')
        old = self.follow('b@example.com')
        Follow.objects.filter(pk=old.pk).update(created_at=timezone.now() - timedelta(days=400))
        res = self.client.get('/api/dashboard/community/summary/').json()
        self.assertEqual(res['unit'], 'week')
        self.assertEqual(len(res['series']), 12)
        self.assertEqual(res['series'][-1]['count'], 1)
        self.assertEqual(res['new_followers'], 1)
        self.assertEqual(res['stats']['followers'], 2)
        self.assertEqual(res['handle'], 'lagosrun')

        res = self.client.get('/api/dashboard/community/summary/', {'range': '12m'}).json()
        self.assertEqual(res['unit'], 'month')
        self.assertEqual(len(res['series']), 12)
        self.assertEqual(res['new_followers'], 1)

    def test_events_that_grew_you_count_first_visits_only(self):
        second = make_event(self.owner, name='Second')
        self.attend(self.event, 'a@example.com')
        self.attend(second, 'a@example.com')  # a return visit, not a new member
        self.attend(second, 'b@example.com')
        self.attend(second, 'c@example.com')
        top = self.client.get('/api/dashboard/community/summary/').json()['top_events']
        self.assertEqual([(t['name'], t['new_members']) for t in top], [('Second', 2), ('Test Event', 1)])

    def test_only_the_organisers_own_community(self):
        other = User.objects.create_user(email='other@example.com')
        record_stamp(ticket(make_event(other, name='Theirs'), email='x@example.com'))
        Follow.objects.create(follower=User.objects.create_user(email='y@example.com'), following=other)
        res = self.client.get('/api/dashboard/community/summary/').json()
        self.assertEqual(res['new_followers'], 0)
        self.assertEqual(res['top_events'], [])
        self.assertEqual(self.members()['total'], 0)


class MembersTests(DashCommunityBase):

    def test_statuses_and_filters(self):
        events = [self.event] + [make_event(self.owner, name=f'E{i}') for i in range(2)]
        for e in events:
            self.attend(e, 'reg@example.com', name='Ada Regular')
        old = self.attend(self.event, 'member@example.com', name='Old Member')
        Stamp.objects.filter(pk=old.pk).update(created_at=timezone.now() - timedelta(days=90))
        self.attend(self.event, 'new@example.com', name='New Person')
        self.follow('fan@example.com', name='Just Fan')

        data = self.members()
        self.assertEqual(data['total'], 4)
        self.assertEqual(data['counts'], {'all': 4, 'regular': 1, 'new': 1, 'follower': 1})
        by_name = {r['name']: r for r in data['results']}
        self.assertEqual(by_name['Ada Regular']['status'], 'regular')
        self.assertEqual(by_name['Ada Regular']['events'], 3)
        self.assertEqual(by_name['Old Member']['status'], 'member')
        self.assertEqual(by_name['New Person']['status'], 'new')
        self.assertEqual(by_name['Just Fan']['status'], 'follower')
        self.assertTrue(by_name['Just Fan']['following'])

        self.assertEqual([r['name'] for r in self.members(filter='regular')['results']], ['Ada Regular'])
        self.assertEqual([r['name'] for r in self.members(filter='follower')['results']], ['Just Fan'])

    def test_follower_email_hidden_unless_they_hold_a_ticket(self):
        self.follow('private@example.com', name='Private Fan')
        self.follow('buyer@example.com', name='Buyer Fan')
        ticket(self.event, email='buyer@example.com', name='Buyer Fan', status='paid')
        rows = {r['name']: r for r in self.members()['results']}
        self.assertIsNone(rows['Private Fan']['email'])
        self.assertEqual(rows['Buyer Fan']['email'], 'buyer@example.com')
        # Search never matches an address the organiser can't see.
        self.assertEqual(self.members(q='private@')['count'], 0)
        self.assertEqual(self.members(q='buyer@')['count'], 1)
        self.assertEqual(self.members(q='private fan')['count'], 1)

    def test_attendee_and_follower_are_one_person(self):
        self.attend(self.event, 'both@example.com', name='Both Ways')
        self.follow('both@example.com')
        data = self.members()
        self.assertEqual(data['total'], 1)
        self.assertTrue(data['results'][0]['following'])
        self.assertEqual(data['results'][0]['first_event'], 'Test Event')

    def test_pages(self):
        for i in range(30):
            self.attend(self.event, f'p{i}@example.com')
        first = self.members()
        self.assertEqual(len(first['results']), 25)
        self.assertTrue(first['has_more'])
        second = self.members(page=2)
        self.assertEqual(len(second['results']), 5)
        self.assertFalse(second['has_more'])

    def test_csv_export(self):
        self.attend(self.event, 'a@example.com', name='=HYPERLINK("x")')
        self.follow('hidden@example.com', name='Hidden')
        res = self.client.get('/api/dashboard/community/members/', {'export': 'csv'})
        self.assertEqual(res.status_code, 200)
        self.assertIn('text/csv', res['Content-Type'])
        body = res.content.decode('utf-8-sig')
        self.assertIn("'=HYPERLINK", body)  # no formulas in spreadsheets
        self.assertNotIn('hidden@example.com', body)
        self.assertIn('Hidden', body)
