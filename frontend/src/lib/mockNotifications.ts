// Placeholder admin notification feed.
// TODO: replace with a real notifications API once the backend exists
// (suggested: GET /api/admin/notifications/, PATCH /api/admin/notifications/:id/read/).
// Feeds the admin notification bell — currently ticket purchases and payout events.

export type AdminNotificationType =
  | "ticket_purchase"
  | "payout_request"
  | "payout_processed";

export interface AdminNotification {
  id: string;
  type: AdminNotificationType;
  title: string;
  message: string;
  amount?: number;
  createdAt: string; // ISO 8601
  read: boolean;
}

export const MOCK_ADMIN_NOTIFICATIONS: AdminNotification[] = [
  {
    id: "ntf_1",
    type: "ticket_purchase",
    title: "New ticket purchase",
    message: "Chidi Okeke bought 2 tickets for “End of the Year Party”.",
    amount: 30000,
    createdAt: "2026-07-11T09:42:00Z",
    read: false,
  },
  {
    id: "ntf_2",
    type: "payout_request",
    title: "Payout requested",
    message: "Samuel Ajayi requested a payout for “End of the Year Party”.",
    amount: 185000,
    createdAt: "2026-07-11T08:15:00Z",
    read: false,
  },
  {
    id: "ntf_3",
    type: "ticket_purchase",
    title: "New ticket purchase",
    message: "Amara Nwosu bought 1 ticket for “Tech Expo”.",
    amount: 7000,
    createdAt: "2026-07-11T07:03:00Z",
    read: false,
  },
  {
    id: "ntf_4",
    type: "payout_processed",
    title: "Payout processed",
    message: "Payout to Anuoluwapo Ali for “Love Room Meeting” was processed.",
    amount: 12000,
    createdAt: "2026-07-10T16:20:00Z",
    read: true,
  },
  {
    id: "ntf_5",
    type: "payout_request",
    title: "Payout requested",
    message: "Byro Africa requested a payout for “Tech Expo”.",
    amount: 42000,
    createdAt: "2026-07-10T11:48:00Z",
    read: true,
  },
];
