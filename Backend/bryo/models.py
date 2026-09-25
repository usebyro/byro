from decimal import Decimal, ROUND_HALF_UP

from django.db import models, transaction, IntegrityError
from django.contrib.auth.models import AbstractUser, UserManager
from django.db.models.signals import post_save
from django.dispatch import receiver
from django.conf import settings
from django.utils import timezone
from django.utils.crypto import get_random_string
from django.core.validators import MinValueValidator, MaxValueValidator
import uuid


class CustomUserManager(UserManager):
    def create_user(self, email, password=None, **extra_fields):
        if not email:
            raise ValueError('The Email field must be set')
        
        email = self.normalize_email(email)
        extra_fields.setdefault('is_staff', False)
        extra_fields.setdefault('is_superuser', False)
        
        user = self.model(email=email, **extra_fields)
        
        if password:
            user.set_password(password)
        else:
            user.set_unusable_password()
            
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)

        if extra_fields.get('is_staff') is not True:
            raise ValueError('Superuser must have is_staff=True.')
        if extra_fields.get('is_superuser') is not True:
            raise ValueError('Superuser must have is_superuser=True.')

        return self.create_user(email, password, **extra_fields)


class CustomUser(AbstractUser):
    username = models.CharField(max_length=150, unique=False, blank=True, null=True)
    email = models.EmailField(unique=True)

    # Legacy Privy-specific field — kept for existing users.
    # New code should use external_id + auth_provider instead.
    privy_id = models.CharField(max_length=255, unique=True, null=True, blank=True)

    # Provider-agnostic identity fields.
    AUTH_PROVIDER_CHOICES = [
        ("workos", "WorkOS"),
        ("privy", "Privy"),
        ("web3auth", "Web3Auth"),
        ("guest", "Guest (ticket checkout, no login)"),
    ]
    auth_provider = models.CharField(
        max_length=50,
        choices=AUTH_PROVIDER_CHOICES,
        default="workos",
        blank=True,
    )
    external_id = models.CharField(max_length=255, unique=True, null=True, blank=True)

    # WorkOS user id ("user_01H..."). The canonical identity key: every
    # authenticated request resolves to a user through this column, so it is
    # indexed and unique. Null only for legacy rows that have not signed in
    # since the cutover.
    workos_id = models.CharField(
        max_length=255, unique=True, null=True, blank=True, db_index=True
    )

    # True once WorkOS confirms the address. Co-host invites are claimed by
    # email, so an unverified address must never be allowed to claim one.
    email_verified = models.BooleanField(default=False)

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = []

    objects = CustomUserManager()

    def save(self, *args, **kwargs):
        if not self.username:
            self.username = self.email
        super().save(*args, **kwargs)

    def __str__(self):
        return self.email


