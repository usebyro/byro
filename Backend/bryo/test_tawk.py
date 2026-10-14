"""tawk.to webhooks: chats and offline messages land in Admin > Support > Requests."""
import hashlib
import hmac
import json

from django.test import override_settings

from .models import AdminAction, Notification, SupportRequest
from .test_admin_tools import AdminBase

SECRET = 'tawk-test-secret'


@override_settings(TAWK_WEBHOOK_SECRET=SECRET)
class TawkWebhookTests(AdminBase):

    def hook(self, payload, signature=None):
        body = json.dumps(payload).encode()
        sig = signature if signature is not None else hmac.new(SECRET.encode(), body, hashlib.sha1).hexdigest()
        self.client.force_authenticate(None)
        return self.client.post('/api/webhooks/tawk/', body, content_type='application/json',
                                HTTP_X_TAWK_SIGNATURE=sig, HTTP_X_HOOK_EVENT_ID='evt-1')

    def chat_start(self, chat_id='chat-1'):
        return {
            'event': 'chat:start', 'chatId': chat_id, 'time': '2026-10-14T10:00:00Z',
            'message': {'text': 'My ticket email never came', 'type': 'msg', 'sender': {'type': 'visitor'}},
            'visitor': {'name': 'Ada', 'email': 'ada@example.com', 'city': 'Lagos', 'country': 'NG'},
            'property': {'id': 'p1', 'name': 'Byro'},
        }

    def test_a_new_chat_becomes_an_open_request_and_admins_hear_about_it(self):
        res = self.hook(self.chat_start())
        self.assertEqual(res.status_code, 200)
        r = SupportRequest.objects.get()
        self.assertEqual((r.source, r.external_id, r.name, r.email, r.status),
                         ('tawk_chat', 'chat-1', 'Ada', 'ada@example.com', 'open'))
        self.assertEqual(r.message, 'My ticket email never came')
        self.assertEqual(r.location, 'Lagos, NG')
        self.assertTrue(Notification.objects.filter(recipient=self.boss, kind='support_request').exists())

    def test_retries_and_later_events_update_the_same_request_without_a_second_alert(self):
        self.hook(self.chat_start())
        self.hook(self.chat_start())
        self.hook({**self.chat_start(), 'event': 'chat:end'})
        self.assertEqual(SupportRequest.objects.count(), 1)
        self.assertEqual(Notification.objects.filter(recipient=self.boss, kind='support_request').count(), 1)

    def test_the_transcript_is_saved_on_the_chat(self):
        self.hook(self.chat_start())
        res = self.hook({
            'event': 'chat:transcript_created', 'time': '2026-10-14T10:20:00Z',
            'chat': {
                'id': 'chat-1', 'visitor': {'name': 'Ada', 'email': 'ada@example.com'},
                'messages': [
                    {'sender': {'t': 'v', 'n': 'Ada'}, 'type': 'msg', 'msg': 'My ticket email never came', 'time': 't1'},
                    {'sender': {'t': 'a', 'n': 'Sam'}, 'type': 'msg', 'msg': 'Resent it now', 'time': 't2'},
                ],
            },
        })
        self.assertEqual(res.status_code, 200)
        r = SupportRequest.objects.get()
        self.assertEqual([(l['who'], l['text']) for l in r.transcript],
                         [('visitor', 'My ticket email never came'), ('agent', 'Resent it now')])

    def test_an_offline_ticket_becomes_a_request(self):
        res = self.hook({
            'event': 'ticket:create', 'time': '2026-10-14T22:00:00Z',
            'requester': {'name': 'Bola', 'email': 'bola@example.com', 'type': 'visitor'},
            'ticket': {'id': 't-9', 'humanId': 42, 'subject': 'Refund', 'message': 'Event was cancelled'},
        })
        self.assertEqual(res.status_code, 200)
        r = SupportRequest.objects.get()
        self.assertEqual((r.source, r.reference, r.subject, r.email), ('tawk_ticket', '42', 'Refund', 'bola@example.com'))

    def test_bad_signatures_and_unknown_events_are_ignored(self):
        self.assertEqual(self.hook(self.chat_start(), signature='0' * 40).status_code, 401)
        self.assertEqual(self.hook(self.chat_start(), signature='').status_code, 401)
        self.assertEqual(self.hook({'event': 'chat:something_new'}).status_code, 200)
        self.assertEqual(SupportRequest.objects.count(), 0)

    @override_settings(TAWK_WEBHOOK_SECRET='')
    def test_without_a_secret_the_webhook_is_off(self):
        self.assertEqual(self.hook(self.chat_start(), signature='x').status_code, 503)

    def test_admins_list_assign_and_close_requests(self):
        self.hook(self.chat_start())
        self.hook(self.chat_start('chat-2'))
        rid = SupportRequest.objects.get(external_id='chat-1').pk

        self.as_(self.viewer)
        data = self.client.get('/api/admin/support/requests/?status=open').json()
        self.assertEqual((data['open'], len(data['requests']), data['configured']), (2, 2, True))
        self.assertEqual(self.client.get('/api/admin/support/requests/?count_only=1').json(), {'open': 2})
        self.assertEqual(self.client.patch(f'/api/admin/support/requests/{rid}/', {'status': 'done'}, format='json').status_code, 403)

        self.as_(self.boss)
        res = self.client.patch(f'/api/admin/support/requests/{rid}/', {'assign': 'me'}, format='json')
        self.assertEqual(res.json()['assigned_to_email'], 'boss@example.com')
        self.assertEqual(len(self.client.get('/api/admin/support/requests/?mine=1').json()['requests']), 1)

        res = self.client.patch(f'/api/admin/support/requests/{rid}/', {'status': 'done'}, format='json')
        self.assertEqual((res.json()['status'], res.json()['closed_by_email']), ('done', 'boss@example.com'))
        self.assertTrue(AdminAction.objects.filter(action='request.closed', target_id=str(rid)).exists())
        self.assertEqual(self.client.get('/api/admin/support/requests/?count_only=1').json(), {'open': 1})
        self.assertEqual(len(self.client.get('/api/admin/support/requests/?search=ada').json()['requests']), 2)

        res = self.client.patch(f'/api/admin/support/requests/{rid}/', {'status': 'open'}, format='json')
        self.assertEqual((res.json()['status'], res.json()['closed_at']), ('open', None))
        self.assertEqual(self.client.patch(f'/api/admin/support/requests/{rid}/', {'status': 'lost'}, format='json').status_code, 400)

    def test_a_request_can_be_handed_to_a_teammate_who_is_told(self):
        from .models import AdminMember
        self.hook(self.chat_start())
        rid = SupportRequest.objects.get().pk
        mate = self.fan('mate@example.com')
        AdminMember.objects.create(email='mate@example.com', role='owner')
        self.as_(self.boss)
        self.assertEqual(self.client.get('/api/admin/support/requests/').json()['team'], ['boss@example.com', 'mate@example.com'])

        res = self.client.patch(f'/api/admin/support/requests/{rid}/', {'assign': 'Mate@example.com'}, format='json')
        self.assertEqual(res.json()['assigned_to_email'], 'mate@example.com')
        self.assertTrue(Notification.objects.filter(recipient=mate, title__contains='gave you a support request').exists())

        # Viewers can't act on requests, and strangers aren't on the team.
        for who in ['viewer@example.com', 'stranger@example.com']:
            res = self.client.patch(f'/api/admin/support/requests/{rid}/', {'assign': who}, format='json')
            self.assertEqual(res.status_code, 400)
        self.assertEqual(SupportRequest.objects.get().assigned_to_email, 'mate@example.com')

        self.client.patch(f'/api/admin/support/requests/{rid}/', {'assign': ''}, format='json')
        self.assertEqual(SupportRequest.objects.get().assigned_to_email, '')

    def test_non_admins_cannot_see_requests(self):
        self.as_(self.fan('nosy@example.com'))
        self.assertEqual(self.client.get('/api/admin/support/requests/').status_code, 403)
