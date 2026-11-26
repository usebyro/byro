"""
One "finish my order" email to people who started paying for a ticket and never finished.

A payment is reminded once, when it has been pending for 3 hours (so slow bank transfers have had time
to land) and is under 24 hours old. Payments still pending after 24 hours are marked abandoned.

Skipped, quietly: the buyer has since paid for that event, unsubscribed from Byro emails, or the event
is over, cancelled, closed for sales, or the tickets they chose have sold out.

    python manage.py send_abandoned_checkout_reminders
    python manage.py send_abandoned_checkout_reminders --dry-run     # counts only
"""
import logging
from datetime import timedelta
from zoneinfo import ZoneInfo

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

logger = logging.getLogger(__name__)

REMIND_AFTER = timedelta(hours=3)
ABANDON_AFTER = timedelta(hours=24)
LAGOS = ZoneInfo('Africa/Lagos')


def skip_reason(payment):
    """Why this buyer should not be emailed, or '' when they should."""
    from bryo.models import Payment
    from bryo.views import InsufficientCapacityError, lock_and_check_capacity, settle_payment_with_provider

    # Ask the provider first: a buyer who paid but whose payment we missed must get tickets, not a reminder.
    result = settle_payment_with_provider(payment)
    if result == 'paid':
        return 'already paid'
    if result == 'unknown':
        return 'could not check'
    event = payment.event
    if not event.is_active or event.is_draft or event.cancelled_at or event.sales_closed:
        return 'event closed'
    if event.day and event.day < timezone.now().astimezone(LAGOS).date():
        return 'event over'
    if Payment.objects.filter(event=event, customer_email__iexact=payment.customer_email, status='successful').exists():
        return 'already paid'
    user = get_user_model().objects.filter(email__iexact=payment.customer_email).select_related('profile').first()
    profile = getattr(user, 'profile', None)
    if profile is not None and not profile.newsletter_subscribed:
        return 'unsubscribed'
    quantity = int((payment.metadata or {}).get('seats') or (payment.metadata or {}).get('quantity') or 1)
    try:
        with transaction.atomic():
            lock_and_check_capacity(event, payment.tier_id, quantity)
    except InsufficientCapacityError:
        return 'sold out'
    return ''


def send_reminder(payment):
    from bryo.emails import abandoned_checkout_email, format_event_date, format_event_time
    from bryo.mailer import send_email
    from bryo.views import _event_page_url

    event = payment.event
    quantity = int((payment.metadata or {}).get('quantity') or 1)
    url = _event_page_url(event)
    if payment.tier_id:
        url += f"?tier={payment.tier_id}&qty={quantity}"
    mail = abandoned_checkout_email(
        payment.customer_name, event.name,
        format_event_date(event.day), format_event_time(event.time_from, event.timezone),
        event.location, payment.tier.name if payment.tier_id else '', url, quantity,
    )
    send_email(payment.customer_email, mail['subject'], mail['html'], mail['text'])


class Command(BaseCommand):
    help = "Email buyers who left a payment unfinished for 3 hours (once), and mark day-old pending payments abandoned."

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true', help="Print counts only; send and change nothing.")

    def handle(self, *args, **options):
        from bryo.models import Payment
        from bryo.views import settle_payment_with_provider

        dry = options['dry_run']
        now = timezone.now()
        due = (Payment.objects.filter(
            status='pending', reminder_sent_at__isnull=True,
            created_at__lte=now - REMIND_AFTER, created_at__gt=now - ABANDON_AFTER,
        ).select_related('event', 'tier'))

        sent = skipped = failed = 0
        for payment in due:
            try:
                if skip_reason(payment):
                    # Settled: don't look at this one again.
                    if not dry:
                        Payment.objects.filter(pk=payment.pk).update(reminder_sent_at=now)
                    skipped += 1
                    continue
                if dry:
                    sent += 1
                    continue
                # Claim it first, so two overlapping runs can't both send.
                if not Payment.objects.filter(pk=payment.pk, reminder_sent_at__isnull=True).update(reminder_sent_at=now):
                    continue
                try:
                    send_reminder(payment)
                    sent += 1
                except Exception:
                    Payment.objects.filter(pk=payment.pk).update(reminder_sent_at=None)  # try again next run
                    raise
            except Exception:
                logger.exception("Abandoned-checkout reminder failed for payment %s", payment.pk)
                failed += 1

        # Only abandon what the provider confirms was never paid; a payment we can't check stays pending.
        abandoned = 0
        for payment in Payment.objects.filter(status='pending', created_at__lte=now - ABANDON_AFTER).select_related('event'):
            try:
                if dry:
                    abandoned += 1
                    continue
                if settle_payment_with_provider(payment) == 'unpaid':
                    abandoned += Payment.objects.filter(pk=payment.pk, status='pending').update(status='abandoned')
            except Exception:
                logger.exception("Could not check payment %s before marking it abandoned", payment.pk)

        verb = 'Would send' if dry else 'Sent'
        self.stdout.write(f"{verb} {sent} reminder(s); skipped {skipped}; failed {failed}; "
                          f"{'would mark' if dry else 'marked'} {abandoned} payment(s) abandoned.")
