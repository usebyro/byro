import re
from decimal import Decimal
"""
Transactional email templates for Byro.
Each function returns a dict: { subject, html, text }

Shared visual system: one 560px card, one type scale, and Byro's actual
brand color (#4F6EF7 — the same indigo used for primary buttons and the
active nav state across the app) for every status badge and primary
button, instead of a color that varies per template.
"""

INK = "#14161C"
BODY = "#3B4252"
MUTED = "#5B6272"
BORDER = "#E3E8F0"
SURFACE = "#F7F9FC"
PAGE_BG = "#F3F6FB"
HAIRLINE = "#EDF0F5"

BRAND = "#3669F6"
BRAND_DARK = "#2451D6"
BRAND_BG = "#EEF3FF"

NEUTRAL = BRAND_DARK
NEUTRAL_BG = BRAND_BG
TIME = BRAND_DARK
TIME_BG = "#FFF4CC"
GROWTH = BRAND_DARK
GROWTH_BG = BRAND_BG
MONEY = BRAND_DARK
MONEY_BG = "#E3F5EC"

# Badge text colours that are readable on their own tinted backgrounds.
_BADGE_INK = {TIME_BG: "#6B4A08", MONEY_BG: "#1F6B47"}

FONT_STACK = "'Nunito Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif"
DISPLAY_STACK = "'Bricolage Grotesque','Nunito Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif"


def _badge(label, color, bg):
    color = _BADGE_INK.get(bg, color)
    return f"""<table cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
      <tr>
        <td style="background:{bg};border-radius:999px;padding:6px 12px;">
          <span style="color:{color};font-size:12px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;">{label}</span>
        </td>
      </tr>
    </table>"""


def _button(url, label, color):
    return f"""<a href="{url}" style="display:block;background:{BRAND};color:#ffffff;text-decoration:none;font-size:16px;font-weight:700;padding:15px 26px;border-radius:999px;text-align:center;">{label}</a>"""


def _text_link(url, label):
    return f"""<p style="text-align:center;margin:12px 0 0;">
      <a href="{url}" style="display:block;border:1px solid #D5DBE5;color:{INK};font-size:15px;font-weight:700;text-decoration:none;padding:14px 22px;border-radius:999px;">{label}</a>
    </p>"""


def _cell(label, value, mono=False, colspan=None):
    font = "font-family:'Courier New',Courier,monospace;letter-spacing:0.02em;" if mono else ""
    span = f' colspan="{colspan}"' if colspan else ""
    width = "" if colspan else "width:50%;"
    return f"""<td{span} style="{width}padding:10px 18px;border-bottom:1px solid {HAIRLINE};vertical-align:top;">
      <p style="color:{MUTED};font-size:13px;margin:0 0 3px;">{label}</p>
      <p style="color:{INK};font-size:15px;font-weight:700;margin:0;{font}">{value}</p>
    </td>"""


def _logo_url():
    from django.conf import settings
    return f"{getattr(settings, 'SITE_URL', 'https://usebyro.com').rstrip('/')}/assets/images/logo-email.png"


def _shell(badge_html, headline, body_html, footer_text, preheader=""):
    pre = (
        f'<div style="display:none;max-height:0;overflow:hidden;opacity:0;font-size:1px;line-height:1px;color:{PAGE_BG};">{preheader}</div>'
        if preheader else ""
    )
    heading = (
        f'<h1 style="margin:0 0 20px;font-family:{DISPLAY_STACK};font-size:32px;font-weight:700;color:{INK};line-height:1.1;letter-spacing:-0.02em;">{headline}</h1>'
        if headline else ""
    )
    return f"""
<div style="background-color:{PAGE_BG};padding:24px 24px 32px;font-family:{FONT_STACK};color:{INK};">
  {pre}
  <table cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;width:100%;">
    <tr>
      <td style="background:#ffffff;border-radius:24px;overflow:hidden;">
        <table cellpadding="0" cellspacing="0" style="width:100%;">
          <tr>
            <td style="height:72px;padding:0 32px;border-bottom:1px solid {HAIRLINE};">
              <img src="{_logo_url()}" alt="byro" width="54" height="26" style="display:block;height:26px;width:54px;border:0;">
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              {badge_html}
              {heading}
              {body_html}
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td style="text-align:center;padding:16px 8px 0;">
        <p style="color:{MUTED};font-size:12px;line-height:1.6;margin:0 0 6px;">{footer_text}</p>
        <p style="color:{MUTED};font-size:12px;line-height:1.6;margin:0 0 6px;">Questions? Reply to this email or write to <a href="mailto:support@usebyro.com" style="color:{BRAND_DARK};font-weight:700;text-decoration:none;">support@usebyro.com</a></p>
        <p style="color:{BODY};font-size:12px;font-weight:700;line-height:1.6;margin:0;">Create communities. Discover events. Create memories.</p>
      </td>
    </tr>
  </table>
</div>"""


