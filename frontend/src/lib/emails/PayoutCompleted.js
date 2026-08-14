export const PayoutCompleted = (name, amount, bankName, accountNumber, eventName = null) => {
  const eventCell = eventName ? `
            <p style="color:#94a3b8;font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;margin:0 0 4px;">Event</p>
            <p style="color:#0f172a;font-size:14px;font-weight:600;margin:0;">${eventName}</p>` : '';

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
          Hi ${name} - your payout has been processed and sent to your bank account.
        </p>

        <!-- Details -->
        <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin-bottom:24px;">
          <tr>
            <td style="width:50%;padding-bottom:16px;vertical-align:top;">
              <p style="color:#94a3b8;font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;margin:0 0 4px;">Amount</p>
              <p style="color:#0f172a;font-size:14px;font-weight:600;margin:0;">₦${Number(amount).toLocaleString()}</p>
            </td>
            <td style="width:50%;padding-bottom:16px;vertical-align:top;">
              <p style="color:#94a3b8;font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;margin:0 0 4px;">Bank</p>
              <p style="color:#0f172a;font-size:14px;font-weight:600;margin:0;">${bankName}</p>
            </td>
          </tr>
          <tr>
            <td style="padding-bottom:16px;vertical-align:top;">
              <p style="color:#94a3b8;font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;margin:0 0 4px;">Account Number</p>
              <p style="color:#0f172a;font-size:14px;font-weight:600;font-family:'Courier New',Courier,monospace;margin:0;">${accountNumber}</p>
            </td>
            <td style="padding-bottom:16px;vertical-align:top;">
              ${eventCell}
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
