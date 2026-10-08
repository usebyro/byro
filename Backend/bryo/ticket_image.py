"""Render a ticket as a single PNG, matching the "Ticket attachment" board in the design.

A wide card: logo and ADMIT ONE pill, the event title and host, date / time / venue,
then name and ticket type. A dashed tear line with notches separates the QR code
and "Scan at the door".

It is attached to confirmation emails (see views.send_ticket_confirmation_email)
so the ticket works with no app and no internet at the door. Pillow's built-in
scalable font is used so no font file has to be bundled or present on the host,
so letterforms are plainer than the design's Bricolage Grotesque / Nunito Sans.
"""
import io
import os

import qrcode
from PIL import Image, ImageDraw, ImageFont

U = 2                      # draw at 2x so edges stay crisp
CANVAS_W = 760
MARGIN = 20
CARD_W = 720
MIN_CARD_H = 300
LEFT_W = 502               # the details side; the QR side is the rest
PAD_X, PAD_Y = 28, 24

BG = (243, 246, 251)       # #F3F6FB page behind the card
WHITE = (255, 255, 255)
LINE = (227, 232, 240)     # #E3E8F0
DASH = (213, 219, 229)     # #D5DBE5
INK = (20, 22, 28)         # #14161C
BODY = (59, 66, 82)        # #3B4252
MUTED = (91, 98, 114)      # #5B6272
LABEL = (138, 145, 160)    # #8A91A0

LOGO_PATH = os.path.join(os.path.dirname(__file__), "assets", "logo-email.png")


# Pillow's built-in font has no naira sign. Borrow one from the system if it has a font that does;
# otherwise print "NGN" rather than an empty box.
_SYMBOL_FONTS = (
    "/System/Library/Fonts/Supplemental/Arial.ttf",
    "/Library/Fonts/Arial.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
)


def _symbol_font_path():
    import os
    return next((p for p in _SYMBOL_FONTS if os.path.exists(p)), None)


def _font(size, symbols=False):
    if symbols:
        path = _symbol_font_path()
        if path:
            return ImageFont.truetype(path, int(size * U))
    return ImageFont.load_default(size=int(size * U))


def _prep(text):
    """Swap characters the built-in font cannot draw."""
    text = (text or "").replace("×", "x")
    if "₦" in text and not _symbol_font_path():
        text = text.replace("₦", "NGN ")
    return text


def _text(draw, x, y, text, size, fill=INK, bold=False, spacing=0.0):
    """Draw text at design-unit coordinates. `spacing` is letter-spacing in px; bold fakes a heavier weight."""
    text = _prep(text)
    font = _font(size, symbols="₦" in text)
    px, py = x * U, y * U
    heavy = max(0.7, size * 0.045)
    for dx in ((0, heavy / 2, heavy) if bold else (0,)):
        cx = px
        if spacing:
            for ch in text:
                draw.text((cx + dx, py), ch, font=font, fill=fill)
                cx += draw.textlength(ch, font=font) + spacing * U
        else:
            draw.text((cx + dx, py), text, font=font, fill=fill)


def _width(draw, text, size, spacing=0.0):
    text = _prep(text)
    font = _font(size, symbols="₦" in text)
    return (draw.textlength(text, font=font) + spacing * U * len(text)) / U


def _fit(draw, text, size, max_w):
    """Shorten with an ellipsis so the text fits in max_w design units."""
    text = text or ""
    if _width(draw, text, size) <= max_w:
        return text
    lo, hi = 0, len(text)
    while lo < hi:
        mid = (lo + hi + 1) // 2
        if _width(draw, text[:mid] + "…", size) <= max_w:
            lo = mid
        else:
            hi = mid - 1
    return text[:lo].rstrip() + "…"


def _wrap(draw, text, size, max_w, max_lines):
    """Break a title onto at most max_lines lines."""
    words, lines, cur = (text or "").split(), [], ""
    for w in words:
        trial = f"{cur} {w}".strip()
        if _width(draw, trial, size) <= max_w or not cur:
            cur = trial
        else:
            lines.append(cur)
            cur = w
    lines.append(cur)
    if len(lines) > max_lines:
        lines = lines[:max_lines]
        lines[-1] = _fit(draw, lines[-1] + "…", size, max_w)
    return [_fit(draw, ln, size, max_w) for ln in lines]


def _label(draw, x, y, text):
    _text(draw, x, y, text, 10, LABEL, bold=True, spacing=1.0)


