# The Travail Handbook

> A living reference for how the company operates: what we store, how we protect it, how members and investors should think about us, and the protocols we follow when things happen.
>
> **Always treat this file as the single source of truth.** If a process changes, update this file in the same commit as the code change. If you're answering a question from a member, investor, or partner, the answer should live somewhere in this document — and if it doesn't, add it.

**Last reviewed:** May 27, 2026
**Maintained by:** goudreaux

---

## How to use this handbook

- **As a member or partner**: search the table of contents for the topic. Plain-English answers live in §11 (Member FAQ) and §12 (Investor talking points).
- **As an operator**: §6 (Privacy flows) and §10 (Runbooks) are the day-to-day playbook.
- **As a future Claude session**: this file should let you answer ~90% of questions about Travail without needing to grep the codebase. When you do grep, prefer pointing to the code paths cited inline (e.g. `src/lib/pii-scrub.ts`).

---

## Table of Contents

1. [The Business in One Paragraph](#1-the-business-in-one-paragraph)
2. [Data We Store (and don't)](#2-data-we-store-and-dont)
3. [The Stack](#3-the-stack)
4. [Authentication & Identity](#4-authentication--identity)
5. [Database Security Model](#5-database-security-model)
6. [Member Privacy & Consent Flows](#6-member-privacy--consent-flows)
7. [Application Security (HTTP, CSP, headers)](#7-application-security)
8. [Logging, Monitoring & Audit Trail](#8-logging-monitoring--audit-trail)
9. [Payment Handling](#9-payment-handling)
10. [Backups & Recovery](#10-backups--recovery)
11. [Operational Runbooks](#11-operational-runbooks)
12. [Member-Facing FAQ](#12-member-facing-faq)
13. [Investor Talking Points](#13-investor-talking-points)
14. [Compliance Posture](#14-compliance-posture)
15. [Known Gaps & Roadmap](#15-known-gaps--roadmap)
16. [Glossary](#16-glossary)
17. [Changelog](#17-changelog)

---

## 1. The Business in One Paragraph

Travail is a private aviation + experiences membership club. Members fly on small charter aircraft (Tropic Ocean Air is our anchor operator), book "anchor" trips that other members can join seat-by-seat, and discover excursions and other members through a private network. Revenue comes from membership dues + per-seat trip fees + a take rate on excursions. The product is a web app (PWA-installable on iOS), built with Next.js 16 + Supabase + Stripe.

---

## 2. Data We Store (and don't)

### What we store

| Category | Where | Sensitivity |
|---|---|---|
| **Member profile**: name, initials, tier, home base, bio, interests, avatar URL | `members` table | Low |
| **Member contact**: email, phone, date of birth | `member_sensitive` table (separate, locked down — see §5) | **High** |
| **Booking history**: trips taken, seats, totals, status | `bookings` table | Medium |
| **Trip + excursion catalog**: flights, excursions, capacity, pricing | `flights`, `excursions`, `excursion_templates` | Low (operational) |
| **Guest manifests**: passengers each member brings (name + DOB) | `guests`, `passenger_manifests` | **High** |
| **Activity log**: every meaningful action (bookings, approvals, PII access) | `activity_log` table — append-only | Medium |
| **Notifications**: in-app message threads | `notifications` table | Low |
| **Social graph**: friendships, contact share requests | `friendships`, `contact_requests` | Medium |
| **Stripe pointers**: customer ID, subscription ID, last 4 digits | `members` table | Low (no card data) |

### What we deliberately do NOT store

| Category | Why we don't | Where it lives instead |
|---|---|---|
| **Credit card numbers** | Stripe handles all card flow via Stripe Elements; cards never touch our servers | Stripe |
| **CVV / card security codes** | Same — Stripe's domain | Stripe |
| **Bank account / routing numbers** | We don't accept wire transfers in the app | (not handled) |
| **Passport scans / ID images** | When we add international KYC, this goes through Stripe Identity | Stripe Identity (not yet wired) |
| **Plaintext passwords** | Supabase Auth handles hashing + storage | Supabase Auth |
| **Session cookies in our DB** | Supabase Auth manages session storage | Supabase Auth |

**Principle**: every category of data we don't store is one category that can't leak from us. We outsource sensitive data to providers whose entire business model is protecting it (Stripe, Supabase Auth).

---

## 3. The Stack

| Layer | Tool | Notes |
|---|---|---|
| Frontend framework | Next.js 16.2.6 (App Router, Turbopack) | This is post-pages-router, not the Next.js you'll find in training data — see `AGENTS.md` |
| UI library | React 19 | |
| Auth | Supabase Auth | Email + password today; MFA + magic links planned |
| Database | Supabase Postgres | Row-Level Security (RLS) enforced on every table |
| Payments | Stripe (SDK v22) | Subscriptions for membership + payment intents for trips |
| Transactional email | Resend (SDK v6) | All system emails come from `@travailclub.com` |
| Error monitoring | Sentry (`@sentry/nextjs` v10) | PII-scrubbed via `lib/pii-scrub.ts` |
| Hosting | Vercel | Edge + Node runtimes |

### Environment variables

| Variable | Where set | Sensitivity |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Vercel + `.env.local` | Public-safe |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Vercel + `.env.local` | Public-safe (RLS gates everything) |
| `SUPABASE_SERVICE_ROLE_KEY` | Vercel only — server-side API routes | **CRITICAL — bypasses RLS** |
| `STRIPE_SECRET_KEY` | Vercel | **CRITICAL** |
| `STRIPE_WEBHOOK_SECRET` | Vercel | **CRITICAL — verifies webhook authenticity** |
| `RESEND_API_KEY` | Vercel | High |
| `RESEND_FROM` | Vercel | Low |
| `OPS_INBOX_EMAIL` | Vercel | Low |
| `NEXT_PUBLIC_SENTRY_DSN` | Vercel + `.env.local` | Public-safe |
| `SENTRY_AUTH_TOKEN` | Vercel only (build time) | High |
| `SENTRY_ORG` / `SENTRY_PROJECT` | Vercel | Low |

**Key rotation policy**: every key rotates on a 90-day cadence and immediately if a contractor leaves the project. Service role + Stripe secret + webhook secret are the three that, if leaked, require an immediate full incident response.

---

## 4. Authentication & Identity

### Member sign-in

Email + password via Supabase Auth. Sessions are HTTP-only cookies managed by Supabase — we never touch the session token in app code.

### Admin elevation

A member is an admin if `members.is_admin = true`. The flag is **immutable from the client side**: a Postgres trigger (`members_block_privilege_escalation`, migration 029) reverts any attempt by an ordinary member to flip their own `is_admin`, `tier`, `kyc_verified`, `member_no`, or `user_id`. Only the service role (server) or another admin can change these fields.

### Helper functions in the database

- `public.current_member_id()` — returns the member ID of the currently signed-in user (or NULL).
- `public.is_admin()` — returns whether the current user is an admin.

Every RLS policy uses one or both of these to decide access.

---

## 5. Database Security Model

### The principle

Every table has Row-Level Security enabled. The default for new tables is "deny everything, then add explicit allow policies." There is no `to anon` access on app data — only authenticated users (and the service role on the server) reach the DB.

### `member_sensitive` — the PII vault

The only place we store email, phone, and DOB. It lives in `public` for now (production-grade separation into a `private` schema is on the roadmap), but has the strictest RLS in the codebase:

- Members can read + upsert **their own row** (matched by `member_id = current_member_id()`).
- Admins can read + write any row.
- Nobody else gets any access.

**Two layered protections sit in front of it:**

1. **`members_has_contact` view** (migration 035) — exposes only boolean flags (`has_email`, `has_phone`, `has_dob`). The admin members list page reads through this view, so opening the page never pulls any actual email or phone over the network.

2. **`admin_get_member_sensitive(target_id)` function** — when an admin opens an individual member's editor or sends an invite, this `SECURITY DEFINER` function returns the row. **Every non-self admin read writes an entry to `activity_log` tagged `action = 'pii_read'`**. We have a permanent, queryable trail of who looked at whose contact info.

### Permission escalation guards

The `members_block_privilege_escalation` trigger (migration 029) makes the following columns un-mutable by ordinary members:
- `is_admin`
- `tier`
- `kyc_verified`
- `member_no`
- `user_id`

This is enforced server-side regardless of what RLS policy a future migration adds. If a member tries to grant themselves admin via the browser, Postgres silently reverts the change.

### Capacity enforcement

The `enforce_trip_capacity` trigger (migration 029) atomically locks the trip row on every booking insert/update and rejects any booking that would exceed available seats. Two members racing for the last seat: one succeeds, one gets a clean error.

---

## 6. Member Privacy & Consent Flows

The social layer is **opt-in at every step**. A member can be visible in the network without anyone being able to reach them outside the app.

### Friendships (migration 032)

`friendships` table; one row per unordered pair (canonical index on `least()` + `greatest()` of the two member IDs).

| State | Who can transition |
|---|---|
| **Request created** (`status='pending'`) | The requester only |
| **Accepted** | The addressee only |
| **Declined** | The addressee only |
| **Deleted (unfriend / withdraw)** | Either side |

Notifications fire automatically:
- Inbound friend request → notification to the addressee
- Acceptance → notification to the requester

### Contact info requests (migration 033)

`contact_requests` table; **directed** (A→B is a separate row from B→A). Status can be `pending`, `granted`, `declined`, or `revoked`.

Granting is the only way an email + phone become visible. The visibility is implemented via a `SECURITY DEFINER` function (`get_member_contact`) that returns the data only if a granted request exists from the caller to the target.

| Action | Effect |
|---|---|
| Member asks for contact info | Inserts pending row; notification to addressee |
| Addressee grants | Caller's profile now renders email + phone (tappable mailto / tel); notification to requester |
| Addressee declines | Row updated; 30-day cooldown begins (see below) |
| Addressee revokes after granting | Caller's reveal access immediately ends |
| Requester withdraws | Row deleted |

### Anti-pestering protections (migration 034)

Two protections sit on top of `contact_requests`:

1. **Quiet mode** — `members.accepts_contact_requests` boolean (default `true`). When `false`:
   - The "Request contact info" button is hidden on that member's profile.
   - The DB trigger `contact_request_guard` rejects any insert targeting that member with a friendly error.
   - The co-passenger list on a boarding pass shows a padlock chip instead of the request affordance.
   - The profile renders a "coordinate through Ops" callout linking to `/contact`.

2. **Decline cooldown** — if a requester has been declined by the same addressee, they cannot ask again for **30 days**. Enforced at the DB level by `contact_request_guard`.

### Co-passenger surface (boarding pass)

The boarding-pass page renders a `CoPassengerList` component beside each fellow traveler with two quick chips: friend status (+ / pending / ✓) and contact status (request / pending / shared envelope / padlock). Members can connect with people they actually flew with in one tap; cold asks remain possible but unnecessary.

---

## 7. Application Security

### HTTP response headers (`next.config.ts`)

Every response from the app carries:

| Header | Value | What it does |
|---|---|---|
| `Strict-Transport-Security` (prod only) | `max-age=63072000; includeSubDomains; preload` | Forces HTTPS for 2 years; eligible for browser preload list |
| `Content-Security-Policy` | strict allowlist (Supabase, Stripe, Google Fonts) | Blocks injected scripts and third-party iframes |
| `X-Frame-Options` | `DENY` | Prevents clickjacking via embedded `<iframe>` |
| `X-Content-Type-Options` | `nosniff` | Browsers honor the MIME type we declare |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Sends minimal referrer info to third parties |
| `Permissions-Policy` | camera, mic, geolocation off; payment scoped to Stripe | Disables powerful APIs we don't use |

The CSP specifically allows:
- Scripts from `'self'` + `https://js.stripe.com`
- Connections to `*.supabase.co` (REST + realtime WS) + `https://api.stripe.com`
- Frames only from Stripe (Elements + 3D Secure challenge)
- Fonts from Google Fonts
- Images from self, data:, blob:, and `*.supabase.co`

Sentry events route through `/monitoring` (same-origin) so we don't need to allowlist `sentry.io` in the CSP.

### Known CSP caveat

`script-src` currently includes `'unsafe-inline'` because Next.js's hydration bootstrap is inlined. This is a known weakness; the long-term fix is per-request nonces via middleware. **Tracked in §15.**

### Server-side input validation

Every API route validates auth + payload before any DB write:
- `/api/contact/send` — auth check, message ≤ 6000 chars, HTML-escapes member input before embedding in email template
- `/api/admin/invite-member` — admin-only, validates member ID + email format
- `/api/stripe/webhook` — verifies Stripe signature on every event before any DB write

---

## 8. Logging, Monitoring & Audit Trail

### Two distinct logging surfaces

1. **`activity_log` table** (migration 014) — the permanent business-event log. Append-only (no UPDATE or DELETE policy on the table). Captures every meaningful action: bookings submitted/confirmed/declined/cancelled, anchor submissions, member edits, **and admin PII reads** (migration 035). Members can see actions concerning them; admins can see all.

2. **Sentry** — operational error monitoring. Receives JavaScript exceptions, unhandled promise rejections, server-side errors, and slow requests. Self-hosted on sentry.io under the `travail-3g` org.

### PII scrubbing before logs leave the device

`src/lib/pii-scrub.ts` walks every value before it gets logged anywhere. It redacts:

- **Known keys** by name (case-insensitive): `email`, `phone`, `dob`, `passport`, `ssn`, `card_last4`, `address`, `password`, `token`, `cookie`, `stripe_*_id`, etc.
- **Patterns inside free-form strings**: email regex, phone-digit runs, 13–19 digit card-number sequences, JWT-like / Bearer tokens.

Two front doors:
- `safeError(label, err)` — drop-in replacement for `console.error`. Already wired into every existing `console.error` site that passes an error object.
- `sentryBeforeSend(event)` — runs on every Sentry event before transport, in all three Sentry runtimes (client, server, edge).

**Result**: even if our code accidentally logs a Supabase error that contains `(email)=(drew@example.com)`, only `[redacted]` reaches the log or Sentry.

### What admins can investigate

If a member asks "did anyone look at my contact info?":

```sql
select created_at, actor_member_id, action, summary
from public.activity_log
where subject_member_id = 'M-014'      -- the member in question
  and action = 'pii_read'
order by created_at desc;
```

---

## 9. Payment Handling

### How card data flows

1. Member enters card data into a **Stripe Elements** form on the reserve / membership pages.
2. Stripe Elements tokenizes the card in the browser → returns a payment-method ID.
3. We POST the payment-method ID + booking details to our backend.
4. Our backend calls Stripe to create a payment intent or subscription.
5. Stripe processes the card and returns success/failure.
6. Stripe's webhook (`/api/stripe/webhook`) tells us the final state, and we update the booking.

**At no point does a card number or CVV touch our servers.** We store only the payment intent ID + last 4 digits.

### Webhook authenticity

`stripe.webhooks.constructEvent(rawBody, signature, STRIPE_WEBHOOK_SECRET)` validates every incoming webhook. Anything without a valid signature is rejected with 400. This means a malicious actor can't forge a `payment_intent.succeeded` event to mark an unpaid booking as paid.

### PCI scope

We're at **SAQ-A**, the lowest PCI compliance tier, because we never receive card data — only redirect/tokenize via Stripe. This is the same posture as a typical Shopify merchant.

---

## 10. Backups & Recovery

### Active protections

| Layer | What | RPO* | RTO* |
|---|---|---|---|
| Supabase daily snapshots | Free tier; nightly automatic backups, 7-day retention | 24 hours | ~1 hour |
| Supabase Point-in-Time Recovery (Pro plan) | Restore to any second in last 7 days | < 1 second | ~30 min |
| Stripe (independent ledger) | All payment + subscription history | 0 (real-time) | manual reconcile |

*RPO = Recovery Point Objective (how much data could be lost). RTO = Recovery Time Objective (how long to recover).

### Restore procedure

1. Open Supabase Dashboard → project → **Settings → Backups**
2. Select target backup or precise PITR timestamp
3. Click **Restore** → confirms cost + downtime estimate
4. **Critical**: pause all Stripe webhook processing during restore so events don't apply to stale state. The webhook endpoint can be temporarily disabled in Stripe Dashboard → Webhooks → ⋯ → Disable.
5. After restore, replay any Stripe webhooks Stripe retains (they retry for 3 days).

### Planned: off-site weekly dump

Tracked in §15. Will dump the database to a private Backblaze B2 bucket weekly via a GitHub Actions workflow, encrypted at rest, scoped credentials.

---

## 11. Operational Runbooks

### 11.1 Adding a new member

1. Admin → `/admin/members` → **Add Member**
2. Fill in name, tier, home base, and (optionally) email + phone + DOB.
3. On save, the member is created with a placeholder `user_id`. They have no login yet.
4. Click **Invite** on the member row → sends a Supabase Auth invite email via Resend.
5. Member clicks the invite link → sets password → app links their `auth.users` row to the `members` row via `link_my_member` RPC.

### 11.2 Investigating "did anyone access my data?"

Run the query in §8 ("What admins can investigate"). Every admin PII read is in `activity_log`.

### 11.3 Suspected compromised admin account

1. **Immediately**: rotate Supabase service role key (Settings → API → Reset). Update Vercel env var.
2. Set the member's `is_admin = false` directly in the Supabase SQL editor.
3. Revoke their Supabase Auth session (Supabase Dashboard → Authentication → Users → ⋯ → Revoke sessions).
4. Force a password reset email.
5. Pull `activity_log` for everything that admin did in the last 7 days; verify nothing malicious was written. Reverse if needed.
6. If they accessed PII, log the incident here in §17 and (if required by jurisdiction) notify affected members per GDPR / state breach laws.

### 11.4 Stripe webhook outage / replay

If the webhook endpoint was down or returned non-2xx, Stripe retries with exponential backoff for 3 days. Manual replay:
1. Stripe Dashboard → Developers → Webhooks → click the endpoint
2. Find failed events → click event → **Resend**

### 11.5 Member requests data deletion (GDPR)

1. Verify identity by responding from the email on file.
2. Run, as admin in Supabase SQL editor:
   ```sql
   delete from public.members where id = 'M-XXX';
   ```
   Foreign keys cascade-delete to `member_sensitive`, `bookings`, `notifications`, `friendships`, `contact_requests`, `passenger_manifests`.
3. Cancel any active Stripe subscription via Stripe Dashboard.
4. Delete their auth user via Supabase → Authentication → Users → ⋯ → Delete.
5. Log the deletion in `activity_log` (manual insert with `action = 'member_deleted_gdpr'`).
6. Confirm to the member by email within 30 days of the request.

### 11.6 Updating this handbook

When you change a protocol, change this file in the same commit. Update §17 (Changelog). If the change affects investors or members, update the relevant section in §12 or §13.

---

## 12. Member-Facing FAQ

> Plain English answers for member support inbox. Use these verbatim or as a starting point.

**Q: Is my email visible to other members?**

No. Other members only see your name, tier, home base, bio, and interests. They have to send you a "Request contact info" message, and you choose whether to share. You can also turn off all such requests in Account → Privacy if you'd rather only be reached through our Ops team.

**Q: What happens to my payment info?**

Your card never touches Travail's systems. When you pay, the card details go directly from your browser to Stripe, the payments company used by Apple, Amazon, and millions of other businesses. We only see a "card ending in 4242" reference.

**Q: Who can see who's on a trip with me?**

Members who book a seat can opt in or out of being shown on the public roster ("show me on the manifest" toggle at booking time). If you opt out, you're counted in the total but not named. The boarding-pass roster is visible to people on that specific trip; the public seats page shows opted-in members only.

**Q: Can I delete my account?**

Yes. Email ops@travailclub.com from the address on file. We delete your member record, all bookings, contact info, and friend connections within 30 days. Your Stripe payment history is retained by Stripe per financial regulation (typically 7 years) but no longer associated with our system.

**Q: How do you protect against hackers?**

Several layers, in plain language:

1. **No card data here.** Cards live with Stripe, never with us.
2. **Encrypted in transit.** Everything between your phone and our servers is encrypted (HTTPS), and we tell browsers to refuse anything less.
3. **Layered access locks.** Every database table has rules about who can read or change what. A member can only see their own private info; admin access is logged.
4. **Real-time monitoring.** We get alerted within seconds if something unusual happens, with personal info automatically blurred out of those alerts.
5. **Daily backups + 7-day point-in-time restore.** Even if something goes wrong, we can rewind.

**Q: Why does my friend show "private — coordinate through Ops"?**

That member has chosen not to receive contact requests directly. It's not personal — some members (often high-profile travelers) prefer to coordinate through our concierge. Email ops@travailclub.com and we'll make the introduction if they consent.

**Q: I declined someone's contact request and they keep asking.**

They can't. The system blocks the same person from asking you again for 30 days after a decline. If you're getting repeated requests from the same member, that's a bug — please report it.

---

## 13. Investor Talking Points

### One-paragraph pitch

We're building a private membership club around small-aircraft charter flying, anchored by a real operator (Tropic Ocean Air). Members anchor trips, fill the empty seats from the network, discover excursions at destinations, and build durable relationships with other members. We monetize via dues + seat fees + an excursion take rate. The app is built so the most sensitive data (cards, identity) is outsourced to specialists, and what we do hold is locked behind strict consent and a permanent audit trail.

### "What about security?"

Five-layer answer:

1. **Card data**: not stored, handled by Stripe (same as Shopify merchants).
2. **Member contact info**: in a separate encrypted area; admin access is logged forever; never released to other members without explicit, revocable consent.
3. **Privacy controls**: members can flip off contact requests entirely; declined requests trigger a 30-day cooldown.
4. **Application hardening**: HTTPS-only with HSTS, strict Content Security Policy, frame protection, all the OWASP basics.
5. **Real-time monitoring**: Sentry with PII auto-scrubbed before anything leaves the device.

### "What about compliance?"

- **PCI**: SAQ-A (lowest tier), because Stripe handles all card data.
- **GDPR / state privacy laws**: data deletion flow scoped; will formalize as self-serve in v2.
- **SOC 2**: not yet pursued (right timing is post-Series A); building to SOC 2-friendly patterns now (separation of duties, audit logging, encrypted secrets) so the audit is a checkbox, not a rebuild.

### "What's the worst case?"

A hijacked admin account. We have two mitigations: every admin action is in an append-only audit log (so we know exactly what was done), and we're adding multi-factor authentication for admins before the next funding milestone. The blast radius is also bounded by the fact that we don't hold cards or passports — the worst case is exposure of contact info, not financial harm.

### "How does this scale?"

The DB layer is Supabase (managed Postgres) and scales to billions of rows without architectural change. The compute layer is Vercel serverless, which scales automatically. The friction points at scale will be Sentry quota (manageable, paid tier ~$26/mo per 100k events) and PITR retention (we'll expand from 7 days to 28 days as we grow).

---

## 14. Compliance Posture

| Standard | Posture | Notes |
|---|---|---|
| **PCI DSS** | SAQ-A self-attestation | Re-attest annually; the questionnaire is short because we never touch cards |
| **GDPR / CCPA** | Manual deletion flow (runbook §11.5) | Self-serve delete UI planned |
| **HIPAA** | Not in scope | We don't store health data |
| **SOC 2 Type I** | Not pursued | Building to it; planned post-Series A |
| **State breach notification laws** | Procedure in runbook §11.3 step 6 | Notify within statutory window (varies: 30–90 days) |

### DPAs (Data Processing Agreements)

Required with every subprocessor that handles member data:

| Vendor | Status |
|---|---|
| Stripe | ⏸ to sign |
| Supabase | ⏸ to sign |
| Resend | ⏸ to sign |
| Sentry | ⏸ to sign |
| Vercel | ⏸ to sign |

Until DPAs are signed, we're operating on the vendors' standard terms-of-service. **Tracked in §15.**

---

## 15. Known Gaps & Roadmap

Honest list of what's not done yet. Update as items ship.

### High priority

- [ ] **Admin MFA** — enforce 2FA on every `is_admin = true` account. Supabase Auth supports it; needs UI for enrollment + a guard on admin routes.
- [ ] **Sign all subprocessor DPAs** — Stripe, Supabase, Resend, Sentry, Vercel (see §14).
- [ ] **Key rotation** — first formal rotation of service role + Stripe + Resend keys; document the rotation in §17.
- [ ] **Audit Git history for leaked secrets** — `gitleaks` scan; rotate anything found.

### Medium priority

- [ ] **CSP nonces for inline scripts** — eliminate the `'unsafe-inline'` in `script-src` via per-request nonces in middleware.
- [ ] **Stripe Identity for KYC** — when we begin international charters that require passport collection. Eliminates passport scans from our DB entirely.
- [ ] **Off-site weekly DB dump** — GitHub Actions → Backblaze B2 (free tier). Defense-in-depth against a Supabase-level incident.
- [ ] **Soft delete on `members` and `bookings`** — flip from hard `DELETE` to `deleted_at` timestamp + filter, so accidental admin deletes are reversible without a backup restore.
- [ ] **Self-serve member data deletion** — replace the manual GDPR flow with a UI button.
- [ ] **Move `member_sensitive` to a `private` schema** — additional layer of separation; tightens grants.

### Low priority

- [ ] **Sentry session replay** — for production debugging once we're confident the PII scrubber covers replay events.
- [ ] **SOC 2 Type I audit** — post-Series A timing.
- [ ] **Column-level encryption (pgsodium / Vault)** on `member_sensitive` — for true zero-knowledge protection of email + phone + DOB.
- [ ] **Annual penetration test** — once we cross ~$1M ARR.

---

## 16. Glossary

For investor / member conversations — plain English definitions.

| Term | What it means here |
|---|---|
| **PII** | Personally Identifiable Information — name, email, phone, DOB, etc. |
| **PCI DSS** | The payment card industry's security standard. SAQ-A is the easiest tier and applies when you never touch card data. |
| **GDPR** | European privacy law. Gives users the right to access, delete, and port their data. Applies even outside the EU if you serve EU residents. |
| **RLS** | Row-Level Security. Postgres feature that lets us write "this row is only visible to users matching X" rules at the database level — independent of application code. |
| **SECURITY DEFINER** | A Postgres function that runs with the privileges of its creator rather than its caller — used to grant specific, audited access to otherwise-locked-down tables. |
| **HSTS** | HTTP Strict Transport Security. A header that tells browsers "always use HTTPS for this site" for a given duration. |
| **CSP** | Content Security Policy. A header that tells browsers which sources of code/images/scripts are allowed to load on this page. |
| **SOC 2** | An audit standard for service organizations. Type I = "your controls exist on a specific date." Type II = "your controls have operated effectively over a period." |
| **PITR** | Point-in-Time Recovery. Database backup that lets you restore to any specific timestamp, not just a daily snapshot. |
| **DPA** | Data Processing Agreement. Required contract with every vendor who touches your customers' data, defining their responsibilities. |
| **RPO / RTO** | Recovery Point Objective / Recovery Time Objective. RPO = how much data can be lost. RTO = how long to recover. |
| **MFA** | Multi-Factor Authentication. Requires both a password and a second factor (phone code, security key) to log in. |
| **Webhook** | An HTTP call from a third-party service (Stripe, Sentry) to our backend to notify us of an event. |
| **Anchor (Travail-specific)** | The member who originally booked a charter trip. They reserve some seats for themselves and release the rest to the network. |
| **Excursion (Travail-specific)** | A non-flight experience (fishing trip, golf outing, etc.) at a destination, bookable through the app. |

---

## 17. Changelog

> Append entries here on every material change. Newest first.

### 2026-05-27 — Social graph + security baseline shipped
- Friendships system (migration 032)
- Contact-info request flow with opt-in reveal (migration 033)
- Quiet mode + decline cooldown protections (migration 034)
- PII access audit via `members_has_contact` view + `admin_get_member_sensitive()` audited RPC (migration 035)
- HTTP security headers: HSTS (prod), CSP, X-Frame-Options, Permissions-Policy
- PII scrubber (`lib/pii-scrub.ts`) wired into all `console.error` sites + Sentry beforeSend
- Sentry installed (`@sentry/nextjs` v10), prod-only, PII-scrubbed
- Supabase Pro plan enabled

---

_End of handbook. To add a new section, follow the existing pattern: short heading, plain English, link to the actual code or migration where relevant._
