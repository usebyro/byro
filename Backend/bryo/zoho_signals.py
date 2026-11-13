"""
Keep Zoho Campaigns in step with a person's profile.

  role set or changed       -> join the Organisers or Attendees list (leave the old one)
  newsletter_subscribed     -> join or leave the Newsletter list

Role is chosen at onboarding, after the account exists, so the profile is where it is known.
Runs after the save commits and off the request, and does nothing at all when Zoho is off.
"""
from django.db import transaction
from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver

from .models import UserProfile
from .services import zoho


@receiver(pre_save, sender=UserProfile)
def remember_old_values(sender, instance, **kwargs):
    instance._zoho_old = None
    if zoho.is_enabled() and instance.pk:
        instance._zoho_old = (
            UserProfile.objects.filter(pk=instance.pk).values('role', 'newsletter_subscribed').first()
        )


@receiver(post_save, sender=UserProfile)
def sync_profile(sender, instance, created, **kwargs):
    if not zoho.is_enabled():
        return
    old = getattr(instance, '_zoho_old', None) or {'role': '', 'newsletter_subscribed': False}
    user = instance.user
    new_role, new_news = instance.role, instance.newsletter_subscribed

    if new_role != old['role']:
        transaction.on_commit(lambda: zoho.run_in_background(zoho.move_role, user, old['role'], new_role))
    if new_news != old['newsletter_subscribed']:
        transaction.on_commit(lambda: zoho.run_in_background(zoho.set_newsletter, user, new_news))
