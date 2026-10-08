"""Render a ticket as a single PNG, matching the ticket card in the web app.

The design: a white card with the event title and "Hosted by", a ticket row
(type and price), date / time / venue / attendee, a dashed tear line with
notches, then the QR code and a green "Valid" pill.

It is attached to confirmation emails (see views.send_ticket_confirmation_email)
so the ticket works with no app and no internet at the door. Pillow's built-in
scalable font is used so no font file has to be bundled or present on the host,
so letterforms are plainer than the web page's Bricolage Grotesque / Nunito Sans.
"""
import io

import qrcode
from PIL import Image, ImageDraw, ImageFont

U = 2                      # draw at 2x so edges stay crisp
CARD_W = 480
MARGIN = 24
PAD = 22                   # card padding, as in the design

BG = (247, 249, 252)       # #F7F9FC page behind the card
WHITE = (255, 255, 255)
LINE = (227, 232, 240)     # #E3E8F0
INK = (20, 22, 28)         # #14161C
MUTED = (91, 98, 114)      # #5B6272
BLUE = (54, 105, 246)      # #3669F6
GREEN_BG = (233, 247, 239)  # #E9F7EF
GREEN_INK = (31, 122, 82)   # #1F7A52
GREEN_DOT = (47, 158, 110)  # #2F9E6E


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
    for dx in ((0, 0.7) if bold else (0,)):
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
    _text(draw, x, y, text, 11, MUTED, bold=True, spacing=1.1)


def generate_ticket_png(*, event_name, date_str, time_str, location, attendee_name,
                        ticket_id, qr_data, tier_name=None, hosted_by="byro", price_label=None,
                        attendee_email=""):
    """Return the ticket as PNG bytes."""
    inner_w = CARD_W - 2 * PAD
    title_lines = _wrap(ImageDraw.Draw(Image.new("RGB", (1, 1))), event_name, 36, inner_w, 2)

    # --- measure first, so the canvas is exactly as tall as the content ---
    title_h = len(title_lines) * 38
    top_h = 24 + title_h + 8 + 17           # padding, title, gap, "Hosted by"
    ticket_row_h = 58
    grid_row1_h = 33
    grid_row2_h = 13 + 2 + 18 + 2 + 17      # label, value, link / email
    body_h = top_h + 14 + ticket_row_h + 14 + grid_row1_h + 14 + grid_row2_h + 18
    tear_h = 24
    qr_block_h = 16 + 208 + 12 + 28 + 24
    card_h = body_h + tear_h + qr_block_h

    img = Image.new("RGB", ((CARD_W + 2 * MARGIN) * U, (card_h + 2 * MARGIN) * U), BG)
    d = ImageDraw.Draw(img)
    ox = oy = MARGIN                         # card origin

    def X(v):
        return (ox + v) * U

    def Y(v):
        return (oy + v) * U

    d.rounded_rectangle([X(0), Y(0), X(CARD_W), Y(card_h)], radius=28 * U, fill=WHITE, outline=LINE, width=U)

    # --- title and host ---
    y = 24
    for ln in title_lines:
        _text(d, ox + PAD, oy + y, ln, 36, INK, bold=True)
        y += 38
    _text(d, ox + PAD, oy + y + 8, f"Hosted by {_fit(d, hosted_by or 'byro', 14, inner_w - 70)}", 14, MUTED)
    y = top_h + 14

    # --- ticket row ---
    d.rounded_rectangle([X(PAD), Y(y), X(CARD_W - PAD), Y(y + ticket_row_h)], radius=16 * U, outline=LINE, width=U)
    _label(d, ox + PAD + 14, oy + y + 12, "TICKET")
    tier = _fit(d, tier_name or "General admission", 16, inner_w - 28 - 90)
    _text(d, ox + PAD + 14, oy + y + 28, tier, 16, INK, bold=True)
    _text(d, ox + PAD + 14 + _width(d, tier, 16) + 6, oy + y + 28, "x 1", 16, MUTED, bold=True)
    if price_label:
        pw = _width(d, price_label, 16)
        _text(d, ox + CARD_W - PAD - 14 - pw, oy + y + 20, price_label, 16, INK, bold=True)
    y += ticket_row_h + 14

    # --- date / time ---
    col2 = PAD + inner_w // 2 + 6
    col_w = inner_w // 2 - 12
    _label(d, ox + PAD, oy + y, "DATE")
    _text(d, ox + PAD, oy + y + 15, _fit(d, date_str, 15, col_w), 15, INK, bold=True)
    _label(d, ox + col2, oy + y, "TIME")
    _text(d, ox + col2, oy + y + 15, _fit(d, time_str, 15, col_w), 15, INK, bold=True)
    y += grid_row1_h + 14

    # --- venue / attendee ---
    _label(d, ox + PAD, oy + y, "VENUE")
    _text(d, ox + PAD, oy + y + 15, _fit(d, location or "To be announced", 15, col_w), 15, INK, bold=True)
    if location:
        _text(d, ox + PAD, oy + y + 34, "Get directions", 13, BLUE, bold=True)
    _label(d, ox + col2, oy + y, "ATTENDEE")
    _text(d, ox + col2, oy + y + 15, _fit(d, attendee_name or "", 15, col_w), 15, INK, bold=True)
    if attendee_email:
        _text(d, ox + col2, oy + y + 34, _fit(d, attendee_email, 13, col_w), 13, MUTED)

    # --- tear line with notches ---
    ty = body_h + tear_h // 2
    x = PAD
    while x < CARD_W - PAD:
        d.line([X(x), Y(ty), X(min(x + 6, CARD_W - PAD)), Y(ty)], fill=LINE, width=2 * U)
        x += 10
    for side in (0, CARD_W):
        d.ellipse([X(side - 12), Y(ty - 12), X(side + 12), Y(ty + 12)], fill=BG, outline=LINE, width=U)
    # the notches overlap the card border; paint the half that sits outside the card in the page colour
    d.rectangle([X(-13), Y(ty - 13), X(0) - 1, Y(ty + 13)], fill=BG)
    d.rectangle([X(CARD_W) + 1, Y(ty - 13), X(CARD_W + 13), Y(ty + 13)], fill=BG)

    # --- QR code ---
    qy = body_h + tear_h + 16
    qx = (CARD_W - 208) // 2
    d.rounded_rectangle([X(qx), Y(qy), X(qx + 208), Y(qy + 208)], radius=18 * U, fill=WHITE, outline=LINE, width=U)
    qr = qrcode.make(qr_data, border=0).get_image().convert("RGB").resize((188 * U, 188 * U), Image.NEAREST)
    img.paste(qr, (X(qx + 10), Y(qy + 10)))

    # --- "Valid" pill ---
    label = "Valid · show this at the door"
    pill_w = 12 + 7 + 6 + _width(d, label, 13) + 12
    px = (CARD_W - pill_w) / 2
    py = qy + 208 + 12
    d.rounded_rectangle([X(px), Y(py), X(px + pill_w), Y(py + 28)], radius=14 * U, fill=GREEN_BG)
    d.ellipse([X(px + 12), Y(py + 14 - 3.5), X(px + 12 + 7), Y(py + 14 + 3.5)], fill=GREEN_DOT)
    _text(d, ox + px + 12 + 7 + 6, oy + py + 6, label, 13, GREEN_INK, bold=True)

    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return buf.getvalue()
