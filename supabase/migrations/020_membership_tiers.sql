-- Membership tiers: Founder, Founding Member, Administrator.
--
-- Administrators are ops accounts hidden from the member network. Founders are
-- members with admin access. Founding Member is the base tier. Admin access
-- (members.is_admin) stays a manually-managed flag, set per-member in the ops
-- members page — it is NOT auto-derived from tier.
--
-- Baseline: existing admin accounts become Administrators; everyone else is
-- reset to Founding Member (least privilege). Promote individual members to
-- Founder from the ops members page afterwards.

update public.members set tier = 'administrator'   where is_admin = true;
update public.members set tier = 'founding_member' where is_admin = false;

alter table public.members alter column tier set default 'founding_member';
