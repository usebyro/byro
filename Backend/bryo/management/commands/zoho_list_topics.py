"""
Print each Zoho Campaigns topic's name and ID, so the Marketing one can go in the
ZOHO_MARKETING_TOPIC_ID variable on Railway. Uses the existing ZOHO_* OAuth settings.

    python manage.py zoho_list_topics

The refresh token needs the ZohoCampaigns.contact.READ scope.
"""
from django.core.management.base import BaseCommand, CommandError

from bryo.services import zoho


class Command(BaseCommand):
    help = "List the Zoho Campaigns topics (name and ID)."

    def handle(self, *args, **opts):
        try:
            topics = zoho.list_topics()
        except Exception as exc:
            raise CommandError(str(exc))
        if not topics:
            self.stdout.write("No topics found.")
        for topic_id, name in topics:
            self.stdout.write(f"{name}\t{topic_id}")
