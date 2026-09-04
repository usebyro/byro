"""
Transactional email templates for Byro.
Each function returns a dict: { subject, html, text }
"""


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

    # Details grid
    time_cell = ""
    if time:
        time_cell = f"""<td style="width:50%;padding-bottom:16px;vertical-align:top;">
          <p style="color:#94a3b8;font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;margin:0 0 4px;">Doors</p>
          <p style="color:#0f172a;font-size:14px;font-weight:600;margin:0;">{time}</p>
        </td>"""
    else:
        time_cell = "<td></td>"

    location_row = ""
    if location:
        location_row = f"""<tr>
        <td colspan="2" style="vertical-align:top;">
          <p style="color:#94a3b8;font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;margin:0 0 4px;">Venue</p>
          <p style="color:#0f172a;font-size:14px;font-weight:600;margin:0;">{location}</p>
        </td>
      </tr>"""

    details_grid = f"""
    <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;">
      <tr>
        <td style="width:50%;padding-bottom:16px;vertical-align:top;">
          <p style="color:#94a3b8;font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;margin:0 0 4px;">Date</p>
          <p style="color:#0f172a;font-size:14px;font-weight:600;margin:0;">{date}</p>
        </td>
        {time_cell}
      </tr>
      {location_row}
    </table>"""

    # Ticket ID section
    ticket_id_section = ""
    if ticket_id:
        ticket_id_section = f"""
    <table cellpadding="0" cellspacing="0" style="width:100%;">
      <tr>
        <td>
          <p style="color:#94a3b8;font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;margin:0 0 6px;">Scan at entry</p>
          <p style="color:#0f172a;font-size:15px;font-weight:700;font-family:'Courier New',Courier,monospace;margin:0 0 4px;letter-spacing:0.04em;">{ticket_id}</p>
          <p style="color:#94a3b8;font-size:12px;margin:0;">Your ticket is attached to this email — present it at the gate for entry</p>
        </td>
      </tr>
    </table>"""

    # Registration details from form answers
    form_section = ""
    form_rows_text = ""
    if form_answers:
        rows_html = ""
        for i, entry in enumerate(form_answers):
            q = entry.get("question", "")
            a = entry.get("answer", "")
            if not q or not a:
                continue
            border = "border-top:1px solid #e2e8f0;" if i > 0 else ""
            padding_top = "10px" if i > 0 else "0"
            rows_html += f"""
          <table cellpadding="0" cellspacing="0" style="width:100%;{border}">
            <tr><td style="padding:{padding_top} 0 0;">
              <p style="color:#94a3b8;font-size:11px;margin:0 0 3px;">{q}</p>
              <p style="color:#0f172a;font-size:14px;font-weight:500;margin:0;">{a}</p>
            </td></tr>
          </table>"""
            form_rows_text += f"{q}: {a}\n"

        if rows_html:
            form_section = f"""
    <table cellpadding="0" cellspacing="0" style="width:100%;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;margin-bottom:24px;">
      <tr>
        <td style="padding:20px;">
          <p style="color:#94a3b8;font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;margin:0 0 14px;">Registration Details</p>
          {rows_html}
        </td>
      </tr>
    </table>"""

    html = f"""
<div style="background-color:#f1f5f9;padding:32px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;width:100%;">

    <!-- Main white card -->
    <tr>
      <td style="background:#ffffff;border-radius:16px;padding:36px 32px 32px;box-shadow:0 2px 12px rgba(0,0,0,0.07);">

        <!-- BOOKING CONFIRMED label -->
        <p style="color:#0891b2;font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;margin:0 0 14px;">Booking Confirmed</p>

        <!-- Headline -->
        <h1 style="margin:0 0 16px;font-size:28px;font-weight:800;color:#0f172a;line-height:1.2;">
          You're in. <em style="color:#0891b2;font-style:italic;">See you there.</em>
        </h1>

        <!-- Intro -->
        <p style="color:#64748b;font-size:15px;line-height:1.6;margin:0 0 28px;">
          Hi {name} &#8212; your booking is confirmed. Show your ticket ID at the gate for entry.
        </p>

        <!-- Ticket card -->
        <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:separate;border-spacing:0;border-radius:16px;overflow:hidden;margin-bottom:24px;">
          <!-- Purple gradient header -->
          <tr>
            <td style="background:linear-gradient(135deg,#0f0a2e 0%,#4c1d95 50%,#a855f7 100%);padding:28px 24px 24px;border-radius:16px 16px 0 0;">
              <table cellpadding="0" cellspacing="0" style="margin-bottom:14px;">
                <tr>
                  <td style="background:rgba(255,255,255,0.15);border-radius:20px;padding:4px 12px;">
                    <span style="color:#ffffff;font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;">&#9679; Event</span>
                  </td>
                </tr>
              </table>
              <h2 style="color:#ffffff;font-size:22px;font-weight:700;margin:0;line-height:1.3;">{event_name}</h2>
            </td>
          </tr>
          <!-- White details panel -->
          <tr>
            <td style="background:#f8fafc;padding:20px 24px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 16px 16px;">
              {details_grid}
              <!-- Dashed tear-off divider -->
              <table cellpadding="0" cellspacing="0" style="width:100%;margin:8px 0 20px;">
                <tr><td style="border-top:2px dashed #cbd5e1;font-size:0;line-height:0;">&nbsp;</td></tr>
              </table>
              {ticket_id_section}
            </td>
          </tr>
        </table>

        {form_section}

        <!-- CTA Button -->
        <table cellpadding="0" cellspacing="0" style="width:100%;">
          <tr>
            <td style="text-align:center;">
              <a href="{view_ticket_url}" style="display:block;background:#3b82f6;color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;padding:16px 32px;border-radius:12px;text-align:center;">View my tickets</a>
            </td>
          </tr>
        </table>

      </td>
    </tr>

    <!-- Footer -->
    <tr>
      <td style="text-align:center;padding:24px 16px;">
        <p style="color:#999999;font-size:12px;margin:0;">
          You're getting this because you signed up for an event on Byro.
          <a href="mailto:support@usebyro.com?subject=Unsubscribe" style="color:#999999;text-decoration:underline;">Unsubscribe</a>
        </p>
      </td>
    </tr>

  </table>
</div>"""

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
        f"\nYour ticket is attached to this email — present it at the gate for entry.\n"
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

    location_row = ""
    location_row_text = ""
    if location:
        location_row = f"""
        <tr>
          <td colspan="2" style="padding-top:16px;vertical-align:top;">
            <p style="color:#94a3b8;font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;margin:0 0 4px;">Venue</p>
            <p style="color:#0f172a;font-size:14px;font-weight:600;margin:0;">{location}</p>
          </td>
        </tr>"""
        location_row_text = f"Venue: {location}\n"

    virtual_row = ""
    virtual_row_text = ""
    if virtual_link:
        virtual_row = f"""
        <tr>
          <td colspan="2" style="padding-top:16px;vertical-align:top;">
            <p style="color:#94a3b8;font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;margin:0 0 4px;">Join link</p>
            <p style="color:#0f172a;font-size:14px;font-weight:600;margin:0;word-break:break-all;">{virtual_link}</p>
          </td>
        </tr>"""
        virtual_row_text = f"Join link: {virtual_link}\n"

    html = f"""
<div style="background-color:#f1f5f9;padding:32px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;width:100%;">
    <tr>
      <td style="background:#ffffff;border-radius:16px;padding:36px 32px 32px;box-shadow:0 2px 12px rgba(0,0,0,0.07);">

        <p style="color:#f59e0b;font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;margin:0 0 14px;">Coming up tomorrow</p>

        <h1 style="margin:0 0 16px;font-size:28px;font-weight:800;color:#0f172a;line-height:1.2;">
          {event_name} <em style="color:#f59e0b;font-style:italic;">is almost here.</em>
        </h1>

        <p style="color:#64748b;font-size:15px;line-height:1.6;margin:0 0 28px;">
          Hi {name}, just a reminder — {event_name} is happening tomorrow. Here are the details:
        </p>

        <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:20px;margin-bottom:24px;">
          <tr>
            <td style="padding:20px 20px 0;width:50%;vertical-align:top;">
              <p style="color:#94a3b8;font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;margin:0 0 4px;">Date</p>
              <p style="color:#0f172a;font-size:14px;font-weight:600;margin:0;">{date}</p>
            </td>
            <td style="padding:20px 20px 0;width:50%;vertical-align:top;">
              <p style="color:#94a3b8;font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;margin:0 0 4px;">Doors</p>
              <p style="color:#0f172a;font-size:14px;font-weight:600;margin:0;">{time}</p>
            </td>
          </tr>
          {location_row}
          {virtual_row}
          <tr><td colspan="2" style="height:20px;"></td></tr>
        </table>

        <table cellpadding="0" cellspacing="0" style="width:100%;">
          <tr>
            <td style="text-align:center;">
              <a href="{view_ticket_url}" style="display:block;background:#3b82f6;color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;padding:16px 32px;border-radius:12px;text-align:center;">View my ticket</a>
            </td>
          </tr>
        </table>

      </td>
    </tr>
    <tr>
      <td style="text-align:center;padding:24px 16px;">
        <p style="color:#999999;font-size:12px;margin:0;">
          You're getting this because you have a ticket for this event on Byro.
          <a href="mailto:support@usebyro.com?subject=Unsubscribe" style="color:#999999;text-decoration:underline;">Unsubscribe</a>
        </p>
      </td>
    </tr>
  </table>
</div>"""

    plain_text = (
        f"Hi {name},\n\n"
        f"Just a reminder — {event_name} is happening tomorrow.\n\n"
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

    html = f"""
<div style="background-color:#f8fafc;padding:40px 20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0;">
    <tr>
      <td style="padding:32px 32px 24px;">
        <p style="color:#94a3b8;font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;margin:0 0 12px;">Event starting soon</p>
        <p style="color:#0f172a;font-size:18px;line-height:1.5;margin:0 0 16px;"><strong>{event_name}</strong> is happening tomorrow, {date} at {time}.</p>
        <p style="color:#475569;font-size:14px;line-height:1.6;margin:0 0 24px;">You've sold <strong>{tickets_sold}</strong> ticket{'s' if tickets_sold != 1 else ''} so far. Good time for a final check on attendee numbers, staffing and check-in.</p>
        <a href="{view_dashboard_url}" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 24px;border-radius:8px;">Open dashboard</a>
      </td>
    </tr>
  </table>
</div>"""

    plain_text = (
        f"Hi {name},\n\n"
        f"{event_name} is happening tomorrow, {date} at {time}.\n\n"
        f"You've sold {tickets_sold} ticket{'s' if tickets_sold != 1 else ''} so far.\n\n"
        f"Dashboard: {view_dashboard_url}\n\n"
        f"Best regards,\nByro Team\nsupport@usebyro.com"
    )

    return {
        "subject": f"{event_name} is tomorrow — {tickets_sold} tickets sold",
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

    html = f"""<div style="background-color:#f8fafc;padding:40px 20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0;">
    <tr>
      <td style="padding:32px 32px 24px;">
        <p style="color:#16B979;font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;margin:0 0 12px;">Milestone reached</p>
        <p style="color:#0f172a;font-size:18px;line-height:1.5;margin:0 0 16px;">{headline}</p>
        <p style="color:#475569;font-size:14px;line-height:1.6;margin:0 0 24px;"><strong>{event_name}</strong> has now sold <strong>{tickets_sold}</strong> ticket{'s' if tickets_sold != 1 else ''} in total.</p>
        <a href="{view_dashboard_url}" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 24px;border-radius:8px;">Open dashboard</a>
      </td>
    </tr>
  </table>
</div>"""

    plain_text = (
        f"Hi {name},\n\n"
        f"{headline}\n\n"
        f"{event_name} has now sold {tickets_sold} ticket{'s' if tickets_sold != 1 else ''} in total.\n\n"
        f"Dashboard: {view_dashboard_url}\n\n"
        f"Best regards,\nByro Team\nsupport@usebyro.com"
    )

    return {
        "subject": f"{event_name}: {headline}",
        "html": html,
        "text": plain_text,
    }

def event_published_email(name, event_name, date, time, location, event_url, share_url=None):
    """
    Event published email — sent to the organizer right after an event goes live.

    Args:
        name (str): Organizer's name.
        event_name (str): Event name.
        date (str): Formatted event date e.g. "Saturday, July 5, 2026".
        time (str): Formatted start time e.g. "6:00 PM".
        location (str): Event location.
        event_url (str): Link to the public event page (used for the CTA and share box).
        share_url (str, optional): Link to share, if different from event_url.
    """
    link = share_url or event_url

    location_row = ""
    if location:
        location_row = f"""<tr>
        <td colspan="2" style="vertical-align:top;">
          <p style="color:#94a3b8;font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;margin:0 0 4px;">Venue</p>
          <p style="color:#0f172a;font-size:14px;font-weight:600;margin:0;">{location}</p>
        </td>
      </tr>"""

    details_grid = f"""
    <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;">
      <tr>
        <td style="width:50%;padding-bottom:16px;vertical-align:top;">
          <p style="color:#94a3b8;font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;margin:0 0 4px;">Date</p>
          <p style="color:#0f172a;font-size:14px;font-weight:600;margin:0;">{date}</p>
        </td>
        <td style="width:50%;padding-bottom:16px;vertical-align:top;">
          <p style="color:#94a3b8;font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;margin:0 0 4px;">Doors</p>
          <p style="color:#0f172a;font-size:14px;font-weight:600;margin:0;">{time}</p>
        </td>
      </tr>
      {location_row}
    </table>"""

    html = f"""
<div style="background-color:#f1f5f9;padding:32px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;width:100%;">

    <!-- Main white card -->
    <tr>
      <td style="background:#ffffff;border-radius:16px;padding:36px 32px 32px;box-shadow:0 2px 12px rgba(0,0,0,0.07);">

        <!-- PUBLISHED label -->
        <p style="color:#16B979;font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;margin:0 0 14px;">Published</p>

        <!-- Headline -->
        <h1 style="margin:0 0 16px;font-size:28px;font-weight:800;color:#0f172a;line-height:1.2;">
          You're live. <em style="color:#16B979;font-style:italic;">Now go get your crowd.</em>
        </h1>

        <!-- Intro -->
        <p style="color:#64748b;font-size:15px;line-height:1.6;margin:0 0 16px;">
          Hi {name}, <strong style="color:#0f172a;">{event_name}</strong> is live. Nobody buys a ticket to an event they've never heard of, so the very next thing worth doing is telling people, before you do anything else.
        </p>
        <p style="color:#64748b;font-size:15px;line-height:1.6;margin:0 0 28px;">
          The fastest tickets you'll ever sell are the ones you sell yourself: share the link with the people you already know. A DM to five friends will outsell a week of hoping people stumble onto your page.
        </p>

        <!-- Event card -->
        <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:separate;border-spacing:0;border-radius:16px;overflow:hidden;margin-bottom:24px;">
          <tr>
            <td style="background:linear-gradient(135deg,#0f0a2e 0%,#4c1d95 50%,#a855f7 100%);padding:28px 24px 24px;border-radius:16px 16px 0 0;">
              <table cellpadding="0" cellspacing="0" style="margin-bottom:14px;">
                <tr>
                  <td style="background:rgba(255,255,255,0.15);border-radius:20px;padding:4px 12px;">
                    <span style="color:#ffffff;font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;">&#9679; Event</span>
                  </td>
                </tr>
              </table>
              <h2 style="color:#ffffff;font-size:22px;font-weight:700;margin:0;line-height:1.3;">{event_name}</h2>
            </td>
          </tr>
          <tr>
            <td style="background:#f8fafc;padding:20px 24px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 16px 16px;">
              {details_grid}
            </td>
          </tr>
        </table>

        <!-- Share link box -->
        <table cellpadding="0" cellspacing="0" style="width:100%;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;margin-bottom:24px;">
          <tr>
            <td style="padding:16px 20px;">
              <p style="color:#94a3b8;font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;margin:0 0 6px;">Your event link</p>
              <p style="color:#0f172a;font-size:14px;font-weight:600;font-family:'Courier New',Courier,monospace;margin:0;word-break:break-all;">{link}</p>
            </td>
          </tr>
        </table>

        <!-- CTA Button -->
        <table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:24px;">
          <tr>
            <td style="text-align:center;">
              <a href="{event_url}" style="display:block;background:#16B979;color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;padding:16px 32px;border-radius:12px;text-align:center;">Share my event</a>
            </td>
          </tr>
        </table>

        <!-- Closing tip -->
        <p style="color:#64748b;font-size:14px;line-height:1.6;margin:0;">
          Post it to your WhatsApp status, drop it in the group chats, and pin it to your bio. Every share is a door someone might walk through.
        </p>

      </td>
    </tr>

    <!-- Footer -->
    <tr>
      <td style="text-align:center;padding:24px 16px;">
        <p style="color:#999999;font-size:12px;margin:0;">
          You're getting this because you published an event on Byro.
          <a href="mailto:support@usebyro.com?subject=Unsubscribe" style="color:#999999;text-decoration:underline;">Unsubscribe</a>
        </p>
      </td>
    </tr>

  </table>
</div>"""

    plain_text = (
        f"Hi {name},\n\n"
        f"{event_name} is live. Nobody buys a ticket to an event they've never heard of, so the very next thing worth doing is telling people, before you do anything else.\n\n"
        f"The fastest tickets you'll ever sell are the ones you sell yourself: share the link with the people you already know.\n\n"
        f"Date: {date}\n"
        f"Doors: {time}\n"
    )
    if location:
        plain_text += f"Venue: {location}\n"
    plain_text += (
        f"\nYour event link: {link}\n\n"
        f"Post it to your WhatsApp status, drop it in the group chats, and pin it to your bio. Every share is a door someone might walk through.\n\n"
        f"Best regards,\nByro Team\nsupport@usebyro.com\n\n"
        f"You're getting this because you published an event on Byro."
    )

    return {
        "subject": f"{event_name} is live, now let's fill it up",
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
        lead = (
            f"{inviter_name} has invited you to co-host <strong>{event_name}</strong> on Byro."
        )
        instruction = (
            "Sign in with this email address to accept the invitation. "
            "Your co-host access activates as soon as you do."
        )
        cta = "Sign in to accept"
    else:
        lead = (
            f"{inviter_name} has added you as a co-host of <strong>{event_name}</strong> on Byro."
        )
        instruction = (
            "You can now edit the event, view attendees and check people in at the door."
        )
        cta = "Open the event"

    html = f"""<div style="background-color:#f8fafc;padding:40px 20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0;">
    <tr>
      <td style="padding:32px 32px 24px;">
        <p style="color:#94a3b8;font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;margin:0 0 12px;">Co-host invitation</p>
        <p style="color:#0f172a;font-size:18px;line-height:1.5;margin:0 0 16px;">{lead}</p>
        <p style="color:#475569;font-size:14px;line-height:1.6;margin:0 0 24px;">{instruction}</p>
        <a href="{event_url}" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 24px;border-radius:8px;">{cta}</a>
      </td>
    </tr>
    <tr>
      <td style="padding:0 32px 32px;">
        <p style="color:#94a3b8;font-size:12px;line-height:1.6;margin:0;border-top:1px solid #e2e8f0;padding-top:20px;">
          If you weren't expecting this, you can safely ignore this email — nothing changes until you sign in.
        </p>
      </td>
    </tr>
  </table>
</div>"""

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

    event_section = ""
    event_section_text = ""
    if event_name:
        event_section = f"""
        <tr>
          <td style="padding-bottom:16px;vertical-align:top;">
            <p style="color:#94a3b8;font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;margin:0 0 4px;">Event</p>
            <p style="color:#0f172a;font-size:14px;font-weight:600;margin:0;">{event_name}</p>
          </td>
        </tr>"""
        event_section_text = f"\nEvent: {event_name}"

    html = f"""
<div style="background-color:#f1f5f9;padding:32px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;width:100%;">

    <!-- Main white card -->
    <tr>
      <td style="background:#ffffff;border-radius:16px;padding:36px 32px 32px;box-shadow:0 2px 12px rgba(0,0,0,0.07);">

        <!-- PAYOUT INITIATED label -->
        <p style="color:#3b82f6;font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;margin:0 0 14px;">Payout Initiated</p>

        <!-- Headline -->
        <h1 style="margin:0 0 16px;font-size:28px;font-weight:800;color:#0f172a;line-height:1.2;">
          Your payout is on the way.
        </h1>

        <!-- Intro -->
        <p style="color:#64748b;font-size:15px;line-height:1.6;margin:0 0 28px;">
          Hi {name}, your payout request has been initiated.
        </p>

        <!-- Details -->
        <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin-bottom:24px;">
          <tr>
            <td style="width:50%;padding-bottom:16px;vertical-align:top;">
              <p style="color:#94a3b8;font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;margin:0 0 4px;">Amount</p>
              <p style="color:#0f172a;font-size:14px;font-weight:600;margin:0;">{formatted_amount}</p>
            </td>
            <td style="width:50%;padding-bottom:16px;vertical-align:top;">
              <p style="color:#94a3b8;font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;margin:0 0 4px;">Bank</p>
              <p style="color:#0f172a;font-size:14px;font-weight:600;margin:0;">{bank_name}</p>
            </td>
          </tr>
          <tr>
            <td style="padding-bottom:16px;vertical-align:top;">
              <p style="color:#94a3b8;font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;margin:0 0 4px;">Account Number</p>
              <p style="color:#0f172a;font-size:14px;font-weight:600;font-family:'Courier New',Courier,monospace;margin:0;">{account_number}</p>
            </td>
            <td style="padding-bottom:16px;vertical-align:top;">
              {event_section}
            </td>
          </tr>
        </table>

        <!-- Note -->
        <table cellpadding="0" cellspacing="0" style="width:100%;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;margin-bottom:0;">
          <tr>
            <td style="padding:16px 20px;">
              <p style="color:#64748b;font-size:14px;line-height:1.5;margin:0;">
                Payouts are processed within 24 hours. We'll send you a confirmation once it's completed.
              </p>
            </td>
          </tr>
        </table>

      </td>
    </tr>

    <!-- Footer -->
    <tr>
      <td style="text-align:center;padding:24px 16px;">
        <p style="color:#999999;font-size:12px;margin:0;">
          If you have any questions, kindly reach out to
          <a href="mailto:support@usebyro.com" style="color:#3b82f6;text-decoration:underline;">support@usebyro.com</a>
        </p>
        <p style="color:#999999;font-size:12px;margin:8px 0 0;">
          &#169; 2026 Byro Technologies. All rights reserved.
        </p>
      </td>
    </tr>

  </table>
</div>"""

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

    event_cell = ""
    event_row_text = ""
    if event_name:
        event_cell = f"""
            <p style="color:#94a3b8;font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;margin:0 0 4px;">Event</p>
            <p style="color:#0f172a;font-size:14px;font-weight:600;margin:0;">{event_name}</p>"""
        event_row_text = f"\nEvent: {event_name}"

    html = f"""
<div style="background-color:#f1f5f9;padding:32px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;width:100%;">

    <!-- Main white card -->
    <tr>
      <td style="background:#ffffff;border-radius:16px;padding:36px 32px 32px;box-shadow:0 2px 12px rgba(0,0,0,0.07);">

        <!-- PAYOUT COMPLETED label -->
        <p style="color:#16B979;font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;margin:0 0 14px;">Payout Completed</p>

        <!-- Headline -->
        <h1 style="margin:0 0 16px;font-size:28px;font-weight:800;color:#0f172a;line-height:1.2;">
          You've been paid. <em style="color:#16B979;font-style:italic;">Nice one.</em>
        </h1>

        <!-- Intro -->
        <p style="color:#64748b;font-size:15px;line-height:1.6;margin:0 0 28px;">
          Hi {name} - your payout has been processed and sent to your bank account.
        </p>

        <!-- Details -->
        <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin-bottom:24px;">
          <tr>
            <td style="width:50%;padding-bottom:16px;vertical-align:top;">
              <p style="color:#94a3b8;font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;margin:0 0 4px;">Amount</p>
              <p style="color:#0f172a;font-size:14px;font-weight:600;margin:0;">{formatted_amount}</p>
            </td>
            <td style="width:50%;padding-bottom:16px;vertical-align:top;">
              <p style="color:#94a3b8;font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;margin:0 0 4px;">Bank</p>
              <p style="color:#0f172a;font-size:14px;font-weight:600;margin:0;">{bank_name}</p>
            </td>
          </tr>
          <tr>
            <td style="padding-bottom:16px;vertical-align:top;">
              <p style="color:#94a3b8;font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;margin:0 0 4px;">Account Number</p>
              <p style="color:#0f172a;font-size:14px;font-weight:600;font-family:'Courier New',Courier,monospace;margin:0;">{account_number}</p>
            </td>
            <td style="padding-bottom:16px;vertical-align:top;">
              {event_cell}
            </td>
          </tr>
        </table>

      </td>
    </tr>

    <!-- Footer -->
    <tr>
      <td style="text-align:center;padding:24px 16px;">
        <p style="color:#999999;font-size:12px;margin:0;">
          If you have any questions, kindly reach out to
          <a href="mailto:support@usebyro.com" style="color:#3b82f6;text-decoration:underline;">support@usebyro.com</a>
        </p>
        <p style="color:#999999;font-size:12px;margin:8px 0 0;">
          &#169; 2026 Byro Technologies. All rights reserved.
        </p>
      </td>
    </tr>

  </table>
</div>"""

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
