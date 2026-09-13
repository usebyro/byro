"""
Transactional email templates for Byro.
Each function returns a dict: { subject, html, text }

Shared visual system: one 560px card, one type scale, and four status
colors that mean something rather than varying per template —
    neutral (slate)  confirmations, invitations
    time    (amber)  reminders
    growth  (violet) sales momentum — milestones, going live
    money   (green)  payouts
Each color is used for exactly two things: the small status badge at the
top of the email, and the primary button below it — so "what happened"
and "what to do next" always read as the same color per email.
"""

INK = "#0f172a"
BODY = "#64748b"
MUTED = "#94a3b8"
BORDER = "#e2e8f0"
SURFACE = "#f8fafc"
PAGE_BG = "#f1f5f9"

NEUTRAL = "#334155"
NEUTRAL_BG = "#f1f5f9"
TIME = "#b45309"
TIME_BG = "#fffbeb"
GROWTH = "#6d28d9"
GROWTH_BG = "#f5f3ff"
MONEY = "#047857"
MONEY_BG = "#ecfdf5"

FONT_STACK = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif"


def _badge(label, color, bg):
    return f"""<table cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
      <tr>
        <td style="background:{bg};border-radius:20px;padding:6px 14px;">
          <span style="color:{color};font-size:12px;font-weight:700;">{label}</span>
        </td>
      </tr>
    </table>"""


def _button(url, label, color):
    return f"""<a href="{url}" style="display:block;background:{color};color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;padding:16px 32px;border-radius:12px;text-align:center;">{label}</a>"""


def _text_link(url, label):
    return f"""<p style="text-align:center;margin:16px 0 0;">
      <a href="{url}" style="color:{BODY};font-size:14px;font-weight:600;text-decoration:underline;">{label}</a>
    </p>"""


def _cell(label, value, mono=False, colspan=None):
    font = "font-family:'Courier New',Courier,monospace;letter-spacing:0.02em;" if mono else ""
    span = f' colspan="{colspan}"' if colspan else ""
    width = "" if colspan else "width:50%;"
    return f"""<td{span} style="{width}padding-bottom:16px;vertical-align:top;">
      <p style="color:{MUTED};font-size:11px;font-weight:700;letter-spacing:0.02em;margin:0 0 4px;">{label}</p>
      <p style="color:{INK};font-size:14px;font-weight:600;margin:0;{font}">{value}</p>
    </td>"""


def _shell(badge_html, headline, body_html, footer_text):
    return f"""
<div style="background-color:{PAGE_BG};padding:40px 16px;font-family:{FONT_STACK};">
  <table cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;width:100%;">
    <tr>
      <td style="background:#ffffff;border-radius:16px;padding:40px 32px 36px;box-shadow:0 2px 8px rgba(15,23,42,0.06);">
        {badge_html}
        <h1 style="margin:0 0 14px;font-size:26px;font-weight:700;color:{INK};line-height:1.3;">{headline}</h1>
        {body_html}
      </td>
    </tr>
    <tr>
      <td style="text-align:center;padding:28px 16px;">
        <p style="color:{MUTED};font-size:12px;line-height:1.6;margin:0;">{footer_text}</p>
      </td>
    </tr>
  </table>
</div>"""


