"""run_jobs: the one scheduled command that runs every background job."""
from datetime import datetime
from unittest.mock import patch

from django.core.management import CommandError, call_command
from django.test import SimpleTestCase

LAGOS = 'bryo.management.commands.run_jobs.datetime'


class RunJobsTests(SimpleTestCase):

    def run_at(self, hour, fail=None):
        ran = []

        def fake(name, **kw):
            ran.append(name)
            if name == fail:
                raise RuntimeError('boom')

        with patch('bryo.management.commands.run_jobs.call_command', side_effect=fake), patch(LAGOS) as dt:
            dt.now.return_value = datetime(2026, 10, 15, hour, 0)
            try:
                call_command('run_jobs')
            except CommandError as e:
                return ran, str(e)
        return ran, None

    def test_reminders_wait_until_nine_in_lagos(self):
        self.assertEqual(self.run_at(8)[0], ['send_scheduled_messages', 'process_refunds'])
        self.assertEqual(self.run_at(9)[0], ['send_scheduled_messages', 'process_refunds', 'send_event_reminders'])

    def test_one_failing_job_does_not_stop_the_others(self):
        ran, error = self.run_at(10, fail='send_scheduled_messages')
        self.assertEqual(ran, ['send_scheduled_messages', 'process_refunds', 'send_event_reminders'])
        self.assertIn('send_scheduled_messages', error)
