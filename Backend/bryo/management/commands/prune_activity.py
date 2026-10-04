from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from bryo.models import ActivityLog


class Command(BaseCommand):
    help = "Delete user activity log rows older than --days (default 365)."

    def add_arguments(self, parser):
        parser.add_argument('--days', type=int, default=365)

    def handle(self, *args, **opts):
        cutoff = timezone.now() - timedelta(days=opts['days'])
        deleted, _ = ActivityLog.objects.filter(created_at__lt=cutoff).delete()
        self.stdout.write(f"Deleted {deleted} activity rows older than {opts['days']} days.")
