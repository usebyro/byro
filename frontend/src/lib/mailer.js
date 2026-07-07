import { Resend } from "resend";
import nodemailer from "nodemailer";

let resend;
function getResend() {
  if (!resend) {
    resend = new Resend(process.env.RESEND_API_KEY);
  }
  return resend;
}

const FROM = "Byro <hello@usebyro.com>";
const REPLY_TO = "support@usebyro.com";

// Brevo fallback transporter (used when Resend daily limit is hit)
const brevoTransporter = nodemailer.createTransport({
  host: "smtp-relay.brevo.com",
  port: 587,
  secure: false,
  auth: {
    user: "b075ee001@smtp-brevo.com",
    pass: process.env.BREVO_SMTP_KEY,
  },
});

/**
 * Send an email using Resend (primary).
 * Falls back to Brevo SMTP if Resend's daily limit (100/day on free tier) is hit.
 */
export async function sendEmail({ to, subject, text, html }) {
  // --- Try Resend first ---
  try {
    const { data, error } = await getResend().emails.send({
      from: FROM,
      replyTo: REPLY_TO,
      to,
      subject,
      text,
      html,
    });

    if (error) {
      // 429 = daily/rate limit exceeded on Resend free tier
      if (error.statusCode === 429) {
        console.warn("[mailer] Resend limit hit, falling back to Brevo");
        return await sendViaBrevo({ to, subject, text, html });
      }
      throw new Error(`Resend error: ${error.message}`);
    }

    return { provider: "resend", id: data?.id };
  } catch (err) {
    // Network-level 429 or Resend SDK throws
    if (err?.statusCode === 429 || err?.response?.status === 429) {
      console.warn("[mailer] Resend rate limited (thrown), falling back to Brevo");
      return await sendViaBrevo({ to, subject, text, html });
    }
    throw err;
  }
}

async function sendViaBrevo({ to, subject, text, html }) {
  const info = await brevoTransporter.sendMail({
    from: FROM,
    replyTo: REPLY_TO,
    to,
    subject,
    text,
    html,
  });
  return { provider: "brevo", id: info.messageId };
}
