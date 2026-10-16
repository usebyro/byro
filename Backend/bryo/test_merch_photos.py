"""Merch items can have several photos (a slideshow); the first is the cover."""
import io
import shutil
import tempfile

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from PIL import Image

from .models import MerchItem, MerchPhoto
from .test_admin_tools import AdminBase

MEDIA = tempfile.mkdtemp()


def png(name='p.png'):
    buf = io.BytesIO()
    Image.new('RGB', (8, 8), (54, 105, 246)).save(buf, 'PNG')
    return SimpleUploadedFile(name, buf.getvalue(), content_type='image/png')


@override_settings(MEDIA_ROOT=MEDIA)
class MerchPhotoTests(AdminBase):

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(MEDIA, ignore_errors=True)
        super().tearDownClass()

    def setUp(self):
        super().setUp()
        self.seller = self.fan('seller@example.com')
        self.as_(self.seller)

    def create(self, n):
        res = self.client.post('/api/merch/', {'name': 'Tee', 'is_active': 'true', 'new_photos': [png(f'{i}.png') for i in range(n)]},
                               format='multipart')
        self.assertEqual(res.status_code, 201, res.content)
        return res.json()

    def test_an_item_gets_several_photos_and_the_first_is_the_cover(self):
        data = self.create(3)
        self.assertEqual(len(data['photos']), 3)
        self.assertEqual(data['image_url'], data['photos'][0]['url'])
        item = MerchItem.objects.get()
        self.assertEqual(item.image.name, item.photos.first().image.name)

    def test_photos_can_be_added_removed_and_reordered(self):
        data = self.create(2)
        first, second = [p['id'] for p in data['photos']]
        res = self.client.patch(f"/api/merch/{data['id']}/",
                                {'new_photos': [png('c.png')], 'remove_photos': [first]}, format='multipart')
        self.assertEqual(res.status_code, 200, res.content)
        ids = [p['id'] for p in res.json()['photos']]
        self.assertEqual(len(ids), 2)
        self.assertEqual(ids[0], second)
        res = self.client.patch(f"/api/merch/{data['id']}/", {'photo_order': [ids[1], ids[0]]}, format='multipart')
        self.assertEqual([p['id'] for p in res.json()['photos']], [ids[1], ids[0]])
        item = MerchItem.objects.get()
        self.assertEqual(item.image.name, MerchPhoto.objects.get(pk=ids[1]).image.name)

    def test_removing_every_photo_clears_the_cover(self):
        data = self.create(1)
        res = self.client.patch(f"/api/merch/{data['id']}/", {'remove_photos': [data['photos'][0]['id']]},
                                format='multipart')
        self.assertEqual((res.json()['photos'], res.json()['image_url']), ([], None))

    def test_at_most_six_photos(self):
        res = self.client.post('/api/merch/', {'name': 'Tee', 'new_photos': [png(f'{i}.png') for i in range(7)]},
                               format='multipart')
        self.assertEqual(res.status_code, 400)

    def test_the_old_single_image_field_still_works(self):
        res = self.client.post('/api/merch/', {'name': 'Cap', 'image': png()}, format='multipart')
        self.assertEqual(len(res.json()['photos']), 1)

    def test_you_cannot_touch_someone_elses_photos(self):
        data = self.create(1)
        other = self.create(1)
        self.as_(self.fan('nosy@example.com'))
        res = self.client.patch(f"/api/merch/{data['id']}/", {'remove_photos': [data['photos'][0]['id']]},
                                format='multipart')
        self.assertEqual(res.status_code, 404)
        self.as_(self.seller)
        # An id from another item is ignored, not deleted.
        self.client.patch(f"/api/merch/{data['id']}/", {'remove_photos': [other['photos'][0]['id']]}, format='multipart')
        self.assertTrue(MerchPhoto.objects.filter(pk=other['photos'][0]['id']).exists())

    def test_the_public_profile_lists_every_photo(self):
        from .models import UserProfile
        self.create(2)
        UserProfile.objects.update_or_create(user=self.seller, defaults={'handle': 'seller', 'is_public': True})
        self.client.force_authenticate(None)
        res = self.client.get('/api/profile/seller/')
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(len(res.json()['merch_items'][0]['photos']), 2)
