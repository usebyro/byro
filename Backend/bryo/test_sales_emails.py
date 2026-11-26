"""Sale emails to organisers: every sale, the 8 AM summary, and who gets what."""
import datetime
from decimal import Decimal
from unittest.mock import patch
from zoneinfo import ZoneInfo

from django.contrib.auth import get_user_model
from django.core.management import call_command

from .models import EventCoHost, Payment, TicketTier, UserProfile
from .notifications import ticket_sale
from .sales_emails import MAX_SUMMARY_ROWS, send_daily_summaries, send_sale_emails
from .test_payments import PaymentTestBase, make_event, make_payment
from .test_refunds import paid_order

User = get_user_model()
LAGOS = ZoneInfo('Africa/Lagos')


class SalesBase(PaymentTestBase):
    def setUp(self):
        super().setUp()
        self.mail = patch('bryo.mailer.send_email').start()
        self.cohost = User.objects.create_user(email='cohost@example.com')
        self.door = User.objects.create_user(email='door@example.com')
        EventCoHost.objects.create(event=self.event, user=self.cohost, added_by=self.owner,
                                   status=EventCoHost.STATUS_ACCEPTED, role='manager')
        EventCoHost.objects.create(event=self.event, user=self.door, added_by=self.owner,
                                   status=EventCoHost.STATUS_ACCEPTED, role='checkin')

    def mode(self, user, mode):
        UserProfile.objects.filter(user=user).update(sale_email_mode=mode)

    def sent_to(self):
        return {c.args[0]: c.args for c in self.mail.call_args_list}


class EverySaleTests(SalesBase):

    def sale(self, seats=2, name='Ada Obi'):
        payment = paid_order(self.event, subtotal='5000.00', fee='250.00', seats=seats)
        Payment.objects.filter(pk=payment.pk).update(customer_name=name)
        return Payment.objects.get(pk=payment.pk)

    def test_the_owner_and_a_co_host_get_it_and_door_staff_do_not(self):
        payment = self.sale()
        send_sale_emails(self.event.pk, [], payment.pk)
        got = self.sent_to()
        self.assertEqual(set(got), {'owner@example.com', 'cohost@example.com'})
        subject = got['owner@example.com'][1]
        self.assertEqual(subject, f'Ada Obi bought 2 tickets for {self.event.name}')

    def test_only_the_owner_sees_what_they_earn(self):
        payment = self.sale()
        send_sale_emails(self.event.pk, [], payment.pk)
        got = self.sent_to()
        self.assertIn('You earn', got['owner@example.com'][2])
        self.assertNotIn('You earn', got['cohost@example.com'][2])

    def test_the_money_is_what_the_owner_earns_never_the_charge_with_byros_fee(self):
        payment = self.sale()  # what the buyer was charged (payment.amount) has Byro's fee in it
        self.assertEqual(payment.amount, Decimal('5250.00'))
        send_sale_emails(self.event.pk, [], payment.pk)
        html = self.sent_to()['owner@example.com'][2]
        self.assertIn('₦10,000', html)  # two tickets at ₦5,000
        self.assertNotIn('₦5,250', html)
        self.assertNotIn('Paid', html)

    def test_when_the_organiser_carries_the_fee_they_earn_less_than_the_ticket_price(self):
        self.event.pass_fee_to_attendee = False
        self.event.save()
        payment = paid_order(self.event, subtotal='5000.00', fee='250.00', seats=1)
        send_sale_emails(self.event.pk, [], payment.pk)
        self.assertIn('₦4,750', self.sent_to()['owner@example.com'][2])

    def test_the_email_shows_the_tickets_and_progress(self):
        tier = TicketTier.objects.create(event=self.event, name='VIP', price=Decimal('5000'), capacity=50)
        payment = make_payment(self.event, reference='EVT-vip-1', tier=tier, seats=2)
        from .views import _fulfil_payment
        _fulfil_payment(payment, None)
        send_sale_emails(self.event.pk, [], payment.pk)
        html = self.sent_to()['owner@example.com'][2]
        self.assertIn('VIP', html)
        self.assertIn('of 100 sold', html)

    def test_daily_and_off_do_not_get_the_instant_email(self):
        self.mode(self.owner, 'daily')
        self.mode(self.cohost, 'off')
        send_sale_emails(self.event.pk, [], self.sale().pk)
        self.mail.assert_not_called()

    def test_a_free_claim_has_no_money_lines(self):
        from .test_checkin import ticket
        t = ticket(self.event, email='fan@example.com')
        t.original_owner_name = 'Tunde Bello'
        t.save()
        send_sale_emails(self.event.pk, [t.pk], None, buyer='Tunde Bello')
        subject, html = self.sent_to()['owner@example.com'][1:3]
        self.assertEqual(subject, f'Tunde Bello claimed 1 free ticket for {self.event.name}')
        self.assertNotIn('You earn', html)
        self.assertNotIn('Paid', html)

    def test_the_last_ticket_says_sold_out(self):
        self.event.capacity = 2
        self.event.save()
        send_sale_emails(self.event.pk, [], self.sale(seats=2).pk)
        self.assertIn('SOLD OUT', self.sent_to()['owner@example.com'][2])

    def test_a_mail_failure_never_raises(self):
        self.mail.side_effect = RuntimeError('down')
        payment = self.sale()
        self.assertEqual(send_sale_emails(self.event.pk, [], payment.pk), 0)

    def test_completing_an_order_queues_the_email_after_commit(self):
        payment = self.sale()
        self.mail.reset_mock()
        with patch('bryo.services.zoho.run_in_background', side_effect=lambda fn, *a: fn(*a)), \
                self.captureOnCommitCallbacks(execute=True):
            ticket_sale(self.event, 2, paid_amount=payment.amount, payment=payment)
        self.assertEqual(set(self.sent_to()), {'owner@example.com', 'cohost@example.com'})


