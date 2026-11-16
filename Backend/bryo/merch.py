"""
Merch orders: pricing, checkout, fulfilment steps, when earnings are released, refunds and the balance.

How the money moves
  The buyer pays items + delivery fee (+ Paystack's own charge). Byro's fee, if any (MERCH_FEE_RATE,
  zero for now), comes off the items. The organiser earns items - fee + delivery fee, and it joins their
  withdrawable balance only once the order is complete and its safety window has passed:

    pickup, picked up with the buyer's code ........ straight away
    pickup, picked up without the code ............. 3 days later
    pickup, never collected ........................ 7 days after "ready for pickup"
    delivery, delivered ............................ 3 days later
    delivery, never marked delivered ............... 10 days after "shipped"

  A buyer can report a problem until the release date; that puts the earnings on hold until Byro
  decides. An order the organiser never starts is cancelled and refunded 14 days after payment.
"""
import logging
import re
import secrets
import uuid
from datetime import timedelta
from decimal import Decimal, ROUND_HALF_UP

from django.conf import settings
from django.db import transaction
from django.db.models import DecimalField, ExpressionWrapper, F, Q, Sum
from django.db.models.functions import Coalesce
from django.utils import timezone

from .models import MerchItem, MerchOrder, MerchOrderItem, UserProfile

logger = logging.getLogger(__name__)

RESERVATION_MINUTES = 10      # stock is held this long while a buyer pays
MAX_LINES = 20
MAX_QUANTITY = 20
SAFETY_DAYS = 3               # after delivery, or a pickup handed over without the code
UNCOLLECTED_DAYS = 7          # a ready pickup nobody collects releases this long after "ready"
UNDELIVERED_DAYS = 10         # a shipped order nobody marks delivered releases this long after "shipped"
REMIND_AFTER_DAYS = 10        # tell the organiser an unstarted order is waiting
AUTO_CANCEL_DAYS = 14         # then cancel it and refund the buyer

REPORT_REASONS = ('not_received', 'wrong_item', 'damaged', 'other')
LIVE = [MerchOrder.PAID, MerchOrder.PACKED, MerchOrder.SHIPPED, MerchOrder.DELIVERED,
        MerchOrder.READY, MerchOrder.PICKED_UP]
DONE = (MerchOrder.DELIVERED, MerchOrder.PICKED_UP)
_CENTS = Decimal('0.01')


class MerchError(Exception):
    """A plain-English reason something can't be done. `status` is the HTTP code the views answer with."""

    def __init__(self, message, status=400):
        super().__init__(message)
        self.message = message
        self.status = status


def fee_rate():
    """Byro's fee on merch items, as a fraction (0.05 = 5%). Zero until Byro decides otherwise."""
    return Decimal(str(getattr(settings, 'MERCH_FEE_RATE', '0') or '0'))


# ---------------------------------------------------------------------------
# What an organiser offers
# ---------------------------------------------------------------------------

def fulfilment_settings(user):
    profile = UserProfile.objects.filter(user=user).first()
    return {
        'pickup_address': profile.pickup_address if profile else '',
        'pickup_instructions': profile.pickup_instructions if profile else '',
        'delivery_enabled': bool(profile and profile.delivery_enabled),
        'delivery_area': profile.delivery_area if profile else '',
        'delivery_fee': str(profile.delivery_fee) if profile else '0',
        'can_take_payment': bool(profile and profile.pickup_address.strip()),
    }


def public_checkout_info(user):
    """What the public profile needs to show Buy, and to offer pickup or delivery."""
    f = fulfilment_settings(user)
    return {
        'enabled': f['can_take_payment'],
        'pickup': {'address': f['pickup_address'], 'instructions': f['pickup_instructions']},
        'delivery': {'enabled': f['delivery_enabled'], 'area': f['delivery_area'], 'fee': f['delivery_fee']}
        if f['delivery_enabled'] else {'enabled': False},
    }


