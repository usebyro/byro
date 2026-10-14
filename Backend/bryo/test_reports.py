"""Reports: anyone can flag an event or community; Byro admins review and close them."""
from django.core.cache import cache

from .models import AdminAction, AdminMember, Notification, Report
from .test_admin_tools import AdminBase


class ReportTests(AdminBase):

    def setUp(self):
        super().setUp()
        cache.clear()

    def report(self, who=None, **kw):
        self.as_(who)
        body = {'target': 'event', 'slug': self.event.slug, 'reason': 'scam', 'details': 'Asks for bank transfer'}
        body.update(kw)
        return self.client.post('/api/reports/', body, format='json')

    def test_signed_out_visitors_can_report_an_event_and_admins_hear_about_it(self):
        res = self.report(email='visitor@example.com')
        self.assertEqual(res.status_code, 201)
        r = Report.objects.get()
        self.assertEqual((r.target_type, r.event, r.reason, r.reporter_email), ('event', self.event, 'scam', 'visitor@example.com'))
        self.assertTrue(Notification.objects.filter(recipient=self.boss, kind='report').exists())

    def test_reporting_a_community(self):
        res = self.report(target='community', handle='LagosRun', slug=None, reason='misleading')
        self.assertEqual(res.status_code, 201)
        self.assertEqual(Report.objects.get().community, self.owner)

    def test_bad_reports_are_refused(self):
        self.assertEqual(self.report(reason='boring').status_code, 400)
        self.assertEqual(self.report(reason='other', details='').status_code, 400)
        self.assertEqual(self.report(slug='nope').status_code, 404)
        self.assertEqual(self.report(target='planet').status_code, 400)
        self.assertEqual(self.report(email='not-an-email').status_code, 400)
        self.assertEqual(Report.objects.count(), 0)

    def test_one_open_report_per_signed_in_person(self):
        fan = self.fan('fan@example.com')
        self.assertEqual(self.report(who=fan).status_code, 201)
        self.assertEqual(self.report(who=fan).status_code, 200)
        self.assertEqual(Report.objects.count(), 1)
        self.assertEqual(Report.objects.get().reporter_email, 'fan@example.com')

    def test_reporting_is_rate_limited(self):
        codes = [self.report().status_code for _ in range(12)]
        self.assertIn(429, codes)

    def test_admins_review_and_close_reports(self):
        self.report()
        rid = Report.objects.get().pk
        self.as_(self.viewer)
        data = self.client.get('/api/admin/reports/?status=open').json()
        self.assertEqual(data['open'], 1)
        self.assertEqual(data['reports'][0]['event']['name'], self.event.name)
        self.assertEqual(self.client.patch(f'/api/admin/reports/{rid}/', {'status': 'resolved'}, format='json').status_code, 403)

        self.as_(self.boss)
        res = self.client.patch(f'/api/admin/reports/{rid}/', {'status': 'resolved', 'note': 'Event suspended'}, format='json')
        self.assertEqual(res.status_code, 200)
        r = Report.objects.get()
        self.assertEqual((r.status, r.resolution_note, r.resolved_by_email), ('resolved', 'Event suspended', 'boss@example.com'))
        self.assertTrue(AdminAction.objects.filter(action=AdminAction.ACTION_REPORT_CLOSED).exists())
        self.assertEqual(self.client.get('/api/admin/reports/?status=open').json()['open'], 0)
        # Reopen
        self.client.patch(f'/api/admin/reports/{rid}/', {'status': 'open'}, format='json')
        self.assertEqual(Report.objects.get().status, 'open')

    def test_strangers_cannot_see_reports(self):
        self.as_(self.fan('rando@example.com'))
        self.assertEqual(self.client.get('/api/admin/reports/').status_code, 403)
