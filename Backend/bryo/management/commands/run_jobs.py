"""
Every background job in one command, for a single scheduled service (Railway cron, every 5 minutes):

    python manage.py run_jobs

- send_scheduled_messages: organiser messages whose send time has come
- process_refunds: finish refunds an admin approved
- process_merch_orders: free held merch stock, tell organisers when merch money becomes available, remind
  them about orders they have not started (10 days), cancel and refund those left 14 days, retry stuck merch refunds.
  Safe to run every time: each order is reminded and announced once.
- send_abandoned_checkout_reminders: one "finish my order" email to buyers who left a payment unfinished
  for 3 hours, and mark payments left pending for 24 hours as abandoned. Each payment is emailed once.
- send_sales_summaries: the 8 AM daily sales summary for organisers who chose it in Settings (once a day each,
  from 8 AM in their own time zone).
- send_event_reminders: the day-before emails, from 09:00 Lagos time. Each event is only
  reminded once (Event.reminder_sent_at), so the first run after 09:00 sends and later runs skip.

Each job runs on its own: one failing is logged and the others still run. The command exits
non-zero if any failed, so the host shows the run as failed.
"""
import logging
from datetime import datetime
from zoneinfo import ZoneInfo

from django.core.management import call_command
from django.core.management.base import BaseCommand, CommandError

logger = logging.getLogger(__name__)

LAGOS = ZoneInfo('Africa/Lagos')
REMINDERS_FROM_HOUR = 9


class Command(BaseCommand):
    help = 'Run scheduled messages, refunds, merch orders and (from 09:00 Lagos) event reminders. Schedule every 5 minutes.'

    def handle(self, *args, **options):
        jobs = ['send_scheduled_messages', 'process_refunds', 'process_merch_orders', 'send_abandoned_checkout_reminders',
                'send_sales_summaries']
        if datetime.now(LAGOS).hour >= REMINDERS_FROM_HOUR:
            jobs.append('send_event_reminders')

        failed = []
        for job in jobs:
            try:
                call_command(job, stdout=self.stdout, stderr=self.stderr)
            except Exception:
                logger.exception('Scheduled job %s failed', job)
                failed.append(job)
        if failed:
            raise CommandError(f"Failed: {', '.join(failed)}")
        self.stdout.write(f"Ran: {', '.join(jobs)}")