def save_fulfilment(user, data):
    profile, _ = UserProfile.objects.get_or_create(user=user)
    address = str(data.get('pickup_address', profile.pickup_address) or '').strip()[:255]
    if not address:
        raise MerchError('Add a pickup address so buyers know where to collect.')
    delivery = bool(data.get('delivery_enabled', profile.delivery_enabled))
    try:
        fee = Decimal(str(data.get('delivery_fee', profile.delivery_fee) or '0'))
    except Exception:
        raise MerchError('Enter the delivery fee in naira.')
    if fee < 0 or fee > Decimal('1000000'):
        raise MerchError('Enter a delivery fee between 0 and 1,000,000.')
    profile.pickup_address = address
    profile.pickup_instructions = str(data.get('pickup_instructions', profile.pickup_instructions) or '').strip()[:300]
    profile.delivery_enabled = delivery
    profile.delivery_area = str(data.get('delivery_area', profile.delivery_area) or '').strip()[:120]
    profile.delivery_fee = fee.quantize(_CENTS)
    profile.save(update_fields=['pickup_address', 'pickup_instructions', 'delivery_enabled', 'delivery_area', 'delivery_fee'])
    open_pickups = MerchOrder.objects.filter(
        seller=user, fulfilment=MerchOrder.FULFIL_PICKUP, status__in=[MerchOrder.PAID, MerchOrder.READY],
    ).select_related('seller')
    return fulfilment_settings(user), list(open_pickups)


# ---------------------------------------------------------------------------
# Checkout
# ---------------------------------------------------------------------------

def _money(value):
    return Decimal(value).quantize(_CENTS, rounding=ROUND_HALF_UP)


def _release_stock(order):
    """Give an order's items back to stock. Call with the order row locked."""
    for line in order.lines.select_related('item'):
        if line.item_id and line.item.stock is not None:
            MerchItem.objects.filter(pk=line.item_id).update(stock=F('stock') + line.quantity)


def _take_stock(order):
    """Take an order's items out of stock again (a late payment after the hold expired). False if short."""
    lines = list(order.lines.select_related('item'))
    need = {}
    for line in lines:
        if line.item_id and line.item.stock is not None:
            need[line.item_id] = need.get(line.item_id, 0) + line.quantity
    items = {i.pk: i for i in MerchItem.objects.select_for_update().filter(pk__in=need)}
    for item_id, qty in need.items():
        if item_id not in items or items[item_id].stock < qty:
            return False
    for item_id, qty in need.items():
        MerchItem.objects.filter(pk=item_id).update(stock=F('stock') - qty)
    return True


def release_stale_reservations():
    """Orders nobody paid for within the hold go back on sale."""
    cutoff = timezone.now() - timedelta(minutes=RESERVATION_MINUTES)
    for pk in MerchOrder.objects.filter(status=MerchOrder.PENDING, created_at__lt=cutoff).values_list('pk', flat=True):
        fail_order(MerchOrder.objects.get(pk=pk))


def fail_order(order):
    with transaction.atomic():
        locked = MerchOrder.objects.select_for_update().get(pk=order.pk)
        if locked.status != MerchOrder.PENDING:
            return False
        _release_stock(locked)
        locked.status = MerchOrder.FAILED
        locked.save(update_fields=['status', 'updated_at'])
    return True


