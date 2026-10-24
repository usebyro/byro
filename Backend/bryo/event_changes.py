"""Tell ticket holders when the organiser changes when or where an event happens."""
import logging
import threading

from django.conf import settings
from django.db import close_old_connections
from django.utils import timezone

from .emails import event_changed_email, format_event_date, format_event_time
from .mailer import send_email

logger = logging.getLogger(__name__)

WATCHED = ('day', 'time_from', 'time_to', 'location')


def watched(event):
    """The values worth telling people about, to compare before and after an edit."""
    return {f: getattr(event, f, None) for f in WATCHED}


def changes_between(before, after, tz=''):
    """[(label, old, new)] in the words the email uses; empty when none of date, time or place moved."""
    out = []
    if before['day'] != after['day']:
        out.append(('Date', format_event_date(before['day']), format_event_date(after['day'])))
    if (before['time_from'], before['time_to']) != (after['time_from'], after['time_to']):
        zone = ' WAT' if 'lagos' in (tz or '').lower() else ''

        def span(d):
            start, end = format_event_time(d['time_from']), format_event_time(d['time_to'])
            return (f'{start} to {end}' if start and end else start or end) + zone
        out.append(('Time', span(before), span(after)))
    if (before['location'] or '') != (after['location'] or ''):
        out.append(('Location', before['location'] or 'Not set', after['location'] or 'Not set'))
    return out


def _site():
    return (getattr(settings, 'FRONTEND_URL', '') or 'https://www.usebyro.com').rstrip('/')


def notify_ticket_holders(event, changes):
    """Email each person holding a valid ticket once. Returns how many were sent; never raises for one bad address."""
    from .models import Ticket
    sent = 0
    seen = set()
    tickets = (Ticket.objects.filter(event=event, payment_status__in=['paid', 'free'])
               .exclude(current_owner_email='').order_by('created_at'))
    for t in tickets:
        email = t.current_owner_email.strip().lower()
        if email in seen:
            continue
        seen.add(email)
        try:
            mail = event_changed_email(
                t.current_owner_name, event.name, changes,
                event_url=f'{_site()}/discover/{event.slug}', ticket_url=f'{_site()}/ticket/{t.ticket_id}',
            )
            send_email(to=email, subject=mail['subject'], html=mail['html'], text=mail['text'])
            sent += 1
        except Exception:
            logger.exception('Could not tell %s that event %s changed', email, event.pk)
    return sent


def _spawn(fn):
    threading.Thread(target=fn, daemon=True).start()


def notify_in_background(event, changes):
    """Called after an edit is saved. Quiet for drafts, cancelled, suspended or finished events, or no tickets."""
    if not changes or event.is_draft or event.cancelled_at or not event.is_active or event.day < timezone.localdate():
        return False
    if not event.tickets.filter(payment_status__in=['paid', 'free']).exists():
        return False

    def run():
        try:
            notify_ticket_holders(event, changes)
        except Exception:
            logger.exception('Event-changed emails failed for event %s', event.pk)
        finally:
            close_old_connections()

    _spawn(run)
    return True
