"""Web Push: admins turn it on per device, and their notifications reach that device."""
import json
from unittest.mock import MagicMock, patch

from django.test import override_settings

from .models import Notification, PushSubscription
from .notifications import notify, notify_admins
from .test_admin_tools import AdminBase

KEYS = {'VAPID_PUBLIC_KEY': 'BPublicKey', 'VAPID_PRIVATE_KEY': 'private', 'VAPID_SUBJECT': 'mailto:support@usebyro.com'}
CHROME = 'https://fcm.googleapis.com/fcm/send/abc123'


def subscription(endpoint=CHROME):
    return {'subscription': {'endpoint': endpoint, 'keys': {'p256dh': 'BKey', 'auth': 'authsecret'}}}


@override_settings(**KEYS)
class PushTests(AdminBase):

    def setUp(self):
        super().setUp()
        # Run the background send straight away so the test can see it.
        p = patch('bryo.push._start', side_effect=lambda run: run())
        p.start()
        self.addCleanup(p.stop)
        p = patch('pywebpush.webpush')
        self.webpush = p.start()
        self.addCleanup(p.stop)

    def test_an_admin_turns_push_on_for_a_device(self):
        self.as_(self.viewer)
        self.assertEqual(self.client.get('/api/admin/push/').json(), {'configured': True, 'public_key': 'BPublicKey'})
        res = self.client.post('/api/admin/push/', subscription(), format='json')
        self.assertEqual(res.status_code, 201)
        sub = PushSubscription.objects.get()
        self.assertEqual((sub.user, sub.audience, sub.endpoint), (self.viewer, 'admin', CHROME))

        # Again from the same browser: still one row. Signed in as someone else: it moves to them.
        self.client.post('/api/admin/push/', subscription(), format='json')
        self.as_(self.boss)
        self.client.post('/api/admin/push/', subscription(), format='json')
        self.assertEqual(PushSubscription.objects.get().user, self.boss)

        from urllib.parse import quote
        self.as_(self.viewer)  # someone else can't switch off your device
        self.client.delete(f'/api/admin/push/?endpoint={quote(CHROME)}')
        self.assertTrue(PushSubscription.objects.exists())
        self.as_(self.boss)
        self.client.delete(f'/api/admin/push/?endpoint={quote(CHROME)}')
        self.assertFalse(PushSubscription.objects.exists())

    def test_only_real_push_services_are_accepted(self):
        self.as_(self.boss)
        for bad in ['http://fcm.googleapis.com/x', 'https://169.254.169.254/latest', 'https://evil.com/fcm.googleapis.com',
                    'https://fcm.googleapis.com.evil.com/x', 'not a url']:
            self.assertEqual(self.client.post('/api/admin/push/', subscription(bad), format='json').status_code, 400, bad)
        for good in ['https://web.push.apple.com/abc', 'https://updates.push.services.mozilla.com/wpush/v2/x',
                     'https://wns2-par02p.notify.windows.com/w/?token=x']:
            self.assertEqual(self.client.post('/api/admin/push/', subscription(good), format='json').status_code, 201, good)

    def test_non_admins_cannot_sign_up(self):
        self.as_(self.fan('nosy@example.com'))
        self.assertEqual(self.client.post('/api/admin/push/', subscription(), format='json').status_code, 403)

    def test_admin_notifications_are_pushed_to_their_devices(self):
        self.as_(self.boss)
        self.client.post('/api/admin/push/', subscription(), format='json')
        notify_admins('support_request', 'New chat from Ada', body='Ticket email never came', link='/support')

        self.webpush.assert_called_once()
        kwargs = self.webpush.call_args.kwargs
        self.assertEqual(kwargs['subscription_info']['endpoint'], CHROME)
        payload = json.loads(kwargs['data'])
        self.assertEqual((payload['title'], payload['body'], payload['link'], payload['audience']),
                         ('New chat from Ada', 'Ticket email never came', '/support', 'admin'))
        self.assertIsNotNone(PushSubscription.objects.get().last_sent_at)

    def test_organiser_notifications_do_not_go_to_admin_devices(self):
        self.as_(self.boss)
        self.client.post('/api/admin/push/', subscription(), format='json')
        notify(self.boss, 'ticket_sale', '2 tickets sold')  # the boss's organiser bell, not the admin one
        self.webpush.assert_not_called()

    def test_devices_the_push_service_has_forgotten_are_removed(self):
        from pywebpush import WebPushException
        self.as_(self.boss)
        self.client.post('/api/admin/push/', subscription(), format='json')
        self.webpush.side_effect = WebPushException('gone', response=MagicMock(status_code=410))
        notify_admins('report', 'New report')
        self.assertFalse(PushSubscription.objects.exists())
        # The notification itself still exists in the bell.
        self.assertTrue(Notification.objects.filter(recipient=self.boss, kind='report').exists())

    @override_settings(VAPID_PUBLIC_KEY='', VAPID_PRIVATE_KEY='')
    def test_without_keys_push_is_off(self):
        self.as_(self.boss)
        self.assertEqual(self.client.get('/api/admin/push/').json(), {'configured': False, 'public_key': ''})
        self.assertEqual(self.client.post('/api/admin/push/', subscription(), format='json').status_code, 503)
        notify_admins('report', 'New report')
        self.webpush.assert_not_called()
