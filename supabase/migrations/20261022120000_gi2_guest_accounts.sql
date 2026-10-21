-- GI2 guest accounts (docs/superpowers/specs/2026-10-21-gi2-guest-accounts-design.md): the event link grants beta
-- access next to the tester roster, the 18+ tick is stored once, and join_by_link makes a guest's account usable
-- and puts them on the event in one transaction.
-- Hosted-compatible: depends only on the migrations listed in supabase/tests/hosted-baseline/migrations.txt.
-- Rollback: supabase/rollback/20261022120000_gi2_guest_accounts.rollback.sql.
-- The deletion- and delivery-aware halves of these rules are in the local-only
-- 20261022120001_gi2_local_delivery_and_deletion.sql, which goes live with those milestones.

-- Slice A: access from a link, the attestation and the join.
-- One grant per account, made only by a successful join through a live link. Revoking (revoked_at, set by SQL)
-- is the owner's ban for abuse and no link lifts it. Deleting the account deletes the grant.
create table private.beta_access (
 user_id uuid primary key references auth.users(id) on delete cascade,
 source text not null check (source in ('link')),
 plan_link_id uuid references private.plan_links(id) on delete set null,
 granted_at timestamptz not null default now(),
 revoked_at timestamptz
);
create index beta_access_plan_link_idx on private.beta_access(plan_link_id);
alter table private.beta_access enable row level security;
revoke all on private.beta_access from public, anon, authenticated;

-- "I'm 18 or over" and the Terms version agreed to, written once; a later tick never overwrites the first.
create table private.age_attestations (
 user_id uuid primary key references auth.users(id) on delete cascade,
 confirmed_at timestamptz not null default now(),
 terms_version text not null check (terms_version ~ '^[0-9]{4}-[0-9]{2}$'),
 method text not null default 'tick' check (method in ('tick'))
);
alter table private.age_attestations enable row level security;
revoke all on private.age_attestations from public, anon, authenticated;

create function private.has_live_grant(p_user uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from private.beta_access where user_id=p_user and revoked_at is null)
$$;
revoke all on function private.has_live_grant(uuid) from public, anon, authenticated, service_role;

-- A roster row or a live grant, with the same account checks for both. Otherwise the
-- 20260917190517_resbite_private_tester_foundation body, the one the hosted project runs; the local-only
-- 20261022120001_gi2_local_delivery_and_deletion.sql widens the deletion-aware body the same way.
create or replace function private.eligible() returns boolean language sql stable security definer set search_path = '' as $$
 select auth.uid() is not null and exists (
  select 1 from auth.users u
  where u.id = auth.uid() and u.email_confirmed_at is not null
    and not coalesce(u.is_anonymous,false)
    and (exists (select 1 from private.tester_roster r where r.email = lower(u.email) and r.enabled) or private.has_live_grant(u.id))
    and (u.banned_until is null or u.banned_until <= now())
 ) and not exists (select 1 from public.profiles p where p.id=auth.uid() and p.deletion_requested_at is not null)
$$;

-- Joining by the event link from a new account (GI2-D2). In this order: a signed-in, confirmed, non-anonymous
-- account that isn't banned or leaving, else 42501 "Sign-in required"; the account's lock (require_tester's,
-- so this serialises with deletion); a revoked grant is refused (42501); testers and grant holders take GI1's
-- claim_plan_link and the name and tick are ignored. Everyone else needs a live link to an active event that
-- hasn't started and isn't their own (42501 "Invitation unavailable": an organizer dropped from the roster
-- does not let themselves back in), a name of 1-80 characters unless they have a profile, and the tick unless
-- it is already stored (22023). Then the tick, the grant, the profile (only when new), the attendance (not
-- answered yet) and the organizer's notice, under GI1's dedupe key, in one transaction.
create function private.join_by_link(p_code text,p_name text,p_terms_version text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_link private.plan_links; v_plan public.plans; v_has_profile boolean;
begin
 if v_uid is null or not exists(select 1 from auth.users u where u.id=v_uid and u.email_confirmed_at is not null
  and not coalesce(u.is_anonymous,false) and (u.banned_until is null or u.banned_until<=now()))
 or exists(select 1 from public.profiles p where p.id=v_uid and p.deletion_requested_at is not null) then
  raise exception 'Sign-in required' using errcode='42501';
 end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_uid::text,47));
 if exists(select 1 from private.beta_access where user_id=v_uid and revoked_at is not null) then
  raise exception 'Invitation unavailable' using errcode='42501';
 end if;
 if private.eligible() then return private.claim_plan_link(p_code); end if;
 if p_code is null or p_code !~ '^[A-Za-z0-9_-]{22}$' then raise exception 'Invitation unavailable' using errcode='42501'; end if;
 select * into v_link from private.plan_links where code=p_code and revoked_at is null;
 if not found then raise exception 'Invitation unavailable' using errcode='42501'; end if;
 select * into v_plan from public.plans where id=v_link.plan_id for update;
 if not found or v_plan.owner_id is null or v_plan.status<>'active' or v_plan.starts_at<=now() then
  raise exception 'Invitation unavailable' using errcode='42501';
 end if;
 -- Read again under the plan lock: rotate_plan_link holds the same lock while it turns the link off.
 perform 1 from private.plan_links where id=v_link.id and revoked_at is null;
 if not found then raise exception 'Invitation unavailable' using errcode='42501'; end if;
 if v_plan.owner_id=v_uid then raise exception 'Invitation unavailable' using errcode='42501'; end if;
 v_has_profile := exists(select 1 from public.profiles where id=v_uid);
 if not v_has_profile and coalesce(char_length(btrim(p_name)),0) not between 1 and 80 then
  raise exception 'Name required' using errcode='22023';
 end if;
 if not exists(select 1 from private.age_attestations where user_id=v_uid) then
  if p_terms_version is null or p_terms_version !~ '^[0-9]{4}-[0-9]{2}$' then
   raise exception 'Age confirmation required' using errcode='22023';
  end if;
  insert into private.age_attestations(user_id,terms_version) values(v_uid,p_terms_version);
 end if;
 insert into private.beta_access(user_id,source,plan_link_id) values(v_uid,'link',v_link.id);
 if not v_has_profile then insert into public.profiles(id,display_name) values(v_uid,btrim(p_name)); end if;
 insert into public.attendees(plan_id,user_id) values(v_plan.id,v_uid) on conflict do nothing;
 insert into private.notification_outbox(plan_id,recipient_id,kind,dedupe_key,actor_id)
  values(v_plan.id,v_plan.owner_id,'invitation','link:'||v_link.id||':'||v_uid,v_uid) on conflict do nothing;
 return v_plan.id;
end $$;
create function public.join_by_link(p_code text,p_name text,p_terms_version text) returns uuid
language sql security invoker set search_path = '' as $$
 select private.join_by_link(p_code,p_name,p_terms_version)
$$;
revoke all on function private.join_by_link(text,text,text), public.join_by_link(text,text,text) from public, anon, authenticated, service_role;
grant execute on function private.join_by_link(text,text,text), public.join_by_link(text,text,text) to authenticated;
