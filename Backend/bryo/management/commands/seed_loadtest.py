"""Seed (or remove) synthetic data for load testing.

    python manage.py seed_loadtest --events 300 --tickets-per-event 40
    python manage.py seed_loadtest --clean

Everything it creates is recognisable and removable: events have slugs starting
`lt-`, and the owner and attendees use the reserved `loadtest.invalid` domain,
which can never receive mail. It writes loadtest/data.json (event slugs and
ticket ids) for loadtest/k6-api.js to read.

Refuses to run when DEBUG is off unless --force, so it can't be pointed at
production by accident.
"""

import json
from datetime import timedelta
from pathlib import Path

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from bryo.models import Event, Ticket, TicketTier

SLUG_PREFIX = 'lt-'
EMAIL_DOMAIN = 'loadtest.invalid'
OUT = Path(settings.BASE_DIR) / 'loadtest' / 'data.json'
MAX_TICKET_IDS = 5000


class Command(BaseCommand):
    help = "Create or remove synthetic events and tickets for load testing."

    def add_arguments(self, parser):
        parser.add_argument('--events', type=int, default=200)
        parser.add_argument('--tickets-per-event', type=int, default=50)
        parser.add_argument('--clean', action='store_true', help="Delete previously seeded data and exit.")
        parser.add_argument('--force', action='store_true', help="Allow running when DEBUG is off.")

    def handle(self, *args, **opts):
        if not settings.DEBUG and not opts['force']:
            raise CommandError(
                "DEBUG is off, so this looks like a real environment. "
                "Re-run with --force only against a staging database."
            )

        User = get_user_model()
        if opts['clean']:
            n, _ = Event.objects.filter(slug__startswith=SLUG_PREFIX).delete()
            u, _ = User.objects.filter(email__endswith=f'@{EMAIL_DOMAIN}').delete()
            OUT.unlink(missing_ok=True)
            self.stdout.write(f"Removed {n} rows of events/tickets/tiers and {u} user rows.")
            return

        owner, _ = User.objects.get_or_create(
            email=f'owner@{EMAIL_DOMAIN}', defaults={'username': 'loadtest-owner'},
        )
        day = (timezone.now() + timedelta(days=30)).date()

        Event.objects.bulk_create([
            Event(
                owner=owner, name=f'Load test event {i}', slug=f'{SLUG_PREFIX}{i}',
                day=day, time_from='18:00', time_to='22:00', location='Lagos',
                ticket_price=0, visibility='public', is_active=True, is_draft=False,
            )
            for i in range(opts['events'])
        ], ignore_conflicts=True)
        events = list(Event.objects.filter(slug__startswith=SLUG_PREFIX))

        TicketTier.objects.bulk_create([
            TicketTier(event=e, name=name, price=price, capacity=1000, order=order)
            for e in events
            for order, (name, price) in enumerate([('General', 5000), ('VIP', 15000)])
        ])
        tiers = {}
        for t in TicketTier.objects.filter(event__in=events):
            tiers.setdefault(t.event_id, []).append(t)

        tickets = []
        for e in events:
            for n in range(opts['tickets_per_event']):
                tickets.append(Ticket(
                    event=e, tier=tiers[e.pk][n % 2],
                    original_owner_name=f'Attendee {n}', original_owner_email=f'a{n}-{e.pk}@{EMAIL_DOMAIN}',
                    current_owner_name=f'Attendee {n}', current_owner_email=f'a{n}-{e.pk}@{EMAIL_DOMAIN}',
                    payment_status='paid',
                ))
        Ticket.objects.bulk_create(tickets, batch_size=1000)

        ids = [str(t.ticket_id) for t in tickets[:MAX_TICKET_IDS]]
        OUT.parent.mkdir(exist_ok=True)
        OUT.write_text(json.dumps({'slugs': [e.slug for e in events], 'tickets': ids}))
        self.stdout.write(
            f"Seeded {len(events)} events, {len(tickets)} tickets. Wrote {OUT} ({len(ids)} ticket ids)."
        )