def ticket_confirmation_email(name, event_name, date, time, location, ticket_id, form_answers=None, ticket_url=None):
    """
    Ticket confirmation email — sent for both free and paid tickets.

    Args:
        name (str): Customer's name.
        event_name (str): Event name.
        date (str): Formatted event date e.g. "Saturday, July 5, 2026".
        time (str): Formatted start time e.g. "6:00 PM".
        location (str): Event location.
        ticket_id (str): UUID of the ticket.
        form_answers (list[dict], optional): List of {"question": str, "answer": str}.
        ticket_url (str, optional): Link to the attendee's ticket page. A ticket
            image (event details + QR code) is attached to this email
            separately (see mailer.send_email's `attachments` param).
    """
    view_ticket_url = ticket_url or "https://usebyro.com"

    time_cell = _cell("Doors", time) if time else "<td></td>"
    location_row = f"<tr>{_cell('Venue', location, colspan=2)}</tr>" if location else ""

    details_grid = f"""
    <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;">
      <tr>
        {_cell("Date", date)}
        {time_cell}
      </tr>
      {location_row}
    </table>"""

    ticket_id_section = ""
    if ticket_id:
        ticket_id_section = f"""
    <table cellpadding="0" cellspacing="0" style="width:100%;">
      <tr>
        <td>
          <p style="color:{MUTED};font-size:11px;font-weight:700;margin:0 0 6px;">Scan at entry</p>
          <p style="color:{INK};font-size:15px;font-weight:700;font-family:'Courier New',Courier,monospace;margin:0 0 4px;letter-spacing:0.04em;">{ticket_id}</p>
          <p style="color:{MUTED};font-size:12px;margin:0;">Your ticket is attached to this email. Present it at the gate for entry</p>
        </td>
      </tr>
    </table>"""

    form_section = ""
    form_rows_text = ""
    if form_answers:
        rows_html = ""
        for i, entry in enumerate(form_answers):
            q = entry.get("question", "")
            a = entry.get("answer", "")
            if not q or not a:
                continue
            border = f"border-top:1px solid {BORDER};" if i > 0 else ""
            padding_top = "10px" if i > 0 else "0"
            rows_html += f"""
          <table cellpadding="0" cellspacing="0" style="width:100%;{border}">
            <tr><td style="padding:{padding_top} 0 0;">
              <p style="color:{MUTED};font-size:11px;margin:0 0 3px;">{q}</p>
              <p style="color:{INK};font-size:14px;font-weight:500;margin:0;">{a}</p>
            </td></tr>
          </table>"""
            form_rows_text += f"{q}: {a}\n"

        if rows_html:
            form_section = f"""
    <table cellpadding="0" cellspacing="0" style="width:100%;background:{SURFACE};border:1px solid {BORDER};border-radius:12px;margin-bottom:24px;">
      <tr>
        <td style="padding:20px;">
          <p style="color:{MUTED};font-size:11px;font-weight:700;margin:0 0 14px;">Registration details</p>
          {rows_html}
        </td>
      </tr>
    </table>"""

    body_html = f"""
        <p style="color:{BODY};font-size:15px;line-height:1.6;margin:0 0 28px;">
          Hi {name}, your booking is confirmed. Show your ticket ID at the gate for entry.
        </p>

        <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:separate;border-spacing:0;border-radius:16px;overflow:hidden;margin-bottom:24px;">
          <tr>
            <td style="background:linear-gradient(135deg,#0f0a2e 0%,#4c1d95 50%,#a855f7 100%);padding:28px 24px 24px;border-radius:16px 16px 0 0;">
              <table cellpadding="0" cellspacing="0" style="margin-bottom:14px;">
                <tr>
                  <td style="background:rgba(255,255,255,0.15);border-radius:20px;padding:4px 12px;">
                    <span style="color:#ffffff;font-size:11px;font-weight:700;">&#9679; Event</span>
                  </td>
                </tr>
              </table>
              <h2 style="color:#ffffff;font-size:22px;font-weight:700;margin:0;line-height:1.3;">{event_name}</h2>
            </td>
          </tr>
          <tr>
            <td style="background:{SURFACE};padding:20px 24px;border:1px solid {BORDER};border-top:none;border-radius:0 0 16px 16px;">
              {details_grid}
              <table cellpadding="0" cellspacing="0" style="width:100%;margin:8px 0 20px;">
                <tr><td style="border-top:2px dashed #cbd5e1;font-size:0;line-height:0;">&nbsp;</td></tr>
              </table>
              {ticket_id_section}
            </td>
          </tr>
        </table>

        {form_section}

        {_button(view_ticket_url, "View my tickets", NEUTRAL)}

        <p style="text-align:center;color:{MUTED};font-size:13px;margin:16px 0 0;">
          A calendar invite is attached to this email
        </p>
    """

    html = _shell(
        _badge("Booking confirmed", NEUTRAL, NEUTRAL_BG),
        "You're in. See you there.",
        body_html,
        'You\'re getting this because you signed up for an event on Byro. '
        f'<a href="mailto:support@usebyro.com?subject=Unsubscribe" style="color:{MUTED};text-decoration:underline;">Unsubscribe</a>',
    )

    plain_text = (
        f"Hi {name},\n\n"
        f"Your booking is confirmed! Your ticket for {event_name} is ready.\n\n"
        f"Date: {date}\n"
    )
    if time:
        plain_text += f"Doors: {time}\n"
    if location:
        plain_text += f"Venue: {location}\n"
    if ticket_id:
        plain_text += f"Ticket ID: {ticket_id}\n"
    if form_rows_text:
        plain_text += f"\nRegistration Details:\n{form_rows_text}"
    plain_text += (
        f"\nYour ticket is attached to this email. Present it at the gate for entry.\n"
        f"A calendar invite is also attached to this email.\n"
        f"View your ticket online: {view_ticket_url}\n\n"
        f"Best regards,\nByro Team\nsupport@usebyro.com\n\n"
        f"You're getting this because you signed up for an event on Byro."
    )

    return {
        "subject": f"Your Ticket for {event_name} is Confirmed!",
        "html": html,
        "text": plain_text,
    }


