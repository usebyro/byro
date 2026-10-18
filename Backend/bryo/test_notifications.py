"""In-app notifications: who gets told what, and the bell's API."""
from django.contrib.auth import get_user_model

from .models import AdminMember, Notification, PayoutRequest
from .notifications import notify, notify_admins
from .test_community import CommunityBase

User = get_user_model()


class OrganiserNotificationTests(CommunityBase):

    def claim(self, user):
        self.event.ticket_price = 0
        self.event.save()
        self.client.force_authenticate(user)
        return self.client.post(
            f'/api/events/{self.event.slug}/register/',
            {'name': 'Fan', 'email': user.email}, format='json',
        )

    def test_the_organiser_hears_about_a_claim_and_a_new_follower(self):
        self.assertEqual(self.claim(self.fan()).status_code, 201)
        kinds = set(Notification.objects.filter(recipient=self.owner).values_list('kind', flat=True))
        self.assertEqual(kinds, {'ticket_sale', 'new_follower'})
        sale = Notification.objects.get(recipient=self.owner, kind='ticket_sale')
        self.assertEqual(sale.audience, 'organiser')
        self.assertEqual(sale.link, f'/dashboard/events/{self.event.slug}')

    def test_the_buyer_gets_nothing(self):
        fan = self.fan()
        self.claim(fan)
        self.assertFalse(Notification.objects.filter(recipient=fan).exists())


class BellApiTests(CommunityBase):

    def test_each_person_sees_only_their_own_and_can_mark_read(self):
        a, b = self.fan('a@example.com'), self.fan('b@example.com')
        n1 = notify(a, 'x', 'One')
        notify(a, 'x', 'Two')
        notify(b, 'x', 'Not yours')

        self.client.force_authenticate(a)
        data = self.client.get('/api/notifications/').json()
        self.assertEqual(data['unread'], 2)
        self.assertEqual([r['title'] for r in data['results']], ['Two', 'One'])

        data = self.client.post('/api/notifications/read/', {'ids': [n1.pk]}, format='json').json()
        self.assertEqual(data['unread'], 1)
        data = self.client.post('/api/notifications/read/', {}, format='json').json()
        self.assertEqual(data['unread'], 0)
        self.assertEqual(Notification.objects.get(recipient=b).read_at, None)

    def test_it_requires_sign_in(self):
        self.client.force_authenticate(None)
        self.assertIn(self.client.get('/api/notifications/').status_code, (401, 403))

    def test_the_admin_bell_is_separate_and_for_the_team_only(self):
        admin = self.fan('boss@example.com')
        AdminMember.objects.create(email='boss@example.com', role='viewer')
        notify(admin, 'x', 'Organiser one')
        notify_admins('payout_request', 'Payout request', link='/payouts')

        self.client.force_authenticate(admin)
        rows = self.client.get('/api/admin/notifications/').json()['results']
        self.assertEqual([r['title'] for r in rows], ['Payout request'])
        # Viewers may clear their own bell
        self.assertEqual(self.client.post('/api/admin/notifications/read/', {}, format='json').status_code, 200)

        self.client.force_authenticate(self.fan('rando@example.com'))
        self.assertEqual(self.client.get('/api/admin/notifications/').status_code, 403)


class AdminNotificationTests(CommunityBase):

    def test_the_team_hears_about_payout_requests_and_the_decision_reaches_the_organiser(self):
        boss = self.fan('boss@example.com')
        AdminMember.objects.create(email='boss@example.com', role='admin')
        notify_admins('payout_request', 'Payout request: ₦5,000', link='/payouts')
        self.assertEqual(Notification.objects.filter(recipient=boss, audience='admin').count(), 1)
        self.assertEqual(Notification.objects.filter(recipient=self.owner).count(), 0)

        payout = PayoutRequest.objects.create(
            user=self.owner, amount=5000, method='bank',
            bank_name='GTBank', account_number='0123456789', account_name='Lagos Run Club',
        )
        self.client.force_authenticate(boss)
        res = self.client.patch(f'/api/admin/payouts/{payout.pk}/', {'status': 'processed'}, format='json')
        self.assertEqual(res.status_code, 200)
        told = Notification.objects.get(recipient=self.owner)
        self.assertEqual(told.kind, 'payout_processed')
        self.assertEqual(told.audience, 'organiser')
        self.assertIn('5,000', told.title)


class AdminSaleAndPublishTests(CommunityBase):

    def setUp(self):
        super().setUp()
        self.boss = self.fan('boss@example.com')
        AdminMember.objects.create(email='boss@example.com', role='admin')

    def admin_kinds(self):
        return list(Notification.objects.filter(recipient=self.boss, audience='admin').values_list('kind', flat=True))

    def test_the_team_hears_about_each_paid_order_but_not_free_claims(self):
        from .notifications import ticket_sale
        from .test_refunds import make_payment
        payment = make_payment(self.event, reference='EVT-admin-push', amount='10500.00', seats=2)
        ticket_sale(self.event, 2, paid_amount=payment.amount, payment=payment)
        told = Notification.objects.get(recipient=self.boss, kind='payment')
        self.assertEqual(told.title, '₦10,500 paid')
        self.assertIn('2 tickets', told.body)
        self.assertEqual(told.link, f'/payments/{payment.pk}')

        ticket_sale(self.event, 1)  # a free claim
        self.assertEqual(self.admin_kinds(), ['payment'])

    def test_a_draft_going_live_tells_the_team_once(self):
        self.event.is_draft = True
        self.event.save()
        self.client.force_authenticate(self.owner)
        res = self.client.patch(f'/api/events/{self.event.slug}/', {'is_draft': False}, format='json')
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(self.admin_kinds(), ['event_created'])
        # Editing the live event afterwards says nothing new.
        self.client.patch(f'/api/events/{self.event.slug}/', {'description': 'Updated'}, format='json')
        self.assertEqual(self.admin_kinds(), ['event_created'])
