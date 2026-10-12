"""
Organiser messages: who a message reaches, the weekly limit, and the sending itself.

Announcements go to people who still follow the organiser (unfollowing is how someone
unsubscribes). Event updates go to an event's ticket holders and are not optional.
"""
import logging
import threading
from datetime import timedelta

from django.db import connection
from django.db.models import Count
from django.utils import timezone

from .community import REGULAR_AFTER, _frontend, _organizer_name, _profile_of, unfollow_token
from .emails import format_event_date, format_event_time, organizer_message_email
from .mailer import send_email
from .models import Event, Follow, Message, Stamp, Ticket

logger = logging.getLogger(__name__)

MAX_ANNOUNCEMENTS_PER_WEEK = 2
HOLDER_STATUSES = ('free', 'paid')  # not pending, failed, refunded or cancelled


def announcements_left(organizer):
    since = timezone.now() - timedelta(days=7)
    used = Message.objects.filter(
        organizer=organizer, kind=Message.KIND_ANNOUNCE, created_at__gte=since,
    ).exclude(status='failed').count()
    return max(0, MAX_ANNOUNCEMENTS_PER_WEEK - used)


def _follower_recipients(organizer):
    """Everyone who follows, as {email: {name, user_id}}."""
    out = {}
    follows = Follow.objects.filter(following=organizer).select_related('follower', 'follower__profile')
    for follow in follows:
        person = follow.follower
        email = (person.email or '').strip().lower()
        if not email:
            continue
        profile = getattr(person, 'profile', None)
        out[email] = {'email': email, 'user_id': person.pk, 'name': (profile.display_name if profile else '') or person.first_name or ''}
    return out


def _attendance(organizer):
    """{email: distinct events they were checked in to}."""
    rows = Stamp.objects.filter(organizer=organizer).values('email').annotate(n=Count('event', distinct=True))
    return {(r['email'] or '').strip().lower(): r['n'] for r in rows}


def event_holders(event):
    """Ticket holders of one event, as {email: {name}}."""
    out = {}
    for t in Ticket.objects.filter(event=event, payment_status__in=HOLDER_STATUSES):
        email = (t.current_owner_email or '').strip().lower()
        if email and email not in out:
            out[email] = {'email': email, 'user_id': None, 'name': t.current_owner_name or ''}
    return out


def audience(organizer, kind, which, event=None):
    """The people a message would reach right now: a list of {email, name, user_id}."""
    if kind == Message.KIND_UPDATE:
        return list(event_holders(event).values()) if event else []
    followers = _follower_recipients(organizer)
    if which == 'followers':
        return list(followers.values())
    attended = _attendance(organizer)
    need = REGULAR_AFTER if which == 'regulars' else 1
    return [p for email, p in followers.items() if attended.get(email, 0) >= need]


def audience_counts(organizer):
    followers = _follower_recipients(organizer)
    attended = _attendance(organizer)
    return {
        'followers': len(followers),
        'members': sum(1 for e in followers if attended.get(e, 0) >= 1),
        'regulars': sum(1 for e in followers if attended.get(e, 0) >= REGULAR_AFTER),
    }


def holder_events(organizer):
    """The organiser's live events that have ticket holders, for the Event update picker."""
    events = Event.objects.filter(owner=organizer, is_active=True, is_draft=False)
    counts = dict(
        Ticket.objects.filter(event__in=events, payment_status__in=HOLDER_STATUSES)
        .values_list('event_id').annotate(n=Count('current_owner_email', distinct=True))
    )
    return [{'slug': e.slug, 'name': e.name, 'day': str(e.day), 'holders': counts[e.pk]}
            for e in events.order_by('-day') if counts.get(e.pk)]


def _event_card(event):
    return {
        'date': format_event_date(event.day),
        'time': format_event_time(event.time_from, event.timezone),
        'location': event.location or '',
        'url': f"{_frontend()}/discover/{event.slug}",
    }


def _mail_for(message, person, organizer, card, community_url, is_test=False):
    unfollow_url = None
    if message.kind == Message.KIND_ANNOUNCE and person.get('user_id'):
        unfollow_url = f"{_frontend()}/unfollow?t={unfollow_token(person['user_id'], organizer.pk)}"
    return organizer_message_email(
        name=person.get('name') or '', organizer_name=_organizer_name(organizer), kind=message.kind,
        subject=message.subject, body=message.body, event=card, unfollow_url=unfollow_url,
        community_url=community_url, is_test=is_test,
    )


def _context(message):
    organizer = message.organizer
    profile = _profile_of(organizer)
    community_url = f"{_frontend()}/u/{profile.handle}" if profile and profile.handle else None
    card = _event_card(message.event) if message.attach_event and message.event else None
    return organizer, card, community_url


def send_test(message, to_email):
    """One copy to the organiser, so they can see it before it goes out. Not saved."""
    organizer, card, community_url = _context(message)
    mail = _mail_for(message, {'name': _organizer_name(organizer), 'user_id': organizer.pk}, organizer, card, community_url, is_test=True)
    send_email(to_email, mail['subject'], mail['html'], mail['text'],
               reply_to=organizer.email or None, from_name=_organizer_name(organizer))


def deliver(message, recipients):
    """Email each recipient and record how it went. Never raises."""
    try:
        organizer, card, community_url = _context(message)
        name = _organizer_name(organizer)
        sent = failed = 0
        for person in recipients:
            try:
                mail = _mail_for(message, person, organizer, card, community_url)
                send_email(person['email'], mail['subject'], mail['html'], mail['text'],
                           reply_to=organizer.email or None, from_name=name)
                sent += 1
            except Exception:  # one bad address must not stop the rest
                failed += 1
                logger.exception('Could not send message %s to %s', message.pk, person['email'])
        Message.objects.filter(pk=message.pk).update(
            sent_count=sent, failed_count=failed, sent_at=timezone.now(),
            status='sent' if sent or not recipients else 'failed',
        )
    except Exception:
        logger.exception('Could not deliver message %s', getattr(message, 'pk', None))
        Message.objects.filter(pk=getattr(message, 'pk', None)).update(status='failed', sent_at=timezone.now())


def deliver_in_background(message, recipients):
    """Send off the request, so a long list never keeps the organiser waiting."""
    def run():
        try:
            deliver(message, recipients)
        finally:
            connection.close()

    threading.Thread(target=run, daemon=True).start()
