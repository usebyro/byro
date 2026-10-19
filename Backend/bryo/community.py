"""
The community loop: buyers follow the organiser, followers hear about new events,
and showing up at the door earns a stamp that feeds the organiser's community stats.
"""
import logging
import threading

from django.conf import settings
from django.core import signing
from django.db import connection
from django.db.models import Count, Q
from django.utils import timezone

from .emails import follower_new_event_email, format_event_date, format_event_time
from .mailer import send_email
from .models import Event, Follow, Stamp, UserProfile

logger = logging.getLogger(__name__)

REGULAR_AFTER = 3  # distinct events someone has shown up to before they count as a regular
UNFOLLOW_SALT = 'byro.unfollow'


def _frontend():
    return (getattr(settings, 'FRONTEND_URL', '') or 'https://usebyro.com').rstrip('/')


# -- following --------------------------------------------------------------

def follow_organizer(user, event):
    """Make `user` a follower of the event's organiser. Idempotent; never raises."""
    try:
        if user is None or not getattr(user, 'pk', None) or not event.owner_id or user.pk == event.owner_id:
            return False
        _, created = Follow.objects.get_or_create(follower=user, following=event.owner)
        if created:
            from .notifications import notify
            profile = _profile_of(user)
            name = (profile.display_name if profile else '') or user.get_full_name() or 'Someone'
            notify(event.owner, 'new_follower', f"{name} followed you", body=f"After going to {event.name}", link='/dashboard/overview')
        return True
    except Exception:
        logger.exception('Could not auto-follow organiser')
        return False


def unfollow_token(follower_id, following_id):
    return signing.dumps({'f': follower_id, 't': following_id}, salt=UNFOLLOW_SALT)


def unfollow_from_token(token):
    """Delete the follow a token points at. Returns the organiser's display name, or None if invalid."""
    try:
        data = signing.loads(token, salt=UNFOLLOW_SALT)
    except signing.BadSignature:
        return None
    Follow.objects.filter(follower_id=data['f'], following_id=data['t']).delete()
    profile = UserProfile.objects.filter(user_id=data['t']).first()
    return (profile.display_name if profile else '') or 'this organiser'


# -- telling followers about a new event ------------------------------------

def _profile_of(user):
    # Read fresh: the user object on a request may hold a stale or missing cached profile.
    return UserProfile.objects.filter(user=user).first()


def _organizer_name(owner):
    profile = _profile_of(owner)
    return (profile.display_name if profile else '') or owner.get_full_name() or 'An organiser'


def event_host_name(event):
    """
    What to show as "Hosted by": the organiser's community name, read at the time so renaming it updates every
    ticket and page. Never an email address (older events saved the organiser's email in `hosted_by`).
    """
    owner = event.owner if event.owner_id else None
    profile = getattr(owner, 'profile', None) if owner else None
    name = ((profile.display_name if profile else '') or '').strip()
    if name:
        return name
    legacy = (event.hosted_by or '').strip()
    if legacy and '@' not in legacy:
        return legacy
    return (profile.handle if profile and profile.handle else '') or 'Byro'


def host_name_for_new_event(user):
    """The name to store on a new event when the organiser didn't give one. Never their email."""
    profile = _profile_of(user)
    return ((profile.display_name if profile else '') or user.get_full_name() or (profile.handle if profile else '') or '').strip()


def _is_announceable(event):
    return bool(
        event.owner_id and event.is_active and not event.is_draft and not event.cancelled_at
        and event.visibility == 'public' and not event.followers_notified_at
    )


def notify_followers(event):
    """Email the organiser's followers about `event`, once. Never raises."""
    try:
        if not _is_announceable(event):
            return 0
        # Claim the event first so a double save or a second worker cannot send twice.
        claimed = Event.objects.filter(pk=event.pk, followers_notified_at__isnull=True).update(
            followers_notified_at=timezone.now()
        )
        if not claimed:
            return 0

        from .views import _tickets_label  # shared with the organiser's "event is live" email

        owner = event.owner
        organiser = _organizer_name(owner)
        profile = _profile_of(owner)
        community_url = f"{_frontend()}/u/{profile.handle}" if profile and profile.handle else None
        details = dict(
            organizer_name=organiser,
            event_name=event.name,
            date=format_event_date(event.day),
            time=format_event_time(event.time_from, event.timezone),
            location=event.location or '',
            event_url=f"{_frontend()}/discover/{event.slug}",
            tickets_label=_tickets_label(event),
            community_url=community_url,
        )
        sent = 0
        follows = Follow.objects.filter(following=owner).select_related('follower', 'follower__profile')
        for follow in follows:
            person = follow.follower
            if not person.email:
                continue
            fprofile = getattr(person, 'profile', None)
            name = (fprofile.display_name if fprofile else '') or person.first_name or ''
            unfollow_url = f"{_frontend()}/unfollow?t={unfollow_token(person.pk, owner.pk)}"
            try:
                mail = follower_new_event_email(name=name, unfollow_url=unfollow_url, **details)
                send_email(person.email, mail['subject'], mail['html'], mail['text'])
                sent += 1
            except Exception:  # one bad address must not stop the rest
                logger.exception('Could not email follower %s', person.pk)
        return sent
    except Exception:
        logger.exception('Could not notify followers of event %s', getattr(event, 'pk', None))
        return 0


def notify_followers_in_background(event):
    """Run notify_followers off the request, so publishing never waits on a long mailing list."""
    if not _is_announceable(event):
        return

    def run():
        try:
            notify_followers(event)
        finally:
            connection.close()

    threading.Thread(target=run, daemon=True).start()


# -- stamps -----------------------------------------------------------------

def record_stamp(ticket):
    """Give the ticket holder a stamp for this event. Idempotent; never raises."""
    try:
        event = ticket.event
        stamp, _ = Stamp.objects.get_or_create(
            ticket=ticket,
            defaults=dict(
                event=event,
                organizer_id=event.owner_id,
                user_id=ticket.user_id,
                email=(ticket.current_owner_email or '').strip().lower(),
            ),
        )
        return stamp
    except Exception:
        logger.exception('Could not record stamp for ticket %s', getattr(ticket, 'pk', None))
        return None


def stamps_for_user(user):
    """Stamps earned by this account, matched by account or by the email on the ticket."""
    return Stamp.objects.filter(Q(user=user) | Q(email__iexact=user.email)).select_related('event', 'organizer__profile')


def passport_for_user(user):
    """What a passport shows: one stamp per event (the first earned), newest event first.

    Someone holding several tickets to one event (bought for friends on their own email)
    has a stamp per ticket; the passport and its count treat that as one visit.
    """
    first = {}
    for st in stamps_for_user(user).order_by('created_at'):
        first.setdefault(st.event_id, st)
    return sorted(first.values(), key=lambda st: (st.event.day, st.created_at), reverse=True)


# -- community numbers ------------------------------------------------------

def community_stats(organizer):
    """Followers, how many people have shown up, regulars and the repeat rate for one organiser."""
    per_person = list(
        Stamp.objects.filter(organizer=organizer)
        .values('email').annotate(events=Count('event', distinct=True))
    )
    attended = len(per_person)
    regulars = sum(1 for p in per_person if p['events'] >= REGULAR_AFTER)
    repeat = sum(1 for p in per_person if p['events'] >= 2)
    return {
        'followers': Follow.objects.filter(following=organizer).count(),
        'attendees': attended,
        'regulars': regulars,
        'repeat_attendees': repeat,
        'repeat_rate': round(100 * repeat / attended) if attended else 0,
        'events_held': Event.objects.filter(owner=organizer, is_active=True, is_draft=False).count(),
    }
