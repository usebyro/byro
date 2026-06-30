const brandPrimary = '#007AFF';
const brandGreen = '#16B979';
const brandDark = '#171717';
const brandGray = '#666666';
const brandLight = '#F5F7FA';
const brandGreenLight = '#E8F8F2';

const emailWrapper = (content) => `
  <div style="background-color: ${brandLight}; padding: 32px 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
    <table cellpadding="0" cellspacing="0" style="max-width: 560px; margin: 0 auto; width: 100%;">
      <tr>
        <td style="background: linear-gradient(135deg, ${brandPrimary}, #0056CC); padding: 32px 24px; text-align: center; border-radius: 12px 12px 0 0;">
          <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 700;">Byro</h1>
          <p style="color: rgba(255,255,255,0.9); margin: 4px 0 0; font-size: 14px;">Your Ticket is Confirmed</p>
        </td>
      </tr>
      <tr>
        <td style="background: #ffffff; padding: 32px 24px; border-radius: 0 0 12px 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.08);">
          ${content}
        </td>
      </tr>
      <tr>
        <td style="text-align: center; padding: 24px 16px;">
          <p style="color: #999999; font-size: 12px; margin: 0;">
            You're getting this because you signed up for an event on Byro.
            <a href="mailto:support@usebyro.com?subject=Unsubscribe" style="color: #999999; text-decoration: underline;">Unsubscribe</a>
          </p>
        </td>
      </tr>
    </table>
  </div>
`;

export const TicketConfirmation = (name, eventName, date, time, location, ticketId) => {
  const content = `
    <div style="text-align: center; margin-bottom: 24px;">
      <div style="width: 56px; height: 56px; background: ${brandGreenLight}; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 16px;">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="${brandGreen}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
          <polyline points="22 4 12 14.01 9 11.01"/>
        </svg>
      </div>
      <h2 style="color: ${brandDark}; margin: 0 0 8px; font-size: 20px; font-weight: 700;">Ticket Confirmed!</h2>
      <p style="color: ${brandGray}; margin: 0; font-size: 14px;">Your ticket has been booked successfully.</p>
    </div>

    <div style="background: linear-gradient(135deg, ${brandPrimary}, #0056CC); border-radius: 8px; padding: 20px; margin-bottom: 20px; color: #ffffff; text-align: center;">
      <p style="margin: 0 0 4px; font-size: 12px; opacity: 0.9;">${eventName}</p>
      <h3 style="margin: 0; font-size: 22px; font-weight: 700;">${name}</h3>
    </div>

    ${ticketId ? `
    <table cellpadding="0" cellspacing="0" style="width: 100%; background: ${brandLight}; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
      <tr>
        <td style="padding: 8px 0;">
          <p style="color: ${brandGray}; font-size: 12px; margin: 0;">Ticket ID</p>
          <p style="color: ${brandDark}; font-size: 14px; font-weight: 600; margin: 2px 0 0; font-family: monospace;">${ticketId}</p>
        </td>
      </tr>
    </table>` : ''}

    <table cellpadding="0" cellspacing="0" style="width: 100%; background: ${brandLight}; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
      <tr>
        <td style="padding: 8px 0;">
          <p style="color: ${brandGray}; font-size: 12px; margin: 0;">Date</p>
          <p style="color: ${brandDark}; font-size: 14px; font-weight: 600; margin: 2px 0 0;">${date}</p>
        </td>
      </tr>
      ${time ? `
      <tr>
        <td style="padding: 8px 0; border-top: 1px solid #e5e7eb;">
          <p style="color: ${brandGray}; font-size: 12px; margin: 0;">Time</p>
          <p style="color: ${brandDark}; font-size: 14px; margin: 2px 0 0;">${time}</p>
        </td>
      </tr>` : ''}
      ${location ? `
      <tr>
        <td style="padding: 8px 0; border-top: 1px solid #e5e7eb;">
          <p style="color: ${brandGray}; font-size: 12px; margin: 0;">Location</p>
          <p style="color: ${brandDark}; font-size: 14px; margin: 2px 0 0;">${location}</p>
        </td>
      </tr>` : ''}
    </table>

    <p style="color: ${brandDark}; font-size: 14px; line-height: 1.6; margin: 0 0 16px;">Hi ${name},</p>
    <p style="color: ${brandGray}; font-size: 14px; line-height: 1.6; margin: 0 0 16px;">
      Thank you for your purchase! Your ticket for <strong>${eventName}</strong> has been confirmed. Present this email or your ticket ID at the event for entry.
    </p>
    <p style="color: ${brandGray}; font-size: 14px; line-height: 1.6; margin: 0 0 16px;">
      Don't forget to add the event to your calendar so you don't miss it!
    </p>
    <p style="color: ${brandDark}; font-size: 14px; line-height: 1.6; margin: 0 0 4px;">Best regards,</p>
    <p style="color: ${brandPrimary}; font-size: 14px; font-weight: 600; margin: 0;">Byro Team</p>
  `;

  return {
    subject: `Your Ticket for ${eventName} is Confirmed!`,
    text: `Hi ${name},\n\nYour ticket for ${eventName} has been confirmed!\n\nDate: ${date}\nTime: ${time}\nLocation: ${location}\n\nThank you for using Byro!`,
    html: emailWrapper(content)
  };
};