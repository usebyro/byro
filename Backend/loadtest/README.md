# Load testing the API

Measures requests per second and latency for the public pages people hit on
event day: the event list, an event, and a ticket with its QR code.

## 1. Run a realistic server

Not `runserver` (it handles one request at a time). Use gunicorn against a
Postgres database that resembles production:

    gunicorn api.wsgi:application --workers 4

The Procfile starts gunicorn with no worker count, so production is probably
on one worker. That caps requests per second; `--workers` is the first knob.

## 2. Seed data

    python manage.py seed_loadtest --events 300 --tickets-per-event 40
    python manage.py seed_loadtest --clean      # remove it afterwards

Refuses to run when `DEBUG` is off unless you pass `--force`. Use `--force`
only against a staging database, never production.

## 3. Run k6

    brew install k6
    BASE_URL=http://localhost:8000 PEAK=100 k6 run loadtest/k6-api.js

`PEAK` is the number of concurrent users at the top of the ramp. Raise it
step by step; the point where p95 latency climbs or errors start is the limit.

## Notes

- Read-only by design: no sign-in, payments or email.
- Sign-in endpoints are rate-limited per IP, so don't add them: a single test
  machine will just collect 429s.
- Seed with thousands of rows. Results on a near-empty database flatter you.
- Discard the first run on a plan that sleeps when idle.

## Flash sale: N people buying the same event at once

The browsing test above is read-only. This one is the opposite: lots of buyers
racing for a limited number of seats, which is where overselling bugs and lock
contention show up. It uses a fake Paystack, so nothing real is charged.

Needs **Postgres**. The seat check relies on row locks (`select_for_update`),
which SQLite ignores, so a SQLite run proves nothing about overselling.

    # terminal 1: stand-in for Paystack (adds ~150 ms like the real thing)
    python loadtest/fake_paystack.py

    # terminal 2: the API, in load-test mode, on Postgres, with several workers
    DEBUG=True LOADTEST_MODE=1 PAYSTACK_API_BASE=http://localhost:9000 \
      DB_ENGINE=django.db.backends.postgresql DB_NAME=... DB_USER=... DB_PASSWORD=... DB_HOST=... DB_PORT=... \
      gunicorn api.wsgi:application --workers 4

    # terminal 3
    python manage.py seed_loadtest --flash --capacity 200 --price 5000
    BUYERS=1000 k6 run loadtest/k6-flash-sale.js
    python manage.py check_flash_sale      # PASS = no overselling

`LOADTEST_MODE` skips Turnstile and silences email. It and `PAYSTACK_API_BASE`
only work when `DEBUG` is on, so production can't be switched into them.
Clean up afterwards with `python manage.py seed_loadtest --clean`.
