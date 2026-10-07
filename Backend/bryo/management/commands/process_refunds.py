"""Finish sending refunds for cancelled events.

    python manage.py process_refunds            # a batch for every cancelled event with work left
    python manage.py process_refunds --retry-failed

A cancellation records what is owed straight away but sends the money in small
batches. The dashboard keeps going while the organiser has it open; run this on
a schedule (every few minutes) so nothing is left behind when they close it.
"""
from django.core.management.base import BaseCommand

from bryo.models import Event, Refund
from bryo.refunds import process_event_refunds


class Command(BaseCommand):
    help = "Send pending refunds for cancelled events."

    def add_arguments(self, parser):
        parser.add_argument("--retry-failed", action="store_true", help="Also retry refunds that failed")
        parser.add_argument("--rounds", type=int, default=20, help="Batches per event this run (default 20)")

    def handle(self, *args, retry_failed=False, rounds=20, **opts):
        events = Event.objects.filter(cancelled_at__isnull=False).distinct()
        total = 0
        for event in events:
            retry = retry_failed  # reset an event's failures once, not on every round
            for _ in range(rounds):
                progress = process_event_refunds(event, retry_failed=retry)
                retry = False
                total += 1
                if progress["done"]:
                    break
            self.stdout.write(
                f"{event.name}: {progress['processed']} processed, {progress['processing']} processing, "
                f"{progress['waiting']} waiting, {progress['failed']} need attention"
            )
        if not total:
            self.stdout.write("No cancelled events.")
