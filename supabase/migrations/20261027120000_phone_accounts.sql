-- Phone accounts (docs/superpowers/specs/2026-10-27-contact-invitations-design.md, plan
-- docs/superpowers/plans/2026-10-27-phone-accounts.md).
-- Part 1, test-mode codes: until text messages are paid for, Supabase Auth's Send SMS hook (public.send_sms_hook)
-- stores the code instead of sending it, and public.exchange_test_code swaps the fixed code 000000 for the stored one.
-- Part 2: a confirmed phone counts as a confirmed account (user_eligible, account_access_status,
-- save_registration_details), a maintainer grant, the "has used the app" marker and the 18+ tick on its own.
-- Hosted-compatible: depends only on the migrations listed in supabase/tests/hosted-baseline/migrations.txt.
-- Rollback: supabase/rollback/20261027120000_phone_accounts.rollback.sql.

-- One row: whether test mode is on. Turning it off (update private.phone_mode set test_mode=false) makes the hook
-- refuse and the exchange return nothing.
create table private.phone_mode (
 id boolean primary key default true check (id),
 test_mode boolean not null default true,
 changed_at timestamptz not null default now()
);
insert into private.phone_mode default values;
alter table private.phone_mode enable row level security;
revoke all on private.phone_mode from public, anon, authenticated;

-- The latest code per number, in digits only.
create table private.test_codes (
 phone text primary key check (phone ~ '^[1-9][0-9]{6,14}$'),
 otp text not null check (otp ~ '^[0-9]{6}$'),
 sent_at timestamptz not null default now()
);
alter table private.test_codes enable row level security;
revoke all on private.test_codes from public, anon, authenticated;

-- What test mode did, without the full number. user_id has no foreign key: Auth may call the hook before a new
-- account's row is visible, and a failed insert would stop every sign-up code.
create table private.test_mode_log (
 id bigint generated always as identity primary key,
 kind text not null check (kind in ('sent','exchanged')),
 phone_suffix text not null check (phone_suffix ~ '^[0-9]{2}$'),
 user_id uuid,
 at timestamptz not null default now()
);
alter table private.test_mode_log enable row level security;
revoke all on private.test_mode_log from public, anon, authenticated;

create function private.phone_digits(p text) returns text language sql immutable set search_path = '' as $$
 select coalesce(regexp_replace(p, '[^0-9]', '', 'g'), '')
$$;
revoke all on function private.phone_digits(text) from public, anon, authenticated, service_role;

