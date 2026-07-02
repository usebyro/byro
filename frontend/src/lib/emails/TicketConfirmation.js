export const TicketConfirmation = (name, eventName, date, time, location, ticketId, formAnswers = null) => {
  const detailsGrid = `
    <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;">
      <tr>
        <td style="width:50%;padding-bottom:16px;vertical-align:top;">
          <p style="color:#94a3b8;font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;margin:0 0 4px;">Date</p>
          <p style="color:#0f172a;font-size:14px;font-weight:600;margin:0;">${date}</p>
        </td>
        ${time ? `<td style="width:50%;padding-bottom:16px;vertical-align:top;">
          <p style="color:#94a3b8;font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;margin:0 0 4px;">Doors</p>
          <p style="color:#0f172a;font-size:14px;font-weight:600;margin:0;">${time}</p>
        </td>` : '<td></td>'}
      </tr>
      ${location ? `<tr>
        <td colspan="2" style="vertical-align:top;">
          <p style="color:#94a3b8;font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;margin:0 0 4px;">Venue</p>
          <p style="color:#0f172a;font-size:14px;font-weight:600;margin:0;">${location}</p>
        </td>
      </tr>` : ''}
    </table>`;

  const ticketIdSection = ticketId ? `
    <table cellpadding="0" cellspacing="0" style="width:100%;">
      <tr>
        <td>
          <p style="color:#94a3b8;font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;margin:0 0 6px;">Scan at entry</p>
          <p style="color:#0f172a;font-size:15px;font-weight:700;font-family:'Courier New',Courier,monospace;margin:0 0 4px;letter-spacing:0.04em;">${ticketId}</p>
          <p style="color:#94a3b8;font-size:12px;margin:0;">Present this ID at the gate for entry</p>
        </td>
      </tr>
    </table>` : '';

  const formSection = formAnswers && formAnswers.length > 0 ? `
    <table cellpadding="0" cellspacing="0" style="width:100%;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;margin-bottom:24px;">
      <tr>
        <td style="padding:20px;">
          <p style="color:#94a3b8;font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;margin:0 0 14px;">Registration Details</p>
          ${formAnswers.map((a, i) => `
          <table cellpadding="0" cellspacing="0" style="width:100%;${i > 0 ? 'border-top:1px solid #e2e8f0;' : ''}">
            <tr><td style="padding:${i > 0 ? '10px' : '0'} 0 0;">
              <p style="color:#94a3b8;font-size:11px;margin:0 0 3px;">${a.question}</p>
              <p style="color:#0f172a;font-size:14px;font-weight:500;margin:0;">${a.answer}</p>
            </td></tr>
          </table>`).join('')}
        </td>
      </tr>
    </table>` : '';

  const html = `
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
          Hi ${name} — your booking is confirmed. Show your ticket ID at the gate for entry.
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
              <h2 style="color:#ffffff;font-size:22px;font-weight:700;margin:0;line-height:1.3;">${eventName}</h2>
            </td>
          </tr>
          <!-- White details panel -->
          <tr>
            <td style="background:#f8fafc;padding:20px 24px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 16px 16px;">
              ${detailsGrid}
              <!-- Dashed tear-off divider -->
              <table cellpadding="0" cellspacing="0" style="width:100%;margin:8px 0 20px;">
                <tr><td style="border-top:2px dashed #cbd5e1;font-size:0;line-height:0;">&nbsp;</td></tr>
              </table>
              ${ticketIdSection}
            </td>
          </tr>
        </table>

        ${formSection}

        <!-- CTA Button -->
        <table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:0;">
          <tr>
            <td style="text-align:center;">
              <a href="https://usebyro.com" style="display:block;background:#3b82f6;color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;padding:16px 32px;border-radius:12px;text-align:center;">View my tickets</a>
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
</div>`;

  return {
    subject: `Your Ticket for ${eventName} is Confirmed!`,
    text: `Hi ${name},\n\nYour booking is confirmed! Your ticket for ${eventName} is ready.\n\nDate: ${date}${time ? `\nDoors: ${time}` : ''}${location ? `\nVenue: ${location}` : ''}${ticketId ? `\nTicket ID: ${ticketId}` : ''}\n\nPresent your ticket ID at the gate for entry.\n\nBest regards,\nByro Team\nsupport@usebyro.com`,
    html,
  };
};