class UserProfile(models.Model):
    """
    Extended profile for every user. Auto-created via post_save signal.
    Keeps identity (CustomUser) separate from display/social data.
    """
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='profile',
        primary_key=True,
    )
    # Self-reported at onboarding ("Discover and Attend Events" vs "Host
    # Event"). Blank for accounts created before this field existed, or that
    # never finished onboarding — do not assume blank means attendee.
    ROLE_CHOICES = [
        ('attendee', 'Attendee'),
        ('organizer', 'Organizer'),
    ]
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, blank=True, db_index=True)

    # Public identity
    display_name = models.CharField(max_length=100, blank=True)
    # Unique handle used in public URLs: /u/<handle>
    handle = models.SlugField(max_length=50, unique=True, null=True, blank=True)
    bio = models.TextField(max_length=500, blank=True)
    avatar = models.ImageField(upload_to='avatars/', null=True, blank=True)
    cover_image = models.ImageField(upload_to='covers/', null=True, blank=True)
    location = models.CharField(max_length=100, blank=True)
    website = models.URLField(blank=True)

    # Social links (store handles/usernames, not full URLs, for flexibility)
    twitter = models.CharField(max_length=100, blank=True)
    instagram = models.CharField(max_length=100, blank=True)
    linkedin = models.CharField(max_length=100, blank=True)
    telegram = models.CharField(max_length=100, blank=True)

    # Saved bank details for payout pre-fill
    bank_name = models.CharField(max_length=100, blank=True, default="")
    account_number = models.CharField(max_length=20, blank=True, default="")
    account_name = models.CharField(max_length=100, blank=True, default="")

    # Flag used by frontend to redirect new users to profile setup
    is_complete = models.BooleanField(default=False)

    # Whether this organiser's community/profile is publicly listed
    # (shown on /u/<handle> and any public directory). Asked at onboarding.
    is_public = models.BooleanField(default=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Profile({self.user.email})"


class PrivyUser(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,  
        on_delete=models.CASCADE, 
        related_name='privy_profile'
    )
    privy_id = models.CharField(max_length=255, unique=True)
    email = models.EmailField(null=True, blank=True)
    wallet_address = models.CharField(max_length=255, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    last_login = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.email or self.wallet_address or self.privy_id or str(self.user_id)


class Payment(models.Model):
    """Track all payments for event registrations"""
    PAYMENT_STATUS = [
        ('pending', 'Pending'),
        ('successful', 'Successful'),
        ('failed', 'Failed'),
        ('abandoned', 'Abandoned'),
    ]
    
    PAYMENT_CHANNEL = [
        ('card', 'Card'),
        ('bank', 'Bank'),
        ('ussd', 'USSD'),
        ('qr', 'QR'),
        ('mobile_money', 'Mobile Money'),
        ('bank_transfer', 'Bank Transfer'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    event = models.ForeignKey('Event', on_delete=models.CASCADE, related_name='payments')
    tier = models.ForeignKey(
        'TicketTier',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='payments',
    )
    promo_code = models.ForeignKey(
        'PromoCode',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='payments',
    )
    # Customer details
    customer_email = models.EmailField()
    customer_name = models.CharField(max_length=255)
    
    # Payment details
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    currency = models.CharField(max_length=3, default='NGN')
    
    # Paystack fields
    paystack_reference = models.CharField(max_length=255, unique=True)
    paystack_access_code = models.CharField(max_length=255, blank=True, null=True)
    paystack_authorization_url = models.URLField(blank=True, null=True)
    
    # Transaction details
    status = models.CharField(max_length=20, choices=PAYMENT_STATUS, default='pending')
    channel = models.CharField(max_length=20, choices=PAYMENT_CHANNEL, blank=True, null=True)
    paid_at = models.DateTimeField(null=True, blank=True)
    
    # Metadata
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['paystack_reference']),
            models.Index(fields=['status', '-created_at']),
        ]
    
    def __str__(self):
        return f"Payment {self.paystack_reference} - {self.status}"





class WaitList(models.Model):
    email = models.EmailField(unique=True)
    created_at = models.DateTimeField(auto_now_add=True)




class Event(models.Model):
    EVENT_VISIBILITY_CHOICES = [
        ('public', 'Public'),
        ('private', 'Private'),
    ]
    
    # The "Create event" category picker sends one of these values directly
    # (its display labels differ from these — e.g. it shows "Concerts" for
    # `entertainment`, "Sports" for `fitness`, "Nightlife" for `art_culture`,
    # and "Conferences" for `conference`). Keep this list as the single
    # source of truth; a category the picker doesn't (yet) offer a button
    # for can still be set here without introducing a duplicate slug.
    CATEGORY_CHOICES = [
        ('entertainment', 'Entertainment'),
        ('fitness', 'Fitness'),
        ('art_culture', 'Art & Culture'),
        ('nightlife', 'Nightlife'),
        ('conference', 'Conference'),
        ('web3_crypto', 'Web3 & Crypto'),
        ('technology', 'Technology'),
        ('other', 'Other'),
    ]

    name = models.CharField(max_length=100)
    slug = models.SlugField(max_length=50, unique=True, blank=True, null=True)
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL, 
        on_delete=models.CASCADE, 
        related_name='owned_events',
        null=True, blank=True,
        help_text="The user who created and owns this event"
    )
    
    # New: Category field for filtering
    category = models.CharField(
        max_length=20, 
        choices=CATEGORY_CHOICES, 
        default='other',
        db_index=True,  # Add index for faster searches
        help_text="Event category for filtering"
    )
    
    day = models.DateField()
    time_from = models.TimeField()
    time_to = models.TimeField()
    location = models.CharField(max_length=255)
    description = models.TextField()
    virtual_link = models.URLField(blank=True, null=True)
    ticket_price = models.DecimalField(
        max_digits=10, 
        decimal_places=2, 
        default=0.00
    )
    # Overall limit on seats for the event (its venue). Empty means unlimited.
    # Tiers can have their own limits inside this one; a purchase must fit both.
    capacity = models.IntegerField(blank=False, null=True)
    # Most tickets one buyer can get in a single order, for an event with NO tiers.
    # When an event has tiers, each tier sets its own limit (TicketTier.max_tickets_per_person).
    max_tickets_per_person = models.PositiveSmallIntegerField(
        default=5, validators=[MinValueValidator(1), MaxValueValidator(10)]
    )
    transferable = models.BooleanField(default=False)
    show_remaining_count = models.BooleanField(
        default=False,
        help_text="If enabled, expose remaining ticket counts to attendees"
    )
    pass_fee_to_attendee = models.BooleanField(
        default=True,
        help_text="If enabled, Byro's service fee is added to the attendee's ticket price. If disabled, the fee is deducted from the organizer's payout instead."
    )
    event_image = models.ImageField(
        upload_to='event_images/', 
        null=True, 
        blank=True
    )
    visibility = models.CharField(max_length=10, choices=EVENT_VISIBILITY_CHOICES, default='public')
    timezone = models.CharField(
        max_length=50, 
        default='GMT+0:00 Lagos'
    )
    hosted_by = models.CharField(max_length=200, default='Byro africa')
    is_active = models.BooleanField(default=True)
    # A draft is visible only to its host and co-hosts, and cannot sell tickets.
    # Distinct from visibility='private', which is unlisted but still purchasable
    # by anyone holding the link.
    is_draft = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    # Reminder/notification bookkeeping — set by the send_event_reminders
    # management command and the ticket-sales milestone check, so re-runs
    # don't re-send the same email.
    reminder_sent_at = models.DateTimeField(
        null=True, blank=True,
        help_text="When the 24h-before attendee/organizer reminder was sent"
    )
    milestones_notified = models.JSONField(
        default=list, blank=True,
        help_text="Ticket-sold milestone thresholds already emailed to the organizer"
    )

    def save(self, *args, **kwargs):
        if self.slug:
            super().save(*args, **kwargs)
            return

        # Slug is unique at the DB level, so retry on collision instead of
        # relying on a check-then-set exists() call, which races under
        # concurrent creates and can let two events land on the same slug.
        attempts = 10
        for attempt in range(attempts):
            self.slug = get_random_string(6)
            try:
                with transaction.atomic():
                    super().save(*args, **kwargs)
                return
            except IntegrityError:
                if attempt == attempts - 1:
                    raise
    
    def is_cohost(self, user):
        """
        True only for an *accepted* co-host.

        Pending invites carry user=NULL so they could not match a real user
        anyway, but the status filter is stated explicitly here so that a future
        code path which attaches a user without accepting cannot quietly grant
        edit rights. Every co-host access check goes through this method.
        """
        if user is None or not user.is_authenticated:
            return False
        return self.cohosts.filter(
            user=user, status=EventCoHost.STATUS_ACCEPTED
        ).exists()

    def cohost_role(self, user):
        """The accepted co-host's role ('manager' or 'checkin'), else None."""
        if user is None or not user.is_authenticated:
            return None
        grant = self.cohosts.filter(
            user=user, status=EventCoHost.STATUS_ACCEPTED
        ).only('role').first()
        return grant.role if grant else None

    def can_manage(self, user):
        """Owner, or a co-host with the manager role: edit the event, tickets, discounts."""
        if user is None or not user.is_authenticated:
            return False
        return self.owner == user or self.cohost_role(user) == EventCoHost.ROLE_MANAGER

    def can_check_in(self, user):
        """Owner or any accepted co-host: see the guest list and check people in."""
        return self.is_owner_or_cohost(user)

    def sold_seats(self):
        """Seats taken: one ticket row per attendee, paid or free."""
        return self.tickets.filter(payment_status__in=['paid', 'free']).count()

    def effective_capacity(self):
        """
        The number of seats that can be sold, or None when unlimited.
        The event's own limit wins; otherwise, when tiers exist and every one of
        them has a limit, the total of those limits. Any unlimited tier (or no
        limits at all) means unlimited.
        """
        if self.capacity:
            return self.capacity
        caps = list(self.tiers.values_list('capacity', flat=True))
        if caps and all(c is not None for c in caps):
            return sum(caps)
        return None

    def is_sold_out(self):
        """True once no more tickets can be bought: the event is full, or every tier is."""
        cap = self.effective_capacity()
        if cap is not None and self.sold_seats() >= cap:
            return True
        tiers = list(self.tiers.all())
        return bool(tiers) and all(t.capacity is not None and t.remaining() == 0 for t in tiers)

    def is_owner_or_cohost(self, user):
        """Check if user is owner or co-host of this event"""
        if not user.is_authenticated:
            return False
        if self.owner == user:
            return True
        return self.is_cohost(user)
    
    
    def get_user_role(self, user):
        """
        Determine user's role for this event
        Returns dict with role info and permissions
        
        Handles:
        - Anonymous users (None or not authenticated)
        - Event owner
        - Co-hosts
        - Regular authenticated users
        """
        # Handle anonymous/unauthenticated users
        if user is None or not user.is_authenticated:
            return {
                'role': 'guest',
                'is_owner': False,
                'is_cohost': False,
                'can_edit': False,
                'can_delete': False,
                'can_manage_cohosts': False,
                'can_check_in': False,
                'can_register': True,
            }
        
        # Check if user is the owner
        if self.owner == user:
            return {
                'role': 'owner',
                'is_owner': True,
                'is_cohost': False,
                'can_edit': True,
                'can_delete': True,
                'can_manage_cohosts': True,
                'can_check_in': True,
                'can_register': True,
            }
        
        # Check if user is a co-host
        cohost_role = self.cohost_role(user)
        if cohost_role:
            return {
                'role': 'cohost',
                'cohost_role': cohost_role,
                'is_owner': False,
                'is_cohost': True,
                'can_edit': cohost_role == EventCoHost.ROLE_MANAGER,
                'can_delete': False,
                'can_manage_cohosts': False,
                'can_check_in': True,
                'can_register': True,
            }
        
        return {
            'role': 'user',
            'is_owner': False,
            'is_cohost': False,
            'can_edit': False,
            'can_delete': False,
            'can_manage_cohosts': False,
            'can_check_in': False,
            'can_register': True,
        }
    class Meta:
        db_table = 'bryo_event'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['category', '-created_at']),  
            models.Index(fields=['is_active', '-created_at']), 
        ]

    def __str__(self):
        return f"{self.name} - {self.owner.email if self.owner else 'No owner'}"