-- The Send SMS hook. Auth calls it as supabase_auth_admin with {user:{id,phone,new_phone?},sms:{otp}}.
create function public.send_sms_hook(event jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
 v_phone text := private.phone_digits(coalesce(nullif(event->'user'->>'new_phone',''), event->'user'->>'phone'));
 v_otp text := event->'sms'->>'otp';
 v_user uuid;
begin
 if v_phone !~ '^[1-9][0-9]{6,14}$' or v_otp is null or v_otp !~ '^[0-9]{6}$' then
  return '{"error":{"http_code":400,"message":"Invalid code request."}}'::jsonb;
 end if;
 if not (select test_mode from private.phone_mode) then
  return '{"error":{"http_code":503,"message":"Text messages aren''t set up yet."}}'::jsonb;
 end if;
 begin
  v_user := (event->'user'->>'id')::uuid;
 exception when invalid_text_representation then
  v_user := null;
 end;
 insert into private.test_codes(phone, otp, sent_at) values (v_phone, v_otp, now())
  on conflict (phone) do update set otp = excluded.otp, sent_at = now();
 insert into private.test_mode_log(kind, phone_suffix, user_id) values ('sent', right(v_phone, 2), v_user);
 return '{}'::jsonb;
end $$;
revoke all on function public.send_sms_hook(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.send_sms_hook(jsonb) to supabase_auth_admin;

-- In test mode only: 000000 for a number whose code was sent in the last 10 minutes returns that code.
create function public.exchange_test_code(p_phone text, p_code text) returns text language plpgsql security definer set search_path = '' as $$
declare
 v_phone text := private.phone_digits(p_phone);
 v_otp text;
begin
 if p_code is distinct from '000000' or not (select test_mode from private.phone_mode) then
  return null;
 end if;
 select otp into v_otp from private.test_codes where phone = v_phone and sent_at > now() - interval '10 minutes';
 if v_otp is null then
  return null;
 end if;
 insert into private.test_mode_log(kind, phone_suffix, user_id)
  values ('exchanged', right(v_phone, 2), (select id from auth.users where phone = v_phone));
 return v_otp;
end $$;
revoke all on function public.exchange_test_code(text, text) from public, anon, authenticated, service_role;
grant execute on function public.exchange_test_code(text, text) to anon, authenticated;

-- Part 2: accounts confirmed by phone, app use and the 18+ tick.
-- A maintainer grant: the owner's way to let a test phone account in, by SQL, until invitations grant access.
alter table private.beta_access drop constraint beta_access_source_check,
 add constraint beta_access_source_check check (source in ('link','maintainer'));

-- A confirmed account has a confirmed email or a confirmed phone. The 20261022120000_gi2_guest_accounts body, the
-- one the hosted project runs, with the confirmed check widened and the leaving check delegated to
-- deletion_pending(): there, a profile marked as leaving; with the local-only
-- 20261022120001_gi2_local_delivery_and_deletion.sql (which gives user_eligible() this same body), also a pending
-- deletion request. Its execute grants are unchanged; eligible() keeps delegating to it.
create or replace function private.user_eligible(p_user uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select p_user is not null and exists (
  select 1 from auth.users u
  where u.id = p_user and (u.email_confirmed_at is not null or u.phone_confirmed_at is not null)
    and not coalesce(u.is_anonymous,false)
    and (exists (select 1 from private.tester_roster r where r.email = lower(u.email) and r.enabled) or private.has_live_grant(u.id))
    and (u.banned_until is null or u.banned_until <= now())
 ) and not private.deletion_pending(p_user)
$$;

-- 'unconfirmed' only when neither the email nor the phone is confirmed. Otherwise the
-- 20260923150059_account_access_status body; its grants and its public façade are unchanged.
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
 elsif v_user.email_confirmed_at is null and v_user.phone_confirmed_at is null
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

-- A phone-confirmed account may save its details too. Otherwise the 20260923150902_atomic_registration_details
-- body; its grants and its public façade are unchanged.
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
 if not found or (v_user.email_confirmed_at is null and v_user.phone_confirmed_at is null) or coalesce(v_user.is_anonymous,false)
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

-- "Has used the app": one row per account that has signed into the app, its first and latest session. Plan 2's
-- contact lookup shows "On Resbite" only for these accounts. Nobody but the database reads the table.
create table private.app_sessions (
 user_id uuid primary key references auth.users(id) on delete cascade,
 first_at timestamptz not null default now(),
 last_at timestamptz not null default now()
);
alter table private.app_sessions enable row level security;
revoke all on private.app_sessions from public, anon, authenticated;

-- The app calls this on each sign-in and refresh: the caller's row, its latest time bumped. Any signed-in account,
-- approved or not.
create function private.note_app_session() returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
 if v_uid is null or not exists(select 1 from auth.users where id=v_uid) then
  raise exception 'Sign-in required' using errcode='42501';
 end if;
 insert into private.app_sessions(user_id) values (v_uid)
  on conflict (user_id) do update set last_at = now();
end $$;
create function public.note_app_session() returns void language sql security invoker set search_path = '' as $$
 select private.note_app_session()
$$;
revoke all on function private.note_app_session(), public.note_app_session() from public, anon, authenticated, service_role;
grant execute on function private.note_app_session(), public.note_app_session() to authenticated;

create function private.used_app(p_user uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from private.app_sessions where user_id=p_user)
$$;
revoke all on function private.used_app(uuid) from public, anon, authenticated, service_role;

-- The 18+ and Terms tick from the first sign-up screen, stored in GI2's table: written once, a later tick never
-- overwrites the first. 22023 for a Terms version that isn't YYYY-MM, as join_by_link.
create function private.attest_age(p_terms_version text) returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
 if v_uid is null or not exists(select 1 from auth.users where id=v_uid) then
  raise exception 'Sign-in required' using errcode='42501';
 end if;
 if p_terms_version is null or p_terms_version !~ '^[0-9]{4}-[0-9]{2}$' then
  raise exception 'Age confirmation required' using errcode='22023';
 end if;
 insert into private.age_attestations(user_id,terms_version) values (v_uid,p_terms_version)
  on conflict (user_id) do nothing;
end $$;
create function public.attest_age(p_terms_version text) returns void language sql security invoker set search_path = '' as $$
 select private.attest_age(p_terms_version)
$$;
revoke all on function private.attest_age(text), public.attest_age(text) from public, anon, authenticated, service_role;
grant execute on function private.attest_age(text), public.attest_age(text) to authenticated;
