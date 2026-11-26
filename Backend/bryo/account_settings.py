"""
Settings > Account and Privacy, for the signed-in person.

  GET/PATCH  /api/account/                      name, email (read only), time zone
  GET        /api/account/sessions/             where they are signed in
  DELETE     /api/account/sessions/<id>/        sign one of them out
  POST       /api/account/sessions/sign-out-others/
  POST       /api/account/delete/               {confirm_email}: delete the account (anonymise)
  GET/PATCH  /api/account/privacy/              {listed, show_passport}
  POST       /api/account/data-export/          email a 7-day download link
  GET        /api/account/data-export/download/?t=<token>   the zip, for the signed-in owner of the token

The email address is never changed here: that stays support-led.
"""
import csv
import io
import logging
import zipfile
from datetime import timedelta

from django.conf import settings
from django.core import signing
from django.core.cache import cache
from django.http import HttpResponse
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Event, Payment, Ticket, UserProfile

logger = logging.getLogger(__name__)

EXPORT_SALT = 'byro.data-export'
EXPORT_DAYS = 7
EXPORT_COOLDOWN = 3600  # one request an hour


def _profile(user):
    return UserProfile.objects.get_or_create(user=user)[0]


def _name(user):
    return f"{user.first_name} {user.last_name}".strip()


def _account_body(user):
    profile = _profile(user)
    return {'name': _name(user), 'email': user.email, 'timezone': profile.timezone}


class AccountView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(_account_body(request.user))

    def patch(self, request):
        user, data = request.user, request.data
        profile = _profile(user)
        if 'name' in data:
            name = ' '.join(str(data['name'] or '').split())
            if not name:
                return Response({'error': 'Add your name so co-hosts and door staff know who you are.'}, status=400)
            if len(name) > 100:
                return Response({'error': 'Keep your name under 100 characters.'}, status=400)
            first, _, last = name.partition(' ')
            user.first_name, user.last_name = first, last
            user.save(update_fields=['first_name', 'last_name'])
        if 'timezone' in data:
            if data['timezone'] not in dict(UserProfile.TIME_ZONES):
                return Response({'error': 'Choose a time zone from the list.'}, status=400)
            profile.timezone = data['timezone']
            profile.save(update_fields=['timezone'])
        return Response(_account_body(user))


# ---- where they are signed in ------------------------------------------------

def _device(user_agent):
    ua = (user_agent or '').lower()
    if 'iphone' in ua:
        what = 'iPhone'
    elif 'ipad' in ua:
        what = 'iPad'
    elif 'android' in ua:
        what = 'Android'
    elif 'macintosh' in ua or 'mac os' in ua:
        what = 'Mac'
    elif 'windows' in ua:
        what = 'Windows'
    elif 'linux' in ua:
        what = 'Linux'
    else:
        what = 'Device'
    if 'edg/' in ua:
        browser = 'Edge'
    elif 'chrome' in ua or 'crios' in ua:
        browser = 'Chrome'
    elif 'firefox' in ua or 'fxios' in ua:
        browser = 'Firefox'
    elif 'safari' in ua:
        browser = 'Safari'
    else:
        browser = 'Browser'
    return f"{what} · {browser}"


def _list_sessions(user):
    from .services import workos_api
    if not user.workos_id:
        return []
    page = workos_api.client().user_management.list_sessions(user.workos_id, limit=20)
    return [s for s in page.data if getattr(s, 'status', 'active') == 'active']


def _current_sid(request):
    claims = request.auth if isinstance(request.auth, dict) else {}
    return claims.get('sid')


class SessionsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        current = _current_sid(request)
        try:
            sessions = _list_sessions(request.user)
        except Exception:
            logger.exception('Could not list sessions')
            return Response({'error': "We couldn't load your devices. Try again."}, status=502)
        out = [{
            'id': s.id,
            'name': _device(getattr(s, 'user_agent', '')),
            'current': s.id == current,
            'last_active': getattr(s, 'created_at', None),
        } for s in sessions]
        out.sort(key=lambda d: (not d['current'], str(d['last_active'] or '')), reverse=False)
        return Response({'sessions': out})


class SessionDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, session_id):
        from .services import workos_api
        if session_id == _current_sid(request):
            return Response({'error': 'Use Sign out to leave this device.'}, status=400)
        try:
            mine = {s.id for s in _list_sessions(request.user)}
            if session_id not in mine:
                return Response({'error': 'That device is already signed out.'}, status=404)
            workos_api.client().user_management.revoke_session(session_id=session_id)
        except Exception:
            logger.exception('Could not sign a device out')
            return Response({'error': "We couldn't sign that device out. Try again."}, status=502)
        return Response({'ok': True})


class SignOutOthersView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        from .services import workos_api
        current = _current_sid(request)
        try:
            for s in _list_sessions(request.user):
                if s.id != current:
                    workos_api.client().user_management.revoke_session(session_id=s.id)
        except Exception:
            logger.exception('Could not sign out other devices')
            return Response({'error': "We couldn't sign out your other devices. Try again."}, status=502)
        return Response({'ok': True})


