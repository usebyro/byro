from django.core.management.base import BaseCommand

from bryo.community import host_name_for_new_event
from bryo.models import Event


class Command(BaseCommand):
    help = (
        "Replace email addresses saved as an event's 'hosted by' with the organiser's community name. "
        "Shows what it would change; add --apply to save."
    )

    def add_arguments(self, parser):
        parser.add_argument('--apply', action='store_true', help='Save the changes (default is a dry run).')

    def handle(self, *args, **opts):
        todo = []
        for event in Event.objects.select_related('owner').filter(hosted_by__contains='@'):
            new = host_name_for_new_event(event.owner) if event.owner_id else ''
            if new and '@' not in new:
                todo.append((event, new))
            else:
                self.stdout.write(self.style.WARNING(f"skip  #{event.pk} {event.name}: organiser has no community name yet"))
        for event, new in todo:
            self.stdout.write(f"{'set ' if opts['apply'] else 'would set'}  #{event.pk} {event.name}: {event.hosted_by!r} -> {new!r}")
            if opts['apply']:
                Event.objects.filter(pk=event.pk).update(hosted_by=new)
        verb = 'Updated' if opts['apply'] else 'Would update'
        self.stdout.write(self.style.SUCCESS(f"{verb} {len(todo)} event(s)." + ('' if opts['apply'] else ' Run with --apply to save.')))