def create_order(seller, lines, fulfilment, *, buyer=None, name='', email='', phone='', address='', note=''):
    """
    Validate a cart and create a pending order, holding the stock. Raises MerchError with a plain reason.
    `lines` is a list of {item_id, quantity, option}.
    """
    release_stale_reservations()
    name, email, phone = (name or '').strip(), (email or '').strip().lower(), (phone or '').strip()
    address, note = (address or '').strip(), (note or '').strip()[:300]
    if not name:
        raise MerchError('Enter your name.')
    if not re.match(r'^[^\s@]+@[^\s@]+\.[^\s@]+$', email):
        raise MerchError("That email doesn't look right. Check it and try again.")
    if fulfilment not in (MerchOrder.FULFIL_PICKUP, MerchOrder.FULFIL_DELIVERY):
        raise MerchError('Choose pickup or delivery.')
    if not isinstance(lines, list) or not lines or len(lines) > MAX_LINES:
        raise MerchError('Add at least one item to your order.')

    profile = UserProfile.objects.filter(user=seller).first()
    if not profile or not profile.pickup_address.strip():
        raise MerchError("This seller isn't taking payments yet.", status=409)
    delivery = fulfilment == MerchOrder.FULFIL_DELIVERY
    if delivery:
        if not profile.delivery_enabled:
            raise MerchError("This seller doesn't offer delivery. Choose pickup.")
        if len(address) < 10:
            raise MerchError('Enter your full delivery address.')
        if len(re.sub(r'\D', '', phone)) < 7:
            raise MerchError('Enter a phone number the seller can call about your delivery.')

    wanted = []
    for raw in lines:
        try:
            item_id, qty = int(raw.get('item_id')), int(raw.get('quantity', 1))
        except (TypeError, ValueError, AttributeError):
            raise MerchError('One of the items in your order is not valid.')
        if qty < 1 or qty > MAX_QUANTITY:
            raise MerchError(f'You can order 1 to {MAX_QUANTITY} of each item.')
        wanted.append((item_id, qty, str(raw.get('option') or '').strip()[:60]))

    with transaction.atomic():
        items = {
            i.pk: i for i in MerchItem.objects.select_for_update().filter(
                pk__in={w[0] for w in wanted}, owner=seller, is_active=True, removed_by_admin=False)
        }
        needed = {}
        for item_id, qty, option in wanted:
            item = items.get(item_id)
            if item is None:
                raise MerchError('One of those items is no longer available.', status=409)
            if item.price is None or item.price <= 0:
                raise MerchError(f'{item.name} can\'t be bought here.')
            choices = [str(o) for o in (item.options or [])]
            if choices and option not in choices:
                raise MerchError(f'Choose an option for {item.name}.')
            if not choices and option:
                raise MerchError(f'{item.name} has no options.')
            needed[item_id] = needed.get(item_id, 0) + qty
        for item_id, qty in needed.items():
            item = items[item_id]
            if item.stock is not None and item.stock < qty:
                left = max(item.stock, 0)
                raise MerchError(f'{item.name} is sold out.' if left == 0 else f'Only {left} of {item.name} left.', status=409)

        subtotal = _money(sum(items[i].price * q for i, q, _ in wanted))
        delivery_fee = _money(profile.delivery_fee) if delivery else Decimal('0.00')
        rate = fee_rate()
        order = MerchOrder.objects.create(
            seller=seller, buyer=buyer if getattr(buyer, 'is_authenticated', False) else None,
            buyer_name=name[:255], buyer_email=email, buyer_phone=phone[:40], buyer_note=note,
            fulfilment=fulfilment, delivery_address=address if delivery else '',
            delivery_area=profile.delivery_area if delivery else '',
            subtotal=subtotal, delivery_fee=delivery_fee, fee_rate=rate,
            service_fee=_money(subtotal * rate), amount=subtotal + delivery_fee,
            paystack_reference=f'MRC-{uuid.uuid4().hex[:24]}',
            access_token=secrets.token_urlsafe(24), pickup_code=f'{secrets.randbelow(9000) + 1000}',
        )
        for item_id, qty, option in wanted:
            item = items[item_id]
            MerchOrderItem.objects.create(order=order, item=item, name=item.name, option=option, quantity=qty, unit_price=item.price)
        for item_id, qty in needed.items():
            if items[item_id].stock is not None:
                MerchItem.objects.filter(pk=item_id).update(stock=F('stock') - qty)
    return order


# ---------------------------------------------------------------------------
# Payment
# ---------------------------------------------------------------------------

