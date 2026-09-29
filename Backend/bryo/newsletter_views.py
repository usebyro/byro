import logging

from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .services.brevo import BrevoError, BrevoNotConfigured, subscribe_contact

logger = logging.getLogger(__name__)


class NewsletterSubscribeView(APIView):
    """POST /api/newsletter/subscribe/   {email}"""
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_scope = 'newsletter'

    def post(self, request):
        email = (request.data.get('email') or '').strip().lower()
        try:
            validate_email(email)
        except ValidationError:
            return Response(
                {'error': 'Enter a valid email address.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            subscribe_contact(email)
        except BrevoNotConfigured:
            logger.error("Newsletter signup attempted but BREVO_API_KEY / BREVO_LIST_ID are not set")
            return Response(
                {'error': 'Signups are unavailable right now. Try again later.'},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        except BrevoError:
            return Response(
                {'error': "We couldn't sign you up. Try again in a moment."},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        return Response({'message': "You're on the list."}, status=status.HTTP_200_OK)
