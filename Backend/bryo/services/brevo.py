"""
Brevo (ex-Sendinblue) newsletter contacts.

Adds an email to the newsletter list. The API key stays server-side; the
frontend only ever talks to /api/newsletter/subscribe/.
"""

import logging

import requests
from django.conf import settings

logger = logging.getLogger(__name__)

CONTACTS_URL = "https://api.brevo.com/v3/contacts"
TIMEOUT_SECONDS = 8


class BrevoNotConfigured(Exception):
    pass


class BrevoError(Exception):
    pass


def subscribe_contact(email):
    """
    Create the contact on the newsletter list, or update it if it already exists.
    Re-subscribing an existing contact is a success, not an error.
    """
    api_key = getattr(settings, "BREVO_API_KEY", "")
    list_id = getattr(settings, "BREVO_LIST_ID", "")
    if not api_key or not list_id:
        raise BrevoNotConfigured()

    try:
        resp = requests.post(
            CONTACTS_URL,
            headers={
                "api-key": api_key,
                "accept": "application/json",
                "content-type": "application/json",
            },
            json={"email": email, "listIds": [int(list_id)], "updateEnabled": True},
            timeout=TIMEOUT_SECONDS,
        )
    except requests.RequestException as exc:
        logger.warning("Brevo request failed: %s", exc)
        raise BrevoError() from exc

    # 201 = created, 204 = existing contact updated
    if resp.status_code in (201, 204):
        return

    logger.warning("Brevo rejected contact (%s): %s", resp.status_code, resp.text[:300])
    raise BrevoError()
