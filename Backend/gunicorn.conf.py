"""
Gunicorn settings. Gunicorn reads this file by itself when it starts from this folder, so it applies whatever
start command the host uses.

The default is ONE worker handling ONE request at a time, which means a few slow requests (or a few hundred
cheap ones) leave everyone else waiting. Threads let a worker keep serving while another request waits on the
database or Paystack. Override the counts with WEB_CONCURRENCY and GUNICORN_THREADS to match the instance size.
"""
import os

worker_class = "gthread"
workers = int(os.getenv("WEB_CONCURRENCY", "2"))
threads = int(os.getenv("GUNICORN_THREADS", "4"))

timeout = 30            # a request that takes longer than this is cut off, freeing its worker
graceful_timeout = 30
keepalive = 5

# Restart workers now and then so a slow memory leak can't take the service down.
max_requests = 1000
max_requests_jitter = 100

# Refuse absurd request lines and headers before they reach the app.
limit_request_line = 4094
limit_request_fields = 100
limit_request_field_size = 8190