# ---------------------------------------------------------------------------
# Building blocks. Each one matches a piece of the email designs, using tables
# and inline styles because mail clients ignore flexbox, grid and most CSS.
# ---------------------------------------------------------------------------

def format_event_date(day):
    """'Sun, 11 Oct 2026'."""
    return f"{day:%a}, {day.day} {day:%b %Y}" if day else ""


def format_event_time(t, tz=""):
    """'9:00 AM WAT' (the zone is only named for Lagos events)."""
    if not t:
        return ""
    text = f"{t.hour % 12 or 12}:{t:%M} {'AM' if t.hour < 12 else 'PM'}"
    return f"{text} WAT" if "lagos" in (tz or "").lower() else text


def _money(amount):
    value = Decimal(str(amount))
    return f"₦{value:,.0f}" if value == value.to_integral_value() else f"₦{value:,.2f}"


def _first(name):
    return (name or "").strip().split(" ")[0] or "there"


def _h(text):
    from html import escape
    return escape(str(text or ""))


def _btn(url, label, primary=True):
    look = (
        f"background:{BRAND};color:#ffffff;font-size:16px;padding:0 26px;"
        if primary else
        f"border:1px solid #D5DBE5;color:{INK};font-size:15px;padding:0 22px;"
    )
    return (
        f'<a href="{url}" style="display:inline-block;{look}height:50px;line-height:50px;'
        f'text-decoration:none;font-weight:700;border-radius:999px;text-align:center;">{label}</a>'
    )


def _btn_row(*buttons):
    cells = "".join(f'<td style="padding:0 10px 10px 0;">{b}</td>' for b in buttons)
    return f'<table cellpadding="0" cellspacing="0" style="margin:0 0 20px;"><tr>{cells}</tr></table>'


def _lead(html):
    return f'<p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:{BODY};">{html}</p>'


def _small(html):
    return f'<p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:{MUTED};">{html}</p>'


def _rows(rows):
    """A bordered box of label / value lines, like the details panel in the designs."""
    last = len(rows) - 1
    body = "".join(
        f'<tr><td style="padding:10px 0;{"" if n == last else f"border-bottom:1px solid {HAIRLINE};"}font-size:15px;color:{MUTED};vertical-align:top;">{label}</td>'
        f'<td style="padding:10px 0 10px 16px;{"" if n == last else f"border-bottom:1px solid {HAIRLINE};"}font-size:15px;font-weight:700;color:{INK};text-align:right;vertical-align:top;">{value}</td></tr>'
        for n, (label, value) in enumerate(rows)
    )
    return (
        f'<table cellpadding="0" cellspacing="0" style="width:100%;border:1px solid {BORDER};border-radius:18px;border-collapse:separate;margin:0 0 20px;">'
        f'<tr><td style="padding:6px 18px;"><table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;">{body}</table></td></tr></table>'
    )


def _callout(title, bullets):
    items = "".join(f'<div style="padding-top:8px;font-size:15px;color:{INK};">&bull; {b}</div>' for b in bullets)
    return (
        f'<table cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 20px;"><tr>'
        f'<td style="background:{SURFACE};border-radius:18px;padding:16px 18px;">'
        f'<div style="font-size:15px;font-weight:700;color:{INK};">{title}</div>{items}</td></tr></table>'
    )


def _tiles(tiles):
    cells = "".join(
        f'<td width="{100 // len(tiles)}%" style="padding:0 {0 if n == len(tiles) - 1 else 10}px 0 0;vertical-align:top;">'
        f'<table cellpadding="0" cellspacing="0" style="width:100%;border:1px solid {BORDER};border-radius:16px;border-collapse:separate;"><tr><td style="padding:14px 16px;">'
        f'<div style="font-family:{DISPLAY_STACK};font-size:26px;font-weight:700;color:{INK};line-height:1.2;">{value}</div>'
        f'<div style="font-size:13px;font-weight:700;color:{MUTED};padding-top:2px;">{label}</div></td></tr></table></td>'
        for n, (value, label) in enumerate(tiles)
    )
    return f'<table cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 20px;"><tr>{cells}</tr></table>'