class DailySummaryTests(SalesBase):

    def setUp(self):
        super().setUp()
        self.mode(self.owner, 'daily')
        self.mode(self.cohost, 'daily')

    def order_yesterday(self, seats=1, name='Ada Obi', ref='EVT-d-1'):
        payment = paid_order(self.event, subtotal='5000.00', fee='250.00', seats=seats)
        Payment.objects.filter(pk=payment.pk).update(customer_name=name)
        return Payment.objects.get(pk=payment.pk)

    def morning_after(self, payment, hour=9):
        day = payment.paid_at.astimezone(LAGOS).date() + datetime.timedelta(days=1)
        return datetime.datetime.combine(day, datetime.time(hour, 0), tzinfo=LAGOS)

    def test_it_goes_at_eight_not_before(self):
        payment = self.order_yesterday()
        self.assertEqual(send_daily_summaries(now=self.morning_after(payment, hour=7)), 0)
        self.assertEqual(send_daily_summaries(now=self.morning_after(payment, hour=8)), 2)

    def test_the_owner_sees_amounts_and_a_co_host_does_not(self):
        payment = self.order_yesterday(seats=2)
        send_daily_summaries(now=self.morning_after(payment))
        got = self.sent_to()
        self.assertEqual(got['owner@example.com'][1], '2 tickets sold yesterday')
        self.assertIn('Ada Obi', got['owner@example.com'][2])
        self.assertIn('₦10,000', got['owner@example.com'][2])  # two tickets at ₦5,000
        self.assertNotIn('₦5,250', got['owner@example.com'][2])  # never the buyer's charge, which has Byro's fee in it
        self.assertNotIn('₦', got['cohost@example.com'][2])
        self.assertNotIn('door@example.com', got)

    def test_once_a_day_only(self):
        payment = self.order_yesterday()
        now = self.morning_after(payment)
        self.assertEqual(send_daily_summaries(now=now), 2)
        self.assertEqual(send_daily_summaries(now=now + datetime.timedelta(minutes=5)), 0)

    def test_a_day_with_no_sales_sends_nothing(self):
        payment = self.order_yesterday()
        two_days_on = self.morning_after(payment) + datetime.timedelta(days=1)
        self.assertEqual(send_daily_summaries(now=two_days_on), 0)
        self.mail.assert_not_called()

    def test_people_on_every_sale_or_off_are_left_out(self):
        payment = self.order_yesterday()
        self.mode(self.owner, 'every')
        self.mode(self.cohost, 'off')
        self.assertEqual(send_daily_summaries(now=self.morning_after(payment)), 0)

    def test_their_own_time_zone_decides_when_it_is_eight(self):
        payment = self.order_yesterday()
        UserProfile.objects.filter(user=self.owner).update(timezone='Europe/London')
        now = self.morning_after(payment, hour=9).astimezone(ZoneInfo('UTC'))  # 08:00 in London in winter
        sent = send_daily_summaries(now=now)
        self.assertGreaterEqual(sent, 1)

    def test_long_days_are_cut_off_with_a_count(self):
        payment = None
        for n in range(MAX_SUMMARY_ROWS + 3):
            payment = paid_order(self.event, subtotal='5000.00', fee='250.00', seats=1)
        send_daily_summaries(now=self.morning_after(payment))
        html = self.sent_to()['owner@example.com'][2]
        self.assertIn('+ 3 more orders', html)

    def test_a_send_failure_is_retried_on_the_next_run(self):
        payment = self.order_yesterday()
        now = self.morning_after(payment)
        self.mail.side_effect = RuntimeError('down')
        self.assertEqual(send_daily_summaries(now=now), 0)
        self.mail.side_effect = None
        self.assertEqual(send_daily_summaries(now=now + datetime.timedelta(minutes=5)), 2)

    def test_the_command_runs_and_run_jobs_includes_it(self):
        from io import StringIO
        out = StringIO()
        call_command('send_sales_summaries', stdout=out)
        self.assertIn('daily sales summary', out.getvalue())
        from .test_run_jobs import RunJobsTests  # noqa: F401  (its expectations list the job)