class EventCoHost(models.Model):
    """
    Event co-host grant.

    A row can exist before its person does: organisers invite by email, and the
    invitee may never have signed in. Those rows are `pending` with a null
    `user`, and are claimed at sign-in once WorkOS has verified the address.

    A pending row grants nothing — every access check filters on
    status=ACCEPTED. See Event.get_user_role and the permission classes.
    """
    STATUS_PENDING = 'pending'
    STATUS_ACCEPTED = 'accepted'
    STATUS_CHOICES = [
        (STATUS_PENDING, 'Pending'),
        (STATUS_ACCEPTED, 'Accepted'),
    ]

    # What an accepted co-host may do. Managers can run the event (edit it,
    # tickets, discounts, guest list, check-in). Check-in staff can only see
    # the guest list and check people in. Only the owner can delete the event,
    # manage co-hosts, or receive revenue.
    ROLE_MANAGER = 'manager'
    ROLE_CHECKIN = 'checkin'
    ROLE_CHOICES = [
        (ROLE_MANAGER, 'Manager'),
        (ROLE_CHECKIN, 'Check-in only'),
    ]

    event = models.ForeignKey(Event, on_delete=models.CASCADE, related_name='cohosts')
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='cohosted_events',
        null=True,
        blank=True,
    )
    # The address the organiser invited. Kept even after the invite is claimed,
    # so the grant remains auditable.
    invited_email = models.EmailField(blank=True, default='', db_index=True)
    status = models.CharField(
        max_length=20, choices=STATUS_CHOICES, default=STATUS_ACCEPTED, db_index=True
    )
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default=ROLE_MANAGER)
    added_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='added_cohosts'
    )
    added_at = models.DateTimeField(auto_now_add=True)
    accepted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-added_at']
        constraints = [
            # One grant per person per event, once they exist.
            models.UniqueConstraint(
                fields=['event', 'user'],
                condition=models.Q(user__isnull=False),
                name='unique_cohost_per_event',
            ),
            # And one outstanding invite per address per event.
            models.UniqueConstraint(
                fields=['event', 'invited_email'],
                condition=models.Q(user__isnull=True),
                name='unique_pending_cohost_invite_per_event',
            ),
        ]

    def __str__(self):
        who = self.user.email if self.user else f"{self.invited_email} (pending)"
        return f"{who} - Co-host of {self.event.name}"



