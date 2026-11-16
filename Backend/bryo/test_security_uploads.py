"""Uploads and payout details: only real pictures of a sensible size, and well-formed bank and wallet details."""
import io
import tempfile
from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from PIL import Image
from rest_framework.test import APIClient

from . import merch
from .models import UserProfile
from .test_merch import MerchBase

User = get_user_model()


def picture(fmt='PNG', name='pic.png', size=(8, 8)):
    buf = io.BytesIO()
    Image.new('RGB', size, 'red').save(buf, fmt)
    return SimpleUploadedFile(name, buf.getvalue(), content_type=f'image/{fmt.lower()}')


MEDIA = tempfile.mkdtemp()


@override_settings(MEDIA_ROOT=MEDIA, STORAGES={'default': {'BACKEND': 'django.core.files.storage.FileSystemStorage'},
                                               'staticfiles': {'BACKEND': 'django.contrib.staticfiles.storage.StaticFilesStorage'}})
class ImageUploadTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(email='me@example.com')
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def upload(self, field, url, f):
        return self.client.post(url, {field: f}, format='multipart')

    def test_a_real_picture_is_accepted_for_avatar_and_cover(self):
        self.assertEqual(self.upload('avatar', '/api/profile/me/avatar/', picture()).status_code, 200)
        self.assertEqual(self.upload('cover_image', '/api/profile/me/cover-image/', picture('JPEG', 'c.jpg')).status_code, 200)

    def test_a_web_page_renamed_to_png_is_refused(self):
        page = SimpleUploadedFile('avatar.png', b'<html><script>alert(1)</script></html>', content_type='image/png')
        r = self.upload('avatar', '/api/profile/me/avatar/', page)
        self.assertEqual(r.status_code, 400)
        self.assertFalse(UserProfile.objects.get(user=self.user).avatar)

    def test_an_svg_is_refused(self):
        svg = SimpleUploadedFile('a.svg', b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>', content_type='image/svg+xml')
        self.assertEqual(self.upload('cover_image', '/api/profile/me/cover-image/', svg).status_code, 400)

    def test_a_picture_over_5mb_is_refused(self):
        small = picture()
        big = SimpleUploadedFile('big.png', small.read() + b'0' * (5 * 1024 * 1024), content_type='image/png')
        self.assertEqual(self.upload('avatar', '/api/profile/me/avatar/', big).status_code, 400)

    def test_a_picture_named_like_a_web_page_is_refused(self):
        self.assertEqual(self.upload('avatar', '/api/profile/me/avatar/', picture('PNG', 'evil.html')).status_code, 400)

    def test_the_stored_name_is_random_and_matches_the_real_format(self):
        self.assertEqual(self.upload('avatar', '/api/profile/me/avatar/', picture('PNG', 'My Holiday.PNG')).status_code, 200)
        name = UserProfile.objects.get(user=self.user).avatar.name
        self.assertRegex(name, r'^avatars/[0-9a-f]{32}\.png$')

    def test_a_format_that_is_not_allowed_is_refused(self):
        self.assertEqual(self.upload('avatar', '/api/profile/me/avatar/', picture('BMP', 'a.bmp')).status_code, 400)


class PayoutDetailTests(MerchBase):
    def earn(self):
        order = self.paid('pickup')
        merch.advance(order, 'ready')
        merch.advance(order, 'picked_up', code=order.pickup_code)

    def ask(self, **body):
        self.client.force_authenticate(self.seller)
        data = {'amount': '1000', 'method': 'bank', 'bank_name': 'GTB', 'account_number': '0123456789', 'account_name': 'Seller'}
        data.update(body)
        return self.client.post('/api/payouts/', data, format='json')

    def test_a_bank_account_number_must_be_ten_digits(self):
        self.earn()
        for bad in ('12345', '01234567890', '0123-45678', 'abcdefghij', '<script>'):
            self.assertEqual(self.ask(account_number=bad).status_code, 400, bad)
        self.assertEqual(self.ask().status_code, 201)

    def test_a_wallet_address_must_look_like_one(self):
        self.earn()
        for bad in ('short', 'has spaces in it and is long enough to pass length 1234', '<script>alert(1)</script>0000'):
            self.assertEqual(self.ask(method='wallet', wallet_address=bad, wallet_type='USDT').status_code, 400, bad)
        good = '0x' + 'a1' * 20
        self.assertEqual(self.ask(method='wallet', wallet_address=good, wallet_type='USDT').status_code, 201)
