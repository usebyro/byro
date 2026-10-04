from rest_framework.permissions import BasePermission
from django.conf import settings


def get_admin_member(user):
    """The AdminMember for a signed-in user, or None.

    Bootstrapping: while the team is empty, the first person to reach the admin
    panel becomes its owner. If ADMIN_BOOTSTRAP_EMAILS is set, only those
    emails may claim that first slot (and they are owners even once the team
    exists, so there is always a way back in).
    """
    from django.db import transaction

    from .models import AdminMember

    if not user or not user.is_authenticated or not user.email:
        return None
    email = user.email.strip().lower()
    member = AdminMember.objects.filter(email=email).first()
    if member is not None:
        return member

    allowed = settings.ADMIN_BOOTSTRAP_EMAILS
    if allowed and email not in allowed:
        return None
    with transaction.atomic():
        if allowed or not AdminMember.objects.exists():
            return AdminMember.objects.create(
                email=email, role=AdminMember.ROLE_OWNER, added_by_email='bootstrap',
            )
    return None


class IsAdminMember(BasePermission):
    """Signed-in admin team member whose role is high enough for this request.

    Views set `min_role` (default viewer) and may raise it for specific
    methods with `method_roles = {'DELETE': 'owner'}`. The resolved member is
    left on `request.admin_member`.
    """

    def has_permission(self, request, view):
        from .models import AdminMember

        member = get_admin_member(request.user)
        if member is None:
            return False
        required = getattr(view, 'method_roles', {}).get(
            request.method, getattr(view, 'min_role', AdminMember.ROLE_VIEWER)
        )
        if AdminMember.ROLE_RANK[member.role] < AdminMember.ROLE_RANK[required]:
            return False
        request.admin_member = member
        return True


class IsEventOwner(BasePermission):
    """
    Permission to check if user is the owner of the event.
    Only event owners can perform certain actions like adding/removing co-hosts.
    """
    
    def has_object_permission(self, request, view, obj):
        return obj.owner == request.user


class IsEventOwnerOrCoHost(BasePermission):
    """
    Permission to check if user is either the owner or a co-host of the event.
    Owners and manager co-hosts can edit events (only owners can delete).
    """
    
    def has_object_permission(self, request, view, obj):
        if not request.user.is_authenticated:
            return False
        
        if obj.owner == request.user:
            return True
        
        return obj.can_manage(request.user)


class IsEventOwnerOrCoHostOrReadOnly(BasePermission):
    """
    Permission that allows read-only access to everyone,
    but only allows write access to event owners and co-hosts.
    """
    
    def has_permission(self, request, view):
        if request.method in ['GET', 'HEAD', 'OPTIONS']:
            return True
        
        return request.user.is_authenticated
    
    def has_object_permission(self, request, view, obj):
        if request.method in ['GET', 'HEAD', 'OPTIONS']:
            return True
        
        if not request.user.is_authenticated:
            return False
        
        if obj.owner == request.user:
            return True
        
        return obj.can_manage(request.user)