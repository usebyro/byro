"""
Emails sent when an admin suspends an event, or clears it again: the organiser
gets their next steps, and everyone holding a ticket is told their ticket is safe.
"""
import logging
import threading

from django.conf import settings
from django.db import connection

from .emails import (
    event_reinstated_email,
    event_suspended_email,
    format_event_date,
    format_event_time,
    organizer_event_reinstated_email,
    organizer_event_suspended_email,
)
from .mailer import send_email

logger = logging.getLogger(__name__)


def _send(to, mail):
    try:
        send_email(to, mail['subject'], mail['html'], mail['text'])
    except Exception:  # one bad address must not stop the rest
        logger.exception('Could not send event status email to %s', to)


def _attendees(event):
    """One (email, name) per person holding a valid ticket, however many they hold."""
    seen, people = set(), []
    for ticket in event.tickets.filter(payment_status__in=['paid', 'free']).order_by('id'):
        email = (ticket.current_owner_email or '').strip()
        if email and email.lower() not in seen:
            seen.add(email.lower())
            people.append((email, ticket.current_owner_name))
    return people


def notify_event_status_change(event, suspended):
    """Email the organiser and the ticket holders. Never raises."""
    try:
        frontend = (getattr(settings, 'FRONTEND_URL', '') or 'https://usebyro.com').rstrip('/')
        details = dict(
            event_name=event.name,
            date=format_event_date(event.day),
            time=format_event_time(event.time_from, event.timezone),
            location=event.location or '',
        )
        event_url = f"{frontend}/discover/{event.slug}"

        owner = event.owner
        if owner and owner.email:
            profile = getattr(owner, 'profile', None)
            owner_name = (profile.display_name if profile else '') or owner.get_full_name() or owner.email
            build = organizer_event_suspended_email if suspended else organizer_event_reinstated_email
            _send(owner.email, build(name=owner_name, event_url=event_url, **details))

        build = event_suspended_email if suspended else event_reinstated_email
        for email, name in _attendees(event):
            _send(email, build(name=name, event_url=event_url, **details))
    except Exception:
        logger.exception('Could not send event status emails for event %s', event.pk)


def notify_in_background(event, suspended):
    """Send without making the admin wait for a long attendee list."""
    def run():
        try:
            notify_event_status_change(event, suspended)
        finally:
            connection.close()
    threading.Thread(target=run, daemon=True).start()