class EventFormQuestion(models.Model):
    """
    Custom registration questions that an organiser adds to their event.
    e.g. "What is your shirt size?", "Which session will you attend?"
    """
    QUESTION_TYPES = [
        ('text', 'Short Text'),
        ('textarea', 'Long Text'),
        ('select', 'Dropdown'),
        ('checkbox', 'Checkbox (multiple)'),
        ('radio', 'Radio (single)'),
    ]

    event = models.ForeignKey(Event, on_delete=models.CASCADE, related_name='form_questions')
    question = models.CharField(max_length=255)
    question_type = models.CharField(max_length=20, choices=QUESTION_TYPES, default='text')
    # For select/checkbox/radio — store list of option strings as JSON
    options = models.JSONField(default=list, blank=True)
    required = models.BooleanField(default=False)
    order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ['order']

    def __str__(self):
        return f"{self.event.name} — {self.question}"


class TicketTier(models.Model):
    """
    A priced/capacity tier for an event (e.g. "General Admission", "VIP").
    Events with no tiers fall back to Event.ticket_price / Event.capacity.
    """
    event = models.ForeignKey(Event, on_delete=models.CASCADE, related_name='tiers')
    name = models.CharField(max_length=100)
    price = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    # Short note from the organiser shown to buyers under the tier name.
    description = models.CharField(max_length=200, blank=True, default='')
    # Total tickets available for this tier. Null = unlimited.
    capacity = models.PositiveIntegerField(null=True, blank=True)
    # People admitted per ticket in this tier (e.g. a "Group of 4" = 4).
    # Each admitted person still becomes a separate Ticket row (own QR).
    admits_count = models.PositiveIntegerField(default=1)
    # Fewest tickets one buyer must take of THIS tier in one order. 2 with a
    # maximum of 2 makes a couples ticket that can only be bought as a pair.
    min_tickets_per_person = models.PositiveSmallIntegerField(
        default=1, validators=[MinValueValidator(1), MaxValueValidator(10)],
    )
    # Most tickets one buyer can get of THIS tier in a single order (1 to 10).
    # Empty means no per-order limit for the tier (its capacity still applies).
    # Defaults to 5 so existing tiers keep the cap the checkout used to enforce.
    max_tickets_per_person = models.PositiveSmallIntegerField(
        null=True, blank=True, default=5,
        validators=[MinValueValidator(1), MaxValueValidator(10)],
    )
    order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['order', 'created_at']

    def sold_count(self):
        return self.tickets.filter(payment_status__in=['paid', 'free']).count()

    def remaining(self):
        if self.capacity is None:
            return None
        return max(self.capacity - self.sold_count(), 0)

    def __str__(self):
        return f"{self.event.name} - {self.name}"