def mark_paid(order, channel=''):
    """
    Move an order to paid, once. Safe to call from both the verify page and the webhook.
    Returns (order, newly_paid). If the stock was released while the buyer paid and has since gone,
    the order is cancelled and refunded straight away.
    """
    with transaction.atomic():
        locked = MerchOrder.objects.select_for_update().select_related('seller').get(pk=order.pk)
        if locked.status not in (MerchOrder.PENDING, MerchOrder.FAILED):
            return locked, False
        sold_out = locked.status == MerchOrder.FAILED and not _take_stock(locked)
        locked.status = MerchOrder.PAID
        locked.paid_at = timezone.now()
        locked.channel = (channel or '')[:20]
        locked.save(update_fields=['status', 'paid_at', 'channel', 'updated_at'])
        if sold_out:
            _start_refund(locked, 'Sorry, it sold out while you were paying.', restock=False)
        else:
            transaction.on_commit(lambda: _announce_paid(locked.pk))
    return locked, True


def _announce_paid(order_id):
    from .notifications import notify
    order = MerchOrder.objects.select_related('seller').prefetch_related('lines').get(pk=order_id)
    first = order.buyer_name.split(' ')[0] if order.buyer_name else 'Someone'
    notify(
        order.seller, 'merch_order', f"{first} paid ₦{order.amount:,.0f}",
        body=f"{sum(l.quantity for l in order.lines.all())} item(s), order {order.ref}", link='/dashboard/merch?tab=orders',
    )
    _email(order, 'receipt')


# ---------------------------------------------------------------------------
# Fulfilment steps
# ---------------------------------------------------------------------------

# action -> (fulfilment it belongs to, statuses it can start from, status it leads to)
STEPS = {
    'pack': (MerchOrder.FULFIL_DELIVERY, (MerchOrder.PAID,), MerchOrder.PACKED),
    'ship': (MerchOrder.FULFIL_DELIVERY, (MerchOrder.PAID, MerchOrder.PACKED), MerchOrder.SHIPPED),
    'delivered': (MerchOrder.FULFIL_DELIVERY, (MerchOrder.SHIPPED,), MerchOrder.DELIVERED),
    'ready': (MerchOrder.FULFIL_PICKUP, (MerchOrder.PAID,), MerchOrder.READY),
    'picked_up': (MerchOrder.FULFIL_PICKUP, (MerchOrder.READY,), MerchOrder.PICKED_UP),
}


def _earlier(current, candidate):
    return candidate if current is None or candidate < current else current


def advance(order, action, *, courier='', tracking='', code='', by_buyer=False):
    """One step along the order's way. Raises MerchError when it isn't allowed from where the order is."""
    if action not in STEPS:
        raise MerchError('That is not a step an order can take.')
    kind, allowed, target = STEPS[action]
    with transaction.atomic():
        locked = MerchOrder.objects.select_for_update().get(pk=order.pk)
        if locked.fulfilment != kind:
            raise MerchError('That step does not apply to this kind of order.')
        if locked.status not in allowed:
            raise MerchError('This order is not at the step before that one.', status=409)
        now = timezone.now()
        locked.status = target
        if action == 'pack':
            locked.packed_at = now
        elif action == 'ship':
            locked.packed_at = locked.packed_at or now
            locked.shipped_at, locked.courier, locked.tracking = now, (courier or '').strip()[:120], (tracking or '').strip()[:120]
            locked.release_at = _earlier(locked.release_at, now + timedelta(days=UNDELIVERED_DAYS))
        elif action == 'ready':
            locked.ready_at = now
            locked.release_at = _earlier(locked.release_at, now + timedelta(days=UNCOLLECTED_DAYS))
        elif action == 'delivered':
            locked.delivered_at = now
            locked.release_at = _earlier(locked.release_at, now + timedelta(days=SAFETY_DAYS))
        elif action == 'picked_up':
            locked.picked_up_at = now
            code = (code or '').strip()
            if code and not by_buyer:
                if code != locked.pickup_code:
                    raise MerchError("That code doesn't match this order.")
                locked.code_verified = True
                locked.release_at = now  # handed over against the buyer's own code: nothing to wait for
            else:
                locked.release_at = _earlier(locked.release_at, now + timedelta(days=SAFETY_DAYS))
        locked.save()
        transaction.on_commit(lambda: _email(locked, {'ready': 'ready', 'ship': 'shipped'}.get(action, '')))
    return locked


