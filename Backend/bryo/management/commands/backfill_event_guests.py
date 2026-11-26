"""
One-off: send guests who ticked the marketing box, but are not in Zoho yet, to the Attendees list (tagged "guest").
Dry run unless you pass --apply. Prints counts only, never addresses.

    python manage.py backfill_event_guests                 # dry run: counts only
    python manage.py backfill_event_guests --apply         # do it, in batches, 300 ms between calls

Same function as checkout (zoho.sync_event_guest_to_zoho), so the Marketing topic and the "guest" tag
are applied, and anyone who unsubscribed is left alone. Safe to run again.
"""
import time

from django.core.management.base import BaseCommand

from bryo.models import Ticket
from bryo.services import zoho


class Command(BaseCommand):
    help = "Add consented guests who are not in Zoho yet to the Attendees list (dry run unless --apply)."

    def add_arguments(self, parser):
        parser.add_argument('--apply', action='store_true', help="Actually call Zoho. Without it, only counts are printed.")
        parser.add_argument('--batch-size', type=int, default=50, help="Guests per batch (default 50).")
        parser.add_argument('--delay', type=float, default=0.3, help="Seconds between Zoho calls (default 0.3).")

    def handle(self, *args, **opts):
        pending = {}  # guest user id -> their unsynced consented ticket ids
        rows = (Ticket.objects.filter(marketing_consent=True, zoho_synced_at__isnull=True, user__isnull=False)
                .values_list('user_id', 'pk').order_by('pk'))
        for user_id, ticket_id in rows.iterator():
            pending.setdefault(user_id, []).append(ticket_id)

        self.stdout.write(f"Consented guests not yet in Zoho: {len(pending)}")
        if not opts['apply']:
            self.stdout.write("Dry run: nothing was sent. Pass --apply to subscribe them.")
            return
        if not zoho.is_enabled():
            self.stderr.write("Zoho is off or not fully configured (see ZOHO_* settings). Nothing was sent.")
            return
        if not zoho._setting('ZOHO_MARKETING_TOPIC_ID'):
            self.stderr.write("ZOHO_MARKETING_TOPIC_ID is not set. Nothing was sent.")
            return

        done = unsubscribed = failed = 0
        items = list(pending.items())
        size = max(1, opts['batch_size'])
        for start in range(0, len(items), size):
            for user_id, ticket_ids in items[start:start + size]:
                result = zoho.sync_event_guest_to_zoho(user_id, ticket_ids)
                if result.ok:
                    done += 1
                elif result.error == zoho.UNSUBSCRIBED:
                    unsubscribed += 1
                else:
                    failed += 1
                time.sleep(opts['delay'])
            self.stdout.write(f"  {min(start + size, len(items))}/{len(items)}")
        self.stdout.write(f"Done. Added: {done}. Previously unsubscribed (left alone): {unsubscribed}. Failed: {failed}.")
