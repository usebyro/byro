"""
Merch orders over HTTP.

Buyers (no account needed; the order's token is their key)
  POST /api/merch-orders/checkout/                 start an order and a Paystack payment
  GET  /api/merch-orders/verify/<reference>/       after paying: confirm with Paystack
  GET  /api/merch-orders/<ref>/?token=             the buyer's order page
  POST /api/merch-orders/<ref>/confirm/            "I received it" / "I collected it"
  POST /api/merch-orders/<ref>/report/             report a problem

Organisers
  GET/PUT /api/dashboard/merch-orders/fulfilment/  pickup address, delivery on or off, area and fee
  GET     /api/dashboard/merch-orders/             the orders, filtered, with counts and the merch money
  GET     /api/dashboard/merch-orders/<ref>/       one order in full
  POST    /api/dashboard/merch-orders/<ref>/action/ pack, ship, ready, picked_up, delivered, cancel, cant_deliver
  POST    /api/dashboard/merch-orders/bulk/        the same step for several orders
  GET     /api/dashboard/merch-orders/balance/     the merch money and the orders behind it

Byro admins
  GET  /api/admin/merch-orders/held/               orders with an open problem
  POST /api/admin/merch-orders/<ref>/resolve/      release the earnings, or refund the buyer
"""
import logging
from datetime import timedelta

import requests
from django.conf import settings
from django.db.models import Q
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from . import merch
from .merch import MerchError
from .models import AdminMember, MerchOrder, UserProfile
from .permissions import IsAdminMember

logger = logging.getLogger(__name__)

NEED = (MerchOrder.PAID, MerchOrder.PACKED)
MIDWAY = (MerchOrder.READY, MerchOrder.SHIPPED)
FILTERS = {
    'need': lambda q: q.filter(status__in=NEED),
    'shipped': lambda q: q.filter(status__in=MIDWAY),
    'done': lambda q: q.filter(status__in=merch.DONE),
    'all': lambda q: q,
}
VISIBLE = [s for s, _ in MerchOrder.STATUS_CHOICES if s not in (MerchOrder.PENDING, MerchOrder.FAILED)]


def _fail(error):
    return Response({'error': error.message}, status=error.status)


def _order_by_ref(ref, **filters):
    """BY-0007 -> the order, or None."""
    try:
        pk = int(str(ref).upper().replace('BY-', '', 1))
    except ValueError:
        return None
    return (MerchOrder.objects.select_related('seller', 'seller__profile').prefetch_related('lines')
            .filter(pk=pk, **filters).first())


def _site():
    fallback = 'http://localhost:3000' if settings.DEBUG else 'https://usebyro.com'
    return (getattr(settings, 'FRONTEND_URL', None) or fallback).rstrip('/')


def _steps(order):
    """The timeline: (key, label, when) for each step this kind of order goes through."""
    if order.is_pickup:
        steps = [('paid', 'Paid', order.paid_at), ('ready', 'Ready for pickup', order.ready_at), ('picked_up', 'Picked up', order.picked_up_at)]
    else:
        steps = [('paid', 'Paid', order.paid_at), ('packed', 'Packed', order.packed_at),
                 ('shipped', 'Shipped', order.shipped_at), ('delivered', 'Delivered', order.delivered_at)]
    return [{'key': k, 'label': l, 'at': at} for k, l, at in steps]


def _lines(order):
    return [{'name': l.name, 'option': l.option, 'quantity': l.quantity,
             'unit_price': str(l.unit_price), 'total': str(l.total)} for l in order.lines.all()]


def _release_state(order):
    """For the organiser: where this order's earnings are."""
    if order.status not in merch.LIVE:
        return 'none'
    if order.on_hold:
        return 'on_hold'
    if order.release_at is None:
        return 'not_released'
    return 'available' if order.release_at <= timezone.now() else 'releasing'


def _seller_info(order):
    profile = getattr(order.seller, 'profile', None)
    return {
        'name': (profile.display_name if profile and profile.display_name else '') or order.seller.email,
        'handle': profile.handle if profile else None,
    }


