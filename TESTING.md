# Testing access

A dedicated test account lets a Claude Code session verify the app's real flows
(reserve → queue → confirm → boarding pass → threads) without a browser, by
signing in under Row Level Security exactly like a real user.

## 1. Create a test account in Supabase

1. **Authentication → Users → Add user** — use a throwaway email + password
   (e.g. `test@travail.test`). Copy the **User UID**.
2. **Table Editor → members → Insert row** (or reuse an existing member):
   - `id`: e.g. `M-TEST`
   - `name`: `Test Pilot`
   - `initials`: `TP`
   - `tier`: `founding`
   - `is_admin`: `true`  ← so the same account can test the ops side too
   - `user_id`: paste the User UID from step 1
   - `kyc_verified`: `true`
3. (Optional) set `home_base_code` to `KTPF`.

It's a disposable account — delete or rotate it anytime.

## 2. Provide the credentials

Add to `.env.local` (already gitignored — never committed):

```
TEST_EMAIL=test@travail.test
TEST_PASSWORD=your-test-password
```

## 3. Run the smoke test

```
node scripts/smoke.mjs          # read-only checks (auth, member, catalog, bookings, guests, threads)
node scripts/smoke.mjs --book   # also creates a real pending booking in the ops queue
```

It signs in, confirms the member link and admin flag, and reports what the
account can see/do under RLS. Requires the environment's network policy to allow
outbound access to `*.supabase.co`.

## 4. Test the email notification pipeline

Emails are sent by the `notify-email` edge function, which is invoked by a
Database Webhook (trigger `notify-email`) on every `INSERT` into
`public.notifications`. To verify the chain end-to-end, insert a notification
and watch for the outbound HTTP call.

Run this in the Supabase SQL editor:

```sql
-- IMPORTANT: `kind` is NOT NULL and has no default — you MUST include it,
-- or the insert fails with: null value in column "kind" ... not-null constraint.
insert into public.notifications (member_id, kind, title, body)
values ('M-001', 'system', 'pipeline test', 'testing the email trigger');
```

Wait ~5 seconds (pg_net dispatches asynchronously), then:

```sql
select id, status_code, error_msg, content, created
from net._http_response
where created > now() - interval '2 minutes'
order by created desc;
```

Reading the result:

- **`status_code` 200** — the webhook fired and reached the function. If no
  email arrives, the problem is *inside* the function: missing secrets
  (`RESEND_API_KEY`, `NOTIFY_FROM`), an unverified Resend sender domain, or the
  member missing a `member_sensitive.email` row (the function reads the address
  from there, not `auth.users`).
- **4xx/5xx** — `content`/`error_msg` explains why (e.g. wrong URL → 404, bad
  auth header → 401).
- **No row, even after re-running** — pg_net isn't dispatching. Note that
  `net._http_response` is purged on a schedule (~6h), so an *empty* table by
  itself is not proof that nothing fired; always test with a fresh insert.

Useful diagnostics if it's broken:

```sql
-- Is the webhook trigger present and enabled? (tgenabled 'O' = enabled, 'D' = disabled)
select tgname, tgenabled from pg_trigger
where tgrelid = 'public.notifications'::regclass and not tgisinternal;

-- What URL/headers does the trigger call? (each arg returns as its own row)
select unnest(string_to_array(encode(tgargs, 'escape'), E'\\000')) as arg
from pg_trigger
where tgrelid = 'public.notifications'::regclass and tgname = 'notify-email';
```
