"""
Dashboard > Community: follower growth, the events that brought new people in, and the people list.

Who appears: people who follow the organiser, and people checked in at the organiser's events.
An email is shown only when that address holds a ticket to one of the organiser's events (the guest
list already shows it); a follower who never bought a ticket shows by name only, and search never
matches a hidden address.
"""
import csv
import io
from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo

from django.http import HttpResponse
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .community import REGULAR_AFTER, _organizer_name, _profile_of, community_stats
from .exports import _safe
from .messaging import audience_counts
from .models import Follow, Stamp, Ticket

LAGOS = ZoneInfo('Africa/Lagos')
RANGES = ('12w', '6m', '12m')
FILTERS = ('all', 'regular', 'new', 'follower')
NEW_FOR_DAYS = 30  # someone whose first check-in was this recent counts as new
PAGE_SIZE = 25


def _buckets(which, now):
    """The time buckets for a range, oldest first, as (start, end, unit). Weeks start on Monday, Lagos time."""
    today = timezone.localtime(now, LAGOS).date()
    if which == '12w':
        monday = today - timedelta(days=today.weekday())
        starts = [monday - timedelta(weeks=i) for i in range(11, -1, -1)]
        ends = starts[1:] + [monday + timedelta(weeks=1)]
        return [(s, e) for s, e in zip(starts, ends)], 'week'
    months = 6 if which == '6m' else 12
    starts = []
    y, m = today.year, today.month
    for _ in range(months):
        starts.append(today.replace(year=y, month=m, day=1))
        y, m = (y, m - 1) if m > 1 else (y - 1, 12)
    starts.reverse()
    last = starts[-1]
    nxt = last.replace(year=last.year + 1, month=1) if last.month == 12 else last.replace(month=last.month + 1)
    ends = starts[1:] + [nxt]
    return list(zip(starts, ends)), 'month'


def _aware(day):
    return datetime.combine(day, time.min, tzinfo=LAGOS)


def _people(organizer):
    """Everyone in the organiser's community, keyed by lowercased email."""
    people = {}

    def person(email):
        return people.setdefault(email, {
            'email': email, 'name': '', 'events': set(), 'first_at': None, 'first_event': '',
            'last_at': None, 'last_event': '', 'followed_at': None, 'has_ticket': False,
        })

    stamps = (Stamp.objects.filter(organizer=organizer).select_related('event', 'ticket').order_by('created_at'))
    for st in stamps:
        email = (st.email or '').strip().lower()
        if not email:
            continue
        p = person(email)
        p['has_ticket'] = True
        p['events'].add(st.event_id)
        if p['first_at'] is None:
            p['first_at'], p['first_event'] = st.created_at, st.event.name
        p['last_at'], p['last_event'] = st.created_at, st.event.name
        if st.ticket.current_owner_name:
            p['name'] = st.ticket.current_owner_name

    follows = Follow.objects.filter(following=organizer).select_related('follower', 'follower__profile')
    for f in follows:
        email = (f.follower.email or '').strip().lower()
        if not email:
            continue
        p = person(email)
        p['followed_at'] = f.created_at
        profile = getattr(f.follower, 'profile', None)
        name = (profile.display_name if profile else '') or f.follower.get_full_name()
        if name and not p['name']:
            p['name'] = name

    holders = {
        (e or '').strip().lower()
        for e in Ticket.objects.filter(event__owner=organizer).values_list('current_owner_email', flat=True).distinct()
    }
    new_since = timezone.now() - timedelta(days=NEW_FOR_DAYS)
    out = []
    for p in people.values():
        n = len(p['events'])
        if n >= REGULAR_AFTER:
            status = 'regular'
        elif n and p['first_at'] >= new_since:
            status = 'new'
        elif n:
            status = 'member'
        else:
            status = 'follower'
        shown = p['has_ticket'] or p['email'] in holders
        out.append({
            'name': p['name'],
            'email': p['email'] if shown else None,
            'events': n,
            'first_event': p['first_event'], 'first_at': p['first_at'],
            'last_event': p['last_event'], 'last_at': p['last_at'],
            'followed_at': p['followed_at'],
            'following': p['followed_at'] is not None,
            'status': status,
        })
    epoch = datetime(1970, 1, 1, tzinfo=LAGOS)
    out.sort(key=lambda r: max(r['last_at'] or epoch, r['followed_at'] or epoch), reverse=True)
    return out