class CatchupTests(SalesBase):

    def run_it(self, *args):
        from io import StringIO
        out = StringIO()
        with patch('bryo.management.commands.send_sales_catchup.clock.sleep'), \
                patch('bryo.management.commands.send_sales_catchup.send_email', self.mail):
            call_command('send_sales_catchup', *args, stdout=out)
        return out.getvalue()

    def test_it_needs_to_be_told_who_and_never_goes_to_everyone(self):
        from django.core.management.base import CommandError
        with self.assertRaises(CommandError):
            self.run_it()
        with self.assertRaises(CommandError):
            self.run_it('--all')

    def test_a_dry_run_counts_and_sends_nothing(self):
        paid_order(self.event, subtotal='5000.00', fee='250.00', seats=2)
        out = self.run_it('--email', 'owner@example.com')
        self.assertIn('1 with sales to report', out)
        self.assertIn('Dry run', out)
        self.mail.assert_not_called()

    def test_apply_sends_the_so_far_summary_to_the_person(self):
        paid_order(self.event, subtotal='5000.00', fee='250.00', seats=2)
        self.run_it('--email', 'owner@example.com', '--apply')
        self.assertEqual(self.mail.call_count, 1)
        to, subject, html = self.mail.call_args.args[:3]
        self.assertEqual(to, 'owner@example.com')
        self.assertEqual(subject, '2 tickets sold so far')
        self.assertIn('since', html)
        self.assertIn('₦10,000', html)
        self.assertNotIn('₦5,250', html)

    def test_someone_with_no_sales_gets_nothing(self):
        out = self.run_it('--email', 'cohost@example.com', '--apply')
        self.assertIn('0 with sales to report', out)
        self.mail.assert_not_called()

    def test_people_who_turned_sale_emails_off_are_skipped(self):
        paid_order(self.event, subtotal='5000.00', fee='250.00', seats=1)
        self.mode(self.owner, 'off')
        self.run_it('--email', 'owner@example.com', '--apply')
        self.mail.assert_not_called()

    def test_a_co_host_is_sent_it_without_the_money(self):
        paid_order(self.event, subtotal='5000.00', fee='250.00', seats=1)
        self.run_it('--email', 'cohost@example.com', '--apply')
        html = self.mail.call_args.args[2]
        self.assertNotIn('₦', html)

    def test_sales_before_the_start_date_are_left_out(self):
        paid_order(self.event, subtotal='5000.00', fee='250.00', seats=1)
        tomorrow = (datetime.date.today() + datetime.timedelta(days=2)).isoformat()
        out = self.run_it('--email', 'owner@example.com', '--since', tomorrow, '--apply')
        self.assertIn('0 with sales to report', out)

    def test_a_bad_date_is_refused(self):
        from django.core.management.base import CommandError
        with self.assertRaises(CommandError):
            self.run_it('--email', 'owner@example.com', '--since', 'last week')
