-- GI2 guest accounts: deletion and notice delivery for grant holders
-- (docs/superpowers/specs/2026-10-21-gi2-guest-accounts-design.md). LOCAL-ONLY: replaces functions from
-- 20260918001316_account_deletion_lifecycle.sql and 20261015130000_ux3_note_delivery.sql, which the hosted project
-- does not run, and user_eligible and deletion_pending from 20261022120000_gi2_guest_accounts.sql. It redefines
-- user_eligible(), notification_recipient_eligible() and deletion_pending() only; eligible() delegates to
-- user_eligible(), so if 20260918001316 runs after GI2 its eligible() must be pointed back at user_eligible().
-- It goes live with the notification sender and the deletion milestone, after each has its own owner approval,
-- never with the GI2 release, and is applied after those files: they would otherwise put back roster-only bodies.

-- An account with a deletion request may not use the app either. Otherwise the 20261022120000_gi2_guest_accounts
-- body, laid out as the 20260918001316_account_deletion_lifecycle eligible(); eligible() keeps delegating to it.
create or replace function private.user_eligible(p_user uuid) returns boolean language sql stable security definer set search_path='' as $$
 select p_user is not null and exists(
 select 1 from auth.users u
 where u.id=p_user and u.email_confirmed_at is not null and not coalesce(u.is_anonymous,false)
 and (exists(select 1 from private.tester_roster r where r.email=lower(u.email) and r.enabled) or private.has_live_grant(u.id))
 and (u.banned_until is null or u.banned_until<=now()))
 and not exists(select 1 from public.profiles p where p.id=p_user and p.deletion_requested_at is not null)
 and not exists(select 1 from private.account_deletion_jobs j where j.user_id=p_user)
$$;

-- A notice goes to a roster tester or a live grant holder. Otherwise the 20261015130000_ux3_note_delivery body.
create or replace function private.notification_recipient_eligible(p_outbox bigint) returns boolean
language sql stable security definer set search_path='' as $$
 select exists (
 select 1 from private.notification_outbox o
 join public.profiles p on p.id=o.recipient_id
 join auth.users u on u.id=p.id
 join public.plans plan on plan.id=o.plan_id
 where o.id=p_outbox and p.deletion_requested_at is null
 and (exists(select 1 from private.tester_roster r where r.email=lower(u.email) and r.enabled) or private.has_live_grant(u.id))
 and u.email_confirmed_at is not null and not coalesce(u.is_anonymous,false)
 and (u.banned_until is null or u.banned_until<=now())
 and (plan.owner_id=p.id or exists(select 1 from public.attendees a where a.plan_id=plan.id and a.user_id=p.id
  and (o.kind not in ('plan_changed','guest_note') or a.response in ('accepted','maybe','pending'))))
 and o.created_at>now()-interval '24 hours'
 )
$$;

-- A pending deletion request counts as being deleted too. Otherwise the 20261022120000_gi2_guest_accounts body.
create or replace function private.deletion_pending(p_user uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.profiles p where p.id=p_user and p.deletion_requested_at is not null)
 or exists(select 1 from private.account_deletion_jobs j where j.user_id=p_user)
$$;
