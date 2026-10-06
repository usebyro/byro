// Load test for the Byro API: the public pages people hit on event day.
//
//   BASE_URL=https://your-staging-host k6 run loadtest/k6-api.js
//   BASE_URL=http://localhost:8000 PEAK=100 k6 run loadtest/k6-api.js
//
// Needs loadtest/data.json from:  python manage.py seed_loadtest
//
// Read-only on purpose: no sign-in (rate-limited, calls WorkOS), no payments
// (calls Paystack), nothing that sends email. Never point it at production.

import http from 'k6/http';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';

const BASE = (__ENV.BASE_URL || 'http://localhost:8000').replace(/\/+$/, '');
const PEAK = parseInt(__ENV.PEAK || '50', 10); // peak concurrent users

const data = new SharedArray('seed', () => [JSON.parse(open('./data.json'))])[0];
const pick = (list) => list[Math.floor(Math.random() * list.length)];

export const options = {
  scenarios: {
    // Someone browsing: the event list, then one event.
    browse: {
      executor: 'ramping-vus', exec: 'browse', startVUs: 0,
      stages: [
        { duration: '30s', target: Math.ceil(PEAK * 0.5) },
        { duration: '1m', target: PEAK },
        { duration: '30s', target: 0 },
      ],
    },
    // Someone opening their ticket at the door: the ticket, then its QR.
    ticket: {
      executor: 'ramping-vus', exec: 'ticket', startVUs: 0,
      stages: [
        { duration: '30s', target: Math.ceil(PEAK * 0.5) },
        { duration: '1m', target: PEAK },
        { duration: '30s', target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],     // under 1% errors
    http_req_duration: ['p(95)<800'],   // 95% of requests under 800 ms
    'http_req_duration{page:ticket}': ['p(95)<500'],
  },
};

export function browse() {
  const list = http.get(`${BASE}/api/events/`, { tags: { page: 'events_list' } });
  check(list, { 'events list 200': (r) => r.status === 200 });
  const ev = http.get(`${BASE}/api/events/${pick(data.slugs)}/`, { tags: { page: 'event_detail' } });
  check(ev, { 'event detail 200': (r) => r.status === 200 });
  sleep(1 + Math.random() * 2); // think time
}

export function ticket() {
  const id = pick(data.tickets);
  const t = http.get(`${BASE}/api/tickets/${id}/`, { tags: { page: 'ticket' } });
  check(t, { 'ticket 200': (r) => r.status === 200 });
  const qr = http.get(`${BASE}/api/tickets/${id}/qr/`, { tags: { page: 'ticket_qr' } });
  check(qr, { 'qr 200': (r) => r.status === 200 && r.headers['Content-Type'] === 'image/png' });
  sleep(1 + Math.random() * 2);
}
