"""Admin: one person's full picture, and deleting (anonymising) an account on request."""
import datetime
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import override_settings
from django.utils import timezone

from .models import (
    ActivityLog, AdminAction, AdminMember, Event, Follow, MerchItem, PayoutRequest, Stamp, Ticket, UserProfile,
)
from .community import record_stamp
from .test_checkin import ticket
from .test_payments import PAYMENT_SETTINGS, PaymentTestBase, make_event
from .test_refunds import paid_order

User = get_user_model()


@override_settings(**PAYMENT_SETTINGS)
class AccountBase(PaymentTestBase):
    def setUp(self):
        super().setUp()
        patch('bryo.mailer.send_email').start()
        self.boss = User.objects.create_user(email='boss@byro.test')
        AdminMember.objects.create(email='boss@byro.test', role='owner', added_by_email='test')
        self.admin = User.objects.create_user(email='admin@byro.test')
        AdminMember.objects.create(email='admin@byro.test', role='admin', added_by_email='test')
        self.viewer = User.objects.create_user(email='viewer@byro.test')
        AdminMember.objects.create(email='viewer@byro.test', role='viewer', added_by_email='test')
        self.fan = User.objects.create_user(email='Fan@Example.com')
        UserProfile.objects.filter(user=self.fan).update(display_name='Ada Fan', handle='adafan', bio='Hi', is_public=True)
        Follow.objects.create(follower=self.fan, following=self.owner)
        self.client.force_authenticate(self.boss)

    def delete(self, user, confirm=None, who=None):
        self.client.force_authenticate(who or self.boss)
        return self.client.post(f'/api/admin/users/{user.pk}/delete/',
                                {'confirm_email': user.email if confirm is None else confirm}, format='json')


class SummaryTests(AccountBase):

    def test_everyone_on_the_team_can_see_a_person(self):
        order = paid_order(self.event)
        order.__class__.objects.filter(pk=order.pk).update(customer_email='fan@example.com')
        self.client.force_authenticate(self.viewer)
        data = self.client.get(f'/api/admin/users/{self.fan.pk}/').json()
        self.assertEqual(data['profile']['handle'], 'adafan')
        self.assertEqual(data['following'], 1)
        self.assertEqual(data['spent']['orders'], 1)

    def test_an_organisers_summary_lists_events_and_why_they_cannot_be_deleted(self):
        paid_order(self.event)
        data = self.client.get(f'/api/admin/users/{self.owner.pk}/').json()
        self.assertEqual(data['events_total'], 1)
        self.assertEqual(data['followers'], 1)
        self.assertTrue(data['delete_blockers'])

    def test_strangers_are_refused(self):
        self.client.force_authenticate(self.fan)
        self.assertEqual(self.client.get(f'/api/admin/users/{self.owner.pk}/').status_code, 403)


class DeleteTests(AccountBase):

    def test_only_owners_can_delete_and_must_type_the_email(self):
        self.assertEqual(self.delete(self.fan, who=self.admin).status_code, 403)
        self.assertEqual(self.delete(self.fan, confirm='wrong@example.com').status_code, 400)
        self.assertEqual(self.delete(self.boss).status_code, 400)  # not yourself
        self.fan.refresh_from_db()
        self.assertTrue(self.fan.is_active)

    def test_deleting_removes_personal_details_but_keeps_records(self):
        t = ticket(self.event, email='fan@example.com', name='Ada Fan')
        record_stamp(t)
        order = paid_order(self.event)
        order.__class__.objects.filter(pk=order.pk).update(customer_email='fan@example.com')
        MerchItem.objects.create(owner=self.fan, name='Tee', price=1000)
        ActivityLog.objects.create(user=self.fan, actor_email='fan@example.com', action='auth.sign_in')

        res = self.delete(self.fan, confirm='fan@example.com')  # any case
        self.assertEqual(res.status_code, 200)

        self.fan.refresh_from_db()
        self.assertFalse(self.fan.is_active)
        self.assertTrue(self.fan.email.endswith('@deleted.usebyro.com'))
        self.assertIsNone(self.fan.workos_id)
        p = UserProfile.objects.get(user=self.fan)
        self.assertEqual((p.display_name, p.handle, p.bio, p.is_public), ('Deleted user', None, '', False))
        self.assertFalse(Follow.objects.filter(follower=self.fan).exists())
        self.assertFalse(MerchItem.objects.filter(owner=self.fan).exists())
        t.refresh_from_db()
        self.assertEqual((t.current_owner_name, t.current_owner_email), ('Deleted user', self.fan.email))
        self.assertFalse(Stamp.objects.filter(email='fan@example.com').exists())
        self.assertFalse(ActivityLog.objects.filter(actor_email__iexact='fan@example.com').exists())
        # The payment stays for Byro's financial records.
        order.refresh_from_db()
        self.assertEqual(order.status, 'successful')
        self.assertTrue(AdminAction.objects.filter(action=AdminAction.ACTION_USER_DELETED).exists())
        # Twice is refused
        self.assertEqual(self.delete(self.fan).status_code, 400)

    def test_cannot_delete_an_organiser_with_upcoming_sold_events_or_money_owed(self):
        paid_order(self.event)
        res = self.delete(self.owner)
        self.assertEqual(res.status_code, 400)
        self.assertTrue(any('upcoming events' in b for b in res.json()['blockers']))
        self.assertTrue(any('owes them money' in b for b in res.json()['blockers']))
        self.owner.refresh_from_db()
        self.assertTrue(self.owner.is_active)

    def test_cannot_delete_with_a_pending_payout_or_a_team_member(self):
        PayoutRequest.objects.create(user=self.fan, amount=100, method='bank', bank_name='X',
                                     account_number='1', account_name='Ada')
        self.assertIn('payout', self.delete(self.fan).json()['error'])
        PayoutRequest.objects.all().delete()
        AdminMember.objects.create(email='fan@example.com', role='viewer', added_by_email='test')
        self.assertIn('admin team', self.delete(self.fan).json()['error'])

    def test_an_organiser_whose_events_are_over_can_be_deleted_and_events_come_down(self):
        old = make_event(self.fan, name='Old meetup')
        Event.objects.filter(pk=old.pk).update(day=timezone.localdate() - datetime.timedelta(days=30))
        res = self.delete(self.fan)
        self.assertEqual(res.status_code, 200, res.json())
        old.refresh_from_db()
        self.assertFalse(old.is_active)
        self.assertEqual(old.hosted_by, 'Deleted organiser')
