# Travail — Progress & Handoff

Living context for this project so a new session never misses a beat. Read this
first, then `AGENTS.md`, then the relevant page.

---

## What this is
A private aviation + experiences membership app (Travail × Tropic Air / Field &
Stream). Members browse open flights/excursions, reserve seats (with guests),
get boarding passes, and message Ops; Ops reviews everything from an admin
dashboard. Next.js (App Router, customized — see `AGENTS.md`), Supabase
(Postgres + Auth + RLS + Realtime), deployed on Vercel.

## Workflow
- Dev branch: **`claude/epic-ride-b6b4g`**, merged to **`main`** via PRs.
- **Vercel auto-deploys `main`.** Each change: build → commit → PR → merge.
- Verify with **`npm run build`** (compiles + typechecks + lints). There is **no
  browser/Supabase access from the sandbox** (network egress to `*.supabase.co`
  is blocked — "Host not in allowlist"), so member/admin-gated UI can't be
  self-tested here. Flag anything unverified.
- DB migrations live in `supabase/migrations/` but the **live DB is changed by
  the user running the SQL** in Supabase. Migrations 001–007 have all been run.

---

## ⚠️ Hard-won gotchas (these caused most of the rework)
1. **Live DB ≠ the `001_initial.sql` migration.** Trust `src/lib/supabase/types.ts`
   for columns, but even that disagreed with some **CHECK constraints**. Several
   were widened via migrations (see below).
2. **No PostgREST FK embeds.** `Relationships: []` in types — embeds like
   `flights!inner(...)` or `members!member_id(...)` return nothing/break the
   query. **Always fetch related rows separately and join in JS** (how the member
   pages already work). This silently broke the ops queue + bookings list.
3. **`bookings.id` is TEXT with NO default** — generate it client-side as
   `B-<Date.now().toString(36)>`. (flights `F-…`, excursions `E-…`, round-trip
   return leg `F-…R`.) `notifications.id` and `posts.id` DO have defaults.
4. **`confirm_booking()` RPC expects `uuid`** but ids are text → unusable.
   Confirmations are done **in app code**: seat-availability check, then set
   status `approved` + confirmation code.
5. **Status vocab:** bookings use `pending | approved | declined | cancelled |
   refunded`. posts use `author_kind='system'` and `kind` in
   `text/trip_report/announcement/photo`. Old constraints used legacy values →
   widened in migrations 004 (bookings) and 005 (posts).
6. **Member booking-UPDATE is effectively blocked** by RLS (the policy still
   references the old status vocab, and RLS can't restrict columns). So
   member-initiated actions use **separate tables** they CAN insert into:
   `booking_messages`, `waitlist`, `cancellation_requests`. Ops (admin) does the
   booking mutations.
7. **`interests` may come back as a string, not an array** → guard with
   `Array.isArray(x) ? x.join(', ') : (x ?? '')` before `.join` (crashed/stuck
   the members + membership pages).
8. **Airports:** the real airports (KTPF, KGIF, KMTH…) live in the DB `airports`
   table. The `data.ts` `ORIGINS/DESTINATIONS` lists are aspirational/unused and
   DON'T match — load airports (codes + names) from the DB.
9. **Two messaging "voices":** member surfaces (`/inbox`, `/trip`) post
   `is_ops=false`; the admin inbox posts `is_ops=true` ("Travail Ops"). Chat
   bubbles are colored by `is_ops` (Ops = teal, member = neutral).
10. **RLS shows members only their own bookings**; admins see all
    (`public.is_admin()`). So anything needing "all bookings on a trip" (anchor
    rule, seat counts, waitlist promotion) must run **on the ops side**.

---

## Data model (live tables)
- **members** — `id` (text, e.g. `M-001`), `user_id` (auth link), name, initials,
  tier, home_base_code, is_admin, kyc_verified, card_last4, joined_at, bio,
  interests (text[]), avatar_url, created_at.
- **member_sensitive** — date_of_birth (per member).
- **airports** — `code` PK, name, sub, role (`origin|destination|both`).
- **aircraft** — id, name, capacity (c206=4, caravan=8).
- **excursion_templates** — id, dest_code, name, operator, capacity,
  price_per_pax, icon. (Admin-managed catalog.)
- **flights** — id (`F-…`), origin_code, dest_code, date, depart_time,
  duration_mins, aircraft_id, name, pitch, visibility, seats_total, seats_anchor,
  price_per_seat, status, anchor_member_id.
- **excursions** — id (`E-…`), template_id, origin_code, date, times, stay_type,
  name, pitch, spots_total, spots_anchor, price_per_pax, status, anchor_member_id.
- **bookings** — id (`B-…`, no default!), member_id, item_kind, item_id, seats,
  price_per_seat, fees, total, payment_method, status, confirmation_code,
  decline_reason, submitted_at, decided_at.
- **anchor_submissions** — member-proposed trips (payload jsonb) Ops publishes.
- **notifications** — member-scoped inbox items (kind, title, body, ref, read).
- **posts** — feed posts (author_kind, kind, body, quote, likes).
- **guests** (migration 002) — a member's reusable roster (host_member_id,
  first/last/email/phone, member_id link, notes).
