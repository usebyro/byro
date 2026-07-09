"""Render a ticket as a single PNG: event details on the left, QR stub on the right.

Used to attach a scannable, self-contained ticket to confirmation emails
(see views.send_ticket_confirmation_email). Uses Pillow's built-in scalable
font (PIL.ImageFont.load_default) so no font file needs to be bundled or
present on the host.
"""
import io

import qrcode
from PIL import Image, ImageDraw, ImageFont

WIDTH = 1000
HEIGHT = 380
STUB_WIDTH = 300
HEADER_HEIGHT = 96
NOTCH_RADIUS = 16
DIVIDER_X = WIDTH - STUB_WIDTH

WHITE = (255, 255, 255)
BODY_BG = (248, 250, 252)      # #f8fafc
STUB_BG = (241, 245, 249)      # #f1f5f9
BORDER = (226, 232, 240)       # #e2e8f0
NAVY = (15, 23, 42)            # #0f172a
LIGHT_GRAY = (148, 163, 184)   # #94a3b8

PURPLE_START = (15, 10, 46)    # #0f0a2e
PURPLE_MID = (76, 29, 149)     # #4c1d95
PURPLE_END = (168, 85, 247)    # #a855f7


def _lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def _gradient_color(t):
    if t < 0.5:
        return _lerp(PURPLE_START, PURPLE_MID, t / 0.5)
    return _lerp(PURPLE_MID, PURPLE_END, (t - 0.5) / 0.5)


def _font(size):
    return ImageFont.load_default(size=size)


def _draw_bold(draw, xy, text, font, fill):
    # load_default() has no bold weight — fake it with a 1px double-draw.
    x, y = xy
    for dx in (0, 0.6):
        draw.text((x + dx, y), text, font=font, fill=fill)


def _truncate(draw, text, font, max_width):
    if draw.textlength(text, font=font) <= max_width:
        return text
    ellipsis = "…"
    lo, hi = 0, len(text)
    while lo < hi:
        mid = (lo + hi + 1) // 2
        if draw.textlength(text[:mid] + ellipsis, font=font) <= max_width:
            lo = mid
        else:
            hi = mid - 1
    return text[:lo] + ellipsis


