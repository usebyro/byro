"""Admin actions on events: visibility, and the other moderation tools added with it."""
import tempfile
from unittest.mock import patch

from django.test import override_settings
from django.utils import timezone

from .models import AdminAction, AdminMember, CustomUser as User
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


class PayoutHoldTests(AdminBase):

    def setUp(self):
        super().setUp()
        from decimal import Decimal
        from .models import PayoutRequest
        self.payout = PayoutRequest.objects.create(
            user=self.owner, amount=Decimal('5000'), method='bank',
            bank_name='GTBank', account_number='0123456789', account_name='Lagos Run',
        )

    def patch(self, user, **body):
        self.as_(user)
        return self.client.patch(f'/api/admin/payouts/{self.payout.pk}/', body, format='json')

    def test_hold_needs_a_reason_and_shows_it_to_the_organiser(self):
        self.assertEqual(self.patch(self.boss, status='on_hold').status_code, 400)
        r = self.patch(self.boss, status='on_hold', reason='We need a copy of your ID')
        self.assertEqual((r.status_code, r.json()['status'], r.json()['hold_reason']), (200, 'on_hold', 'We need a copy of your ID'))
        self.assertTrue(AdminAction.objects.filter(action=AdminAction.ACTION_PAYOUT_HELD).exists())
        self.as_(self.owner)
        mine = self.client.get('/api/payouts/').json()
        self.assertEqual(mine[0]['status'], 'on_hold')
        bal = self.client.get('/api/payouts/balance/').json()
        self.assertEqual((bal['pending'], bal['on_hold']), ('5000.00', '5000.00'))

    def test_held_money_stays_reserved(self):
        from .views import compute_available_balance
        before = compute_available_balance(self.owner)
        self.patch(self.boss, status='on_hold', reason='Checking the event')
        self.assertEqual(compute_available_balance(self.owner), before)

    def test_release_puts_it_back_to_pending_and_clears_the_reason(self):
        self.patch(self.boss, status='on_hold', reason='Checking the event')
        r = self.patch(self.boss, status='pending')
        self.assertEqual((r.json()['status'], r.json()['hold_reason']), ('pending', ''))
        self.assertTrue(AdminAction.objects.filter(action=AdminAction.ACTION_PAYOUT_RELEASED).exists())

    def test_only_pending_can_be_held_and_only_held_can_be_released(self):
        self.assertEqual(self.patch(self.boss, status='pending').status_code, 400)
        self.patch(self.boss, status='processed')
        self.assertEqual(self.patch(self.boss, status='on_hold', reason='Too late').status_code, 400)

    def test_a_held_payout_can_still_be_paid_or_rejected(self):
        self.patch(self.boss, status='on_hold', reason='Checking')
        r = self.patch(self.boss, status='rejected')
        self.assertEqual((r.json()['status'], r.json()['hold_reason']), ('rejected', ''))

    def test_viewers_cannot_hold(self):
        self.assertEqual(self.patch(self.viewer, status='on_hold', reason='nope').status_code, 403)


class AdminCancelTests(AdminBase):

    def setUp(self):
        super().setUp()
        self.event.day = timezone.localdate() + timezone.timedelta(days=5)
        self.event.save()
        self.url = f'/api/admin/events/{self.event.pk}/cancel/'

    def test_admin_cancels_for_the_organiser_and_it_is_logged_and_the_organiser_told(self):
        from .models import Notification
        self.as_(self.boss)
        self.assertFalse(self.client.get(self.url).json()['cancelled'])
        r = self.client.post(self.url, {'reason': 'Against our policies'}, format='json')
        self.assertEqual(r.status_code, 200)
        self.event.refresh_from_db()
        self.assertIsNotNone(self.event.cancelled_at)
        self.assertEqual(self.event.cancel_reason, 'Against our policies')
        self.assertTrue(AdminAction.objects.filter(action=AdminAction.ACTION_EVENT_CANCELLED).exists())
        self.assertTrue(Notification.objects.filter(recipient=self.owner, kind='event_cancelled_by_byro').exists())

    def test_a_reason_is_required_and_it_cannot_be_cancelled_twice(self):
        self.as_(self.boss)
        self.assertEqual(self.client.post(self.url, {'reason': ''}, format='json').status_code, 400)
        self.client.post(self.url, {'reason': 'Fraud'}, format='json')
        self.assertEqual(self.client.post(self.url, {'reason': 'Fraud'}, format='json').status_code, 400)

    def test_viewers_and_organisers_cannot_use_it(self):
        self.as_(self.viewer)
        self.assertEqual(self.client.post(self.url, {'reason': 'Fraud'}, format='json').status_code, 403)
        self.as_(self.owner)
        self.assertEqual(self.client.post(self.url, {'reason': 'Fraud'}, format='json').status_code, 403)


