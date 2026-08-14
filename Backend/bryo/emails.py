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
