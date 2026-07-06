import smtplib
import logging
from email.mime.application import MIMEApplication
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

import resend
from django.conf import settings

logger = logging.getLogger(__name__)

FROM = "Byro <hello@usebyro.com>"
REPLY_TO = "support@usebyro.com"

BREVO_HOST = "smtp-relay.brevo.com"
BREVO_PORT = 587
BREVO_USER = "b075ee001@smtp-brevo.com"


def send_email(to, subject, html, text=None, attachments=None):
    """
    Send an email using Resend (primary).
    Falls back to Brevo SMTP if Resend's daily limit (100/day free tier) is hit.

    Args:
        to (str): Recipient email address.
        subject (str): Email subject.
        html (str): HTML body.
        text (str, optional): Plain-text fallback body.
        attachments (list[dict], optional): Each dict is
            {"filename": str, "content": bytes, "content_type": str}.
    """
    resend.api_key = settings.RESEND_API_KEY

    try:
        params = {
            "from": FROM,
            "reply_to": REPLY_TO,
            "to": [to] if isinstance(to, str) else to,
            "subject": subject,
            "html": html,
        }
        if text:
            params["text"] = text
        if attachments:
            params["attachments"] = [
                {
                    "filename": a["filename"],
                    "content": list(a["content"]),
                    "content_type": a.get("content_type", "application/octet-stream"),
                }
                for a in attachments
            ]

        response = resend.Emails.send(params)
        logger.info(f"[mailer] Email sent via Resend — id={response.get('id')} to={to}")
        return {"provider": "resend", "id": response.get("id")}

    except Exception as err:
        err_str = str(err).lower()
        if "429" in err_str or "rate" in err_str or "limit" in err_str or "too many" in err_str:
            logger.warning(f"[mailer] Resend limit hit, falling back to Brevo — {err}")
            return _send_via_brevo(to, subject, html, text, attachments)
        raise


def _send_via_brevo(to, subject, html, text=None, attachments=None):
    """Fallback: send via Brevo SMTP."""
    msg = MIMEMultipart("mixed")
    msg["Subject"] = subject
    msg["From"] = FROM
    msg["To"] = to if isinstance(to, str) else ", ".join(to)
    msg["Reply-To"] = REPLY_TO

    body = MIMEMultipart("alternative")
    if text:
        body.attach(MIMEText(text, "plain"))
    body.attach(MIMEText(html, "html"))
    msg.attach(body)

    for a in attachments or []:
        part = MIMEApplication(a["content"], Name=a["filename"])
        part["Content-Disposition"] = f'attachment; filename="{a["filename"]}"'
        msg.attach(part)

    recipients = [to] if isinstance(to, str) else to

    with smtplib.SMTP(BREVO_HOST, BREVO_PORT) as server:
        server.starttls()
        server.login(BREVO_USER, settings.BREVO_SMTP_KEY)
        server.sendmail("hello@usebyro.com", recipients, msg.as_string())

    logger.info(f"[mailer] Email sent via Brevo to={to}")
    return {"provider": "brevo"}
