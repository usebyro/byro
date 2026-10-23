from rest_framework import mixins, viewsets, status
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.views import APIView
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework.throttling import ScopedRateThrottle
from django.core.validators import validate_email
from django.core.exceptions import ValidationError as DjangoValidationError
from .services import workos_api
from .services.turnstile import check_and_remember_verification
from . import apps
from .serializers import (
    WaitListSerializer, EventSerializer, TicketSerializer,
    TicketTransferSerializer, PaymentInitializeSerializer,
    PaymentVerifySerializer, PaymentSerializer,
    UserProfileSerializer, EventFormQuestionSerializer,
    PayoutRequestSerializer,
)
from django.http import JsonResponse, HttpResponse, Http404
from django.views.decorators.csrf import csrf_exempt
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods
from django.utils.text import slugify
from django.utils.decorators import method_decorator
from django.views.decorators.cache import never_cache
from django.http import JsonResponse
from django.contrib.auth import get_user_model
from .models import (
    WaitList, Event, Ticket, TicketTransfer,
    EventCoHost, Payment, Refund, UserProfile, EventFormQuestion, EventFormAnswer,
    TicketTier, PayoutRequest, PromoCode, MerchItem, Follow, AdminAction, AdminMember, ActivityLog, Message,
    Notification,
)
from . import messaging
from .activity import log_activity
from .notifications import notify, notify_admins, ticket_sale
from .community import (
    community_stats, event_host_name, follow_organizer, notify_followers_in_background, record_stamp,
    stamps_for_user, passport_for_user, unfollow_from_token,
)
from .pricing import calculate_ticket_fees, DEFAULT_FEE_RATE, FEE_RATE, MAX_FEE_RATE, PAYSTACK_FEE_CAP, default_fee_rate, fee_rate_for
from .refunds import (
    EventCancellationError, apply_refund_webhook, authorise_refunds, cancel_event, cancellation_preview,
    paystack_balance, process_event_refunds, refund_progress, refundable_amount, send_arranged_notice,
)
from django.urls import reverse
from .serializers import EventSerializer, TicketSerializer, PaymentSerializer, TicketTierSerializer, PromoCodeSerializer, MerchItemSerializer
from .permissions import IsEventOwnerOrCoHost, IsEventOwner, IsAdminMember, get_admin_member
from django.db import transaction, IntegrityError
from django.db import models
from django.db.models import Q, Min, OuterRef, Subquery, Sum, Count, F
from django.db.models.functions import TruncDate, TruncMonth, Cast, Greatest
from django.db.models.fields.json import KeyTextTransform
from django.db.models.functions import Coalesce
from django.http import JsonResponse
from django.conf import settings
from django.shortcuts import get_object_or_404
from django.utils import timezone
import requests
import hmac
import hashlib
import logging
from decimal import Decimal
from datetime import timedelta
import os
import jwt
import uuid
import requests

logger = logging.getLogger(__name__)
import json
import logging

User = get_user_model()


logger = logging.getLogger(__name__)


class InsufficientCapacityError(Exception):
    """Raised when a purchase would exceed tier or event capacity."""
    pass


# How long a buyer's seats are held while they pay. After this a pending
# payment stops counting against capacity and the seats go back on sale.
RESERVATION_MINUTES = 10


def _paid_amount_ok(paid_kobo, expected_kobo):
    """True if Paystack's reported amount covers what we asked it to charge.

    We send Paystack `total`; Paystack adds its own fee on top (fees borne by
    the customer), so the amount it reports is `total` plus that fee. An exact
    match would reject every real payment. Underpayment is still rejected, and
    so is anything above the fee cap (NGN 2,000).
    """
    return expected_kobo <= paid_kobo <= expected_kobo + int(PAYSTACK_FEE_CAP * 100)


def _pending_reservation_count(payments_qs):
    """
    Sum the ticket quantity of recent pending payments (not yet verified).
    These haven't produced a Ticket row yet but represent reserved slots —
    counting them prevents two concurrent checkouts from both reserving the
    last spot while payment is in flight at Paystack. A hold lasts
    RESERVATION_MINUTES.
    """
    cutoff = timezone.now() - timedelta(minutes=RESERVATION_MINUTES)
    pending = payments_qs.filter(status='pending', created_at__gte=cutoff)
    return sum(p.metadata.get('seats', p.metadata.get('quantity', 1)) for p in pending)


def _release_reservation(payment):
    """Give a reserved payment's seats back (Paystack never took the order).

    Only pending payments hold seats, so marking it failed frees them."""
    Payment.objects.filter(pk=payment.pk, status='pending').update(status='failed')


def _not_enough_left(left):
    """The sold-out / too-many message a buyer sees, with how many are left."""
    if left <= 0:
        return "Sorry, these tickets just sold out."
    if left == 1:
        return "Only 1 ticket left. Choose 1 to continue."
    return f"Only {left} tickets left. Choose {left} or fewer."


def lock_and_check_capacity(event, tier_id, quantity):
    """
    Must be called inside transaction.atomic(). Locks the event row and then the
    tier row (always in that order, so two buyers can't deadlock) so concurrent
    requests are serialized and the last seat can't be sold twice.

    A purchase must fit BOTH the event's overall capacity and the chosen tier's
    own capacity. Each attendee is one ticket row, so counting rows counts seats.
    Returns the resolved TicketTier, or None if the event has no tiers.
    Raises InsufficientCapacityError if there isn't enough room.
    """
    locked_event = Event.objects.select_for_update().get(pk=event.pk)

    tier = None
    if tier_id:
        try:
            tier = TicketTier.objects.select_for_update().get(pk=tier_id, event=event)
        except TicketTier.DoesNotExist:
            raise InsufficientCapacityError("That ticket type isn't available anymore. Refresh the page and pick another.")

    seats = _seats_for(tier, quantity)

    if locked_event.capacity:
        sold = locked_event.tickets.filter(payment_status__in=['paid', 'free']).count()
        reserved = _pending_reservation_count(locked_event.payments.all())
        if sold + reserved + seats > locked_event.capacity:
            raise InsufficientCapacityError(_not_enough_left(locked_event.capacity - sold - reserved))

    if tier is not None and tier.capacity is not None:
        sold = tier.tickets.filter(payment_status__in=['paid', 'free']).count()
        reserved = _pending_reservation_count(tier.payments.all())
        if sold + reserved + seats > tier.capacity:
            raise InsufficientCapacityError(_not_enough_left(tier.capacity - sold - reserved))

    return tier


def _event_page_url(event):
    """Public page for an event."""
    return f"{settings.SITE_URL}/discover/{event.slug}"


def _checkin_counts(event):
    """How many confirmed tickets there are and how many are already inside."""
    confirmed = event.tickets.filter(payment_status__in=['paid', 'free'])
    return {'checked_in': confirmed.filter(checked_in=True).count(), 'total': confirmed.count()}


def _tickets_label(event):
    """'General admission · Free' or '3 ticket types · from ₦3,000', for the published email."""
    from .emails import _money
    tiers = list(event.tiers.all())
    if not tiers:
        price = event.ticket_price or 0
        return f"General admission · {_money(price) if price else 'Free'}"
    lowest = min(t.price for t in tiers)
    cost = _money(lowest) if lowest else "Free"
    if len(tiers) == 1:
        return f"{tiers[0].name} · {cost}"
    return f"{len(tiers)} ticket types · from {cost}"


def _event_revenue(event):
    """What the organiser has earned from this event so far (ticket price after discounts)."""
    return Ticket.objects.filter(event=event, payment_status='paid').aggregate(
        total=Coalesce(Sum(ticket_net_price_expr()), Decimal('0'))
    )['total']


def send_ticket_confirmation_email(ticket, customer_name, customer_email, event):
    """Send the "you're in" email for a single ticket, with a ticket image (QR + event details) and a calendar invite attached."""
    from datetime import datetime, timedelta
    from .emails import ticket_confirmation_email
    from .mailer import send_email
    from .models import EventFormAnswer
    from .ticket_image import generate_ticket_png
    from .ics import generate_ics

    form_answers = [
        {"question": a.question.question, "answer": ", ".join(a.answer) if isinstance(a.answer, list) else str(a.answer)}
        for a in EventFormAnswer.objects.filter(ticket=ticket).select_related('question')
    ]
    from .emails import _money, format_event_date, format_event_time
    ticket_url = f"{settings.SITE_URL}/ticket/{ticket.ticket_id}"
    date_str = format_event_date(event.day)
    time_str = format_event_time(event.time_from, event.timezone)
    tier_name = ticket.tier.name if ticket.tier else "General admission"
    price = ticket.tier.price if ticket.tier else event.ticket_price
    buyer = ticket.payment.customer_name if ticket.payment_id else ''
    gifted_by = (
        buyer if ticket.payment_id
        and ticket.payment.customer_email.strip().lower() != ticket.current_owner_email.strip().lower()
        else None
    )
    email_data = ticket_confirmation_email(
        name=customer_name,
        event_name=event.name,
        date=date_str,
        time=time_str,
        location=event.location or '',
        ticket_id=str(ticket.ticket_id),
        form_answers=form_answers,
        ticket_url=ticket_url,
        tier_label=f"{tier_name} × 1",
        holder_name=ticket.current_owner_name or customer_name,
        bought_by=gifted_by,
    )
    ticket_png = generate_ticket_png(
        event_name=event.name,
        date_str=date_str,
        time_str=time_str,
        location=event.location or '',
        attendee_name=customer_name,
        ticket_id=str(ticket.ticket_id),
        qr_data=str(ticket.qr_token),
        tier_name=ticket.tier.name if ticket.tier else None,
        hosted_by=event_host_name(event),
        price_label=_money(price) if price else "Free",
        attendee_email=ticket.current_owner_email,
    )
    start = datetime.combine(event.day, event.time_from)
    end = (
        datetime.combine(event.day, event.time_to)
        if event.time_to and event.time_to > event.time_from
        else start + timedelta(hours=2)
    )
    ics_bytes = generate_ics(
        event_name=event.name,
        description=event.description,
        location=event.location or '',
        start=start,
        end=end,
        organizer_name='Byro',
        uid=f"byro-ticket-{ticket.ticket_id}@usebyro.com",
    )
    send_email(
        to=customer_email,
        subject=email_data['subject'],
        html=email_data['html'],
        text=email_data['text'],
        attachments=[
            {
                "filename": "ticket.png",
                "content": ticket_png,
                "content_type": "image/png",
            },
            {
                "filename": "event.ics",
                "content": ics_bytes,
                "content_type": "text/calendar; charset=utf-8; method=PUBLISH",
            },
        ],
    )


def send_cohost_invite_email(email, event, inviter, is_new_user=False, role='manager'):
    """
    Notify someone that they've been made a co-host.

    For someone with no account the email's button is an "Accept" link to
    sign-in/sign-up (carrying the invited address and the event to return to),
    so no separate sign-up email is needed. Existing users just get a link to
    the event, since their access is already active.

    Best-effort: a mail failure must not undo the grant, which is already
    committed by the time this runs. Mirrors send_ticket_confirmation_email's
    use of the Resend/Brevo mailer.
    """
    from .emails import cohost_invite_email, format_event_date, format_event_time
    from .mailer import send_email

    try:
        from urllib.parse import quote
        frontend_url = (settings.FRONTEND_URL or "https://usebyro.com").rstrip('/')
        event_path = f"/dashboard/events/{event.slug}"
        if is_new_user:
            event_url = (
                f"{frontend_url}/login?redirect={quote(event_path, safe='')}"
                f"&email={quote(email, safe='')}"
            )
        else:
            event_url = f"{frontend_url}{event_path}"
        inviter_profile = getattr(inviter, 'profile', None)
        inviter_name = (
            (inviter_profile.display_name if inviter_profile else '')
            or inviter.get_full_name()
            or inviter.email
        )
        email_data = cohost_invite_email(
            event_name=event.name,
            inviter_name=inviter_name,
            event_url=event_url,
            is_new_user=is_new_user,
            role=role,
            invitee_email=email,
            date=format_event_date(event.day),
            time=format_event_time(event.time_from, event.timezone),
            location=event.location or '',
        )
        send_email(
            to=email,
            subject=email_data['subject'],
            html=email_data['html'],
            text=email_data['text'],
        )
    except Exception as e:
        logger.error("Failed to send co-host invite email to %s: %s", email, e)


def _send_event_published_email(event):
    """
    Congratulate the organiser on publishing and nudge them to share.

    Best-effort: a mail failure must not affect event creation, which has
    already committed by the time this runs.
    """
    if not event.owner_id or not event.owner.email:
        return

    from .emails import event_published_email
    from .mailer import send_email

    try:
        owner_profile = getattr(event.owner, 'profile', None)
        owner_name = (
            (owner_profile.display_name if owner_profile else '')
            or event.owner.get_full_name()
            or event.owner.email
        )
        frontend_url = (settings.FRONTEND_URL or "https://usebyro.com").rstrip('/')
        public_url = f"{frontend_url}/discover/{event.slug}"
        share_cta_url = f"{public_url}?share=1"
        is_first_event = Event.objects.filter(owner=event.owner, is_active=True).count() <= 1
        from .emails import format_event_date, format_event_time
        email_data = event_published_email(
            name=owner_name,
            event_name=event.name,
            date=format_event_date(event.day),
            time=format_event_time(event.time_from, event.timezone),
            location=event.location or '',
            event_url=public_url,
            share_cta_url=share_cta_url,
            is_first_event=is_first_event,
            tickets_label=_tickets_label(event),
            manage_url=f"{frontend_url}/dashboard/events/{event.slug}",
        )
        send_email(
            to=event.owner.email,
            subject=email_data['subject'],
            html=email_data['html'],
            text=email_data['text'],
        )
    except Exception as e:
        logger.error("Failed to send event published email for event %s: %s", event.pk, e)


def _seats_for(tier, quantity):
    """Total attendee slots a purchase produces = quantity × people-per-ticket.

    A group tier (admits_count > 1) is a SINGLE ticket that admits several
    people, so one ticket yields admits_count attendee slots."""
    admits = tier.admits_count if tier is not None else 1
    return quantity * max(admits or 1, 1)


def _normalize_attendees(attendees_raw, seats, buyer_name, buyer_email):
    """
    Return exactly `seats` {'name','email'} dicts. Seat #1 is the buyer.
    Values come from the client-supplied per-seat list; any blank seat
    (or missing entry) falls back to the buyer's name/email.
    """
    extras = attendees_raw if isinstance(attendees_raw, list) else []
    result = []
    for i in range(seats):
        item = extras[i] if i < len(extras) and isinstance(extras[i], dict) else {}
        name = (item.get('name') or '').strip()
        email = (item.get('email') or '').strip()
        result.append({
            'name': name or buyer_name,
            'email': email or buyer_email,
        })
    return result


def _get_or_create_guest_user(email, name):
    """Find or create a lightweight account for a guest (non-authenticated)
    ticket purchaser, keyed by email, so their purchase surfaces in the
    admin dashboard's user list/stats like any other account.

    No usable password is set, so this alone never grants login access. If
    the same email later signs in through WorkOS, upsert_user() links that
    login to this same row (by email) and flips auth_provider to 'workos' —
    the guest account transparently becomes their real account.
    """
    from django.contrib.auth import get_user_model
    User = get_user_model()
    email = (email or '').strip().lower()
    if not email:
        return None

    user = User.objects.filter(email__iexact=email).first()
    if user is not None:
        return user

    user = User.objects.create_user(
        email=email,
        auth_provider='guest',
    )
    # create_user's post_save signal already made a blank UserProfile —
    # just fill in the name we have from checkout.
    name = (name or '').strip()[:100]
    if name:
        UserProfile.objects.filter(user=user).update(display_name=name)
    return user


def _wants_follow(data):
    """Checkout's "follow this organiser" box. On unless the buyer turned it off."""
    value = data.get('follow_organizer', True)
    if isinstance(value, str):
        return value.strip().lower() not in ('false', '0', 'no', 'off')
    return bool(value)


def _create_tickets(event, tier, attendees, *, payment_status, payment=None, user=None):
    """Create one Ticket row per attendee (each its own QR)."""
    tickets = []
    for att in attendees:
        tickets.append(Ticket.objects.create(
            event=event,
            tier=tier,
            payment=payment,
            user=user,
            original_owner_name=att['name'],
            original_owner_email=att['email'],
            current_owner_name=att['name'],
            current_owner_email=att['email'],
            payment_status=payment_status,
        ))
    return tickets


def _email_tickets(tickets, event):
    """Send each ticket to its own attendee (own QR)."""
    for t in tickets:
        try:
            send_ticket_confirmation_email(
                t, t.current_owner_name, t.current_owner_email, event
            )
        except Exception as email_err:
            logger.error(f"Failed to send ticket confirmation email: {email_err}")

    if tickets:
        _check_and_notify_milestones(event)


MILESTONE_BASE = (1, 10, 25, 50)
MILESTONE_STEP = 100  # every 100 after the base thresholds


