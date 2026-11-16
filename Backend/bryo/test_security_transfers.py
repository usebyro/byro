"""Ticket transfers: a used ticket can't move, only the newest link works, and two people can't both accept."""
from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from .models import Ticket, TicketTransfer
from .test_payments import make_event

User = get_user_model()


class TransferTests(TestCase):
    def setUp(self):
        patch('bryo.mailer.send_email').start()
        self.addCleanup(patch.stopall)
        owner = User.objects.create_user(email='owner@example.com')
        self.event = make_event(owner, ticket_price=Decimal('0'), transferable=True)
        self.ticket = Ticket.objects.create(
            event=self.event, original_owner_name='Ada', original_owner_email='ada@example.com',
            current_owner_name='Ada', current_owner_email='ada@example.com', payment_status='paid')
        self.client = APIClient()

    def start(self, to='bola@example.com', ticket=None):
        ticket = ticket or self.ticket
        r = self.client.post(f'/api/tickets/{ticket.ticket_id}/transfer/',
                             {'to_user_name': 'Bola', 'to_user_email': to}, format='json')
        return r

    def accept(self, transfer):
        return self.client.post(f'/api/transfers/{transfer.transfer_key}/accept/')

    def last(self):
        return TicketTransfer.objects.order_by('-pk').first()

    def test_a_normal_transfer_still_works(self):
        self.assertEqual(self.start().status_code, 201)
        self.assertEqual(self.accept(self.last()).status_code, 200)
        self.ticket.refresh_from_db()
        self.assertEqual(self.ticket.current_owner_email, 'bola@example.com')

    def test_a_ticket_already_used_at_the_door_cannot_be_transferred(self):
        Ticket.objects.filter(pk=self.ticket.pk).update(checked_in=True, checked_in_at=timezone.now())
        self.assertEqual(self.start().status_code, 400)
        self.assertFalse(TicketTransfer.objects.exists())

    def test_a_transfer_started_before_check_in_cannot_be_accepted_after_it(self):
        self.start()
        transfer = self.last()
        Ticket.objects.filter(pk=self.ticket.pk).update(checked_in=True)
        self.assertEqual(self.accept(transfer).status_code, 400)
        self.ticket.refresh_from_db()
        self.assertEqual(self.ticket.current_owner_email, 'ada@example.com')

    def test_an_unpaid_ticket_cannot_be_transferred(self):
        Ticket.objects.filter(pk=self.ticket.pk).update(payment_status='pending')
        self.assertEqual(self.start().status_code, 400)

    def test_only_the_newest_link_works(self):
        self.start('bola@example.com')
        old = self.last()
        self.start('chidi@example.com')
        new = self.last()
        self.assertEqual(self.accept(old).status_code, 400)
        self.assertEqual(self.accept(new).status_code, 200)
        self.ticket.refresh_from_db()
        self.assertEqual(self.ticket.current_owner_email, 'chidi@example.com')

    def test_a_link_cannot_be_used_twice(self):
        self.start()
        transfer = self.last()
        self.assertEqual(self.accept(transfer).status_code, 200)
        self.assertEqual(self.accept(transfer).status_code, 400)

    def test_a_link_goes_dead_if_the_sender_no_longer_holds_the_ticket(self):
        self.start('bola@example.com')
        transfer = self.last()
        Ticket.objects.filter(pk=self.ticket.pk).update(current_owner_email='someone.else@example.com')
        self.assertEqual(self.accept(transfer).status_code, 400)
        self.ticket.refresh_from_db()
        self.assertEqual(self.ticket.current_owner_email, 'someone.else@example.com')

    def test_the_sender_match_ignores_case_and_spaces(self):
        self.start()
        Ticket.objects.filter(pk=self.ticket.pk).update(current_owner_email='  ADA@Example.com ')
        self.assertEqual(self.accept(self.last()).status_code, 200)

    def test_a_ticket_event_that_is_not_transferable_still_refuses(self):
        self.event.transferable = False
        self.event.save(update_fields=['transferable'])
        self.assertEqual(self.start().status_code, 400)