def buyer_payload(order, include_code=True):
    profile = getattr(order.seller, 'profile', None)
    can_report = (
        order.status in merch.LIVE and not order.on_hold
        and (order.release_at is None or order.release_at > timezone.now())
    )
    return {
        'ref': order.ref, 'status': order.status, 'fulfilment': order.fulfilment,
        'seller': _seller_info(order), 'items': _lines(order),
        'subtotal': str(order.subtotal), 'delivery_fee': str(order.delivery_fee), 'amount': str(order.amount),
        'refund_amount': str(order.refund_amount), 'cancel_reason': order.cancel_reason,
        'paid_at': order.paid_at, 'steps': _steps(order),
        'pickup': {'address': profile.pickup_address if profile else '', 'instructions': profile.pickup_instructions if profile else ''}
        if order.is_pickup else None,
        'pickup_code': order.pickup_code if include_code and order.is_pickup and order.status in (MerchOrder.READY, MerchOrder.PICKED_UP) else None,
        'delivery': {'name': order.buyer_name, 'phone': order.buyer_phone, 'address': order.delivery_address}
        if not order.is_pickup else None,
        'courier': order.courier, 'tracking': order.tracking,
        'problem': {'reason': order.report_reason, 'at': order.reported_at, 'resolved': order.report_resolved_at is not None,
                    'outcome': order.report_outcome} if order.reported_at else None,
        'can_report': can_report, 'report_until': order.release_at if can_report else None,
        'can_confirm': (order.is_pickup and order.status == MerchOrder.READY) or (not order.is_pickup and order.status == MerchOrder.SHIPPED),
    }


def seller_payload(order, detail=False):
    now = timezone.now()
    first = order.buyer_name.split(' ')[0] if order.buyer_name else ''
    data = {
        'ref': order.ref, 'status': order.status, 'fulfilment': order.fulfilment,
        'buyer': {'name': order.buyer_name, 'first': first},
        'items': _lines(order), 'subtotal': str(order.subtotal), 'amount': str(order.amount),
        'paid_at': order.paid_at, 'days_waiting': (now - order.paid_at).days if order.paid_at else 0,
        'on_hold': order.on_hold, 'release_state': _release_state(order), 'release_at': order.release_at,
        'late': _is_late(order, now),
        'auto_cancel_on': (order.paid_at + timedelta(days=merch.AUTO_CANCEL_DAYS)) if order.status == MerchOrder.PAID and order.paid_at else None,
        'out_of_stock': False,
    }
    if detail:
        profile = getattr(order.seller, 'profile', None)
        data.update({
            'buyer': {'name': order.buyer_name, 'first': first, 'email': order.buyer_email, 'phone': order.buyer_phone, 'note': order.buyer_note},
            'delivery_address': order.delivery_address, 'courier': order.courier, 'tracking': order.tracking,
            'pickup': {'address': profile.pickup_address if profile else '', 'instructions': profile.pickup_instructions if profile else ''}
            if order.is_pickup else None,
            'pickup_code': order.pickup_code if order.is_pickup else None,
            'delivery_fee': str(order.delivery_fee), 'fee_rate': str(order.fee_rate), 'fee': str(order.service_fee),
            'earnings': str(order.earnings), 'refund_amount': str(order.refund_amount), 'cancel_reason': order.cancel_reason,
            'steps': _steps(order),
            'problem': {'reason': order.report_reason, 'note': order.report_note, 'at': order.reported_at,
                        'resolved': order.report_resolved_at is not None, 'outcome': order.report_outcome} if order.reported_at else None,
            'can_cancel': order.status in (MerchOrder.PAID, MerchOrder.PACKED, MerchOrder.READY),
            'can_cant_deliver': order.status == MerchOrder.SHIPPED,
        })
    return data


def _is_late(order, now):
    """Orders waiting longer than they should: calm flags in the list."""
    if order.status in NEED and order.paid_at and (now - order.paid_at).days >= 3:
        return f"Waiting {(now - order.paid_at).days} days" if not order.is_pickup else f"Waiting {(now - order.paid_at).days} days to get ready"
    if order.status == MerchOrder.READY and order.ready_at and (now - order.ready_at).days >= 14:
        return f"Not collected after {(now - order.ready_at).days} days"
    if order.status == MerchOrder.SHIPPED and order.shipped_at and (now - order.shipped_at).days >= 10:
        return f"Not delivered after {(now - order.shipped_at).days} days"
    return ''


