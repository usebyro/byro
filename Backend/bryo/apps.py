"""Bryo application configuration."""

import atexit

from django.apps import AppConfig
from django.conf import settings


posthog_client = None


class BryoConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'bryo'

    def ready(self):
        """Create the process-wide PostHog client once Django is ready."""
        global posthog_client

        if not settings.POSTHOG_PROJECT_TOKEN:
            if settings.DEBUG:
                raise RuntimeError(
                    'POSTHOG_PROJECT_TOKEN variable required by PostHog is missing or '
                    'un-configured, this causes events to be silently missed. This error '
                    'stops appearing once POSTHOG_PROJECT_TOKEN is configured'
                )
            return

        if not settings.POSTHOG_HOST:
            if settings.DEBUG:
                raise RuntimeError(
                    'POSTHOG_HOST variable required by PostHog is missing or un-configured, '
                    'this causes events to be silently missed. This error stops appearing '
                    'once POSTHOG_HOST is configured'
                )
            return

        from posthog import Posthog

        posthog_client = Posthog(
            settings.POSTHOG_PROJECT_TOKEN,
            host=settings.POSTHOG_HOST,
            enable_exception_autocapture=True,
        )
        # The Django middleware is constructed after AppConfig.ready(). Giving
        # it this instance makes its request context and exception capture use
        # the same configured client as application instrumentation.
        settings.POSTHOG_MW_CLIENT = posthog_client
        atexit.register(posthog_client.shutdown)
