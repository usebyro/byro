from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import Count
from django.utils.crypto import get_random_string

from bryo.models import Event


class Command(BaseCommand):
    help = "Find Event rows sharing a slug and reassign all but one to a fresh, unique slug."

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Report duplicates without modifying the database.",
        )

    def handle(self, *args, **options):
        dry_run = options["dry_run"]

        duplicate_slugs = (
            Event.objects.exclude(slug__isnull=True)
            .values("slug")
            .annotate(count=Count("id"))
            .filter(count__gt=1)
        )

        if not duplicate_slugs:
            self.stdout.write(self.style.SUCCESS("No duplicate event slugs found."))
            return

        for row in duplicate_slugs:
            slug = row["slug"]
            events = list(Event.objects.filter(slug=slug).order_by("created_at"))
            keeper, dupes = events[0], events[1:]
            self.stdout.write(
                f"Slug '{slug}': keeping event {keeper.id} (created {keeper.created_at}), "
                f"reassigning {len(dupes)} duplicate(s): {[e.id for e in dupes]}"
            )

            if dry_run:
                continue

            with transaction.atomic():
                for event in dupes:
                    new_slug = get_random_string(6)
                    while Event.objects.filter(slug=new_slug).exists():
                        new_slug = get_random_string(6)
                    event.slug = new_slug
                    event.save(update_fields=["slug"])
                    self.stdout.write(f"  event {event.id} -> new slug '{new_slug}'")

        if dry_run:
            self.stdout.write(self.style.WARNING("Dry run: no changes were made."))
        else:
            self.stdout.write(self.style.SUCCESS("Duplicate slugs resolved."))
