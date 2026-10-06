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