def _timeline(steps):
    """steps: [(title, subtitle, done)]"""
    rows = ""
    for title, sub, done in steps:
        dot = (
            f'<div style="width:24px;height:24px;line-height:24px;border-radius:12px;background:{INK};color:#ffffff;font-size:13px;font-weight:800;text-align:center;">&#10003;</div>'
            if done else
            '<div style="width:20px;height:20px;border-radius:12px;border:2px solid #C9D0DC;background:#ffffff;"></div>'
        )
        rows += (
            f'<tr><td width="36" style="padding:0 12px 14px 0;vertical-align:top;">{dot}</td>'
            f'<td style="padding:0 0 14px;vertical-align:top;"><div style="font-size:15px;font-weight:800;color:{INK if done else MUTED};">{title}</div>'
            f'<div style="font-size:13px;color:{MUTED};padding-top:2px;">{sub}</div></td></tr>'
        )
    return f'<table cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 6px;">{rows}</table>'


def _maps_link(location):
    from urllib.parse import quote
    return f"https://www.google.com/maps/search/?api=1&query={quote(location)}"


def _api_public_url():
    from django.conf import settings
    return getattr(settings, "API_PUBLIC_URL", "https://byro.onrender.com").rstrip("/")


# ---------------------------------------------------------------------------
# The eight emails
# ---------------------------------------------------------------------------

def ticket_confirmation_email(name, event_name, date, time, location, ticket_id, form_answers=None, ticket_url=None,
                              tier_label=None, holder_name=None, bought_by=None, qr_url=None, calendar_url=None):
    """
    "You're going to {event}": one email per ticket, with a QR code that works at the door.

    `date`/`time` are display strings. `tier_label` is e.g. "General admission x 1".
    `bought_by` is set when someone else bought the ticket for this person.
    """
    view_url = ticket_url or "https://usebyro.com"
    qr = qr_url or (f"{_api_public_url()}/api/tickets/{ticket_id}/qr/" if ticket_id else "")
    cal = calendar_url or (f"{_api_public_url()}/api/tickets/{ticket_id}/calendar/" if ticket_id else "")
    when = " · ".join(x for x in [date, time] if x)

    rows = [("Event", _h(event_name)), ("Date", _h(when))]
    if location:
        rows.append(("Venue", _h(location)))
    if tier_label:
        rows.append(("Ticket", _h(tier_label)))
    rows.append(("Name", _h(holder_name or name)))

    answers_html = ""
    answers_text = ""
    if form_answers:
        pairs = [(a.get("question", ""), a.get("answer", "")) for a in form_answers if a.get("question") and a.get("answer")]
        if pairs:
            answers_html = _rows([(_h(q), _h(a)) for q, a in pairs])
            answers_text = "".join(f"{q}: {a}\n" for q, a in pairs) + "\n"

    qr_html = (
        f'<table cellpadding="0" cellspacing="0" style="margin:0 auto 20px;"><tr><td align="center">'
        f'<img src="{qr}" alt="Ticket QR code" width="200" height="200" style="display:block;width:200px;height:200px;border:1px solid {BORDER};border-radius:16px;padding:10px;box-sizing:border-box;background:#ffffff;">'
        f'<div style="font-size:13px;color:{MUTED};padding-top:10px;">Show this at the door. A screenshot works too.</div></td></tr></table>'
        if qr else ""
    )
    buttons = [_btn(view_url, "View ticket online")]
    if cal:
        buttons.append(_btn(cal, "Add to calendar", primary=False))
    gifted = _small(f"Ticket bought for you by {_h(bought_by)}.") if bought_by else ""

    body_html = (
        _lead(f"Here&#8217;s your ticket for <b>{_h(event_name)}</b>. It&#8217;s just for you. Everyone in the same order gets their own email.")
        + _rows(rows) + answers_html + qr_html
        + f'<div style="text-align:center;">{_btn_row(*buttons)}</div>'.replace("<table", '<table align="center"', 1)
        + gifted
    )
    html = _shell(
        _badge("Your ticket", NEUTRAL, NEUTRAL_BG),
        f"You&#8217;re going, {_h(_first(holder_name or name))}",
        body_html,
        f"You&#8217;re getting this because a ticket for {_h(event_name)} was issued in your name.",
        preheader="Your ticket and QR code are inside.",
    )
    text = (
        f"You're going, {_first(holder_name or name)}\n\n"
        f"Here's your ticket for {event_name}. It's just for you. Everyone in the same order gets their own email.\n\n"
        f"Event: {event_name}\nDate: {when}\n" + (f"Venue: {location}\n" if location else "")
        + (f"Ticket: {tier_label}\n" if tier_label else "") + f"Name: {holder_name or name}\n\n"
        + answers_text
        + f"View ticket online: {view_url}\n" + (f"Add to calendar: {cal}\n" if cal else "")
        + "Show your QR code at the door. A screenshot works too.\n"
        + (f"\nTicket bought for you by {bought_by}.\n" if bought_by else "")
        + "\nByro Team\nsupport@usebyro.com"
    )
    return {"subject": f"You're going to {event_name}", "html": html, "text": text}