- **booking_passengers** (002) — manifest per booking (is_host, name, contact).
- **booking_messages** (003) — per-booking thread (sender_member_id, is_ops, body).
- **waitlist** (006) — member_id, item_kind, item_id, unique per member+item.
- **cancellation_requests** (007) — booking_id, member_id, status (open|resolved).

## Migrations (all run on live DB)
- 001 initial (pre-existing). 002 guests + booking_passengers. 003 booking_messages.
- 004 widen `bookings_status_check` + default `pending`.
- 005 widen `posts` author_kind/kind checks.
- 006 waitlist. 007 cancellation_requests.

---

## Features built
### Member
- **`/` dashboard** — greeting, My trips (scrollable, status-accent cards),
  Open seats panel (all open upcoming w/ availability), **+ Flight / + Exc.**
  CTAs (teal/gold), feed.
- **`/seats`** — open board; round-trips collapse to one card; seat meter
  (filled circle = taken); **full trips show "Join waitlist"**.
- **`/reserve/[id]`** — reserve flow; round trip shows **both legs in full** with
  "Airport Name (CODE)"; **guest registration** (member is always seat 1; guests
  need name + 10-digit phone, "Save guest" persists to roster); **3% service
  fee**; books both legs for round trips; generates booking id.
- **`/boarding-pass/[id]`** — ticket w/ confirmation code + barcode + manifest;
  **Request cancellation**; anchor heads-up; trip-thread link.
- **`/trip/[id]`** — member trip thread.
- **`/inbox`** — member's trip threads (real status, author-colored bubbles).
- **`/bookings`** — bookings + anchors; cards open the boarding pass.
- **`/membership`** — account hub: profile edit, details (card last4 / "None on
  file", KYC, joined, DOB), **Trips taken vs pending by trip date**, anchors.
- `/anchor-flight`, `/anchor-excursion`, `/calendar`, `/network` (pre-existing).
- Sidebar shows an **Admin Dashboard** link only when `is_admin`.

### Admin (`/admin`, gated on is_admin)
- Nav: Dashboard · **Action Queue** · **Inbox** · Members · **Guests** ·
  Trips & Excursions · Bookings · Feed Posts · Anchor Archive.
- **Queue** — pending Booking Requests (expand → manifest), **Cancellation
  Requests** (Cancel/Dismiss), **Waitlist** (visibility), Anchor Submissions.
  Confirm = app-side seat check → approved; cancel auto-promotes waitlist to a
  **pending** booking (Ops still confirms + charges).
- **Inbox** — shared **Travail Ops** inbox over all booking threads; deep-link
  `?b=<bookingId>` from queue/bookings.
- **Members** — CRUD incl. card last4, editable joined date, convert-from-guest
  prefill (`?addGuest=&name=`).
- **Guests** — roster across members; **Convert to member**.
- **Trips & Excursions** — Add Flight (airport dropdowns + custom upsert,
  auto-name, one-way/round-trip → two linked records, cost → per-seat), Add
  Excursion (template-driven, cost → per-pax), **Excursion Templates** CRUD.
- **Bookings** — all bookings; approve/decline/**cancel** (anchor rule + promote);
  thread link.

### Cross-cutting
- **Mobile-first:** viewport meta, bottom tab nav (Feed/Seats/Trips/Inbox/
  Account), responsive shells, 16px inputs (no iOS zoom).
- **Design:** soft shadows/depth, status pills with inset rings, status-accent
  trip cards, scrollable panels, teal/gold flight/excursion coding.

---

## Open follow-ups / known gaps
- **Boarding pass** and **/seats cards** still show bare airport codes (only the
  reserve itinerary shows "Name (CODE)").
- A member's reply doesn't notify Ops (Ops checks the inbox); no unread badges.
- Anchor cancel rule is enforced **ops-side only** (RLS hides others' bookings
  from members).
- App-side seat-confirm isn't transactionally atomic (fine for a small ops team).
- Waitlist auto-promotes one seat per cancel; no per-trip waitlist count on
  Admin → Trips yet.

## Testing
- `scripts/smoke.mjs` signs in as a test account and exercises real flows under
  RLS (see `TESTING.md`). **Blocked until the environment's network policy allows
  `*.supabase.co`.** A dedicated test account exists (`test@travail.test`, admin).
- Until then, verification is build/typecheck only — always tell the user what
  couldn't be browser-verified.