class SalesTests(AdminBase):

    def patch(self, user, **body):
        self.as_(user)
        return self.client.patch(f'/api/admin/events/{self.event.pk}/', body, format='json')

    def register(self):
        self.as_(User.objects.filter(email='late@example.com').first() or self.fan('late@example.com'))
        type(self.event).objects.filter(pk=self.event.pk).update(ticket_price=0)
        return self.client.post(f'/api/events/{self.event.slug}/register/',
                                {'name': 'Late', 'email': 'late@example.com'}, format='json')

    def test_closing_sales_blocks_registration_and_reopening_allows_it(self):
        r = self.patch(self.boss, sales_closed=True)
        self.assertTrue(r.json()['sales_closed'])
        self.assertEqual(self.register().status_code, 400)
        self.patch(self.boss, sales_closed=False)
        self.assertEqual(self.register().status_code, 201)
        actions = set(AdminAction.objects.values_list('action', flat=True))
        self.assertTrue({AdminAction.ACTION_EVENT_SALES_CLOSED, AdminAction.ACTION_EVENT_SALES_REOPENED} <= actions)

    def test_the_organiser_is_told_when_sales_close(self):
        from .models import Notification
        self.patch(self.boss, sales_closed=True)
        self.assertTrue(Notification.objects.filter(recipient=self.owner, kind='event_sales_closed').exists())

    def test_move_to_draft_only_when_nobody_has_a_ticket(self):
        self.event.is_draft = False
        self.event.save()
        r = self.patch(self.boss, is_draft=True)
        self.assertEqual((r.status_code, r.json()['is_draft']), (200, True))
        self.assertTrue(AdminAction.objects.filter(action=AdminAction.ACTION_EVENT_TO_DRAFT).exists())

    def test_move_to_draft_is_refused_once_tickets_exist(self):
        from .models import Ticket
        Ticket.objects.create(event=self.event, original_owner_name='A', original_owner_email='a@example.com',
                              current_owner_name='A', current_owner_email='a@example.com', payment_status='paid')
        r = self.patch(self.boss, is_draft=True)
        self.assertEqual(r.status_code, 400)
        self.event.refresh_from_db()
        self.assertFalse(self.event.is_draft)

    def test_viewers_cannot_close_sales(self):
        self.assertEqual(self.patch(self.viewer, sales_closed=True).status_code, 403)


class EditDetailsTests(AdminBase):

    def patch(self, user, **body):
        self.as_(user)
        return self.client.patch(f'/api/admin/events/{self.event.pk}/', body, format='json')

    def test_admin_fixes_a_typo_and_the_organiser_is_told_what_changed(self):
        from .models import Notification
        old_slug = self.event.slug
        r = self.patch(self.boss, name='Lagos Run Club 5k', location='Lekki Phase 1', note='Fixed a typo')
        self.assertEqual((r.status_code, r.json()['name']), (200, 'Lagos Run Club 5k'))
        self.event.refresh_from_db()
        self.assertEqual((self.event.name, self.event.location, self.event.slug), ('Lagos Run Club 5k', 'Lekki Phase 1', old_slug))
        log = AdminAction.objects.get(action=AdminAction.ACTION_EVENT_EDITED)
        self.assertEqual(log.detail, 'name, location')
        n = Notification.objects.get(recipient=self.owner, kind='event_edited_by_byro')
        self.assertEqual(n.body, 'Fixed a typo')

    def test_nothing_logged_when_nothing_changed(self):
        self.patch(self.boss, name=self.event.name)
        self.assertFalse(AdminAction.objects.filter(action=AdminAction.ACTION_EVENT_EDITED).exists())

    def test_empty_or_too_long_values_are_refused(self):
        self.assertEqual(self.patch(self.boss, name='  ').status_code, 400)
        self.assertEqual(self.patch(self.boss, name='x' * 101).status_code, 400)

    @override_settings(MEDIA_ROOT=tempfile.mkdtemp())
    def test_image_can_be_removed(self):
        from django.core.files.uploadedfile import SimpleUploadedFile
        self.event.event_image.save('x.png', SimpleUploadedFile('x.png', b'\x89PNG\r\n'), save=True)
        self.patch(self.boss, remove_image=True)
        self.event.refresh_from_db()
        self.assertFalse(self.event.event_image)
        self.assertIn('image', AdminAction.objects.get(action=AdminAction.ACTION_EVENT_EDITED).detail)

    def test_viewers_cannot_edit(self):
        self.assertEqual(self.patch(self.viewer, name='Hacked').status_code, 403)