# ---- delete ----------------------------------------------------------------------

class AccountDeleteView(APIView):
    """Same rules and the same anonymising as an admin deleting the account on request."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from .accounts import delete_blockers
        return Response({'blockers': delete_blockers(request.user, you=True)})

    def post(self, request):
        from .accounts import anonymise, delete_blockers
        user = request.user
        if (request.data.get('confirm_email') or '').strip().lower() != (user.email or '').lower():
            return Response({'error': 'Type your email address exactly to confirm.'}, status=400)
        blockers = delete_blockers(user, you=True)
        if blockers:
            return Response({'error': blockers[0], 'blockers': blockers}, status=400)
        anonymise(user)
        return Response({'deleted': True})


# ---- privacy -----------------------------------------------------------------------

def _privacy_body(profile):
    return {'listed': profile.list_in_directory, 'show_passport': profile.show_passport}


class PrivacyView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(_privacy_body(_profile(request.user)))

    def patch(self, request):
        profile = _profile(request.user)
        changed = []
        for key, field in (('listed', 'list_in_directory'), ('show_passport', 'show_passport')):
            if key in request.data:
                if not isinstance(request.data[key], bool):
                    return Response({'error': 'Each choice is on or off.'}, status=400)
                setattr(profile, field, request.data[key])
                changed.append(field)
        if not changed:
            return Response({'error': 'Nothing to change.'}, status=400)
        profile.save(update_fields=changed)
        return Response(_privacy_body(profile))


# ---- download your data --------------------------------------------------------------------

def _csv(rows, header):
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(header)
    for r in rows:
        # A spreadsheet runs anything that starts with = + - @ as a formula: keep it text.
        w.writerow([("'" + v) if isinstance(v, str) and v[:1] in '=+-@' else v for v in r])
    return buf.getvalue()


def build_export(user):
    """A zip of CSVs: their events, the people registered for them, and the money in."""
    events = list(Event.objects.filter(owner=user).order_by('-day'))
    event_rows = [(e.name, e.slug, e.day, e.location, 'cancelled' if e.cancelled_at else ('draft' if e.is_draft else 'live'),
                   e.capacity) for e in events]
    tickets = (Ticket.objects.filter(event__owner=user, payment_status__in=['paid', 'free'])
               .select_related('event', 'tier').order_by('event__name', 'created_at'))
    guest_rows = [(t.event.name, t.current_owner_name, t.current_owner_email, t.tier.name if t.tier else '',
                   t.payment_status, 'yes' if t.checked_in else 'no', t.created_at.date()) for t in tickets.iterator()]
    payments = Payment.objects.filter(event__owner=user, status='successful').select_related('event').order_by('-paid_at')
    sale_rows = [(p.event.name, p.customer_name, p.customer_email, p.amount, p.currency, p.paid_at.date() if p.paid_at else '',
                  p.paystack_reference) for p in payments.iterator()]
    out = io.BytesIO()
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
        z.writestr('events.csv', _csv(event_rows, ['Event', 'Link name', 'Date', 'Location', 'Status', 'Capacity']))
        z.writestr('guest-list.csv', _csv(guest_rows, ['Event', 'Name', 'Email', 'Ticket', 'Payment', 'Checked in', 'Registered']))
        z.writestr('sales.csv', _csv(sale_rows, ['Event', 'Buyer', 'Buyer email', 'Amount', 'Currency', 'Paid on', 'Reference']))
    return out.getvalue()


class DataExportRequestView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        from .emails import data_export_email
        from .mailer import send_email
        user = request.user
        key = f'data-export:{user.pk}'
        if not cache.add(key, 1, EXPORT_COOLDOWN):
            return Response({'error': 'We already sent you a link. Check your email, or try again in an hour.'}, status=429)
        token = signing.dumps({'u': user.pk}, salt=EXPORT_SALT)
        site = (getattr(settings, 'FRONTEND_URL', '') or 'https://usebyro.com').rstrip('/')
        mail = data_export_email(_name(user) or (_profile(user).display_name or ''),
                                 f"{site}/dashboard/settings/privacy?export={token}")
        try:
            send_email(user.email, mail['subject'], mail['html'], mail['text'])
        except Exception:
            cache.delete(key)
            logger.exception('Could not send the data export link')
            return Response({'error': "We couldn't send the email. Try again."}, status=502)
        return Response({'sent': True})


class DataExportDownloadView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            data = signing.loads(request.query_params.get('t', ''), salt=EXPORT_SALT, max_age=EXPORT_DAYS * 86400)
        except signing.BadSignature:
            return Response({'error': 'This link has expired. Request a new download in Settings.'}, status=400)
        if data.get('u') != request.user.pk:
            return Response({'error': 'This link is for a different account. Sign in with the email it was sent to.'}, status=403)
        resp = HttpResponse(build_export(request.user), content_type='application/zip')
        resp['Content-Disposition'] = f'attachment; filename="byro-data-{timezone.localdate()}.zip"'
        return resp
