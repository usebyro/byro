"""
Settings > Team: the people an organiser has on their whole team.

  GET    /api/team/              the owner, the members and what each role can do
  POST   /api/team/              {email, role}: invite (co-host or door staff)
  PATCH  /api/team/<id>/         {role}
  DELETE /api/team/<id>/         remove from the team

A member is granted co-host on every one of the organiser's events (existing per-event grants, so all the
permission checks keep working), and on each event they create later. One email goes out, not one per event.
Only the organiser manages their team; co-hosts and door staff cannot.
"""
import logging

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.validators import validate_email
from django.db import transaction
from django.db.models.signals import post_save
from django.dispatch import receiver
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from .models import Event, EventCoHost, TeamMember

logger = logging.getLogger(__name__)
User = get_user_model()

ROLES = ('manager', 'checkin')
ROLE_LABELS = {'manager': 'Co-host', 'checkin': 'Door staff'}


def team_events(owner):
    """Events a new team member gets: everything still ahead of them, drafts included."""
    return Event.objects.filter(owner=owner, cancelled_at__isnull=True).exclude(day__lt=timezone.localdate())


def _grant(member, event):
    """Give one member co-host access to one event, keeping the team's role."""
    now = timezone.now()
    if member.user_id:
        row = EventCoHost.objects.filter(event=event, user_id=member.user_id).first()
        if row:
            if row.role != member.role or row.status != EventCoHost.STATUS_ACCEPTED:
                row.role, row.status = member.role, EventCoHost.STATUS_ACCEPTED
                row.accepted_at = row.accepted_at or now
                row.save(update_fields=['role', 'status', 'accepted_at'])
            return
        EventCoHost.objects.create(event=event, user_id=member.user_id, invited_email=member.invited_email,
                                   status=EventCoHost.STATUS_ACCEPTED, role=member.role, accepted_at=now,
                                   added_by_id=member.owner_id)
        return
    row = EventCoHost.objects.filter(event=event, invited_email__iexact=member.invited_email, user__isnull=True).first()
    if row:
        if row.role != member.role:
            row.role = member.role
            row.save(update_fields=['role'])
        return
    EventCoHost.objects.create(event=event, user=None, invited_email=member.invited_email,
                               status=EventCoHost.STATUS_PENDING, role=member.role, added_by_id=member.owner_id)


def apply_member(member):
    for event in team_events(member.owner):
        _grant(member, event)


def _their_rows(member):
    from django.db.models import Q
    q = Q(invited_email__iexact=member.invited_email)
    if member.user_id:
        q |= Q(user_id=member.user_id)
    return EventCoHost.objects.filter(q, event__owner_id=member.owner_id)


@receiver(post_save, sender=Event)
def new_event_gets_the_team(sender, instance, created, **kwargs):
    """Everyone on the team is on a new event from the start."""
    if not created or not instance.owner_id:
        return
    try:
        for member in TeamMember.objects.filter(owner_id=instance.owner_id):
            _grant(member, instance)
    except Exception:
        logger.exception('Could not add the team to event %s', instance.pk)


def accept_team_invites(user):
    """Called when someone signs in with a verified email: pending team invites become theirs. Returns the members."""
    promoted = []
    for member in TeamMember.objects.filter(invited_email__iexact=user.email, status=TeamMember.STATUS_PENDING):
        member.user = user
        member.status = TeamMember.STATUS_ACCEPTED
        member.accepted_at = timezone.now()
        member.save(update_fields=['user', 'status', 'accepted_at'])
        promoted.append(member)
    return promoted


def _name(user):
    return (user.get_full_name() or '').strip()


def _owner_label(user):
    profile = getattr(user, 'profile', None)
    return (profile.display_name if profile and profile.display_name else '') or _name(user) or user.email


