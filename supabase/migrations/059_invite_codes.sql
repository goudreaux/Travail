-- Per-member invite codes — the path-of-least-resistance signup.
--
-- An invite code is a short, unguessable token tied to a pre-created member
-- (and their email). The recipient opens /join?code=..., sets a password, and
-- is dropped straight into the app — no magic-link email, no single-use link
-- expiry, no www<->apex redirect or hash-fragment fragility. Codes are
-- single-use, optionally expire, and ops can revoke them.
--
-- Redemption happens server-side with the service role (see /api/join), so the
-- only RLS we need here is for ops to create / list / revoke codes from the
-- dashboard. Members never touch this table directly.

create table if not exists public.invite_codes (
  id          text primary key
                default 'IC-' || upper(substr(md5(random()::text), 1, 6)),
  code        text not null unique,
  member_id   text not null references public.members(id) on delete cascade,
  -- Email the code is bound to (the member's contact email at creation time).
  -- Redemption uses this address to create the login, so a leaked code can't
  -- be used to register some other address.
  email       text,

  created_by  text references public.members(id) on delete set null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz,                 -- null = never expires
  revoked_at  timestamptz,                 -- ops killed it
  used_at     timestamptz,                 -- redeemed (single-use)
  used_by     uuid references auth.users(id) on delete set null
);

create index if not exists invite_codes_member_idx
  on public.invite_codes(member_id, created_at desc);

-- ─── RLS ──────────────────────────────────────────────────────────────────
alter table public.invite_codes enable row level security;

-- Admins manage codes from the ops dashboard. Redemption runs through the
-- service role (which bypasses RLS), so members need no direct access.
drop policy if exists "Admins manage invite codes" on public.invite_codes;
create policy "Admins manage invite codes" on public.invite_codes
  for all using (public.is_admin()) with check (public.is_admin());
