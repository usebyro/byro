"""After a flash-sale load test: did we oversell?

    python manage.py check_flash_sale

Reads the seeded `lt-flash` event and checks the invariants that must hold
however many people raced for the last seats. Exits non-zero on any failure.
"""

from django.core.management.base import BaseCommand, CommandError
from django.db.models import Count

from bryo.models import Event, Payment, Ticket

FLASH_SLUG = 'lt-flash'


class Command(BaseCommand):
    help = "Check that a flash-sale load test did not oversell the lt-flash event."

    def handle(self, *args, **opts):
        event = Event.objects.filter(slug=FLASH_SLUG).first()
        if event is None:
            raise CommandError("No lt-flash event. Run: seed_loadtest --flash")

        sold = Ticket.objects.filter(event=event, payment_status__in=['paid', 'free']).count()
        payments = dict(Payment.objects.filter(event=event).values_list('status').annotate(n=Count('id')))
        dupes = (
            Ticket.objects.filter(event=event).values('payment').annotate(n=Count('id'))
            .filter(n__gt=1, payment__isnull=False).count()
        )
        successful = payments.get('successful', 0)

        self.stdout.write(f"capacity            {event.capacity}")
        self.stdout.write(f"tickets sold        {sold}")
        self.stdout.write(f"payments by status  {payments or '{}'}")

        failures = []
        if sold > event.capacity:
            failures.append(f"OVERSOLD: {sold} tickets for {event.capacity} seats")
        if sold != successful:
            failures.append(f"tickets ({sold}) do not match successful payments ({successful})")
        if dupes:
            failures.append(f"{dupes} payments produced more than one ticket")

        if failures:
            for f in failures:
                self.stderr.write(self.style.ERROR(f"FAIL  {f}"))
            raise CommandError("Flash-sale invariants violated.")
        self.stdout.write(self.style.SUCCESS("PASS  no overselling, every ticket has exactly one successful payment"))
