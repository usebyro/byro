"""Render a ticket as a single PNG, matching the web ticket card's layout:
gradient header up top, event details in the middle, QR code centered at
the bottom.

Used to attach a scannable, self-contained ticket to confirmation emails
(see views.send_ticket_confirmation_email). Uses Pillow's built-in scalable
font (PIL.ImageFont.load_default) so no font file needs to be bundled or
present on the host.
"""
import io

import qrcode
from PIL import Image, ImageDraw, ImageFont

WIDTH = 700
HEADER_HEIGHT = 190
QR_SIZE = 240
CORNER_RADIUS = 24

WHITE = (255, 255, 255)
BODY_BG = (248, 250, 252)      # #f8fafc
BORDER = (226, 232, 240)       # #e2e8f0
NAVY = (15, 23, 42)            # #0f172a (gray-900)
LIGHT_GRAY = (148, 163, 184)   # #94a3b8 (gray-400)
MUTED_GRAY = (107, 114, 128)   # #6b7280 (gray-500)

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


def _rounded_top_mask(size, radius):
    mask = Image.new("L", size, 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        [0, 0, size[0] - 1, size[1] + radius], radius=radius, fill=255
    )
    return mask


def generate_ticket_png(*, event_name, date_str, time_str, location, attendee_name,
                         ticket_id, qr_data, tier_name=None):
    """Render the ticket. Returns PNG bytes.

    Args:
        event_name (str): Event name.
        date_str (str): Formatted date, e.g. "Saturday, July 5, 2026".
        time_str (str|None): Formatted start time, e.g. "6:00 PM".
        location (str|None): Venue.
        attendee_name (str): Ticket holder's name.
        ticket_id (str): UUID of the ticket (not shown — carried in qr_data).
        qr_data (str): Data encoded in the QR code (the ticket's check-in token).
        tier_name (str|None): Ticket tier label shown under the event name.
    """
    pad_x = 36
    col2_x = WIDTH // 2 + 12

    # ---- Compute body height up front so the canvas fits everything ----
    body_top = HEADER_HEIGHT
    row_y = body_top + 28  # DATE/TIME row
    row_y += 22 + 34       # values + gap
    row_y += 28            # VENUE label
    row_y += 22 + 34       # value + gap
    dash_y = row_y
    row_y += 30            # ATTENDEE label
    row_y += 22 + 40       # value + gap
    qr_top = row_y
    qr_block_bottom = qr_top + QR_SIZE + 40
    height = qr_block_bottom + 20

    img = Image.new("RGB", (WIDTH, height), WHITE)
    draw = ImageDraw.Draw(img)

    # ---- Body background ----
    draw.rectangle([0, HEADER_HEIGHT, WIDTH, height], fill=BODY_BG)

    # ---- Gradient header ----
    for x in range(WIDTH):
        draw.line([(x, 0), (x, HEADER_HEIGHT)], fill=_gradient_color(x / WIDTH))

    # Badge (frosted pill with a dot + label)
    badge_font = _font(13)
    badge_text = "EVENT"
    text_w = draw.textlength(badge_text, font=badge_font)
    badge_bg = _lerp(_gradient_color(36 / WIDTH), WHITE, 0.22)
    badge_right = 36 + 20 + text_w + 16
    draw.rounded_rectangle([36, 24, badge_right, 48], radius=12, fill=badge_bg)
    draw.ellipse([48, 33, 56, 41], fill=WHITE)
    draw.text((64, 28), badge_text, font=badge_font, fill=WHITE)

    # Event name
    name_font = _font(26)
    name_text = _truncate(draw, event_name, name_font, WIDTH - 72)
    _draw_bold(draw, (36, 62), name_text, name_font, WHITE)

    if tier_name:
        tier_font = _font(15)
        tier_color = _lerp(WHITE, PURPLE_END, 0.3)
        draw.text((36, 100), tier_name, font=tier_font, fill=tier_color)

    # Rounded top corners on the whole card (matches the web card's rounded-3xl)
    mask = _rounded_top_mask((WIDTH, HEADER_HEIGHT), CORNER_RADIUS)
    header_crop = img.crop((0, 0, WIDTH, HEADER_HEIGHT))
    rounded_header = Image.new("RGB", (WIDTH, HEADER_HEIGHT), WHITE)
    rounded_header.paste(header_crop, (0, 0), mask)
    img.paste(rounded_header, (0, 0))

    # ---- Detail rows ----
    label_font = _font(12)
    value_font = _font(18)

    row_y = body_top + 28
    draw.text((pad_x, row_y), "DATE", font=label_font, fill=LIGHT_GRAY)
    if time_str:
        draw.text((col2_x, row_y), "TIME", font=label_font, fill=LIGHT_GRAY)
    row_y += 22
    _draw_bold(draw, (pad_x, row_y), date_str or "TBA", value_font, NAVY)
    if time_str:
        _draw_bold(draw, (col2_x, row_y), time_str, value_font, NAVY)

    if location:
        row_y += 34 + 28
        draw.text((pad_x, row_y), "VENUE", font=label_font, fill=LIGHT_GRAY)
        row_y += 22
        venue_text = _truncate(draw, location, value_font, WIDTH - pad_x * 2)
        _draw_bold(draw, (pad_x, row_y), venue_text, value_font, NAVY)
    else:
        row_y += 34

    # Dashed tear-off divider
    row_y += 34
    dash_y = row_y
    x = pad_x
    while x < WIDTH - pad_x:
        draw.line([(x, dash_y), (min(x + 10, WIDTH - pad_x), dash_y)], fill=BORDER, width=2)
        x += 18

    row_y += 30
    draw.text((pad_x, row_y), "ATTENDEE", font=label_font, fill=LIGHT_GRAY)
    row_y += 22
    attendee_text = _truncate(draw, attendee_name or "Guest", value_font, WIDTH - pad_x * 2)
    _draw_bold(draw, (pad_x, row_y), attendee_text, value_font, NAVY)

    # ---- QR code, centered ----
    row_y += 40
    qr_img = qrcode.make(qr_data, border=2).get_image().convert("RGB")
    qr_img = qr_img.resize((QR_SIZE, QR_SIZE), Image.NEAREST)
    qr_x = (WIDTH - QR_SIZE) // 2
    qr_y = row_y
    draw.rounded_rectangle(
        [qr_x - 1, qr_y - 1, qr_x + QR_SIZE + 1, qr_y + QR_SIZE + 1],
        radius=12, outline=BORDER, width=1,
    )
    img.paste(qr_img, (qr_x, qr_y))

    caption_font = _font(13)
    caption_text = "Present this QR code at the gate for entry"
    caption_w = draw.textlength(caption_text, font=caption_font)
    draw.text(((WIDTH - caption_w) / 2, qr_y + QR_SIZE + 14), caption_text, font=caption_font, fill=MUTED_GRAY)

    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()
