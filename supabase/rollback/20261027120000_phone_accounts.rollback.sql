-- Rollback for 20261027120000_phone_accounts.sql (both parts: test-mode codes, and accounts confirmed by phone).
-- Run as one transaction, only with the owner's approval, and switch the Send SMS hook off in the Auth dashboard
-- with it (Auth would otherwise call a function that no longer exists):
--   begin; \i supabase/rollback/20261027120000_phone_accounts.rollback.sql; commit;
-- It restores verbatim user_eligible() and join_by_link() from 20261022120000_gi2_guest_accounts.sql,
-- account_access_status() from 20260923150059_account_access_status.sql and save_registration_details() from
-- 20260923150902_atomic_registration_details.sql (their grants were never changed); deletes the maintainer grants
-- and puts back the link-only source check; and drops every object the migration created.
-- After it, an account confirmed only by phone is 'unconfirmed', loses access and can't join by an event link until
-- the migration is re-applied, and maintainer grants must be given again after a re-apply. The app-use markers, the stored codes and the
-- test-mode log go with their tables. 18+ ticks stay: they are GI2's rows. Link grants are untouched.
-- Order: run it before supabase/rollback/20261022120000_gi2_guest_accounts.rollback.sql, never after it, since that
-- file drops the grants table and the functions restored here. Where
-- 20261022120001_gi2_local_delivery_and_deletion.sql has run after this file (the hosted order), run that file's
-- rollback first.

-- Part 2: app use and the 18+ tick.
drop function public.attest_age(text);
drop function private.attest_age(text);
drop function private.used_app(uuid);
drop function public.note_app_session();
drop function private.note_app_session();
drop table private.app_sessions;

-- The 20261022120000_gi2_guest_accounts body, verbatim.
create or replace function private.user_eligible(p_user uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select p_user is not null and exists (
  select 1 from auth.users u
  where u.id = p_user and u.email_confirmed_at is not null
    and not coalesce(u.is_anonymous,false)
    and (exists (select 1 from private.tester_roster r where r.email = lower(u.email) and r.enabled) or private.has_live_grant(u.id))
    and (u.banned_until is null or u.banned_until <= now())
 ) and not exists (select 1 from public.profiles p where p.id=p_user and p.deletion_requested_at is not null)
$$;

-- The 20261022120000_gi2_guest_accounts body, verbatim.
create or replace function private.join_by_link(p_code text,p_name text,p_terms_version text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_link private.plan_links; v_plan public.plans; v_has_profile boolean;
begin
 if v_uid is null then raise exception 'Sign-in required' using errcode='42501'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_uid::text,47));
 if not exists(select 1 from auth.users u where u.id=v_uid and u.email_confirmed_at is not null
  and not coalesce(u.is_anonymous,false) and (u.banned_until is null or u.banned_until<=now()))
 or private.deletion_pending(v_uid) then
  raise exception 'Sign-in required' using errcode='42501';
 end if;
 if exists(select 1 from private.beta_access where user_id=v_uid and revoked_at is not null) then
  raise exception 'Invitation unavailable' using errcode='42501';
 end if;
 if private.eligible() then return private.claim_plan_link(p_code); end if;
 if exists(select 1 from auth.users u where u.id=v_uid
  and exists(select 1 from private.tester_roster r where r.email = lower(u.email) and not r.enabled)) then
  raise exception 'Invitation unavailable' using errcode='42501';
 end if;
 if p_code is null or p_code !~ '^[A-Za-z0-9_-]{22}$' then raise exception 'Invitation unavailable' using errcode='42501'; end if;
 select * into v_link from private.plan_links where code=p_code and revoked_at is null;
 if not found then raise exception 'Invitation unavailable' using errcode='42501'; end if;
 select * into v_plan from public.plans where id=v_link.plan_id for update;
 -- A link grants access only while its organizer may use the app themselves.
 if not found or v_plan.owner_id is null or v_plan.status<>'active' or v_plan.starts_at<=now()
 or not private.user_eligible(v_plan.owner_id) then
  raise exception 'Invitation unavailable' using errcode='42501';
 end if;
 -- Read again under the plan lock: rotate_plan_link holds the same lock while it turns the link off.
 perform 1 from private.plan_links where id=v_link.id and revoked_at is null;
 if not found then raise exception 'Invitation unavailable' using errcode='42501'; end if;
 -- Defensive: the organizer check above already refuses this unless the roster changed after eligible().
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
 if found then
  insert into private.notification_outbox(plan_id,recipient_id,kind,dedupe_key,actor_id)
   values(v_plan.id,v_plan.owner_id,'invitation','link:'||v_link.id||':'||v_uid,v_uid) on conflict do nothing;
 end if;
 return v_plan.id;
end $$;

-- The 20260923150059_account_access_status body, verbatim.
create or replace function private.account_access_status() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_user auth.users; v_status text;
begin
 if v_uid is null then
  raise exception 'Authenticated account required' using errcode='42501';
 end if;
 select * into v_user from auth.users where id=v_uid;
 if not found then
  raise exception 'Authenticated account required' using errcode='42501';
 end if;
 if private.eligible() then
  v_status := 'approved';
 elsif v_user.email_confirmed_at is null
   and not coalesce(v_user.is_anonymous,false)
   and (v_user.banned_until is null or v_user.banned_until<=now())
   and not exists(select 1 from public.profiles p where p.id=v_uid and p.deletion_requested_at is not null)
 then
  v_status := 'unconfirmed';
 else
  v_status := 'access_pending';
 end if;
 return jsonb_build_object('account_id',v_uid,'status',v_status);
