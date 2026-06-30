"""
Transactional email templates for Byro.
Each function returns a dict: { subject, html, text }
"""


def _email_wrapper(content):
    return f"""
<div style="background-color:#F5F7FA;padding:32px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;width:100%;">
    <tr>
      <td style="background:linear-gradient(135deg,#007AFF,#0056CC);padding:32px 24px;text-align:center;border-radius:12px 12px 0 0;">
        <h1 style="color:#ffffff;margin:0;font-size:24px;font-weight:700;">Byro</h1>
        <p style="color:rgba(255,255,255,0.9);margin:4px 0 0;font-size:14px;">Your Ticket is Confirmed</p>
      </td>
    </tr>
    <tr>
      <td style="background:#ffffff;padding:32px 24px;border-radius:0 0 12px 12px;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
        {content}
      </td>
    </tr>
    <tr>
      <td style="text-align:center;padding:24px 16px;">
        <p style="color:#999999;font-size:12px;margin:0;">
          You're getting this because you signed up for an event on Byro.
          <a href="mailto:support@usebyro.com?subject=Unsubscribe" style="color:#999999;text-decoration:underline;">Unsubscribe</a>
        </p>
      </td>
    </tr>
  </table>
</div>
"""


def ticket_confirmation_email(name, event_name, date, time, location, ticket_id, form_answers=None):
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
    """
    ticket_row = ""
    if ticket_id:
        ticket_row = f"""
    <table cellpadding="0" cellspacing="0" style="width:100%;background:#F5F7FA;border-radius:8px;padding:16px;margin-bottom:20px;">
      <tr>
        <td style="padding:8px 0;">
          <p style="color:#666666;font-size:12px;margin:0;">Ticket ID</p>
          <p style="color:#171717;font-size:14px;font-weight:600;margin:2px 0 0;font-family:monospace;">{ticket_id}</p>
        </td>
      </tr>
    </table>"""

    time_row = ""
    if time:
        time_row = f"""
      <tr>
        <td style="padding:8px 0;border-top:1px solid #e5e7eb;">
          <p style="color:#666666;font-size:12px;margin:0;">Time</p>
          <p style="color:#171717;font-size:14px;margin:2px 0 0;">{time}</p>
        </td>
      </tr>"""

    location_row = ""
    if location:
        location_row = f"""
      <tr>
        <td style="padding:8px 0;border-top:1px solid #e5e7eb;">
          <p style="color:#666666;font-size:12px;margin:0;">Location</p>
          <p style="color:#171717;font-size:14px;margin:2px 0 0;">{location}</p>
        </td>
      </tr>"""

    # Registration details from form answers
    form_rows_html = ""
    form_rows_text = ""
    if form_answers:
        rows = ""
        first = True
        for entry in form_answers:
            q = entry.get("question", "")
            a = entry.get("answer", "")
            if not q or not a:
                continue
            border = "" if first else "border-top:1px solid #e5e7eb;"
            rows += f"""
      <tr>
        <td style="padding:8px 0;{border}">
          <p style="color:#666666;font-size:12px;margin:0;">{q}</p>
          <p style="color:#171717;font-size:14px;margin:2px 0 0;">{a}</p>
        </td>
      </tr>"""
            form_rows_text += f"{q}: {a}\n"
            first = False

        if rows:
            form_rows_html = f"""
    <p style="color:#171717;font-size:13px;font-weight:600;margin:0 0 12px;">Registration details</p>
    <table cellpadding="0" cellspacing="0" style="width:100%;background:#F5F7FA;border-radius:8px;padding:16px;margin-bottom:20px;">
      {rows}
    </table>"""

    content = f"""
    <div style="text-align:center;margin-bottom:24px;">
      <div style="width:56px;height:56px;background:#E8F8F2;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;margin-bottom:16px;">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#16B979" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
          <polyline points="22 4 12 14.01 9 11.01"/>
        </svg>
      </div>
      <h2 style="color:#171717;margin:0 0 8px;font-size:20px;font-weight:700;">Ticket Confirmed!</h2>
      <p style="color:#666666;margin:0;font-size:14px;">Your ticket has been booked successfully.</p>
    </div>

    <div style="background:linear-gradient(135deg,#007AFF,#0056CC);border-radius:8px;padding:20px;margin-bottom:20px;color:#ffffff;text-align:center;">
      <p style="margin:0 0 4px;font-size:12px;opacity:0.9;">{event_name}</p>
      <h3 style="margin:0;font-size:22px;font-weight:700;">{name}</h3>
    </div>

    {ticket_row}

    <table cellpadding="0" cellspacing="0" style="width:100%;background:#F5F7FA;border-radius:8px;padding:16px;margin-bottom:20px;">
      <tr>
        <td style="padding:8px 0;">
          <p style="color:#666666;font-size:12px;margin:0;">Date</p>
          <p style="color:#171717;font-size:14px;font-weight:600;margin:2px 0 0;">{date}</p>
        </td>
      </tr>
      {time_row}
      {location_row}
    </table>

    {form_rows_html}

    <p style="color:#171717;font-size:14px;line-height:1.6;margin:0 0 16px;">Hi {name},</p>
    <p style="color:#666666;font-size:14px;line-height:1.6;margin:0 0 16px;">
      Your ticket for <strong>{event_name}</strong> has been confirmed.
      Present this email or your ticket ID at the event for entry.
    </p>
    <p style="color:#666666;font-size:14px;line-height:1.6;margin:0 0 16px;">
      Don't forget to add the event to your calendar so you don't miss it!
    </p>
    <p style="color:#171717;font-size:14px;line-height:1.6;margin:0 0 4px;">Best regards,</p>
    <p style="color:#007AFF;font-size:14px;font-weight:600;margin:0;">Byro Team</p>
    """

    plain_text = (
        f"Hi {name},\n\n"
        f"Your ticket for {event_name} has been confirmed!\n\n"
        f"Date: {date}\n"
        f"Time: {time}\n"
        f"Location: {location}\n"
        f"Ticket ID: {ticket_id}\n"
    )
    if form_rows_text:
        plain_text += f"\nRegistration details:\n{form_rows_text}"
    plain_text += (
        f"\nPresent this email or your ticket ID at the event for entry.\n\n"
        f"Best regards,\nByro Team\nsupport@usebyro.com\n\n"
        f"You're getting this because you signed up for an event on Byro."
    )

    return {
        "subject": f"Your Ticket for {event_name} is Confirmed!",
        "html": _email_wrapper(content),
        "text": plain_text,
    }
