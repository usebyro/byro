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
    MerchViewSet,
    DashboardView,
    DashboardAnalyticsView,
    PayoutRequestView,
    PayoutBalanceView,
    AdminPayoutView,
    AdminEventDetailView,
    AdminEventAttendeesView,
    PaystackBankListView,
    PaystackResolveAccountView,
    AdminAnalyticsSummaryView,
    AdminAnalyticsRevenueTrendView,
    AdminUsersListView,
    AdminUserDetailView,
    AdminEventsOverviewView,
    AdminPaymentsListView,
    AdminPromosListView,
    AdminAuditLogView,
    AdminMeView,
    AdminActivityView,
    AdminTeamView,
    AdminTeamDetailView,
)
from .newsletter_views import NewsletterSubscribeView
from .auth_views import (
    MagicAuthSendView,
    MagicAuthVerifyView,
    MeView,
    OAuthAuthorizeView,
    OAuthCallbackView,
    RefreshView,
)


router = DefaultRouter()

router.register(r'waitlist', WaitListViewSet, basename='waitlist')
router.register(r'events', EventViewSet)
router.register(r'tickets', TicketViewSet)
router.register(r'transfers', TicketTransferViewSet, basename='transfer')
router.register(r'payments', PaystackPaymentViewSet, basename='payment')
router.register(r'profile', ProfileViewSet, basename='profile')
router.register(r'merch', MerchViewSet, basename='merch')


urlpatterns = [
    path('api/', include(router.urls)),

    # Auth — WorkOS. Django drives sign-in because Byro renders its own UI
    # rather than redirecting to AuthKit's hosted page. Every other request
    # authenticates locally via WorkOSAuthentication.
    path('api/auth/magic/send/', MagicAuthSendView.as_view(), name='auth_magic_send'),
    path('api/auth/magic/verify/', MagicAuthVerifyView.as_view(), name='auth_magic_verify'),
    path('api/auth/oauth/authorize/', OAuthAuthorizeView.as_view(), name='auth_oauth_authorize'),
    path('api/auth/oauth/callback/', OAuthCallbackView.as_view(), name='auth_oauth_callback'),
    path('api/auth/refresh/', RefreshView.as_view(), name='auth_refresh'),
    path('api/auth/me/', MeView.as_view(), name='auth_me'),

    # Newsletter (Brevo)
    path('api/newsletter/subscribe/', NewsletterSubscribeView.as_view(), name='newsletter_subscribe'),

    # Dashboard
    path('api/dashboard/', DashboardView.as_view(), name='dashboard'),
    path('api/dashboard/analytics/', DashboardAnalyticsView.as_view(), name='dashboard-analytics'),

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
    path('api/admin/events/<int:pk>/', AdminEventDetailView.as_view(), name='admin-event-detail'),
    path('api/admin/events/<slug:slug>/attendees/', AdminEventAttendeesView.as_view(), name='admin-event-attendees'),

    # Paystack — bank verification
    path('api/paystack/banks/', PaystackBankListView.as_view(), name='paystack-banks'),
    path('api/paystack/resolve-account/', PaystackResolveAccountView.as_view(), name='paystack-resolve-account'),

    # Admin — analytics
    path('api/admin/analytics/summary/', AdminAnalyticsSummaryView.as_view(), name='admin-analytics-summary'),
    path('api/admin/analytics/revenue-trend/', AdminAnalyticsRevenueTrendView.as_view(), name='admin-analytics-revenue-trend'),

    # Admin — users
    path('api/admin/users/', AdminUsersListView.as_view(), name='admin-users-list'),
    path('api/admin/users/<int:pk>/', AdminUserDetailView.as_view(), name='admin-users-detail'),

    # Admin — events overview, payments, promos, audit log
    path('api/admin/events/overview/', AdminEventsOverviewView.as_view(), name='admin-events-overview'),
    path('api/admin/payments/', AdminPaymentsListView.as_view(), name='admin-payments-list'),
    path('api/admin/promos/', AdminPromosListView.as_view(), name='admin-promos-list'),
    path('api/admin/me/', AdminMeView.as_view(), name='admin-me'),
    path('api/admin/team/', AdminTeamView.as_view(), name='admin-team'),
    path('api/admin/team/<int:pk>/', AdminTeamDetailView.as_view(), name='admin-team-detail'),
    path('api/admin/activity/', AdminActivityView.as_view(), name='admin-activity'),
    path('api/admin/audit-log/', AdminAuditLogView.as_view(), name='admin-audit-log'),

    # Public short-URL for events (must be last — catch-all slug)
    path('<slug:slug>/', EventViewSet.as_view({'get': 'retrieve'}), name='event-short-url'),
]