def event_reminder_email(name, event_name, date, time, location, ticket_url=None, virtual_link=None):
    """
    Attendee reminder email — sent ~24h before the event starts.

    Args:
        name (str): Attendee's name.
        event_name (str): Event name.
        date (str): Formatted event date e.g. "Saturday, July 5, 2026".
        time (str): Formatted start time e.g. "6:00 PM".
        location (str): Event location.
        ticket_url (str, optional): Link to the attendee's ticket page.
        virtual_link (str, optional): Link to join, for virtual/hybrid events.
    """
    view_ticket_url = ticket_url or "https://usebyro.com"

    location_row = f"<tr>{_cell('Venue', location, colspan=2)}</tr>" if location else ""
    location_row_text = f"Venue: {location}\n" if location else ""

    virtual_row = f"<tr>{_cell('Join link', virtual_link, colspan=2)}</tr>" if virtual_link else ""
    virtual_row_text = f"Join link: {virtual_link}\n" if virtual_link else ""

    body_html = f"""
        <p style="color:{BODY};font-size:15px;line-height:1.6;margin:0 0 28px;">
          Hi {name}, just a reminder: {event_name} is happening tomorrow. Here are the details:
        </p>

        <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;background:{SURFACE};border:1px solid {BORDER};border-radius:12px;margin-bottom:24px;">
          <tr>{_cell("Date", date)}{_cell("Doors", time)}</tr>
          {location_row}
          {virtual_row}
          <tr><td colspan="2" style="height:4px;"></td></tr>
        </table>

        {_button(view_ticket_url, "View my ticket", TIME)}
    """

    html = _shell(
        _badge("Tomorrow", TIME, TIME_BG),
        f"{event_name} is tomorrow.",
        body_html,
        'You\'re getting this because you have a ticket for this event on Byro. '
        f'<a href="mailto:support@usebyro.com?subject=Unsubscribe" style="color:{MUTED};text-decoration:underline;">Unsubscribe</a>',
    )

    plain_text = (
        f"Hi {name},\n\n"
        f"Just a reminder: {event_name} is happening tomorrow.\n\n"
        f"Date: {date}\n"
        f"Doors: {time}\n"
        f"{location_row_text}"
        f"{virtual_row_text}\n"
        f"View your ticket: {view_ticket_url}\n\n"
        f"See you there,\nByro Team\nsupport@usebyro.com"
    )

    return {
        "subject": f"Reminder: {event_name} is tomorrow",
        "html": html,
        "text": plain_text,
    }


def organizer_event_reminder_email(name, event_name, date, time, tickets_sold, dashboard_url=None):
    """
    Organizer heads-up email — sent ~24h before the event starts, same run
    as the attendee reminder.

    Args:
        name (str): Organizer's/co-host's name.
        event_name (str): Event name.
        date (str): Formatted event date.
        time (str): Formatted start time.
        tickets_sold (int): Total paid + free tickets issued so far.
        dashboard_url (str, optional): Link to the event's organizer dashboard.
    """
    view_dashboard_url = dashboard_url or "https://usebyro.com"
    ticket_word = "ticket" if tickets_sold == 1 else "tickets"

    body_html = f"""
        <p style="color:{BODY};font-size:15px;line-height:1.6;margin:0 0 28px;">
          Hi {name}, {event_name} is happening tomorrow at {time}. You've sold <strong style="color:{INK};">{tickets_sold}</strong> {ticket_word} so far. Good time for a final check on staffing and check-in.
        </p>

        <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;background:{SURFACE};border:1px solid {BORDER};border-radius:12px;margin-bottom:24px;">
          <tr>{_cell("Date", date)}{_cell("Doors", time)}</tr>
          <tr><td colspan="2" style="height:4px;"></td></tr>
        </table>

        {_button(view_dashboard_url, "Open dashboard", TIME)}
    """

    html = _shell(
        _badge("Tomorrow", TIME, TIME_BG),
        f"{event_name} starts tomorrow.",
        body_html,
        "&#169; 2026 Byro Technologies. All rights reserved.",
    )

    plain_text = (
        f"Hi {name},\n\n"
        f"{event_name} is happening tomorrow, {date} at {time}.\n\n"
        f"You've sold {tickets_sold} {ticket_word} so far.\n\n"
        f"Dashboard: {view_dashboard_url}\n\n"
        f"Best regards,\nByro Team\nsupport@usebyro.com"
    )

    return {
        "subject": f"{event_name} is tomorrow: {tickets_sold} tickets sold",
        "html": html,
        "text": plain_text,
    }


