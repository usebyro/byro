from rest_framework import serializers
from django.utils import timezone
from django.utils.text import slugify
from .models import (
    Payment, WaitList, PrivyUser, Ticket, Event, EventCoHost,
    TicketTransfer, Payment, UserProfile, EventFormQuestion, EventFormAnswer,
    TicketTier,
)
from django.core.mail import send_mail
from django.contrib.auth import get_user_model
from django.urls import reverse
from django.conf import settings
import re

User = get_user_model()




class WaitListSerializer(serializers.Serializer):
    """Serializer for Wait Links"""
    email=serializers.CharField(required=True)

class WaitListSerializer(serializers.ModelSerializer):
    """Serializer for Wait List"""
    class Meta:
        model = WaitList
        fields = ['email']
        extra_kwargs = {
            'email': {'required': True}
        }


class PrivyUserSerializer(serializers.ModelSerializer):
    class Meta:
        model = PrivyUser
        fields = ['privy_id', 'email', 'wallet_address', 'created_at']
        read_only_fields = ['privy_id', 'created_at']


# ---------------------------------------------------------------------------
# User Profile
# ---------------------------------------------------------------------------

class UserProfileSerializer(serializers.ModelSerializer):
    email = serializers.EmailField(source='user.email', read_only=True)
    auth_provider = serializers.CharField(source='user.auth_provider', read_only=True)
    avatar_url = serializers.SerializerMethodField()

    class Meta:
        model = UserProfile
        fields = [
            'email', 'auth_provider',
            'display_name', 'handle', 'bio',
            'avatar', 'avatar_url',
            'location', 'website',
            'twitter', 'instagram', 'linkedin', 'telegram',
            'is_complete',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['email', 'auth_provider', 'avatar_url', 'created_at', 'updated_at']
        extra_kwargs = {'avatar': {'write_only': True, 'required': False}}

    def get_avatar_url(self, obj):
        if obj.avatar:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.avatar.url)
        return None

    def validate_handle(self, value):
        if not value:
            return value
        # Allow letters, numbers, underscores, hyphens
        if not re.match(r'^[a-zA-Z0-9_-]+$', value):
            raise serializers.ValidationError(
                "Handle can only contain letters, numbers, underscores and hyphens."
            )
        # Uniqueness (exclude current user)
        qs = UserProfile.objects.filter(handle=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("This handle is already taken.")
        return value

    def update(self, instance, validated_data):
        # Auto-mark profile complete when display_name is set
        if validated_data.get('display_name') and not instance.is_complete:
            validated_data['is_complete'] = True
        return super().update(instance, validated_data)


# ---------------------------------------------------------------------------
# Event Form Questions
# ---------------------------------------------------------------------------

class EventFormQuestionSerializer(serializers.ModelSerializer):
    class Meta:
        model = EventFormQuestion
        fields = ['id', 'question', 'question_type', 'options', 'required', 'order']
        read_only_fields = ['id']


class EventFormAnswerSerializer(serializers.ModelSerializer):
    question_text = serializers.CharField(source='question.question', read_only=True)

    class Meta:
        model = EventFormAnswer
        fields = ['id', 'question', 'question_text', 'answer']
        read_only_fields = ['id', 'question_text']




class TicketTierSerializer(serializers.ModelSerializer):
    remaining = serializers.SerializerMethodField()
    sold = serializers.SerializerMethodField()

    class Meta:
        model = TicketTier
        fields = ['id', 'name', 'price', 'capacity', 'order', 'remaining', 'sold']
        read_only_fields = ['id']

    def get_remaining(self, obj):
        request = self.context.get('request')
        event = obj.event
        # Only expose remaining counts when the organiser has opted in
        if request is not None and not event.show_remaining_count:
            if not (request.user.is_authenticated and event.is_owner_or_cohost(request.user)):
                return None
        return obj.remaining()

    def get_sold(self, obj):
        request = self.context.get('request')
        event = obj.event
        if request is not None and not event.show_remaining_count:
            if not (request.user.is_authenticated and event.is_owner_or_cohost(request.user)):
                return None
        return obj.sold_count()

    def validate_capacity(self, value):
        if value is not None and value < 0:
            raise serializers.ValidationError("Capacity cannot be negative.")
        return value

    def validate_price(self, value):
        if value < 0:
            raise serializers.ValidationError("Price cannot be negative.")
        return value


class EventCoHostSerializer(serializers.ModelSerializer):
    """Serializer for co-host information"""
    email = serializers.EmailField(source='user.email', read_only=True)
    name = serializers.CharField(source='user.get_full_name', read_only=True)
    
    class Meta:
        model = EventCoHost
        fields = ['id', 'email', 'name', 'added_at']
        read_only_fields = ['id', 'added_at']


class EventSerializer(serializers.ModelSerializer):
    owner_email = serializers.EmailField(source='owner.email', read_only=True)
    owner_handle = serializers.SerializerMethodField()
    owner_events_count = serializers.SerializerMethodField()
    cohosts = EventCoHostSerializer(many=True, read_only=True)

    # Role information for the current user
    role = serializers.SerializerMethodField()

    # Category display name
    category_display = serializers.CharField(source='get_category_display', read_only=True)

    # Event image URL
    event_image_url = serializers.SerializerMethodField()

    # Ticket tiers (read-only here; managed via the dedicated tiers endpoints)
    tiers = TicketTierSerializer(many=True, read_only=True)

    # Optional fields that may not be sent by the client
    capacity = serializers.IntegerField(required=False, allow_null=True, min_value=1)
    location = serializers.CharField(required=False, allow_blank=True, max_length=255)
    description = serializers.CharField(required=False, allow_blank=True)

    class Meta:
        model = Event
        fields = [
            'id', 'slug', 'name', 'owner', 'owner_email', 'owner_handle', 'owner_events_count',
            'category', 'category_display',
            'day', 'time_from', 'time_to', 'location', 'description',
            'virtual_link', 'ticket_price', 'capacity', 'transferable',
            'show_remaining_count',
            'event_image', 'event_image_url', 'visibility', 'timezone', 'hosted_by',
            'is_active', 'created_at', 'updated_at',
            'cohosts', 'role', 'tiers',
        ]
        read_only_fields = ['id', 'slug', 'owner', 'is_active', 'created_at', 'updated_at']

    def get_owner_handle(self, obj):
        """Public handle for the owner's profile (/u/<handle>), if they have one."""
        if not obj.owner:
            return None
        profile = getattr(obj.owner, 'profile', None)
        return profile.handle if profile else None

    def get_owner_events_count(self, obj):
        """Number of active events this owner has hosted, for the public 'Organised by' card."""
        if not obj.owner:
            return 0
        return Event.objects.filter(owner=obj.owner, is_active=True).count()

    def get_role(self, obj):
        """
        Get user's role for this event
        Safely handles both authenticated and anonymous users
        """
        request = self.context.get('request')
        
        if request is None:
            user = None
        else:
            user = request.user if hasattr(request, 'user') else None
        
        return obj.get_user_role(user)
    
    def get_event_image_url(self, obj):
        """Get full URL for event image"""
        if obj.event_image:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.event_image.url)
        return None
    
    def create(self, validated_data):
        """Set the owner when creating an event"""
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            validated_data['owner'] = request.user
            # Set hosted_by if not provided
            if 'hosted_by' not in validated_data:
                validated_data['hosted_by'] = request.user.get_full_name() or request.user.email
        return super().create(validated_data)


