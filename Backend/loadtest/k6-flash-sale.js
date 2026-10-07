// Flash-sale test: BUYERS people try to buy a seat for the SAME event at once.
//
//   python manage.py seed_loadtest --flash --capacity 200 --price 5000
//   BASE_URL=http://localhost:8000 BUYERS=1000 k6 run loadtest/k6-flash-sale.js
//   python manage.py check_flash_sale          # did we oversell?
//
// Each buyer: opens the event, starts a payment (this reserves a seat), then
// "pays" and the payment is verified, which issues the ticket. Needs the fake
// Paystack and LOADTEST_MODE (see loadtest/README.md). Never point it at production.
//
// Running out of seats is EXPECTED: the first CAPACITY buyers win and the rest
// are turned away. That is not an error here. Overselling is.

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter } from 'k6/metrics';
import { SharedArray } from 'k6/data';

const BASE = (__ENV.BASE_URL || 'http://localhost:8000').replace(/\/+$/, '');
const BUYERS = parseInt(__ENV.BUYERS || '1000', 10);
const SPREAD = parseInt(__ENV.SPREAD_SECONDS || '5', 10); // arrivals spread over this many seconds
const flash = new SharedArray('seed', () => [JSON.parse(open('./data.json')).flash])[0];

const bought = new Counter('tickets_bought');
const soldOut = new Counter('turned_away_sold_out');
const unexpected = new Counter('unexpected_errors');

export const options = {
  scenarios: {
    rush: { executor: 'per-vu-iterations', vus: BUYERS, iterations: 1, maxDuration: '3m' },
  },
  thresholds: {
    // The one that matters: never sell more than the seats that exist.
    tickets_bought: [`count<=${flash.capacity}`],
    unexpected_errors: ['count==0'],
    'http_req_duration{step:initialize}': ['p(95)<3000'],
    'http_req_duration{step:verify}': ['p(95)<3000'],
  },
};

const json = { headers: { 'Content-Type': 'application/json' } };

export default function () {
  sleep(Math.random() * SPREAD); // people don't all arrive in the same millisecond

  const page = http.get(`${BASE}/api/events/${flash.slug}/`, { tags: { step: 'event' } });
  if (!check(page, { 'event page 200': (r) => r.status === 200 })) { unexpected.add(1); return; }

  const email = `buyer${__VU}-${Date.now()}@loadtest.invalid`;
  const init = http.post(`${BASE}/api/payments/initialize/`, JSON.stringify({
    event_slug: flash.slug, tier_id: flash.tier_id, quantity: 1,
    customer_email: email, customer_name: `Buyer ${__VU}`, turnstile_token: 'loadtest',
  }), { ...json, tags: { step: 'initialize' }, responseCallback: http.expectedStatuses(200, 400) });

  if (init.status === 400) {
    // 400 is how "not enough tickets" comes back; anything else is a real problem.
    if (/not enough|sold out|available/i.test(init.body)) { soldOut.add(1); } else { unexpected.add(1); }
    return;
  }
  if (init.status !== 200) { unexpected.add(1); return; }

  const ref = init.json('data.reference');
  sleep(1 + Math.random() * 2); // time spent on Paystack's page

  const verify = http.get(`${BASE}/api/payments/verify/${ref}/`, { tags: { step: 'verify' } });
  const ok = check(verify, { 'verify 200': (r) => r.status === 200 });
  if (ok) { bought.add(1); } else { unexpected.add(1); }
}
