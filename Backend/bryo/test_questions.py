"""
Tests for questions organisers ask attendees: creating them, and capturing the
answers on both free and paid orders.
"""

from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth import get_user_model

from django.test import override_settings

from .models import EventFormAnswer, EventFormQuestion, Ticket
from .test_payments import (
    INITIALIZE_URL, PAYMENT_SETTINGS, PAYSTACK_OK, FakeResponse, PaymentTestBase,
    make_event, make_payment,
)
from .views import _fulfil_payment


User = get_user_model()


def question(event, text='Shirt size?', qtype='radio', options=('S', 'M', 'L'), required=False, order=0):
    return EventFormQuestion.objects.create(
        event=event, question=text, question_type=qtype,
        options=list(options), required=required, order=order,
    )


class QuestionSetupTests(PaymentTestBase):
    """PUT /events/<slug>/form-questions/ saves an event's whole list."""

    def setUp(self):
        super().setUp()
        self.url = f'/api/events/{self.event.slug}/form-questions/'
        self.client.force_authenticate(self.owner)

    def put(self, items):
        return self.client.put(self.url, {'questions': items}, format='json')

    def test_saves_the_three_kinds_in_order(self):
        res = self.put([
            {'question': 'Which session?', 'question_type': 'radio', 'options': ['AM', 'PM'], 'required': True},
            {'question': 'First time here?', 'question_type': 'yesno'},
            {'question': 'Anything else?', 'question_type': 'textarea'},
        ])
        self.assertEqual(res.status_code, 200)
        saved = list(self.event.form_questions.all())
        self.assertEqual([q.question_type for q in saved], ['radio', 'yesno', 'textarea'])
        self.assertEqual(saved[0].options, ['AM', 'PM'])
        self.assertTrue(saved[0].required)
        self.assertEqual(saved[1].options, ['Yes', 'No'])  # fixed for yes/no
        self.assertEqual(saved[2].options, [])

    def test_a_choice_question_needs_two_choices(self):
        res = self.put([{'question': 'Pick', 'question_type': 'radio', 'options': ['Only one']}])
        self.assertEqual(res.status_code, 400)
        self.assertEqual(self.event.form_questions.count(), 0)

    def test_changing_the_list_edits_adds_and_removes(self):
        keep = question(self.event, 'Keep me', 'textarea', options=())
        gone = question(self.event, 'Remove me', 'textarea', options=(), order=1)
        res = self.put([
            {'id': keep.id, 'question': 'Kept, renamed', 'question_type': 'textarea'},
            {'question': 'Brand new', 'question_type': 'yesno'},
        ])
        self.assertEqual(res.status_code, 200)
        keep.refresh_from_db()
        self.assertEqual(keep.question, 'Kept, renamed')
        self.assertFalse(EventFormQuestion.objects.filter(pk=gone.pk).exists())
        self.assertEqual(self.event.form_questions.count(), 2)

    def test_a_question_guests_already_answered_cannot_be_removed(self):
        q = question(self.event, 'Answered', 'textarea', options=())
        ticket = Ticket.objects.create(
            event=self.event, original_owner_name='A', original_owner_email='a@example.com',
            current_owner_name='A', current_owner_email='a@example.com', payment_status='free',
        )
        EventFormAnswer.objects.create(ticket=ticket, question=q, answer='hello')
        res = self.put([])
        self.assertEqual(res.status_code, 400)
        self.assertTrue(EventFormQuestion.objects.filter(pk=q.pk).exists())

    def test_only_people_who_manage_the_event_can_change_questions(self):
        self.client.force_authenticate(None)
        self.assertEqual(self.put([]).status_code, 401)
        stranger = User.objects.create_user(email='stranger@example.com')
        self.client.force_authenticate(stranger)
        self.assertEqual(self.put([]).status_code, 403)

    def test_anyone_can_read_the_questions_so_buyers_can_answer_them(self):
        question(self.event, 'Shirt size?')
        self.client.force_authenticate(None)
        res = self.client.get(self.url)
        self.assertEqual(res.status_code, 200)
        self.assertEqual([q['question'] for q in res.json()], ['Shirt size?'])


@override_settings(**PAYMENT_SETTINGS)
class AnswerCaptureTests(PaymentTestBase):

    def setUp(self):
        super().setUp()
        self.size = question(self.event, 'Shirt size?', 'radio', ('S', 'M', 'L'), required=True)
        self.notes = question(self.event, 'Notes', 'textarea', (), order=1)
        self.topics = question(self.event, 'Topics', 'checkbox', ('AI', 'Design', 'Ops'), order=2)

    def initialize(self, answers, event=None):
        event = event or self.event
        with patch('bryo.views.check_and_remember_verification', return_value=True), \
             patch('bryo.views.requests.post', return_value=FakeResponse(PAYSTACK_OK)), \
             patch('bryo.views._email_tickets'):
            return self.client.post(INITIALIZE_URL, {
                'event_slug': event.slug, 'customer_email': 'buyer@example.com',
                'customer_name': 'Buyer One', 'quantity': 2, 'form_answers': answers,
            }, format='json')

    def test_a_required_question_must_be_answered_before_paying(self):
        res = self.initialize([])
        self.assertEqual(res.status_code, 400)
        self.assertIn('Shirt size?', res.json()['error'])
        self.assertEqual(self.event.payments.count(), 0)  # no seats held, no payment

    def test_a_choice_the_organiser_did_not_offer_is_refused(self):
        res = self.initialize([{'question_id': self.size.id, 'answer': 'XXL'}])
        self.assertEqual(res.status_code, 400)

    def test_paid_order_keeps_answers_until_fulfilment_then_puts_them_on_every_ticket(self):
        res = self.initialize([
            {'question_id': self.size.id, 'answer': 'M'},
            {'question_id': self.topics.id, 'answer': ['Ops', 'AI']},
        ])
        self.assertEqual(res.status_code, 200)
        payment = self.event.payments.get()
        self.assertEqual(len(payment.metadata['form_answers']), 2)
        self.assertEqual(Ticket.objects.count(), 0)

        _fulfil_payment(payment, None)

        tickets = Ticket.objects.all()
        self.assertEqual(tickets.count(), 2)
        for ticket in tickets:
            answers = {a.question_id: a.answer for a in ticket.form_answers.all()}
            self.assertEqual(answers, {self.size.id: 'M', self.topics.id: ['AI', 'Ops']})

    def test_free_order_saves_answers_on_its_tickets(self):
        free = make_event(self.owner, name='Free one', ticket_price=Decimal('0'), capacity=50)
        q = question(free, 'First time?', 'yesno', ('Yes', 'No'), required=True)
        res = self.initialize([{'question_id': q.id, 'answer': 'Yes'}], event=free)
        self.assertEqual(res.status_code, 201)
        self.assertEqual(EventFormAnswer.objects.filter(question=q, answer='Yes').count(), 2)

    def test_unanswered_optional_questions_are_simply_skipped(self):
        res = self.initialize([{'question_id': self.size.id, 'answer': 'S'}])
        self.assertEqual(res.status_code, 200)
        _fulfil_payment(self.event.payments.get(), None)
        self.assertFalse(EventFormAnswer.objects.filter(question=self.notes).exists())

    def test_an_event_without_questions_still_checks_out(self):
        plain = make_event(self.owner, name='Plain', ticket_price=Decimal('5000'), capacity=50)
        self.assertEqual(self.initialize([], event=plain).status_code, 200)