class TicketSerializer(serializers.ModelSerializer):
    event_name = serializers.CharField(source='event.name', read_only=True)
    event_slug = serializers.CharField(source='event.slug', read_only=True)
    event_date = serializers.DateField(source='event.day', read_only=True)
    event_time = serializers.TimeField(source='event.time_from', read_only=True)
    event_location = serializers.CharField(source='event.location', read_only=True)
    event_image_url = serializers.SerializerMethodField()
    transferable = serializers.BooleanField(source='event.transferable', read_only=True)
    form_answers = EventFormAnswerSerializer(many=True, read_only=True)
    tier_name = serializers.CharField(source='tier.name', read_only=True, default=None)
    tier_price = serializers.DecimalField(source='tier.price', max_digits=10, decimal_places=2, read_only=True, default=None)

    class Meta:
        model = Ticket
        fields = [
            'ticket_id', 'event', 'event_name', 'event_slug',
            'event_date', 'event_time', 'event_location', 'event_image_url',
            'tier', 'tier_name', 'tier_price',
            'original_owner_name', 'original_owner_email',
            'current_owner_name', 'current_owner_email',
            'is_transferred', 'payment_status',
            'checked_in', 'checked_in_at', 'qr_token',
            'created_at', 'transferable',
            'form_answers',
        ]
        read_only_fields = [
            'ticket_id', 'is_transferred', 'created_at',
            'checked_in', 'checked_in_at', 'qr_token',
            'event_name', 'event_slug', 'event_date', 'event_time',
            'event_location', 'event_image_url', 'tier_name', 'tier_price',
        ]

    def get_event_image_url(self, obj):
        if obj.event.event_image:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.event.event_image.url)
        return None