# ---------------------------------------------------------------------------
# Buyers
# ---------------------------------------------------------------------------

class MerchCheckoutView(APIView):
    """Start an order and a Paystack payment. Anyone can buy; the seller is named by their page handle."""
    permission_classes = [AllowAny]
    throttle_scope = 'merch_checkout'

    def post(self, request):
        d = request.data
        profile = UserProfile.objects.select_related('user').filter(handle=str(d.get('handle') or '')).first()
        if profile is None or not profile.is_public and request.user != profile.user:
            return Response({'error': 'We could not find that seller.'}, status=status.HTTP_404_NOT_FOUND)
        try:
            order = merch.create_order(
                profile.user, d.get('items'), d.get('fulfilment'), buyer=request.user,
                name=d.get('name'), email=d.get('email'), phone=d.get('phone'),
                address=d.get('address'), note=d.get('note'),
            )
        except MerchError as e:
            return _fail(e)

        callback = f"{_site()}/merch-order/{order.ref}?token={order.access_token}"
        payload = {
            'email': order.buyer_email, 'amount': int(order.amount * 100), 'reference': order.paystack_reference,
            'currency': 'NGN', 'channels': ['card', 'bank', 'ussd', 'bank_transfer', 'mobile_money', 'qr'],
            'metadata': {'merch_order': order.ref, 'seller': profile.handle, 'fulfilment': order.fulfilment},
            'callback_url': callback,
        }
        try:
            res = requests.post(
                f'{settings.PAYSTACK_API_BASE}/transaction/initialize', json=payload, timeout=30,
                headers={'Authorization': f'Bearer {settings.PAYSTACK_SECRET_KEY.strip()}', 'Content-Type': 'application/json'},
            )
            body = res.json()
        except (requests.RequestException, ValueError) as e:
            merch.fail_order(order)
            logger.error('Paystack initialize failed for merch order %s: %s', order.ref, e)
            return Response({'error': "We couldn't reach our payment provider. You haven't been charged. Try again in a minute."},
                            status=status.HTTP_503_SERVICE_UNAVAILABLE)
        if res.status_code != 200 or not body.get('status'):
            merch.fail_order(order)
            logger.error('Paystack refused merch order %s: %s', order.ref, body.get('message'))
            return Response({'error': "We couldn't start your payment. You haven't been charged. Try again in a minute."},
                            status=status.HTTP_400_BAD_REQUEST)
        order.paystack_access_code = body['data'].get('access_code', '')
        order.save(update_fields=['paystack_access_code', 'updated_at'])
        return Response({
            'authorization_url': body['data']['authorization_url'], 'reference': order.paystack_reference,
            'ref': order.ref, 'token': order.access_token, 'amount': str(order.amount),
        }, status=status.HTTP_200_OK)


class MerchVerifyView(APIView):
    """After the buyer pays, Paystack sends them back and the page calls this to confirm the money arrived."""
    permission_classes = [AllowAny]
    throttle_scope = 'merch_checkout'

    def get(self, request, reference):
        from .views import _paid_amount_ok, _paystack_transaction
        order = MerchOrder.objects.select_related('seller', 'seller__profile').prefetch_related('lines').filter(paystack_reference=reference).first()
        if order is None:
            return Response({'error': 'We could not find that order.'}, status=status.HTTP_404_NOT_FOUND)
        if order.status not in (MerchOrder.PENDING, MerchOrder.FAILED):
            return Response({'status': 'success', 'order': buyer_payload(order), 'token': order.access_token})
        data, err = _paystack_transaction(reference)
        if err:
            return Response({'error': ("We couldn't confirm your payment yet. If you were charged, contact "
                                       f"support@usebyro.com with reference {reference}.")}, status=status.HTTP_400_BAD_REQUEST)
        txn = data.get('status')
        if txn == 'success':
            if not _paid_amount_ok(int(data.get('amount') or 0), int(order.amount * 100)):
                logger.error('Merch amount mismatch for %s: paystack=%s expected=%s', reference, data.get('amount'), order.amount)
                return Response({'error': ("We couldn't confirm your payment. Contact support@usebyro.com "
                                           f"with reference {reference} and we'll sort it out.")}, status=status.HTTP_400_BAD_REQUEST)
            order, _ = merch.mark_paid(order, data.get('channel') or '')
            order = _order_by_ref(order.ref)
            return Response({'status': 'success', 'order': buyer_payload(order), 'token': order.access_token})
        if txn in ('failed', 'reversed'):
            merch.fail_order(order)
            return Response({'status': 'failed', 'message': 'Payment was not successful'}, status=status.HTTP_400_BAD_REQUEST)
        return Response({'status': 'processing',
                         'message': "Your payment hasn't gone through yet. If you finished paying, refresh in a minute."},
                        status=status.HTTP_202_ACCEPTED)