class TicketFixTests(AdminBase):

    def setUp(self):
        super().setUp()
        from .models import Ticket
        self.ticket = Ticket.objects.create(
            event=self.event, original_owner_name='Ada', original_owner_email='ada@exmaple.com',
            current_owner_name='Ada', current_owner_email='ada@exmaple.com', payment_status='free',
        )
        p = patch('bryo.views.send_ticket_confirmation_email')
        self.sent = p.start()
        self.addCleanup(p.stop)
        p = patch('bryo.mailer.send_email')
        self.mail_out = p.start()
        self.addCleanup(p.stop)

    def post(self, user, what, **body):
        self.as_(user)
        return self.client.post(f'/api/admin/support/tickets/{self.ticket.ticket_id}/{what}/', body, format='json')

    def test_void_a_free_ticket_tells_the_holder(self):
        r = self.post(self.boss, 'void', reason='Duplicate sign-up')
        self.assertEqual((r.status_code, r.json()['status']), (200, 'cancelled'))
        self.assertTrue(AdminAction.objects.filter(action=AdminAction.ACTION_TICKET_VOIDED).exists())
        self.assertEqual(self.mail_out.call_args.kwargs['to'], 'ada@exmaple.com')

    def test_void_needs_a_reason_and_refuses_paid_and_checked_in_tickets(self):
        self.assertEqual(self.post(self.boss, 'void').status_code, 400)
        self.ticket.checked_in = True
        self.ticket.save()
        self.assertEqual(self.post(self.boss, 'void', reason='Fake').status_code, 400)
        self.ticket.checked_in, self.ticket.payment_status = False, 'paid'
        self.ticket.save()
        self.assertEqual(self.post(self.boss, 'void', reason='Fake').status_code, 400)

    def test_fixing_a_mistyped_email_moves_the_ticket_and_sends_it_there(self):
        r = self.post(self.boss, 'email', email='Ada@Example.com')
        self.assertEqual((r.status_code, r.json()['holder_email']), (200, 'ada@example.com'))
        self.ticket.refresh_from_db()
        self.assertEqual((self.ticket.current_owner_email, self.ticket.original_owner_email), ('ada@example.com', 'ada@example.com'))
        self.assertEqual(self.sent.call_args.args[2], 'ada@example.com')
        self.assertTrue(AdminAction.objects.filter(action=AdminAction.ACTION_TICKET_EMAIL_CHANGED).exists())

    def test_email_change_moves_the_stamp_too_and_refuses_bad_addresses(self):
        from .models import Stamp
        Stamp.objects.create(ticket=self.ticket, event=self.event, email='ada@exmaple.com')
        self.post(self.boss, 'email', email='ada@example.com')
        self.assertEqual(Stamp.objects.get(ticket=self.ticket).email, 'ada@example.com')
        self.assertEqual(self.post(self.boss, 'email', email='not-an-email').status_code, 400)
        self.assertEqual(self.post(self.boss, 'email', email='ada@example.com').status_code, 400)

    def test_viewers_cannot_use_either(self):
        self.assertEqual(self.post(self.viewer, 'void', reason='x y z').status_code, 403)
        self.assertEqual(self.post(self.viewer, 'email', email='a@b.co').status_code, 403)


class AccessTests(AdminBase):

    def setUp(self):
        super().setUp()
        p = patch('bryo.views.send_cohost_invite_email')
        self.invite = p.start()
        self.addCleanup(p.stop)

    def post(self, user, what, **body):
        self.as_(user)
        return self.client.post(f'/api/admin/events/{self.event.pk}/{what}/', body, format='json')

    def test_add_a_cohost_with_an_account_gives_access_straight_away(self):
        from .models import EventCoHost
        helper = self.fan('helper@example.com')
        r = self.post(self.boss, 'cohosts', email='helper@example.com')
        self.assertEqual((r.status_code, r.json()['pending']), (201, False))
        grant = EventCoHost.objects.get(event=self.event, user=helper)
        self.assertEqual((grant.status, grant.role), ('accepted', 'manager'))
        self.assertTrue(self.invite.called)
        self.assertTrue(AdminAction.objects.filter(action=AdminAction.ACTION_EVENT_COHOST_ADDED).exists())

    def test_unknown_address_becomes_a_pending_invite_and_duplicates_are_refused(self):
        from .models import EventCoHost
        r = self.post(self.boss, 'cohosts', email='new@example.com', role='checkin')
        self.assertEqual((r.status_code, r.json()['pending']), (201, True))
        self.assertEqual(EventCoHost.objects.get(invited_email='new@example.com').status, 'pending')
        self.assertEqual(self.post(self.boss, 'cohosts', email='new@example.com').status_code, 400)
        self.assertEqual(self.post(self.boss, 'cohosts', email=self.owner.email).status_code, 400)
        self.assertEqual(self.post(self.boss, 'cohosts', email='nope').status_code, 400)

