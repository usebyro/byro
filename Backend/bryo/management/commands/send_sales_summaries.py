"""
The daily sales summary email, for organisers and co-hosts who chose "Daily summary" in Settings.

Each person gets one at 8 AM in their own time zone, covering yesterday, and only on days with sales.
Safe to run every few minutes: each person is claimed once per day.

    python manage.py send_sales_summaries
"""
from django.core.management.base import BaseCommand

from bryo.sales_emails import send_daily_summaries


class Command(BaseCommand):
    help = "Send the 8 AM daily sales summaries."

    def handle(self, *args, **options):
        self.stdout.write(f"Sent {send_daily_summaries()} daily sales summary email(s).")