class _BuyerOrderView(APIView):
    permission_classes = [AllowAny]
    throttle_scope = 'merch_order'

    def order(self, request, ref):
        token = request.query_params.get('token') or request.data.get('token') or ''
        order = _order_by_ref(ref)
        # One answer for "no such order" and "wrong token", so a ref can't be probed.
        if order is None or not token or token != order.access_token or order.status in (MerchOrder.PENDING, MerchOrder.FAILED):
            return None
        return order


class MerchBuyerOrderView(_BuyerOrderView):
    def get(self, request, ref):
        order = self.order(request, ref)
        if order is None:
            return Response({'error': 'We could not find that order.'}, status=status.HTTP_404_NOT_FOUND)
        return Response(buyer_payload(order))


class MerchBuyerConfirmView(_BuyerOrderView):
    def post(self, request, ref):
        order = self.order(request, ref)
        if order is None:
            return Response({'error': 'We could not find that order.'}, status=status.HTTP_404_NOT_FOUND)
        try:
            merch.confirm_by_buyer(order)
        except MerchError as e:
            return _fail(e)
        return Response(buyer_payload(_order_by_ref(ref)))


class MerchBuyerReportView(_BuyerOrderView):
    def post(self, request, ref):
        order = self.order(request, ref)
        if order is None:
            return Response({'error': 'We could not find that order.'}, status=status.HTTP_404_NOT_FOUND)
        try:
            merch.report_problem(order, str(request.data.get('reason') or ''), request.data.get('note') or '')
        except MerchError as e:
            return _fail(e)
        return Response(buyer_payload(_order_by_ref(ref)))


# ---------------------------------------------------------------------------
# Organisers
# ---------------------------------------------------------------------------

class MerchFulfilmentView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(merch.fulfilment_settings(request.user))

    def put(self, request):
        from .merch_emails import send_order_email
        before = merch.fulfilment_settings(request.user)
        try:
            settings_now, open_pickups = merch.save_fulfilment(request.user, request.data)
        except MerchError as e:
            return _fail(e)
        moved = (before['pickup_address'], before['pickup_instructions']) != (settings_now['pickup_address'], settings_now['pickup_instructions'])
        if moved and before['pickup_address']:
            for order in open_pickups:
                try:
                    send_order_email(order, 'moved')
                except Exception:
                    logger.exception('Could not send the pickup-moved email for %s', order.ref)
        return Response({**settings_now, 'told_buyers': len(open_pickups) if moved and before['pickup_address'] else 0})


class MerchOrdersView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        base = MerchOrder.objects.filter(seller=request.user, status__in=VISIBLE).select_related('seller', 'seller__profile').prefetch_related('lines')
        which = request.query_params.get('filter') or 'need'
        q = (request.query_params.get('q') or '').strip()
        rows = base
        if q:
            rows = rows.filter(Q(buyer_name__icontains=q) | Q(pk__in=_pk_from_ref(q)))
        else:
            rows = FILTERS.get(which, FILTERS['need'])(rows)
        counts = {k: fn(base).count() for k, fn in FILTERS.items()}
        return Response({
            'results': [seller_payload(o) for o in rows.order_by('-paid_at', '-pk')[:200]],
            'counts': counts,
            'money': {k: str(v) for k, v in merch.balances(request.user).items()},
        })


def _pk_from_ref(text):
    digits = ''.join(c for c in text if c.isdigit())
    return [int(digits)] if digits and text.upper().replace('BY-', '').replace('-', '').strip().isdigit() else []


class MerchOrderDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, ref):
        order = _order_by_ref(ref, seller=request.user, status__in=VISIBLE)
        if order is None:
            return Response({'error': 'Order not found.'}, status=status.HTTP_404_NOT_FOUND)
        return Response(seller_payload(order, detail=True))


