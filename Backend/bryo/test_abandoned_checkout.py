"""The "finish my order" email for unfinished checkouts, and marking day-old pending payments abandoned."""
from datetime import timedelta
from decimal import Decimal
from io import StringIO
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.utils import timezone

from .models import Payment, TicketTier, UserProfile
from .test_payments import PaymentTestBase, make_event, make_payment

User = get_user_model()


class AbandonedCheckoutTests(PaymentTestBase):

    def setUp(self):
        super().setUp()
        self.sent = patch('bryo.mailer.send_email').start()
        # Nothing is paid at the provider unless a test says so.
        patch('bryo.views._paystack_transaction', return_value=({'status': 'abandoned'}, None)).start()

    def pending(self, hours=4, **kw):
        payment = make_payment(self.event, **kw)
        Payment.objects.filter(pk=payment.pk).update(created_at=timezone.now() - timedelta(hours=hours))
        return Payment.objects.get(pk=payment.pk)

    def run_job(self, *args):
        out = StringIO()
        call_command('send_abandoned_checkout_reminders', *args, stdout=out)
        return out.getvalue()

    def test_a_payment_left_for_three_hours_gets_one_email_with_a_prefilled_link(self):
        tier = TicketTier.objects.create(event=self.event, name='Regular', price=Decimal('5000'), capacity=50)
        payment = self.pending(hours=4, tier=tier)
        self.run_job()
        self.sent.assert_called_once()
        to, subject, html, text = self.sent.call_args.args[:4]
        self.assertEqual(to, 'buyer@example.com')
        self.assertIn(self.event.name, subject)
        self.assertIn(f'?tier={tier.id}&qty=2', html)
        self.assertIn('Regular', html)
        payment.refresh_from_db()
        self.assertIsNotNone(payment.reminder_sent_at)

    def test_it_is_only_ever_sent_once(self):
        self.pending()
        self.run_job()
        self.run_job()
        self.assertEqual(self.sent.call_count, 1)

    def test_too_early_means_no_email(self):
        self.pending(hours=1)
        self.run_job()
        self.sent.assert_not_called()

    def test_someone_who_since_paid_is_skipped(self):
        self.pending()
        paid = make_payment(self.event, reference='EVT-paid-1', seats=1)
        Payment.objects.filter(pk=paid.pk).update(status='successful')
        self.run_job()
        self.sent.assert_not_called()

    def test_someone_who_unsubscribed_is_skipped(self):
        user = User.objects.create_user(email='buyer@example.com')
        UserProfile.objects.filter(user=user).update(newsletter_subscribed=False)
        self.pending()
        self.run_job()
        self.sent.assert_not_called()

    def test_closed_cancelled_and_past_events_are_skipped(self):
        for change in ({'sales_closed': True}, {'cancelled_at': timezone.now()},
                       {'day': timezone.now().date() - timedelta(days=2)}):
            self.sent.reset_mock()
            Payment.objects.all().delete()
            event = make_event(self.owner, name='Other')
            for k, v in change.items():
                setattr(event, k, v)
            event.save()
            payment = make_payment(event, reference=f'EVT-x-{len(change)}-{list(change)[0]}')
            Payment.objects.filter(pk=payment.pk).update(created_at=timezone.now() - timedelta(hours=4))
            self.run_job()
            self.sent.assert_not_called()

    def test_a_sold_out_tier_is_skipped(self):
        tier = TicketTier.objects.create(event=self.event, name='Tiny', price=Decimal('5000'), capacity=1)
        self.pending(tier=tier)  # wants 2, only 1 exists
        self.run_job()
        self.sent.assert_not_called()

    def test_an_email_failure_does_not_stop_the_job_and_is_retried_next_run(self):
        payment = self.pending()
        self.sent.side_effect = RuntimeError('mail down')
        self.run_job()
        payment.refresh_from_db()
        self.assertIsNone(payment.reminder_sent_at)
        self.sent.side_effect = None
        self.run_job()
        self.assertEqual(self.sent.call_count, 2)
        payment.refresh_from_db()
        self.assertIsNotNone(payment.reminder_sent_at)

    def test_day_old_pending_payments_become_abandoned_and_fresh_ones_stay(self):
        old = self.pending(hours=30)
        fresh = make_payment(self.event, reference='EVT-fresh-1')
        self.run_job()
        old.refresh_from_db()
        fresh.refresh_from_db()
        self.assertEqual(old.status, 'abandoned')
        self.assertEqual(fresh.status, 'pending')
        self.sent.assert_not_called()  # past the window: too late for a nudge

    def test_a_late_payment_still_goes_through_after_it_was_marked_abandoned(self):
        from .views import _fulfil_payment
        old = self.pending(hours=30)
        self.run_job()
        _fulfil_payment(Payment.objects.get(pk=old.pk), None)
        old.refresh_from_db()
        self.assertEqual(old.status, 'successful')
        self.assertEqual(old.tickets_purchased.count(), 2)

    def test_dry_run_sends_and_changes_nothing(self):
        payment = self.pending()
        old = self.pending(hours=30, reference='EVT-old-1')
        out = self.run_job('--dry-run')
        self.assertIn('Would send 1', out)
        self.sent.assert_not_called()
        payment.refresh_from_db(); old.refresh_from_db()
        self.assertIsNone(payment.reminder_sent_at)
        self.assertEqual(old.status, 'pending')