def _row(member):
    user = member.user
    name = (_name(user) if user else '') or member.invited_email
    return {'id': member.pk, 'name': name, 'email': member.invited_email, 'role': member.role,
            'role_label': ROLE_LABELS[member.role], 'pending': member.status == TeamMember.STATUS_PENDING}


def _body(owner):
    members = TeamMember.objects.filter(owner=owner).select_related('user')
    return {
        'owner': {'name': _name(owner) or owner.email, 'email': owner.email},
        'members': [_row(m) for m in members],
        'roles': [{'role': 'owner', 'label': 'Owner', 'can': 'Everything, plus payouts, bank account and deleting the community.'},
                  {'role': 'manager', 'label': 'Co-host', 'can': 'Create and edit events, see sales and guests, message followers, check people in.'},
                  {'role': 'checkin', 'label': 'Door staff', 'can': 'Check people in at the door. Nothing else.'}],
    }


def _send_invite(owner, member, is_new_user):
    from urllib.parse import quote

    from .emails import team_invite_email
    from .mailer import send_email
    site = (getattr(settings, 'FRONTEND_URL', '') or 'https://usebyro.com').rstrip('/')
    path = '/dashboard/overview'
    url = f"{site}/login?redirect={quote(path, safe='')}&email={quote(member.invited_email, safe='')}" if is_new_user else f"{site}{path}"
    mail = team_invite_email(_name(owner) or owner.email, _owner_label(owner), member.role, url, is_new_user=is_new_user)
    send_email(member.invited_email, mail['subject'], mail['html'], mail['text'])


class TeamView(APIView):
    permission_classes = [IsAuthenticated]

    def get_throttles(self):
        if self.request.method == 'POST':
            self.throttle_scope = 'cohost_invite'
            return [ScopedRateThrottle()]
        return []

    def get(self, request):
        return Response(_body(request.user))

    def post(self, request):
        owner = request.user
        email = (request.data.get('email') or '').strip().lower()
        role = (request.data.get('role') or 'manager').strip().lower()
        try:
            validate_email(email)
        except DjangoValidationError:
            return Response({'error': 'Enter a valid email address.'}, status=400)
        if role not in ROLES:
            return Response({'error': 'Choose co-host or door staff.'}, status=400)
        if email == (owner.email or '').lower():
            return Response({'error': "That's your own email. You're already the owner."}, status=400)
        if TeamMember.objects.filter(owner=owner, invited_email=email).exists():
            return Response({'error': 'They are already on your team.'}, status=400)

        person = User.objects.filter(email__iexact=email, is_active=True).first()
        with transaction.atomic():
            member = TeamMember.objects.create(
                owner=owner, invited_email=email, role=role,
                user=person, status=TeamMember.STATUS_ACCEPTED if person else TeamMember.STATUS_PENDING,
                accepted_at=timezone.now() if person else None,
            )
            apply_member(member)
        try:
            _send_invite(owner, member, is_new_user=person is None)
        except Exception:
            logger.exception('Could not send the team invite')  # they are on the team; the owner can resend by re-adding
        return Response({**_body(owner), 'added': member.pk}, status=status.HTTP_201_CREATED)


class TeamMemberView(APIView):
    permission_classes = [IsAuthenticated]

    def _member(self, request, pk):
        return TeamMember.objects.filter(owner=request.user, pk=pk).select_related('user').first()

    def patch(self, request, pk):
        member = self._member(request, pk)
        if not member:
            return Response({'error': 'Not found.'}, status=404)
        role = (request.data.get('role') or '').strip().lower()
        if role not in ROLES:
            return Response({'error': 'Choose co-host or door staff.'}, status=400)
        with transaction.atomic():
            member.role = role
            member.save(update_fields=['role'])
            _their_rows(member).update(role=role)
        return Response(_body(request.user))

    def delete(self, request, pk):
        member = self._member(request, pk)
        if not member:
            return Response({'error': 'Not found.'}, status=404)
        with transaction.atomic():
            _their_rows(member).delete()
            member.delete()
        return Response(_body(request.user))
