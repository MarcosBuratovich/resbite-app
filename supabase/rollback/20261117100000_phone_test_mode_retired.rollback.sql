-- Rollback for 20261117100000_phone_test_mode_retired.sql: recreates the five objects it dropped as the hosted project
-- had them, empty and with test mode OFF (plan docs/superpowers/plans/2026-11-17-asr-1-phone-codes.md, Decision 12).
-- It never reopens test mode: afterwards public.exchange_test_code returns null and public.send_sms_hook refuses every
-- code (503), as they did after supabase/ops/phone-test-mode-off.sql. Reopening test mode is a separate owner decision
-- (the plan's Rollout, "Rollback"), never part of this file. The stored codes and the test-mode log come back empty:
-- their rows went with the migration.
-- Run as one transaction, only with the owner's approval (the owner script wraps it in begin;/commit; and runs it with
-- supabase db query --linked -f). The Send SMS hook stays on HTTPS (the send-sms function).
-- It refuses, changing nothing, while any of the five objects exists.
-- Order: run it before the rollbacks of 20261030130000_phone_key and 20261027120000_phone_accounts, which redefine
-- or drop these objects.
-- Sources, checked by sha256 before copying:
--   tables, row-level security and revokes: supabase/migrations/20261027120000_phone_accounts.sql lines 13-41
--   (sha256 208f399152d394460941272ffdeffaa1189883ff251ed37d77a3ab69367f5ddc), except the mode row, inserted with test
--   mode false (the column default stays true, so the table's definition matches);
--   function bodies: supabase/migrations/20261030130000_phone_key.sql lines 26-47 and 52-71
--   (sha256 d7cf188f6b63d14453a2b34d6c8c85838ed196d7a06e01e3bd94c66ae0a14667), as create function;
--   function grants: 20261027120000_phone_accounts.sql lines 71-72 and 97-98.
do $$ begin
 if pg_catalog.to_regprocedure('public.exchange_test_code(text,text)') is not null
  or pg_catalog.to_regprocedure('public.send_sms_hook(jsonb)') is not null
  or pg_catalog.to_regclass('private.test_codes') is not null
  or pg_catalog.to_regclass('private.test_mode_log') is not null
  or pg_catalog.to_regclass('private.phone_mode') is not null then
  raise exception 'Test mode objects exist: nothing to roll back';
 end if;
end $$;

-- One row: whether test mode is on. Restored off.
create table private.phone_mode (
 id boolean primary key default true check (id),
 test_mode boolean not null default true,
 changed_at timestamptz not null default now()
);
insert into private.phone_mode(test_mode) values (false);
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

-- The Send SMS hook (Postgres). Auth calls it as supabase_auth_admin only while the Auth dashboard points at it.
create function public.send_sms_hook(event jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
 v_phone text := private.phone_key(coalesce(nullif(event->'user'->>'new_phone',''), event->'user'->>'phone'));
 v_otp text := event->'sms'->>'otp';
 v_user uuid;
begin
 if v_phone !~ '^[1-9][0-9]{6,14}$' or v_otp is null or v_otp !~ '^[0-9]{6}$' then
  return '{"error":{"http_code":400,"message":"Invalid code request."}}'::jsonb;
 end if;
 if not coalesce((select test_mode from private.phone_mode), false) then
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

-- In test mode only: 000000 for a number whose code was sent in the last 10 minutes returns that code. The log names
-- the account the code is for: the number's holder (signing in), else the one account adding it (phone_change);
-- null when nobody, or more than one account, is adding it.
create function public.exchange_test_code(p_phone text, p_code text) returns text language plpgsql security definer set search_path = '' as $$
declare
 v_phone text := private.phone_key(p_phone);
 v_otp text;
 v_user uuid;
begin
 if p_code is distinct from '000000' or not coalesce((select test_mode from private.phone_mode), false) then
  return null;
 end if;
 select otp into v_otp from private.test_codes where phone = v_phone and sent_at > now() - interval '10 minutes';
 if v_otp is null then
  return null;
 end if;
 select id into v_user from auth.users where phone = any(private.phone_variants(v_phone));
 if v_user is null then
  select case when count(*) = 1 then (array_agg(id))[1] end into v_user from auth.users where phone_change = any(private.phone_variants(v_phone));
 end if;
 insert into private.test_mode_log(kind, phone_suffix, user_id) values ('exchanged', right(v_phone, 2), v_user);
 return v_otp;
end $$;
revoke all on function public.exchange_test_code(text, text) from public, anon, authenticated, service_role;
grant execute on function public.exchange_test_code(text, text) to anon, authenticated;
