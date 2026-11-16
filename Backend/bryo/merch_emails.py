"""
Merch order emails, built on the same pieces as the rest of Byro's mail.

To the buyer: receipt (pickup or delivery), ready for pickup, shipped, refunded, pickup address changed.
To the organiser: a buyer reported a problem, and an order has waited too long.
"""
from datetime import timedelta

from django.conf import settings

from . import emails as E
from .emails import _btn, _btn_row, _first, _h, _lead, _money, _rows, _shell, _small, _badge


def _site():
    fallback = 'http://localhost:3000' if settings.DEBUG else 'https://usebyro.com'
    return (getattr(settings, 'FRONTEND_URL', None) or fallback).rstrip('/')


def order_url(order):
    """The buyer's own page for this order. The token is the key, so the link is only ever sent to them."""
    return f"{_site()}/merch-order/{order.ref}?token={order.access_token}"


def dashboard_url(order=None):
    return f"{_site()}/dashboard/merch?tab=orders"


def _seller_name(order):
    profile = getattr(order.seller, 'profile', None)
    return (profile.display_name if profile and profile.display_name else '') or order.seller.get_full_name() or order.seller.email


def _lines_text(order):
    return ', '.join(f"{l.name}{' (' + l.option + ')' if l.option else ''}{' x' + str(l.quantity) if l.quantity > 1 else ''}" for l in order.lines.all())


def _item_rows(order):
    rows = [(f"{_h(l.name)}{' (' + _h(l.option) + ')' if l.option else ''} x{l.quantity}", _money(l.total)) for l in order.lines.all()]
    rows.append(('Delivery' if not order.is_pickup else 'Pickup', _money(order.delivery_fee) if order.delivery_fee else 'Free'))
    return rows


def _pickup_info(order):
    profile = getattr(order.seller, 'profile', None)
    address = profile.pickup_address if profile else ''
    instructions = profile.pickup_instructions if profile else ''
    return address, instructions


def _wrap(badge, headline, body_html, footer, preheader, subject, text):
    return {'subject': subject, 'html': _shell(badge, headline, body_html, footer, preheader=preheader), 'text': text}


def _buyer_footer(order):
    return f"You&#8217;re getting this because you bought merch from {_h(_seller_name(order))} on Byro."


def _seller_footer(order):
    return f"You&#8217;re getting this because you sell merch on Byro as {_h(_seller_name(order))}."


# ---------------------------------------------------------------------------
# To the buyer
# ---------------------------------------------------------------------------

def receipt_email(order):
    seller = _seller_name(order)
    if order.is_pickup:
        address, instructions = _pickup_info(order)
        where = _rows([('Pick up from', f"{_h(address)}")]) + (_small(_h(instructions)) if instructions else '')
        lead = f"{_h(seller)} is getting your items ready. We&#8217;ll email you when you can collect them, with a short pickup code to show."
        text_where = f"Pick up from: {address}\n{instructions}\n"
    else:
        where = _rows([('Delivering to', f"{_h(order.buyer_name)}<br>{_h(order.delivery_address)}".replace('\n', '<br>'))])
        lead = f"{_h(seller)} is packing your order. We&#8217;ll email you when it ships, with tracking if the organiser adds it."
        text_where = f"Delivering to: {order.buyer_name}, {order.delivery_address}\n"
    body = (
        _lead(lead) + where + _rows(_item_rows(order) + [('Paid', _money(order.amount))])
        + _btn_row(_btn(order_url(order), 'View your order'))
        + _small(f"Order {order.ref}. Keep this email as your receipt. Questions about your order? Message {_h(seller)} from your order page.")
    )
    text = (
        f"Thanks, {_first(order.buyer_name)}. Your order {order.ref} from {seller} is in.\n\n{text_where}\n"
        f"Items: {_lines_text(order)}\nPaid: {_money(order.amount)}\n\nView your order: {order_url(order)}\n"
        "\nByro Team\nsupport@usebyro.com"
    )
    return _wrap('', f"Thanks, {_h(_first(order.buyer_name))}. Your order is in.", body, _buyer_footer(order),
                 f"Order {order.ref} from {seller}.", f"Your order {order.ref} from {seller}", text)


