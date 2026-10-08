"""
Send the 24h-before reminder email to every attendee and organiser of events
happening tomorrow.

Meant to run once a day via a scheduled job (e.g. a Railway cron service
running `python manage.py send_event_reminders` on a daily schedule, such as
`0 9 * * *`). Idempotent: each event is only ever processed once, tracked by
Event.reminder_sent_at, so re-running the command (or the cron firing twice)
never double-sends.

    python manage.py send_event_reminders
    python manage.py send_event_reminders --dry-run
"""

import logging
from datetime import timedelta

from django.conf import settings
from django.core.management.base import BaseCommand
from django.utils import timezone

from bryo.models import Event, EventCoHost

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Send 24h-before reminder emails to attendees and organisers for events happening tomorrow."

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run', action='store_true',
            help="Print what would be sent without sending or marking events as reminded.",
        )

    def handle(self, *args, **options):
        from bryo.emails import (
            event_reminder_email, format_event_date, format_event_time, organizer_event_reminder_email,
        )
        from bryo.mailer import send_email
        from bryo.views import _event_revenue

        dry_run = options['dry_run']
        tomorrow = (timezone.now() + timedelta(days=1)).date()

        events = Event.objects.filter(
            day=tomorrow, is_active=True, reminder_sent_at__isnull=True,
        )

        frontend_url = (settings.FRONTEND_URL or "https://usebyro.com").rstrip('/')
        total_events = 0
        total_attendee_emails = 0

        for event in events:
            date_str = format_event_date(event.day)
            time_str = format_event_time(event.time_from, event.timezone)

            tickets = event.tickets.filter(payment_status__in=['paid', 'free'])
            attendee_count = 0
            for ticket in tickets:
                if not ticket.current_owner_email:
                    continue
                attendee_count += 1
                if dry_run:
                    continue
                try:
                    email_data = event_reminder_email(
                        name=ticket.current_owner_name,
                        event_name=event.name,
                        date=date_str,
                        time=time_str,
                        location=event.location or '',
                        ticket_url=f"{frontend_url}/ticket/{ticket.ticket_id}",
                        virtual_link=event.virtual_link or '',
                        tier_label=f"{ticket.tier.name if ticket.tier else 'General admission'} × 1",
                    )
                    send_email(
                        to=ticket.current_owner_email,
                        subject=email_data['subject'],
                        html=email_data['html'],
                        text=email_data['text'],
                    )
                except Exception as e:
                    logger.error(
                        f"Failed to send event reminder to {ticket.current_owner_email} "
                        f"for event {event.pk}: {e}"
                    )

            # (name, email, is_owner): co-hosts see sales but not revenue, which belongs to the owner.
            recipients = []
            if event.owner_id and event.owner.email:
                recipients.append((event.owner.get_full_name() or event.owner.email, event.owner.email, True))
            for cohost in event.cohosts.filter(status=EventCoHost.STATUS_ACCEPTED).select_related('user'):
                if cohost.user and cohost.user.email:
                    recipients.append((cohost.user.get_full_name() or cohost.user.email, cohost.user.email, False))

            for name, email, is_owner in recipients:
                if dry_run:
                    continue
                try:
                    email_data = organizer_event_reminder_email(
                        name=name,
                        event_name=event.name,
                        date=date_str,
                        time=time_str,
                        tickets_sold=attendee_count,
                        dashboard_url=f"{frontend_url}/dashboard/events/{event.slug}",
                        location=event.location or '',
                        capacity=event.capacity,
                        revenue=_event_revenue(event) if is_owner else None,
                        checkin_url=f"{frontend_url}/checkin/{event.slug}",
                    )
                    send_email(
                        to=email, subject=email_data['subject'],
                        html=email_data['html'], text=email_data['text'],
                    )
                except Exception as e:
                    logger.error(f"Failed to send organiser reminder to {email} for event {event.pk}: {e}")

            total_events += 1
            total_attendee_emails += attendee_count
            self.stdout.write(
                f"{'[dry-run] ' if dry_run else ''}{event.name} ({event.slug}): "
                f"{attendee_count} attendee email(s), {len(recipients)} organiser email(s)"
            )

            if not dry_run:
                event.reminder_sent_at = timezone.now()
                event.save(update_fields=['reminder_sent_at'])

        self.stdout.write(self.style.SUCCESS(
            f"{'Would process' if dry_run else 'Processed'} {total_events} event(s), "
            f"{total_attendee_emails} attendee email(s)."
        ))
