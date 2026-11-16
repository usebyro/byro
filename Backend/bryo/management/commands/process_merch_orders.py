"""
Time-based merch work. Run it on a cron, for example every hour:

    python manage.py process_merch_orders

It puts unpaid orders' stock back on sale, tells organisers when merch money becomes available, emails them about orders they have not started
(10 days after payment), cancels and refunds those still untouched after 14 days, and sends any
merch refund that could not be sent the first time.
"""
from django.core.management.base import BaseCommand

from bryo import merch


class Command(BaseCommand):
    help = "Release held merch stock, remind organisers, auto-cancel stale orders and retry refunds."

    def handle(self, *args, **opts):
        s = merch.process_due_orders()
        self.stdout.write(self.style.SUCCESS(
            f"Reminded {s['reminded']}, cancelled {s['cancelled']}, released {s['released']}, refund retries {s['refunds_retried']}."
        ))
