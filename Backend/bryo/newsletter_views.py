"""
The Byro newsletter, kept on the Zoho Campaigns Newsletter list.

  POST /api/newsletter/subscribe/    {email, first_name?, last_name?, website?}   public
  POST /api/newsletter/unsubscribe/  {email, website?}                            public
  GET/PUT /api/me/newsletter/        {subscribed}                                 signed in

`website` is a honeypot: people never see it, bots fill it in. A filled one gets a normal 200
and nothing happens. Zoho's own emails carry an unsubscribe link; the unsubscribe endpoint is
for in-app preference toggles.
"""
import logging

from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import UserProfile
from .services import zoho

logger = logging.getLogger(__name__)

MAX_EMAIL = 254
MAX_NAME = 100


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


class _PublicNewsletterView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_scope = 'newsletter'


class NewsletterSubscribeView(_PublicNewsletterView):
    def post(self, request):
        if request.data.get('website'):  # honeypot
            return Response({'success': True, 'message': 'Subscribed'}, status=status.HTTP_200_OK)
        email = _clean_email(request.data.get('email'))
        if not email:
            return Response({'success': False, 'error': 'Enter a valid email address.'},
                            status=status.HTTP_400_BAD_REQUEST)
        result = zoho.subscribe(
            zoho.LIST_NEWSLETTER, email,
            _name(request.data.get('first_name')), _name(request.data.get('last_name')),
        )
        if not result.ok:
            return Response({'success': False, 'error': 'Could not subscribe right now'},
                            status=status.HTTP_502_BAD_GATEWAY)
        return Response({'success': True, 'message': 'Subscribed'}, status=status.HTTP_200_OK)


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