def confirm_by_buyer(order):
    """The buyer says it arrived, or that they collected it."""
    if order.is_pickup:
        if order.status == MerchOrder.READY:
            return advance(order, 'picked_up', by_buyer=True)
    elif order.status == MerchOrder.SHIPPED:
        return advance(order, 'delivered', by_buyer=True)
    raise MerchError('This order is not waiting to be confirmed.', status=409)


# ---------------------------------------------------------------------------
# Problems, cancels and refunds
# ---------------------------------------------------------------------------

def report_problem(order, reason, note=''):
    """The buyer reports a problem. Their earnings are held until Byro decides."""
    if reason not in REPORT_REASONS:
        raise MerchError('Choose what went wrong.')
    with transaction.atomic():
        locked = MerchOrder.objects.select_for_update().select_related('seller').get(pk=order.pk)
        if locked.status not in LIVE:
            raise MerchError('There is nothing to report on this order.', status=409)
        if locked.on_hold:
            raise MerchError('You have already reported a problem on this order.', status=409)
        if locked.release_at and locked.release_at <= timezone.now():
            raise MerchError('The time to report a problem on this order has passed. Email support@usebyro.com.', status=409)
        locked.report_reason, locked.report_note = reason, (note or '').strip()[:500]
        locked.reported_at, locked.report_resolved_at, locked.report_outcome = timezone.now(), None, ''
        locked.save()
        transaction.on_commit(lambda: _announce_report(locked.pk))
    return locked


def _announce_report(order_id):
    from .notifications import notify, notify_admins
    order = MerchOrder.objects.select_related('seller').get(pk=order_id)
    first = order.buyer_name.split(' ')[0] or 'A buyer'
    notify(order.seller, 'merch_problem', f"{first} reported a problem", body=f"Order {order.ref}", link='/dashboard/merch?tab=orders')
    notify_admins('merch_problem', f"Merch problem on {order.ref}", body=order.report_reason.replace('_', ' '), link='/merch')
    _email(order, 'problem')


def resolve_report(order, outcome):
    """Byro decides: release the earnings to the organiser, or refund the buyer."""
    if outcome not in ('release', 'refund'):
        raise MerchError("Choose 'release' or 'refund'.")
    with transaction.atomic():
        locked = MerchOrder.objects.select_for_update().get(pk=order.pk)
        if not locked.on_hold:
            raise MerchError('This order has no open problem.', status=409)
        locked.report_resolved_at, locked.report_outcome = timezone.now(), outcome
        if outcome == 'release':
            locked.release_at = timezone.now()
        locked.save()
        if outcome == 'refund':
            _start_refund(locked, 'Refunded after your problem report.', restock=False)
    return locked


def admin_refund(order, reason):
    """Byro support refunds a paid order whatever step it is at, for example after the time to report has passed."""
    reason = (reason or '').strip()[:300]
    if not reason:
        raise MerchError('Add a reason. The buyer sees it.')
    with transaction.atomic():
        locked = MerchOrder.objects.select_for_update().get(pk=order.pk)
        if locked.status not in LIVE:
            raise MerchError('Only a paid order that has not been refunded can be refunded.', status=409)
        if locked.on_hold:
            locked.report_resolved_at, locked.report_outcome = timezone.now(), 'refund'
        _start_refund(locked, reason, restock=False)
    return locked


def cancel(order, reason):
    """The organiser cancels before sending it, and the buyer gets everything back (items and delivery fee)."""
    reason = (reason or '').strip()[:300]
    with transaction.atomic():
        locked = MerchOrder.objects.select_for_update().get(pk=order.pk)
        if locked.status not in (MerchOrder.PAID, MerchOrder.PACKED, MerchOrder.READY):
            raise MerchError('This order can no longer be cancelled. If it cannot be delivered, say so instead.', status=409)
        _start_refund(locked, reason, restock=True)
    return locked


