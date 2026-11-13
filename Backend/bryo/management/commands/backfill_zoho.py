"""
One-off: put everyone who already has a role (and anyone opted in to the newsletter) on their
Zoho Campaigns lists. Safe to run again, since adding someone already on a list is a success.

    python manage.py backfill_zoho --dry-run     # only print what would happen
    python manage.py backfill_zoho               # do it, 300 ms between calls
"""
import time

from django.core.management.base import BaseCommand
from django.db.models import Q

from bryo.models import Event, UserProfile
from bryo.services import zoho


class Command(BaseCommand):
    help = "Add existing users to their Zoho Campaigns role list (and the Newsletter list if opted in)."

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true', help="Print what would be done; call nothing.")
        parser.add_argument('--delay', type=float, default=0.3, help="Seconds between Zoho calls (default 0.3).")

    def handle(self, *args, **opts):
        dry, delay = opts['dry_run'], opts['delay']
        if not dry and not zoho.is_enabled():
            self.stderr.write("Zoho is off or not fully configured (see ZOHO_* settings). Nothing was sent.")
            return

        profiles = (
            UserProfile.objects.filter(Q(role__in=['organizer', 'attendee']) | Q(newsletter_subscribed=True))
            .select_related('user').order_by('pk')
        )
        done = failed = skipped = 0
        for p in profiles.iterator():
            user = p.user
            if not zoho.syncable(user):
                skipped += 1
                continue
            steps = []
            if zoho.list_for_role(p.role):
                extra, note = None, ''
                if p.role == 'organizer':
                    first = (Event.objects.filter(owner=user, is_active=True, is_draft=False)
                             .order_by('created_at', 'pk').first())
                    if first:
                        extra = zoho.first_event_fields(first)
                        note = f" (Has Published Event: Yes, Event URL: {extra['Event URL']})"
                steps.append((f"{zoho.list_for_role(p.role)} list{note}",
                              lambda u=user, r=p.role, x=extra: zoho.add_user_by_role(u, r, extra=x)))
            if p.newsletter_subscribed:
                steps.append(("newsletter list", lambda u=user: zoho.set_newsletter(u, True)))
            for label, call in steps:
                masked = zoho.mask_email(user.email)
                if dry:
                    self.stdout.write(f"[dry-run] {masked} -> {label}")
                    done += 1
                    continue
                result = call()
                if result.ok:
                    done += 1
                    self.stdout.write(f"{masked} -> {label}")
                else:
                    failed += 1
                    self.stderr.write(f"{masked} -> {label} FAILED: {result.error}")
                time.sleep(delay)
        self.stdout.write(self.style.SUCCESS(
            f"{'Would add' if dry else 'Added'} {done}, failed {failed}, skipped {skipped} (deleted, guest or inactive)."
        ))
