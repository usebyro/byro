"""
Finish payments that were paid at the provider but never completed on our side (a missed webhook, or the buyer
closed the page before returning to Byro). Each pending payment is checked with the provider; if the money
arrived, the tickets are issued and sent, exactly as when the buyer returns to the site.

Payments that are not paid are left untouched. Payments we cannot check (provider down) are left for next time.

    python manage.py reconcile_pending_payments                    # pending for 10 minutes to 3 days
    python manage.py reconcile_pending_payments --days 30 --include-abandoned --dry-run
"""
import logging
from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

logger = logging.getLogger(__name__)

MIN_AGE = timedelta(minutes=10)  # give the normal webhook / return-to-site path time first


class Command(BaseCommand):
    help = "Check pending payments with the provider and issue tickets for any that were actually paid."

    def add_arguments(self, parser):
        parser.add_argument('--days', type=int, default=3, help="How far back to look (default 3).")
        parser.add_argument('--include-abandoned', action='store_true',
                            help="Also check payments already marked abandoned or failed (for one-off clean-ups).")
        parser.add_argument('--dry-run', action='store_true', help="List what would be completed; change nothing.")

    def handle(self, *args, **options):
        from bryo.models import Payment
        from bryo.views import _charge_amount, bachs, settle_payment_with_provider

        now = timezone.now()
        statuses = ['pending']
        if options['include_abandoned']:
            statuses += ['abandoned', 'failed']
        qs = (Payment.objects.filter(status__in=statuses, created_at__lte=now - MIN_AGE,
                                     created_at__gte=now - timedelta(days=options['days']))
              .select_related('event').order_by('created_at'))

        paid = unpaid = unknown = 0
        for payment in qs:
            try:
                if options['dry_run']:
                    result = self._peek(payment, bachs, _charge_amount)
                else:
                    result = settle_payment_with_provider(payment)
            except Exception:
                logger.exception("Reconcile failed for payment %s", payment.pk)
                unknown += 1
                continue
            if result == 'paid':
                paid += 1
                self.stdout.write(f"{'Would complete' if options['dry_run'] else 'Completed'}: "
                                  f"{payment.paystack_reference} {payment.customer_email} ({payment.event.name})")
            elif result == 'unpaid':
                unpaid += 1
            else:
                unknown += 1
        self.stdout.write(f"{paid} paid at the provider{' (not completed: dry run)' if options['dry_run'] else ''}; "
                          f"{unpaid} not paid; {unknown} could not be checked.")

    def _peek(self, payment, bachs, charge_amount):
        """Dry run: what the provider says, without changing anything."""
        from bryo.models import Payment
        from bryo.views import _paid_amount_ok, _paystack_transaction
        if payment.provider == Payment.PROVIDER_BACHS:
            if not payment.bachs_checkout_id:
                return 'unpaid'
            try:
                checkout = bachs.fetch_checkout(payment.bachs_checkout_id)
            except (bachs.BachsUnavailable, bachs.BachsError):
                return 'unknown'
            outcome = bachs.checkout_outcome(checkout, charge_amount(payment))
            return 'paid' if outcome == 'success' else 'unknown' if outcome == 'mismatch' else 'unpaid'
        data, err = _paystack_transaction(payment.paystack_reference)
        if err:
            return 'unknown'
        if data.get('status') == 'success':
            return 'paid' if _paid_amount_ok(int(data.get('amount') or 0), int(payment.amount * 100)) else 'unknown'
        return 'unpaid'
