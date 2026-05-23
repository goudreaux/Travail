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
