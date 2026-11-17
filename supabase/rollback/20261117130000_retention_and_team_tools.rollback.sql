-- Rollback for 20261117130000_retention_and_team_tools.sql (App Store readiness plan 6, spec C3, C4 and C6). For the
-- hosted project only: the local replay never runs it. Run as one transaction, only with the owner's approval, before
-- plan 2's rollback (20261117110000_account_deletion_release.rollback.sql) if that is undone too:
--   begin; \i supabase/rollback/20261117130000_retention_and_team_tools.rollback.sql; commit;
-- It undoes the migration's sections in reverse, under the refusal that comes first: section 5 first, at the top,
-- section 1 last, at the bottom. Each later section's undo goes above the one before it.
-- An object shared with plan 2 (private.legal_holds, private.account_held(uuid), private.suspension_history) or
-- private.series_held(uuid) is dropped only when its comment reads 'resbite 20261117130000': made by this file, not by
-- plan 2's, which runs first and so normally owns all but series_held.

-- First, before any section's undo: the refusal. While the do-not-invite list (section 4) holds an entry, this file
-- refuses and changes nothing: an objection must not silently stop working. To undo it anyway, export the list and
-- empty it first, by hand, with the owner's approval. Each section's undo goes below this.
do $rollback$ begin
 if pg_catalog.to_regclass('private.invite_objections') is not null then
  if exists (select 1 from private.invite_objections) then
   raise exception 'The do-not-invite list holds an objection: nothing was undone'
    using errcode = '55000',
     hint = 'Export private.invite_objections and empty it first, by hand, with the owner''s approval; then run this again.';
  end if;
 end if;
end $rollback$;