def event_reminder_email(name, event_name, date, time, location, ticket_url=None, virtual_link=None, tier_label=None):
    """Attendee reminder, sent the day before."""
    view_url = ticket_url or "https://usebyro.com"
    when = " · ".join(x for x in [date, time] if x)

    rows = [("When", _h(when))]
    if location:
        rows.append(("Where", f'{_h(location)} · <a href="{_maps_link(location)}" style="color:{BRAND_DARK};text-decoration:none;">Get directions</a>'))
    if virtual_link:
        rows.append(("Join link", f'<a href="{_h(virtual_link)}" style="color:{BRAND_DARK};text-decoration:none;">{_h(virtual_link)}</a>'))
    if tier_label:
        rows.append(("Your ticket", _h(tier_label)))

    body_html = (
        _lead("Quick details so you can plan your day.")
        + _rows(rows)
        + _callout("Before you go", [
            "Have your QR ready (a screenshot works)",
            "Doors open on time, so arriving 10 minutes early helps",
        ])
        + _btn_row(_btn(view_url, "Show my ticket"))
    )
    short = " · ".join(x for x in [date, time] if x)
    html = _shell(
        _badge("Tomorrow", TIME, TIME_BG),
        f"See you tomorrow at {_h(event_name)}",
        body_html,
        f"You&#8217;re getting this because you have a ticket for {_h(event_name)}.",
        preheader=f"{short}{' at ' + _h(location) if location else ''}. Your ticket is inside.",
    )
    text = (
        f"See you tomorrow at {event_name}\n\nQuick details so you can plan your day.\n\n"
        f"When: {when}\n" + (f"Where: {location} ({_maps_link(location)})\n" if location else "")
        + (f"Join link: {virtual_link}\n" if virtual_link else "") + (f"Your ticket: {tier_label}\n" if tier_label else "")
        + "\nBefore you go:\n- Have your QR ready (a screenshot works)\n- Doors open on time, so arriving 10 minutes early helps\n\n"
        f"Show my ticket: {view_url}\n\nByro Team\nsupport@usebyro.com"
    )
    return {"subject": f"{event_name} is tomorrow", "html": html, "text": text}


def organizer_event_reminder_email(name, event_name, date, time, tickets_sold, dashboard_url=None,
                                   location="", capacity=None, revenue=None, checkin_url=None):
    """Organiser reminder, sent the day before: how sales stand and a check-in plan."""
    manage_url = dashboard_url or "https://usebyro.com"
    checkin = checkin_url or manage_url
    where = f" · {_h(location)}" if location else ""
    when = " · ".join(x for x in [date, time] if x)
    sold_word = "ticket" if tickets_sold == 1 else "tickets"

    tiles = [(str(tickets_sold), f"{sold_word} sold"), ("No cap" if not capacity else str(capacity), "capacity")]
    if revenue is not None:
        tiles.append((_money(revenue), "revenue"))

    body_html = (
        _lead(f"<b>{_h(event_name)}</b> · {_h(when)}{where}")
        + _tiles(tiles)
        + _callout("Get ready", [
            "Open the check-in scanner on your phone and test it once",
            "Add co-hosts who will help at the door",
            "Share the link one more time for last-minute sales",
        ])
        + _btn_row(_btn(checkin, "Open check-in"), _btn(manage_url, "Manage event", primary=False))
    )
    html = _shell(
        _badge("For organisers", NEUTRAL, NEUTRAL_BG),
        "Your event starts tomorrow",
        body_html,
        f"You&#8217;re getting this because you host {_h(event_name)} on byro.",
        preheader=f"{tickets_sold} {sold_word} sold so far. Here is your check-in plan.",
    )
    text = (
        f"Your event starts tomorrow\n\n{event_name} · {when}{' · ' + location if location else ''}\n\n"
        + "".join(f"{label}: {value}\n" for value, label in tiles)
        + "\nGet ready:\n- Open the check-in scanner on your phone and test it once\n- Add co-hosts who will help at the door\n"
        "- Share the link one more time for last-minute sales\n\n"
        f"Open check-in: {checkin}\nManage event: {manage_url}\n\nByro Team\nsupport@usebyro.com"
    )
    return {"subject": f"{event_name} starts tomorrow", "html": html, "text": text}