class PromoCode(models.Model):
    """A discount code an organiser can hand out for one event."""

    DISCOUNT_FIXED = 'fixed'
    DISCOUNT_PERCENTAGE = 'percentage'
    DISCOUNT_TYPES = [
        (DISCOUNT_FIXED, 'Fixed amount (NGN)'),
        (DISCOUNT_PERCENTAGE, 'Percentage'),
    ]

    event = models.ForeignKey(Event, on_delete=models.CASCADE, related_name='promo_codes')
    code = models.CharField(max_length=32)
    discount_type = models.CharField(max_length=10, choices=DISCOUNT_TYPES, default=DISCOUNT_FIXED)
    # NGN amount for `fixed`, or 0-100 for `percentage`.
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    max_redemptions = models.PositiveIntegerField(
        null=True, blank=True, help_text="Blank = unlimited"
    )
    redeemed_count = models.PositiveIntegerField(default=0)
    active = models.BooleanField(default=True)
    expires_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('event', 'code')
        ordering = ['-created_at']

    def save(self, *args, **kwargs):
        self.code = self.code.strip().upper()
        super().save(*args, **kwargs)

    def is_valid(self):
        if not self.active:
            return False
        if self.expires_at and timezone.now() > self.expires_at:
            return False
        if self.max_redemptions is not None and self.redeemed_count >= self.max_redemptions:
            return False
        return True

    def compute_discount(self, subtotal):
        """Discount in NGN for a given subtotal, never more than the subtotal itself."""
        subtotal = Decimal(str(subtotal))
        if self.discount_type == self.DISCOUNT_PERCENTAGE:
            discount = subtotal * self.amount / Decimal('100')
        else:
            discount = self.amount
        discount = discount.quantize(Decimal('1'), rounding=ROUND_HALF_UP)
        return min(discount, subtotal)

    def __str__(self):
        return f"{self.code} ({self.event.slug})"