-- Section 4: the do-not-invite list (the refusal above keeps an entry from being dropped). invite_contacts goes back
-- to its base body (20261111160000_chat_safety.sql:580-723, verbatim; create or replace keeps its grants and its public
-- wrapper), then the five functions and the list are dropped. The list's secret (invite_objection_key) stays in Vault,
-- so a list exported under it still matches once this file is applied again.
create or replace function private.invite_contacts(p_plan uuid, p_invites jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_tester(); v_host boolean; v_item jsonb; v_phone text; v_country text; v_code text; v_holder uuid;
 v_kind text; v_out jsonb := '[]'::jsonb; v_user uuid; v_series uuid; v_brought uuid; v_level smallint := 1; v_may boolean;
 v_remaining integer := 0; v_new integer := 0; v_key text; v_live private.phone_invitations; v_open boolean; v_on boolean;
begin
 v_host := private.is_host(p_plan,v_uid);
 if v_host then
  perform private.require_link_owner(p_plan);
 else
  -- Only someone on the resbite gets as far as its row's lock.
  if not exists(select 1 from public.attendees a where a.plan_id=p_plan and a.user_id=v_uid) then
   raise exception 'Not allowed to bring people here' using errcode='42501';
  end if;
  -- The plan's row first, then the allowance.
  select p.status='active' and private.plan_end(p.starts_at,p.ends_at)>now() into v_open from public.plans p where p.id=p_plan for update;
  select a.may_bring, a.level+1, a.remaining, a.level is not null into v_may, v_level, v_remaining, v_on
   from private.bring_allowance(p_plan,v_uid) a;
  if not coalesce(v_open,false) or not coalesce(v_on,false) then
   raise exception 'Not allowed to bring people here' using errcode='42501';
  end if;
  v_may := coalesce(v_may,false);
  v_brought := v_uid;
 end if;
 select series_id into v_series from public.plans where id=p_plan;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_uid::text,47));
 if jsonb_typeof(p_invites) is distinct from 'array' or jsonb_array_length(p_invites)>50 then
  raise exception 'Invalid invitations' using errcode='22023';
 end if;
 -- The kind of each item tells the host who is On Resbite, so invitations spend the same daily budget as lookups: the
 -- numbers only, as an item by user looks nothing up.
 perform private.charge_lookup(v_uid,(select count(*)::int from jsonb_array_elements(p_invites) e
  where jsonb_typeof(e.value->'user') is distinct from 'string'));
 for v_item in select value from jsonb_array_elements(p_invites) loop
  if jsonb_typeof(v_item->'user')='string' then
   -- A guest who may not bring sends no in-app invitation.
   if not v_host and not v_may then raise exception 'Not allowed to bring people here' using errcode='42501'; end if;
   if v_item->>'user' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'Invalid invitation' using errcode='22023';
   end if;
   v_user := (v_item->>'user')::uuid;
   -- The pair's row is held while the invitation is made: a removal at the same moment goes first or waits.
   perform 1 from public.connections where (user_a,user_b)=(least(v_uid,v_user),greatest(v_uid,v_user)) and state='connected' for share;
   if not found or not private.user_eligible(v_user) or private.deletion_pending(v_user) then
    raise exception 'Not a connection' using errcode='42501';
   end if;
   -- The person's confirmed number: the links to it are invitations of this person.
   v_key := (select nullif(private.phone_key(u.phone),'') from auth.users u where u.id=v_user and u.phone_confirmed_at is not null);
   if v_user=(select owner_id from public.plans where id=p_plan)
    or exists(select 1 from public.attendees where plan_id=p_plan and user_id=v_user) then
    v_kind := 'already';
   else
    if not v_host then
     if exists(select 1 from private.plan_removals r where r.series_id=v_series and (r.user_id=v_user or r.phone=v_key))
      or exists(select 1 from private.join_requests j where j.plan_id=p_plan and j.user_id=v_user and j.status='waiting') then
      raise exception 'Not allowed to bring people here' using errcode='42501';
     end if;
     select * into v_live from private.phone_invitations where plan_id=p_plan and phone=v_key and revoked_at is null;
    end if;
    if not v_host and v_live.id is not null and v_live.brought_by is distinct from v_uid then
     v_kind := 'already';
    else
     if not v_host and v_live.id is null then
      v_new := v_new+1;
      if v_new>v_remaining then raise exception 'No invites left' using errcode='22023'; end if;
     end if;
     v_kind := 'app';
     insert into public.attendees(plan_id,user_id,brought_by,level) values(p_plan,v_user,v_brought,v_level) on conflict do nothing;
     insert into private.notification_outbox(plan_id,recipient_id,kind,dedupe_key,actor_id)
      values(p_plan,v_user,'invited','invited:'||p_plan||':'||v_user,v_uid) on conflict do nothing;
     update private.phone_invitations set revoked_at=now(), code_hash=null
      where plan_id=p_plan and phone=v_key and revoked_at is null;
     if v_host then
      delete from private.plan_removals where series_id=v_series and (user_id=v_user or phone=v_key);
     end if;
    end if;
   end if;
   v_out := v_out || jsonb_build_array(jsonb_build_object('user',v_user,'kind',v_kind));
   continue;
  end if;
  if jsonb_typeof(v_item) is distinct from 'object' or jsonb_typeof(v_item->'phone') is distinct from 'string'
   or jsonb_typeof(v_item->'country') is distinct from 'string' or jsonb_typeof(v_item->'code') is distinct from 'string' then
   raise exception 'Invalid invitation' using errcode='22023';
  end if;
  v_phone := private.phone_key(v_item->>'phone');
  v_country := v_item->>'country';
  v_code := v_item->>'code';
  if v_phone !~ '^[1-9][0-9]{6,14}$' or v_country !~ '^[1-9][0-9]{0,2}$' or v_code !~ '^[A-Za-z0-9_-]{22}$' then
   raise exception 'Invalid invitation' using errcode='22023';
  end if;
  select id into v_holder from auth.users where phone = any(private.phone_variants(v_phone)) and phone_confirmed_at is not null
   order by id = v_uid desc, phone <> v_phone desc limit 1;
  if v_holder=v_uid or (v_holder is null and v_phone=(select private.phone_key(phone) from auth.users where id=v_uid)) then
   v_kind := 'self';
  elsif v_holder is not null and (v_holder=(select owner_id from public.plans where id=p_plan)
   or exists(select 1 from public.attendees where plan_id=p_plan and user_id=v_holder)) then
   v_kind := 'already';
  else
   if not v_host then
    if exists(select 1 from private.plan_removals r where r.series_id=v_series and (r.phone=v_phone or r.user_id=v_holder))
     or exists(select 1 from private.join_requests j where j.plan_id=p_plan and j.user_id=v_holder and j.status='waiting') then
     raise exception 'Not allowed to bring people here' using errcode='42501';
    end if;
    select * into v_live from private.phone_invitations where plan_id=p_plan and phone=v_phone and revoked_at is null;
   end if;
   if not v_host and v_live.id is not null and v_live.brought_by is distinct from v_uid then
    v_kind := 'already';
   else
    if not v_host and v_live.id is null then
     if not v_may then raise exception 'Not allowed to bring people here' using errcode='42501'; end if;
     v_new := v_new+1;
     if v_new>v_remaining then raise exception 'No invites left' using errcode='22023'; end if;
    end if;
    if v_holder is not null and private.user_eligible(v_holder) and private.used_app(v_holder)
     and exists(select 1 from public.profiles where id=v_holder)
     and not exists(select 1 from private.blocks b where b.blocker_id=v_holder and b.blocked_id=v_uid) then
     v_kind := 'app';
     insert into public.attendees(plan_id,user_id,brought_by,level) values(p_plan,v_holder,v_brought,v_level) on conflict do nothing;
     insert into private.notification_outbox(plan_id,recipient_id,kind,dedupe_key,actor_id)
      values(p_plan,v_holder,'invited','invited:'||p_plan||':'||v_holder,v_uid) on conflict do nothing;
     update private.phone_invitations set revoked_at=now(), code_hash=null
      where plan_id=p_plan and phone=v_phone and revoked_at is null;
    else
     v_kind := 'link';
     insert into private.phone_invitations(plan_id,phone,country,code_hash,invited_by,brought_by,level)
      values(p_plan,v_phone,v_country,extensions.digest(v_code,'sha256'),v_uid,v_brought,v_level)
      on conflict (plan_id,phone) do update set country=excluded.country, code_hash=excluded.code_hash, revoked_at=null,
       user_id=case when private.phone_invitations.revoked_at is null then private.phone_invitations.user_id end,
       answered_at=case when private.phone_invitations.revoked_at is null then private.phone_invitations.answered_at end,
       invited_by=case when private.phone_invitations.revoked_at is null then private.phone_invitations.invited_by else excluded.invited_by end,
       -- A host's link counts from when the host last sent it (CO-R12); a guest's sent again keeps its time.
       created_at=case when private.phone_invitations.revoked_at is null and not v_host then private.phone_invitations.created_at else excluded.created_at end,
       brought_by=excluded.brought_by, level=excluded.level;
    end if;
    if v_host then
     delete from private.plan_removals where series_id=v_series and (phone=v_phone or user_id=v_holder);
    end if;
   end if;
  end if;
  -- A guest who may not bring only sends their own links again.
  if not v_host and not v_may and v_kind in ('self','already') then raise exception 'Not allowed to bring people here' using errcode='42501'; end if;
  v_out := v_out || jsonb_build_array(jsonb_build_object('phone',private.phone_digits(v_item->>'phone'),'kind',v_kind));
 end loop;
 return v_out;
