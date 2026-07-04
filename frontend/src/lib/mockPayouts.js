// Placeholder payout request data.
// TODO: replace with real data once the backend Payout Requests API exists
// (see note shared with backend team — GET /api/admin/payouts/, PATCH /api/admin/payouts/:id/).
export const MOCK_PAYOUT_REQUESTS = [
  {
    id: "po_1",
    organizerName: "Samuel Ajayi",
    organizerEmail: "samuelajayi554@gmail.com",
    eventName: "End of the Year Party",
    amount: 185000,
    method: "bank",
    destination: "GTBank •••• 4471",
    status: "pending",
    requestedAt: "2026-07-02T10:15:00Z",
  },
  {
    id: "po_2",
    organizerName: "Byro Africa",
    organizerEmail: "byroafrica@gmail.com",
    eventName: "Tech Expo",
    amount: 42000,
    method: "wallet",
    destination: "0x9a3F...c21B (Polygon)",
    status: "pending",
    requestedAt: "2026-07-03T08:40:00Z",
  },
  {
    id: "po_3",
    organizerName: "Anuoluwapo Ali",
    organizerEmail: "anuoluwapoali25@gmail.com",
    eventName: "Love Room Meeting",
    amount: 12000,
    method: "bank",
    destination: "Kuda Bank •••• 2210",
    status: "processed",
    requestedAt: "2026-06-28T14:05:00Z",
  },
];
