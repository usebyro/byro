"""
The eight transactional emails, checked against the designs: subject lines,
the copy that matters, and the few things that must never leak or break.
"""
import datetime
import io
from decimal import Decimal
from unittest.mock import patch

from django.core.management import call_command
from django.test import SimpleTestCase, TestCase
from PIL import Image

from . import emails as e
from .models import EventCoHost
from .test_payments import PaymentTestBase, make_event
from .ticket_image import generate_ticket_png

DATE, TIME = "Sun, 11 Oct 2026", "9:00 AM WAT"


class DesignTests(SimpleTestCase):

    def test_every_email_ends_with_the_designed_footer_and_logo(self):
        mails = [
            e.ticket_confirmation_email("Tunde Bello", "Tech Meetup", DATE, TIME, "Cafe One, Yaba", "abc"),
            e.event_reminder_email("Tunde", "Tech Meetup", DATE, TIME, "Cafe One, Yaba"),
            e.organizer_event_reminder_email("Sam", "Tech Meetup", DATE, TIME, 5),
            e.milestone_reached_email("Sam", "Tech Meetup", 50, 50),
            e.event_published_email("Sam", "Tech Meetup", DATE, TIME, "Cafe One", "https://x/e"),
            e.cohost_invite_email("Tech Meetup", "Sam", "https://x/e"),
            e.payout_requested_email("Sam", 200, "GTBank", "0123456789"),
            e.payout_completed_email("Sam", 200, "GTBank", "0123456789"),
        ]
        for mail in mails:
            html = mail["html"]
            self.assertIn("Create communities. Discover events. Create memories.", html)
            self.assertNotIn("byro &middot; Create communities", html)
            self.assertIn("support@usebyro.com", html)
            self.assertIn("logo-email.png", html)
            self.assertTrue(mail["text"].strip())

    def test_ticket_email(self):
        m = e.ticket_confirmation_email(
            "Tunde Bello", "Tech Meetup", DATE, TIME, "Cafe One, Yaba", "tid-1",
            tier_label="General admission × 1", bought_by="Adaeze Okafor",
        )
        self.assertEqual(m["subject"], "You're going to Tech Meetup")
        # the badge is stored as "Your ticket" and shown in capitals by the email's own styling
        for text in ("Your ticket", "You&#8217;re going, Tunde", "It&#8217;s just for you", "Your ticket is attached to this email. Show it at entry.",
                     "View ticket", "Add to calendar", "General admission × 1", "Ticket bought for you by Adaeze Okafor.",
                     "/api/tickets/tid-1/calendar/",
                     "a ticket for Tech Meetup was issued in your name"):
            self.assertIn(text, m["html"])
        self.assertIn("Your ticket is attached.", m["html"])  # inbox preview line

    def test_ticket_email_only_says_bought_for_you_when_it_was_a_gift(self):
        m = e.ticket_confirmation_email("Tunde", "Tech Meetup", DATE, TIME, "Cafe", "tid")
        self.assertNotIn("bought for you", m["html"])

    def test_reminder_email(self):
        m = e.event_reminder_email("Tunde", "Tech Meetup", DATE, TIME, "Cafe One, Yaba", tier_label="General admission × 1")
        self.assertEqual(m["subject"], "Tech Meetup is tomorrow")
        for text in ("See you tomorrow at Tech Meetup", "Quick details so you can plan your day.", "Get directions",
                     "Before you go", "Have your QR ready (a screenshot works)",
                     "Doors open on time, so arriving 10 minutes early helps", "Show my ticket",
                     "You&#8217;re getting this because you have a ticket for Tech Meetup."):
            self.assertIn(text, m["html"])
        self.assertIn("Sun, 11 Oct 2026 · 9:00 AM WAT at Cafe One, Yaba. Your ticket is inside.", m["html"])

    def test_host_reminder_email(self):
        m = e.organizer_event_reminder_email("Sam", "Tech Meetup", DATE, TIME, 5, location="Cafe One, Yaba", revenue=Decimal("200"))
        self.assertEqual(m["subject"], "Tech Meetup starts tomorrow")
        for text in ("For organisers", "Your event starts tomorrow", "tickets sold", "No cap", "₦200", "Get ready",
                     "Open the check-in scanner on your phone and test it once", "Add co-hosts who will help at the door",
                     "Share the link one more time for last-minute sales", "Open check-in", "Manage event"):
            self.assertIn(text, m["html"])
        self.assertIn("5 tickets sold so far. Here is your check-in plan.", m["html"])

    def test_host_reminder_hides_revenue_when_not_given(self):
        m = e.organizer_event_reminder_email("Co", "Tech Meetup", DATE, TIME, 5, revenue=None)
        self.assertNotIn("revenue", m["html"])

    def test_milestone_email(self):
        m = e.milestone_reached_email("Sam", "Tech Meetup", 50, 53)
        self.assertEqual(m["subject"], "50 tickets sold for Tech Meetup")
        for text in ("MILESTONE", ">50<", "tickets sold for Tech Meetup", "Your next milestone is <b>100 tickets</b>",
                     "Share event", "See sales", "Milestone emails go out at 1, 10, 25 and 50 tickets, then every 100."):
            self.assertIn(text, m["html"])
        self.assertIn("Nice work. Keep it going.", m["html"])

    def test_next_milestones_follow_the_schedule(self):
        self.assertEqual([e._next_milestone(n) for n in (1, 10, 25, 50, 100, 200)], [10, 25, 50, 100, 200, 300])

    def test_published_email(self):
        m = e.event_published_email("Sam", "Tech Meetup", DATE, TIME, "Cafe One, Yaba", "https://usebyro.com/discover/x",
                                    tickets_label="General admission · Free")
        self.assertEqual(m["subject"], "Tech Meetup is live")
        for text in ("Your event page is up and tickets are on sale.", "Share it now", "WhatsApp", "Post on X",
                     "https://wa.me/?text=", "twitter.com/intent/tweet", "General admission · Free", "View event page",
                     "Manage event", "Sharing in the first hour helps early sales", "you published an event on byro."):
            self.assertIn(text, m["html"])

    def test_cohost_email(self):
        m = e.cohost_invite_email("Tech Meetup", "Sam", "https://x/accept", is_new_user=True,
                                  date=DATE, time=TIME, location="Cafe One, Yaba")
        self.assertEqual(m["subject"], "Sam invited you to co-host Tech Meetup")
        for text in ("Invite", "As a co-host you can", "See the guest list and check people in",
                     "Edit event details and share the event", "payouts or bank details", "Accept invite",
                     "Not expecting this? Just ignore this email. Nothing changes unless you accept.",
                     "create one when you accept", "Sam added this email as a co-host"):
            self.assertIn(text, m["html"])
        self.assertNotIn("[EXPIRY]", m["html"])
        self.assertIn("Accept to help manage the event and check guests in.", m["html"])

    def test_check_in_helpers_are_not_told_they_can_edit(self):
        m = e.cohost_invite_email("Tech Meetup", "Sam", "https://x", role="checkin")
        self.assertNotIn("Edit event details", m["html"])
        self.assertIn("You won&#8217;t be able to edit the event", m["html"])

    def test_payout_requested_email(self):
        m = e.payout_requested_email("Sam", 200, "GTBank", "0123456789", event_name="Tech Meetup",
                                     requested_at="5 Oct 2026, 2:10 PM", reference="PO-7")
        self.assertEqual(m["subject"], "We got your payout request for ₦200")
        for text in ("We got your payout request", "We&#8217;re reviewing it now.", "AMOUNT", "₦200", "GTBank ••••6789",
                     "5 Oct 2026, 2:10 PM", "PO-7", "Requested", "Approved", "Usually within 24 hours", "Paid to your bank",
                     "View payouts", "Didn&#8217;t request it? Reply right away."):
            self.assertIn(text, m["html"])
        self.assertNotIn("Tech Meetup", m["html"])  # the design has no event row

    def test_payout_paid_email(self):
        m = e.payout_completed_email("Sam", 200, "GTBank", "0123456789", paid_on="6 Oct 2026", reference="PO-7")
        self.assertEqual(m["subject"], "₦200 has been paid to your bank")
        for text in ("PAID", "₦200", "is on its way to your bank", "GTBank ••••6789", "6 Oct 2026", "PO-7",
                     "Depending on your bank", "reply with the reference above", "View payouts"):
            self.assertIn(text, m["html"])

    def test_event_names_cannot_inject_html(self):
        evil = "<script>alert(1)</script>"
        for m in (
            e.ticket_confirmation_email("T", evil, DATE, TIME, evil, "x"),
            e.event_reminder_email("T", evil, DATE, TIME, evil),
            e.organizer_event_reminder_email("T", evil, DATE, TIME, 1, location=evil),
            e.milestone_reached_email("T", evil, 10, 10),
            e.event_published_email("T", evil, DATE, TIME, evil, "https://x"),
            e.cohost_invite_email(evil, evil, "https://x"),
        ):
            self.assertNotIn("<script>", m["html"])


