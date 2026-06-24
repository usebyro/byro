# API Integration Notes

## Overview
Wired up all backend endpoints to the frontend. No backend code was modified.

---

## Changes Made

### `frontend/src/services/api.js`

| Method | Change |
|--------|--------|
| `getEvents(params)` | Now accepts a `params` object and forwards it as query params to `GET /api/events/` |
| `getEventTiers(slug)` | **New** — fetches `GET /api/events/{slug}/tiers/` |
| `getCategories()` | **New** — fetches `GET /api/events/categories/` |
| `getMyTickets()` | **New** — fetches `GET /api/tickets/` |
| `initializePayment(...)` | Now accepts optional `tier_id`; only included in body when present and is a number |

---

### `frontend/src/app/discover/page.tsx`

- Replaced `axiosInstance` direct call with `API.getEvents(params)`
- Filters (category, when, area, max\_price, sort) now sent as server-side query params
- `useEffect` re-runs whenever filter state changes (refetches from server)
- Categories sidebar now fetched from `API.getCategories()` — real counts, real labels
- Client-side filter retained only for multi-category edge case (server handles single-value)

---

### `frontend/src/app/[slug]/ViewEventClient.jsx`

- Added `realTiers` state
- Added `useEffect` that calls `API.getEventTiers(slug)` after event loads (skipped for free events)
- Replaced hardcoded 3-tier mock with dynamic tiers from API
- Falls back to a single "General Admission" row if tiers haven't loaded yet
- `selectedTier` is set to the first real tier's ID once fetched
- Passes `realTiers` to `<CheckoutModal tiers={realTiers} />`

---

### `frontend/src/components/checkout/CheckoutModal.tsx`

- `Props` now includes optional `tiers?: TicketTier[]`
- `TicketTier.id` type changed to `string | number`
- Tiers rendered from prop; falls back to single GA tier if prop is empty
- `quantities` state keyed by `String(tier.id)` for consistency
- `handlePayment` finds the first tier with quantity > 0 and passes its numeric `id` as `tier_id` to `initializePayment`

---

### `frontend/src/app/payment/callback/page.jsx`

Already correctly wired — reads `reference` from Paystack's redirect URL query params and calls `API.verifyPayment(reference)`. No changes needed.

---

## Endpoints Consumed

| Endpoint | Used In |
|----------|---------|
| `GET /api/events/` | `discover/page.tsx` — with category, when, area, max_price, sort params |
| `GET /api/events/categories/` | `discover/page.tsx` — sidebar category filter |
| `GET /api/events/{slug}/tiers/` | `ViewEventClient.jsx` — ticket tier panel |
| `POST /api/payments/initialize/` | `CheckoutModal.tsx` — now includes `tier_id` |
| `GET /api/payments/verify/{reference}/` | `payment/callback/page.jsx` — already wired |
| `GET /api/tickets/` | `api.js` `getMyTickets()` — available for tickets page |
| `GET /api/tickets/{ticket_id}/` | `api.js` `getTicket()` — already existed |
| `POST /api/tickets/{ticket_id}/transfer/` | `api.js` `transferTicket()` — already existed |
