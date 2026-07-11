## Overview of Byro

Byro is a community events platform built for organisers and attendees.

Organisers create events, sell tickets, check people in at the door and get paid. Attendees discover events near them, buy tickets in seconds and keep a record of what they have attended. Byro is built for the people currently running events from WhatsApp groups and spreadsheets: tech communities, student unions, small creators, NGOs and meetup hosts.

Tagline: Where events become communities.

### Key Features

- **Event management**: Create and manage public or private events, physical or virtual, with categories, capacity limits and co-hosts.
- **Custom registration**: Add your own registration questions per event and collect attendee answers.
- **Ticketing**: Multiple price tiers per event. Free and paid tickets, issued as unique tokens.
- **Payments**: Fiat payments through Paystack, with a full reference and webhook verification flow.
- **Organiser payouts**: Request payouts to a bank account, with Paystack bank resolution and an admin approval flow.
- **QR check-in**: Every ticket carries a QR code. Organisers scan attendees in from the dashboard using the camera, or check them in manually.
- **Ticket delivery**: A boarding pass style ticket image is generated and emailed on purchase.
- **Public discovery**: Browse and search events without logging in.
- **Public profiles**: Every user gets a profile page with their socials and event history.
- **Admin dashboard**: Manage events and payouts, and view analytics.

### Technology Stack

- **Frontend**: Next.js (App Router), React, TypeScript, Tailwind CSS, Redux Toolkit, React Query. Deployed on Vercel.
- **Backend**: Django, Django REST Framework. Celery and Redis for async work. Deployed on Render.
- **Authentication**: Web3Auth (email passwordless).
- **Payments**: Paystack.
- **Email**: Resend (primary), Brevo SMTP (fallback).
- **Database**: SQLite (development).

### Repository Layout

- `frontend/` — Next.js application.
- `Backend/` — Django project. The main app is `Backend/bryo/`.

### Roadmap

These are part of the product direction but are not implemented yet:

- USDC payments through Blockradar.
- Digital memory badges issued on check-in.
- Community spaces and in-app messaging for organisers to reach their audience after an event.