def ready_email(order):
    address, instructions = _pickup_info(order)
    seller = _seller_name(order)
    code_box = (
        f'<p style="margin:0 0 6px;font-size:13px;font-weight:700;color:{E.MUTED};">Your pickup code</p>'
        f'<p style="margin:0 0 6px;font-size:40px;font-weight:800;letter-spacing:.14em;color:{E.INK};">{_h(order.pickup_code)}</p>'
        f'<p style="margin:0 0 20px;font-size:14px;color:{E.MUTED};">Show this code or your order number, {order.ref}, when you collect.</p>'
    )
    body = (
        _lead(f"Your {_h(_lines_text(order))} from {_h(seller)} are waiting for you.") + code_box
        + _rows([('Pick up from', _h(address))]) + (_small(_h(instructions)) if instructions else '')
        + _btn_row(_btn(order_url(order), 'View your order'), _btn(E._maps_link(address), 'Open in Maps', primary=False))
        + _small('Can&#8217;t make it, or something&#8217;s wrong? Use Report a problem on your order page.')
    )
    text = (
        f"Your order {order.ref} is ready to collect.\n\nPickup code: {order.pickup_code}\n"
        f"Show this code or your order number when you collect.\n\nPick up from: {address}\n{instructions}\n\n"
        f"View your order: {order_url(order)}\n\nByro Team\nsupport@usebyro.com"
    )
    return _wrap('', 'Your order is ready to collect', body, _buyer_footer(order),
                 f"Bring code {order.pickup_code} to collect it.", f"Your order {order.ref} is ready to collect", text)


def shipped_email(order):
    seller = _seller_name(order)
    rows = []
    if order.courier:
        rows.append(('Courier', _h(order.courier)))
    if order.tracking:
        rows.append(('Tracking number', _h(order.tracking)))
    body = (
        _lead(f"{_h(seller)} sent your order. Most deliveries arrive within a few days.")
        + (_rows(rows) if rows else '')
        + _btn_row(_btn(order_url(order), 'View your order'))
        + _small('Once it arrives, tap I received it on your order page. If it doesn&#8217;t arrive or something&#8217;s wrong, use Report a problem there.')
    )
    text = (
        f"Your order {order.ref} is on the way.\n\n"
        + (f"Courier: {order.courier}\n" if order.courier else '') + (f"Tracking number: {order.tracking}\n" if order.tracking else '')
        + f"\nView your order: {order_url(order)}\n\nByro Team\nsupport@usebyro.com"
    )
    return _wrap('', 'Your order is on the way', body, _buyer_footer(order),
                 f"{seller} sent your order.", f"Your order {order.ref} is on the way", text)


def _marked_email(order, headline, subject, lead_text, plain):
    """Sent when the organiser marks an order delivered or collected on their own, so the buyer can object in time."""
    seller = _seller_name(order)
    body = (
        _lead(lead_text.format(seller=_h(seller)))
        + _btn_row(_btn(order_url(order), 'View your order'))
        + _small('If this isn&#8217;t right, open your order and tap Report a problem within a few days, before the money is released to the seller.')
    )
    text = (
        f"{plain.format(seller=seller)}\n\nIf this isn't right, open your order and use Report a problem "
        f"within a few days, before the money is released to the seller.\n\nView your order: {order_url(order)}\n\nByro Team\nsupport@usebyro.com"
    )
    return _wrap('', headline, body, _buyer_footer(order), headline, f"{subject} {order.ref}", text)


def delivered_email(order):
    return _marked_email(order, 'Your order is marked delivered', 'Your order is marked delivered:',
                         '{seller} marked your order as delivered. If it has arrived, there is nothing to do.',
                         '{seller} marked your order as delivered. If it has arrived, there is nothing to do.')