class PaidButStillPendingTests(PaymentTestBase):
    """Buyers who paid at the provider but whose payment we never completed (missed webhook)."""

    def setUp(self):
        super().setUp()
        self.sent = patch('bryo.mailer.send_email').start()

    def stuck(self, hours=4, checkout_id='chk_paid', **kw):
        payment = make_payment(self.event, provider='bachs', **kw)
        Payment.objects.filter(pk=payment.pk).update(
            created_at=timezone.now() - timedelta(hours=hours), bachs_checkout_id=checkout_id)
        return Payment.objects.get(pk=payment.pk)

    def provider(self, payment, unpaid_ids=()):
        """Bachs says paid, except for the checkout ids listed."""
        from .test_bachs import FakeBachs
        from .views import _charge_amount
        amount = str(_charge_amount(payment))

        def checkout(cid):
            if cid in unpaid_ids:
                return FakeBachs(amount=amount, checkout_status='open', payment_status='pending').checkout(cid)
            return FakeBachs(amount=amount).checkout(cid)
        return patch('bryo.views.bachs.fetch_checkout', side_effect=checkout)

    def run_cmd(self, name, *args):
        out = StringIO()
        call_command(name, *args, stdout=out)
        return out.getvalue()

    def test_reminder_job_issues_tickets_instead_of_emailing_a_buyer_who_paid(self):
        payment = self.stuck()
        with self.provider(payment):
            self.run_cmd('send_abandoned_checkout_reminders')
        payment.refresh_from_db()
        self.assertEqual(payment.status, 'successful')
        self.assertEqual(payment.tickets_purchased.count(), 2)
        subjects = [c.args[1] for c in self.sent.call_args_list]
        self.assertFalse(any('finish' in x.lower() for x in subjects), subjects)

    def test_a_paid_payment_is_not_marked_abandoned_after_a_day(self):
        payment = self.stuck(hours=30)
        with self.provider(payment):
            self.run_cmd('send_abandoned_checkout_reminders')
        payment.refresh_from_db()
        self.assertEqual(payment.status, 'successful')

    def test_a_payment_the_provider_cannot_confirm_is_left_pending_not_abandoned(self):
        from .bachs import BachsUnavailable
        payment = self.stuck(hours=30)
        with patch('bryo.views.bachs.fetch_checkout', side_effect=BachsUnavailable('down')):
            self.run_cmd('send_abandoned_checkout_reminders')
        payment.refresh_from_db()
        self.assertEqual(payment.status, 'pending')

    def test_unpaid_at_the_provider_is_still_abandoned(self):
        payment = self.stuck(hours=30)
        with self.provider(payment, unpaid_ids=['chk_paid']):
            self.run_cmd('send_abandoned_checkout_reminders')
        payment.refresh_from_db()
        self.assertEqual(payment.status, 'abandoned')

    def test_reconcile_completes_paid_payments_and_leaves_unpaid_ones(self):
        paid = self.stuck(hours=1, reference='EVT-paid-aaaa')
        unpaid = self.stuck(hours=1, reference='EVT-open-bbbb', checkout_id='chk_open')
        with self.provider(paid, unpaid_ids=['chk_open']):
            out = self.run_cmd('reconcile_pending_payments')
        paid.refresh_from_db(); unpaid.refresh_from_db()
        self.assertEqual(paid.status, 'successful')
        self.assertEqual(paid.tickets_purchased.count(), 2)
        self.assertEqual(unpaid.status, 'pending')
        self.assertIn('1 paid at the provider', out)

    def test_reconcile_skips_payments_younger_than_ten_minutes(self):
        payment = self.stuck(hours=0)
        with self.provider(payment) as fetch:
            self.run_cmd('reconcile_pending_payments')
        fetch.assert_not_called()

    def test_reconcile_can_rescue_abandoned_payments_and_dry_run_changes_nothing(self):
        payment = self.stuck(hours=30)
        Payment.objects.filter(pk=payment.pk).update(status='abandoned')
        with self.provider(payment):
            out = self.run_cmd('reconcile_pending_payments', '--include-abandoned', '--dry-run')
            payment.refresh_from_db()
            self.assertEqual(payment.status, 'abandoned')
            self.assertIn('Would complete', out)
            self.run_cmd('reconcile_pending_payments', '--include-abandoned')
        payment.refresh_from_db()
        self.assertEqual(payment.status, 'successful')
        self.assertEqual(payment.tickets_purchased.count(), 2)

    def test_admins_are_notified_when_a_paid_order_is_recovered(self):
        from .models import AdminMember, Notification
        User.objects.create_user(email='boss@example.com')
        AdminMember.objects.create(email='boss@example.com', role=AdminMember.ROLE_ADMIN)
        payment = self.stuck(hours=1)
        with self.provider(payment):
            self.run_cmd('reconcile_pending_payments')
        n = Notification.objects.get(kind='payment_recovered', audience='admin')
        self.assertEqual(n.link, f'/payments/{payment.pk}')
        self.assertIn('buyer@example.com', n.body)

    def test_an_amount_mismatch_alerts_admins_once_not_every_run(self):
        from .models import AdminMember, Notification
        from .test_bachs import FakeBachs
        User.objects.create_user(email='boss@example.com')
        AdminMember.objects.create(email='boss@example.com', role=AdminMember.ROLE_ADMIN)
        payment = self.stuck(hours=1)
        wrong = lambda cid: FakeBachs(amount='1.00').checkout(cid)
        with patch('bryo.views.bachs.fetch_checkout', side_effect=wrong):
            self.run_cmd('reconcile_pending_payments')
            self.run_cmd('reconcile_pending_payments')
        self.assertEqual(Notification.objects.filter(kind='payment_attention').count(), 1)
        payment.refresh_from_db()
        self.assertEqual(payment.status, 'pending')
