from django.contrib import admin

from .models import PromoCode, MerchItem


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