def collected_email(order):
    return _marked_email(order, 'Your order is marked collected', 'Your order is marked collected:',
                         '{seller} marked your order as collected. If you have it, there is nothing to do.',
                         '{seller} marked your order as collected. If you have it, there is nothing to do.')


def refunded_email(order):
    seller = _seller_name(order)
    reason = (
        f'<div style="margin:0 0 20px;padding:12px 14px;border-left:3px solid #E0A100;background:#FFFAEB;border-radius:0 12px 12px 0;font-size:15px;line-height:1.55;">'
        f'<span style="display:block;font-size:13px;font-weight:700;color:#8A4B00;">From {_h(seller)}</span>&ldquo;{_h(order.cancel_reason)}&rdquo;</div>'
    ) if order.cancel_reason else ''
    rows = [(f"{_h(l.name)}{' (' + _h(l.option) + ')' if l.option else ''}", _money(l.total)) for l in order.lines.all()]
    if order.delivery_fee:
        rows.append(('Delivery', _money(order.delivery_fee)))
    rows.append(('Refunded', _money(order.refund_amount)))
    body = (
        _lead(f"{_h(seller)} cancelled order {order.ref}, and we&#8217;ve refunded you.") + reason + _rows(rows)
        + _lead('It goes back to the card or bank account you paid with. Banks usually show it within 3 to 10 working days. The payment charge can&#8217;t be refunded.')
        + _btn_row(_btn(order_url(order), 'View your order', primary=False))
    )
    text = (
        f"Your order {order.ref} was cancelled and refunded.\n\n" + (f"From {seller}: {order.cancel_reason}\n\n" if order.cancel_reason else '')
        + f"Refunded: {_money(order.refund_amount)}\nIt goes back to the card or bank account you paid with. "
        "Banks usually show it within 3 to 10 working days. The payment charge can't be refunded.\n\nByro Team\nsupport@usebyro.com"
    )
    return _wrap('', 'Your order was cancelled', body, _buyer_footer(order),
                 f"{_money(order.refund_amount)} is on its way back to you.", f"Your order {order.ref} was cancelled and refunded", text)


def pickup_moved_email(order):
    address, instructions = _pickup_info(order)
    seller = _seller_name(order)
    body = (
        _lead(f"{_h(seller)} changed where you collect order {order.ref}. Your pickup code stays the same.")
        + _rows([('New address', _h(address))]) + (_small(_h(instructions)) if instructions else '')
        + _btn_row(_btn(order_url(order), 'View your order'))
        + _small('If the new address doesn&#8217;t work for you, use Report a problem on your order page.')
    )
    text = (
        f"{seller} changed where you collect order {order.ref}. Your pickup code stays the same.\n\n"
        f"New address: {address}\n{instructions}\n\nView your order: {order_url(order)}\n\nByro Team\nsupport@usebyro.com"
    )
    return _wrap('', 'Your pickup address has changed', body, _buyer_footer(order),
                 f"{seller} moved pickup.", 'New pickup address for your order', text)


# ---------------------------------------------------------------------------
# To the organiser
# ---------------------------------------------------------------------------

_REASONS = {'not_received': 'Not received', 'wrong_item': 'Wrong item', 'damaged': 'Damaged', 'other': 'Other'}


