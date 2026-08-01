export const PayoutCompleted = (name, amount, bankName, accountNumber, eventName = null) => {
  const eventRow = eventName ? `
    <tr>
      <td style="padding:12px 0;border-top:1px solid #e2e8f0;">
        <p style="color:#94a3b8;font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;margin:0 0 4px;">Event</p>
        <p style="color:#0f172a;font-size:14px;font-weight:600;margin:0;">${eventName}</p>
      </td>
    </tr>` : '';

  const html = `
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
          Hi ${name} — your payout has been processed and sent to your bank account.
        </p>

        <!-- Payout card -->
        <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:separate;border-spacing:0;border-radius:16px;overflow:hidden;margin-bottom:24px;">
          <!-- Green gradient header -->
          <tr>
            <td style="background:linear-gradient(135deg,#064e3b 0%,#059669 50%,#16B979 100%);padding:28px 24px 24px;border-radius:16px 16px 0 0;">
              <table cellpadding="0" cellspacing="0" style="margin-bottom:14px;">
                <tr>
                  <td style="background:rgba(255,255,255,0.15);border-radius:20px;padding:4px 12px;">
                    <span style="color:#ffffff;font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;">&#9679; Payout</span>
                  </td>
                </tr>
              </table>
              <h2 style="color:#ffffff;font-size:22px;font-weight:700;margin:0;line-height:1.3;">₦${Number(amount).toLocaleString()}</h2>
            </td>
          </tr>
          <!-- White details panel -->
          <tr>
            <td style="background:#f8fafc;padding:20px 24px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 16px 16px;">
              <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;">
                <tr>
                  <td style="width:50%;padding-bottom:16px;vertical-align:top;">
                    <p style="color:#94a3b8;font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;margin:0 0 4px;">Bank</p>
                    <p style="color:#0f172a;font-size:14px;font-weight:600;margin:0;">${bankName}</p>
                  </td>
                  <td style="width:50%;padding-bottom:16px;vertical-align:top;">
                    <p style="color:#94a3b8;font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;margin:0 0 4px;">Account Number</p>
                    <p style="color:#0f172a;font-size:14px;font-weight:600;font-family:'Courier New',Courier,monospace;margin:0;">${accountNumber}</p>
                  </td>
                </tr>
                ${eventRow}
              </table>
            </td>
          </tr>
        </table>

        <!-- CTA Button -->
        <table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:0;">
          <tr>
            <td style="text-align:center;">
              <a href="https://usebyro.com/dashboard" style="display:block;background:#3b82f6;color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;padding:16px 32px;border-radius:12px;text-align:center;">View dashboard</a>
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
          &copy; ${new Date().getFullYear()} Byro Technologies. All rights reserved.
        </p>
      </td>
    </tr>

  </table>
</div>`;

  return {
    subject: `Your Payout of ₦${Number(amount).toLocaleString()} has been Completed`,
    text: `Hi ${name},\n\nYour payout has been completed.\n\nAmount: ₦${Number(amount).toLocaleString()}\nBank: ${bankName}\nAccount Number: ${accountNumber}${eventName ? `\nEvent: ${eventName}` : ''}\n\nIf you have any questions, kindly reach out to support@usebyro.com.\n\nThanks,\nThe Byro Team`,
    html,
  };
};
