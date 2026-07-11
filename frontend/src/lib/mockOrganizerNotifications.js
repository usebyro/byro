// Placeholder organizer notification feed for the dashboard bell.
// TODO: replace with a real notifications API once the backend exists
// (suggested: GET /api/notifications/, PATCH /api/notifications/:id/read/).
// Organizer-facing events: ticket purchases on their events and payout updates.

export const MOCK_ORGANIZER_NOTIFICATIONS = [
  {
    id: "ntf_1",
    type: "ticket_purchase",
    title: "New ticket sold",
    message: "Chidi Okeke bought 2 tickets for “End of the Year Party”.",
    amount: 30000,
    createdAt: "2026-07-11T09:42:00Z",
    read: false,
  },
  {
    id: "ntf_2",
    type: "ticket_purchase",
    title: "New ticket sold",
    message: "Amara Nwosu bought 1 ticket for “End of the Year Party”.",
    amount: 15000,
    createdAt: "2026-07-11T07:03:00Z",
    read: false,
  },
  {
    id: "ntf_3",
    type: "payout_processed",
    title: "Payout completed",
    message: "Your payout of ₦185,000 for “End of the Year Party” was sent to GTBank •••• 4471.",
    amount: 185000,
    createdAt: "2026-07-10T16:20:00Z",
    read: false,
  },
  {
    id: "ntf_4",
    type: "payout_request",
    title: "Payout requested",
    message: "Your withdrawal request for “Tech Expo” is pending review.",
    amount: 42000,
    createdAt: "2026-07-10T11:48:00Z",
    read: true,
  },
  {
    id: "ntf_5",
    type: "ticket_purchase",
    title: "New ticket sold",
    message: "Tunde Bello bought 4 tickets for “Tech Expo”.",
    amount: 28000,
    createdAt: "2026-07-09T18:12:00Z",
    read: true,
  },
];
