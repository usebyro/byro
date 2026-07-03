const brandPrimary = '#007AFF';
const brandGreen = '#16B979';
const brandDark = '#171717';
const brandGray = '#666666';
const brandLight = '#F5F7FA';

const emailWrapper = (content) => `
  <div style="background-color: ${brandLight}; padding: 32px 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
    <table cellpadding="0" cellspacing="0" style="max-width: 560px; margin: 0 auto; width: 100%;">
      <tr>
        <td style="background: linear-gradient(135deg, ${brandPrimary}, #0056CC); padding: 32px 24px; text-align: center; border-radius: 12px 12px 0 0;">
          <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 700;">Byro</h1>
          <p style="color: rgba(255,255,255,0.9); margin: 4px 0 0; font-size: 14px;">Event Created</p>
        </td>
      </tr>
      <tr>
        <td style="background: #ffffff; padding: 32px 24px; border-radius: 0 0 12px 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.08);">
          ${content}
        </td>
      </tr>
      <tr>
        <td style="text-align: center; padding: 24px 16px;">
          <p style="color: ${brandGray}; font-size: 12px; margin: 0;">
            &copy; 2026 Byro Africa. All rights reserved.
          </p>
          <p style="color: ${brandGray}; font-size: 12px; margin: 4px 0 0;">
            Need help? <a href="mailto:hello@usebyro.com" style="color: ${brandPrimary}; text-decoration: none;">hello@usebyro.com</a>
          </p>
        </td>
      </tr>
    </table>
  </div>
`;

export const EventCreated = (name, eventName, eventDate, eventTime, eventLocation, eventLink) => {
  const content = `
    <div style="text-align: center; margin-bottom: 24px;">
      <div style="width: 56px; height: 56px; background: #D9EBFF; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 16px;">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="${brandPrimary}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
          <line x1="16" y1="2" x2="16" y2="6"/>
          <line x1="8" y1="2" x2="8" y2="6"/>
          <line x1="3" y1="10" x2="21" y2="10"/>
        </svg>
      </div>
      <h2 style="color: ${brandDark}; margin: 0 0 8px; font-size: 20px; font-weight: 700;">Event Created Successfully!</h2>
      <p style="color: ${brandGray}; margin: 0; font-size: 14px;">Your event is now live and ready for attendees.</p>
    </div>

    <div style="background: linear-gradient(135deg, ${brandPrimary}, #0056CC); border-radius: 8px; padding: 20px; margin-bottom: 20px; color: #ffffff; text-align: center;">
      <p style="margin: 0 0 4px; font-size: 12px; opacity: 0.9;">Your Event</p>
      <h3 style="margin: 0; font-size: 22px; font-weight: 700;">${eventName}</h3>
    </div>

    <table cellpadding="0" cellspacing="0" style="width: 100%; background: ${brandLight}; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
      ${eventDate ? `
      <tr>
        <td style="padding: 8px 0;">
          <p style="color: ${brandGray}; font-size: 12px; margin: 0;">Date</p>
          <p style="color: ${brandDark}; font-size: 14px; font-weight: 600; margin: 2px 0 0;">${eventDate}</p>
        </td>
      </tr>` : ''}
      ${eventTime ? `
      <tr>
        <td style="padding: 8px 0; border-top: 1px solid #e5e7eb;">
          <p style="color: ${brandGray}; font-size: 12px; margin: 0;">Time</p>
          <p style="color: ${brandDark}; font-size: 14px; margin: 2px 0 0;">${eventTime}</p>
        </td>
      </tr>` : ''}
      ${eventLocation ? `
      <tr>
        <td style="padding: 8px 0; border-top: 1px solid #e5e7eb;">
          <p style="color: ${brandGray}; font-size: 12px; margin: 0;">Location</p>
          <p style="color: ${brandDark}; font-size: 14px; margin: 2px 0 0;">${eventLocation}</p>
        </td>
      </tr>` : ''}
    </table>

    <p style="color: ${brandDark}; font-size: 14px; line-height: 1.6; margin: 0 0 16px;">Hi ${name},</p>
    <p style="color: ${brandGray}; font-size: 14px; line-height: 1.6; margin: 0 0 16px;">
      Your event <strong>${eventName}</strong> has been created and is now live! You can manage your event, track attendees, and view ticket sales from your dashboard.
    </p>
    ${eventLink ? `
    <table cellpadding="0" cellspacing="0" style="width: 100%; margin-bottom: 16px;">
      <tr>
        <td style="text-align: center;">
          <a href="${eventLink}" style="display: inline-block; background: linear-gradient(135deg, ${brandPrimary}, #0056CC); color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-size: 14px; font-weight: 600;">View Your Event</a>
        </td>
      </tr>
    </table>` : ''}
    <p style="color: ${brandGray}; font-size: 14px; line-height: 1.6; margin: 0 0 16px;">
      Share the event link with your audience to start selling tickets!
    </p>
    <p style="color: ${brandDark}; font-size: 14px; line-height: 1.6; margin: 0 0 4px;">Best regards,</p>
    <p style="color: ${brandPrimary}; font-size: 14px; font-weight: 600; margin: 0;">Byro Team</p>
  `;

  return {
    subject: `${eventName} is Live!`,
    text: `Hi ${name},\n\nYour event "${eventName}" has been created successfully! It's now live and ready for attendees.\n\nDate: ${eventDate}\nTime: ${eventTime}\nLocation: ${eventLocation}\n\nManage your event: ${eventLink}\n\nBest regards,\nByro Team`,
    html: emailWrapper(content)
  };
};