# Things to know (as of 8 Oct 2026)

Written after the refunds, cookie consent, attendee questions and Google sign-in work.
Nothing here is secret. Keys and passwords stay in the host's environment settings.

## Before / right after deploying

- [ ] Run migrations: `0038` (yes/no question type), `0039` (event cancellation + refunds), `0040` (refund approval).
- [ ] Schedule `python manage.py process_refunds` (every 5 minutes) so approved refunds are never left half-sent.
- [ ] Production backend settings:
  - `WORKOS_OAUTH_REDIRECT_URI=https://www.usebyro.com/auth/callback` (the site redirects `usebyro.com` -> `www`)
  - `REFUND_ALERT_EMAIL` (defaults to `support@usebyro.com`; this is who is told "refunds are waiting")
  - `RESEND_API_KEY` must be a live key (the one that was in `frontend/.env` was revoked)
- [ ] WorkOS (Production) -> Redirects: add `https://www.usebyro.com/auth/callback` and `https://usebyro.com/auth/callback`.
      No trailing full stop (a stray `.` broke the first attempt).
- [ ] Google Cloud: publish the OAuth app (it only lets test users in while in "Testing").
- [ ] GA4: mark `purchase`, `sign_up` and `create_event` as key events (Admin -> Events).
- [ ] Email logo only appears after the frontend deploy (`/assets/images/logo-email.png`).

## How refunds work (decisions you made)

- Buyers cannot ask for refunds. The only trigger is an organiser cancelling an event.
- Buyer gets the ticket price back (after any promo discount). Byro's service fee and the payment charge are never refunded.
- Cancelling moves NO money. It records refunds as "awaiting approval", tells every ticket holder, and alerts Byro.
- A Byro admin (admin panel -> Refunds) checks the Paystack balance and presses Send. Each send is audit-logged.
- Refunds go back to the payment method used (card, or the bank account paid from). Paystack says 3-10 working days.
- If Paystack did not capture bank details (transfers / USSD) the refund shows "needs attention": enter the buyer's
  account in the Paystack dashboard using the reference shown.
- If the organiser was already paid out for the event, withdrawals are blocked until later sales cover it.
- Events with paid tickets or unfinished refunds cannot be deleted. Cancel them instead.
- The refund policy, FAQ and pricing wording were rewritten to match. Have the policy text reviewed.

## Known gaps / risks

- **The backend has no error monitoring.** Only the frontend has Sentry. Backend errors only reach the host's log.
- Paystack refunds come out of Byro's Paystack balance / next payout. Money already settled to the bank is not pulled back.
- The Tawk.to chat widget loads before cookie consent and sets its own cookie (listed on /cookies, not gated).
- The cookie "Marketing" switch does nothing yet (no ad code exists).
- New screens were checked by tests and the type checker, not clicked through in a browser:
  Create event step 4, checkout questions, redesigned profile page, cookie banner, cancel dialog, admin Refunds.
- Create event V2 is missing: Saved / Preview in the header, online/TBA locations.
- Email layouts are the old ones inside the new frame (no QR in the ticket email, no milestone banner, no payout timeline).
- Older commits on `main` (4-5 Oct) still carry a `Co-Authored-By: Claude` line.
- Local `Backend/db.sqlite3` has uncommitted changes. It is deliberately never committed.
