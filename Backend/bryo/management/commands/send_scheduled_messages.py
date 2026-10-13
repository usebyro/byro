"""
Send organiser messages that were scheduled for later (Dashboard > Messages > Schedule).

Run it every few minutes from the same scheduler as the other jobs, e.g. every 5 minutes:

    python manage.py send_scheduled_messages

Safe to run often or twice at once: each message is claimed before it is sent.
"""
from django.core.management.base import BaseCommand

from bryo.messaging import send_due


class Command(BaseCommand):
    help = "Send scheduled community messages whose time has come."

    def handle(self, *args, **opts):
        sent = send_due()
        self.stdout.write(self.style.SUCCESS(f"Sent {sent} scheduled message(s)."))
