"""
The Byro newsletter, kept on the Zoho Campaigns Newsletter list, with a confirmation step.

  POST /api/newsletter/subscribe/          {email, first_name?, last_name?, website?}  public
        sends a "Confirm your subscription" email; nobody joins the list yet
  GET  /api/newsletter/confirm/<token>/    what the confirm page shows                public
  POST /api/newsletter/confirm/<token>/    the address confirms; joins the list       public
  POST /api/newsletter/resend/<token>/     an expired link asks for a fresh one       public
  POST /api/newsletter/unsubscribe/        {email, website?}                          public
  GET/PUT /api/me/newsletter/              {subscribed}                               signed in

A signed-in person's email is already verified by sign-in, so /api/me/newsletter/ (and the
onboarding checkbox) join the list directly.

`website` is a honeypot: people never see it, bots fill it in. A filled one gets a normal 200
and nothing happens. Zoho's own emails carry an unsubscribe link; the unsubscribe endpoint is
for in-app preference toggles.
"""
import logging
import secrets
from datetime import timedelta

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from django.db import transaction
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import NewsletterSignup, UserProfile
from .services import zoho

logger = logging.getLogger(__name__)

MAX_EMAIL = 254
MAX_NAME = 100
LINK_HOURS = 48
RESEND_AFTER_SECONDS = 60  # one confirmation email per address per minute, so the form can't be used to mail-bomb


def _clean_email(value):
    email = (value or '').strip().lower() if isinstance(value, str) else ''
    if not email or len(email) > MAX_EMAIL:
        return None
    try:
        validate_email(email)
    except ValidationError:
        return None
    return email


def _name(value):
    return value.strip()[:MAX_NAME] if isinstance(value, str) else ''


def _frontend_url():
    fallback = 'http://localhost:3000' if settings.DEBUG else 'https://usebyro.com'
    return (settings.FRONTEND_URL or fallback).rstrip('/')


def send_confirmation(email, first_name='', last_name=''):
    """
    Make a signup and email its link. Returns True when an email went out or one was sent
    moments ago, False when sending failed.
    """
    recent = NewsletterSignup.objects.filter(
        email=email, confirmed_at__isnull=True,
        created_at__gt=timezone.now() - timedelta(seconds=RESEND_AFTER_SECONDS),
    ).exists()
    if recent:
        return True
    signup = NewsletterSignup.objects.create(
        email=email, first_name=first_name, last_name=last_name,
        token=secrets.token_urlsafe(32),
        expires_at=timezone.now() + timedelta(hours=LINK_HOURS),
    )
    from .emails import newsletter_confirm_email
    from .mailer import send_email
    try:
        data = newsletter_confirm_email(f"{_frontend_url()}/newsletter/confirm/{signup.token}", LINK_HOURS)
        send_email(to=email, subject=data['subject'], html=data['html'], text=data['text'])
        return True
    except Exception as e:
        logger.error("Failed to send newsletter confirmation to %s: %s", zoho.mask_email(email), e)
        signup.delete()
        return False


class _PublicNewsletterView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_scope = 'newsletter'


class NewsletterSubscribeView(_PublicNewsletterView):
    def post(self, request):
        if request.data.get('website'):  # honeypot
            return Response({'success': True, 'message': 'Check your inbox to confirm'}, status=status.HTTP_200_OK)
        email = _clean_email(request.data.get('email'))
        if not email:
            return Response({'success': False, 'error': 'Enter a valid email address.'},
                            status=status.HTTP_400_BAD_REQUEST)
        if not send_confirmation(email, _name(request.data.get('first_name')), _name(request.data.get('last_name'))):
            return Response({'success': False, 'error': 'Could not subscribe right now'},
                            status=status.HTTP_502_BAD_GATEWAY)
        return Response({'success': True, 'message': 'Check your inbox to confirm'}, status=status.HTTP_200_OK)


class NewsletterConfirmView(_PublicNewsletterView):
    """The link in the email. The token is the credential, since it only went to that address."""
    throttle_scope = 'newsletter_confirm'

    def get(self, request, token):
        signup = NewsletterSignup.objects.filter(token=token).first()
        if signup is None:
            return Response({'error': 'This link is not valid.'}, status=status.HTTP_404_NOT_FOUND)
        return Response({'state': signup.state, 'email': signup.email})

    def post(self, request, token):
        with transaction.atomic():
            signup = NewsletterSignup.objects.select_for_update().filter(token=token).first()
            if signup is None:
                return Response({'error': 'This link is not valid.'}, status=status.HTTP_404_NOT_FOUND)
            if signup.confirmed_at or NewsletterSignup.objects.filter(email=signup.email, confirmed_at__isnull=False).exists():
                return Response({'state': 'already', 'email': signup.email})
            if signup.state == 'expired':
                return Response({'state': 'expired', 'email': signup.email}, status=status.HTTP_410_GONE)
            result = zoho.subscribe(zoho.LIST_NEWSLETTER, signup.email, signup.first_name, signup.last_name)
            if not result.ok:
                # Not marked confirmed, so the same link can be tried again.
                return Response({'error': "We couldn't subscribe you just now. Try again in a minute."},
                                status=status.HTTP_502_BAD_GATEWAY)
            signup.confirmed_at = timezone.now()
            signup.save(update_fields=['confirmed_at'])
        return Response({'state': 'confirmed', 'email': signup.email})


class NewsletterResendView(_PublicNewsletterView):
    """An expired link asks for a fresh one, sent to the same address."""
    throttle_scope = 'newsletter_confirm'

    def post(self, request, token):
        signup = NewsletterSignup.objects.filter(token=token).first()
        if signup is None:
            return Response({'error': 'This link is not valid.'}, status=status.HTTP_404_NOT_FOUND)
        if not send_confirmation(signup.email, signup.first_name, signup.last_name):
            return Response({'error': "We couldn't send it just now. Try again in a minute."},
                            status=status.HTTP_502_BAD_GATEWAY)
        return Response({'sent': True, 'email': signup.email})


class NewsletterUnsubscribeView(_PublicNewsletterView):
    def post(self, request):
        email = _clean_email(request.data.get('email'))
        if not email:
            return Response({'success': False, 'error': 'Enter a valid email address.'},
                            status=status.HTTP_400_BAD_REQUEST)
        if not request.data.get('website'):  # honeypot
            # The answer is the same whether or not they were subscribed, so this can't be used
            # to find out who is on the list.
            zoho.unsubscribe(zoho.LIST_NEWSLETTER, email)
            # They can sign up again later: forget their old confirmation.
            NewsletterSignup.objects.filter(email=email, confirmed_at__isnull=False).update(confirmed_at=None)
        return Response({'success': True}, status=status.HTTP_200_OK)


class MeNewsletterView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        profile, _ = UserProfile.objects.get_or_create(user=request.user)
        return Response({'subscribed': profile.newsletter_subscribed})

    def put(self, request):
        subscribed = request.data.get('subscribed')
        if not isinstance(subscribed, bool):
            return Response({'error': '"subscribed" must be true or false.'}, status=status.HTTP_400_BAD_REQUEST)
        profile, _ = UserProfile.objects.get_or_create(user=request.user)
        if profile.newsletter_subscribed != subscribed:
            profile.newsletter_subscribed = subscribed
            profile.save(update_fields=['newsletter_subscribed'])  # the profile signal syncs Zoho
        return Response({'subscribed': profile.newsletter_subscribed})