def milestone_reached_email(name, event_name, milestone, tickets_sold, dashboard_url=None):
    """
    Organizer milestone email — sent when total tickets sold for an event
    crosses a threshold (1st sale, 10, 25, 50, 100, then every 100).

    Args:
        name (str): Organizer's/co-host's name.
        event_name (str): Event name.
        milestone (int): The threshold just crossed.
        tickets_sold (int): Total paid + free tickets issued right now.
        dashboard_url (str, optional): Link to the event's organizer dashboard.
    """
    view_dashboard_url = dashboard_url or "https://usebyro.com"
    headline = "Your first ticket just sold!" if milestone == 1 else f"You've hit {milestone} tickets sold!"
    ticket_word = "ticket" if tickets_sold == 1 else "tickets"

    body_html = f"""
        <p style="color:{BODY};font-size:15px;line-height:1.6;margin:0 0 28px;">
          Hi {name}, <strong style="color:{INK};">{event_name}</strong> has now sold <strong style="color:{INK};">{tickets_sold}</strong> {ticket_word} in total.
        </p>

        {_button(view_dashboard_url, "Open dashboard", GROWTH)}
    """

    html = _shell(
        _badge("Milestone", GROWTH, GROWTH_BG),
        headline,
        body_html,
        "&#169; 2026 Byro Technologies. All rights reserved.",
    )

    plain_text = (
        f"Hi {name},\n\n"
        f"{headline}\n\n"
        f"{event_name} has now sold {tickets_sold} {ticket_word} in total.\n\n"
        f"Dashboard: {view_dashboard_url}\n\n"
        f"Best regards,\nByro Team\nsupport@usebyro.com"
    )

    return {
        "subject": f"{event_name}: {headline}",
        "html": html,
        "text": plain_text,
    }