def problem_email(order):
    first = _first(order.buyer_name)
    note = (
        f'<div style="margin:0 0 20px;padding:12px 14px;border-left:3px solid #E0A100;background:#FFFAEB;border-radius:0 12px 12px 0;font-size:15px;line-height:1.55;">'
        f'<span style="display:block;font-size:13px;font-weight:700;color:#8A4B00;">{_h(_REASONS.get(order.report_reason, order.report_reason))}</span>'
        f'&ldquo;{_h(order.report_note)}&rdquo;</div>'
    ) if order.report_note else f'<p style="margin:0 0 20px;font-size:15px;font-weight:700;">{_h(_REASONS.get(order.report_reason, order.report_reason))}</p>'
    body = (
        _lead(f"{_h(first)} reported a problem with order {order.ref} ({_h(_lines_text(order))}).") + note
        + _lead(f"The {_money(order.earnings)} you&#8217;d get for this order is on hold while Byro reviews it. We&#8217;ll email you and {_h(first)} within 2 working days. "
                "If you have proof of delivery, like a rider&#8217;s photo or a signed waybill, reply to this email with it.")
        + _btn_row(_btn(dashboard_url(order), 'Open the order'))
    )
    text = (
        f"{first} reported a problem with order {order.ref}.\n\n{_REASONS.get(order.report_reason, order.report_reason)}: {order.report_note}\n\n"
        f"The {_money(order.earnings)} for this order is on hold while Byro reviews it. We'll email you and {first} within 2 working days. "
        "If you have proof of delivery, reply to this email with it.\n\nByro Team\nsupport@usebyro.com"
    )
    return _wrap('', f"{_h(first)} reported a problem", body, _seller_footer(order),
                 f"{_money(order.earnings)} is on hold.", f"{first} reported a problem with order {order.ref}", text)


def waiting_email(order):
    from . import merch
    first = _first(order.buyer_name)
    cancel_on = (order.paid_at + timedelta(days=merch.AUTO_CANCEL_DAYS)).strftime('%-d %b')
    paid_on = order.paid_at.strftime('%-d %b')
    body = (
        _lead(f"{_h(first)} paid for {_h(_lines_text(order))} on {paid_on}. It hasn&#8217;t been {'prepared' if order.is_pickup else 'packed'} yet.")
        + f'<div style="margin:0 0 20px;padding:16px 18px;border-radius:16px;background:#FDF1F0;font-size:16px;font-weight:800;line-height:1.5;color:#8F1D14;">'
          f"If it isn&#8217;t {'ready' if order.is_pickup else 'packed'} by {cancel_on}, Byro will cancel it and refund {_h(first)} in full.</div>"
        + _lead(f"Can&#8217;t fulfil it? Cancel it from the order page, so {_h(first)} gets their money back sooner.")
        + _btn_row(_btn(dashboard_url(order), 'Open the order'))
    )
    text = (
        f"Order {order.ref} is still waiting.\n\n{first} paid on {paid_on}. If it isn't started by {cancel_on}, "
        f"Byro will cancel it and refund {first} in full.\n\nOpen the order: {dashboard_url(order)}\n\nByro Team\nsupport@usebyro.com"
    )
    return _wrap('', f"Order {order.ref} is still waiting", body, _seller_footer(order),
                 f"Start it by {cancel_on}, or Byro cancels it.", f"Order {order.ref} has been waiting for {merch.REMIND_AFTER_DAYS} days", text)


# ---------------------------------------------------------------------------
# Sending
# ---------------------------------------------------------------------------

BUYER_KINDS = {'receipt': receipt_email, 'ready': ready_email, 'shipped': shipped_email,
               'refunded': refunded_email, 'moved': pickup_moved_email,
               'delivered': delivered_email, 'collected': collected_email}
SELLER_KINDS = {'problem': problem_email, 'waiting': waiting_email}


def send_order_email(order, kind):
    from .mailer import send_email
    order = type(order).objects.select_related('seller', 'seller__profile').prefetch_related('lines').get(pk=order.pk)
    if kind in BUYER_KINDS:
        mail, to = BUYER_KINDS[kind](order), order.buyer_email
    elif kind in SELLER_KINDS:
        mail, to = SELLER_KINDS[kind](order), order.seller.email
    else:
        raise ValueError(f'Unknown merch email: {kind}')
    if to:
        send_email(to, mail['subject'], mail['html'], mail['text'])