def _pick(rows, which, q):
    if which == 'regular':
        rows = [r for r in rows if r['status'] == 'regular']
    elif which == 'new':
        rows = [r for r in rows if r['status'] == 'new']
    elif which == 'follower':
        rows = [r for r in rows if r['status'] == 'follower']
    q = (q or '').strip().lower()
    if q:
        rows = [r for r in rows if q in (r['name'] or '').lower() or (r['email'] and q in r['email'])]
    return rows


class CommunitySummaryView(APIView):
    """
    GET /api/dashboard/community/summary/?range=12w|6m|12m
    The headline numbers, new followers per week or month, and the events that brought in the most new members.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        org = request.user
        which = request.query_params.get('range')
        which = which if which in RANGES else '12w'
        buckets, unit = _buckets(which, timezone.now())
        start = _aware(buckets[0][0])

        follow_times = Follow.objects.filter(following=org, created_at__gte=start).values_list('created_at', flat=True)
        counts = [0] * len(buckets)
        for at in follow_times:
            day = timezone.localtime(at, LAGOS).date()
            for i, (s, e) in enumerate(buckets):
                if s <= day < e:
                    counts[i] += 1
                    break

        # Each person's first check-in with this organiser; the event it happened at "brought them in".
        first = {}
        for email, event_id, name, slug, at in (
            Stamp.objects.filter(organizer=org).order_by('created_at')
            .values_list('email', 'event_id', 'event__name', 'event__slug', 'created_at')
        ):
            first.setdefault((email or '').strip().lower(), (event_id, name, slug, at))
        grew = {}
        for event_id, name, slug, at in first.values():
            if at >= start:
                row = grew.setdefault(event_id, {'name': name, 'slug': slug, 'new_members': 0})
                row['new_members'] += 1
        top = sorted(grew.values(), key=lambda r: -r['new_members'])[:4]

        profile = _profile_of(org)
        return Response({
            'stats': community_stats(org),
            'organizer_name': _organizer_name(org),
            'handle': profile.handle if profile and profile.handle else None,
            'audiences': audience_counts(org),
            'range': which,
            'unit': unit,
            'series': [{'start': s, 'end': e - timedelta(days=1), 'count': c} for (s, e), c in zip(buckets, counts)],
            'new_followers': sum(counts),
            'top_events': top,
        })


class CommunityMembersView(APIView):
    """
    GET /api/dashboard/community/members/?filter=all|regular|new|follower&q=&page=1
        Followers and attendees, most recently active first, 25 a page.
    Add &export=csv for every matching person as a CSV file.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        which = request.query_params.get('filter')
        which = which if which in FILTERS else 'all'
        everyone = _people(request.user)
        rows = _pick(everyone, which, request.query_params.get('q'))

        if request.query_params.get('export') == 'csv':
            return self._csv(rows)

        try:
            page = max(1, int(request.query_params.get('page') or 1))
        except ValueError:
            page = 1
        counts = {f: len(_pick(everyone, f, None)) for f in FILTERS}
        return Response({
            'count': len(rows),
            'total': len(everyone),
            'counts': counts,
            'page': page,
            'page_size': PAGE_SIZE,
            'has_more': page * PAGE_SIZE < len(rows),
            'results': rows[(page - 1) * PAGE_SIZE: page * PAGE_SIZE],
        })

    @staticmethod
    def _csv(rows):
        def day(dt):
            return timezone.localtime(dt, LAGOS).strftime('%Y-%m-%d') if dt else ''

        buf = io.StringIO()
        out = csv.writer(buf)
        out.writerow(['Name', 'Email', 'Events attended', 'First came', 'First event', 'Last seen', 'Last event',
                      'Following since', 'Status'])
        for r in rows:
            out.writerow([_safe(v) for v in (
                r['name'], r['email'] or '', r['events'], day(r['first_at']), r['first_event'],
                day(r['last_at']), r['last_event'], day(r['followed_at']), r['status'].capitalize(),
            )])
        res = HttpResponse('﻿' + buf.getvalue(), content_type='text/csv; charset=utf-8')
        res['Content-Disposition'] = 'attachment; filename="byro-community.csv"'
        return res