def cant_deliver(order, reason=''):
    """A shipped order that is lost, returned or refused: the buyer is refunded in full."""
    with transaction.atomic():
        locked = MerchOrder.objects.select_for_update().get(pk=order.pk)
        if locked.status != MerchOrder.SHIPPED:
            raise MerchError('Only an order that has been shipped can be marked as not delivered.', status=409)
        _start_refund(locked, (reason or '').strip()[:300] or "We couldn't deliver your order.", restock=False)
    return locked


def _start_refund(order, reason, *, restock):
    """Call inside a transaction with the order row locked. Marks it cancelled and asks Paystack to refund."""
    order.status = MerchOrder.REFUND_PROCESSING
    order.cancel_reason = reason
    order.cancelled_at = timezone.now()
    order.refund_amount = order.subtotal + order.delivery_fee
    order.release_at = None
    if restock:
        _release_stock(order)
    order.save()
    transaction.on_commit(lambda: send_refund(order.pk))


def send_refund(order_id):
    """
    Ask Paystack to return the buyer's money. Safe to repeat: a refund Paystack already holds is adopted,
    never sent twice. On failure the order stays 'refund on its way' and the admins are told.
    """
    from .refunds import PaystackRefundError, PaystackUnavailable, create_paystack_refund, find_paystack_refund
    order = MerchOrder.objects.select_related('seller').get(pk=order_id)
    if order.status != MerchOrder.REFUND_PROCESSING or order.paystack_refund_id:
        return order
    try:
        found = find_paystack_refund(order.paystack_reference) or create_paystack_refund(
            order.paystack_reference, order.refund_amount, f'Merch order {order.ref}')
    except (PaystackRefundError, PaystackUnavailable) as exc:
        order.refund_failure = str(exc)[:500]
        order.save(update_fields=['refund_failure', 'updated_at'])
        from .notifications import notify_admins
        notify_admins('refunds_pending', f"Merch refund to send for {order.ref}", body=order.refund_failure[:200], link='/refunds')
        logger.warning('Merch refund for %s did not go through: %s', order.ref, exc)
        return order
    order.paystack_refund_id = str(found.get('id') or '')[:64]
    order.refund_failure = ''
    order.save(update_fields=['paystack_refund_id', 'refund_failure', 'updated_at'])
    if str(found.get('status')) == 'processed':
        _finish_refund(order)
    _email(order, 'refunded')
    return order


def _finish_refund(order):
    MerchOrder.objects.filter(pk=order.pk, status=MerchOrder.REFUND_PROCESSING).update(
        status=MerchOrder.REFUNDED, refunded_at=timezone.now())


def apply_refund_webhook(event_type, data):
    """Paystack tells us a merch refund ended. True if the reference was a merch order."""
    reference = data.get('transaction_reference') or (data.get('transaction') or {}).get('reference')
    order = MerchOrder.objects.filter(paystack_reference=reference).first() if reference else None
    if order is None:
        return False
    status = data.get('status') or event_type.split('.', 1)[-1]
    if status == 'processed':
        _finish_refund(order)
    elif status in ('failed', 'needs-attention'):
        order.refund_failure = (data.get('message') or 'Paystack reported the refund failed')[:500]
        order.save(update_fields=['refund_failure', 'updated_at'])
    return True


# ---------------------------------------------------------------------------
# Time-based work (run by `manage.py process_merch_orders`)
# ---------------------------------------------------------------------------

