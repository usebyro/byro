"""
A one-off "here is what sold" email for an organiser who missed sales made before the sale emails started.

It lists everything sold since a date (default: the last 7 days) for the events that person can see, in the same
short format as the daily summary. Someone with nothing sold, or who turned sale emails Off, gets nothing.
You have to name who: it never goes to everyone. A dry run unless you pass --apply, and it prints counts only.

    python manage.py send_sales_catchup --email organiser@example.com            # dry run
    python manage.py send_sales_catchup --email organiser@example.com --apply
    python manage.py send_sales_catchup --email organiser@example.com --since 2026-11-20 --apply
"""
import time as clock
from datetime import datetime, time, timedelta

from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from bryo.mailer import send_email
from bryo.sales_emails import _tz, catchup_recipients, summary_mail


class Command(BaseCommand):
    help = "Email organisers a summary of sales since a date (dry run unless --apply)."

    def add_arguments(self, parser):
        parser.add_argument('--email', action='append', default=[], required=True, help="Who to send it to (repeat for a few people).")
        parser.add_argument('--since', help="First day to include, YYYY-MM-DD (default: 7 days ago).")
        parser.add_argument('--apply', action='store_true', help="Actually send. Without it, only counts are printed.")
        parser.add_argument('--delay', type=float, default=0.3, help="Seconds between emails (default 0.3).")

    def handle(self, *args, **opts):
        now = timezone.now()
        try:
            since = datetime.strptime(opts['since'], '%Y-%m-%d').date() if opts['since'] else None
        except ValueError:
            raise CommandError("--since must look like 2026-11-20.")

        people = catchup_recipients(opts['email'])
        would = sent = failed = 0
        for profile in people:
            tz = _tz(profile)
            first = since or (now.astimezone(tz).date() - timedelta(days=7))
            start = datetime.combine(first, time.min, tzinfo=tz)
            label = f"{first:%a}, {first.day} {first:%b}"
            mail = summary_mail(profile.user, start, now, tz, when='so far', on='since', label=label)
            if mail is None:
                continue
            would += 1
            if not opts['apply']:
                continue
            try:
                send_email(profile.user.email, mail['subject'], mail['html'], mail['text'])
                sent += 1
            except Exception:
                failed += 1
            clock.sleep(opts['delay'])

        self.stdout.write(f"{len(people)} possible recipient(s); {would} with sales to report.")
        if opts['apply']:
            self.stdout.write(f"Sent {sent}; failed {failed}.")
        else:
            self.stdout.write("Dry run: nothing was sent. Add --apply to send.")
