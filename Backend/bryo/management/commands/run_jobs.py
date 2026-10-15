"""
Every background job in one command, for a single scheduled service (Railway cron, every 5 minutes):

    python manage.py run_jobs

- send_scheduled_messages: organiser messages whose send time has come
- process_refunds: finish refunds an admin approved
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
    help = 'Run scheduled messages, refunds and (from 09:00 Lagos) event reminders. Schedule every 5 minutes.'

    def handle(self, *args, **options):
        jobs = ['send_scheduled_messages', 'process_refunds']
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