def event_published_email(name, event_name, date, time, location, event_url, share_cta_url=None, is_first_event=True):
    """
    Event published email — sent to the organizer right after an event goes live.

    Two variants share the same layout: a first-timer gets a more instructive
    push ("do this first"), a returning organizer gets a shorter one that
    assumes they already know the playbook.

    Args:
        name (str): Organizer's name.
        event_name (str): Event name.
        date (str): Formatted event date e.g. "Saturday, July 5, 2026".
        time (str): Formatted start time e.g. "6:00 PM".
        location (str): Event location.
        event_url (str): Link to the public event page ("View Event").
        share_cta_url (str, optional): Link for the primary share CTA — opens
            the in-app share options (WhatsApp, X, copy link, etc). Falls
            back to event_url if not given.
        is_first_event (bool): True if this is the organizer's first-ever
            published event.
    """
    primary_url = share_cta_url or event_url

    if is_first_event:
        subject = "Your first event is live. Here's how to sell it out."
        headline = "You're live. Here's how to sell it out."
        intro_html = (
            f"<p style=\"color:{BODY};font-size:15px;line-height:1.6;margin:0 0 16px;\">"
            f"Hi {name}, <strong style=\"color:{INK};\">{event_name}</strong> is published on Byro. "
            f"That's the hard part done. Now for the part that actually fills the room."
            f"</p>"
            f"<p style=\"color:{BODY};font-size:15px;line-height:1.6;margin:0 0 28px;\">"
            f"Nobody buys a ticket to an event they've never heard of. Do this first: DM five people "
            f"right now with your event link. That single move outsells a week of hoping people find your page on their own."
            f"</p>"
        )
        intro_text = (
            f"Hi {name},\n\n"
            f"{event_name} is published on Byro. That's the hard part done, now for the part that actually fills the room.\n\n"
            f"Nobody buys a ticket to an event they've never heard of. Do this first: DM five people right now with your event link.\n\n"
        )
        primary_label = "Get my first 5 RSVPs"
    else:
        subject = f"{event_name} is live. You already know what works."
        headline = "You're live. You know what works."
        intro_html = (
            f"<p style=\"color:{BODY};font-size:15px;line-height:1.6;margin:0 0 28px;\">"
            f"Hi {name}, <strong style=\"color:{INK};\">{event_name}</strong> is published. You've done this before: "
            f"the tickets you sell yourself beat the ones you wait for."
            f"</p>"
        )
        intro_text = (
            f"Hi {name},\n\n"
            f"{event_name} is published. You've done this before, so you know the drill: the tickets you sell yourself beat the ones you wait for.\n\n"
        )
        primary_label = "Sell my first tickets"

    location_row = f"<tr>{_cell('Venue', location, colspan=2)}</tr>" if location else ""

    details_grid = f"""
    <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;background:{SURFACE};border:1px solid {BORDER};border-radius:12px;margin-bottom:24px;">
      <tr>{_cell("Date", date)}{_cell("Doors", time)}</tr>
      {location_row}
      <tr><td colspan="2" style="height:4px;"></td></tr>
    </table>"""

    body_html = f"""
        {intro_html}
        {details_grid}
        {_button(primary_url, primary_label, GROWTH)}
        {_text_link(event_url, "View event page")}
    """

    html = _shell(
        _badge("Published", GROWTH, GROWTH_BG),
        headline,
        body_html,
        'You\'re getting this because you published an event on Byro. '
        f'<a href="mailto:support@usebyro.com?subject=Unsubscribe" style="color:{MUTED};text-decoration:underline;">Unsubscribe</a>',
    )

    plain_text = (
        f"{intro_text}"
        f"Event: {event_name} ({event_url})\n"
        f"Date: {date}\n"
        f"Doors: {time}\n"
    )
    if location:
        plain_text += f"Venue: {location}\n"
    plain_text += (
        f"\n{primary_label}: {primary_url}\n"
        f"View Event: {event_url}\n\n"
        f"Best regards,\nByro Team\nsupport@usebyro.com\n\n"
        f"You're getting this because you published an event on Byro."
    )

    return {
        "subject": subject,
        "html": html,
        "text": plain_text,
    }


def cohost_invite_email(event_name, inviter_name, event_url, is_new_user=False):
    """
    Co-host invitation email.

    Sent when an organiser adds someone as a co-host. The invitee may not have a
    Byro account yet — `is_new_user` switches the call to action from "open the
    event" to "sign in to accept", since the grant stays pending until they sign
    in with this address.

    Args:
        event_name (str): Event they have been invited to co-host.
        inviter_name (str): Display name or email of the organiser who invited them.
        event_url (str): Link to the event page.
        is_new_user (bool): True when the invitee has no Byro account yet.
    """
    if is_new_user:
        lead = f"{inviter_name} has invited you to co-host <strong style=\"color:{INK};\">{event_name}</strong> on Byro."
        instruction = (
            "Sign in with this email address to accept the invitation. "
            "Your co-host access activates as soon as you do."
        )
        cta = "Sign in to accept"
    else:
        lead = f"{inviter_name} has added you as a co-host of <strong style=\"color:{INK};\">{event_name}</strong> on Byro."
        instruction = "You can now edit the event, view attendees and check people in at the door."
        cta = "Open the event"

    body_html = f"""
        <p style="color:{BODY};font-size:15px;line-height:1.6;margin:0 0 16px;">{lead}</p>
        <p style="color:{BODY};font-size:15px;line-height:1.6;margin:0 0 28px;">{instruction}</p>
        {_button(event_url, cta, NEUTRAL)}
        <p style="color:{MUTED};font-size:12px;line-height:1.6;margin:24px 0 0;border-top:1px solid {BORDER};padding-top:20px;">
          If you weren't expecting this, you can safely ignore this email. Nothing changes until you sign in.
        </p>
    """

    html = _shell(
        _badge("Co-host invite", NEUTRAL, NEUTRAL_BG),
        f"You've been invited to co-host {event_name}.",
        body_html,
        "&#169; 2026 Byro Technologies. All rights reserved.",
    )

    plain_text = (
        f"{inviter_name} has invited you to co-host {event_name} on Byro.\n\n"
        f"{instruction}\n\n"
        f"{cta}: {event_url}\n\n"
        f"If you weren't expecting this, you can safely ignore this email.\n\n"
        f"Best regards,\nByro Team\nsupport@usebyro.com"
    )

    return {
        "subject": f"You've been invited to co-host {event_name}",
        "html": html,
        "text": plain_text,
    }


