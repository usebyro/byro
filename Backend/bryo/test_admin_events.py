"""Admin actions on events: visibility, and the other moderation tools added with it."""
from django.utils import timezone

from .models import AdminAction
from .test_admin_tools import AdminBase


class VisibilityTests(AdminBase):

    def patch(self, user, **body):
        self.as_(user)
        return self.client.patch(f'/api/admin/events/{self.event.pk}/', body, format='json')

    def test_admin_can_make_an_event_private_and_public_again(self):
        r = self.patch(self.boss, visibility='private')
        self.assertEqual((r.status_code, r.json()['visibility']), (200, 'private'))
        self.event.refresh_from_db()
        self.assertEqual(self.event.visibility, 'private')
        r = self.patch(self.boss, visibility='public')
        self.assertEqual(r.json()['visibility'], 'public')
        self.assertEqual(AdminAction.objects.filter(action=AdminAction.ACTION_EVENT_VISIBILITY).count(), 2)

    def test_going_private_stops_featuring(self):
        self.event.featured_until = timezone.now() + timezone.timedelta(days=5)
        self.event.save()
        self.patch(self.boss, visibility='private')
        self.event.refresh_from_db()
        self.assertIsNone(self.event.featured_until)

    def test_same_value_is_not_logged_and_bad_value_is_refused(self):
        self.patch(self.boss, visibility='public')
        self.assertFalse(AdminAction.objects.filter(action=AdminAction.ACTION_EVENT_VISIBILITY).exists())
        self.assertEqual(self.patch(self.boss, visibility='secret').status_code, 400)

    def test_viewers_cannot_change_visibility(self):
        self.assertEqual(self.patch(self.viewer, visibility='private').status_code, 403)
        self.event.refresh_from_db()
        self.assertEqual(self.event.visibility, 'public')
