-- Phone accounts (docs/superpowers/specs/2026-10-27-phone-accounts-design.md), part 1: test-mode codes. Until text
-- messages are paid for, Supabase Auth's Send SMS hook (public.send_sms_hook) stores the code instead of sending it,
-- and public.exchange_test_code swaps the fixed code 000000 for the stored one.
-- Hosted-compatible: depends only on the migrations listed in supabase/tests/hosted-baseline/migrations.txt.
-- Rollback: the Task 3 rollback file, supabase/rollback/20261027120000_phone_accounts.rollback.sql.

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
