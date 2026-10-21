-- GI2 guest accounts: deletion and notice delivery for grant holders
-- (docs/superpowers/specs/2026-10-21-gi2-guest-accounts-design.md). LOCAL-ONLY: replaces functions from
-- 20260918001316_account_deletion_lifecycle.sql and 20261015130000_ux3_note_delivery.sql, which the hosted project
-- does not run, and join_by_link from 20261022120000_gi2_guest_accounts.sql.
-- It goes live with the notification sender and the deletion milestone, after each has its own owner approval,
-- never with the GI2 release, and is applied after those files: they would otherwise put back roster-only bodies.

-- A roster row or a live grant, with the same account checks for both. Otherwise the
-- 20260918001316_account_deletion_lifecycle body.
create or replace function private.eligible() returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(
 select 1 from auth.users u
 where u.id=auth.uid() and u.email_confirmed_at is not null and not coalesce(u.is_anonymous,false)
 and (exists(select 1 from private.tester_roster r where r.email=lower(u.email) and r.enabled) or private.has_live_grant(u.id))
 and (u.banned_until is null or u.banned_until<=now()))
 and not exists(select 1 from public.profiles p where p.id=auth.uid() and p.deletion_requested_at is not null)
 and not exists(select 1 from private.account_deletion_jobs j where j.user_id=auth.uid())
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

-- An account with a deletion request is refused like one marked as leaving. Otherwise the
-- 20261022120000_gi2_guest_accounts body.
create or replace function private.join_by_link(p_code text,p_name text,p_terms_version text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_link private.plan_links; v_plan public.plans; v_has_profile boolean;
begin
 if v_uid is null or not exists(select 1 from auth.users u where u.id=v_uid and u.email_confirmed_at is not null
  and not coalesce(u.is_anonymous,false) and (u.banned_until is null or u.banned_until<=now()))
 or exists(select 1 from public.profiles p where p.id=v_uid and p.deletion_requested_at is not null)
 or exists(select 1 from private.account_deletion_jobs j where j.user_id=v_uid) then
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
revoke all on function private.join_by_link(text,text,text) from public, anon, authenticated, service_role;
grant execute on function private.join_by_link(text,text,text) to authenticated;
