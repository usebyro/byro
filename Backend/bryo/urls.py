from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views
from .views import (
    WaitListViewSet,
    EventViewSet,
    TicketViewSet,
    TicketTransferViewSet,
    PaystackPaymentViewSet,
    ProfileViewSet,
    DashboardView,
    PayoutRequestView,
    PayoutBalanceView,
    AdminPayoutView,
    PaystackBankListView,
    PaystackResolveAccountView,
    AdminAnalyticsSummaryView,
    AdminAnalyticsRevenueTrendView,
)


router = DefaultRouter()

router.register(r'waitlist', WaitListViewSet, basename='waitlist')
router.register(r'events', EventViewSet)
router.register(r'tickets', TicketViewSet)
router.register(r'transfers', TicketTransferViewSet, basename='transfer')
router.register(r'payments', PaystackPaymentViewSet, basename='payment')
router.register(r'profile', ProfileViewSet, basename='profile')


urlpatterns = [
    path('api/', include(router.urls)),

    # Auth
    path('api/auth/privy/', views.privy_login, name='privy_login'),
    path('api/auth/social/', views.social_login, name='social_login'),

    # Dashboard
    path('api/dashboard/', DashboardView.as_view(), name='dashboard'),

    # Events (explicit routes that need to come before the router catch-all)
    path('api/events/categories/', EventViewSet.as_view({'get': 'categories'}), name='event-categories'),
    path('api/events/locations/', EventViewSet.as_view({'get': 'locations'}), name='event-locations'),
    path('api/events/<slug:slug>/register/',
         EventViewSet.as_view({'post': 'register'}),
         name='event-register'),

    # Tickets
    path('api/tickets/<uuid:ticket_id>/transfer/',
         TicketViewSet.as_view({'post': 'transfer'}),
         name='ticket-transfer'),

    # Transfers
    path('api/transfers/<uuid:transfer_key>/accept/',
         TicketTransferViewSet.as_view({'post': 'accept'}),
         name='accept-transfer'),

    # Payouts (organizer)
    path('api/payouts/', PayoutRequestView.as_view(), name='payout-list-create'),
    path('api/payouts/balance/', PayoutBalanceView.as_view(), name='payout-balance'),

    # Admin — payouts
    path('api/admin/payouts/', AdminPayoutView.as_view(), name='admin-payout-list'),
    path('api/admin/payouts/<int:pk>/', AdminPayoutView.as_view(), name='admin-payout-detail'),

    # Paystack — bank verification
    path('api/paystack/banks/', PaystackBankListView.as_view(), name='paystack-banks'),
    path('api/paystack/resolve-account/', PaystackResolveAccountView.as_view(), name='paystack-resolve-account'),

    # Admin — analytics
    path('api/admin/analytics/summary/', AdminAnalyticsSummaryView.as_view(), name='admin-analytics-summary'),
    path('api/admin/analytics/revenue-trend/', AdminAnalyticsRevenueTrendView.as_view(), name='admin-analytics-revenue-trend'),

    # Public short-URL for events (must be last — catch-all slug)
    path('<slug:slug>/', EventViewSet.as_view({'get': 'retrieve'}), name='event-short-url'),
]