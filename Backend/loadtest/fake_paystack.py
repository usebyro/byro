"""A stand-in for Paystack's API, for load tests only.

    python loadtest/fake_paystack.py            # listens on :9000
    PAYSTACK_API_BASE=http://localhost:9000 LOADTEST_MODE=1 DEBUG=True ...

Implements the two calls the checkout makes:
  POST /transaction/initialize   -> remembers the amount/metadata, returns a URL
  GET  /transaction/verify/<ref> -> reports that transaction as paid ("success")
so every initialised payment can be verified as if the buyer had paid.
Adds an optional artificial delay (FAKE_PAYSTACK_DELAY_MS) to mimic Paystack's latency.
"""

import json
import os
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

DELAY = float(os.getenv('FAKE_PAYSTACK_DELAY_MS', '150')) / 1000
PORT = int(os.getenv('PORT', '9000'))
TXNS = {}


class Handler(BaseHTTPRequestHandler):
    def _send(self, body, code=200):
        data = json.dumps(body).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self):
        time.sleep(DELAY)
        if self.path.rstrip('/') != '/transaction/initialize':
            return self._send({'status': False, 'message': 'not found'}, 404)
        payload = json.loads(self.rfile.read(int(self.headers.get('Content-Length', 0))) or b'{}')
        ref = payload.get('reference')
        TXNS[ref] = payload
        self._send({'status': True, 'message': 'Authorization URL created', 'data': {
            'authorization_url': f'http://localhost:{PORT}/pay/{ref}', 'access_code': f'ac_{ref[-8:]}', 'reference': ref,
        }})

    def do_GET(self):
        time.sleep(DELAY)
        if not self.path.startswith('/transaction/verify/'):
            return self._send({'status': False, 'message': 'not found'}, 404)
        ref = self.path.rsplit('/', 1)[-1]
        txn = TXNS.get(ref)
        if txn is None:
            return self._send({'status': False, 'message': 'Transaction reference not found'}, 404)
        self._send({'status': True, 'message': 'Verification successful', 'data': {
            'status': 'success', 'reference': ref, 'amount': txn['amount'], 'currency': txn.get('currency', 'NGN'),
            'channel': 'card', 'metadata': txn.get('metadata', {}), 'customer': {'email': txn.get('email')},
        }})

    def log_message(self, *args):  # silence per-request logging
        pass


if __name__ == '__main__':
    print(f'fake Paystack on :{PORT} (delay {DELAY * 1000:.0f} ms)')
    ThreadingHTTPServer(('0.0.0.0', PORT), Handler).serve_forever()