def process_due_orders(now=None):
    """Free held stock, nudge organisers about unstarted orders, cancel the ones left too long, retry refunds."""
    now = now or timezone.now()
    release_stale_reservations()
    summary = {'reminded': 0, 'cancelled': 0, 'refunds_retried': 0, 'released': 0}

    for order in MerchOrder.objects.filter(status=MerchOrder.PAID, paid_at__lte=now - timedelta(days=AUTO_CANCEL_DAYS)):
        try:
            with transaction.atomic():
                locked = MerchOrder.objects.select_for_update().get(pk=order.pk)
                if locked.status == MerchOrder.PAID:
                    _start_refund(locked, "The seller didn't get to your order in time, so we refunded you.", restock=True)
                    summary['cancelled'] += 1
        except Exception:
            logger.exception('Could not auto-cancel merch order %s', order.pk)

    remind = MerchOrder.objects.filter(
        status=MerchOrder.PAID, reminded_at__isnull=True, paid_at__lte=now - timedelta(days=REMIND_AFTER_DAYS))
    for order in remind:
        MerchOrder.objects.filter(pk=order.pk).update(reminded_at=now)
        _email(order, 'waiting')
        summary['reminded'] += 1

    summary['released'] = announce_releases(now)

    # Only ones that have had a few minutes to go out by themselves and did not.
    stuck = MerchOrder.objects.filter(
        status=MerchOrder.REFUND_PROCESSING, paystack_refund_id='', cancelled_at__lte=now - timedelta(minutes=5))
    for order in stuck:
        send_refund(order.pk)
        summary['refunds_retried'] += 1
    return summary


def announce_releases(now=None):
    """Tell organisers when an order's earnings have become available. Once per order."""
    from .notifications import notify
    now = now or timezone.now()
    due = (MerchOrder.objects.filter(status__in=LIVE, release_at__lte=now, released_notified_at__isnull=True)
           .exclude(reported_at__isnull=False, report_resolved_at__isnull=True).select_related('seller'))
    count = 0
    for order in due:
        MerchOrder.objects.filter(pk=order.pk, released_notified_at__isnull=True).update(released_notified_at=now)
        first = order.buyer_name.split(' ')[0] if order.buyer_name else 'the buyer'
        notify(order.seller, 'merch_released', f"₦{order.earnings:,.0f} from order {order.ref} is now available",
               body=f"{first} didn't report a problem. Withdraw it from Payouts.", link='/dashboard/payouts')
        count += 1
    return count


# ---------------------------------------------------------------------------
# The organiser's merch money
# ---------------------------------------------------------------------------

_EARNINGS = ExpressionWrapper(
    F('subtotal') - F('service_fee') + F('delivery_fee'),
    output_field=DecimalField(max_digits=12, decimal_places=2),
)


def _sum(qs):
    return qs.aggregate(total=Coalesce(Sum(_EARNINGS), Decimal('0')))['total']


def balances(user):
    """
    Merch earnings in four buckets (naira): `available` can be withdrawn now; `releasing` is complete and
    waiting out its window; `on_hold` has an open problem; `not_released` is still to be fulfilled.
    """
    now = timezone.now()
    live = MerchOrder.objects.filter(seller=user, status__in=LIVE)
    held = Q(reported_at__isnull=False, report_resolved_at__isnull=True)
    free = live.exclude(held)
    return {
        'available': _money(_sum(free.filter(release_at__lte=now))),
        'releasing': _money(_sum(free.filter(release_at__gt=now))),
        'on_hold': _money(_sum(live.filter(held))),
        'not_released': _money(_sum(free.filter(release_at__isnull=True))),
    }


def available_earnings(user):
    return balances(user)['available']


def next_release_at(user):
    """When the next merch earnings become available, or None."""
    now = timezone.now()
    live = MerchOrder.objects.filter(seller=user, status__in=LIVE, release_at__gt=now)
    return live.exclude(reported_at__isnull=False, report_resolved_at__isnull=True).order_by('release_at').values_list('release_at', flat=True).first()


# ---------------------------------------------------------------------------
# Email hook
# ---------------------------------------------------------------------------

def _email(order, kind):
    """Order emails. A mail problem must never undo or block an order step."""
    if not kind:
        return
    try:
        from .merch_emails import send_order_email
        send_order_email(order, kind)
    except Exception:
        logger.exception('Could not send merch %s email for order %s', kind, getattr(order, 'pk', '?'))