def payout_requested_email(name, amount, bank_name, account_number, event_name=None):
    """
    Payout requested email — sent when organizer submits a payout request.

    Args:
        name (str): Organizer's name.
        amount (decimal): Payout amount.
        bank_name (str): Bank name.
        account_number (str): Account number.
        event_name (str, optional): Event name if payout is for a specific event.
    """
    formatted_amount = f"₦{amount:,.0f}"

    event_cell = _cell("Event", event_name) if event_name else "<td></td>"
    event_section_text = f"\nEvent: {event_name}" if event_name else ""

    body_html = f"""
        <p style="color:{BODY};font-size:15px;line-height:1.6;margin:0 0 28px;">
          Hi {name}, your payout request has been initiated.
        </p>

        <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin-bottom:24px;">
          <tr>{_cell("Amount", formatted_amount)}{_cell("Bank", bank_name)}</tr>
          <tr>{_cell("Account number", account_number, mono=True)}{event_cell}</tr>
        </table>

        <table cellpadding="0" cellspacing="0" style="width:100%;background:{SURFACE};border:1px solid {BORDER};border-radius:12px;">
          <tr>
            <td style="padding:16px 20px;">
              <p style="color:{BODY};font-size:14px;line-height:1.5;margin:0;">
                Payouts are processed within 24 hours. We'll send you a confirmation once it's completed.
              </p>
            </td>
          </tr>
        </table>
    """

    html = _shell(
        _badge("Payout initiated", MONEY, MONEY_BG),
        "Your payout is on the way.",
        body_html,
        f'If you have any questions, kindly reach out to <a href="mailto:support@usebyro.com" style="color:{MONEY};text-decoration:underline;">support@usebyro.com</a><br/>&#169; 2026 Byro Technologies. All rights reserved.',
    )

    plain_text = (
        f"Hi {name},\n\n"
        f"Your payout request has been initiated.\n\n"
        f"Amount: {formatted_amount}\n"
        f"Bank: {bank_name}\n"
        f"Account Number: {account_number}"
        f"{event_section_text}\n\n"
        f"Payouts are processed within 24 hours. We'll send you a confirmation once it's completed.\n\n"
        f"If you have any questions, kindly reach out to support@usebyro.com.\n\n"
        f"Thanks,\n"
        f"The Byro Team"
    )

    return {
        "subject": f"Your Payout Request of {formatted_amount} has been Initiated",
        "html": html,
        "text": plain_text,
    }


def payout_completed_email(name, amount, bank_name, account_number, event_name=None):
    """
    Payout completed email — sent when admin marks payout as processed.

    Args:
        name (str): Organizer's name.
        amount (decimal): Payout amount.
        bank_name (str): Bank name.
        account_number (str): Account number.
        event_name (str, optional): Event name if payout is for a specific event.
    """
    formatted_amount = f"₦{amount:,.0f}"

    event_cell = _cell("Event", event_name) if event_name else "<td></td>"
    event_row_text = f"\nEvent: {event_name}" if event_name else ""

    body_html = f"""
        <p style="color:{BODY};font-size:15px;line-height:1.6;margin:0 0 28px;">
          Hi {name}, your payout has been processed and sent to your bank account.
        </p>

        <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin-bottom:8px;">
          <tr>{_cell("Amount", formatted_amount)}{_cell("Bank", bank_name)}</tr>
          <tr>{_cell("Account number", account_number, mono=True)}{event_cell}</tr>
        </table>
    """

    html = _shell(
        _badge("Payout completed", MONEY, MONEY_BG),
        "You've been paid.",
        body_html,
        f'If you have any questions, kindly reach out to <a href="mailto:support@usebyro.com" style="color:{MONEY};text-decoration:underline;">support@usebyro.com</a><br/>&#169; 2026 Byro Technologies. All rights reserved.',
    )

    plain_text = (
        f"Hi {name},\n\n"
        f"Your payout has been completed.\n\n"
        f"Amount: {formatted_amount}\n"
        f"Bank: {bank_name}\n"
        f"Account Number: {account_number}"
        f"{event_row_text}\n\n"
        f"If you have any questions, kindly reach out to support@usebyro.com.\n\n"
        f"Thanks,\n"
        f"The Byro Team"
    )

    return {
        "subject": f"Your Payout of {formatted_amount} has been Completed",
        "html": html,
        "text": plain_text,
    }