def _apply(order, action, data):
    if action == 'cancel':
        return merch.cancel(order, data.get('reason'))
    if action == 'cant_deliver':
        return merch.cant_deliver(order, data.get('reason'))
    return merch.advance(order, action, courier=data.get('courier') or '', tracking=data.get('tracking') or '', code=data.get('code') or '')


class MerchOrderActionView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, ref):
        order = _order_by_ref(ref, seller=request.user, status__in=VISIBLE)
        if order is None:
            return Response({'error': 'Order not found.'}, status=status.HTTP_404_NOT_FOUND)
        try:
            _apply(order, str(request.data.get('action') or ''), request.data)
        except MerchError as e:
            return _fail(e)
        return Response(seller_payload(_order_by_ref(ref), detail=True))


class MerchOrderBulkView(APIView):
    """The same step for several orders of the same kind and at the same point."""
    permission_classes = [IsAuthenticated]
    BULK = ('pack', 'ship', 'ready')

    def post(self, request):
        action = str(request.data.get('action') or '')
        refs = request.data.get('refs')
        if action not in self.BULK or not isinstance(refs, list) or not refs or len(refs) > 100:
            return Response({'error': 'Choose a step and up to 100 orders.'}, status=status.HTTP_400_BAD_REQUEST)
        done, failed = [], []
        for ref in refs:
            order = _order_by_ref(ref, seller=request.user, status__in=VISIBLE)
            if order is None:
                failed.append({'ref': ref, 'error': 'Order not found.'})
                continue
            try:
                _apply(order, action, {'courier': request.data.get('courier') or ''})
                done.append(order.ref)
            except MerchError as e:
                failed.append({'ref': order.ref, 'error': e.message})
        return Response({'done': done, 'failed': failed}, status=status.HTTP_200_OK if done or not failed else status.HTTP_409_CONFLICT)


class MerchBalanceView(APIView):
    """The merch money in four buckets, and the orders behind the held ones, for the Payouts page."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        held = (MerchOrder.objects.filter(seller=request.user, status__in=merch.LIVE)
                .filter(Q(reported_at__isnull=False, report_resolved_at__isnull=True) | Q(release_at__isnull=True) | Q(release_at__gt=timezone.now()))
                .select_related('seller', 'seller__profile').prefetch_related('lines').order_by('release_at', 'pk'))
        rows = [seller_payload(o) | {'earnings': str(o.earnings)} for o in held[:50]]
        return Response({'merch': {k: str(v) for k, v in merch.balances(request.user).items()}, 'orders': rows, 'order_count': held.count()})


# ---------------------------------------------------------------------------
# Byro admins
# ---------------------------------------------------------------------------

class AdminMerchHeldView(APIView):
    permission_classes = [IsAdminMember]

    def get(self, request):
        held = (MerchOrder.objects.filter(reported_at__isnull=False, report_resolved_at__isnull=True)
                .select_related('seller', 'seller__profile').prefetch_related('lines').order_by('reported_at'))
        return Response({'results': [seller_payload(o, detail=True) | {'seller': _seller_info(o)} for o in held]})


class AdminMerchRefundView(APIView):
    """Refund one order outside the problem flow. Admins and owners only."""
    permission_classes = [IsAdminMember]
    min_role = AdminMember.ROLE_ADMIN

    def post(self, request, ref):
        order = _order_by_ref(ref)
        if order is None:
            return Response({'error': 'Order not found.'}, status=status.HTTP_404_NOT_FOUND)
        try:
            merch.admin_refund(order, request.data.get('reason'))
        except MerchError as e:
            return _fail(e)
        return Response(seller_payload(_order_by_ref(ref), detail=True))


class AdminMerchResolveView(APIView):
    permission_classes = [IsAdminMember]
    min_role = AdminMember.ROLE_ADMIN

    def post(self, request, ref):
        order = _order_by_ref(ref)
        if order is None:
            return Response({'error': 'Order not found.'}, status=status.HTTP_404_NOT_FOUND)
        try:
            merch.resolve_report(order, str(request.data.get('outcome') or ''))
        except MerchError as e:
            return _fail(e)
        return Response(seller_payload(_order_by_ref(ref), detail=True))
