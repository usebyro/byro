"""Send one sample of every transactional email, to check how they look.

    python manage.py send_test_emails you@example.com
    python manage.py send_test_emails --preview-dir /tmp/emails    # write HTML files, send nothing

Needs RESEND_API_KEY (or BREVO_SMTP_KEY) in the environment to actually send.
"""
from pathlib import Path

from django.core.management.base import BaseCommand

from bryo import emails
from bryo.mailer import send_email

SITE = "https://usebyro.com"


def samples():
    when = ("Sunday, October 11, 2026", "9:00 AM")
    where = "Cafe One, Yaba"
    return [
        ("ticket", emails.ticket_confirmation_email(
            "Tunde", "Tech Meetup", *when, where, "9f1c2b7e-0000-4000-8000-000000000001",
            form_answers=[{"question": "Phone number", "answer": "0801 234 5678"}],
            ticket_url=f"{SITE}/ticket/demo")),
        ("reminder", emails.event_reminder_email("Tunde", "Tech Meetup", *when, where, ticket_url=f"{SITE}/ticket/demo")),
        ("host-reminder", emails.organizer_event_reminder_email("Sam", "Tech Meetup", *when, 5, dashboard_url=f"{SITE}/dashboard")),
        ("milestone", emails.milestone_reached_email("Sam", "Tech Meetup", 50, 50, dashboard_url=f"{SITE}/dashboard")),
        ("published", emails.event_published_email("Sam", "Tech Meetup", *when, where, f"{SITE}/discover/tech-meetup")),
        ("cohost", emails.cohost_invite_email("Tech Meetup", "Sam", f"{SITE}/discover/tech-meetup",
                                              is_new_user=True, invitee_email="friend@example.com")),
        ("payout-requested", emails.payout_requested_email("Sam", 200, "GTBank", "0123456789", event_name="Tech Meetup")),
        ("payout-paid", emails.payout_completed_email("Sam", 200, "GTBank", "0123456789", event_name="Tech Meetup")),
    ]


class Command(BaseCommand):
    help = "Send (or write to disk) one sample of every transactional email."

    def add_arguments(self, parser):
        parser.add_argument("to", nargs="?", help="Address to send the samples to")
        parser.add_argument("--preview-dir", help="Write each email as an HTML file here instead of sending")

    def handle(self, *args, to=None, preview_dir=None, **opts):
        if not to and not preview_dir:
            self.stderr.write("Give an address to send to, or --preview-dir.")
            return
        if preview_dir:
            out = Path(preview_dir)
            out.mkdir(parents=True, exist_ok=True)
        for name, mail in samples():
            if preview_dir:
                (out / f"{name}.html").write_text(mail["html"])
                self.stdout.write(f"wrote {out / f'{name}.html'}")
            else:
                send_email(to, f"[Test] {mail['subject']}", mail["html"], mail.get("text"))
                self.stdout.write(f"sent {name}: {mail['subject']}")
