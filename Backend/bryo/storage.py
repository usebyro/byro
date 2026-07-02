import os
import uuid
import mimetypes
from django.core.files.storage import Storage
from django.conf import settings
import requests


class SupabaseMediaStorage(Storage):
    """
    Django storage backend that persists files in Supabase Storage.
    Fixes the ephemeral-disk problem on Render where local media/ files
    are wiped on every deploy/restart.
    """

    def __init__(self):
        self.base_url = settings.SUPABASE_URL.rstrip("/")
        self.key = settings.SUPABASE_KEY
        self.bucket = settings.SUPABASE_STORAGE_BUCKET
        self._headers = {
            "Authorization": f"Bearer {self.key}",
        }

    # ------------------------------------------------------------------ #
    # Internal helpers                                                     #
    # ------------------------------------------------------------------ #

    def _object_url(self, name):
        return f"{self.base_url}/storage/v1/object/{self.bucket}/{name}"

    def _public_url(self, name):
        return f"{self.base_url}/storage/v1/object/public/{self.bucket}/{name}"

    # ------------------------------------------------------------------ #
    # Django Storage interface                                             #
    # ------------------------------------------------------------------ #

    def _save(self, name, content):
        content_type, _ = mimetypes.guess_type(name)
        headers = {
            **self._headers,
            "Content-Type": content_type or "application/octet-stream",
            "x-upsert": "true",
        }
        data = content.read()
        response = requests.post(self._object_url(name), headers=headers, data=data)
        response.raise_for_status()
        return name

    def exists(self, name):
        # Checked via public URL; avoids a separate signed-URL round-trip.
        r = requests.head(self._public_url(name), headers=self._headers)
        return r.status_code == 200

    def url(self, name):
        return self._public_url(name)

    def delete(self, name):
        requests.delete(self._object_url(name), headers=self._headers)

    def size(self, name):
        r = requests.head(self._public_url(name), headers=self._headers)
        return int(r.headers.get("Content-Length", 0))

    def get_available_name(self, name, max_length=None):
        # Prefix with a uuid so names never collide — avoids the exists()
        # round-trip loop Django would otherwise do on every upload.
        base, ext = os.path.splitext(name)
        name = f"{base}_{uuid.uuid4().hex}{ext}"
        if max_length and len(name) > max_length:
            name = name[-max_length:]
        return name