class MerchItem(models.Model):
    """
    A merch item an organiser lists on their public community page
    (/u/<handle>). Byro doesn't take payment for these yet — `purchase_link`
    points buyers to wherever the organiser actually sells it (a form, DM,
    external store, etc).
    """
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='merch_items',
    )
    name = models.CharField(max_length=120)
    description = models.TextField(blank=True)
    price = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    image = models.ImageField(upload_to='merch/', null=True, blank=True)
    purchase_link = models.URLField(blank=True, help_text="Where buyers go to purchase this item")
    stock = models.PositiveIntegerField(null=True, blank=True, help_text="Blank = unlimited")
    is_active = models.BooleanField(default=True, help_text="Shown on the public profile when on")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.name} ({self.owner_id})"


class Ticket(models.Model):
    event = models.ForeignKey(Event, on_delete=models.CASCADE, related_name='tickets')
    ticket_id = models.UUIDField(default=uuid.uuid4, editable=False, unique=True)
    tier = models.ForeignKey(
        TicketTier,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='tickets',
        help_text="Null = event has no tiers (legacy flat pricing)",
    )
    # The payment that produced this ticket. A single payment can cover
    # several tickets (quantity > 1), so this is a plain FK, not 1-to-1.
    payment = models.ForeignKey(
        'Payment',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='tickets_purchased',
    )

    # Link to authenticated user account (null = guest registration)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='tickets',
    )

    original_owner_name = models.CharField(max_length=255)
    original_owner_email = models.EmailField()
    current_owner_name = models.CharField(max_length=255)
    current_owner_email = models.EmailField()
    is_transferred = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    transferred_at = models.DateTimeField(null=True, blank=True)
    payment_status = models.CharField(
        max_length=20,
        choices=[
            ('free', 'Free'),
            ('pending', 'Payment Pending'),
            ('paid', 'Paid'),
            ('failed', 'Payment Failed'),
        ],
        default='free',
    )

    # Check-in
    checked_in = models.BooleanField(default=False)
    checked_in_at = models.DateTimeField(null=True, blank=True)
    # UUID embedded in QR code; scanned at the door to trigger check-in.
    # null=True only exists to satisfy the migration for existing rows;
    # new rows always get a uuid4 via the pre-save signal in apps.py.
    qr_token = models.UUIDField(default=uuid.uuid4, editable=False, unique=True, null=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"Ticket {self.ticket_id} - {self.payment_status}"


class EventFormAnswer(models.Model):
    """Stores an attendee's answer to one EventFormQuestion."""
    ticket = models.ForeignKey(Ticket, on_delete=models.CASCADE, related_name='form_answers')
    question = models.ForeignKey(EventFormQuestion, on_delete=models.CASCADE)
    answer = models.JSONField()  # string for text/textarea, list for checkbox, etc.

    class Meta:
        unique_together = ('ticket', 'question')

    def __str__(self):
        return f"Answer by {self.ticket.current_owner_email} — {self.question.question}"





class TicketTransfer(models.Model):
    ticket = models.ForeignKey(Ticket, on_delete=models.CASCADE, related_name='transfers')
    from_user_name = models.CharField(max_length=255, null=True, blank=True)
    from_user_email = models.EmailField(null=True, blank=True)
    to_user_name = models.CharField(max_length=255)
    to_user_email = models.EmailField()
    transferred_at = models.DateTimeField(auto_now_add=True)
    transfer_key = models.UUIDField(default=uuid.uuid4, editable=False, unique=True)
    is_accepted = models.BooleanField(default=False)
    
    class Meta:
        ordering = ['-transferred_at']

    def __str__(self):
        return f"Transfer {self.transfer_key} - {self.ticket.event.name}"


class PayoutRequest(models.Model):
    METHOD_CHOICES = [('bank', 'Bank Transfer'), ('wallet', 'Crypto Wallet')]
    STATUS_CHOICES = [('pending', 'Pending'), ('processed', 'Processed'), ('rejected', 'Rejected')]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='payout_requests'
    )
    event = models.ForeignKey(
        Event, on_delete=models.SET_NULL, null=True, blank=True, related_name='payout_requests'
    )
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    currency = models.CharField(max_length=3, default='NGN')
    method = models.CharField(max_length=10, choices=METHOD_CHOICES)

    # Bank fields
    bank_name = models.CharField(max_length=100, blank=True)
    account_number = models.CharField(max_length=20, blank=True)
    account_name = models.CharField(max_length=100, blank=True)

    # Wallet fields
    wallet_address = models.CharField(max_length=255, blank=True)
    wallet_type = models.CharField(max_length=50, blank=True)

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    requested_at = models.DateTimeField(auto_now_add=True)
    processed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-requested_at']

    def __str__(self):
        return f"PayoutRequest #{self.pk} — {self.user.email} — {self.status}"


# ---------------------------------------------------------------------------
# Signals
# ---------------------------------------------------------------------------

@receiver(post_save, sender=settings.AUTH_USER_MODEL)
def create_user_profile(sender, instance, created, **kwargs):
    """Auto-create a UserProfile the first time a user record is saved."""
    if created:
        UserProfile.objects.get_or_create(user=instance)