end $$;

-- The 20260923150902_atomic_registration_details body, verbatim.
create or replace function private.save_registration_details(p_expected jsonb,p_details jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_uid uuid := auth.uid();
 v_user auth.users;
 v_meta jsonb;
 v_old jsonb;
 v_saved jsonb;
 v_birth date;
 v_deleting boolean := false;
begin
 if v_uid is null then raise exception 'Verified account required' using errcode='42501'; end if;
 -- Match the deletion lifecycle's lock order: user advisory lock, then rows.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_uid::text,47));
 select * into v_user from auth.users where id=v_uid for update;
 if not found or v_user.email_confirmed_at is null or coalesce(v_user.is_anonymous,false)
   or (v_user.banned_until is not null and v_user.banned_until>now())
 then raise exception 'Verified account required' using errcode='42501'; end if;
 if exists(select 1 from public.profiles p where p.id=v_uid and p.deletion_requested_at is not null) then
  raise exception 'Account is unavailable' using errcode='42501';
 end if;
 -- The foundation is deployable without the prepared deletion-job migration.
 if to_regclass('private.account_deletion_jobs') is not null then
  execute 'select exists(select 1 from private.account_deletion_jobs where user_id=$1)'
    into v_deleting using v_uid;
  if v_deleting then raise exception 'Account is unavailable' using errcode='42501'; end if;
 end if;

 if jsonb_typeof(p_details) is distinct from 'object' then
  raise exception 'Invalid account details' using errcode='22023';
 end if;
 if not (p_details ?& array['birth_date','phone','city','interests'])
   or (p_details - array['birth_date','phone','city','interests']) <> '{}'::jsonb then
  raise exception 'Invalid account details fields' using errcode='22023';
 end if;
 if p_details->'birth_date' <> 'null'::jsonb then
  if jsonb_typeof(p_details->'birth_date')<>'string' or (p_details->>'birth_date') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
   raise exception 'Invalid date of birth' using errcode='22023';
  end if;
  begin
   v_birth := (p_details->>'birth_date')::date;
  exception when invalid_datetime_format or datetime_field_overflow then
   raise exception 'Invalid date of birth' using errcode='22023';
  end;
  if v_birth < date '1900-01-01' or v_birth > current_date then
   raise exception 'Invalid date of birth' using errcode='22023';
  end if;
 end if;
 if p_details->'phone' <> 'null'::jsonb and
   (jsonb_typeof(p_details->'phone')<>'string' or (p_details->>'phone') !~ '^[+][1-9][0-9]{6,14}$') then
  raise exception 'Invalid phone number' using errcode='22023';
 end if;
 if p_details->'city' <> 'null'::jsonb and
   (jsonb_typeof(p_details->'city')<>'string' or char_length(p_details->>'city') not between 1 and 100
     or btrim(p_details->>'city') <> p_details->>'city') then
  raise exception 'Invalid city' using errcode='22023';
 end if;
 if jsonb_typeof(p_details->'interests') is distinct from 'array' then
  raise exception 'Invalid interests' using errcode='22023';
 end if;
 if jsonb_array_length(p_details->'interests')>6 or exists(
   select 1 from jsonb_array_elements(p_details->'interests') item
   where jsonb_typeof(item)<>'string' or not (item #>> '{}'=any(array[
     'Outdoors','Food & drink','Arts & creativity','Relaxation','Learning','Time with friends'])))
   or (select count(distinct item) from jsonb_array_elements(p_details->'interests') item) <> jsonb_array_length(p_details->'interests')
 then raise exception 'Invalid interests' using errcode='22023'; end if;

 v_meta := coalesce(v_user.raw_user_meta_data,'{}'::jsonb);
 if jsonb_typeof(v_meta)<>'object' then raise exception 'Invalid stored account details' using errcode='22023'; end if;
 v_old := coalesce(v_meta->'registration_details','null'::jsonb);
 v_saved := (case when jsonb_typeof(v_old)='object' then v_old else '{}'::jsonb end) || p_details;
 -- Repeated identical saves (including a lost successful reply) do not mutate.
 if v_old=v_saved and v_meta->'registration_details_version'='1'::jsonb then
  return jsonb_build_object('account_id',v_uid,'registration_details',v_old);
 end if;
 if v_old is distinct from coalesce(p_expected,'null'::jsonb) then
  raise exception 'Account details changed; reload before saving' using errcode='40001';
 end if;
 update auth.users set raw_user_meta_data=v_meta || jsonb_build_object(
   'registration_details',v_saved,'registration_details_version',1)
 where id=v_uid;
 return jsonb_build_object('account_id',v_uid,'registration_details',v_saved);
end $$;

-- Maintainer grants go first: the 20261022120000_gi2_guest_accounts check allows link grants only.
delete from private.beta_access where source='maintainer';
alter table private.beta_access drop constraint beta_access_source_check,
 add constraint beta_access_source_check check (source in ('link'));

-- Part 1: test-mode codes.
drop function public.exchange_test_code(text, text);
drop function public.send_sms_hook(jsonb);
drop function private.phone_digits(text);
drop table private.test_mode_log;
drop table private.test_codes;
drop table private.phone_mode;
