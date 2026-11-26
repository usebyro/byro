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
