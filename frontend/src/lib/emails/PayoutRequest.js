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
          <p style="color: rgba(255,255,255,0.9); margin: 4px 0 0; font-size: 14px;">Payout Request</p>
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

export const PayoutRequest = (name, amount, eventName) => {
  const content = `
    <div style="text-align: center; margin-bottom: 24px;">
      <div style="width: 56px; height: 56px; background: #E8F8F2; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 16px;">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="${brandGreen}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        </svg>
      </div>
      <h2 style="color: ${brandDark}; margin: 0 0 8px; font-size: 20px; font-weight: 700;">Payout Request Received</h2>
      <p style="color: ${brandGray}; margin: 0; font-size: 14px;">We've received your payout request and it's being processed.</p>
    </div>

    <table cellpadding="0" cellspacing="0" style="width: 100%; background: ${brandLight}; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
      <tr>
        <td style="padding: 8px 0;">
          <p style="color: ${brandGray}; font-size: 12px; margin: 0;">Amount</p>
          <p style="color: ${brandDark}; font-size: 18px; font-weight: 700; margin: 2px 0 0;">$${amount}</p>
        </td>
      </tr>
      ${eventName ? `
      <tr>
        <td style="padding: 8px 0; border-top: 1px solid #e5e7eb;">
          <p style="color: ${brandGray}; font-size: 12px; margin: 0;">Event</p>
          <p style="color: ${brandDark}; font-size: 14px; margin: 2px 0 0;">${eventName}</p>
        </td>
      </tr>
      ` : ''}
      <tr>
        <td style="padding: 8px 0; border-top: 1px solid #e5e7eb;">
          <p style="color: ${brandGray}; font-size: 12px; margin: 0;">Processing Time</p>
          <p style="color: ${brandDark}; font-size: 14px; margin: 2px 0 0;">Within 24 hours</p>
        </td>
      </tr>
    </table>

    <p style="color: ${brandDark}; font-size: 14px; line-height: 1.6; margin: 0 0 16px;">Hi ${name},</p>
    <p style="color: ${brandGray}; font-size: 14px; line-height: 1.6; margin: 0 0 16px;">
      We're pleased to confirm that we've received your payout request. Our team will review and process it within the next 24 hours.
    </p>
    <p style="color: ${brandGray}; font-size: 14px; line-height: 1.6; margin: 0 0 16px;">
      If you have any questions or need further assistance, feel free to reply to this email.
    </p>
    <p style="color: ${brandDark}; font-size: 14px; line-height: 1.6; margin: 0 0 4px;">Best regards,</p>
    <p style="color: ${brandPrimary}; font-size: 14px; font-weight: 600; margin: 0;">Byro Team</p>
  `;

  return {
    subject: "Payout Request Received",
    text: `Hi ${name},\n\nWe've received your payout request of $${amount}${eventName ? ` for ${eventName}` : ''}. It will be processed within the next 24 hours.\n\nBest regards,\nByro Team`,
    html: emailWrapper(content)
  };
};

// export default PayoutRequest;





