from django.contrib import admin

from .models import (
    AdminAction,
    AdminMember,
    CustomUser,
    Event,
    EventCoHost,
    Follow,
    MerchItem,
    Payment,
    PayoutRequest,
    PromoCode,
    Ticket,
    TicketTier,
    UserProfile,
)


@admin.register(PromoCode)
class PromoCodeAdmin(admin.ModelAdmin):
    list_display = (
        'code', 'event', 'discount_type', 'amount',
        'redeemed_count', 'max_redemptions', 'active', 'expires_at',
    )
    list_filter = ('active', 'discount_type', 'event')
    search_fields = ('code', 'event__name', 'event__slug')
    raw_id_fields = ('event',)
    readonly_fields = ('redeemed_count', 'created_at')


@admin.register(MerchItem)
class MerchItemAdmin(admin.ModelAdmin):
    list_display = ('name', 'owner', 'price', 'stock', 'is_active', 'created_at')
    list_filter = ('is_active',)
    search_fields = ('name', 'owner__email')
    raw_id_fields = ('owner',)
    readonly_fields = ('created_at', 'updated_at')


@admin.register(Event)
class EventAdmin(admin.ModelAdmin):
    list_display = ('name', 'slug', 'owner', 'category', 'day', 'ticket_price', 'is_active', 'is_draft')
    list_filter = ('is_active', 'is_draft', 'category')
    search_fields = ('name', 'slug', 'owner__email')
    raw_id_fields = ('owner',)
    readonly_fields = ('created_at', 'updated_at')


@admin.register(TicketTier)
class TicketTierAdmin(admin.ModelAdmin):
    list_display = ('name', 'event', 'price', 'capacity', 'admits_count', 'order')
    list_filter = ('event',)
    search_fields = ('name', 'event__name', 'event__slug')
    raw_id_fields = ('event',)


@admin.register(Ticket)
class TicketAdmin(admin.ModelAdmin):
    list_display = (
        'ticket_id', 'event', 'tier', 'current_owner_email',
        'payment_status', 'is_transferred', 'checked_in', 'created_at',
    )
    list_filter = ('payment_status', 'checked_in', 'is_transferred', 'event')
    search_fields = ('current_owner_email', 'original_owner_email', 'ticket_id', 'event__slug')
    raw_id_fields = ('event', 'tier', 'payment', 'user')
    readonly_fields = ('ticket_id', 'qr_token', 'created_at', 'transferred_at', 'checked_in_at')


@admin.register(Payment)
class PaymentAdmin(admin.ModelAdmin):
    list_display = (
        'paystack_reference', 'event', 'customer_email', 'amount',
        'status', 'channel', 'paid_at', 'created_at',
    )
    list_filter = ('status', 'channel', 'currency')
    search_fields = ('paystack_reference', 'customer_email', 'customer_name', 'event__slug')
    raw_id_fields = ('event', 'tier', 'promo_code')
    readonly_fields = ('paid_at', 'created_at', 'updated_at')


@admin.register(PayoutRequest)
class PayoutRequestAdmin(admin.ModelAdmin):
    list_display = ('id', 'user', 'event', 'amount', 'method', 'status', 'requested_at')
    list_filter = ('status', 'method')
    search_fields = ('user__email', 'event__name')
    raw_id_fields = ('user', 'event')
    readonly_fields = ('requested_at', 'processed_at')


@admin.register(CustomUser)
class CustomUserAdmin(admin.ModelAdmin):
    list_display = ('email', 'is_active', 'is_staff', 'date_joined')
    list_filter = ('is_active', 'is_staff')
    search_fields = ('email',)


@admin.register(UserProfile)
class UserProfileAdmin(admin.ModelAdmin):
    list_display = ('user', 'display_name', 'handle', 'role')
    list_filter = ('role',)
    search_fields = ('user__email', 'display_name', 'handle')
    raw_id_fields = ('user',)


@admin.register(EventCoHost)
class EventCoHostAdmin(admin.ModelAdmin):
    list_display = ('event', 'user', 'status', 'role')
    list_filter = ('status', 'role')
    search_fields = ('event__slug', 'user__email')
    raw_id_fields = ('event', 'user')


@admin.register(Follow)
class FollowAdmin(admin.ModelAdmin):
    list_display = ('follower', 'following', 'created_at')
    search_fields = ('follower__email', 'following__email')
    raw_id_fields = ('follower', 'following')


@admin.register(AdminAction)
class AdminActionAdmin(admin.ModelAdmin):
    list_display = ('action', 'target_type', 'target_id', 'target_label', 'actor_email', 'created_at')
    list_filter = ('action', 'target_type')
    search_fields = ('target_label', 'target_id', 'detail')
    readonly_fields = ('action', 'target_type', 'target_id', 'target_label', 'detail', 'actor_email', 'created_at')

    def has_add_permission(self, request):
        return False


@admin.register(AdminMember)
class AdminMemberAdmin(admin.ModelAdmin):
    list_display = ('email', 'role', 'added_by_email', 'created_at')
    list_filter = ('role',)
    search_fields = ('email',)