class TicketImageTests(SimpleTestCase):

    def test_the_ticket_image_is_a_valid_png_with_the_new_card_layout(self):
        png = generate_ticket_png(
            event_name="Tech Meetup", date_str=DATE, time_str=TIME, location="Cafe One, Yaba",
            attendee_name="Tunde Bello", ticket_id="t", qr_data="00000000-0000-4000-8000-000000000001",
            tier_name="General admission", hosted_by="byro", price_label="Free", attendee_email="tunde@example.com",
        )
        img = Image.open(io.BytesIO(png))
        self.assertEqual(img.format, "PNG")
        self.assertGreater(img.height, img.width)          # a portrait card
        self.assertEqual(img.getpixel((2, 2)), (247, 249, 252))  # the #F7F9FC page behind the card

    def test_very_long_names_still_render(self):
        png = generate_ticket_png(
            event_name="A " * 80, date_str=DATE, time_str=TIME, location="V" * 200, attendee_name="N" * 200,
            ticket_id="t", qr_data="abc", tier_name="T" * 100, hosted_by="H" * 100, price_label="₦1,000,000",
            attendee_email="e" * 120 + "@example.com",
        )
        self.assertEqual(Image.open(io.BytesIO(png)).format, "PNG")


class ReminderPrivacyTests(PaymentTestBase):

    def test_co_hosts_get_the_organiser_reminder_without_the_revenue_figure(self):
        from django.contrib.auth import get_user_model
        from django.utils import timezone
        from .test_refunds import paid_order

        User = get_user_model()
        tomorrow = timezone.now().date() + datetime.timedelta(days=1)
        event = make_event(self.owner, name='Tomorrow Event', ticket_price=Decimal('5000'), capacity=100)
        event.day = tomorrow
        event.save()
        paid_order(event, subtotal='5000.00', fee='250.00', seats=1)
        helper = User.objects.create_user(email='cohost@example.com')
        EventCoHost.objects.create(
            event=event, user=helper, added_by=self.owner, status=EventCoHost.STATUS_ACCEPTED, role='manager',
        )

        sent = {}

        def capture(to, subject, html, text=None, attachments=None):
            sent.setdefault(to, []).append((subject, html))

        with patch('bryo.mailer.send_email', side_effect=capture):
            call_command('send_event_reminders')

        owner_mail = next(h for s, h in sent['owner@example.com'] if 'starts tomorrow' in s)
        helper_mail = next(h for s, h in sent['cohost@example.com'] if 'starts tomorrow' in s)
        self.assertIn('revenue', owner_mail)
        self.assertIn('₦5,000', owner_mail)
        self.assertNotIn('revenue', helper_mail)
        self.assertNotIn('₦5,000', helper_mail)