def generate_ticket_png(*, event_name, date_str, time_str, location, attendee_name, ticket_id, qr_data):
    """Render the ticket. Returns PNG bytes.

    Args:
        event_name (str): Event name.
        date_str (str): Formatted date, e.g. "Saturday, July 5, 2026".
        time_str (str|None): Formatted start time, e.g. "6:00 PM".
        location (str|None): Venue.
        attendee_name (str): Ticket holder's name.
        ticket_id (str): UUID shown (shortened) below the QR code.
        qr_data (str): Data encoded in the QR code (the ticket's check-in token).
    """
    img = Image.new("RGB", (WIDTH, HEIGHT), WHITE)
    draw = ImageDraw.Draw(img)

    # ---- Main body background ----
    draw.rectangle([0, HEADER_HEIGHT, DIVIDER_X, HEIGHT], fill=BODY_BG)

    # ---- Gradient header ----
    for x in range(DIVIDER_X):
        draw.line([(x, 0), (x, HEADER_HEIGHT)], fill=_gradient_color(x / DIVIDER_X))

    # Badge (frosted pill with a dot + label — avoid unicode glyphs the
    # built-in font can't render, e.g. "●" renders as a tofu box)
    badge_font = _font(14)
    badge_text = "EVENT"
    text_w = draw.textlength(badge_text, font=badge_font)
    badge_bg = _lerp(_gradient_color(36 / DIVIDER_X), WHITE, 0.22)
    badge_right = 36 + 20 + text_w + 16
    draw.rounded_rectangle([36, 18, badge_right, 42], radius=12, fill=badge_bg)
    draw.ellipse([48, 27, 56, 35], fill=WHITE)
    draw.text((64, 22), badge_text, font=badge_font, fill=WHITE)

    # Event name
    name_font = _font(30)
    name_text = _truncate(draw, event_name, name_font, DIVIDER_X - 72)
    _draw_bold(draw, (36, 52), name_text, name_font, WHITE)

    # ---- Detail rows ----
    label_font = _font(13)
    value_font = _font(21)
    pad_x = 36
    col2_x = DIVIDER_X // 2 + 20

    row_y = HEADER_HEIGHT + 28
    draw.text((pad_x, row_y), "DATE", font=label_font, fill=LIGHT_GRAY)
    draw.text((col2_x, row_y), "TIME", font=label_font, fill=LIGHT_GRAY)
    row_y += 22
    _draw_bold(draw, (pad_x, row_y), date_str or "TBA", value_font, NAVY)
    _draw_bold(draw, (col2_x, row_y), time_str or "TBA", value_font, NAVY)

    row_y += 52
    draw.text((pad_x, row_y), "VENUE", font=label_font, fill=LIGHT_GRAY)
    row_y += 22
    venue_text = _truncate(draw, location or "TBA", value_font, DIVIDER_X - pad_x * 2)
    _draw_bold(draw, (pad_x, row_y), venue_text, value_font, NAVY)

    # Dashed tear-off line above the attendee row
    row_y += 56
    dash_y = row_y
    x = pad_x
    while x < DIVIDER_X - pad_x:
        draw.line([(x, dash_y), (min(x + 10, DIVIDER_X - pad_x), dash_y)], fill=BORDER, width=2)
        x += 18

    row_y += 20
    draw.text((pad_x, row_y), "ATTENDEE", font=label_font, fill=LIGHT_GRAY)
    row_y += 22
    attendee_text = _truncate(draw, attendee_name or "Guest", value_font, DIVIDER_X - pad_x * 2)
    _draw_bold(draw, (pad_x, row_y), attendee_text, value_font, NAVY)

    # ---- Stub (right side) ----
    draw.rectangle([DIVIDER_X, 0, WIDTH, HEIGHT], fill=STUB_BG)

    # Perforation notches + dashed divider
    draw.ellipse(
        [DIVIDER_X - NOTCH_RADIUS, -NOTCH_RADIUS, DIVIDER_X + NOTCH_RADIUS, NOTCH_RADIUS],
        fill=WHITE,
    )
    draw.ellipse(
        [DIVIDER_X - NOTCH_RADIUS, HEIGHT - NOTCH_RADIUS, DIVIDER_X + NOTCH_RADIUS, HEIGHT + NOTCH_RADIUS],
        fill=WHITE,
    )
    y = NOTCH_RADIUS + 8
    while y < HEIGHT - NOTCH_RADIUS:
        draw.line([(DIVIDER_X, y), (DIVIDER_X, min(y + 10, HEIGHT - NOTCH_RADIUS))], fill=BORDER, width=2)
        y += 18

    stub_center_x = DIVIDER_X + STUB_WIDTH // 2
    label_font_stub = _font(12)
    scan_text = "SCAN AT ENTRY"
    scan_w = draw.textlength(scan_text, font=label_font_stub)
    draw.text((stub_center_x - scan_w / 2, 30), scan_text, font=label_font_stub, fill=LIGHT_GRAY)

    qr_img = qrcode.make(qr_data, border=2).get_image().convert("RGB")
    qr_size = 200
    qr_img = qr_img.resize((qr_size, qr_size), Image.NEAREST)
    qr_x = stub_center_x - qr_size // 2
    qr_y = 58
    draw.rounded_rectangle(
        [qr_x - 10, qr_y - 10, qr_x + qr_size + 10, qr_y + qr_size + 10],
        radius=12, fill=WHITE, outline=BORDER, width=1,
    )
    img.paste(qr_img, (qr_x, qr_y))

    footer_font = _font(11)
    footer_text = "Present at the gate"
    footer_w = draw.textlength(footer_text, font=footer_font)
    draw.text((stub_center_x - footer_w / 2, HEIGHT - 34), footer_text, font=footer_font, fill=LIGHT_GRAY)

    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()