end $$;
drop function if exists private.withdraw_objection(text);
drop function if exists private.record_objection(text);
drop function if exists private.number_objected(text);
drop function if exists private.ensure_objection_key();
drop function if exists private.objection_key_hash(text);
drop table if exists private.invite_objections;

-- Section 3: the series purges and the account purges. It restores no row: not what any purge deleted, and not the
-- tester roster rows and legacy invitations (private.tester_roster, private.invitations) that section 3 emptied once.
-- Each disabled roster row stays the revoked grant it became, and a suspension that disabled one keeps the grant in
-- its record, so supabase/ops/suspend-account.sql's undo still works.
drop function if exists private.purge_unconfirmed_accounts(integer);
drop function if exists private.purge_web_accounts(integer);
drop function if exists private.dormant_web_accounts(integer);
drop function if exists private.purge_plans(integer);
drop function if exists private.purge_chats(integer);

-- Section 2: the daily run and the row purges.
drop function if exists private.run_retention();
drop function if exists private.purge_suspension_history(integer);
drop function if exists private.purge_closed_reports(integer);
drop function if exists private.purge_link_opens(integer);
drop function if exists private.purge_notifications(integer);
drop function if exists private.purge_connection_requests(integer);
drop function if exists private.purge_connection_refusals(integer);
drop function if exists private.purge_plan_removals(integer);
drop function if exists private.purge_phone_invitations(integer);

-- Section 1: the retention helpers, then the shared objects this file made.
drop function if exists private.series_end(uuid);
drop function if exists private.series_under_hold(uuid);
do $rollback$ begin
 if pg_catalog.obj_description(pg_catalog.to_regprocedure('private.series_held(uuid)'),'pg_proc')='resbite 20261117130000' then
  drop function private.series_held(uuid);
 end if;
 if pg_catalog.obj_description(pg_catalog.to_regprocedure('private.account_held(uuid)'),'pg_proc')='resbite 20261117130000' then
  drop function private.account_held(uuid);
 end if;
 if pg_catalog.obj_description(pg_catalog.to_regclass('private.legal_holds'),'pg_class')='resbite 20261117130000' then
  drop table private.legal_holds;
 end if;
 if pg_catalog.obj_description(pg_catalog.to_regclass('private.suspension_history'),'pg_class')='resbite 20261117130000' then
  drop table private.suspension_history;
 end if;
end $rollback$;
