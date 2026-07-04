# Backend requirements — Payouts, Admin Analytics, Media Storage

This note covers what the frontend currently expects from the backend for three areas of recent work: the public profile image bug, the admin dashboard, and payouts (organizer + admin side). Everything below is currently **mocked or missing** on the frontend and needs real backend support.

## 1. Fix broken images (avatars & event images) — highest priority

**Symptom:** Every image on public profile pages (`/u/[username]`) — and eventually across the whole site — fails to load and falls back to a placeholder.

**Root cause (confirmed):** The API correctly returns absolute image URLs (e.g. `https://byro.onrender.com/media/event_images/xyz.jpeg`), but requesting that URL directly returns **404**. This is Render's ephemeral disk: uploaded files in `media/` are wiped on every deploy/restart, so any image uploaded before the last deploy is gone.

**The fix already exists in code** — `Backend/bryo/storage.py` has a `SupabaseMediaStorage` class specifically written to solve this ("persists files in Supabase Storage... fixes the ephemeral-disk problem on Render"). It only activates when `SUPABASE_URL` and `SUPABASE_KEY` env vars are set (see `Backend/api/settings.py` `STORAGES` config). Based on production responses, these env vars are **not currently set** on Render.

**Action needed:**
- Set `SUPABASE_URL` and `SUPABASE_KEY` in the Render production environment so `SupabaseMediaStorage` activates.
- Existing/previously-uploaded images will still 404 (they no longer exist on disk) — organizers will need to re-upload avatar/event images once this is live, or someone needs to migrate any recoverable files into the Supabase bucket.

Frontend has already been updated to gracefully fall back to initials/placeholder instead of a broken-image icon when this happens, but the real fix is backend/infra config.

## 2. Payout Requests — no persistence or admin visibility today

**Current state:** When an organizer submits a payout request (`/dashboard/[slug]/Payout.jsx`), it only sends a transactional email via `/api/send-email`. Nothing is saved to the database. There is no way for admins to see requests, and no way for organizers to see status updates.

**Needed: a `PayoutRequest` model**, roughly:
```
PayoutRequest
- id
- user (FK -> User/organizer)
- event (FK -> Event, nullable — a request can be platform-wide or event-specific)
- amount (decimal)
- currency (default NGN)
- method: "bank" | "wallet"
- bank_name, account_number, account_name (nullable, required if method=bank)
- wallet_address, wallet_type (nullable, required if method=wallet)
- status: "pending" | "processed" | "rejected" (default "pending")
- requested_at (auto now)
- processed_at (nullable)
```

**Needed API endpoints:**
- `POST /api/payouts/` — organizer creates a payout request (auth required)
- `GET /api/payouts/` — organizer's own request history (auth required, filtered to `request.user`)
- `GET /api/admin/payouts/` — list all payout requests, for the admin dashboard (admin auth required)
- `PATCH /api/admin/payouts/:id/` — update status, e.g. `{ "status": "processed" }` (admin auth required)

**Why:** The admin dashboard now has a Payouts page (`frontend/src/app/admin/payouts/page.tsx`) and the organizer dashboard has a Payouts page (`frontend/src/app/dashboard/payouts/page.jsx`) — both are currently built against **mock data** (`frontend/src/lib/mockPayouts.js`) and update local state only. Once these endpoints exist, both pages just need their `useState` mock data swapped for real `fetch`/`axios` calls — no other rework needed.

**Organizer bank details:** The organizer Payouts page also lets a user save/update their bank account details (bank name, account number, account name) and submit a withdrawal amount. Since there's no backend field for this yet, the frontend currently persists bank details in **`localStorage` only** (per-device, not synced, not something to rely on for real payouts) and submits withdrawals the same way as the existing `Payout.jsx` flow — via the `/api/send-email` transactional email, not a real API call. Once `PayoutRequest` exists, the bank fields on that model (`bank_name`, `account_number`, `account_name`) double as the place to store this — ideally on the organizer's profile too (e.g. `UserProfile.bank_name/account_number/account_name`) so it can be pre-filled on future requests instead of re-entered every time.

## 3. Admin analytics — platform-wide aggregates

**Current state:** The admin overview page (`frontend/src/app/admin/page.tsx`) needs platform-wide stats that don't exist yet:
- Total tickets sold (across all events)
- Total revenue (across all events)
- Revenue over time (for a trend chart, ideally with day-level granularity so the frontend can show 7/30/90-day ranges)

Right now `TicketTierSerializer.get_sold()` / `get_remaining()` only expose numbers **per ticket tier**, and only when the organizer has opted in via `event.show_remaining_count=True`. There's no aggregate/admin-only endpoint.

**Needed: one or two admin-only analytics endpoints**, e.g.:
- `GET /api/admin/analytics/summary/` → `{ total_tickets_sold, total_revenue, total_events, active_events }`
- `GET /api/admin/analytics/revenue-trend/?days=30` → `[{ date: "2026-07-01", revenue: 42000 }, ...]`

These should be admin-authenticated only (see note below on admin auth).

## 4. (Worth flagging) Admin route protection

Admin login (`/admin/login`) checks a password against `ADMIN_SECRET` and sets an `admin_token` cookie, but there's currently no server-side check that this cookie is valid on every `/admin/*` page load — only the login form itself enforces the password. This is a frontend/middleware gap, not strictly a backend task, but worth the backend/security team knowing about since the new admin analytics and payout-management endpoints should be properly authenticated regardless of what the frontend does.

---

### Summary of what to prioritize
1. **Set `SUPABASE_URL` / `SUPABASE_KEY` on Render** — fixes broken images site-wide, no code change needed.
2. **`PayoutRequest` model + CRUD endpoints** — unblocks real payout approval flow (organizer request → admin approve → organizer sees status).
3. **Admin analytics endpoints** — unblocks real numbers on the admin dashboard (currently placeholder/mock data, clearly labeled as such in the UI).