def generate_ticket_png(*, event_name, date_str, time_str, location, attendee_name,
                        ticket_id, qr_data, tier_name=None, hosted_by="byro", price_label=None,
                        attendee_email=""):
    """Return the ticket as PNG bytes."""
    scratch = ImageDraw.Draw(Image.new("RGB", (1, 1)))
    inner_w = LEFT_W - 2 * PAD_X
    title_lines = _wrap(scratch, event_name, 34, inner_w, 2)

    # The card is 300 tall in the design; a two-line title makes it taller.
    title_h = len(title_lines) * 36
    content_h = PAD_Y + 26 + 16 + title_h + 4 + 17 + 16 + 33 + 16 + 14 + 1 + 14 + 33 + PAD_Y
    card_h = max(MIN_CARD_H, content_h)

    img = Image.new("RGB", ((CANVAS_W) * U, (card_h + 2 * MARGIN) * U), BG)
    d = ImageDraw.Draw(img)
    ox = oy = MARGIN

    def X(v):
        return round((ox + v) * U)

    def Y(v):
        return round((oy + v) * U)

    d.rounded_rectangle([X(0), Y(0), X(CARD_W), Y(card_h)], radius=20 * U, fill=WHITE, outline=LINE, width=U)

    # --- header: logo and ADMIT ONE ---
    left = PAD_X
    y = PAD_Y
    try:
        logo = Image.open(LOGO_PATH).convert("RGBA")
        lh = 26 * U
        logo = logo.resize((int(logo.width * lh / logo.height), lh), Image.LANCZOS)
        img.paste(logo, (X(left), Y(y)), logo)
    except OSError:
        _text(d, ox + left, oy + y + 4, "byro", 20, INK, bold=True)
    pill = "ADMIT ONE"
    pw = _width(d, pill, 11, spacing=1.1) + 24
    px = LEFT_W - PAD_X - pw
    d.rounded_rectangle([X(px), Y(y), X(px + pw), Y(y + 26)], radius=13 * U, fill=INK)
    _text(d, ox + px + 12, oy + y + 6, pill, 11, WHITE, bold=True, spacing=1.1)
    y += 26 + 16

    # --- title and host ---
    for ln in title_lines:
        _text(d, ox + left, oy + y, ln, 34, INK, bold=True)
        y += 36
    y += 4
    host = _fit(d, hosted_by or "byro", 14, inner_w - 70)
    _text(d, ox + left, oy + y, "Hosted by", 14, MUTED)
    _text(d, ox + left + _width(d, "Hosted by ", 14), oy + y, host, 14, BODY, bold=True)
    y += 17 + 16

    # --- date / time / venue ---
    date_w, time_w = 150, 100
    venue_w = inner_w - date_w - time_w - 2 * 22
    cols = [("DATE", date_str, left, date_w), ("TIME", time_str, left + date_w + 22, time_w),
            ("VENUE", location or "To be announced", left + date_w + time_w + 44, venue_w)]
    for lab, val, cx, cw in cols:
        _label(d, ox + cx, oy + y, lab)
        _text(d, ox + cx, oy + y + 13, _fit(d, val, 14, cw), 14, INK, bold=True)

    # --- name / ticket, under a dashed rule pinned to the bottom ---
    by = card_h - PAD_Y - 33 - 14
    x = left
    while x < LEFT_W - PAD_X:
        d.line([X(x), Y(by - 14), X(min(x + 3, LEFT_W - PAD_X)), Y(by - 14)], fill=DASH, width=U)
        x += 6
    half = (inner_w - 22) // 2
    _label(d, ox + left, oy + by, "NAME")
    _text(d, ox + left, oy + by + 13, _fit(d, attendee_name or "", 14, half), 14, INK, bold=True)
    _label(d, ox + left + half + 22, oy + by, "TICKET")
    _text(d, ox + left + half + 22, oy + by + 13, _fit(d, tier_name or "General admission", 14, half), 14, INK, bold=True)

    # --- dashed tear line and notches ---
    tx = LEFT_W - 1
    yy = 18
    while yy < card_h - 18:
        d.line([X(tx), Y(yy), X(tx), Y(min(yy + 5, card_h - 18))], fill=DASH, width=2 * U)
        yy += 9
    for cy in (0, card_h):
        d.ellipse([X(LEFT_W - 14), Y(cy - 14), X(LEFT_W + 14), Y(cy + 14)], fill=BG)

    # --- QR side ---
    right_cx = LEFT_W + (CARD_W - LEFT_W) / 2
    qr_box = 156
    block_h = qr_box + 12 + 15
    qy = (card_h - block_h) / 2
    qx = right_cx - qr_box / 2
    d.rounded_rectangle([X(qx), Y(qy), X(qx + qr_box), Y(qy + qr_box)], radius=14 * U, fill=WHITE, outline=LINE, width=U)
    qr_size = (qr_box - 20) * U
    qr = qrcode.make(qr_data, border=0).get_image().convert("RGB").resize((qr_size, qr_size), Image.NEAREST)
    img.paste(qr, (X(qx + 10), Y(qy + 10)))
    cap = "Scan at the door"
    _text(d, ox + right_cx - _width(d, cap, 12) / 2, oy + qy + qr_box + 12, cap, 12, MUTED, bold=True)

    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return buf.getvalue()
