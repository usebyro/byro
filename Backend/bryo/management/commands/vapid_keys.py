"""Make the key pair for Web Push. Run once; put both values in the backend's settings.

    python manage.py vapid_keys
"""
import base64

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from django.core.management.base import BaseCommand


def _b64url(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b'=').decode()


class Command(BaseCommand):
    help = 'Generate VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY for Web Push.'

    def handle(self, *args, **options):
        key = ec.generate_private_key(ec.SECP256R1())
        private = key.private_numbers().private_value.to_bytes(32, 'big')
        public = key.public_key().public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
        self.stdout.write(f'VAPID_PUBLIC_KEY={_b64url(public)}')
        self.stdout.write(f'VAPID_PRIVATE_KEY={_b64url(private)}')
        self.stdout.write('Keep the private key secret. Changing the pair later means everyone turns push on again.')
