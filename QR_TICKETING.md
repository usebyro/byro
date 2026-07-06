# QR Ticketing & Check-In

## What this feature does

Each ticket gets a QR code (encoding `Ticket.qr_token`) that's used for:
1. A public ticket page attendees can view and screenshot/share.
2. A ticket image attached to the confirmation email.
3. Camera-based check-in scanning on the event dashboard.

## Backend

- `Backend/bryo/qr.py` — `generate_qr_png(data)`: renders a raw QR PNG from any string. Used by the live `/tickets/<id>/qr/` endpoint (see `TicketViewSet.qr` in `views.py`), which the ticket page (`TicketCard.jsx`) embeds directly as an `<img>`.
- `Backend/bryo/ticket_image.py` — `generate_ticket_png(...)`: composites a full "boarding pass" style ticket PNG — event name/date/time/venue/attendee on the left, the QR code on a perforated stub on the right. Built with Pillow only (`ImageFont.load_default(size=...)`, no bundled font file needed — works the same on Render as locally). This is what gets attached to the confirmation email (not the raw QR).
- `Backend/bryo/views.py::send_ticket_confirmation_email` — builds the email (via `emails.ticket_confirmation_email`) and attaches the `ticket_image.png` output as `ticket.png`. Called from all three ticket-issuing paths in `PaystackPaymentViewSet` (free tickets, sync paid verification, async webhook).
- `Backend/bryo/mailer.py::send_email` — now accepts an `attachments` list (`[{filename, content: bytes, content_type}]`), passed through to both Resend and the Brevo SMTP fallback.
- `Backend/bryo/emails.py::ticket_confirmation_email` — takes an optional `ticket_url` to link the "View my tickets" CTA to the attendee's actual ticket page (`/ticket/<ticket_id>`), and its copy now refers to "your ticket" (the attachment) rather than "your QR code".
- `TicketViewSet.qr` action (`views.py`) — `GET /api/tickets/<ticket_id>/qr/`, `AllowAny`, returns the raw QR PNG for a given ticket.
- `requirements.txt` — added `qrcode==8.2` (Pillow was already present).

## Frontend

- `frontend/src/app/ticket/[ticket_id]/page.jsx` — public ticket page, fetches `API.getTicket(ticketId)` and renders `TicketCard`.
- `frontend/src/components/tickets/TicketCard.jsx` — displays event/attendee details and the QR image via `API.getTicketQrUrl(ticketId)` (hits the `/qr/` endpoint above).
- `frontend/src/app/[slug]/ViewEventClient.jsx` — "View Ticket" button now routes to `/ticket/${ticketId}` (previously a dead `/ticket-confirmation` route).
- `frontend/src/app/dashboard/events/[slug]/page.jsx` — check-in modal now has two modes: **Scan QR** (opens the camera, decodes frames with `jsqr`, auto-submits on a hit) and **Enter manually** (the original email/token text input). Scanning locks after a hit until check-in resolves, then unlocks on failure so a bad/duplicate code doesn't spam requests.
- `frontend/src/services/api.js` — added `getTicket`, `getTicketQrUrl`, `getMyTickets`, `transferTicket`, `cancelRegistration` for the tickets resource.

## Local dev note

There's no local Python venv for the Backend on this machine — the deployed backend (Render) installs from `requirements.txt` at deploy time, and the frontend talks to `https://byro.onrender.com/api/` per `.env`. So `qrcode`/`Pillow` don't need a local install to ship; they're picked up on the next Render deploy.
