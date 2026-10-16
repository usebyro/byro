from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views
from .views import (
    CommunityDashboardView, MessagesView, MyStampsView, CommunityDirectoryView, UnfollowByTokenView,
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
    AdminRefundsView,
    AdminEventRefundsView,
    AdminEventDetailView,
    AdminEventAttendeesView,
    PaystackBankListView,
    PaystackResolveAccountView,
    AdminAnalyticsSummaryView,
    AdminAnalyticsRevenueTrendView,
    AdminAnalyticsActivityTrendView,
    AdminUsersListView,
    AdminUserDetailView,
    AdminEventsOverviewView,
    AdminPaymentsListView,
    AdminPromosListView, AdminMessagesView, AdminMessageDetailView, AdminMessagingBlockView,
    AdminSupportLookupView, AdminTicketResendView, AdminTicketCheckinView, AdminOrderRefundView,
    AdminPaymentDetailView, AdminPaymentPaystackView, AdminUserDeleteView, AdminPromoDetailView,
    AdminCommunitiesView, AdminCommunityDetailView, AdminMerchView, AdminReportsView, AdminReportDetailView, ReportView,
    AdminEventFeatureView, AdminExportView, FeeInfoView, AdminSettingsView, AdminUserFeeView,
    TawkWebhookView, AdminSupportRequestsView, AdminPushView, AdminSupportRequestDetailView,
    AdminAuditLogView,
    AdminMeView,
    AdminActivityView,
    AdminTeamView,
    AdminTeamDetailView,
)
from .notifications import (
    MyNotificationsView, MyNotificationsReadView, AdminNotificationsView, AdminNotificationsReadView,
)
from .newsletter_views import NewsletterSubscribeView
from .dash_overview import DashboardOverviewView
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
    path('api/dashboard/community/', CommunityDashboardView.as_view(), name='dashboard-community'),
    path('api/dashboard/messages/', MessagesView.as_view(), name='dashboard-messages'),
    path('api/dashboard/messages/<int:pk>/', MessagesView.as_view(), name='dashboard-message'),
    path('api/stamps/', MyStampsView.as_view(), name='my-stamps'),
    path('api/communities/', CommunityDirectoryView.as_view(), name='community-directory'),
    path('api/community/unfollow/', UnfollowByTokenView.as_view(), name='community-unfollow'),
    path('api/dashboard/analytics/', DashboardAnalyticsView.as_view(), name='dashboard-analytics'),
    path('api/dashboard/overview/', DashboardOverviewView.as_view(), name='dashboard-overview'),

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

    # Payouts (organiser)
    path('api/payouts/', PayoutRequestView.as_view(), name='payout-list-create'),
    path('api/payouts/balance/', PayoutBalanceView.as_view(), name='payout-balance'),

    # Admin — payouts
    path('api/admin/payouts/', AdminPayoutView.as_view(), name='admin-payout-list'),
    path('api/admin/refunds/', AdminRefundsView.as_view(), name='admin-refunds'),
    path('api/admin/events/<int:pk>/refunds/', AdminEventRefundsView.as_view(), name='admin-event-refunds'),
    path('api/admin/payouts/<int:pk>/', AdminPayoutView.as_view(), name='admin-payout-detail'),
    path('api/admin/events/<int:pk>/', AdminEventDetailView.as_view(), name='admin-event-detail'),
    path('api/admin/events/<slug:slug>/attendees/', AdminEventAttendeesView.as_view(), name='admin-event-attendees'),

    # Paystack — bank verification
    path('api/paystack/banks/', PaystackBankListView.as_view(), name='paystack-banks'),
    path('api/paystack/resolve-account/', PaystackResolveAccountView.as_view(), name='paystack-resolve-account'),

    # Admin — analytics
    path('api/admin/analytics/summary/', AdminAnalyticsSummaryView.as_view(), name='admin-analytics-summary'),
    path('api/notifications/', MyNotificationsView.as_view(), name='notifications'),
    path('api/notifications/read/', MyNotificationsReadView.as_view(), name='notifications-read'),
    path('api/admin/notifications/', AdminNotificationsView.as_view(), name='admin-notifications'),
    path('api/admin/notifications/read/', AdminNotificationsReadView.as_view(), name='admin-notifications-read'),
    path('api/admin/analytics/activity-trend/', AdminAnalyticsActivityTrendView.as_view(), name='admin-analytics-activity-trend'),
    path('api/admin/analytics/revenue-trend/', AdminAnalyticsRevenueTrendView.as_view(), name='admin-analytics-revenue-trend'),

    # Admin — users
    path('api/admin/users/', AdminUsersListView.as_view(), name='admin-users-list'),
    path('api/admin/users/<int:pk>/', AdminUserDetailView.as_view(), name='admin-users-detail'),

    # Admin — events overview, payments, promos, audit log
    path('api/admin/events/overview/', AdminEventsOverviewView.as_view(), name='admin-events-overview'),
    path('api/admin/payments/', AdminPaymentsListView.as_view(), name='admin-payments-list'),
    path('api/admin/promos/', AdminPromosListView.as_view(), name='admin-promos-list'),
    path('api/admin/promos/<int:pk>/', AdminPromoDetailView.as_view(), name='admin-promo-detail'),
    path('api/admin/communities/', AdminCommunitiesView.as_view(), name='admin-communities'),
    path('api/admin/communities/<int:user_id>/', AdminCommunityDetailView.as_view(), name='admin-community-detail'),
    path('api/admin/merch/<int:pk>/', AdminMerchView.as_view(), name='admin-merch'),
    path('api/admin/reports/', AdminReportsView.as_view(), name='admin-reports'),
    path('api/settings/fees/', FeeInfoView.as_view(), name='fee-info'),
    path('api/admin/settings/', AdminSettingsView.as_view(), name='admin-settings'),
    path('api/admin/users/<int:pk>/fee/', AdminUserFeeView.as_view(), name='admin-user-fee'),
    path('api/admin/export/<str:kind>/', AdminExportView.as_view(), name='admin-export'),
    path('api/admin/events/<int:pk>/feature/', AdminEventFeatureView.as_view(), name='admin-event-feature'),
    path('api/admin/reports/<int:pk>/', AdminReportDetailView.as_view(), name='admin-report-detail'),
    path('api/reports/', ReportView.as_view(), name='reports'),
    path('api/admin/messages/', AdminMessagesView.as_view(), name='admin-messages'),
    path('api/admin/support/', AdminSupportLookupView.as_view(), name='admin-support'),
    path('api/admin/push/', AdminPushView.as_view(), name='admin-push'),
    path('api/admin/support/requests/', AdminSupportRequestsView.as_view(), name='admin-support-requests'),
    path('api/admin/support/requests/<int:pk>/', AdminSupportRequestDetailView.as_view(), name='admin-support-request'),
    path('api/webhooks/tawk/', TawkWebhookView.as_view(), name='tawk-webhook'),
    path('api/admin/users/<int:pk>/delete/', AdminUserDeleteView.as_view(), name='admin-user-delete'),
    path('api/admin/payments/<uuid:payment_id>/', AdminPaymentDetailView.as_view(), name='admin-payment-detail'),
    path('api/admin/payments/<uuid:payment_id>/paystack/', AdminPaymentPaystackView.as_view(), name='admin-payment-paystack'),
    path('api/admin/support/tickets/<uuid:ticket_id>/resend/', AdminTicketResendView.as_view(), name='admin-ticket-resend'),
    path('api/admin/support/tickets/<uuid:ticket_id>/checkin/', AdminTicketCheckinView.as_view(), name='admin-ticket-checkin'),
    path('api/admin/support/orders/<uuid:payment_id>/refund/', AdminOrderRefundView.as_view(), name='admin-order-refund'),
    path('api/admin/messages/<int:pk>/cancel/', AdminMessageDetailView.as_view(), name='admin-message-cancel'),
    path('api/admin/users/<int:pk>/messaging/', AdminMessagingBlockView.as_view(), name='admin-user-messaging'),
    path('api/admin/me/', AdminMeView.as_view(), name='admin-me'),
    path('api/admin/team/', AdminTeamView.as_view(), name='admin-team'),
    path('api/admin/team/<int:pk>/', AdminTeamDetailView.as_view(), name='admin-team-detail'),
    path('api/admin/activity/', AdminActivityView.as_view(), name='admin-activity'),
    path('api/admin/audit-log/', AdminAuditLogView.as_view(), name='admin-audit-log'),

    # Public short-URL for events (must be last — catch-all slug)
    path('<slug:slug>/', EventViewSet.as_view({'get': 'retrieve'}), name='event-short-url'),
]