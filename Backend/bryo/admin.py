from django.contrib import admin

from .models import PromoCode


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
