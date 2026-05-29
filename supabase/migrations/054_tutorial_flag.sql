-- First-login tutorial flag.
--
-- A one-shot welcome walkthrough renders once per member on their
-- first sign-in after onboarding, then never again. Persisted to the
-- members row (rather than localStorage) so the flag survives device
-- changes and reinstalls — a member who switches phones doesn't get
-- the tutorial twice.

alter table public.members
  add column if not exists tutorial_completed_at timestamptz;