class TicketTransferSerializer(serializers.ModelSerializer):
    ticket_details = TicketSerializer(source='ticket', read_only=True)
    transfer_link = serializers.SerializerMethodField()
    
    class Meta:
        model = TicketTransfer
        fields = [
            'id', 'ticket', 'ticket_details',  # Include both ticket and ticket_details
            'from_user_name', 'from_user_email',
            'to_user_name', 'to_user_email',
            'transfer_key', 'is_accepted', 'transfer_link'
        ]
        read_only_fields = ['transfer_key', 'is_accepted', 'ticket']  # Make ticket read-only
        extra_kwargs = {
            'ticket': {'required': False}  # Not required in input
        }

    def get_transfer_link(self, obj):
        request = self.context.get('request')
        if request:
            return request.build_absolute_uri(
                reverse('accept-transfer', kwargs={'transfer_key': str(obj.transfer_key)})
            )
        return None
    
    def create(self, validated_data):
        # Check if ticket is transferable
        ticket = validated_data['ticket']
        if not ticket.event.transferable:
            raise serializers.ValidationError("This ticket is not transferable")
        
        # Create transfer
        transfer = super().create(validated_data)
        
        # Send transfer email
        transfer_link = self.get_transfer_link(transfer)
        send_mail(
            f'Ticket Transfer: {ticket.event.name}',
            f'You have received a ticket transfer. Click here to accept: {transfer_link}',
            settings.DEFAULT_FROM_EMAIL,
            [validated_data['to_user_email']],
            fail_silently=False,
        )
        
        return transfer



class PaymentSerializer(serializers.ModelSerializer):
    """Serializer for Payment model"""
    event = EventSerializer(read_only=True)
    event_slug = serializers.CharField(write_only=True, required=False)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    channel_display = serializers.CharField(source='get_channel_display', read_only=True)
    
    class Meta:
        model = Payment
        fields = [
            'id',
            'event',
            'event_slug',
            'customer_email',
            'customer_name',
            'amount',
            'currency',
            'paystack_reference',
            'paystack_access_code',
            'paystack_authorization_url',
            'status',
            'status_display',
            'channel',
            'channel_display',
            'paid_at',
            'metadata',
            'created_at',
            'updated_at',
        ]
        read_only_fields = [
            'id',
            'paystack_reference',
            'paystack_access_code',
            'paystack_authorization_url',
            'status',
            'channel',
            'paid_at',
            'created_at',
            'updated_at',
        ]




class PaymentInitializeSerializer(serializers.Serializer):
    """Serializer for payment initialization request"""
    event_slug = serializers.CharField(max_length=50)
    customer_email = serializers.EmailField()
    customer_name = serializers.CharField(max_length=255)
    quantity = serializers.IntegerField(min_value=1, default=1)
    tier_id = serializers.IntegerField(required=False, allow_null=True)
    
    def validate_event_slug(self, value):
        """Validate that event exists and is active"""
        try:
            event = Event.objects.get(slug=value, is_active=True)
            return value
        except Event.DoesNotExist:
            raise serializers.ValidationError("Event not found or is not active")


class PaymentVerifySerializer(serializers.Serializer):
    """Serializer for payment verification response"""
    status = serializers.CharField()
    message = serializers.CharField()
    tickets = TicketSerializer(many=True, required=False)
    payment = PaymentSerializer(required=False)