def _milestones_up_to(count):
    """Sorted milestone thresholds <= count: 1, 10, 25, 50, then every 100."""
    thresholds = {m for m in MILESTONE_BASE if m <= count}
    thresholds.update(
        MILESTONE_STEP * n for n in range(1, count // MILESTONE_STEP + 1)
    )
    return sorted(thresholds)


def _organizer_recipients(event, unless_muted=None):
    """(name, email) pairs for the event owner and every accepted co-host,
    leaving out anyone who turned `unless_muted` off in Settings."""
    from .notifications import is_muted
    recipients = []
    if event.owner_id and event.owner.email and not (unless_muted and is_muted(event.owner, unless_muted)):
        name = event.owner.get_full_name() or event.owner.email
        recipients.append((name, event.owner.email))
    for cohost in event.cohosts.filter(status=EventCoHost.STATUS_ACCEPTED).select_related('user'):
        if cohost.user and cohost.user.email and not (unless_muted and is_muted(cohost.user, unless_muted)):
            name = cohost.user.get_full_name() or cohost.user.email
            recipients.append((name, cohost.user.email))
    return recipients


def _check_and_notify_milestones(event):
    """Email the organiser/co-hosts once when total tickets sold crosses a
    milestone (1st sale, 10, 25, 50, then every 100). Best-effort — a mail
    failure here must not affect ticket issuance."""
    try:
        from .emails import milestone_reached_email
        from .mailer import send_email

        total_sold = event.tickets.filter(payment_status__in=['paid', 'free']).count()
        # Read the saved list, not the passed-in object, which may predate an earlier check.
        already_notified = set(
            Event.objects.filter(pk=event.pk).values_list('milestones_notified', flat=True).first() or []
        )
        newly_crossed = [
            m for m in _milestones_up_to(total_sold) if m not in already_notified
        ]
        if not newly_crossed:
            return

        frontend_url = (settings.FRONTEND_URL or "https://usebyro.com").rstrip('/')
        dashboard_url = f"{frontend_url}/dashboard/events/{event.slug}"
        recipients = _organizer_recipients(event, unless_muted='milestone_email')

        for milestone in newly_crossed:
            for name, email in recipients:
                try:
                    email_data = milestone_reached_email(
                        name=name,
                        event_name=event.name,
                        milestone=milestone,
                        tickets_sold=total_sold,
                        dashboard_url=dashboard_url,
                        share_url=f"{frontend_url}/discover/{event.slug}",
                    )
                    send_email(
                        to=email, subject=email_data['subject'],
                        html=email_data['html'], text=email_data['text'],
                    )
                except Exception as e:
                    logger.error(f"Failed to send milestone email to {email}: {e}")

        # The first sale already has its own notification; bigger numbers get one bell,
        # for the highest crossed, so a burst of sales doesn't stack several.
        from .notifications import milestone as notify_milestone
        if max(newly_crossed) > 1:
            notify_milestone(event, max(newly_crossed))

        Event.objects.filter(pk=event.pk).update(
            milestones_notified=sorted(already_notified.union(newly_crossed))
        )
    except Exception as e:
        logger.error(f"Milestone check failed for event {event.pk}: {e}")


def _attendees_from_payment(payment):
    """Rebuild the per-seat attendee list stored at initialize time.

    Falls back to the buyer for every seat on older payments that predate
    attendee capture (using seats = quantity × people-per-ticket).
    """
    quantity = payment.metadata.get('quantity', 1)
    seats = payment.metadata.get('seats') or _seats_for(payment.tier, quantity)
    return _normalize_attendees(
        payment.metadata.get('attendees'), seats,
        payment.customer_name, payment.customer_email,
    )


def _clean_answers(event, raw):
    """Check an order's answers to the event's registration questions.

    `raw` is [{"question_id": id, "answer": value}, ...]. Returns
    (clean, error): `clean` is a list of (question, answer) for the answered
    questions, `error` a message for the buyer (or None). Required questions
    must be answered, choices must be ones the organiser listed, and nothing
    else is stored.
    """
    questions = list(event.form_questions.all())
    if not questions:
        return [], None
    given = {}
    for item in raw if isinstance(raw, list) else []:
        if isinstance(item, dict) and 'question_id' in item:
            try:
                given[int(item['question_id'])] = item.get('answer')
            except (TypeError, ValueError):
                continue

    clean = []
    for q in questions:
        value = given.get(q.id)
        empty = value is None or value == '' or value == []
        if empty:
            if q.required:
                return None, f'Please answer: {q.question}'
            continue
        if q.question_type in ('text', 'textarea'):
            if not isinstance(value, str):
                return None, f'Check your answer to: {q.question}'
            value = value.strip()[:2000 if q.question_type == 'textarea' else 255]
            if not value:
                if q.required:
                    return None, f'Please answer: {q.question}'
                continue
        elif q.question_type == 'checkbox':
            if not isinstance(value, list) or not all(isinstance(v, str) and v in q.options for v in value):
                return None, f'Pick from the choices for: {q.question}'
            value = [v for v in q.options if v in value]
        else:  # select, radio, yesno: one of the listed choices
            if not isinstance(value, str) or value not in q.options:
                return None, f'Pick from the choices for: {q.question}'
        clean.append((q, value))
    return clean, None


def _save_answers(tickets, clean):
    """Store the order's answers on each of its tickets."""
    for ticket in tickets:
        for q, value in clean:
            EventFormAnswer.objects.update_or_create(
                ticket=ticket, question=q, defaults={'answer': value},
            )


def _notice_late_refund(refund_pk):
    try:
        send_arranged_notice(Refund.objects.select_related('payment', 'event').get(pk=refund_pk))
    except Exception:
        logger.exception('Could not email a buyer who paid after cancellation')


def _fulfil_payment(payment, ticket_user):
    """
    Atomically fulfil a successful payment: mark it successful, redeem promo,
    create missing tickets. Returns (newly_created_tickets, all_tickets).
    Must be called inside a view that has already verified the payment with Paystack.
    """
    from django.db import transaction
    from django.db.models import F

    with transaction.atomic():
        # Lock the payment row so only one caller (verify or webhook) does the work
        payment = Payment.objects.select_for_update().get(pk=payment.pk)

        if payment.status == 'successful':
            # Already fulfilled by a concurrent caller
            existing_tickets = list(payment.tickets_purchased.all())
            return [], existing_tickets

        # Mark payment successful
        payment.status = 'successful'
        payment.paid_at = timezone.now()
        payment.save(update_fields=['status', 'paid_at'])

        if payment.event.cancelled_at:
            # The event was cancelled while this buyer was still at Paystack. Take no
            # ticket, redeem no promo: record the refund and tell the buyer. A Byro admin
            # sends the money with the rest of this event's refunds.
            refund, _ = Refund.objects.get_or_create(
                payment=payment,
                defaults={'event': payment.event, 'amount': refundable_amount(payment), 'currency': payment.currency},
            )
            transaction.on_commit(lambda: _notice_late_refund(refund.pk))
            return [], []

        # Redeem promo code
        if payment.promo_code_id:
            PromoCode.objects.filter(pk=payment.promo_code_id).update(
                redeemed_count=F('redeemed_count') + 1
            )

        # Create missing tickets
        existing_tickets = list(payment.tickets_purchased.all())
        attendees = _attendees_from_payment(payment)
        missing = attendees[len(existing_tickets):]
        new_tickets = []
        if missing:
            new_tickets = _create_tickets(
                payment.event, payment.tier, missing,
                payment_status='paid', payment=payment, user=ticket_user,
            )

        if new_tickets:
            stored = payment.metadata.get('form_answers') or []
            by_id = {q.id: q for q in payment.event.form_questions.all()}
            _save_answers(new_tickets, [
                (by_id[a['question_id']], a['answer']) for a in stored if a.get('question_id') in by_id
            ])

        if new_tickets and payment.metadata.get('follow_organizer', True):
            follow_organizer(ticket_user, payment.event)

        all_tickets = existing_tickets + new_tickets
        return new_tickets, all_tickets


class PaystackPaymentViewSet(viewsets.ViewSet):
    """
    ViewSet for handling Paystack payment operations for event tickets
    """
    
    
    def get_permissions(self):
        if self.action in ['webhook', 'verify_payment', 'initialize_payment']:
            return [AllowAny()]
        return [IsAuthenticated()]
    
    @action(detail=False, methods=['post'], url_path='initialize')
    def initialize_payment(self, request):
        """
        Initialize a Paystack payment for an event ticket
        
        Expected payload:
        {
            "event_slug": "abc123",
            "customer_email": "user@example.com",
            "customer_name": "John Doe",
            "quantity": 1
        }
        """
        event_slug = request.data.get('event_slug')
        customer_email = request.data.get('customer_email')
        customer_name = request.data.get('customer_name')
        try:
            quantity = int(request.data.get('quantity', 1))
        except (TypeError, ValueError):
            return Response({'error': 'Quantity must be a whole number'}, status=status.HTTP_400_BAD_REQUEST)
        tier_id = request.data.get('tier_id')
        attendees_raw = request.data.get('attendees')
        promo_code_str = (request.data.get('promo_code') or '').strip().upper()

        if not all([event_slug, customer_email, customer_name]):
            return Response(
                {'error': 'Add your name and email so we can send your tickets.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        turnstile_token = request.data.get('turnstile_token')
        if not check_and_remember_verification(
            turnstile_token, customer_email, remote_ip=self.get_client_ip(request)
        ):
            return Response(
                {'error': 'Verification failed. Please try again.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Get event
        event = get_object_or_404(Event, slug=event_slug, is_active=True, is_draft=False)
        if event.cancelled_at:
            return Response({'error': 'This event has been cancelled and is no longer selling tickets.'}, status=status.HTTP_400_BAD_REQUEST)
        if event.sales_closed:
            return Response({'error': 'Ticket sales for this event are closed.'}, status=status.HTTP_400_BAD_REQUEST)

        # The organiser decides how many tickets one order may contain. Each tier
        # sets its own limit (empty = no limit); an event without tiers uses the
        # event's limit.
        if quantity < 1:
            return Response({'error': 'Quantity must be at least 1'}, status=status.HTTP_400_BAD_REQUEST)
        limit_tier = TicketTier.objects.filter(pk=tier_id, event=event).first() if tier_id else None
        limit = limit_tier.max_tickets_per_person if limit_tier is not None else event.max_tickets_per_person
        minimum = limit_tier.min_tickets_per_person if limit_tier is not None else 1
        if quantity < minimum:
            return Response(
                {'error': f"{limit_tier.name} tickets are sold {minimum} at a time or more. Choose at least {minimum}."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if limit is not None and quantity > limit:
            return Response(
                {'error': f"You can buy up to {limit} {limit_tier.name if limit_tier else ''} ticket{'s' if limit != 1 else ''} per order.".replace('  ', ' ')},
                status=status.HTTP_400_BAD_REQUEST,
            )

        answers, answers_error = _clean_answers(event, request.data.get('form_answers'))
        if answers_error:
            return Response({'error': answers_error}, status=status.HTTP_400_BAD_REQUEST)

        try:
            with transaction.atomic():
                tier = lock_and_check_capacity(event, tier_id, quantity)
        except InsufficientCapacityError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

        # Resolve per-seat attendees (seat #1 = buyer).
        seats = _seats_for(tier, quantity)
        attendees = _normalize_attendees(attendees_raw, seats, customer_name, customer_email)

        # Calculate amount (tier price takes precedence over the legacy flat price)
        unit_price = tier.price if tier is not None else event.ticket_price
        subtotal = unit_price * quantity

        # Promo codes are re-validated here, not trusted from the cart's
        # earlier validate-promo call, so the charge can never be manipulated
        # client-side.
        promo = None
        discount_amount = Decimal('0')
        if promo_code_str:
            promo = PromoCode.objects.filter(event=event, code=promo_code_str).first()
            if not promo or not promo.is_valid():
                return Response({'error': 'Invalid or expired promo code'}, status=status.HTTP_400_BAD_REQUEST)
            discount_amount = promo.compute_discount(subtotal)

        discounted_subtotal = subtotal - discount_amount
        fee_rate = fee_rate_for(event.owner)  # fixed for this order and recorded on it
        fees = calculate_ticket_fees(discounted_subtotal, pass_fee_to_attendee=event.pass_fee_to_attendee, rate=fee_rate)
        amount = fees['total']

        # For free events/tiers, create ticket(s) directly
        linked_user = (
            request.user if request.user.is_authenticated
            else _get_or_create_guest_user(customer_email, customer_name)
        )
        if amount == 0:
            with transaction.atomic():
                # Re-check capacity under lock right before creating tickets,
                # in case another request consumed the remaining slots since
                # the check above.
                lock_and_check_capacity(event, tier_id, quantity)
                tickets = _create_tickets(
                    event, tier, attendees,
                    payment_status='free', user=linked_user,
                )
                _save_answers(tickets, answers)
                if promo is not None:
                    PromoCode.objects.filter(pk=promo.pk).update(redeemed_count=F('redeemed_count') + 1)
            if _wants_follow(request.data):
                follow_organizer(linked_user, event)

            # Send each free ticket to its own attendee
            _email_tickets(tickets, event)

            log_activity(
                'ticket.claimed', request=request,
                email=tickets[0].current_owner_email if tickets else '',
                target_type='event', target_id=event.pk, target_label=event.name,
                detail=f"{len(tickets)} ticket(s)",
            )
            if tickets:
                ticket_sale(event, len(tickets), buyer=tickets[0].original_owner_name or '')

            if apps.posthog_client is not None:
                apps.posthog_client.capture(
                    'free_ticket_claimed',
                    properties={
                        'ticket_count': len(tickets),
                        'has_ticket_tier': tier is not None,
                    },
                )

            return Response({
                'status': 'success',
                'message': 'Free ticket(s) created successfully',
                'tickets': TicketSerializer(tickets, many=True).data
            }, status=status.HTTP_201_CREATED)

        # Generate unique reference with random suffix to prevent collisions
        reference = f"EVT-{event.slug}-{timezone.now().strftime('%Y%m%d%H%M%S')}-{uuid.uuid4().hex[:8]}"

        # Reserve the seats BEFORE calling Paystack. The pending payment is what
        # holds them: lock_and_check_capacity counts pending payments as taken.
        # If it were only created after Paystack answered, every buyer in flight
        # at that moment would pass the capacity check for the same last seats
        # and all of them could pay. So the check and the reservation happen in
        # one locked step, and nothing slow (the Paystack call) runs inside it.
        try:
            with transaction.atomic():
                lock_and_check_capacity(event, tier_id, quantity)
                payment = Payment.objects.create(
                    event=event,
                    tier=tier,
                    promo_code=promo,
                    customer_email=customer_email,
                    customer_name=customer_name,
                    amount=amount,
                    fee_rate=fee_rate,
                    currency='NGN',
                    paystack_reference=reference,
                    status='pending',
                    ip_address=self.get_client_ip(request),
                    metadata={
                        'quantity': quantity,
                        'seats': seats,
                        'attendees': attendees,
                        'user_id': linked_user.id if linked_user else None,
                        'tier_id': tier.id if tier is not None else None,
                        'subtotal': str(fees['subtotal']),
                        'service_fee': str(fees['service_fee']),
                        'fee_rate': str(fee_rate),
                        'paystack_fee': str(fees['paystack_fee']),
                        'display_total': str(fees['display_total']),
                        'discount_amount': str(discount_amount),
                        'form_answers': [{'question_id': q.id, 'answer': a} for q, a in answers],
                        'follow_organizer': _wants_follow(request.data),
                    }
                )
        except InsufficientCapacityError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

        # Initialize Paystack payment
        paystack_secret_key = settings.PAYSTACK_SECRET_KEY.strip()
        paystack_url = f'{settings.PAYSTACK_API_BASE}/transaction/initialize'

        # Prepare payment data
        payment_data = {
            'email': customer_email,
            'amount': int(amount * 100),  # Paystack amount is in kobo (multiply by 100)
            'reference': reference,
            'currency': 'NGN',
            'channels': ['card', 'bank', 'ussd', 'bank_transfer', 'mobile_money', 'qr'],
            'metadata': {
                'event_id': str(event.id),
                'event_slug': event.slug,
                'event_name': event.name,
                'customer_name': customer_name,
                'quantity': quantity,
                'seats': seats,
                'tier_id': tier.id if tier is not None else None,
                'subtotal': str(fees['subtotal']),
                'service_fee': str(fees['service_fee']),
                'promo_code': promo.code if promo is not None else None,
                'discount_amount': str(discount_amount),
            },
            'callback_url': settings.PAYSTACK_CALLBACK_URL
        }
        
        headers = {
            'Authorization': f'Bearer {paystack_secret_key}',
            'Content-Type': 'application/json'
        }
        
        try:
            response = requests.post(
                paystack_url, 
                json=payment_data, 
                headers=headers,
                timeout=30
            )
            response_data = response.json()
            
            if response.status_code == 200 and response_data.get('status'):
                payment.paystack_access_code = response_data['data'].get('access_code')
                payment.paystack_authorization_url = response_data['data'].get('authorization_url')
                payment.save(update_fields=['paystack_access_code', 'paystack_authorization_url', 'updated_at'])

                if apps.posthog_client is not None:
                    apps.posthog_client.capture(
                        'payment_initialized',
                        properties={
                            'amount': float(amount),
                            'currency': 'NGN',
                            'quantity': quantity,
                            'seat_count': seats,
                            'has_ticket_tier': tier is not None,
                        },
                    )

                return Response({
                    'status': 'success',
                    'message': 'Payment initialized successfully',
                    'data': {
                        'authorization_url': response_data['data']['authorization_url'],
                        'access_code': response_data['data']['access_code'],
                        'reference': reference,
                        'amount': float(amount),
                        'subtotal': float(fees['subtotal']),
                        'service_fee': float(fees['service_fee']),
                        'currency': 'NGN'
                    }
                }, status=status.HTTP_200_OK)
            else:
                _release_reservation(payment)
                logger.error("Paystack initialize failed for %s: %s", reference, response_data.get('message'))
                return Response({
                    'error': "We couldn't start your payment. You haven't been charged. Try again in a minute."
                }, status=status.HTTP_400_BAD_REQUEST)
                
        except requests.exceptions.RequestException as e:
            _release_reservation(payment)
            logger.error("Paystack initialize request failed: %s", e)
            return Response({
                'error': "We couldn't reach our payment provider. You haven't been charged. Try again in a minute."
            }, status=status.HTTP_503_SERVICE_UNAVAILABLE)
    
    @action(detail=False, methods=['get'], url_path='verify/(?P<reference>[^/.]+)')
    def verify_payment(self, request, reference=None):
        """
        Verify a Paystack payment and create ticket(s) if successful
        """
        paystack_secret_key = settings.PAYSTACK_SECRET_KEY.strip()
        paystack_url = f'{settings.PAYSTACK_API_BASE}/transaction/verify/{reference}'
        
        headers = {
            'Authorization': f'Bearer {paystack_secret_key}',
        }
        
        try:
            response = requests.get(paystack_url, headers=headers, timeout=30)
            response_data = response.json()
            
            if response.status_code == 200 and response_data.get('status'):
                transaction_data = response_data['data']
                
                try:
                    payment = Payment.objects.get(paystack_reference=reference)
                except Payment.DoesNotExist:
                    return Response({
                        'error': 'Payment record not found. Please try initiating payment again.'
                    }, status=status.HTTP_404_NOT_FOUND)

                # Resolve which user to link tickets to:
                # prefer the currently authenticated requester, fall back to
                # the user_id stored in payment metadata at initialize time.
                ticket_user = request.user if request.user.is_authenticated else None
                if ticket_user is None:
                    stored_uid = payment.metadata.get('user_id')
                    if stored_uid:
                        from django.contrib.auth import get_user_model
                        User = get_user_model()
                        ticket_user = User.objects.filter(pk=stored_uid).first()

                if payment.status == 'successful':
                    # Already fulfilled (possibly by webhook)
                    existing_tickets = list(payment.tickets_purchased.all())
                    return Response({
                        'status': 'success',
                        'message': 'Payment already verified',
                        'tickets': TicketSerializer(existing_tickets, many=True).data,
                        'payment': PaymentSerializer(payment).data,
                    }, status=status.HTTP_200_OK)

                txn_status = transaction_data.get('status')
                paid_amount_kobo = transaction_data.get('amount', 0)

                # Amount check: Paystack amount (in kobo) must match our recorded amount
                expected_amount_kobo = int(payment.amount * 100)
                if not _paid_amount_ok(paid_amount_kobo, expected_amount_kobo):
                    logger.error(
                        "Amount mismatch for payment %s: Paystack=%d kobo, expected=%d kobo",
                        reference, paid_amount_kobo, expected_amount_kobo
                    )
                    return Response({
                        'error': (
                            "We couldn't confirm your payment. Contact support@usebyro.com "
                            f"with reference {reference} and we'll sort it out."
                        )
                    }, status=status.HTTP_400_BAD_REQUEST)

                if txn_status == 'success':
                    # Fulfil payment atomically
                    new_tickets, all_tickets = _fulfil_payment(payment, ticket_user)

                    # _fulfil_payment re-fetches the row under lock, so refresh
                    # our instance before serializing it (status/paid_at changed).
                    payment.refresh_from_db()

                    # Update channel on the payment (outside the atomic block to avoid
                    # holding the lock longer than needed; payment is already 'successful')
                    payment.channel = transaction_data.get('channel')
                    payment.save(update_fields=['channel'])

                    # Send emails and PostHog events for newly created tickets only
                    def _post_commit():
                        if new_tickets:
                            _email_tickets(new_tickets, payment.event)
                            log_activity(
                                'ticket.purchased', request=request, email=payment.customer_email,
                                target_type='event', target_id=payment.event_id,
                                target_label=payment.event.name,
                                detail=f"{len(new_tickets)} ticket(s), {payment.currency} {payment.amount}",
                            )
                            ticket_sale(payment.event, len(new_tickets), paid_amount=payment.amount, payment=payment)
                        if apps.posthog_client is not None:
                            apps.posthog_client.capture(
                                'payment_completed',
                                properties={
                                    'amount': float(payment.amount),
                                    'currency': payment.currency,
                                    'ticket_count': len(new_tickets),
                                    'payment_channel': payment.channel or 'unknown',
                                },
                            )
                    transaction.on_commit(_post_commit)

                    if payment.event.cancelled_at:
                        return Response({
                            'status': 'event_cancelled',
                            'message': 'This event was cancelled before your payment went through. No ticket was issued, and the ticket price will be refunded to you.',
                        }, status=status.HTTP_200_OK)

                    return Response({
                        'status': 'success',
                        'message': 'Payment verified successfully',
                        'tickets': TicketSerializer(all_tickets, many=True).data,
                        'payment': PaymentSerializer(payment).data
                    }, status=status.HTTP_200_OK)
                elif txn_status in ('failed', 'reversed'):
                    # Only terminal failure states
                    payment.status = 'failed'
                    payment.save(update_fields=['status'])
                    
                    return Response({
                        'status': 'failed',
                        'message': 'Payment was not successful'
                    }, status=status.HTTP_400_BAD_REQUEST)
                else:
                    # pending, abandoned, ongoing — leave payment pending
                    return Response({
                        'status': 'processing',
                        'message': "Your payment hasn't gone through yet. If you finished paying, refresh in a minute."
                    }, status=status.HTTP_202_ACCEPTED)
            else:
                logger.error("Paystack verify failed for %s: %s", reference, response_data.get('message'))
                return Response({
                    'error': (
                        "We couldn't confirm your payment yet. If you were charged, contact "
                        f"support@usebyro.com with reference {reference}."
                    )
                }, status=status.HTTP_400_BAD_REQUEST)
                
        except requests.exceptions.RequestException as e:
            logger.error("Paystack verify request failed: %s", e)
            return Response({
                'error': "We couldn't reach our payment provider. Refresh in a minute to check your payment."
            }, status=status.HTTP_503_SERVICE_UNAVAILABLE)
    
    @action(detail=False, methods=['post'], permission_classes=[AllowAny])
    def webhook(self, request):
        """
        Handle Paystack webhook events
        Verifies webhook signature and processes payment events
        """
        paystack_secret_key = settings.PAYSTACK_SECRET_KEY.strip()

        signature = request.headers.get('X-Paystack-Signature')
        
        if not signature:
            return Response({
                'error': 'No signature provided'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        hash_value = hmac.new(
            paystack_secret_key.encode('utf-8'),
            request.body,
            hashlib.sha512
        ).hexdigest()
        
        if hash_value != signature:
            return Response({
                'error': 'Invalid signature'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Process webhook event
        event_type = request.data.get('event')
        data = request.data.get('data', {})
        
        if event_type and event_type.startswith('refund.'):
            apply_refund_webhook(event_type, data)
            return Response({'status': 'success'}, status=status.HTTP_200_OK)

        if event_type == 'charge.success':
            reference = data.get('reference')
            
            try:
                payment = Payment.objects.get(paystack_reference=reference)
                
                if payment.status == 'successful':
                    # Already fulfilled
                    return Response({'status': 'success'}, status=status.HTTP_200_OK)

                paid_amount_kobo = data.get('amount', 0)
                expected_amount_kobo = int(payment.amount * 100)
                if not _paid_amount_ok(paid_amount_kobo, expected_amount_kobo):
                    logger.error(
                        "Webhook amount mismatch for payment %s: Paystack=%d kobo, expected=%d kobo",
                        reference, paid_amount_kobo, expected_amount_kobo
                    )
                    return Response({'status': 'success'}, status=status.HTTP_200_OK)

                # Resolve user from stored metadata
                stored_uid = payment.metadata.get('user_id')
                webhook_user = None
                if stored_uid:
                    from django.contrib.auth import get_user_model
                    User = get_user_model()
                    webhook_user = User.objects.filter(pk=stored_uid).first()

                # Fulfil payment atomically
                new_tickets, all_tickets = _fulfil_payment(payment, webhook_user)

                # Update channel on the payment
                payment.channel = data.get('channel')
                payment.save(update_fields=['channel'])

                # Send emails and PostHog events for newly created tickets only
                def _post_commit():
                    if new_tickets:
                        _email_tickets(new_tickets, payment.event)
                        log_activity(
                            'ticket.purchased', email=payment.customer_email,
                            target_type='event', target_id=payment.event_id,
                            target_label=payment.event.name,
                            detail=f"{len(new_tickets)} ticket(s), {payment.currency} {payment.amount}",
                        )
                        ticket_sale(payment.event, len(new_tickets), paid_amount=payment.amount, payment=payment)
                    if apps.posthog_client is not None:
                        apps.posthog_client.capture(
                            'payment_completed',
                            properties={
                                'amount': float(payment.amount),
                                'currency': payment.currency,
                                'ticket_count': len(new_tickets),
                                'payment_channel': payment.channel or 'unknown',
                            },
                        )
                transaction.on_commit(_post_commit)

            except Payment.DoesNotExist:
                pass  # Ignore if payment doesn't exist
        
        return Response({'status': 'success'}, status=status.HTTP_200_OK)
    
    def get_client_ip(self, request):
        """Extract client IP address from request"""
        x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
        if x_forwarded_for:
            ip = x_forwarded_for.split(',')[0]
        else:
            ip = request.META.get('REMOTE_ADDR')
        return ip

class WaitListViewSet(viewsets.ModelViewSet):
    queryset = WaitList.objects.all()
    serializer_class = WaitListSerializer

    @action(detail=False, methods=['post'], url_path='lists')
    def wait_list(self, request):
        email=request.data.get('email')

        if WaitList.objects.filter(email=email).exists():
            return Response(
                {
                    'detail': 'Email already exists in waitlist'
                    
                }, status=400)

        serializer = self.get_serializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=400)
        
        serializer.save()
        if apps.posthog_client is not None:
            apps.posthog_client.capture('waitlist_joined')
        return Response(serializer.data, status=201)



# ---------------------------------------------------------------------------
# Merch
# ---------------------------------------------------------------------------

class MerchViewSet(viewsets.ModelViewSet):
    """
    /api/merch/          — GET (list mine), POST (create)
    /api/merch/<id>/     — GET, PATCH, DELETE (mine only)

    Public display lives on the profile endpoint (ProfileViewSet.public),
    which lists a user's active items — this viewset is the organiser-facing
    CRUD side, always scoped to request.user.
    """
    serializer_class = MerchItemSerializer
    permission_classes = [IsAuthenticated]
    parser_classes = (JSONParser, MultiPartParser, FormParser)

    def get_queryset(self):
        return MerchItem.objects.filter(owner=self.request.user).prefetch_related('photos')

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)


# ---------------------------------------------------------------------------
# Profile
# ---------------------------------------------------------------------------

class ProfileViewSet(viewsets.GenericViewSet):
    """
    /api/profile/me/          — GET (own profile), PATCH (update)
    /api/profile/me/avatar/   — POST (upload avatar)
    /api/profile/<handle>/    — GET (public profile)
    """
    serializer_class = UserProfileSerializer
    parser_classes = (JSONParser, MultiPartParser, FormParser)
    # Declared so the follow action can set it (DRF rejects action kwargs that
    # are not already attributes on the viewset).
    throttle_scope = None

    def get_permissions(self):
        if self.action == 'public':
            return [AllowAny()]
        return [IsAuthenticated()]

    def _get_or_create_profile(self, user):
        profile, _ = UserProfile.objects.get_or_create(user=user)
        return profile

    @action(detail=False, methods=['GET', 'PATCH'], url_path='me')
    def me(self, request):
        profile = self._get_or_create_profile(request.user)

        if request.method == 'GET':
            serializer = self.get_serializer(profile, context={'request': request})
            return Response(serializer.data)

        # PATCH
        serializer = self.get_serializer(
            profile, data=request.data, partial=True, context={'request': request}
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        if apps.posthog_client is not None:
            apps.posthog_client.capture('profile_updated')
        return Response(serializer.data)

    @action(detail=False, methods=['POST', 'DELETE'], url_path='me/avatar',
            parser_classes=[MultiPartParser, FormParser])
    def upload_avatar(self, request):
        profile = self._get_or_create_profile(request.user)
        if request.method == 'DELETE':
            # Remove the photo; the page falls back to the community's initial.
            if profile.avatar:
                profile.avatar.delete(save=False)
            profile.avatar = None
            profile.save(update_fields=['avatar'])
            return Response({'avatar_url': None})
        if 'avatar' not in request.FILES:
            return Response({'error': 'No avatar file provided'}, status=status.HTTP_400_BAD_REQUEST)
        profile.avatar = request.FILES['avatar']
        profile.save(update_fields=['avatar'])
        serializer = self.get_serializer(profile, context={'request': request})
        return Response({'avatar_url': serializer.data['avatar_url']})

    @action(detail=False, methods=['POST'], url_path='me/cover-image',
            parser_classes=[MultiPartParser, FormParser])
    def upload_cover_image(self, request):
        profile = self._get_or_create_profile(request.user)
        if 'cover_image' not in request.FILES:
            return Response({'error': 'No cover image file provided'}, status=status.HTTP_400_BAD_REQUEST)
        profile.cover_image = request.FILES['cover_image']
        profile.save(update_fields=['cover_image'])
        serializer = self.get_serializer(profile, context={'request': request})
        return Response({'cover_image_url': serializer.data['cover_image_url']})

    @action(detail=False, methods=['GET'], url_path=r'(?P<handle>[^/.]+)')
    def public(self, request, handle=None):
        try:
            profile = UserProfile.objects.select_related('user').get(handle=handle)
        except UserProfile.DoesNotExist:
            return Response({'error': 'Profile not found'}, status=status.HTTP_404_NOT_FOUND)
        if not profile.is_public and (not request.user.is_authenticated or request.user != profile.user):
            return Response({'error': 'Profile not found'}, status=status.HTTP_404_NOT_FOUND)
        serializer = self.get_serializer(profile, context={'request': request})
        # Public view: strip private fields
        data = serializer.data
        data.pop('auth_provider', None)
        # The page's address and name identify it; the account's email is private to its owner.
        if not (request.user.is_authenticated and request.user == profile.user):
            data.pop('email', None)

        merch = MerchItem.objects.filter(owner=profile.user, is_active=True, removed_by_admin=False).prefetch_related('photos')
        data['merch_items'] = MerchItemSerializer(merch, many=True, context={'request': request}).data
        data['community'] = community_stats(profile.user)
        passport = passport_for_user(profile.user)
        data['stamps'] = _stamp_payload(passport[:60])
        data['stamps_count'] = len(passport)
        # Which of this organiser's events the person looking was checked in to ("You were there").
        data['viewer_attended'] = (
            list(
                stamps_for_user(request.user)
                .filter(organizer=profile.user, event__slug__isnull=False)
                .values_list('event__slug', flat=True)
                .distinct()
            )
            if request.user.is_authenticated else []
        )

        return Response(data)

    @action(detail=False, methods=['POST', 'DELETE'], url_path=r'(?P<handle>[^/.]+)/follow',
            throttle_scope='follow')
    def follow(self, request, handle=None):
        """
        POST   /api/profile/<handle>/follow/   follow this organiser
        DELETE /api/profile/<handle>/follow/   unfollow

        Both are idempotent, so a double tap or a retry never errors.
        """
        try:
            target = UserProfile.objects.select_related('user').get(handle=handle)
        except UserProfile.DoesNotExist:
            return Response({'error': 'Profile not found'}, status=status.HTTP_404_NOT_FOUND)

        if target.user_id == request.user.pk:
            return Response({'error': "You can't follow yourself."}, status=status.HTTP_400_BAD_REQUEST)

        if request.method == 'POST':
            Follow.objects.get_or_create(follower=request.user, following=target.user)
        else:
            Follow.objects.filter(follower=request.user, following=target.user).delete()

        return Response({
            'following': request.method == 'POST',
            'followers_count': target.user.follower_links.count(),
        })


def _stamp_payload(stamps):
    out = []
    for st in stamps:
        e = st.event
        oprofile = getattr(st.organizer, 'profile', None) if st.organizer_id else None
        out.append({
            'id': st.pk,
            'event_name': e.name,
            'event_slug': e.slug,
            'day': e.day,
            'category': e.category,
            'location': e.location or '',
            'organizer_name': (oprofile.display_name if oprofile else '') or event_host_name(e),
            'organizer_handle': oprofile.handle if oprofile else None,
            'earned_at': st.created_at,
        })
    return out


class MyStampsView(APIView):
    """GET /api/stamps/ — the signed-in user's passport."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        passport = passport_for_user(request.user)
        return Response({'count': len(passport), 'stamps': _stamp_payload(passport[:200])})


class ShareStampView(APIView):
    """POST /api/stamps/<pk>/share/ — the holder makes (or gets back) a public link to one of their stamps."""
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        import secrets
        from .models import Stamp
        stamp = stamps_for_user(request.user).filter(pk=pk).first()
        if stamp is None:
            return Response({'error': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        if not stamp.share_token:
            stamp.share_token = secrets.token_urlsafe(12)
            stamp.save(update_fields=['share_token'])
        site = (settings.FRONTEND_URL or "https://usebyro.com").rstrip('/')
        return Response({'token': stamp.share_token, 'url': f"{site}/s/{stamp.share_token}"})


class SharedStampView(APIView):
    """GET /api/stamps/shared/<token>/ — the public view of a shared stamp: the event and the holder's first name."""
    permission_classes = [AllowAny]

    def get(self, request, token):
        from .models import Stamp
        stamp = Stamp.objects.select_related('event', 'organizer__profile', 'ticket').filter(share_token=token).first()
        if stamp is None:
            return Response({'error': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        holder = (stamp.ticket.current_owner_name if stamp.ticket_id else '') or ''
        payload = _stamp_payload([stamp])[0]
        payload['first_name'] = holder.strip().split(' ')[0] if holder.strip() else ''
        return Response(payload)


class CommunityDashboardView(APIView):
    """GET /api/dashboard/community/ — followers, attendance and regulars for the signed-in organiser."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from .models import Follow
        stats = community_stats(request.user)
        since = timezone.now() - timedelta(days=30)
        stats['new_followers_30d'] = Follow.objects.filter(following=request.user, created_at__gte=since).count()
        return Response(stats)


class MessagesView(APIView):
    """
    GET    /api/dashboard/messages/ — who each audience reaches right now, the weekly allowance, and messages.
    POST   /api/dashboard/messages/ — send one. {kind, audience, event?, attach_event?, subject, body, test?, scheduled_for?}
           With test=true it emails only the organiser and saves nothing.
           With scheduled_for (ISO time, 5 minutes to 30 days ahead) it is saved and sent then by the cron job.
    DELETE /api/dashboard/messages/<id>/ — cancel a scheduled message that has not gone out yet.
    """
    permission_classes = [IsAuthenticated]
    throttle_scope = 'message'

    def get_throttles(self):
        # Only sends are limited; the page reads this often while a message goes out.
        return super().get_throttles() if self.request.method == 'POST' else []

    @staticmethod
    def _row(m):
        return {
            'id': m.pk, 'kind': m.kind, 'audience': m.audience, 'subject': m.subject, 'status': m.status,
            'event_name': m.event.name if m.event_id else '',
            'recipients': m.recipients_count, 'sent': m.sent_count, 'failed': m.failed_count,
            'created_at': m.created_at, 'sent_at': m.sent_at, 'scheduled_for': m.scheduled_for,
        }

    def get(self, request):
        sent = Message.objects.filter(organizer=request.user).select_related('event')[:20]
        sender_profile = UserProfile.objects.filter(user=request.user).first()
        return Response({
            'blocked': bool(sender_profile and sender_profile.messaging_blocked),
            'audiences': messaging.audience_counts(request.user),
            'events': messaging.holder_events(request.user),
            'announcements_left': messaging.announcements_left(request.user),
            'announcements_per_week': messaging.MAX_ANNOUNCEMENTS_PER_WEEK,
            'sent': [self._row(m) for m in sent],
        })

    def post(self, request):
        data = request.data
        kind = data.get('kind')
        which = data.get('audience')
        subject = str(data.get('subject') or '').strip()
        body = str(data.get('body') or '').strip()
        is_test = bool(data.get('test'))
        attach = bool(data.get('attach_event'))

        def bad(msg):
            return Response({'error': msg}, status=status.HTTP_400_BAD_REQUEST)

        sender_profile = UserProfile.objects.filter(user=request.user).first()
        if sender_profile and sender_profile.messaging_blocked:
            return Response({'error': 'Messaging is turned off for your account. Contact support@usebyro.com.'},
                            status=status.HTTP_403_FORBIDDEN)

        if kind not in (Message.KIND_ANNOUNCE, Message.KIND_UPDATE):
            return bad('Choose what you are sending.')
        if not subject or len(subject) > 200:
            return bad('Add a subject of up to 200 characters.')
        if not body or len(body) > 5000:
            return bad('Add a message of up to 5,000 characters.')

        event = None
        slug = data.get('event')
        if kind == Message.KIND_UPDATE:
            which = 'event'
            attach = True
        elif which not in ('followers', 'members', 'regulars'):
            return bad('Choose who to send it to.')
        if slug:
            event = Event.objects.filter(slug=slug, owner=request.user, is_active=True, is_draft=False).first()
            if not event:
                return bad('That event was not found.')
        if (kind == Message.KIND_UPDATE or attach) and not event:
            return bad('Choose an event.')
        if not attach:
            event = event if kind == Message.KIND_UPDATE else None

        message = Message(
            organizer=request.user, kind=kind, audience=which, event=event, subject=subject,
            body=body, attach_event=attach,
        )

        if is_test:
            if not request.user.email:
                return bad('Your account has no email address to send a test to.')
            try:
                messaging.send_test(message, request.user.email)
            except Exception:
                logger.exception('Could not send a test message')
                return Response({'error': 'Could not send the test. Try again.'}, status=status.HTTP_502_BAD_GATEWAY)
            return Response({'sent_to': request.user.email})

        when = None
        if data.get('scheduled_for'):
            from django.utils.dateparse import parse_datetime
            when = parse_datetime(str(data.get('scheduled_for')))
            if when is None:
                return bad('Choose a valid date and time.')
            if timezone.is_naive(when):
                when = timezone.make_aware(when)
            now = timezone.now()
            if when < now + timedelta(minutes=5):
                return bad('Schedule it at least 5 minutes from now.')
            if when > now + timedelta(days=30):
                return bad('You can schedule up to 30 days ahead.')

        if kind == Message.KIND_ANNOUNCE and not messaging.announcements_left(request.user):
            return bad(f'You have used your {messaging.MAX_ANNOUNCEMENTS_PER_WEEK} announcements for this week.')
        recipients = messaging.audience(request.user, kind, which, event if kind == Message.KIND_UPDATE else None)
        if not recipients:
            return bad('There is no one to send this to yet.')

        message.recipients_count = len(recipients)
        if when:
            # Saved now, sent by `send_scheduled_messages`; who it reaches is worked out again then.
            message.status = 'scheduled'
            message.scheduled_for = when
            message.save()
            return Response(self._row(message), status=status.HTTP_201_CREATED)
        message.save()
        messaging.deliver_in_background(message, recipients)
        return Response(self._row(message), status=status.HTTP_201_CREATED)

    def delete(self, request, pk=None):
        cancelled = Message.objects.filter(pk=pk, organizer=request.user, status='scheduled').update(status='cancelled')
        if not cancelled:
            return Response({'error': 'Only a scheduled message that has not gone out yet can be cancelled.'},
                            status=status.HTTP_400_BAD_REQUEST)
        return Response({'cancelled': True})


class ReportView(APIView):
    """
    POST /api/reports/ {target: 'event'|'community', slug|handle, reason, details?, email?}
    Anyone can report an event or a community page. Byro's admins are told and review it.
    """
    permission_classes = [AllowAny]
    throttle_scope = 'report'

    def post(self, request):
        from .models import Report
        data = request.data
        target = data.get('target')
        reason = data.get('reason')
        details = str(data.get('details') or '').strip()[:2000]
        if reason not in dict(Report.REASON_CHOICES):
            return Response({'error': 'Choose what is wrong.'}, status=status.HTTP_400_BAD_REQUEST)
        if reason == 'other' and not details:
            return Response({'error': 'Tell us what is wrong.'}, status=status.HTTP_400_BAD_REQUEST)

        event = community = None
        if target == 'event':
            event = Event.objects.filter(slug=str(data.get('slug') or '')).select_related('owner').first()
            if not event:
                return Response({'error': 'That event was not found.'}, status=status.HTTP_404_NOT_FOUND)
            label = event.name
        elif target == 'community':
            profile = UserProfile.objects.filter(handle__iexact=str(data.get('handle') or '')).select_related('user').first()
            if not profile:
                return Response({'error': 'That community was not found.'}, status=status.HTTP_404_NOT_FOUND)
            community = profile.user
            label = profile.display_name or profile.handle
        else:
            return Response({'error': 'Say what you are reporting.'}, status=status.HTTP_400_BAD_REQUEST)

        reporter = request.user if request.user.is_authenticated else None
        email = (reporter.email if reporter else str(data.get('email') or '').strip())[:254]
        if email:
            try:
                validate_email(email)
            except DjangoValidationError:
                return Response({'error': 'That email address does not look right.'}, status=status.HTTP_400_BAD_REQUEST)

        # One open report per person per thing is enough.
        if reporter and Report.objects.filter(reporter=reporter, event=event, community=community,
                                              status=Report.STATUS_OPEN).exists():
            return Response({'reported': True})

        Report.objects.create(target_type=target, event=event, community=community, reason=reason,
                              details=details, reporter=reporter, reporter_email=email)
        notify_admins('report', f'New report: {label}'[:140], body=dict(Report.REASON_CHOICES)[reason], link='/reports')
        return Response({'reported': True}, status=status.HTTP_201_CREATED)


class TawkWebhookView(APIView):
    """POST /api/webhooks/tawk/ — chats and offline tickets from tawk.to become support requests in the admin."""
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        import json as jsonlib
        from .tawk import handle, signature_ok
        if not getattr(settings, 'TAWK_WEBHOOK_SECRET', ''):
            logger.error('tawk.to webhook received but TAWK_WEBHOOK_SECRET is not set')
            return Response({'error': 'Not configured'}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        body = request.body  # the raw bytes tawk.to signed; read before anything parses them
        if not signature_ok(body, request.headers.get('X-Tawk-Signature', '')):
            return Response({'error': 'Invalid signature'}, status=status.HTTP_401_UNAUTHORIZED)
        try:
            payload = jsonlib.loads(body.decode('utf-8'))
        except (ValueError, UnicodeDecodeError):
            return Response({'error': 'Bad JSON'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            req, created = handle(payload)
        except Exception:
            logger.exception('Could not handle tawk.to event %s', request.headers.get('X-Hook-Event-Id'))
            return Response({'error': 'Could not process'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)  # tawk.to retries
        if req is not None and created:
            who = req.name or req.email or 'A visitor'
            kind = 'offline message' if req.source == req.SOURCE_TICKET else 'chat'
            notify_admins('support_request', f'New {kind} from {who}'[:140], body=(req.subject or req.message)[:200], link='/support')
        return Response({'ok': True})


class UnfollowByTokenView(APIView):
    """POST /api/community/unfollow/ {token} — the unfollow link in a follower email. No login needed."""
    permission_classes = [AllowAny]
    throttle_scope = 'follow'

    def post(self, request):
        name = unfollow_from_token(str(request.data.get('token', '')))
        if name is None:
            return Response({'error': 'This link is not valid.'}, status=status.HTTP_400_BAD_REQUEST)
        return Response({'unfollowed': True, 'name': name})


class CommunityDirectoryView(APIView):
    """
    GET /api/communities/ — organisers with a public page and at least one public, live event.
      ?q=       search name, handle, bio, location
      ?category= only organisers who host this category
      ?sort=    followers (default) | upcoming | new
      ?page= &page_size= (default 12, max 48)
    """
    permission_classes = [AllowAny]

    def get(self, request):
        from .models import Follow
        today = timezone.localdate()
        live = Event.objects.filter(is_active=True, is_draft=False, visibility='public', cancelled_at__isnull=True)
        qs = (
            UserProfile.objects.filter(is_public=True, hidden_from_directory=False, handle__isnull=False,
                                       user__owned_events__in=live)
            .select_related('user').distinct()
        )
        q = (request.query_params.get('q') or '').strip()
        if q:
            qs = qs.filter(
                Q(display_name__icontains=q) | Q(handle__icontains=q) | Q(bio__icontains=q) | Q(location__icontains=q)
            )
        category = (request.query_params.get('category') or '').strip()
        if category:
            qs = qs.filter(user__owned_events__in=live.filter(category=category))
        qs = qs.annotate(
            n_followers=Count('user__follower_links', distinct=True),
            n_upcoming=Count('user__owned_events', filter=Q(user__owned_events__in=live.filter(day__gte=today)), distinct=True),
        )
        sort = request.query_params.get('sort') or 'followers'
        order = {
            'upcoming': ('-n_upcoming', '-n_followers'),
            'new': ('-created_at',),
        }.get(sort, ('-n_followers', '-n_upcoming'))
        qs = qs.order_by(*order, 'handle')

        try:
            page_size = min(max(int(request.query_params.get('page_size', 12)), 1), 48)
            page = max(int(request.query_params.get('page', 1)), 1)
        except ValueError:
            page_size, page = 12, 1
        total = qs.count()
        profiles = list(qs[(page - 1) * page_size: page * page_size])

        followed = set()
        if request.user.is_authenticated:
            followed = set(Follow.objects.filter(
                follower=request.user, following_id__in=[p.user_id for p in profiles]
            ).values_list('following_id', flat=True))

        results = []
        for p in profiles:
            events = list(live.filter(owner_id=p.user_id).order_by('day', 'time_from'))
            upcoming = [e for e in events if e.day >= today]
            featured = next((e for e in upcoming if e.event_image), None) or next((e for e in events if e.event_image), None)
            nxt = upcoming[0] if upcoming else None
            stats = community_stats(p.user)
            results.append({
                'handle': p.handle,
                'name': p.display_name or p.handle,
                'verified': p.verified,
                'bio': p.bio,
                'location': p.location,
                'avatar_url': request.build_absolute_uri(p.avatar.url) if p.avatar else None,
                'followers': p.n_followers,
                'attendees': stats['attendees'],
                'regulars': stats['regulars'],
                'is_following': p.user_id in followed,
                'events_total': len(events),
                'upcoming_count': len(upcoming),
                'categories': sorted({e.category for e in events if e.category}),
                'cover_url': request.build_absolute_uri(featured.event_image.url) if featured else None,
                'next_event': {
                    'name': nxt.name, 'slug': nxt.slug, 'day': nxt.day,
                    'time_from': nxt.time_from, 'location': nxt.location,
                } if nxt else None,
            })
        return Response({'results': results, 'total': total, 'page': page, 'page_size': page_size})


# ---------------------------------------------------------------------------
# Dashboard
# ---------------------------------------------------------------------------

class DashboardView(APIView):
    """
    GET /api/dashboard/

    Returns everything the logged-in user's dashboard needs in a single call:
      - profile                (with is_complete flag)
      - stats                  (counts)
      - hosting                (events I own or co-host — upcoming first)
      - attending              (upcoming events I registered for)
      - past_events            (events I already attended)
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        now = timezone.now().date()

        # Profile
        profile, _ = UserProfile.objects.get_or_create(user=user)
        profile_data = UserProfileSerializer(profile, context={'request': request}).data

        # Events I host (owner or co-host)
        hosting_qs = Event.objects.filter(
            Q(owner=user) | Q(
                cohosts__user=user,
                cohosts__status=EventCoHost.STATUS_ACCEPTED,
            ),
            is_active=True,
        ).distinct().order_by('day')

        # Split into upcoming / past
        hosting_upcoming = hosting_qs.filter(day__gte=now)
        hosting_past = hosting_qs.filter(day__lt=now)

        # Tickets I hold (attending)
        my_tickets = (
            Ticket.objects
            .filter(user=user)
            .select_related('event')
            .order_by('event__day')
        )
        attending_upcoming = [t for t in my_tickets if t.event.day >= now]
        attending_past = [t for t in my_tickets if t.event.day < now]

        # Stats
        stats = {
            'events_created': Event.objects.filter(owner=user).count(),
            'events_cohosting': Event.objects.filter(
                cohosts__user=user,
                cohosts__status=EventCoHost.STATUS_ACCEPTED,
            ).distinct().count(),
            'tickets_held': my_tickets.count(),
            'events_attended_past': len(attending_past),
            'upcoming_as_host': hosting_upcoming.count(),
            'upcoming_as_attendee': len(attending_upcoming),
        }

        def event_summary(event):
            return {
                'id': event.id,
                'slug': event.slug,
                'name': event.name,
                'day': str(event.day),
                'time_from': str(event.time_from),
                'location': event.location,
                'category': event.category,
                'ticket_price': str(event.ticket_price),
                'is_active': event.is_active,
                'is_draft': event.is_draft,
                'capacity': event.capacity,
                'is_owner': event.owner_id == user.id,
                'attendee_count': event.tickets.filter(
                    payment_status__in=['paid', 'free']
                ).count(),
                'event_image_url': (
                    request.build_absolute_uri(event.event_image.url)
                    if event.event_image else None
                ),
            }

        def ticket_summary(ticket):
            return {
                'ticket_id': str(ticket.ticket_id),
                'qr_token': str(ticket.qr_token),
                'checked_in': ticket.checked_in,
                'payment_status': ticket.payment_status,
                'event': event_summary(ticket.event),
            }

        return Response({
            'profile': profile_data,
            'stats': stats,
            'hosting': {
                'upcoming': [event_summary(e) for e in hosting_upcoming[:10]],
                'past': [event_summary(e) for e in hosting_past[:10]],
            },
            'attending': {
                'upcoming': [ticket_summary(t) for t in attending_upcoming[:10]],
                'past': [ticket_summary(t) for t in attending_past[:10]],
            },
        })


class DashboardAnalyticsView(APIView):
    """
    GET /api/dashboard/analytics/

    Real numbers for the organiser overview, scoped to events the user owns
    or co-hosts (accepted). Revenue uses the same net-of-fee rule as the
    payout balance, so the two never disagree. Draft events are ignored.

      - last_30d / previous_30d : tickets sold + revenue, for honest trends
      - monthly_revenue         : revenue series for the chart, oldest first.
                                  ?range=week|3m|6m|12m (default 12m) — week
                                  buckets by day, the rest by calendar month.
      - avg_fill_rate           : mean sold/capacity over events with a limit (the event's, or the sum of
                                  its tier limits when every tier has one) (0-100)
      - top_events              : best sellers this calendar month
      - events                  : lifetime sold + revenue + is_free + is_owner per event slug
    Revenue is counted for events you own only (co-hosts don't receive it).
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        now = timezone.now()

        events = Event.objects.filter(
            Q(owner=user) | Q(
                cohosts__user=user,
                cohosts__status=EventCoHost.STATUS_ACCEPTED,
            ),
            is_active=True,
            is_draft=False,
        ).distinct()
        event_ids = list(events.values_list('pk', flat=True))
        owned_ids = set(events.filter(owner=user).values_list('pk', flat=True))

        net_price = ticket_net_price_expr()
        zero = Decimal('0')
        # Sales are counted for every event you help run; revenue only for the
        # events you own, matching what you can actually withdraw.
        sold = Ticket.objects.filter(event_id__in=event_ids, payment_status__in=['paid', 'free'])
        paid = Ticket.objects.filter(event_id__in=owned_ids, payment_status='paid')

        def window(start, end=None):
            s_qs, p_qs = sold.filter(created_at__gte=start), paid.filter(created_at__gte=start)
            if end is not None:
                s_qs, p_qs = s_qs.filter(created_at__lt=end), p_qs.filter(created_at__lt=end)
            return {
                'tickets': s_qs.count(),
                'revenue': str(p_qs.aggregate(t=Coalesce(Sum(net_price), zero))['t']),
            }

        d30 = now - timedelta(days=30)
        d60 = now - timedelta(days=60)

        # Revenue series for the chart. ?range= one of: week, 3m, 6m, 12m
        # (default 12m). "week" buckets by day; the month ranges bucket by
        # calendar month, oldest first — same shape either way so the
        # frontend doesn't need to branch on it.
        range_param = (request.query_params.get('range') or '12m').strip().lower()
        RANGE_MONTHS = {'3m': 3, '6m': 6, '12m': 12}

        if range_param == 'week':
            today = now.date()
            days = [today - timedelta(days=i) for i in range(6, -1, -1)]
            start = now.replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=6)
            by_day = {
                row['d']: row['t']
                for row in paid.filter(created_at__gte=start)
                .annotate(d=TruncDate('created_at'))
                .values('d')
                .annotate(t=Sum(net_price))
            }
            monthly_revenue = [
                {'month': d.isoformat(), 'revenue': str(by_day.get(d, zero))}
                for d in days
            ]
        else:
            n_months = RANGE_MONTHS.get(range_param, 12)
            year, month = now.year, now.month
            months = []
            for _ in range(n_months):
                months.append((year, month))
                month -= 1
                if month == 0:
                    year, month = year - 1, 12
            months.reverse()
            first = months[0]
            start = now.replace(year=first[0], month=first[1], day=1, hour=0, minute=0, second=0, microsecond=0)
            by_month = {
                (row['m'].year, row['m'].month): row['t']
                for row in paid.filter(created_at__gte=start)
                .annotate(m=TruncMonth('created_at'))
                .values('m')
                .annotate(t=Sum(net_price))
            }
            monthly_revenue = [
                {'month': f'{y}-{m:02d}', 'revenue': str(by_month.get((y, m), zero))}
                for (y, m) in months
            ]

        # Lifetime sold + revenue per event.
        sold_by_event = dict(
            sold.values_list('event__slug').annotate(n=Count('id')).values_list('event__slug', 'n')
        )
        revenue_by_event = dict(
            paid.values_list('event__slug').annotate(t=Sum(net_price)).values_list('event__slug', 't')
        )
        # An event is free when its base price is 0 and none of its tiers charge.
        paid_tier_events = set(
            TicketTier.objects.filter(event_id__in=event_ids, price__gt=0)
            .values_list('event_id', flat=True)
        )
        per_event = {
            slug: {
                'sold': sold_by_event.get(slug, 0),
                'revenue': str(revenue_by_event.get(slug, zero)),
                'is_free': base_price == 0 and event_id not in paid_tier_events,
                'is_owner': event_id in owned_ids,
            }
            for event_id, slug, base_price in events.values_list('pk', 'slug', 'ticket_price')
        }

        # Average fill rate across events that have a capacity.
        fills = []
        for ev in events.prefetch_related('tiers'):
            capacity = ev.effective_capacity()
            if capacity:
                fills.append(min(sold_by_event.get(ev.slug, 0) / capacity, 1))
        avg_fill_rate = round(sum(fills) / len(fills) * 100) if fills else None

        # Best sellers this calendar month.
        month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        month_sold = dict(
            sold.filter(created_at__gte=month_start)
            .values_list('event__slug').annotate(n=Count('id'))
            .values_list('event__slug', 'n')
        )
        month_revenue = dict(
            paid.filter(created_at__gte=month_start)
            .values_list('event__slug').annotate(t=Sum(net_price))
            .values_list('event__slug', 't')
        )
        top_events = [
            {'slug': slug, 'sold': n, 'revenue': str(month_revenue.get(slug, zero))}
            for slug, n in sorted(month_sold.items(), key=lambda kv: kv[1], reverse=True)[:3]
        ]

        return Response({
            'currency': 'NGN',
            'last_30d': window(d30),
            'previous_30d': window(d60, d30),
            'monthly_revenue': monthly_revenue,
            'avg_fill_rate': avg_fill_rate,
            'top_events': top_events,
            'events': per_event,
        })


class EventViewSet(viewsets.ModelViewSet):
    """
    EventViewSet with role-based permissions and category filtering
    Filtering examples:
     - /api/events/?category=web3_crypto
     - /api/events/?search=bitcoin
     - /api/events/?category=technology&search=AI
    """
    # Declared so individual @action()s can set it via initkwargs; DRF rejects
    # action kwargs that are not already attributes on the viewset. Only
    # add_cohost sets a scope — every other action stays unthrottled.
    throttle_scope = None
    queryset = Event.objects.all()
    serializer_class = EventSerializer
    parser_classes = (JSONParser, MultiPartParser, FormParser)
    lookup_field = 'slug'

    def get_permissions(self):
        """
        - List, retrieve, register, categories: Public access (AllowAny)
        - Create: Authenticated users only
        - Update, delete: Owner/co-host only (both can edit)
        """
        if self.action in ['list', 'retrieve', 'register', 'categories', 'locations', 'tiers', 'tier_detail', 'validate_promo', 'form_questions']:
            permission_classes = [AllowAny]
        elif self.action in ['create']:
            permission_classes = [IsAuthenticated]
        elif self.action in ['update', 'partial_update']:
            permission_classes = [IsAuthenticated, IsEventOwnerOrCoHost]
        elif self.action in ['destroy', 'add_cohost', 'update_cohost', 'remove_cohost', 'cancel', 'refunds']:
            permission_classes = [IsAuthenticated, IsEventOwner]
        else:
            permission_classes = [IsAuthenticated]
        
        return [permission() for permission in permission_classes]
    
    def get_queryset(self):
        """
        Show appropriate events based on user with category/date/price/area
        filtering and sorting.

        Query params:
          category   - comma-separated category values, e.g. "concerts,sports"
          search     - free-text search over name/description/location/hosted_by
          area       - comma-separated location substrings, e.g. "Lekki,Ikoyi"
          when       - "today" | "this_weekend" | "this_month"
          date       - exact date "YYYY-MM-DD" (takes precedence over `when`)
          min_price / max_price - filter on the event's effective ticket price
                       (cheapest tier price if tiers exist, else ticket_price)
          host       - an organiser's handle: only their events (the community page)
          sort       - "trending" | "newest" (default) | "date" | "price_low" | "price_high"
        """
        queryset = Event.objects.select_related('owner').prefetch_related('cohosts__user', 'tiers')

        # Category filtering (supports multiple comma-separated values)
        category = self.request.query_params.get('category', None)
        if category:
            categories = [c.strip() for c in category.split(',') if c.strip()]
            queryset = queryset.filter(category__in=categories)

        # One community's events (the community page), matched by the organiser's handle.
        host = (self.request.query_params.get('host') or '').strip()
        if host:
            queryset = queryset.filter(owner__profile__handle__iexact=host)

        # Search filtering
        search = self.request.query_params.get('search', None)
        if search:
            queryset = queryset.filter(
                Q(name__icontains=search) |
                Q(description__icontains=search) |
                Q(location__icontains=search) |
                Q(hosted_by__icontains=search)
            )

        # Area filtering — location is free text, so match by substring
        area = self.request.query_params.get('area', None)
        if area:
            areas = [a.strip() for a in area.split(',') if a.strip()]
            area_q = Q()
            for a in areas:
                area_q |= Q(location__icontains=a)
            queryset = queryset.filter(area_q)

        # Date filtering: exact date takes precedence over the "when" shortcuts
        exact_date = self.request.query_params.get('date', None)
        when = self.request.query_params.get('when', None)
        if exact_date:
            queryset = queryset.filter(day=exact_date)
        elif when:
            today = timezone.localdate()
            if when == 'today':
                queryset = queryset.filter(day=today)
            elif when == 'this_weekend':
                # Next Saturday/Sunday (or today, if it already is the weekend)
                saturday = today + timedelta(days=(5 - today.weekday()) % 7)
                sunday = saturday + timedelta(days=1)
                queryset = queryset.filter(day__in=[saturday, sunday])
            elif when == 'this_month':
                queryset = queryset.filter(day__year=today.year, day__month=today.month)

        # Effective price = cheapest tier price if the event has tiers,
        # otherwise the legacy flat ticket_price.
        # Uses a Subquery (not a JOIN) so events with multiple tiers don't
        # fan out into duplicate rows in the queryset.
        from bryo.models import TicketTier
        cheapest_tier = (
            TicketTier.objects
            .filter(event=OuterRef('pk'))
            .order_by('price')
            .values('price')[:1]
        )
        queryset = queryset.annotate(
            effective_price=Coalesce(
                Subquery(cheapest_tier, output_field=models.DecimalField(max_digits=10, decimal_places=2)),
                models.F('ticket_price'),
            )
        )

        min_price = self.request.query_params.get('min_price', None)
        max_price = self.request.query_params.get('max_price', None)
        if min_price is not None:
            queryset = queryset.filter(effective_price__gte=min_price)
        if max_price is not None:
            queryset = queryset.filter(effective_price__lte=max_price)

        # Permission-based filtering.
        #
        # `private` means UNLISTED, not secret: the event is kept out of every
        # listing (discover, search, categories, locations, sitemap) but anyone
        # holding the link can open its page and buy a ticket. That is the whole
        # point of a private event — the host shares the URL themselves.
        # So the visibility filter applies to listings only; detail lookups
        # (retrieve, register, tiers, ...) resolve any visibility.
        #
        # `is_active` is a different axis — a deactivated event is hidden from
        # everyone but its host, on listings and by direct link alike.
        user = self.request.user
        is_listing = self.action == 'list'

        # Drafts are visible only to the host and co-hosts (and superusers).
        if not user.is_authenticated:
            queryset = queryset.filter(is_active=True, is_draft=False)
            if is_listing:
                queryset = queryset.filter(visibility='public')
        elif not user.is_superuser:
            own = (
                Q(owner=user) |
                Q(
                    cohosts__user=user,
                    cohosts__status=EventCoHost.STATUS_ACCEPTED,
                )
            )
            visible = (
                Q(is_active=True, is_draft=False, visibility='public')
                if is_listing
                else Q(is_active=True, is_draft=False)
            )
            queryset = queryset.filter(visible | own)
        if is_listing:
            queryset = queryset.filter(cancelled_at__isnull=True)
        queryset = queryset.distinct()

        sort = self.request.query_params.get('sort', 'newest')
        # Events Byro is featuring come first (on the default and trending orders, and on the landing page).
        queryset = queryset.annotate(
            featured_now=models.Case(
                models.When(featured_until__gt=timezone.now(), then=models.Value(1)),
                default=models.Value(0), output_field=models.IntegerField(),
            )
        )
        if self.request.query_params.get('featured') in ('1', 'true'):
            queryset = queryset.filter(featured_now=1)
        if sort == 'trending':
            queryset = queryset.annotate(
                ticket_count=models.Count(
                    'tickets', filter=Q(tickets__payment_status__in=['paid', 'free']), distinct=True
                )
            ).order_by('-featured_now', '-ticket_count', '-created_at')
        elif sort == 'date':
            queryset = queryset.order_by('day', 'time_from')
        elif sort == 'price_low':
            queryset = queryset.order_by('effective_price', '-created_at')
        elif sort == 'price_high':
            queryset = queryset.order_by('-effective_price', '-created_at')
        else:
            queryset = queryset.order_by('-featured_now', '-created_at')

        return queryset
    
    @action(detail=False, methods=['GET'], permission_classes=[AllowAny])
    def categories(self, request):
        """
        Get all available event categories with counts
        GET /api/events/categories/
        
        Returns all category choices with their active event counts
        """
        try:
            categories = []
            for choice_value, choice_label in Event.CATEGORY_CHOICES:
                count = Event.objects.filter(
                    category=choice_value, 
                    is_active=True,
                    visibility='public',
                    is_draft=False
                ).count()
                
                categories.append({
                    'value': choice_value,
                    'label': choice_label,
                    'count': count
                })
            
            total_events = Event.objects.filter(
                is_active=True, 
                visibility='public',
                is_draft=False
            ).count()
            
            return Response({
                'categories': categories,
                'total_events': total_events
            }, status=status.HTTP_200_OK)
            
        except Exception as e:
            logger.error(f"Error in categories endpoint: {str(e)}", exc_info=True)
            return Response(
                {"error": "Unable to fetch categories"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    @action(detail=False, methods=['GET'], permission_classes=[AllowAny])
    def locations(self, request):
        """
        Get distinct event locations/areas with counts.
        GET /api/events/locations/

        Unlike `categories`, location is free text on the Event model, so the
        list is derived from whatever values event hosts have actually entered
        (e.g. "Victoria Island", "Mainland", "Ibadan") rather than a fixed
        set of choices.
        """
        try:
            base_qs = Event.objects.filter(
                is_active=True,
                visibility='public',
                is_draft=False
            ).exclude(location='').exclude(location__isnull=True)

            counts = (
                base_qs
                .values('location')
                .annotate(count=models.Count('id'))
                .order_by('-count', 'location')
            )

            locations = [
                {'value': row['location'], 'label': row['location'], 'count': row['count']}
                for row in counts
            ]

            return Response({
                'locations': locations,
                'total_events': base_qs.count()
            }, status=status.HTTP_200_OK)

        except Exception as e:
            logger.error(f"Error in locations endpoint: {str(e)}", exc_info=True)
            return Response(
                {"error": "Unable to fetch locations"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    @method_decorator(never_cache)
    def list(self, request, *args, **kwargs):
        """
        List all events (public access)
        Supports filtering by category and search
        """
        return super().list(request, *args, **kwargs)
    
    @method_decorator(never_cache)
    def retrieve(self, request, *args, **kwargs):
        """Get single event with role information"""
        try:
            return super().retrieve(request, *args, **kwargs)
        except Http404:
            # A suspended event is hidden from the public, but visitors should
            # be told that, not shown a 404. Only what the public page already
            # showed is revealed: name, when, where and who is hosting.
            event = Event.objects.filter(
                slug=kwargs.get(self.lookup_field), is_active=False, is_draft=False
            ).select_related('owner').first()
            if event:
                profile = getattr(event.owner, 'profile', None) if event.owner_id else None
                return Response(
                    {
                        'code': 'event_suspended',
                        'error': 'This event is currently suspended.',
                        'name': event.name,
                        'day': event.day.isoformat() if event.day else None,
                        'time_from': event.time_from.strftime('%H:%M') if event.time_from else None,
                        'location': event.location or '',
                        'organizer': (profile.display_name if profile else '') or '',
                    },
                    status=status.HTTP_403_FORBIDDEN,
                )
            raise
    
    def create(self, request, *args, **kwargs):
        """Create event - automatically sets owner"""
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        # Set default values if not provided
        if 'ticket_price' not in request.data:
            serializer.validated_data['ticket_price'] = 0.00
        
        if 'capacity' not in request.data:
            serializer.validated_data['capacity'] = None
        
        if 'transferable' not in request.data:
            serializer.validated_data['transferable'] = True

        if 'pass_fee_to_attendee' not in request.data:
            serializer.validated_data['pass_fee_to_attendee'] = True

        self.perform_create(serializer)

        log_activity(
            'event.created', request=request, target_type='event',
            target_id=serializer.instance.pk, target_label=serializer.instance.name,
        )
        if not serializer.instance.is_draft:
            notify_admins(
                'event_created', f"New event: {serializer.instance.name}",
                body=request.user.email, link='/events',
            )

        if apps.posthog_client is not None:
            apps.posthog_client.capture(
                'event_created',
                properties={
                    'has_ticket_tier': serializer.instance.tiers.exists(),
                    'is_free': serializer.instance.ticket_price == 0,
                    'visibility': serializer.instance.visibility,
                },
            )
        
        # Build response with full URLs
        event_url = request.build_absolute_uri(
            reverse('event-detail', kwargs={'slug': serializer.data['slug']})
        )

        _send_event_published_email(serializer.instance)
        notify_followers_in_background(serializer.instance)

        response_data = serializer.data
        response_data['event_url'] = event_url
        
        if serializer.instance.event_image:
            response_data['event_image'] = request.build_absolute_uri(
                serializer.instance.event_image.url
            )
        
        return Response(response_data, status=status.HTTP_201_CREATED)
    
    def perform_destroy(self, instance):
        """Delete the event image from Supabase Storage before removing the row."""
        if instance.event_image:
            instance.event_image.delete(save=False)
        log_activity(
            'event.deleted', request=self.request, target_type='event',
            target_id=instance.pk, target_label=instance.name,
        )
        instance.delete()
        if apps.posthog_client is not None:
            apps.posthog_client.capture('event_deleted')

    def update(self, request, *args, **kwargs):
        """Update event - both owner and co-hosts can edit"""
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        
        # Check if user has edit permissions
        user_role = instance.get_user_role(request.user)
        if not user_role.get('can_edit', False):
            return Response(
                {"error": "You don't have permission to edit this event"},
                status=status.HTTP_403_FORBIDDEN
            )
        
        old_image = instance.event_image.name if instance.event_image else None
        was_draft = instance.is_draft

        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)

        # Delete old image from Supabase if a new one was uploaded
        new_image = serializer.instance.event_image.name if serializer.instance.event_image else None
        if old_image and old_image != new_image:
            serializer.instance.event_image.storage.delete(old_image)

        log_activity(
            'event.updated', request=request, target_type='event',
            target_id=serializer.instance.pk, target_label=serializer.instance.name,
        )

        # A draft that has just been published tells the organiser's followers (once).
        notify_followers_in_background(serializer.instance)
        # ...and the admin team, as a new event. A live event can't go back to draft, so this is once.
        if was_draft and not serializer.instance.is_draft:
            notify_admins(
                'event_created', f"New event: {serializer.instance.name}",
                body=serializer.instance.owner.email if serializer.instance.owner_id else '', link='/events',
            )

        if apps.posthog_client is not None:
            apps.posthog_client.capture('event_updated')

        return Response(serializer.data)


    
    @action(detail=True, methods=['GET', 'POST'], url_path='tiers', permission_classes=[AllowAny])
    def tiers(self, request, slug=None):
        """
        GET  /api/events/{slug}/tiers/  — list tiers (public)
        POST /api/events/{slug}/tiers/  — create a tier (owner/co-host only)
        """
        event = self.get_object()

        if request.method == 'GET':
            queryset = event.tiers.all()
            serializer = TicketTierSerializer(queryset, many=True, context={'request': request})
            return Response(serializer.data)

        if not request.user.is_authenticated or not event.can_manage(request.user):
            return Response(
                {"error": "You don't have permission to manage tiers for this event"},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = TicketTierSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        serializer.save(event=event)
        if apps.posthog_client is not None:
            apps.posthog_client.capture('ticket_tier_created')
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(
        detail=True, methods=['PATCH', 'DELETE'],
        url_path=r'tiers/(?P<tier_id>\d+)', permission_classes=[AllowAny],
    )
    def tier_detail(self, request, slug=None, tier_id=None):
        """
        PATCH  /api/events/{slug}/tiers/{tier_id}/ — update a tier (owner/co-host only)
        DELETE /api/events/{slug}/tiers/{tier_id}/ — delete a tier (owner/co-host only)
        """
        event = self.get_object()

        if not request.user.is_authenticated or not event.can_manage(request.user):
            return Response(
                {"error": "You don't have permission to manage tiers for this event"},
                status=status.HTTP_403_FORBIDDEN,
            )

        tier = get_object_or_404(TicketTier, pk=tier_id, event=event)

        if request.method == 'DELETE':
            tier.delete()
            if apps.posthog_client is not None:
                apps.posthog_client.capture('ticket_tier_deleted')
            return Response(status=status.HTTP_204_NO_CONTENT)

        serializer = TicketTierSerializer(
            tier, data=request.data, partial=True, context={'request': request}
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        if apps.posthog_client is not None:
            apps.posthog_client.capture('ticket_tier_updated')
        return Response(serializer.data)

    @action(detail=True, methods=['GET', 'POST'], url_path='promo-codes', permission_classes=[IsAuthenticated])
    def promo_codes(self, request, slug=None):
        """
        GET  /api/events/{slug}/promo-codes/  — list this event's codes (owner/co-host only)
        POST /api/events/{slug}/promo-codes/  — create a code (owner/co-host only)
        """
        event = self.get_object()
        if not event.can_manage(request.user):
            return Response(
                {"error": "You don't have permission to manage promo codes for this event"},
                status=status.HTTP_403_FORBIDDEN,
            )

        if request.method == 'GET':
            queryset = event.promo_codes.all()
            serializer = PromoCodeSerializer(queryset, many=True)
            return Response(serializer.data)

        serializer = PromoCodeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            serializer.save(event=event)
        except IntegrityError:
            return Response(
                {"error": "That code already exists for this event"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(
        detail=True, methods=['PATCH', 'DELETE'],
        url_path=r'promo-codes/(?P<promo_id>\d+)', permission_classes=[IsAuthenticated],
    )
    def promo_code_detail(self, request, slug=None, promo_id=None):
        """
        PATCH  /api/events/{slug}/promo-codes/{promo_id}/ — update a code (owner/co-host only)
        DELETE /api/events/{slug}/promo-codes/{promo_id}/ — delete a code (owner/co-host only)
        """
        event = self.get_object()
        if not event.can_manage(request.user):
            return Response(
                {"error": "You don't have permission to manage promo codes for this event"},
                status=status.HTTP_403_FORBIDDEN,
            )

        promo = get_object_or_404(PromoCode, pk=promo_id, event=event)

        if request.method == 'DELETE':
            promo.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)

        serializer = PromoCodeSerializer(promo, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        try:
            serializer.save()
        except IntegrityError:
            return Response(
                {"error": "That code already exists for this event"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(serializer.data)

    @action(detail=True, methods=['GET'], permission_classes=[IsAuthenticated])
    def my_role(self, request, slug=None):
        """
        Get the current user's role for this event
        GET /api/events/{slug}/my_role/
        """
        event = self.get_object()
        role = event.get_user_role(request.user)
        
        return Response({
            'event': event.slug,
            'event_name': event.name,
            'role': role
        })
    
    @action(detail=True, methods=['POST'], permission_classes=[AllowAny])
    def register(self, request, slug=None):
        """
        Register for an event.
        POST /api/events/<slug>/register/

        Body:
          name          (str, required)
          email         (str, required)
          form_answers  (list, optional) — [{question_id: <id>, answer: <value>}, ...]
        """
        try:
            event = self.get_object()
            if event.cancelled_at:
                return Response(
                    {"error": "This event has been cancelled."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if event.is_draft:
                return Response(
                    {"error": "This event is not open for registration yet."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if event.sales_closed:
                return Response(
                    {"error": "Registration for this event is closed."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            tier_id = request.data.get('tier_id')

            name = request.data.get('name', '').strip()
            email = request.data.get('email', '').strip()
            if not name or not email:
                return Response(
                    {"error": "name and email are required"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            # Prevent double-registration for the same email
            if event.tickets.filter(current_owner_email=email).exists():
                existing = event.tickets.filter(current_owner_email=email).first()
                serializer = TicketSerializer(existing, context={'request': request})
                return Response(
                    {**serializer.data, 'message': 'Already registered'},
                    status=status.HTTP_200_OK,
                )

            # Validate required form questions
            answers, answers_error = _clean_answers(event, request.data.get('form_answers'))
            if answers_error:
                return Response({"error": answers_error}, status=status.HTTP_400_BAD_REQUEST)

            reg_tier = TicketTier.objects.filter(pk=tier_id, event=event).first() if tier_id else None
            if reg_tier is not None and reg_tier.min_tickets_per_person > 1:
                return Response(
                    {"error": f"{reg_tier.name} tickets are sold {reg_tier.min_tickets_per_person} at a time or more."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            try:
                with transaction.atomic():
                    tier = lock_and_check_capacity(event, tier_id, 1)

                    unit_price = tier.price if tier is not None else event.ticket_price

                    # Link to logged-in account if available
                    linked_user = request.user if request.user.is_authenticated else None

                    ticket = Ticket.objects.create(
                        event=event,
                        tier=tier,
                        user=linked_user,
                        original_owner_name=name,
                        original_owner_email=email,
                        current_owner_name=name,
                        current_owner_email=email,
                        payment_status='free' if unit_price == 0 else 'pending',
                    )

                    _save_answers([ticket], answers)
                if _wants_follow(request.data):
                    follow_organizer(linked_user, event)
            except InsufficientCapacityError as e:
                return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

            ticket_sale(event, 1, buyer=ticket.original_owner_name or '')

            serializer = TicketSerializer(ticket, context={'request': request})
            ticket_url = request.build_absolute_uri(
                reverse('ticket-detail', kwargs={'ticket_id': str(ticket.ticket_id)})
            )
            return Response(
                {**serializer.data, 'ticket_url': ticket_url, 'message': 'Registration successful'},
                status=status.HTTP_201_CREATED,
            )

        except Http404:
            raise
        except Exception as e:
            logger.exception("Error in event registration")
            return Response(
                {"error": "We couldn't register you. Try again in a moment."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    @action(detail=True, methods=['POST'], url_path='validate-promo', permission_classes=[AllowAny])
    def validate_promo(self, request, slug=None):
        """
        POST /api/events/<slug>/validate-promo/   {code}

        Tells the checkout cart what a code is worth so it can show a live
        discount. The charge itself is still recomputed and re-validated
        server-side in initialize_payment — this endpoint is display-only.
        """
        event = self.get_object()
        code = (request.data.get('code') or '').strip().upper()
        if not code:
            return Response({'valid': False, 'error': 'A promo code is required'}, status=status.HTTP_400_BAD_REQUEST)

        promo = PromoCode.objects.filter(event=event, code=code).first()
        if not promo or not promo.is_valid():
            return Response({'valid': False, 'error': 'Invalid or expired promo code'}, status=status.HTTP_404_NOT_FOUND)

        return Response({
            'valid': True,
            'code': promo.code,
            'discount_type': promo.discount_type,
            'amount': str(promo.amount),
        })

    @action(detail=True, methods=['GET'], permission_classes=[IsAuthenticated])
    def my_ticket(self, request, slug=None):
        """
        Get the current user's ticket for this event.
        GET /api/events/<slug>/my_ticket/
        """
        event = self.get_object()
        ticket = (
            Ticket.objects
            .filter(event=event, user=request.user)
            .select_related('event')
            .first()
        )
        if not ticket:
            # Fall back to email match for tickets registered before login existed
            ticket = (
                Ticket.objects
                .filter(event=event, current_owner_email=request.user.email)
                .first()
            )
        if not ticket:
            return Response({'registered': False}, status=status.HTTP_200_OK)
        serializer = TicketSerializer(ticket, context={'request': request})
        return Response({'registered': True, **serializer.data})

    @action(detail=True, methods=['GET'], permission_classes=[IsAuthenticated])
    def attendees(self, request, slug=None):
        """
        Full attendee list — owner and co-hosts only.
        GET /api/events/<slug>/attendees/
        Query params: ?checked_in=true|false
        """
        event = self.get_object()
        role = event.get_user_role(request.user)
        if not role['can_check_in']:
            return Response(
                {'error': 'Only the event owner or co-hosts can view attendees'},
                status=status.HTTP_403_FORBIDDEN,
            )

        tickets = event.tickets.select_related('user').prefetch_related('form_answers__question')

        checked_in_filter = request.query_params.get('checked_in')
        if checked_in_filter == 'true':
            tickets = tickets.filter(checked_in=True)
        elif checked_in_filter == 'false':
            tickets = tickets.filter(checked_in=False)

        # Only show confirmed tickets by default
        status_filter = request.query_params.get('payment_status', 'confirmed')
        if status_filter == 'confirmed':
            tickets = tickets.filter(payment_status__in=['paid', 'free'])
        elif status_filter != 'all':
            tickets = tickets.filter(payment_status=status_filter)

        serializer = TicketSerializer(tickets, many=True, context={'request': request})
        return Response({
            'count': tickets.count(),
            'checked_in_count': tickets.filter(checked_in=True).count(),
            'attendees': serializer.data,
        })

    @action(detail=True, methods=['POST'], permission_classes=[IsAuthenticated])
    def checkin(self, request, slug=None):
        """
        Check in an attendee — owner and co-hosts only.
        POST /api/events/<slug>/checkin/

        Body (one of):
          { "qr_token": "<uuid>" }      — scanned from QR code
          { "email": "user@email.com" } — manual override
        """
        event = self.get_object()
        role = event.get_user_role(request.user)
        if not role['can_check_in']:
            return Response(
                {'error': 'Only the event owner or co-hosts can check in attendees'},
                status=status.HTTP_403_FORBIDDEN,
            )

        qr_token = request.data.get('qr_token')
        email = request.data.get('email', '').strip()

        ticket = None
        if qr_token:
            ticket = Ticket.objects.filter(event=event, qr_token=qr_token).first()
        elif email:
            ticket = Ticket.objects.filter(
                event=event, current_owner_email=email
            ).order_by('-created_at').first()

        if not ticket:
            return Response(
                {'error': 'Ticket not found. Check the QR code or email and try again.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        if ticket.payment_status in ('refunded', 'cancelled'):
            return Response(
                {'error': 'This ticket was cancelled because the event was cancelled.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if ticket.payment_status not in ('paid', 'free'):
            return Response(
                {'error': 'This ticket has not been paid for, so it cannot be used to get in.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        tier_name = ticket.tier.name if ticket.tier_id else 'General admission'

        if ticket.checked_in:
            return Response({
                'already_checked_in': True,
                'checked_in_at': ticket.checked_in_at,
                'attendee': {
                    'name': ticket.current_owner_name,
                    'email': ticket.current_owner_email,
                    'ticket_id': str(ticket.ticket_id),
                    'tier_name': tier_name,
                    'checked_in_at': ticket.checked_in_at,
                },
                'counts': _checkin_counts(event),
            }, status=status.HTTP_200_OK)

        ticket.checked_in = True
        ticket.checked_in_at = timezone.now()
        ticket.save(update_fields=['checked_in', 'checked_in_at'])
        record_stamp(ticket)

        log_activity(
            'ticket.checked_in', request=request, target_type='event',
            target_id=event.pk, target_label=event.name, detail=ticket.current_owner_email,
        )

        if apps.posthog_client is not None:
            apps.posthog_client.capture('attendee_checked_in')

        return Response({
            'success': True,
            'attendee': {
                'name': ticket.current_owner_name,
                'email': ticket.current_owner_email,
                'ticket_id': str(ticket.ticket_id),
                'tier_name': tier_name,
                'checked_in_at': ticket.checked_in_at,
            },
            'counts': _checkin_counts(event),
        }, status=status.HTTP_200_OK)

    @action(detail=True, methods=['GET'], permission_classes=[IsAuthenticated])
    def stats(self, request, slug=None):
        """
        Event stats — owner and co-hosts only.
        GET /api/events/<slug>/stats/
        """
        event = self.get_object()
        role = event.get_user_role(request.user)
        if not role['can_check_in']:
            return Response(
                {'error': 'Only the event owner or co-hosts can view stats'},
                status=status.HTTP_403_FORBIDDEN,
            )

        tickets = event.tickets.all()
        confirmed = tickets.filter(payment_status__in=['paid', 'free'])
        return Response({
            'total_registrations': confirmed.count(),
            'checked_in': confirmed.filter(checked_in=True).count(),
            'not_checked_in': confirmed.filter(checked_in=False).count(),
            'paid': tickets.filter(payment_status='paid').count(),
            'free': tickets.filter(payment_status='free').count(),
            'pending_payment': tickets.filter(payment_status='pending').count(),
            'capacity': event.capacity,
            'spots_left': (
                (event.capacity - confirmed.count())
                if event.capacity else None
            ),
        })

    @action(
        detail=True,
        methods=['GET', 'POST', 'PUT'],
        url_path='form-questions',
        permission_classes=[AllowAny],  # reading is public: buyers answer these at checkout
    )
    def form_questions(self, request, slug=None):
        """
        Manage custom registration questions for an event.
        GET  /api/events/<slug>/form-questions/  — list questions (public on event detail)
        POST /api/events/<slug>/form-questions/  — add a question (owner/cohost only)

        POST body:
          { "question": "...", "question_type": "text", "required": true, "order": 1 }
        """
        event = self.get_object()

        if request.method == 'GET':
            qs = event.form_questions.all()
            return Response(EventFormQuestionSerializer(qs, many=True).data)

        # POST / PUT — only owner/cohost can change questions
        if not request.user.is_authenticated:
            return Response({'error': 'Sign in to manage form questions'}, status=status.HTTP_401_UNAUTHORIZED)
        if not event.can_manage(request.user):
            return Response(
                {'error': 'Only the event owner or co-hosts can manage form questions'},
                status=status.HTTP_403_FORBIDDEN,
            )

        if request.method == 'PUT':
            # The whole list at once, in order: [{id?, question, question_type, options, required}, ...]
            items = request.data if isinstance(request.data, list) else request.data.get('questions')
            if not isinstance(items, list) or len(items) > 20:
                return Response({'error': 'Send a list of up to 20 questions'}, status=status.HTTP_400_BAD_REQUEST)
            existing = {q.id: q for q in event.form_questions.all()}
            serializers_ = []
            for index, item in enumerate(items):
                if not isinstance(item, dict):
                    return Response({'error': 'Each question must be an object'}, status=status.HTTP_400_BAD_REQUEST)
                instance = existing.get(item.get('id'))
                if item.get('id') is not None and instance is None:
                    return Response({'error': 'Unknown question'}, status=status.HTTP_400_BAD_REQUEST)
                ser = EventFormQuestionSerializer(instance, data={**item, 'order': index}, partial=instance is not None)
                ser.is_valid(raise_exception=True)
                serializers_.append(ser)

            kept = {ser.instance.id for ser in serializers_ if ser.instance is not None}
            removed = [q for qid, q in existing.items() if qid not in kept]
            answered = [q.question for q in removed if EventFormAnswer.objects.filter(question=q).exists()]
            if answered:
                return Response(
                    {'error': f'Guests already answered "{answered[0]}", so it can\'t be removed.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            with transaction.atomic():
                for q in removed:
                    q.delete()
                saved = [ser.save(event=event) for ser in serializers_]
            return Response(EventFormQuestionSerializer(saved, many=True).data)

        serializer = EventFormQuestionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(event=event)
        return Response(serializer.data, status=status.HTTP_201_CREATED)
    
    def destroy(self, request, *args, **kwargs):
        """
        Delete an event. Refused while buyers have paid for it or are owed a refund:
        deleting would wipe their payments with no money going back. Cancel it instead.
        """
        event = self.get_object()
        if event.tickets.filter(payment_status='paid').exists() or _refunds_unfinished(event):
            return Response(
                {'error': 'This event has paid tickets or refunds in progress, so it cannot be deleted. '
                          'Cancel it instead and your buyers will be refunded.'},
                status=status.HTTP_409_CONFLICT,
            )
        return super().destroy(request, *args, **kwargs)

    @action(detail=True, methods=['GET', 'POST'], url_path='cancel',
            permission_classes=[IsAuthenticated, IsEventOwner])
    def cancel(self, request, slug=None):
        """
        Cancel an event and refund its paid tickets. Owner only.

        GET  /api/events/<slug>/cancel/   what cancelling would do (nothing changes)
        POST /api/events/<slug>/cancel/   {"reason": "..."}  cancel it

        Buyers cannot ask for refunds; this is the only way money goes back.
        Each buyer is refunded the ticket price they paid. Byro's service fee
        and the payment charge are not refundable.
        """
        event = self.get_object()

        if request.method == 'GET':
            if event.cancelled_at:
                return Response({'cancelled': True, 'progress': refund_progress(event)})
            return Response({'cancelled': False, 'preview': cancellation_preview(event)})

        reason = (request.data.get('reason') or '').strip()
        if len(reason) < 3:
            return Response({'error': 'Tell your attendees why the event is cancelled.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            summary = cancel_event(event, reason)
        except EventCancellationError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

        log_activity(
            'event.cancelled', request=request, target_type='event', target_id=event.pk,
            target_label=event.name, detail=f"{summary['paid_orders']} refunds, NGN {summary['refund_total']}",
        )
        if summary['paid_orders']:
            _alert_byro_of_refunds(event, summary)
        try:
            progress = process_event_refunds(event)  # sends the first emails; no money moves
        except Exception:
            logger.exception('First notices failed for event %s', event.pk)
            progress = refund_progress(event)
        return Response({'cancelled': True, 'summary': summary, 'progress': progress})

    @action(detail=True, methods=['GET'], url_path='refunds',
            permission_classes=[IsAuthenticated, IsEventOwner])
    def refunds(self, request, slug=None):
        """
        GET /api/events/<slug>/refunds/   where the refunds for a cancelled event have got to

        Read-only. Money is sent by a Byro admin from the admin panel, because the
        Paystack balance the refunds come out of belongs to Byro.
        """
        event = self.get_object()
        if not event.cancelled_at:
            return Response({'error': 'This event has not been cancelled.'}, status=status.HTTP_400_BAD_REQUEST)
        return Response(refund_progress(event))

    @action(detail=True, methods=['POST'], permission_classes=[IsAuthenticated, IsEventOwner],
            throttle_classes=[ScopedRateThrottle], throttle_scope='cohost_invite')
    def add_cohost(self, request, slug=None):
        """
        Add co-host to event - only event owner can add co-hosts
        POST /api/events/{slug}/add_cohost/
        Body: {"email": "cohost@example.com", "role": "manager" | "checkin"}
        role is optional and defaults to "manager". "checkin" can only see the
        guest list and check people in.

        The invitee does not need a Byro account. If they have never signed in,
        the grant is stored as pending and claimed automatically the first time
        they sign in with this address (see auth_views.claim_pending_cohost_invites).
        They get one email whose Accept button leads to sign-in/sign-up.
        A pending grant confers no access.
        """
        event = self.get_object()
        email = (request.data.get('email') or '').strip().lower()
        role = (request.data.get('role') or EventCoHost.ROLE_MANAGER).strip().lower()

        if not email:
            return Response(
                {"error": "Email is required"},
                status=status.HTTP_400_BAD_REQUEST
            )
        if role not in dict(EventCoHost.ROLE_CHOICES):
            return Response(
                {"error": "Role must be 'manager' or 'checkin'"},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            validate_email(email)
        except DjangoValidationError:
            return Response(
                {"error": "Enter a valid email address"},
                status=status.HTTP_400_BAD_REQUEST
            )

        cohost_user = User.objects.filter(email__iexact=email).first()

        if cohost_user and event.owner == cohost_user:
            return Response(
                {"error": "User is already the owner of this event"},
                status=status.HTTP_400_BAD_REQUEST
            )
        if event.owner.email.lower() == email:
            return Response(
                {"error": "User is already the owner of this event"},
                status=status.HTTP_400_BAD_REQUEST
            )

        existing = EventCoHost.objects.filter(event=event).filter(
            Q(user=cohost_user) if cohost_user else Q(invited_email__iexact=email, user__isnull=True)
        ).first()
        if existing:
            return Response(
                {"error": "User is already a co-host for this event"},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Registered user — grant immediately.
        if cohost_user:
            cohost = EventCoHost.objects.create(
                event=event,
                user=cohost_user,
                invited_email=email,
                status=EventCoHost.STATUS_ACCEPTED,
                role=role,
                accepted_at=timezone.now(),
                added_by=request.user,
            )
            send_cohost_invite_email(email, event, request.user, is_new_user=False, role=role)
            if apps.posthog_client is not None:
                apps.posthog_client.capture(
                    'cohost_invited', properties={'invitee_has_account': True}
                )
            return Response({
                "message": f"{cohost_user.email} added as co-host",
                "cohost_id": cohost.id,
                "status": cohost.status,
                "cohost": {
                    "id": cohost.id,
                    "email": cohost_user.email,
                    "name": cohost_user.get_full_name() or cohost_user.email,
                    "role": cohost.role,
                    "added_at": cohost.added_at,
                }
            }, status=status.HTTP_201_CREATED)

        # Unknown email — invite them. This used to 404.
        cohost = EventCoHost.objects.create(
            event=event,
            user=None,
            invited_email=email,
            status=EventCoHost.STATUS_PENDING,
            role=role,
            added_by=request.user,
        )
        # One email only: it carries an Accept link to sign in or sign up, so we
        # no longer ask WorkOS to send a second, separate sign-up invitation.
        # A failure here must not undo the pending grant.
        send_cohost_invite_email(email, event, request.user, is_new_user=True, role=role)
        if apps.posthog_client is not None:
            apps.posthog_client.capture(
                'cohost_invited', properties={'invitee_has_account': False}
            )

        return Response({
            "message": f"Invitation sent to {email}",
            "cohost_id": cohost.id,
            "status": cohost.status,
            "cohost": {
                "id": cohost.id,
                "email": email,
                "name": email,
                "role": cohost.role,
                "added_at": cohost.added_at,
            }
        }, status=status.HTTP_201_CREATED)
    
    @action(detail=True, methods=['PATCH'], permission_classes=[IsAuthenticated, IsEventOwner])
    def update_cohost(self, request, slug=None):
        """
        Change what a co-host (or a pending invite) may do - only the event owner.
        PATCH /api/events/{slug}/update_cohost/
        Body: {"cohost_id": 123, "role": "manager" | "checkin"}
        """
        event = self.get_object()
        cohost_id = request.data.get('cohost_id')
        role = (request.data.get('role') or '').strip().lower()

        if not cohost_id:
            return Response({"error": "cohost_id is required"}, status=status.HTTP_400_BAD_REQUEST)
        if role not in dict(EventCoHost.ROLE_CHOICES):
            return Response(
                {"error": "Role must be 'manager' or 'checkin'"},
                status=status.HTTP_400_BAD_REQUEST
            )
        try:
            cohost = EventCoHost.objects.get(id=cohost_id, event=event)
        except EventCoHost.DoesNotExist:
            return Response({"error": "Co-host not found"}, status=status.HTTP_404_NOT_FOUND)

        cohost.role = role
        cohost.save(update_fields=['role'])
        return Response({"message": "Permissions updated", "cohost_id": cohost.id, "role": cohost.role})

    @action(detail=True, methods=['DELETE'], permission_classes=[IsAuthenticated, IsEventOwner])
    def remove_cohost(self, request, slug=None):
        """
        Remove co-host from event - only event owner
        DELETE /api/events/{slug}/remove_cohost/
        Body: {"cohost_id": 123}
        """
        event = self.get_object()
        cohost_id = request.data.get('cohost_id')
        
        if not cohost_id:
            return Response(
                {"error": "cohost_id is required"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            cohost = EventCoHost.objects.get(id=cohost_id, event=event)
            # A pending invite has no user yet — fall back to the invited address
            # so revoking an unaccepted invitation works too.
            cohost_email = cohost.user.email if cohost.user else cohost.invited_email
            cohost.delete()
            
            return Response({
                "message": f"{cohost_email} removed as co-host"
            }, status=status.HTTP_200_OK)
            
        except EventCoHost.DoesNotExist:
            return Response(
                {"error": "Co-host not found"},
                status=status.HTTP_404_NOT_FOUND
            )


class TicketViewSet(
    mixins.RetrieveModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    """
    ViewSet for Ticket operations (User facing)
    retrieve: Get one ticket by its id
    destroy: Cancel a free registration
    transfer / qr / calendar: ticket actions

    Deliberately NOT a ModelViewSet. This viewset is unauthenticated: the
    ticket id is the only credential. Listing, creating or editing tickets here
    would let anyone read every attendee's details and ticket ids, mint paid
    tickets for free, or mark a pending ticket paid. Tickets are created by the
    payment and registration flows only.
    """
    queryset = Ticket.objects.all()
    serializer_class = TicketSerializer
    lookup_field = 'ticket_id'
    lookup_url_kwarg = 'ticket_id'
    lookup_value_regex = '[0-9a-f-]{36}'
    permission_classes = [AllowAny] 

    
    def get_object(self):
        """
        Explicit override for debugging
        """
        ticket_id = self.kwargs['ticket_id']
        print(f"Attempting to find ticket: {ticket_id}")
        try:
            return Ticket.objects.get(ticket_id=ticket_id)
        except Ticket.DoesNotExist:
            print(f"Current tickets in DB: {list(Ticket.objects.values_list('ticket_id', flat=True))}")
            raise
    
    def destroy(self, request, *args, **kwargs):
        """Cancel a registration. Free tickets only.

        This endpoint is open to anyone holding the ticket id, so it must never
        delete a ticket someone paid for: that would drop the ticket with no
        refund. Paid tickets are refused here.
        """
        ticket = self.get_object()
        if ticket.payment_status != 'free':
            return Response(
                {'error': "Paid tickets can't be cancelled here."},
                status=status.HTTP_403_FORBIDDEN,
            )
        return super().destroy(request, *args, **kwargs)

    @action(detail=True, methods=['post'])
    def transfer(self, request, pk=None,  *args, **kwargs):  
        ticket = self.get_object()
        
        if not ticket.event.transferable:
            return Response(
                {"error": "This ticket is not transferable"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        serializer = TicketTransferSerializer(
            data=request.data,
            context={
                'request': request,
                'ticket': ticket
            }
        )
        
        if serializer.is_valid():
            transfer = serializer.save(
                ticket=ticket,
                from_user_name=ticket.current_owner_name,
                from_user_email=ticket.current_owner_email
            )
            
            transfer_url = request.build_absolute_uri(
                reverse('accept-transfer', args=[str(transfer.transfer_key)])
            )
            log_activity(
                'ticket.transfer_started', request=request, email=ticket.current_owner_email,
                target_type='ticket', target_id=ticket.ticket_id,
                target_label=ticket.event.name, detail=f"to {transfer.to_user_email}",
            )
            
            return Response({
                "transfer_id": transfer.id,
                "transfer_url": transfer_url,
                "message": "Transfer ready. Send this link to the person you're giving the ticket to."
            }, status=status.HTTP_201_CREATED)
        
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['get'], permission_classes=[AllowAny])
    def qr(self, request, ticket_id=None):
        """PNG QR code encoding this ticket's check-in token."""
        from .qr import generate_qr_png
        ticket = self.get_object()
        png_bytes = generate_qr_png(str(ticket.qr_token))
        return HttpResponse(png_bytes, content_type='image/png')

    @action(detail=True, methods=['get'], permission_classes=[AllowAny])
    def calendar(self, request, ticket_id=None):
        """.ics calendar file for this ticket's event."""
        from datetime import datetime, timedelta
        from django.utils.text import slugify
        from .ics import generate_ics
        ticket = self.get_object()
        event = ticket.event
        start = datetime.combine(event.day, event.time_from)
        end = (
            datetime.combine(event.day, event.time_to)
            if event.time_to and event.time_to > event.time_from
            else start + timedelta(hours=2)
        )
        ics_bytes = generate_ics(
            event_name=event.name,
            description=event.description,
            location=event.location or '',
            start=start,
            end=end,
            organizer_name='Byro',
            uid=f"byro-ticket-{ticket.ticket_id}@usebyro.com",
        )
        response = HttpResponse(ics_bytes, content_type='text/calendar; charset=utf-8')
        filename = slugify(event.name) or 'event'
        response['Content-Disposition'] = f'attachment; filename="{filename}.ics"'
        return response

class TicketTransferViewSet(mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    """
    ViewSet for Ticket Transfer operations
    retrieve: Get transfer details (by its key)
    accept: Accept a transfer

    Not a ModelViewSet: any signed-in user could otherwise list every transfer
    (including each one's secret key and the attendee details) or create and edit
    transfers. Transfers are started from the ticket's own transfer action.
    """
    queryset = TicketTransfer.objects.all()
    serializer_class = TicketTransferSerializer
    lookup_field = 'transfer_key'
    lookup_value_regex = '[0-9a-f-]{36}'
    
    @action(detail=True, methods=['post'], permission_classes=[AllowAny])
    def accept(self, request, transfer_key=None):
        transfer = self.get_object()
        
        if transfer.is_accepted:
            return Response(
                {"error": "Transfer already completed"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        ticket = transfer.ticket
        ticket.current_owner_name = transfer.to_user_name
        ticket.current_owner_email = transfer.to_user_email
        ticket.is_transferred = True
        ticket.save()
        
        transfer.is_accepted = True
        transfer.save()

        log_activity(
            'ticket.transfer_completed', request=request, email=transfer.to_user_email,
            target_type='ticket', target_id=ticket.ticket_id,
            target_label=ticket.event.name, detail=f"from {transfer.from_user_email}",
        )

        if apps.posthog_client is not None:
            apps.posthog_client.capture('ticket_transfer_completed')
        
        ticket_url = request.build_absolute_uri(
            reverse('ticket-detail', args=[str(ticket.ticket_id)])
        )
        
        return Response({
            "ticket_url": ticket_url,
            "message": "Transfer completed successfully"
        }, status=status.HTTP_200_OK)


# ---------------------------------------------------------------------------
# Payout endpoints
# ---------------------------------------------------------------------------

def ticket_net_price_expr():
    """
    What the organiser earns from one paid ticket.

    Starts from the tier price (or the event's flat ticket_price), then takes
    off this ticket's share of any promo-code discount. Checkout records the
    discount for a whole purchase on Payment.metadata['discount_amount'], and a
    purchase can produce several tickets, so each ticket carries an equal share.
    If the organiser absorbs Byro's service fee (`pass_fee_to_attendee=False`),
    that fee is the order's own recorded rate (Payment.fee_rate) of the DISCOUNTED
    price and is deducted here, so changing the fee later never changes old earnings.

    Shared by the payout balance and the dashboard analytics so both agree.
    """
    money = models.DecimalField(max_digits=12, decimal_places=2)
    whole = models.IntegerField()
    ticket_price = Coalesce(
        F('tier__price'), F('event__ticket_price'), Decimal('0'), output_field=money
    )
    # Discounts are whole naira. Split them in whole naira, rounding each
    # ticket's share UP, so an uneven split can only ever under-credit the
    # organiser by a few naira, never over-credit. Plain integer arithmetic
    # keeps this identical on SQLite and Postgres.
    discount = Coalesce(
        Cast(Cast(KeyTextTransform('discount_amount', 'payment__metadata'), money), whole),
        0,
        output_field=whole,
    )
    tickets_in_payment = Coalesce(
        Subquery(
            Ticket.objects.filter(payment=OuterRef('payment'))
            .order_by()
            .values('payment')
            .annotate(n=Count('pk'))
            .values('n')[:1],
            output_field=whole,
        ),
        1,
        output_field=whole,
    )
    discount_share = models.ExpressionWrapper(
        (discount + tickets_in_payment - 1) / tickets_in_payment, output_field=whole
    )
    after_discount = Greatest(
        models.ExpressionWrapper(ticket_price - discount_share, output_field=money),
        Decimal('0'),
        output_field=money,
    )
    return models.Case(
        models.When(
            event__pass_fee_to_attendee=False,
            then=models.ExpressionWrapper(
                after_discount * (Decimal('1') - Coalesce(F('payment__fee_rate'), DEFAULT_FEE_RATE,
                                                         output_field=models.DecimalField(max_digits=5, decimal_places=4))),
                output_field=money
            ),
        ),
        default=after_discount,
        output_field=money,
    )


def compute_available_balance(user, event=None):
    """
    Funds an organiser can currently withdraw.

    = ticket revenue on events they OWN. Co-hosts help run an event but the
      money belongs to its owner, so co-hosting earns nothing here.
      (price of every sold/paid ticket — tier price, or the event's flat
      ticket_price for tier-less events, less any promo-code discount;
      free tickets contribute nothing)
    − sum of payout requests that are still pending, on hold or already processed
      (rejected requests don't hold funds).

    Revenue is taken from tickets actually sold, not from Payment.amount,
    since the payment total also includes the service fee that never
    belongs to the organiser.

    For events where the organiser has chosen to absorb Byro's service fee
    (`pass_fee_to_attendee=False`), that fee is deducted from the ticket
    price here instead of being added to what the attendee paid.

    When `event` is given, the balance is scoped to that single event.
    """
    if event is not None:
        if event.owner_id != user.id:
            return Decimal('0')
        event_ids = [event.pk]
    else:
        event_ids = list(Event.objects.filter(owner=user).values_list('pk', flat=True))

    net_price = ticket_net_price_expr()
    earned = (
        Ticket.objects.filter(event_id__in=event_ids, payment_status='paid')
        .aggregate(total=Coalesce(Sum(net_price), Decimal('0')))['total']
    )

    payouts = PayoutRequest.objects.filter(
        user=user, status__in=['pending', 'on_hold', 'processed']
    )
    if event is not None:
        payouts = payouts.filter(event=event)
    withdrawn = payouts.aggregate(total=Coalesce(Sum('amount'), Decimal('0')))['total']

    return earned - withdrawn


class PayoutRequestView(APIView):
    """
    GET  /api/payouts/  — organiser's own payout history
    POST /api/payouts/  — organiser submits a new payout request
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        qs = PayoutRequest.objects.filter(user=request.user)
        return Response(PayoutRequestSerializer(qs, many=True).data)

    def post(self, request):
        serializer = PayoutRequestSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        event = serializer.validated_data.get('event')
        if event is not None and event.owner_id != request.user.id:
            return Response(
                {'error': 'Only the event owner can request a payout for an event'},
                status=status.HTTP_403_FORBIDDEN,
            )

        available = compute_available_balance(request.user, event=event)
        if available <= 0:
            return Response(
                {'error': 'You have no funds available to withdraw.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        amount = serializer.validated_data.get('amount')
        if amount is not None and amount > available:
            return Response(
                {'error': f'You can withdraw up to ₦{available:,.2f}. Enter that amount or less.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # If a cancelled event's money was already paid out to this organiser, Byro
        # refunded its buyers anyway, so that event sits in the red. Their balance
        # across ALL events has to cover the request, which holds back withdrawals
        # until later ticket sales have made up the difference.
        overall = compute_available_balance(request.user)
        if overall < available and (amount is None or amount > overall):
            return Response(
                {'error': (
                    'You cannot withdraw this yet. Money already paid out for an event that was '
                    'cancelled has been refunded to its buyers, and it is being taken out of your '
                    f'ticket sales first. Your balance across all events is ₦{overall:,.2f}.'
                )},
                status=status.HTTP_400_BAD_REQUEST,
            )

        payout = serializer.save(user=request.user)

        # Persist bank details to user profile for pre-fill next time
        if payout.method == 'bank':
            profile = request.user.profile
            profile.bank_name = payout.bank_name or profile.bank_name
            profile.account_number = payout.account_number or profile.account_number
            profile.account_name = payout.account_name or profile.account_name
            profile.save(update_fields=['bank_name', 'account_number', 'account_name'])

        try:
            from .emails import payout_requested_email
            from .mailer import send_email
            email_data = payout_requested_email(
                name=request.user.get_full_name() or request.user.email,
                amount=payout.amount,
                bank_name=payout.bank_name,
                account_number=payout.account_number,
                event_name=payout.event.name if payout.event else None,
                requested_at=timezone.localtime(payout.requested_at).strftime('%-d %b %Y, %-I:%M %p'),
                reference=payout.reference,
                payouts_url=f"{(settings.FRONTEND_URL or 'https://usebyro.com').rstrip('/')}/dashboard/payouts",
            )
            send_email(
                to=request.user.email,
                subject=email_data['subject'],
                html=email_data['html'],
                text=email_data['text'],
            )
        except Exception as e:
            logger.error(f"Failed to send payout request email for payout {payout.pk}: {e}")

        log_activity(
            'payout.requested', request=request, target_type='payout',
            target_id=payout.pk, target_label=payout.event.name if payout.event else '',
            detail=f"{payout.amount} via {payout.method}",
        )
        notify_admins(
            'payout_request', f"Payout request: ₦{float(payout.amount):,.0f}",
            body=f"{request.user.email}{', ' + payout.event.name if payout.event else ''}", link='/payouts',
        )

        if apps.posthog_client is not None:
            apps.posthog_client.capture(
                'payout_requested',
                properties={
                    'amount': float(payout.amount),
                    'method': payout.method,
                    'is_event_specific': payout.event_id is not None,
                },
            )

        return Response(PayoutRequestSerializer(payout).data, status=status.HTTP_201_CREATED)


class PayoutBalanceView(APIView):
    """GET /api/payouts/balance/ — organiser's available/paid-out/pending totals."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        # Never negative: a past co-host who withdrew before only the owner could
        # earn now has payouts but no earnings.
        available = max(compute_available_balance(request.user), Decimal('0'))
        payouts = PayoutRequest.objects.filter(user=request.user)
        paid_out = sum(
            (p.amount for p in payouts if p.status == 'processed'), Decimal('0')
        )
        pending = sum(
            (p.amount for p in payouts if p.status in ('pending', 'on_hold')), Decimal('0')
        )
        on_hold = sum(
            (p.amount for p in payouts if p.status == 'on_hold'), Decimal('0')
        )
        return Response({
            'available': str(available),
            'paid_out': str(paid_out),
            'pending': str(pending),
            'on_hold': str(on_hold),
            'currency': 'NGN',
        })


def _refunds_unfinished(event):
    """Refunds for this event that have not reached the buyer yet. Deleting the event would erase them."""
    return event.refunds.exclude(status=Refund.STATUS_PROCESSED).exists()


def _alert_byro_of_refunds(event, summary):
    """Email the Byro team that refunds are waiting to be sent. Never blocks the cancellation."""
    try:
        from .emails import refunds_awaiting_email
        from .mailer import send_email
        mail = refunds_awaiting_email(
            event.name, event.owner.email, summary['paid_orders'], summary['refund_total'],
            f"{settings.SITE_URL}/admin/refunds",
        )
        send_email(getattr(settings, 'REFUND_ALERT_EMAIL', 'support@usebyro.com'), mail['subject'], mail['html'], mail['text'])
    except Exception:
        logger.exception('Could not alert Byro about refunds for event %s', event.pk)


class AdminRefundsView(APIView):
    """
    GET /api/admin/refunds/ — every cancelled event that has refunds, how far each has got,
    and Byro's Paystack balance so an admin can check the money is there before sending.
    """
    permission_classes = [IsAdminMember]

    def get(self, request):
        events = (
            Event.objects.filter(refunds__isnull=False).distinct()
            .select_related('owner').order_by('-cancelled_at')
        )
        rows = []
        for event in events:
            problems = [
                {
                    'refund_id': r.pk, 'email': r.payment.customer_email, 'name': r.payment.customer_name,
                    'amount': r.amount, 'status': r.status, 'reason': r.failure_reason,
                    'reference': r.payment.paystack_reference,
                }
                for r in event.refunds.filter(
                    status__in=[Refund.STATUS_FAILED, Refund.STATUS_NEEDS_ATTENTION]
                ).select_related('payment')
            ]
            rows.append({
                'event_id': event.pk, 'name': event.name, 'slug': event.slug,
                'owner_email': event.owner.email, 'progress': refund_progress(event), 'problems': problems,
            })
        balance = paystack_balance()
        return Response({
            'paystack_balance': balance,  # None when Paystack could not be reached
            'awaiting_total': sum((r['progress']['awaiting_amount'] for r in rows), Decimal('0')),
            'events': rows,
        })


class AdminEventRefundsView(APIView):
    """
    POST /api/admin/events/<id>/refunds/   {"action": "send" | "continue" | "retry"}

    send     approve every refund still awaiting approval, and send the first batch.
             Refuses (409) when Byro's Paystack balance looks too low unless
             {"confirm_low_balance": true}: refunds can also come out of a pending payout.
    continue send the next batch of approved refunds.
    retry    put failed refunds back in the queue and send a batch.

    Money moves here, so it needs the admin role, and each send is audit-logged.
    """
    permission_classes = [IsAdminMember]
    method_roles = {'POST': 'admin'}

    def post(self, request, pk):
        event = get_object_or_404(Event, pk=pk, cancelled_at__isnull=False)
        action = request.data.get('action')

        if action == 'send':
            progress = refund_progress(event)
            needed = progress['awaiting_amount']
            if needed <= 0 and not progress['waiting']:
                return Response({'error': 'There are no refunds waiting to be sent.'}, status=status.HTTP_400_BAD_REQUEST)
            balance = paystack_balance()
            if balance is not None and balance < needed and not request.data.get('confirm_low_balance'):
                return Response({
                    'error': f'Your Paystack balance (₦{balance:,.2f}) is less than the ₦{needed:,.2f} to refund.',
                    'code': 'low_balance', 'balance': balance, 'needed': needed,
                }, status=status.HTTP_409_CONFLICT)
            count = authorise_refunds(event)
            _log_admin_action(
                request, AdminAction.ACTION_REFUNDS_SENT, 'event', event.pk, event.name,
                f'{count} refunds, NGN {needed}',
            )
            return Response(process_event_refunds(event))

        if action == 'continue':
            return Response(process_event_refunds(event))

        if action == 'retry':
            _log_admin_action(request, AdminAction.ACTION_REFUNDS_RETRIED, 'event', event.pk, event.name, '')
            return Response(process_event_refunds(event, retry_failed=True))

        return Response({'error': "action must be 'send', 'continue' or 'retry'"}, status=status.HTTP_400_BAD_REQUEST)


class AdminPayoutView(APIView):
    """
    GET    /api/admin/payouts/      — list all payout requests
    PATCH  /api/admin/payouts/:id/  — update status; {status: 'on_hold', reason} holds a pending
                                      payout, {status: 'pending'} releases a held one
    DELETE /api/admin/payouts/:id/  — remove a payout request outright

    DELETE exists for bad data (a test/duplicate request), not for undoing a
    real one — deleting a 'processed' row does NOT reverse any real-world
    transfer, it only stops that amount being subtracted from the
    organiser's available balance here.

    Viewers read; admins process/reject; only owners delete.
    """
    permission_classes = [IsAdminMember]
    method_roles = {'PATCH': 'admin', 'DELETE': 'owner'}

    def get(self, request):
        qs = PayoutRequest.objects.select_related('user', 'event').all()
        return Response(PayoutRequestSerializer(qs, many=True).data)

    def delete(self, request, pk):
        try:
            payout = PayoutRequest.objects.select_related('user').get(pk=pk)
        except PayoutRequest.DoesNotExist:
            return Response({'error': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        _log_admin_action(
            request, AdminAction.ACTION_PAYOUT_DELETED, 'payout', payout.pk,
            payout.user.email if payout.user_id else '', str(payout.amount),
        )
        payout.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    def patch(self, request, pk):
        try:
            payout = PayoutRequest.objects.get(pk=pk)
        except PayoutRequest.DoesNotExist:
            return Response({'error': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

        new_status = request.data.get('status')
        if new_status not in dict(PayoutRequest.STATUS_CHOICES):
            return Response({'error': 'Invalid status'}, status=status.HTTP_400_BAD_REQUEST)

        if new_status == 'on_hold':
            reason = (request.data.get('reason') or '').strip()
            if payout.status != 'pending':
                return Response({'error': 'Only a pending payout can be put on hold.'}, status=status.HTTP_400_BAD_REQUEST)
            if len(reason) < 3:
                return Response({'error': 'Give the organiser a reason for the hold.'}, status=status.HTTP_400_BAD_REQUEST)
            payout.status, payout.hold_reason = 'on_hold', reason[:500]
            payout.save(update_fields=['status', 'hold_reason'])
            _log_admin_action(request, AdminAction.ACTION_PAYOUT_HELD, 'payout', payout.pk,
                              payout.user.email if payout.user_id else '', f"{payout.amount}: {payout.hold_reason}")
            if payout.user_id:
                notify(
                    payout.user, 'payout_on_hold',
                    f"Payout of ₦{float(payout.amount):,.0f} is on hold",
                    body=payout.hold_reason, link='/dashboard/payouts',
                )
            return Response(PayoutRequestSerializer(payout).data)
        if new_status == 'pending':
            if payout.status != 'on_hold':
                return Response({'error': 'Only a payout on hold can be released.'}, status=status.HTTP_400_BAD_REQUEST)
            payout.status, payout.hold_reason = 'pending', ''
            payout.save(update_fields=['status', 'hold_reason'])
            _log_admin_action(request, AdminAction.ACTION_PAYOUT_RELEASED, 'payout', payout.pk,
                              payout.user.email if payout.user_id else '', str(payout.amount))
            if payout.user_id:
                notify(
                    payout.user, 'payout_released',
                    f"Payout of ₦{float(payout.amount):,.0f} is back in the queue",
                    body='The hold was lifted. It will be processed on the next business day.', link='/dashboard/payouts',
                )
            return Response(PayoutRequestSerializer(payout).data)

        payout.status = new_status
        payout.hold_reason = ''
        if new_status == 'processed':
            payout.processed_at = timezone.now()
        payout.save(update_fields=['status', 'processed_at', 'hold_reason'])
        _log_admin_action(
            request, AdminAction.ACTION_PAYOUT_PROCESSED if new_status == 'processed' else AdminAction.ACTION_PAYOUT_REJECTED,
            'payout', payout.pk,
            payout.user.email if payout.user_id else '', str(payout.amount),
        )

        if new_status in ('processed', 'rejected') and payout.user_id:
            notify(
                payout.user,
                'payout_processed' if new_status == 'processed' else 'payout_rejected',
                f"Payout of ₦{float(payout.amount):,.0f} " + ('paid' if new_status == 'processed' else 'was not approved'),
                body=payout.event.name if payout.event else '', link='/dashboard/payouts',
            )

        if new_status == 'processed':
            try:
                from .emails import payout_completed_email
                from .mailer import send_email
                email_data = payout_completed_email(
                    name=payout.user.get_full_name() or payout.user.email,
                    amount=payout.amount,
                    bank_name=payout.bank_name,
                    account_number=payout.account_number,
                    event_name=payout.event.name if payout.event else None,
                    paid_on=timezone.localtime(payout.processed_at).strftime('%-d %b %Y') if payout.processed_at else None,
                    reference=payout.reference,
                    payouts_url=f"{(settings.FRONTEND_URL or 'https://usebyro.com').rstrip('/')}/dashboard/payouts",
                )
                send_email(
                    to=payout.user.email,
                    subject=email_data['subject'],
                    html=email_data['html'],
                    text=email_data['text'],
                )
            except Exception as e:
                logger.error(f"Failed to send payout email for payout {pk}: {e}")

        return Response(PayoutRequestSerializer(payout).data)


class PaystackBankListView(APIView):
    """GET /api/paystack/banks/?country=nigeria — list supported banks."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        country = request.query_params.get('country', 'nigeria')
        headers = {'Authorization': f'Bearer {settings.PAYSTACK_SECRET_KEY.strip()}'}
        try:
            response = requests.get(
                'https://api.paystack.co/bank',
                params={'country': country},
                headers=headers,
                timeout=30,
            )
        except requests.RequestException:
            return Response({'error': "We couldn't reach our payment provider. Try again in a minute."}, status=status.HTTP_502_BAD_GATEWAY)

        return Response(response.json(), status=response.status_code)


class PaystackResolveAccountView(APIView):
    """GET /api/paystack/resolve-account/?account_number=...&bank_code=... — verify account name."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        account_number = request.query_params.get('account_number')
        bank_code = request.query_params.get('bank_code')
        if not account_number or not bank_code:
            return Response(
                {'error': 'Enter your account number and choose your bank.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        headers = {'Authorization': f'Bearer {settings.PAYSTACK_SECRET_KEY.strip()}'}
        try:
            response = requests.get(
                'https://api.paystack.co/bank/resolve',
                params={'account_number': account_number, 'bank_code': bank_code},
                headers=headers,
                timeout=30,
            )
        except requests.RequestException:
            return Response({'error': "We couldn't reach our payment provider. Try again in a minute."}, status=status.HTTP_502_BAD_GATEWAY)

        return Response(response.json(), status=response.status_code)


# ---------------------------------------------------------------------------
# Admin analytics endpoints
# ---------------------------------------------------------------------------

class AdminAnalyticsSummaryView(APIView):
    """GET /api/admin/analytics/summary/"""
    permission_classes = [IsAdminMember]

    def get(self, request):
        total_tickets = Ticket.objects.filter(payment_status__in=['paid', 'free']).count()
        total_revenue = Payment.objects.filter(status='successful').aggregate(
            total=Sum('amount')
        )['total'] or 0
        total_events = Event.objects.count()
        active_events = Event.objects.filter(is_active=True).count()
        private_events = Event.objects.filter(visibility='private').count()
        draft_events = Event.objects.filter(is_draft=True).count()
        from .accounts import DELETED_DOMAIN
        # Deleted accounts are kept (anonymised) for the money records, but they aren't users any more.
        total_users = User.objects.exclude(email__endswith=DELETED_DOMAIN).count()
        profiles = UserProfile.objects.exclude(user__email__endswith=DELETED_DOMAIN)
        total_organizers = profiles.filter(role='organizer').count()
        total_attendees = profiles.filter(role='attendee').count()

        return Response({
            'total_tickets_sold': total_tickets,
            'total_revenue': total_revenue,
            'total_events': total_events,
            'active_events': active_events,
            'private_events': private_events,
            'draft_events': draft_events,
            'total_users': total_users,
            'total_organizers': total_organizers,
            'total_attendees': total_attendees,
        })


class AdminEventDetailView(APIView):
    """
    PATCH  /api/admin/events/<pk>/  — any of { is_active, visibility: 'public' | 'private', sales_closed,
                                      is_draft: true, name, location, description, remove_image: true, note }
    DELETE /api/admin/events/<pk>/

    Not the owner-facing EventViewSet: no ownership check, gated only by the
    admin role. The admin panel's suspend/reactivate/delete buttons need
    this for events the platform admin doesn't personally own. Admins can
    suspend/reactivate; only owners can delete.
    """
    permission_classes = [IsAdminMember]
    method_roles = {'PATCH': 'admin', 'DELETE': 'owner'}

    def _get_event(self, pk):
        try:
            return Event.objects.get(pk=pk)
        except Event.DoesNotExist:
            return None

    def patch(self, request, pk):
        event = self._get_event(pk)
        if event is None:
            return Response({'error': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        is_active = request.data.get('is_active')
        if is_active is not None and bool(is_active) != event.is_active:
            event.is_active = bool(is_active)
            event.save(update_fields=['is_active'])
            _log_admin_action(
                request, AdminAction.ACTION_EVENT_REACTIVATED if event.is_active else AdminAction.ACTION_EVENT_SUSPENDED,
                'event', event.pk, event.name, '',
            )
            if not event.is_draft:
                from .suspension import notify_in_background
                notify_in_background(event, suspended=not event.is_active)

        visibility = request.data.get('visibility')
        if visibility is not None:
            if visibility not in dict(Event.EVENT_VISIBILITY_CHOICES):
                return Response({'error': "Visibility must be 'public' or 'private'."}, status=status.HTTP_400_BAD_REQUEST)
            if visibility != event.visibility:
                event.visibility = visibility
                fields = ['visibility']
                if visibility == 'private' and event.featured_until:
                    event.featured_until = None  # only public events can be featured
                    fields.append('featured_until')
                event.save(update_fields=fields)
                _log_admin_action(
                    request, AdminAction.ACTION_EVENT_VISIBILITY, 'event', event.pk, event.name, visibility,
                )

        # Fixing what's shown publicly (a typo, an inappropriate photo) without suspending the event.
        edits, changed = {}, []
        for field, limit in (('name', 100), ('location', 255), ('description', None)):
            if field in request.data:
                value = str(request.data.get(field) or '').strip()
                if not value:
                    return Response({'error': f"The {field} can't be empty."}, status=status.HTTP_400_BAD_REQUEST)
                if limit and len(value) > limit:
                    return Response({'error': f"The {field} can be at most {limit} characters."}, status=status.HTTP_400_BAD_REQUEST)
                if value != getattr(event, field):
                    edits[field] = value
                    changed.append(field)
        if request.data.get('remove_image') is True and event.event_image:
            edits['event_image'] = None
            changed.append('image')
        if edits:
            for field, value in edits.items():
                setattr(event, field, value)
            event.save(update_fields=list(edits))
            _log_admin_action(request, AdminAction.ACTION_EVENT_EDITED, 'event', event.pk, event.name, ', '.join(changed))
            if event.owner_id:
                notify(
                    event.owner, 'event_edited_by_byro', f"Byro edited the {', '.join(changed)} of {event.name}",
                    body=(request.data.get('note') or '').strip()[:255], link=f"/dashboard/events/{event.slug}",
                )

        sales_closed = request.data.get('sales_closed')
        if sales_closed is not None and bool(sales_closed) != event.sales_closed:
            event.sales_closed = bool(sales_closed)
            event.save(update_fields=['sales_closed'])
            _log_admin_action(
                request, AdminAction.ACTION_EVENT_SALES_CLOSED if event.sales_closed else AdminAction.ACTION_EVENT_SALES_REOPENED,
                'event', event.pk, event.name, '',
            )
            if event.owner_id:
                notify(
                    event.owner, 'event_sales_closed' if event.sales_closed else 'event_sales_reopened',
                    f"Ticket sales for {event.name} " + ('were closed by Byro' if event.sales_closed else 'are open again'),
                    link=f"/dashboard/events/{event.slug}",
                )

        if request.data.get('is_draft') is True and not event.is_draft:
            # Only for events nobody has bought into: with tickets sold, suspend or close sales instead.
            if event.tickets.filter(payment_status__in=['paid', 'free']).exists():
                return Response(
                    {'error': 'This event already has tickets. Close ticket sales or suspend it instead.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            event.is_draft, event.featured_until = True, None
            event.save(update_fields=['is_draft', 'featured_until'])
            _log_admin_action(request, AdminAction.ACTION_EVENT_TO_DRAFT, 'event', event.pk, event.name, '')
            if event.owner_id:
                notify(
                    event.owner, 'event_moved_to_draft', f"{event.name} was moved back to draft by Byro",
                    body='Only you can see it until you publish it again.', link=f"/dashboard/events/{event.slug}",
                )
        return Response(EventSerializer(event, context={'request': request}).data)

    def delete(self, request, pk):
        event = self._get_event(pk)
        if event is None:
            return Response({'error': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        if _refunds_unfinished(event):
            return Response(
                {'error': 'This event has refunds that have not been completed. Finish or resolve them before deleting it.'},
                status=status.HTTP_409_CONFLICT,
            )
        _log_admin_action(request, AdminAction.ACTION_EVENT_DELETED, 'event', event.pk, event.name, '')
        event.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class AdminEventCancelView(APIView):
    """
    GET  /api/admin/events/<pk>/cancel/   what cancelling would do (nothing changes)
    POST /api/admin/events/<pk>/cancel/   {"reason": "..."}  cancel it for the organiser

    The same cancellation the organiser gets (tickets voided, refunds recorded, buyers told),
    for when the organiser can't or won't do it, e.g. a fraudulent event. Money still goes
    back from the Refunds page, as with any cancellation.
    """
    permission_classes = [IsAdminMember]
    method_roles = {'POST': 'admin'}

    def get(self, request, pk):
        event = get_object_or_404(Event, pk=pk)
        if event.cancelled_at:
            return Response({'cancelled': True, 'progress': refund_progress(event)})
        return Response({'cancelled': False, 'preview': cancellation_preview(event)})

    def post(self, request, pk):
        event = get_object_or_404(Event, pk=pk)
        reason = (request.data.get('reason') or '').strip()
        if len(reason) < 3:
            return Response({'error': 'Give the attendees a reason for the cancellation.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            summary = cancel_event(event, reason)
        except EventCancellationError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        _log_admin_action(
            request, AdminAction.ACTION_EVENT_CANCELLED, 'event', event.pk, event.name,
            f"{summary['paid_orders']} refunds, NGN {summary['refund_total']}: {reason}",
        )
        if event.owner_id:
            notify(
                event.owner, 'event_cancelled_by_byro', f"{event.name} was cancelled by Byro",
                body=reason, link=f"/dashboard/events/{event.slug}",
            )
        if summary['paid_orders']:
            _alert_byro_of_refunds(event, summary)
        try:
            progress = process_event_refunds(event)  # sends the first emails; no money moves
        except Exception:
            logger.exception('First notices failed for event %s', event.pk)
            progress = refund_progress(event)
        return Response({'cancelled': True, 'summary': summary, 'progress': progress})


class AdminEventCohostView(APIView):
    """
    POST /api/admin/events/<pk>/cohosts/ {email, role?} — give someone access to run an event
    when the organiser can't add them (they lost their account, say). Same grant the organiser
    makes: a manager by default, and an invite if the address has no account yet.
    """
    permission_classes = [IsAdminMember]
    method_roles = {'POST': 'admin'}

    def post(self, request, pk):
        from django.core.exceptions import ValidationError as DjangoValidationError
        from django.core.validators import validate_email
        event = get_object_or_404(Event.objects.select_related('owner'), pk=pk)
        email = (request.data.get('email') or '').strip().lower()
        role = (request.data.get('role') or EventCoHost.ROLE_MANAGER).strip().lower()
        if role not in dict(EventCoHost.ROLE_CHOICES):
            return Response({'error': "Role must be 'manager' or 'checkin'."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            validate_email(email)
        except DjangoValidationError:
            return Response({'error': 'Enter a valid email address.'}, status=status.HTTP_400_BAD_REQUEST)
        if event.owner and event.owner.email.lower() == email:
            return Response({'error': 'That person owns this event already.'}, status=status.HTTP_400_BAD_REQUEST)
        user = User.objects.filter(email__iexact=email).first()
        if EventCoHost.objects.filter(event=event).filter(
            Q(user=user) if user else Q(invited_email__iexact=email, user__isnull=True)
        ).exists():
            return Response({'error': 'They are a co-host of this event already.'}, status=status.HTTP_400_BAD_REQUEST)
        EventCoHost.objects.create(
            event=event, user=user, invited_email=email, role=role, added_by=request.user,
            status=EventCoHost.STATUS_ACCEPTED if user else EventCoHost.STATUS_PENDING,
            accepted_at=timezone.now() if user else None,
        )
        send_cohost_invite_email(email, event, request.user, is_new_user=user is None, role=role)
        _log_admin_action(request, AdminAction.ACTION_EVENT_COHOST_ADDED, 'event', event.pk, event.name,
                          f'{email} as {role}')
        if event.owner_id:
            notify(event.owner, 'cohost_added_by_byro', f"Byro added {email} as a co-host of {event.name}",
                   link=f"/dashboard/events/{event.slug}")
        return Response({'added': email, 'pending': user is None}, status=status.HTTP_201_CREATED)


class AdminEventAttendeesView(APIView):
    """
    GET /api/admin/events/<slug>/attendees/

    Same shape as EventViewSet.attendees, but gated on the admin secret
    instead of event ownership — the admin panel needs to see attendees for
    any event, not just ones the platform admin happens to own or co-host.
    """
    permission_classes = [IsAdminMember]

    def get(self, request, slug):
        try:
            event = Event.objects.get(slug=slug)
        except Event.DoesNotExist:
            return Response({'error': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

        tickets = event.tickets.select_related('user').prefetch_related('form_answers__question')

        checked_in_filter = request.query_params.get('checked_in')
        if checked_in_filter == 'true':
            tickets = tickets.filter(checked_in=True)
        elif checked_in_filter == 'false':
            tickets = tickets.filter(checked_in=False)

        status_filter = request.query_params.get('payment_status', 'confirmed')
        if status_filter == 'confirmed':
            tickets = tickets.filter(payment_status__in=['paid', 'free'])
        elif status_filter != 'all':
            tickets = tickets.filter(payment_status=status_filter)

        serializer = TicketSerializer(tickets, many=True, context={'request': request})
        return Response({
            'count': tickets.count(),
            'checked_in_count': tickets.filter(checked_in=True).count(),
            'attendees': serializer.data,
        })


class AdminUsersListView(APIView):
    """
    GET /api/admin/users/?role=organizer

    Registered users with the onboarding role they picked (blank if they
    signed up before this field existed or never finished onboarding) and
    how many events they've created. ?role=organizer|attendee filters to
    that self-reported role; omit it to list everyone.
    """
    permission_classes = [IsAdminMember]

    def get(self, request):
        from .accounts import DELETED_DOMAIN
        role = (request.query_params.get('role') or '').strip()

        # Deleted accounts stay in the database (anonymised) for the money records; they aren't listed.
        profiles = UserProfile.objects.select_related('user').exclude(
            user__email__endswith=DELETED_DOMAIN,
        ).annotate(
            events_created=Count('user__owned_events', distinct=True),
        )
        if role in dict(UserProfile.ROLE_CHOICES):
            profiles = profiles.filter(role=role)

        data = [
            {
                'id': p.user_id,
                'email': p.user.email,
                'display_name': p.display_name,
                'handle': p.handle,
                'role': p.role,
                'auth_provider': p.user.auth_provider,
                'events_created': p.events_created,
                'date_joined': p.user.date_joined,
            }
            for p in profiles.order_by('-user__date_joined')
        ]
        return Response(data)


class AdminAnalyticsActivityTrendView(APIView):
    """GET /api/admin/analytics/activity-trend/?days=30

    Tickets sold and events created per day. Days with nothing are left out;
    the dashboard fills the gaps."""
    permission_classes = [IsAdminMember]

    def get(self, request):
        try:
            days = int(request.query_params.get('days', 30))
        except ValueError:
            days = 30
        days = max(1, min(days, 730))
        since = timezone.now() - timedelta(days=days)

        tickets = (
            Ticket.objects
            .filter(payment_status__in=['paid', 'free'], created_at__gte=since)
            .annotate(date=TruncDate('created_at'))
            .values('date')
            .annotate(n=Count('id'))
        )
        events = (
            Event.objects
            .filter(created_at__gte=since)
            .annotate(date=TruncDate('created_at'))
            .values('date')
            .annotate(n=Count('id'))
        )
        by_date = {}
        for r in tickets:
            by_date.setdefault(str(r['date']), {'tickets': 0, 'events': 0})['tickets'] = r['n']
        for r in events:
            by_date.setdefault(str(r['date']), {'tickets': 0, 'events': 0})['events'] = r['n']
        return Response([{'date': d, **v} for d, v in sorted(by_date.items())])


class AdminAnalyticsRevenueTrendView(APIView):
    """GET /api/admin/analytics/revenue-trend/?days=30"""
    permission_classes = [IsAdminMember]

    def get(self, request):
        try:
            days = int(request.query_params.get('days', 30))
        except ValueError:
            days = 30

        since = timezone.now() - timedelta(days=days)
        rows = (
            Payment.objects
            .filter(status='successful', paid_at__gte=since)
            .annotate(date=TruncDate('paid_at'))
            .values('date')
            .annotate(revenue=Sum('amount'))
            .order_by('date')
        )
        data = [{'date': str(r['date']), 'revenue': r['revenue']} for r in rows]
        return Response(data)


def _log_admin_action(request, action, target_type, target_id, target_label='', detail=''):
    member = getattr(request, 'admin_member', None)
    try:
        AdminAction.objects.create(
            actor_email=member.email if member else '',
            action=action, target_type=target_type,
            target_id=str(target_id), target_label=target_label or '',
            detail=detail or '',
        )
    except Exception as e:
        logger.error(f"Failed to log admin action {action}: {e}")


class AdminEventsOverviewView(APIView):
    """GET /api/admin/events/overview/ — one row per event with money + inventory.

    Replaces the frontend's N+1 per-event attendee fetches. Per event:
    tickets sold, revenue (successful payments), ticket lifecycle counts
    (paid/free/pending/transferred/checked-in), per-tier sold/remaining,
    promo redemptions, and is_free (base 0 and no paid tier).
    """
    permission_classes = [IsAdminMember]

    def get(self, request):
        events = list(Event.objects.select_related('owner').prefetch_related('tiers').order_by('-created_at'))
        if not events:
            return Response([])

        event_ids = [e.pk for e in events]
        paid_tier_event_ids = set(
            TicketTier.objects.filter(event_id__in=event_ids, price__gt=0)
            .values_list('event_id', flat=True)
        )

        sold_by_event = dict(
            Ticket.objects.filter(event_id__in=event_ids, payment_status__in=['paid', 'free'])
            .values_list('event_id').annotate(n=Count('id')).values_list('event_id', 'n')
        )
        revenue_by_event = dict(
            Payment.objects.filter(event_id__in=event_ids, status='successful')
            .values_list('event_id').annotate(t=Sum('amount')).values_list('event_id', 't')
        )
        lifecycle_rows = (
            Ticket.objects.filter(event_id__in=event_ids)
            .values('event_id', 'payment_status')
            .annotate(n=Count('id'))
        )
        lifecycle = {}
        for r in lifecycle_rows:
            lifecycle.setdefault(r['event_id'], {})[r['payment_status']] = r['n']
        transferred_by_event = dict(
            Ticket.objects.filter(event_id__in=event_ids, is_transferred=True)
            .values_list('event_id').annotate(n=Count('id')).values_list('event_id', 'n')
        )
        checked_in_by_event = dict(
            Ticket.objects.filter(event_id__in=event_ids, payment_status__in=['paid', 'free'], checked_in=True)
            .values_list('event_id').annotate(n=Count('id')).values_list('event_id', 'n')
        )
        sold_by_tier = dict(
            Ticket.objects.filter(event_id__in=event_ids, payment_status__in=['paid', 'free'], tier__isnull=False)
            .values_list('tier_id').annotate(n=Count('id')).values_list('tier_id', 'n')
        )
        promo_by_event = dict(
            PromoCode.objects.filter(event_id__in=event_ids)
            .values_list('event_id').annotate(n=Sum('redeemed_count')).values_list('event_id', 'n')
        )

        out = []
        for e in events:
            tiers = list(e.tiers.all())
            tier_rows = [
                {
                    'id': t.pk, 'name': t.name, 'price': str(t.price),
                    'capacity': t.capacity, 'sold': sold_by_tier.get(t.pk, 0),
                    'remaining': (
                        None if t.capacity is None
                        else max(t.capacity - sold_by_tier.get(t.pk, 0), 0)
                    ),
                }
                for t in tiers
            ]
            prices = sorted({float(t.price) for t in tiers}) if tiers else [float(e.ticket_price)]
            lc = lifecycle.get(e.pk, {})
            sold = sold_by_event.get(e.pk, 0)
            out.append({
                'id': e.pk, 'slug': e.slug, 'name': e.name,
                'category': e.category, 'day': str(e.day), 'time_from': str(e.time_from),
                'location': e.location, 'ticket_price': str(e.ticket_price),
                'hosted_by': e.hosted_by, 'visibility': e.visibility, 'is_draft': e.is_draft, 'featured_until': e.featured_until, 'is_featured': bool(e.featured_until and e.featured_until > timezone.now()),
                'is_active': e.is_active, 'created_at': e.created_at,
                'owner_email': e.owner.email if e.owner else None,
                'tiers': [{'id': t.pk, 'name': t.name, 'price': str(t.price)} for t in tiers],
                'price_min': str(min(prices)) if prices else str(e.ticket_price),
                'price_max': str(max(prices)) if prices else str(e.ticket_price),
                'is_free': float(e.ticket_price) == 0 and e.pk not in paid_tier_event_ids,
                'tickets_sold': sold,
                'revenue': str(revenue_by_event.get(e.pk) or 0),
                'paid': lc.get('paid', 0), 'free': lc.get('free', 0),
                'pending': lc.get('pending', 0), 'failed': lc.get('failed', 0),
                'transferred': transferred_by_event.get(e.pk, 0),
                'checked_in': checked_in_by_event.get(e.pk, 0),
                'tier_breakdown': tier_rows,
                'promo_redemptions': promo_by_event.get(e.pk) or 0,
                'capacity': e.capacity or (
                    sum(t.capacity for t in tiers)
                    if tiers and all(t.capacity is not None for t in tiers) else None
                ),
            })
        return Response(out)


class AdminPaymentsListView(APIView):
    """GET /api/admin/payments/?status=&search=&limit=100 — platform-wide payments."""
    permission_classes = [IsAdminMember]

    def get(self, request):
        status_filter = (request.query_params.get('status') or '').strip()
        search = (request.query_params.get('search') or '').strip()
        try:
            limit = min(max(int(request.query_params.get('limit', 100)), 1), 500)
        except ValueError:
            limit = 100

        qs = (
            Payment.objects.select_related('event', 'tier', 'promo_code')
            .annotate(ticket_count=Count('tickets_purchased'))
            .order_by('-created_at')
        )
        if status_filter:
            qs = qs.filter(status=status_filter)
        if search:
            qs = qs.filter(
                Q(customer_email__icontains=search) | Q(customer_name__icontains=search)
                | Q(paystack_reference__icontains=search) | Q(event__name__icontains=search)
            )

        rows = []
        for p in qs[:limit]:
            rows.append({
                'id': str(p.pk), 'paystack_reference': p.paystack_reference,
                'event_slug': p.event.slug if p.event_id else None,
                'event_name': p.event.name if p.event_id else None,
                'tier_name': p.tier.name if p.tier_id else None,
                'promo_code': p.promo_code.code if p.promo_code_id else None,
                'customer_name': p.customer_name, 'customer_email': p.customer_email,
                'amount': str(p.amount), 'currency': p.currency,
                'status': p.status, 'channel': p.channel,
                'tickets': p.ticket_count,
                'paid_at': p.paid_at, 'created_at': p.created_at,
            })
        return Response({'count': qs.count(), 'payments': rows})


def _paystack_transaction(reference):
    """What Paystack says about a payment reference: (data dict, None) or (None, error message)."""
    try:
        res = requests.get(
            f'{settings.PAYSTACK_API_BASE}/transaction/verify/{reference}',
            headers={'Authorization': f'Bearer {settings.PAYSTACK_SECRET_KEY.strip()}'}, timeout=20,
        )
        body = res.json()
    except Exception as e:  # network, timeout, bad JSON
        return None, f'Could not reach Paystack: {e}'[:300]
    if res.status_code == 200 and body.get('status'):
        return body.get('data') or {}, None
    return None, (body.get('message') or f'Paystack answered {res.status_code}')[:300]


class AdminPaymentDetailView(APIView):
    """GET /api/admin/payments/<uuid>/ — one order in full: money, buyer, tickets, refund, organiser."""
    permission_classes = [IsAdminMember]

    def get(self, request, payment_id):
        p = (Payment.objects.select_related('event', 'event__owner', 'tier', 'promo_code')
             .filter(pk=payment_id).first())
        if not p:
            return Response({'error': 'Payment not found.'}, status=status.HTTP_404_NOT_FOUND)
        meta = p.metadata or {}
        refund = Refund.objects.filter(payment=p).first()
        owner = p.event.owner if p.event_id else None
        oprofile = getattr(owner, 'profile', None) if owner else None
        tickets = Ticket.objects.filter(payment=p).select_related('tier').order_by('created_at')
        return Response({
            'id': str(p.pk), 'reference': p.paystack_reference, 'status': p.status,
            'amount': str(p.amount), 'currency': p.currency, 'channel': p.channel,
            'subtotal': meta.get('subtotal'), 'service_fee': meta.get('service_fee'),
            'refundable': str(refundable_amount(p)) if p.status == 'successful' else '0',
            'seats': meta.get('seats') or meta.get('quantity'),
            'attendees': meta.get('attendees') or [],
            'promo_code': p.promo_code.code if p.promo_code_id else None,
            'tier_name': p.tier.name if p.tier_id else None,
            'customer_name': p.customer_name, 'customer_email': p.customer_email,
            'created_at': p.created_at, 'paid_at': p.paid_at, 'updated_at': p.updated_at,
            'event': {
                'name': p.event.name, 'slug': p.event.slug, 'day': p.event.day,
                'cancelled': bool(p.event.cancelled_at),
                'pass_fee_to_attendee': p.event.pass_fee_to_attendee,
            },
            'organizer': None if not owner else {
                'email': owner.email,
                'name': (oprofile.display_name if oprofile else '') or owner.email,
                'handle': oprofile.handle if oprofile else None,
            },
            'refund': None if not refund else {
                'status': refund.status, 'amount': str(refund.amount), 'reason': refund.reason,
                'failure_reason': refund.failure_reason, 'processed_at': refund.processed_at,
            },
            'tickets': [_support_ticket(t) for t in tickets],
        })


class AdminPaymentPaystackView(APIView):
    """
    GET  /api/admin/payments/<uuid>/paystack/ — what Paystack has for this payment, next to ours.
    POST /api/admin/payments/<uuid>/paystack/ — issue the tickets for a payment Paystack confirms was paid
         but Byro never completed (e.g. the buyer closed the page before the callback). Same checks as checkout.
    """
    permission_classes = [IsAdminMember]
    method_roles = {'POST': AdminMember.ROLE_ADMIN}

    def _compare(self, p, data):
        paid_kobo = int(data.get('amount') or 0)
        return {
            'paystack': {
                'status': data.get('status'), 'amount': str(Decimal(paid_kobo) / 100),
                'currency': data.get('currency'), 'channel': data.get('channel'),
                'paid_at': data.get('paid_at') or data.get('paidAt'),
                'gateway_response': data.get('gateway_response'),
                'customer_email': (data.get('customer') or {}).get('email'),
            },
            'byro': {'status': p.status, 'amount': str(p.amount)},
            'amount_matches': _paid_amount_ok(paid_kobo, int(p.amount * 100)),
            'can_issue_tickets': data.get('status') == 'success' and p.status != 'successful'
                                 and _paid_amount_ok(paid_kobo, int(p.amount * 100)),
        }

    def get(self, request, payment_id):
        p = Payment.objects.filter(pk=payment_id).first()
        if not p:
            return Response({'error': 'Payment not found.'}, status=status.HTTP_404_NOT_FOUND)
        data, err = _paystack_transaction(p.paystack_reference)
        if err:
            return Response({'error': err}, status=status.HTTP_502_BAD_GATEWAY)
        return Response(self._compare(p, data))

    def post(self, request, payment_id):
        p = Payment.objects.select_related('event').filter(pk=payment_id).first()
        if not p:
            return Response({'error': 'Payment not found.'}, status=status.HTTP_404_NOT_FOUND)
        if p.status == 'successful':
            return Response({'error': 'This order is already complete.'}, status=status.HTTP_400_BAD_REQUEST)
        data, err = _paystack_transaction(p.paystack_reference)
        if err:
            return Response({'error': err}, status=status.HTTP_502_BAD_GATEWAY)
        check = self._compare(p, data)
        if not check['can_issue_tickets']:
            why = ('Paystack does not show this payment as paid.' if data.get('status') != 'success'
                   else 'The amount Paystack received does not match this order.')
            return Response({'error': why, **check}, status=status.HTTP_400_BAD_REQUEST)

        stored_uid = (p.metadata or {}).get('user_id')
        ticket_user = User.objects.filter(pk=stored_uid).first() if stored_uid else None
        new_tickets, _all = _fulfil_payment(p, ticket_user)
        p.refresh_from_db()
        if data.get('channel'):
            p.channel = data.get('channel')
            p.save(update_fields=['channel'])
        if new_tickets:
            _email_tickets(new_tickets, p.event)
            ticket_sale(p.event, len(new_tickets), paid_amount=p.amount, payment=p)
        _log_admin_action(request, AdminAction.ACTION_ORDER_FULFILLED, 'payment', p.paystack_reference,
                          p.event.name[:255], f'{len(new_tickets)} ticket(s) to {p.customer_email}')
        return Response({'issued': len(new_tickets), 'status': p.status})


class AdminPromoDetailView(APIView):
    """PATCH /api/admin/promos/<pk>/ {active: bool} — switch a promo code off (e.g. it is being abused) or back on."""
    permission_classes = [IsAdminMember]
    min_role = AdminMember.ROLE_ADMIN

    def patch(self, request, pk):
        promo = PromoCode.objects.select_related('event').filter(pk=pk).first()
        if not promo:
            return Response({'error': 'Promo code not found.'}, status=status.HTTP_404_NOT_FOUND)
        if 'active' not in request.data:
            return Response({'error': 'Say whether the code should be on or off.'}, status=status.HTTP_400_BAD_REQUEST)
        active = bool(request.data.get('active'))
        if promo.active != active:
            promo.active = active
            promo.save(update_fields=['active'])
            _log_admin_action(
                request, AdminAction.ACTION_PROMO_ENABLED if active else AdminAction.ACTION_PROMO_DISABLED,
                'promo', promo.pk, f'{promo.code} ({promo.event.name})'[:255],
                f'used {promo.redeemed_count} time(s)',
            )
        return Response({'id': promo.pk, 'active': promo.active, 'is_valid': promo.is_valid()})


def _admin_community_row(p, request):
    return {
        'user_id': p.user_id, 'email': p.user.email,
        'name': p.display_name or p.handle or p.user.email, 'handle': p.handle,
        'avatar_url': request.build_absolute_uri(p.avatar.url) if p.avatar else None,
        'bio': p.bio, 'location': p.location, 'category': p.category,
        'is_public': p.is_public, 'hidden_from_directory': p.hidden_from_directory, 'verified': p.verified,
        'messaging_blocked': p.messaging_blocked,
        'followers': getattr(p, 'n_followers', None), 'events': getattr(p, 'n_events', None),
        'merch': getattr(p, 'n_merch', None), 'joined': p.user.date_joined,
    }


class AdminCommunitiesView(APIView):
    """GET /api/admin/communities/?search=&filter=hidden|verified — every organiser with a page."""
    permission_classes = [IsAdminMember]

    def get(self, request):
        qs = (UserProfile.objects.select_related('user').filter(handle__isnull=False)
              .annotate(n_followers=Count('user__follower_links', distinct=True),
                        n_events=Count('user__owned_events', distinct=True),
                        n_merch=Count('user__merch_items', distinct=True))
              .filter(Q(n_events__gt=0) | Q(n_merch__gt=0) | Q(n_followers__gt=0))
              .order_by('-n_followers', 'display_name'))
        search = (request.query_params.get('search') or '').strip()
        if search:
            qs = qs.filter(Q(display_name__icontains=search) | Q(handle__icontains=search) | Q(user__email__icontains=search))
        which = request.query_params.get('filter')
        if which == 'hidden':
            qs = qs.filter(hidden_from_directory=True)
        elif which == 'verified':
            qs = qs.filter(verified=True)
        return Response([_admin_community_row(p, request) for p in qs[:300]])


class AdminCommunityDetailView(APIView):
    """
    GET   /api/admin/communities/<user_id>/ — one community, with all its merch (including hidden items).
    PATCH /api/admin/communities/<user_id>/ {hidden_from_directory?, verified?}
    """
    permission_classes = [IsAdminMember]
    method_roles = {'PATCH': AdminMember.ROLE_ADMIN}

    def _profile(self, user_id):
        return UserProfile.objects.select_related('user').filter(user_id=user_id).first()

    def get(self, request, user_id):
        p = self._profile(user_id)
        if not p:
            return Response({'error': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        data = _admin_community_row(p, request)
        data['merch_items'] = [{
            **MerchItemSerializer(m, context={'request': request}).data,
        } for m in MerchItem.objects.filter(owner_id=user_id).order_by('-created_at')]
        return Response(data)

    def patch(self, request, user_id):
        p = self._profile(user_id)
        if not p:
            return Response({'error': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        changes = {
            'hidden_from_directory': (AdminAction.ACTION_COMMUNITY_HIDDEN, AdminAction.ACTION_COMMUNITY_SHOWN),
            'verified': (AdminAction.ACTION_COMMUNITY_VERIFIED, AdminAction.ACTION_COMMUNITY_UNVERIFIED),
        }
        for field, (on, off) in changes.items():
            if field in request.data:
                value = bool(request.data.get(field))
                if getattr(p, field) != value:
                    setattr(p, field, value)
                    p.save(update_fields=[field])
                    _log_admin_action(request, on if value else off, 'user', p.user_id,
                                      f'{p.display_name or p.handle} ({p.user.email})'[:255])
        return Response(_admin_community_row(p, request))


class AdminMerchView(APIView):
    """PATCH /api/admin/merch/<pk>/ {removed_by_admin: bool} — take a merch item down, or put it back."""
    permission_classes = [IsAdminMember]
    min_role = AdminMember.ROLE_ADMIN

    def patch(self, request, pk):
        item = MerchItem.objects.select_related('owner').filter(pk=pk).first()
        if not item:
            return Response({'error': 'Item not found.'}, status=status.HTTP_404_NOT_FOUND)
        removed = bool(request.data.get('removed_by_admin'))
        if item.removed_by_admin != removed:
            item.removed_by_admin = removed
            item.save(update_fields=['removed_by_admin'])
            _log_admin_action(request, AdminAction.ACTION_MERCH_REMOVED if removed else AdminAction.ACTION_MERCH_RESTORED,
                              'merch', item.pk, f'{item.name} ({item.owner.email})'[:255])
        return Response(MerchItemSerializer(item, context={'request': request}).data)


class AdminReportsView(APIView):
    """GET /api/admin/reports/?status=open — reports from users, newest first, with what was reported."""
    permission_classes = [IsAdminMember]

    @staticmethod
    def row(r):
        from .models import Report
        community = r.community
        cprofile = getattr(community, 'profile', None) if community else None
        e = r.event
        return {
            'id': r.pk, 'target_type': r.target_type, 'reason': r.reason,
            'reason_label': dict(Report.REASON_CHOICES).get(r.reason, r.reason),
            'details': r.details, 'reporter_email': r.reporter_email, 'status': r.status,
            'resolution_note': r.resolution_note, 'resolved_by_email': r.resolved_by_email,
            'resolved_at': r.resolved_at, 'created_at': r.created_at,
            'event': None if not e else {
                'id': e.pk, 'name': e.name, 'slug': e.slug, 'is_active': e.is_active,
                'visibility': e.visibility, 'sales_closed': e.sales_closed, 'cancelled': bool(e.cancelled_at),
                'organizer_email': e.owner.email if e.owner_id else None,
            },
            'community': None if not community else {
                'user_id': community.pk, 'email': community.email,
                'name': (cprofile.display_name if cprofile else '') or community.email,
                'handle': cprofile.handle if cprofile else None,
                'hidden_from_directory': bool(cprofile and cprofile.hidden_from_directory),
            },
            'reports_on_same': (Report.objects.filter(event=e) if e else Report.objects.filter(community=community)).count(),
        }

    def get(self, request):
        from .models import Report
        if request.query_params.get('count_only'):
            # The admin menu's "Reports" badge: just the number waiting.
            return Response({'open': Report.objects.filter(status=Report.STATUS_OPEN).count()})
        qs = Report.objects.select_related('event', 'event__owner', 'community', 'community__profile')
        wanted = (request.query_params.get('status') or '').strip()
        if wanted:
            qs = qs.filter(status=wanted)
        return Response({
            'open': Report.objects.filter(status=Report.STATUS_OPEN).count(),
            'reports': [self.row(r) for r in qs[:300]],
        })


class AdminReportDetailView(APIView):
    """PATCH /api/admin/reports/<pk>/ {status: resolved|dismissed|open, note?} — close (or reopen) a report."""
    permission_classes = [IsAdminMember]
    min_role = AdminMember.ROLE_ADMIN

    def patch(self, request, pk):
        from .models import Report
        r = Report.objects.select_related('event', 'community').filter(pk=pk).first()
        if not r:
            return Response({'error': 'Report not found.'}, status=status.HTTP_404_NOT_FOUND)
        new = request.data.get('status')
        if new not in dict(Report.STATUS_CHOICES):
            return Response({'error': 'Choose what happened.'}, status=status.HTTP_400_BAD_REQUEST)
        note = str(request.data.get('note') or '').strip()[:500]
        member = getattr(request, 'admin_member', None)
        r.status = new
        r.resolution_note = note
        r.resolved_by_email = (member.email if member else '') if new != Report.STATUS_OPEN else ''
        r.resolved_at = timezone.now() if new != Report.STATUS_OPEN else None
        r.save(update_fields=['status', 'resolution_note', 'resolved_by_email', 'resolved_at'])
        if new != Report.STATUS_OPEN:
            label = r.event.name if r.event_id else (r.community.email if r.community_id else '')
            _log_admin_action(request, AdminAction.ACTION_REPORT_CLOSED, 'report', r.pk, label[:255],
                              f'{new}: {note}'[:255])
        return Response(AdminReportsView.row(r))


class AdminEventFeatureView(APIView):
    """POST /api/admin/events/<pk>/feature/ {days: 1-30, or 0 to stop} — show an event first on the landing page and Discover."""
    permission_classes = [IsAdminMember]
    min_role = AdminMember.ROLE_ADMIN

    def post(self, request, pk):
        event = Event.objects.filter(pk=pk).first()
        if not event:
            return Response({'error': 'Event not found.'}, status=status.HTTP_404_NOT_FOUND)
        try:
            days = int(request.data.get('days', 7))
        except (TypeError, ValueError):
            return Response({'error': 'Choose how many days.'}, status=status.HTTP_400_BAD_REQUEST)
        if days < 0 or days > 30:
            return Response({'error': 'Feature an event for 1 to 30 days.'}, status=status.HTTP_400_BAD_REQUEST)
        if days and (not event.is_active or event.is_draft or event.cancelled_at or event.visibility != 'public'):
            return Response({'error': 'Only a live, public event can be featured.'}, status=status.HTTP_400_BAD_REQUEST)
        event.featured_until = timezone.now() + timedelta(days=days) if days else None
        event.save(update_fields=['featured_until'])
        _log_admin_action(request, AdminAction.ACTION_EVENT_FEATURED if days else AdminAction.ACTION_EVENT_UNFEATURED,
                          'event', event.pk, event.name[:255], f'{days} day(s)' if days else '')
        return Response({'featured_until': event.featured_until, 'is_featured': bool(days)})


class AdminExportView(APIView):
    """
    GET /api/admin/export/<kind>/?from=YYYY-MM-DD&to=YYYY-MM-DD — a CSV of payments, payouts, refunds or users.
    Holds personal and bank details, so it needs an Admin or Owner, and every download is in the audit log.
    """
    permission_classes = [IsAdminMember]
    min_role = AdminMember.ROLE_ADMIN

    def get(self, request, kind):
        from datetime import date
        from django.http import HttpResponse
        from .exports import KINDS, build_csv
        if kind not in KINDS:
            return Response({'error': 'Unknown export.'}, status=status.HTTP_404_NOT_FOUND)
        try:
            end = date.fromisoformat(request.query_params.get('to') or timezone.localdate().isoformat())
            start = date.fromisoformat(request.query_params.get('from') or (end - timedelta(days=30)).isoformat())
        except ValueError:
            return Response({'error': 'Use dates like 2026-10-01.'}, status=status.HTTP_400_BAD_REQUEST)
        if start > end:
            return Response({'error': 'The start date is after the end date.'}, status=status.HTTP_400_BAD_REQUEST)
        if (end - start).days > 366:
            return Response({'error': 'Export up to one year at a time.'}, status=status.HTTP_400_BAD_REQUEST)
        text, count = build_csv(kind, start, end)
        _log_admin_action(request, AdminAction.ACTION_EXPORT_DOWNLOADED, 'export', kind, f'{kind} {start} to {end}',
                          f'{count} row(s)')
        res = HttpResponse('\ufeff' + text, content_type='text/csv; charset=utf-8')  # BOM so Excel reads ₦ correctly
        res['Content-Disposition'] = f'attachment; filename="byro-{kind}-{start}-to-{end}.csv"'
        return res


def _percent(rate):
    """0.0500 -> '5', 0.0325 -> '3.25' (for showing to people)."""
    return format((Decimal(rate) * 100).normalize(), 'f')


def _rate_from_percent(value):
    """'4.5' -> Decimal('0.0450'), checked against the allowed range. Raises ValueError with a plain message."""
    try:
        pct = Decimal(str(value).strip())
    except Exception:
        raise ValueError('Enter the fee as a number, e.g. 5 for 5%.')
    if not pct.is_finite() or pct < 0 or pct > MAX_FEE_RATE * 100:
        raise ValueError(f'The fee must be between 0% and {_percent(MAX_FEE_RATE)}%.')
    return (pct / 100).quantize(Decimal('0.0001'))


class FeeInfoView(APIView):
    """GET /api/settings/fees/ — Byro's service fee: the default, and the signed-in organiser's own rate."""
    permission_classes = [AllowAny]

    def get(self, request):
        data = {'default_percent': _percent(default_fee_rate())}
        if request.user.is_authenticated:
            data['my_percent'] = _percent(fee_rate_for(request.user))
        return Response(data)


class AdminSettingsView(APIView):
    """
    GET   /api/admin/settings/ — platform settings and every organiser on a special fee.
    PATCH /api/admin/settings/ {default_fee_percent} — owners only. Applies to new orders; paid ones keep their fee.
    """
    permission_classes = [IsAdminMember]
    method_roles = {'PATCH': AdminMember.ROLE_OWNER}

    def get(self, request):
        from .models import PlatformSettings
        st = PlatformSettings.get()
        deals = (UserProfile.objects.filter(fee_rate_override__isnull=False).select_related('user')
                 .annotate(n_events=Count('user__owned_events', distinct=True))
                 .order_by('display_name'))
        history = AdminAction.objects.filter(
            action__in=[AdminAction.ACTION_FEE_DEFAULT_CHANGED, AdminAction.ACTION_FEE_OVERRIDE_CHANGED]
        ).order_by('-created_at')[:15]
        return Response({
            'default_fee_percent': _percent(st.default_fee_rate),
            'max_fee_percent': _percent(MAX_FEE_RATE),
            'updated_by_email': st.updated_by_email, 'updated_at': st.updated_at,
            'organiser_fees': [{
                'user_id': p.user_id, 'email': p.user.email,
                'name': p.display_name or p.handle or p.user.email, 'handle': p.handle,
                'fee_percent': _percent(p.fee_rate_override), 'events': p.n_events,
            } for p in deals],
            # Who changed which fee, from what to what, newest first.
            'history': [{
                'kind': 'default' if h.action == AdminAction.ACTION_FEE_DEFAULT_CHANGED else 'organiser',
                'who': h.actor_email, 'target': h.target_label, 'change': h.detail, 'at': h.created_at,
            } for h in history],
        })

    def patch(self, request):
        from .models import PlatformSettings
        try:
            rate = _rate_from_percent(request.data.get('default_fee_percent'))
        except ValueError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        st = PlatformSettings.get()
        old = st.default_fee_rate
        if rate != old:
            st.default_fee_rate = rate
            st.updated_by_email = getattr(request, 'admin_member', None).email if getattr(request, 'admin_member', None) else ''
            st.save()
            _log_admin_action(request, AdminAction.ACTION_FEE_DEFAULT_CHANGED, 'settings', 'fee', 'Default service fee',
                              f'{_percent(old)}% -> {_percent(rate)}%')
        return self.get(request)


class AdminUserFeeView(APIView):
    """PATCH /api/admin/users/<pk>/fee/ {fee_percent: number, or null for the default} — an organiser's own fee (owners only)."""
    permission_classes = [IsAdminMember]
    min_role = AdminMember.ROLE_OWNER

    def patch(self, request, pk):
        user = User.objects.filter(pk=pk).first()
        if not user:
            return Response({'error': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        raw = request.data.get('fee_percent')
        try:
            rate = None if raw in (None, '') else _rate_from_percent(raw)
        except ValueError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        profile, _ = UserProfile.objects.get_or_create(user=user)
        old = profile.fee_rate_override
        if rate != old:
            profile.fee_rate_override = rate
            profile.save(update_fields=['fee_rate_override'])
            before = f'{_percent(old)}%' if old is not None else 'default'
            after = f'{_percent(rate)}%' if rate is not None else 'default'
            _log_admin_action(request, AdminAction.ACTION_FEE_OVERRIDE_CHANGED, 'user', user.pk, user.email,
                              f'{before} -> {after}')
        return Response({
            'fee_percent': _percent(rate) if rate is not None else None,
            'effective_percent': _percent(fee_rate_for(user)),
        })


class AdminSupportRequestsView(APIView):
    """GET /api/admin/support/requests/?status=open&search= — help requests from tawk.to, newest first."""
    permission_classes = [IsAdminMember]

    @staticmethod
    def row(r):
        return {
            'id': r.pk, 'source': r.source, 'reference': r.reference, 'name': r.name, 'email': r.email,
            'subject': r.subject, 'message': r.message, 'transcript': r.transcript, 'location': r.location,
            'page': r.page, 'status': r.status, 'assigned_to_email': r.assigned_to_email,
            'closed_by_email': r.closed_by_email, 'closed_at': r.closed_at,
            'created_at': r.created_at, 'updated_at': r.updated_at,
        }

    def get(self, request):
        from .models import SupportRequest
        open_count = SupportRequest.objects.filter(status=SupportRequest.STATUS_OPEN).count()
        if request.query_params.get('count_only'):
            return Response({'open': open_count})
        qs = SupportRequest.objects.all()
        wanted = request.query_params.get('status')
        if wanted in ('open', 'done'):
            qs = qs.filter(status=wanted)
        if request.query_params.get('mine'):
            member = getattr(request, 'admin_member', None)
            qs = qs.filter(assigned_to_email__iexact=member.email if member else '')
        search = (request.query_params.get('search') or '').strip()
        if search:
            qs = qs.filter(Q(name__icontains=search) | Q(email__icontains=search) | Q(subject__icontains=search)
                           | Q(message__icontains=search) | Q(reference__icontains=search))
        return Response({
            'open': open_count,
            'configured': bool(getattr(settings, 'TAWK_WEBHOOK_SECRET', '')),
            'team': self.assignable(),
            'requests': [self.row(r) for r in qs[:200]],
        })

    @staticmethod
    def assignable():
        """Who a request can be handed to: Admins and Owners (Viewers can't act on it)."""
        return list(AdminMember.objects.filter(role__in=[AdminMember.ROLE_ADMIN, AdminMember.ROLE_OWNER])
                    .order_by('email').values_list('email', flat=True))


# The push services browsers use. The server POSTs to a device's endpoint, so only these hosts
# are accepted (anything else could point the server at an internal address).
PUSH_HOSTS = ('fcm.googleapis.com', 'updates.push.services.mozilla.com', 'push.apple.com', 'notify.windows.com')


def _push_endpoint_ok(url):
    from urllib.parse import urlparse
    parts = urlparse(url or '')
    host = (parts.hostname or '').lower()
    return parts.scheme == 'https' and any(host == h or host.endswith('.' + h) for h in PUSH_HOSTS)


class AdminPushView(APIView):
    """
    GET    /api/admin/push/ -> {configured, public_key}
    POST   /api/admin/push/ {subscription: {endpoint, keys: {p256dh, auth}}}: this device gets admin notifications
    DELETE /api/admin/push/?endpoint= (or {endpoint}): this device stops
    """
    permission_classes = [IsAdminMember]

    def get(self, request):
        from .push import configured
        return Response({'configured': configured(), 'public_key': settings.VAPID_PUBLIC_KEY if configured() else ''})

    def post(self, request):
        from .models import PushSubscription
        from .push import configured
        if not configured():
            return Response({'error': 'Push notifications are not set up on the server yet.'}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        sub = request.data.get('subscription') or {}
        endpoint = str(sub.get('endpoint') or '')
        keys = sub.get('keys') or {}
        p256dh, auth = str(keys.get('p256dh') or ''), str(keys.get('auth') or '')
        if not _push_endpoint_ok(endpoint) or len(endpoint) > 1000 or not p256dh or not auth or len(p256dh) > 200 or len(auth) > 100:
            return Response({'error': 'That browser subscription is not valid.'}, status=status.HTTP_400_BAD_REQUEST)
        # The same browser signing in as someone else moves to them.
        PushSubscription.objects.update_or_create(endpoint=endpoint, defaults={
            'user': request.user, 'audience': Notification.AUDIENCE_ADMIN, 'p256dh': p256dh, 'auth': auth,
            'user_agent': request.headers.get('User-Agent', '')[:300],
        })
        return Response({'subscribed': True}, status=status.HTTP_201_CREATED)

    def delete(self, request):
        from .models import PushSubscription
        endpoint = str(request.data.get('endpoint') or request.query_params.get('endpoint') or '')
        PushSubscription.objects.filter(endpoint=endpoint, user=request.user).delete()
        return Response({'subscribed': False})


class AdminSupportRequestDetailView(APIView):
    """PATCH /api/admin/support/requests/<pk>/ {status?: open|done, assign?: 'me'|<team email>|''} — track a help request."""
    permission_classes = [IsAdminMember]
    min_role = AdminMember.ROLE_ADMIN

    def patch(self, request, pk):
        from .models import SupportRequest
        r = SupportRequest.objects.filter(pk=pk).first()
        if not r:
            return Response({'error': 'Request not found.'}, status=status.HTTP_404_NOT_FOUND)
        member = getattr(request, 'admin_member', None)
        me = member.email if member else ''
        fields = []
        if 'assign' in request.data:
            wanted = str(request.data.get('assign') or '').strip().lower()
            if wanted == 'me':
                wanted = me.lower()
            if wanted and wanted not in [e.lower() for e in AdminSupportRequestsView.assignable()]:
                return Response({'error': 'Pick an Admin or Owner on the team.'}, status=status.HTTP_400_BAD_REQUEST)
            if wanted != (r.assigned_to_email or '').lower():
                r.assigned_to_email = wanted
                fields.append('assigned_to_email')
                if wanted and wanted != me.lower():
                    assignee = User.objects.filter(email__iexact=wanted, is_active=True).first()
                    notify(assignee, 'support_request', f'{me or "A teammate"} gave you a support request'[:140],
                           body=(r.name or r.email or r.subject or r.message)[:200], link='/support',
                           audience=Notification.AUDIENCE_ADMIN)
        if 'status' in request.data:
            new = request.data.get('status')
            if new not in ('open', 'done'):
                return Response({'error': 'Status must be open or done.'}, status=status.HTTP_400_BAD_REQUEST)
            if new != r.status:
                r.status = new
                r.closed_by_email = me if new == 'done' else ''
                r.closed_at = timezone.now() if new == 'done' else None
                fields += ['status', 'closed_by_email', 'closed_at']
                if new == 'done':
                    _log_admin_action(request, AdminAction.ACTION_REQUEST_CLOSED, 'request', r.pk,
                                      (r.email or r.name or 'visitor')[:255], r.subject[:255])
        if fields:
            r.save(update_fields=fields + ['updated_at'])
        return Response(AdminSupportRequestsView.row(r))


class AdminMessagesView(APIView):
    """
    GET /api/admin/messages/?search=&status= — every organiser message, newest first.
    Search matches the subject, the organiser's name, handle or email.
    """
    permission_classes = [IsAdminMember]

    @staticmethod
    def row(m, full=False):
        profile = getattr(m.organizer, 'profile', None)
        data = {
            'id': m.pk, 'kind': m.kind, 'audience': m.audience, 'subject': m.subject, 'status': m.status,
            'event_name': m.event.name if m.event_id else '',
            'recipients': m.recipients_count, 'sent': m.sent_count, 'failed': m.failed_count,
            'created_at': m.created_at, 'scheduled_for': m.scheduled_for, 'sent_at': m.sent_at,
            'organizer': {
                'id': m.organizer_id,
                'email': m.organizer.email,
                'name': (profile.display_name if profile else '') or m.organizer.email,
                'handle': profile.handle if profile else None,
                'messaging_blocked': bool(profile and profile.messaging_blocked),
            },
        }
        if full:
            data['body'] = m.body
            data['attach_event'] = m.attach_event
        return data

    def get(self, request):
        qs = Message.objects.select_related('organizer', 'organizer__profile', 'event').order_by('-created_at')
        search = (request.query_params.get('search') or '').strip()
        if search:
            qs = qs.filter(
                Q(subject__icontains=search) | Q(organizer__email__icontains=search)
                | Q(organizer__profile__display_name__icontains=search) | Q(organizer__profile__handle__icontains=search)
            )
        wanted = (request.query_params.get('status') or '').strip()
        if wanted:
            qs = qs.filter(status=wanted)
        return Response([self.row(m, full=True) for m in qs[:300]])


class AdminMessageDetailView(APIView):
    """POST /api/admin/messages/<pk>/cancel/ — stop a scheduled message before it goes out."""
    permission_classes = [IsAdminMember]
    min_role = AdminMember.ROLE_ADMIN

    def post(self, request, pk):
        m = Message.objects.select_related('organizer').filter(pk=pk).first()
        if not m:
            return Response({'error': 'Message not found.'}, status=status.HTTP_404_NOT_FOUND)
        if not Message.objects.filter(pk=pk, status='scheduled').update(status='cancelled'):
            return Response({'error': 'Only a scheduled message that has not gone out yet can be cancelled.'},
                            status=status.HTTP_400_BAD_REQUEST)
        _log_admin_action(request, AdminAction.ACTION_MESSAGE_CANCELLED, 'message', m.pk, m.subject[:255],
                          f'from {m.organizer.email}')
        m.refresh_from_db()
        return Response(AdminMessagesView.row(m, full=True))


class AdminMessagingBlockView(APIView):
    """
    POST /api/admin/users/<pk>/messaging/ {blocked: true|false} — stop (or allow again) an organiser
    sending community messages. Blocking also cancels anything they have scheduled.
    """
    permission_classes = [IsAdminMember]
    min_role = AdminMember.ROLE_ADMIN

    def post(self, request, pk):
        user = User.objects.filter(pk=pk).first()
        if not user:
            return Response({'error': 'User not found.'}, status=status.HTTP_404_NOT_FOUND)
        blocked = bool(request.data.get('blocked'))
        profile, _ = UserProfile.objects.get_or_create(user=user)
        cancelled = 0
        if profile.messaging_blocked != blocked:
            profile.messaging_blocked = blocked
            profile.save(update_fields=['messaging_blocked'])
            if blocked:
                cancelled = Message.objects.filter(organizer=user, status='scheduled').update(status='cancelled')
            _log_admin_action(
                request,
                AdminAction.ACTION_MESSAGING_BLOCKED if blocked else AdminAction.ACTION_MESSAGING_UNBLOCKED,
                'user', user.pk, user.email,
                f'{cancelled} scheduled message(s) cancelled' if cancelled else '',
            )
        return Response({'messaging_blocked': blocked, 'scheduled_cancelled': cancelled})


def _support_ticket(t):
    return {
        'ticket_id': str(t.ticket_id),
        'holder_name': t.current_owner_name, 'holder_email': t.current_owner_email,
        'buyer_email': t.original_owner_email,
        'status': t.payment_status, 'tier': t.tier.name if t.tier_id else 'General admission',
        'checked_in': t.checked_in, 'checked_in_at': t.checked_in_at,
        'transferred': t.is_transferred, 'created_at': t.created_at,
    }


class AdminSupportLookupView(APIView):
    """
    GET /api/admin/support/?q= — find orders and tickets by part of a buyer's or holder's name or email,
    a payment reference, or a full ticket or order ID. Grouped by order; free tickets are one order each.
    """
    permission_classes = [IsAdminMember]

    def get(self, request):
        import uuid as uuidlib
        q = (request.query_params.get('q') or '').strip()
        if len(q) < 3:
            return Response({'error': 'Type at least 3 characters.'}, status=status.HTTP_400_BAD_REQUEST)

        tickets = Ticket.objects.select_related('event', 'tier', 'payment', 'payment__refund')
        try:
            as_uuid = uuidlib.UUID(q)
        except ValueError:
            as_uuid = None
        if as_uuid:
            found = tickets.filter(Q(ticket_id=as_uuid) | Q(payment_id=as_uuid))
        else:
            # Part of a name, email or payment reference is enough ("chidi", "@gmail", "DEMO-0004").
            found = tickets.filter(
                Q(current_owner_email__icontains=q) | Q(original_owner_email__icontains=q)
                | Q(current_owner_name__icontains=q) | Q(original_owner_name__icontains=q)
                | Q(payment__customer_email__icontains=q) | Q(payment__customer_name__icontains=q)
                | Q(payment__paystack_reference__icontains=q)
            )
        # Show whole orders: a match on one ticket brings in the rest of its order.
        payment_ids = [pid for pid in found.values_list('payment_id', flat=True)[:200] if pid]
        found = (found | tickets.filter(payment_id__in=payment_ids)).distinct().order_by('-created_at')[:300]

        orders = {}
        for t in found:
            key = str(t.payment_id) if t.payment_id else f'free-{t.ticket_id}'
            if key not in orders:
                p = t.payment
                refund = getattr(p, 'refund', None) if p else None
                orders[key] = {
                    'key': key,
                    'payment': None if not p else {
                        'id': str(p.pk), 'reference': p.paystack_reference, 'status': p.status,
                        'amount': str(p.amount), 'currency': p.currency, 'channel': p.channel,
                        'customer_name': p.customer_name, 'customer_email': p.customer_email,
                        'created_at': p.created_at, 'paid_at': p.paid_at,
                        'refundable': str(refundable_amount(p)) if p.status == 'successful' else '0',
                    },
                    'refund': None if not refund else {
                        'status': refund.status, 'amount': str(refund.amount), 'reason': refund.reason,
                        'failure_reason': refund.failure_reason,
                    },
                    'event': {
                        'name': t.event.name, 'slug': t.event.slug, 'day': t.event.day,
                        'cancelled': bool(t.event.cancelled_at),
                    },
                    'tickets': [],
                }
            orders[key]['tickets'].append(_support_ticket(t))
        return Response({'orders': list(orders.values())})


class AdminTicketResendView(APIView):
    """POST /api/admin/support/tickets/<uuid>/resend/ — email the ticket again to whoever holds it now."""
    permission_classes = [IsAdminMember]
    min_role = AdminMember.ROLE_ADMIN

    def post(self, request, ticket_id):
        t = Ticket.objects.select_related('event').filter(ticket_id=ticket_id).first()
        if not t:
            return Response({'error': 'Ticket not found.'}, status=status.HTTP_404_NOT_FOUND)
        if t.payment_status not in ('paid', 'free'):
            return Response({'error': 'This ticket is not valid, so there is nothing to resend.'},
                            status=status.HTTP_400_BAD_REQUEST)
        try:
            send_ticket_confirmation_email(t, t.current_owner_name, t.current_owner_email, t.event)
        except Exception:
            logger.exception('Support could not resend ticket %s', t.ticket_id)
            return Response({'error': 'Could not send the email. Try again.'}, status=status.HTTP_502_BAD_GATEWAY)
        _log_admin_action(request, AdminAction.ACTION_TICKET_RESENT, 'ticket', t.ticket_id,
                          t.event.name[:255], f'to {t.current_owner_email}')
        return Response({'sent_to': t.current_owner_email})


class AdminTicketVoidView(APIView):
    """
    POST /api/admin/support/tickets/<uuid>/void/ {reason} — cancel a free ticket (a duplicate, a fake sign-up).

    Free tickets only, and not once someone has been checked in. A paid ticket is a refund,
    which has its own tool; voiding it here would take the money out of the organiser's balance
    without paying the buyer.
    """
    permission_classes = [IsAdminMember]
    min_role = AdminMember.ROLE_ADMIN

    def post(self, request, ticket_id):
        t = Ticket.objects.select_related('event').filter(ticket_id=ticket_id).first()
        if not t:
            return Response({'error': 'Ticket not found.'}, status=status.HTTP_404_NOT_FOUND)
        if t.payment_status != 'free':
            return Response({'error': 'Only free tickets can be voided here. Refund a paid order instead.'},
                            status=status.HTTP_400_BAD_REQUEST)
        if t.checked_in:
            return Response({'error': 'This ticket has been checked in. Undo the check-in first.'},
                            status=status.HTTP_400_BAD_REQUEST)
        reason = (request.data.get('reason') or '').strip()
        if len(reason) < 3:
            return Response({'error': 'Give the holder a reason.'}, status=status.HTTP_400_BAD_REQUEST)
        t.payment_status = 'cancelled'
        t.save(update_fields=['payment_status'])
        _log_admin_action(request, AdminAction.ACTION_TICKET_VOIDED, 'ticket', t.ticket_id,
                          t.event.name[:255], f'{t.current_owner_email}: {reason}'[:255])
        try:
            from .emails import ticket_voided_email
            from .mailer import send_email
            mail = ticket_voided_email(t.current_owner_name, t.event.name, reason)
            send_email(to=t.current_owner_email, subject=mail['subject'], html=mail['html'], text=mail['text'])
        except Exception:
            logger.exception('Could not tell the holder their ticket %s was voided', t.ticket_id)
        return Response(_support_ticket(t))


class AdminTicketEmailView(APIView):
    """
    POST /api/admin/support/tickets/<uuid>/email/ {email} — put the ticket on the right address
    (a buyer typed it wrongly) and send it there.
    """
    permission_classes = [IsAdminMember]
    min_role = AdminMember.ROLE_ADMIN

    def post(self, request, ticket_id):
        from django.contrib.auth import get_user_model
        from django.core.exceptions import ValidationError as DjangoValidationError
        from django.core.validators import validate_email
        from .models import Stamp
        t = Ticket.objects.select_related('event').filter(ticket_id=ticket_id).first()
        if not t:
            return Response({'error': 'Ticket not found.'}, status=status.HTTP_404_NOT_FOUND)
        if t.payment_status not in ('paid', 'free'):
            return Response({'error': 'This ticket is not valid.'}, status=status.HTTP_400_BAD_REQUEST)
        email = (request.data.get('email') or '').strip().lower()
        try:
            validate_email(email)
        except DjangoValidationError:
            return Response({'error': 'That is not a valid email address.'}, status=status.HTTP_400_BAD_REQUEST)
        old = t.current_owner_email
        if email == (old or '').lower():
            return Response({'error': 'The ticket is already on that address.'}, status=status.HTTP_400_BAD_REQUEST)
        t.current_owner_email = email
        if t.original_owner_email.lower() == (old or '').lower():
            t.original_owner_email = email  # the buyer typed it wrongly, so it was wrong from the start
        t.user = get_user_model().objects.filter(email__iexact=email).first()  # the account behind the typo isn't theirs
        t.save(update_fields=['current_owner_email', 'original_owner_email', 'user'])
        Stamp.objects.filter(ticket=t).update(email=email, user=t.user)
        _log_admin_action(request, AdminAction.ACTION_TICKET_EMAIL_CHANGED, 'ticket', t.ticket_id,
                          t.event.name[:255], f'{old} to {email}')
        try:
            send_ticket_confirmation_email(t, t.current_owner_name, email, t.event)
        except Exception:
            logger.exception('Support could not send ticket %s to its new address', t.ticket_id)
        return Response(_support_ticket(t))


class AdminTicketCheckinView(APIView):
    """POST /api/admin/support/tickets/<uuid>/checkin/ {checked_in: bool} — check someone in, or undo a mistake."""
    permission_classes = [IsAdminMember]
    min_role = AdminMember.ROLE_ADMIN

    def post(self, request, ticket_id):
        from .models import Stamp
        t = Ticket.objects.select_related('event').filter(ticket_id=ticket_id).first()
        if not t:
            return Response({'error': 'Ticket not found.'}, status=status.HTTP_404_NOT_FOUND)
        want = bool(request.data.get('checked_in'))
        if want == t.checked_in:
            return Response(_support_ticket(t))
        if want:
            if t.payment_status not in ('paid', 'free'):
                return Response({'error': 'This ticket is not valid, so it cannot be checked in.'},
                                status=status.HTTP_400_BAD_REQUEST)
            t.checked_in, t.checked_in_at = True, timezone.now()
            t.save(update_fields=['checked_in', 'checked_in_at'])
            record_stamp(t)
            action = AdminAction.ACTION_TICKET_CHECKED_IN
        else:
            t.checked_in, t.checked_in_at = False, None
            t.save(update_fields=['checked_in', 'checked_in_at'])
            Stamp.objects.filter(ticket=t).delete()  # the stamp was for showing up; they didn't
            action = AdminAction.ACTION_TICKET_CHECKIN_UNDONE
        _log_admin_action(request, action, 'ticket', t.ticket_id, t.event.name[:255], t.current_owner_email)
        return Response(_support_ticket(t))


class AdminOrderRefundView(APIView):
    """
    POST /api/admin/support/orders/<uuid>/refund/ {reason} — refund one paid order while its event goes ahead.
    The buyer gets the ticket price back (fees are kept) and is emailed; the tickets stop working.
    """
    permission_classes = [IsAdminMember]
    min_role = AdminMember.ROLE_ADMIN

    def post(self, request, payment_id):
        from .refunds import refund_order
        payment = Payment.objects.select_related('event').filter(pk=payment_id).first()
        if not payment:
            return Response({'error': 'Order not found.'}, status=status.HTTP_404_NOT_FOUND)
        try:
            refund = refund_order(payment, request.data.get('reason'))
        except EventCancellationError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        _log_admin_action(request, AdminAction.ACTION_ORDER_REFUNDED, 'payment', payment.paystack_reference,
                          payment.event.name[:255], f'{refund.amount} to {payment.customer_email}: {refund.reason}'[:255])
        return Response({
            'status': refund.status, 'amount': str(refund.amount),
            'failure_reason': refund.failure_reason,
        })


class AdminPromosListView(APIView):
    """GET /api/admin/promos/?search= — every promo code with usage."""
    permission_classes = [IsAdminMember]

    def get(self, request):
        search = (request.query_params.get('search') or '').strip()
        qs = PromoCode.objects.select_related('event').order_by('-created_at')
        if search:
            qs = qs.filter(Q(code__icontains=search) | Q(event__name__icontains=search))
        return Response([{
            'id': p.pk, 'code': p.code, 'event_slug': p.event.slug,
            'event_name': p.event.name, 'discount_type': p.discount_type,
            'amount': str(p.amount), 'redeemed_count': p.redeemed_count,
            'max_redemptions': p.max_redemptions, 'active': p.active,
            'is_valid': p.is_valid(), 'expires_at': p.expires_at,
        } for p in qs[:300]])


class AdminAuditLogView(APIView):
    """GET /api/admin/audit-log/?target_type=event&target_id=3&limit=50"""
    permission_classes = [IsAdminMember]

    def get(self, request):
        qs = AdminAction.objects.all()
        target_type = (request.query_params.get('target_type') or '').strip()
        target_id = (request.query_params.get('target_id') or '').strip()
        if target_type:
            qs = qs.filter(target_type=target_type)
        if target_id:
            qs = qs.filter(target_id=str(target_id))
        try:
            limit = min(max(int(request.query_params.get('limit', 50)), 1), 200)
        except ValueError:
            limit = 50
        return Response([{
            'id': a.pk, 'action': a.action, 'target_type': a.target_type,
            'target_id': a.target_id, 'target_label': a.target_label,
            'detail': a.detail, 'actor_email': a.actor_email, 'created_at': a.created_at,
        } for a in qs[:limit]])


class AdminUserDetailView(APIView):
    """GET   /api/admin/users/<pk>/ — everything about one person: events, tickets, spending, payouts, follows.
    PATCH /api/admin/users/<pk>/ — { role, is_active }.

    Anyone on the team can look. Admins can suspend/reactivate; changing a user's role needs an owner.
    """
    permission_classes = [IsAdminMember]
    min_role = 'admin'
    method_roles = {'GET': 'viewer'}
    User = get_user_model()

    def get(self, request, pk):
        from .accounts import summary
        user = self.User.objects.filter(pk=pk).first()
        if not user:
            return Response({'error': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        return Response(summary(user))

    def patch(self, request, pk):
        try:
            user = self.User.objects.select_related('profile').get(pk=pk)
        except self.User.DoesNotExist:
            return Response({'error': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

        profile = getattr(user, 'profile', None)
        if profile is None:
            profile = UserProfile.objects.create(user=user)

        if 'role' in request.data:
            if AdminMember.ROLE_RANK[request.admin_member.role] < AdminMember.ROLE_RANK['owner']:
                return Response({'error': 'Only owners can change user roles'}, status=status.HTTP_403_FORBIDDEN)
            role = request.data.get('role') or ''
            if role and role not in dict(UserProfile.ROLE_CHOICES):
                return Response({'error': 'Invalid role'}, status=status.HTTP_400_BAD_REQUEST)
            if role != profile.role:
                profile.role = role
                profile.save(update_fields=['role'])
                _log_admin_action(
                    request, AdminAction.ACTION_USER_ROLE_CHANGED, 'user', user.pk,
                    user.email, f"role -> {role or 'unspecified'}",
                )

        if 'is_active' in request.data:
            is_active = bool(request.data.get('is_active'))
            if is_active != user.is_active:
                user.is_active = is_active
                user.save(update_fields=['is_active'])
                _log_admin_action(
                    request, AdminAction.ACTION_USER_SUSPENDED if not is_active else AdminAction.ACTION_USER_REACTIVATED,
                    'user', user.pk, user.email, '',
                )

        return Response({
            'id': user.pk, 'email': user.email, 'role': profile.role,
            'is_active': user.is_active,
        })


class AdminUserDeleteView(APIView):
    """
    POST /api/admin/users/<pk>/delete/ {confirm_email} — delete an account on request (owners only).
    The account is anonymised: name, email, photo, links and follows are removed and it can't sign in.
    Payments and event history are kept for Byro's records. Refused while anything is still owed or live.
    """
    permission_classes = [IsAdminMember]
    min_role = AdminMember.ROLE_OWNER

    def post(self, request, pk):
        from .accounts import DELETED_DOMAIN, anonymise, delete_blockers
        user = User.objects.filter(pk=pk).first()
        if not user:
            return Response({'error': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        if user.email.endswith(DELETED_DOMAIN):
            return Response({'error': 'This account is already deleted.'}, status=status.HTTP_400_BAD_REQUEST)
        if user == request.user:
            return Response({'error': "You can't delete your own account here."}, status=status.HTTP_400_BAD_REQUEST)
        if (request.data.get('confirm_email') or '').strip().lower() != user.email.lower():
            return Response({'error': "Type the person's email address exactly to confirm."},
                            status=status.HTTP_400_BAD_REQUEST)
        blockers = delete_blockers(user)
        if blockers:
            return Response({'error': blockers[0], 'blockers': blockers}, status=status.HTTP_400_BAD_REQUEST)
        old = user.email
        anonymise(user)
        _log_admin_action(request, AdminAction.ACTION_USER_DELETED, 'user', user.pk, old, 'anonymised on request')
        return Response({'deleted': True})


class AdminMeView(APIView):
    """GET /api/admin/me/ — the signed-in admin's role and what it allows."""
    permission_classes = [IsAdminMember]

    def get(self, request):
        m = request.admin_member
        rank = AdminMember.ROLE_RANK[m.role]
        return Response({
            'email': m.email, 'role': m.role,
            'can': {
                'moderate': rank >= AdminMember.ROLE_RANK['admin'],
                'payouts': rank >= AdminMember.ROLE_RANK['admin'],
                'delete': rank >= AdminMember.ROLE_RANK['owner'],
                'manage_roles': rank >= AdminMember.ROLE_RANK['owner'],
                'manage_team': rank >= AdminMember.ROLE_RANK['owner'],
            },
        })


def _member_payload(m):
    user = get_user_model().objects.filter(email__iexact=m.email).select_related('profile').first()
    profile = getattr(user, 'profile', None) if user else None
    return {
        'id': m.pk, 'email': m.email, 'role': m.role, 'added_at': m.created_at,
        'display_name': (profile.display_name if profile else '') or '',
        'handle': (profile.handle if profile else None),
        'avatar_url': profile.avatar.url if profile and profile.avatar else None,
        'last_seen': user.last_login if user else None,
        'signed_up': user is not None,
    }


class AdminTeamView(APIView):
    """GET/POST /api/admin/team/ — list (admin+) and add (owner) team members."""
    permission_classes = [IsAdminMember]
    min_role = 'admin'
    method_roles = {'POST': 'owner'}

    def get(self, request):
        return Response([_member_payload(m) for m in AdminMember.objects.all()])

    def post(self, request):
        email = (request.data.get('email') or '').strip().lower()
        role = request.data.get('role') or AdminMember.ROLE_VIEWER
        if not email or '@' not in email:
            return Response({'error': 'A valid email is required'}, status=status.HTTP_400_BAD_REQUEST)
        if role not in AdminMember.ROLE_RANK:
            return Response({'error': 'Invalid role'}, status=status.HTTP_400_BAD_REQUEST)
        if AdminMember.objects.filter(email=email).exists():
            return Response({'error': 'Already on the team'}, status=status.HTTP_409_CONFLICT)
        m = AdminMember.objects.create(
            email=email, role=role, added_by_email=request.admin_member.email,
        )
        _log_admin_action(request, AdminAction.ACTION_TEAM_ADDED, 'member', m.pk, m.email, role)
        return Response(_member_payload(m), status=status.HTTP_201_CREATED)


class AdminTeamDetailView(APIView):
    """PATCH {role} / DELETE /api/admin/team/<pk>/ — owner only.

    An owner can't demote or remove themselves, so the team can never be
    left without one.
    """
    permission_classes = [IsAdminMember]
    min_role = 'owner'

    def _get(self, pk):
        return AdminMember.objects.filter(pk=pk).first()

    def patch(self, request, pk):
        m = self._get(pk)
        if m is None:
            return Response({'error': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        role = request.data.get('role')
        if role not in AdminMember.ROLE_RANK:
            return Response({'error': 'Invalid role'}, status=status.HTTP_400_BAD_REQUEST)
        if m.pk == request.admin_member.pk and role != m.role:
            return Response({'error': "You can't change your own role"}, status=status.HTTP_400_BAD_REQUEST)
        if role != m.role:
            m.role = role
            m.save(update_fields=['role'])
            _log_admin_action(request, AdminAction.ACTION_TEAM_ROLE_CHANGED, 'member', m.pk, m.email, role)
        return Response(_member_payload(m))

    def delete(self, request, pk):
        m = self._get(pk)
        if m is None:
            return Response({'error': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        if m.pk == request.admin_member.pk:
            return Response({'error': "You can't remove yourself"}, status=status.HTTP_400_BAD_REQUEST)
        _log_admin_action(request, AdminAction.ACTION_TEAM_REMOVED, 'member', m.pk, m.email, m.role)
        m.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class AdminActivityView(APIView):
    """GET /api/admin/activity/?search=&action=&target_type=&target_id=&limit=100

    What users did (sign-ins, events, tickets, payouts), newest first. Search
    matches the actor's email or the target's label.
    """
    permission_classes = [IsAdminMember]

    def get(self, request):
        qs = ActivityLog.objects.all()
        search = (request.query_params.get('search') or '').strip()
        action = (request.query_params.get('action') or '').strip()
        target_type = (request.query_params.get('target_type') or '').strip()
        target_id = (request.query_params.get('target_id') or '').strip()
        if search:
            qs = qs.filter(Q(actor_email__icontains=search) | Q(target_label__icontains=search))
        if action:
            qs = qs.filter(action=action)
        if target_type:
            qs = qs.filter(target_type=target_type)
        if target_id:
            qs = qs.filter(target_id=target_id)
        try:
            limit = min(max(int(request.query_params.get('limit', 100)), 1), 300)
        except ValueError:
            limit = 100
        return Response({
            'actions': [{'value': v, 'label': l} for v, l in ActivityLog.ACTION_CHOICES],
            'results': [{
                'id': a.pk, 'action': a.action, 'actor_email': a.actor_email,
                'target_type': a.target_type, 'target_id': a.target_id,
                'target_label': a.target_label, 'detail': a.detail,
                'ip_address': a.ip_address, 'created_at': a.created_at,
            } for a in qs[:limit]],
        })