def _next_milestone(n):
    for step in (1, 10, 25, 50, 100):
        if n < step:
            return step
    return (n // 100 + 1) * 100


def milestone_reached_email(name, event_name, milestone, tickets_sold, dashboard_url=None, share_url=None):
    """Organiser milestone: the 1st sale, then 10, 25, 50, 100 and every 100 after."""
    dash = dashboard_url or "https://usebyro.com"
    share = share_url or dash
    word = "ticket" if milestone == 1 else "tickets"
    nxt = _next_milestone(milestone)
    banner = (
        f'<table cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 20px;"><tr><td style="background:{BRAND};border-radius:20px;padding:28px;color:#ffffff;">'
        f'<div style="font-size:13px;font-weight:800;letter-spacing:0.1em;opacity:0.85;">MILESTONE</div>'
        f'<div style="font-family:{DISPLAY_STACK};font-size:64px;font-weight:700;line-height:1.05;">{milestone}</div>'
        f'<div style="font-size:18px;font-weight:800;">{word} sold for {_h(event_name)}</div></td></tr></table>'
    )
    body_html = (
        banner
        + _lead(f"People are showing up for you. Your next milestone is <b>{nxt} tickets</b>. A quick post or a message in your community group usually helps.")
        + _btn_row(_btn(share, "Share event"), _btn(dash, "See sales", primary=False))
        + _small("Milestone emails go out at 1, 10, 25 and 50 tickets, then every 100. Reply to this email if you would rather not get them.")
    )
    html = _shell(
        "", None, body_html,
        f"You&#8217;re getting this because you host {_h(event_name)} on byro.",
        preheader="Nice work. Keep it going.",
    )
    text = (
        f"{milestone} {word} sold for {event_name}\n\nPeople are showing up for you. Your next milestone is {nxt} tickets. "
        f"A quick post or a message in your community group usually helps.\n\nShare event: {share}\nSee sales: {dash}\n\n"
        "Milestone emails go out at 1, 10, 25 and 50 tickets, then every 100. Reply to this email if you would rather not get them.\n\n"
        "Byro Team\nsupport@usebyro.com"
    )
    return {"subject": f"{milestone} {word} sold for {event_name}", "html": html, "text": text}


def event_published_email(name, event_name, date, time, location, event_url, share_cta_url=None, is_first_event=True,
                          tickets_label=None, manage_url=None):
    """To the organiser, the moment an event goes live: share it."""
    from urllib.parse import quote
    manage = manage_url or event_url
    when = " · ".join(x for x in [date, time] if x)
    share_text = quote(f"{event_name}\n{event_url}")
    wa = f"https://wa.me/?text={share_text}"
    x = f"https://twitter.com/intent/tweet?text={quote(event_name)}&url={quote(event_url)}"

    rows = [("Date", _h(when))]
    if location:
        rows.append(("Venue", _h(location)))
    if tickets_label:
        rows.append(("Tickets", _h(tickets_label)))

    share_html = (
        f'<div style="font-size:15px;font-weight:800;color:{INK};padding-bottom:10px;">Share it now</div>'
        f'<table cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 20px;"><tr>'
        f'<td width="50%" style="padding-right:5px;"><a href="{wa}" style="display:block;height:52px;line-height:52px;border:1px solid #D5DBE5;border-radius:999px;text-align:center;font-size:15px;font-weight:700;color:{INK};text-decoration:none;">WhatsApp</a></td>'
        f'<td width="50%" style="padding-left:5px;"><a href="{x}" style="display:block;height:52px;line-height:52px;border:1px solid #D5DBE5;border-radius:999px;text-align:center;font-size:15px;font-weight:700;color:{INK};text-decoration:none;">Post on X</a></td>'
        f'</tr></table>'
    )
    body_html = (
        _lead("Your event page is up and tickets are on sale.")
        + share_html + _rows(rows)
        + _btn_row(_btn(event_url, "View event page"), _btn(manage, "Manage event", primary=False))
        + _small("Sharing in the first hour helps early sales, and early sales help your event show up on Discover.")
    )
    html = _shell(
        _badge("Live", MONEY, MONEY_BG),
        f"{_h(event_name)} is live",
        body_html,
        "You&#8217;re getting this because you published an event on byro.",
        preheader="Your event page is up. Share the link to start selling.",
    )
    text = (
        f"{event_name} is live\n\nYour event page is up and tickets are on sale.\n\n"
        f"Share on WhatsApp: {wa}\nPost on X: {x}\n\n"
        + "".join(f"{label}: {value}\n" for label, value in [("Date", when), ("Venue", location), ("Tickets", tickets_label)] if value)
        + f"\nView event page: {event_url}\nManage event: {manage}\n\n"
        "Sharing in the first hour helps early sales, and early sales help your event show up on Discover.\n\nByro Team\nsupport@usebyro.com"
    )
    return {"subject": f"{event_name} is live", "html": html, "text": text}


def cohost_invite_email(event_name, inviter_name, event_url, is_new_user=False, role="manager", invitee_email="",
                        date="", time="", location=""):
    """Invite to co-host. Managers can edit; check-in helpers can only see guests and check them in."""
    when = " · ".join(x for x in [date, time, location] if x)
    if role == "checkin":
        can = ["See the guest list and check people in", "You won&#8217;t be able to edit the event", "You won&#8217;t see payouts or bank details"]
        can_text = ["See the guest list and check people in", "You won't be able to edit the event", "You won't see payouts or bank details"]
    else:
        can = ["See the guest list and check people in", "Edit event details and share the event", "You won&#8217;t see payouts or bank details"]
        can_text = ["See the guest list and check people in", "Edit event details and share the event", "You won't see payouts or bank details"]

    inviter = _h(inviter_name)
    body_html = (
        (_lead(_h(when)) if when else "")
        + _callout("As a co-host you can", can)
        + _btn_row(_btn(event_url, "Accept invite" if is_new_user else "Open event"))
        + _small("Not expecting this? Just ignore this email. Nothing changes unless you accept.")
        + (_small("If you don&#8217;t have a byro account yet, you can create one when you accept.") if is_new_user else "")
    )
    html = _shell(
        _badge("Invite", NEUTRAL, NEUTRAL_BG),
        f"{inviter} invited you to co-host {_h(event_name)}",
        body_html,
        f"You&#8217;re getting this because {inviter} added this email as a co-host.",
        preheader="Accept to help manage the event and check guests in.",
    )
    text = (
        f"{inviter_name} invited you to co-host {event_name}\n\n" + (f"{when}\n\n" if when else "")
        + "As a co-host you can:\n" + "".join(f"- {c}\n" for c in can_text)
        + f"\n{'Accept invite' if is_new_user else 'Open event'}: {event_url}\n\n"
        "Not expecting this? Just ignore this email. Nothing changes unless you accept.\n"
        + ("If you don't have a byro account yet, you can create one when you accept.\n" if is_new_user else "")
        + "\nByro Team\nsupport@usebyro.com"
    )
    return {"subject": f"{inviter_name} invited you to co-host {event_name}", "html": html, "text": text}


def _payout_destination(bank_name, account_number):
    last4 = (account_number or "")[-4:]
    return f"{_h(bank_name)} ••••{last4}" if last4 else _h(bank_name)


def payout_requested_email(name, amount, bank_name, account_number, event_name=None, requested_at=None,
                           reference=None, payouts_url=None):
    """To the organiser, right after they ask for a payout."""
    shown = _money(amount)
    url = payouts_url or "https://usebyro.com/dashboard/payouts"
    rows = [("To", _payout_destination(bank_name, account_number))]
    if requested_at:
        rows.append(("Requested", _h(requested_at)))
    if reference:
        rows.append(("Reference", _h(reference)))

    amount_block = (
        f'<div style="margin:0 0 20px;"><div style="font-size:13px;font-weight:800;letter-spacing:0.08em;color:{MUTED};">AMOUNT</div>'
        f'<div style="font-family:{DISPLAY_STACK};font-size:44px;font-weight:700;color:{INK};line-height:1.2;">{shown}</div></div>'
    )
    body_html = (
        _lead("We&#8217;re reviewing it now.") + amount_block + _rows(rows)
        + _timeline([("Requested", "Just now", True), ("Approved", "Usually within 24 hours", False),
                     ("Paid to your bank", "We&#8217;ll email you when it lands", False)])
        + '<div style="height:14px;"></div>'
        + _btn_row(_btn(url, "View payouts", primary=False))
    )
    html = _shell(
        _badge("Payout", TIME, TIME_BG),
        "We got your payout request",
        body_html,
        "You&#8217;re getting this because a payout was requested from your byro account. Didn&#8217;t request it? Reply right away.",
        preheader="We&#8217;re reviewing it now. Here&#8217;s what happens next.",
    )
    text = (
        f"We got your payout request\n\nWe're reviewing it now.\n\nAmount: {shown}\n"
        + "".join(f"{label}: {value}\n" for label, value in [("To", f'{bank_name} ••••{(account_number or "")[-4:]}'), ("Requested", requested_at), ("Reference", reference)] if value)
        + "\nRequested: just now\nApproved: usually within 24 hours\nPaid to your bank: we'll email you when it lands\n\n"
        f"View payouts: {url}\n\nIf you didn't request this, reply right away.\n\nByro Team\nsupport@usebyro.com"
    )
    return {"subject": f"We got your payout request for {shown}", "html": html, "text": text}


def payout_completed_email(name, amount, bank_name, account_number, event_name=None, paid_on=None,
                           reference=None, payouts_url=None):
    """To the organiser, once a payout has been paid."""
    shown = _money(amount)
    url = payouts_url or "https://usebyro.com/dashboard/payouts"
    rows = [("To", _payout_destination(bank_name, account_number))]
    if paid_on:
        rows.append(("Paid on", _h(paid_on)))
    if reference:
        rows.append(("Reference", _h(reference)))

    banner = (
        f'<table cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 20px;"><tr><td style="background:#E3F5EC;border-radius:20px;padding:24px;">'
        f'<table cellpadding="0" cellspacing="0"><tr><td style="background:#ffffff;border-radius:999px;padding:6px 12px;color:#1F6B47;font-size:12px;font-weight:800;letter-spacing:0.08em;">PAID</td></tr></table>'
        f'<div style="font-family:{DISPLAY_STACK};font-size:52px;font-weight:700;line-height:1.1;color:{INK};padding-top:6px;">{shown}</div>'
        f'<div style="font-size:16px;font-weight:700;color:#1F6B47;">is on its way to your bank</div></td></tr></table>'
    )
    body_html = (
        banner + _rows(rows)
        + _small("Depending on your bank, it can take a little while to show in your account. If it hasn&#8217;t arrived after 24 hours, reply with the reference above.")
        + _btn_row(_btn(url, "View payouts", primary=False))
    )
    html = _shell(
        "", None, body_html,
        "You&#8217;re getting this because you requested a payout from your byro account.",
        preheader="Your payout is complete.",
    )
    text = (
        f"{shown} is on its way to your bank\n\n"
        + "".join(f"{label}: {value}\n" for label, value in [("To", f'{bank_name} ••••{(account_number or "")[-4:]}'), ("Paid on", paid_on), ("Reference", reference)] if value)
        + "\nDepending on your bank, it can take a little while to show in your account. If it hasn't arrived after 24 hours, "
        f"reply with the reference above.\n\nView payouts: {url}\n\nByro Team\nsupport@usebyro.com"
    )
    return {"subject": f"{shown} has been paid to your bank", "html": html, "text": text}


def event_cancelled_email(name, event_name, date, time, location, reason, refund_amount=None,
                          refund_state='arranged', event_url=None):
    """
    Sent to people holding a ticket when an organiser cancels an event.

    `refund_amount` is the ticket price coming back to this person (a Decimal),
    or None for free tickets and for people who did not pay. Byro's service fee
    and the payment charge are not refundable, and the email says so.

    `refund_state` says how far the refund has got:
      'arranged' - sent when the event is cancelled: the refund is being arranged
      'sent'     - sent once the refund has actually gone to Paystack

    The organiser's reason is free text, so it is escaped here.
    """
    from html import escape

    safe_name = escape(name or "there")
    safe_event = escape(event_name)
    safe_reason = escape(reason or "").strip()
    page_url = event_url or "https://usebyro.com"

    when = ", ".join(part for part in [date, time] if part)
    where = f" at {escape(location)}" if location else ""

    reason_html = (
        f"""<p style="color:{BODY};font-size:15px;line-height:1.6;margin:0 0 20px;"><strong style="color:{INK};">Reason from the organiser:</strong> {safe_reason}</p>"""
        if safe_reason else ""
    )

    if refund_amount is not None:
        amount = f"₦{refund_amount:,.2f}".replace(".00", "")
        fees_note = (
            "That is the ticket price you paid, after any discount code. Byro&#8217;s service fee and the "
            "payment processing charge cannot be refunded."
        )
        if refund_state == 'sent':
            how_html = (
                f"{fees_note} Your refund has been sent to the card or bank account you paid with. "
                "It usually shows up within 3&#8211;10 business days, depending on your bank."
            )
            how_text = (
                "That is the ticket price you paid, after any discount code. Byro's service fee and the payment "
                "processing charge cannot be refunded. Your refund has been sent to the card or bank account you "
                "paid with. It usually shows up within 3-10 business days, depending on your bank.\n\n"
            )
            label = "Refund sent"
            headline = f"Your refund for {event_name} has been sent."
            subject = f"Your refund of {amount} for {event_name} has been sent"
        else:
            how_html = (
                f"{fees_note} We will send it to the card or bank account you paid with, and we will email you "
                "again as soon as it has been sent. There is nothing you need to do."
            )
            how_text = (
                "That is the ticket price you paid, after any discount code. Byro's service fee and the payment "
                "processing charge cannot be refunded. We will send it to the card or bank account you paid with "
                "and email you again as soon as it has been sent. There is nothing you need to do.\n\n"
            )
            label = "Your refund"
            headline = f"{event_name} was cancelled. Your refund is being arranged."
            subject = f"{event_name} has been cancelled: your refund of {amount}"
        money_html = f"""
        <table cellpadding="0" cellspacing="0" style="width:100%;background:{SURFACE};border:1px solid {BORDER};border-radius:18px;margin:0 0 20px;">
          <tr>{_cell(label, amount, colspan=2)}</tr>
        </table>
        <p style="color:{BODY};font-size:14px;line-height:1.6;margin:0 0 24px;">{how_html}</p>"""
        money_text = f"{label}: {amount}\n{how_text}"
    else:
        money_html = f"""<p style="color:{BODY};font-size:14px;line-height:1.6;margin:0 0 24px;">
          Your ticket is no longer valid and nothing further is needed from you.
        </p>"""
        money_text = "Your ticket is no longer valid and nothing further is needed from you.\n\n"
        headline = f"{event_name} has been cancelled."
        subject = f"{event_name} has been cancelled"

    if refund_state == 'sent' and refund_amount is not None:
        intro_html = f"""<p style="color:{BODY};font-size:15px;line-height:1.6;margin:0 0 20px;">
          Hi {safe_name}, your refund for <strong style="color:{INK};">{safe_event}</strong>, which the organiser cancelled, is on its way.
        </p>"""
        intro_text = f"Hi {name or 'there'},\n\nYour refund for {event_name}, which the organiser cancelled, is on its way.\n\n"
        reason_html, reason_text = "", ""
    else:
        intro_html = f"""<p style="color:{BODY};font-size:15px;line-height:1.6;margin:0 0 20px;">
          Hi {safe_name}, we&#8217;re sorry: the organiser has cancelled <strong style="color:{INK};">{safe_event}</strong>
          ({escape(when)}{where}).
        </p>"""
        intro_text = (
            f"Hi {name or 'there'},\n\n"
            f"We're sorry: the organiser has cancelled {event_name} ({when}{' at ' + location if location else ''}).\n\n"
        )
        reason_text = f"Reason from the organiser: {reason}\n\n" if reason else ""

    body_html = f"""
        {intro_html}
        {reason_html}
        {money_html}
        {_text_link(page_url, "See the event page")}
    """

    html = _shell(
        _badge("Refund sent" if (refund_state == 'sent' and refund_amount is not None) else "Cancelled", "#8A1C1C", "#FDECEC"),
        escape(headline),
        body_html,
        "You&#8217;re getting this because you held a ticket for this event on Byro.",
    )

    text = (
        intro_text + reason_text + money_text
        + f"Event page: {page_url}\n\n"
        "Byro Team\nsupport@usebyro.com"
    )

    return {"subject": subject, "html": html, "text": text}


def refunds_awaiting_email(event_name, owner_email, order_count, total, admin_url):
    """To the Byro team: an organiser cancelled an event, and its refunds need sending."""
    from html import escape

    amount = f"₦{total:,.2f}".replace(".00", "")
    body_html = f"""
        <p style="color:{BODY};font-size:15px;line-height:1.6;margin:0 0 20px;">
          <strong style="color:{INK};">{escape(event_name)}</strong> (organiser: {escape(owner_email)}) was cancelled.
          {order_count} refund{'s' if order_count != 1 else ''} totalling <strong style="color:{INK};">{amount}</strong>
          {'are' if order_count != 1 else 'is'} waiting for you to send. Check the Paystack balance first, then approve them in the admin panel.
        </p>
        {_button(admin_url, "Open refunds", BRAND)}
    """
    html = _shell(_badge("Refunds waiting", TIME, TIME_BG), "Refunds need sending", body_html,
                  "Internal notice for the Byro team.")
    text = (
        f"{event_name} (organiser: {owner_email}) was cancelled.\n"
        f"{order_count} refund(s) totalling {amount} are waiting for you to send.\n"
        f"Check the Paystack balance first, then approve them: {admin_url}\n"
    )
    return {"subject": f"Refunds to send: {event_name} was cancelled ({amount})", "html": html, "text": text}
