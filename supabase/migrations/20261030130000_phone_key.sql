-- Phone key (docs/superpowers/specs/2026-10-29-phone-key-design.md, plan docs/superpowers/plans/2026-10-29-phone-key-1-server.md).
-- Matching people to phone invitations compares a "key" instead of the bare digits: an Argentine mobile has two
-- international spellings (+54 9 11 ... and +54 11 ...), and the key folds them into one.
-- Hosted-compatible: depends only on the migrations listed in supabase/tests/hosted-baseline/migrations.txt.
-- Rollback: supabase/rollback/20261030130000_phone_key.rollback.sql.

-- 1. The key and its variants

-- The digits of a number; 549 followed by exactly ten digits becomes 54 followed by those ten. Null or no digits give ''.
create function private.phone_key(p text) returns text language sql immutable set search_path = '' as $$
 select regexp_replace(coalesce(regexp_replace(p, '[^0-9]', '', 'g'), ''), '^549([0-9]{10})$', '54\1')
$$;
revoke all on function private.phone_key(text) from public, anon, authenticated, service_role;

-- The spellings a key can be stored under: the key itself, plus its 549 form when it is 54 and ten digits.
create function private.phone_variants(p_key text) returns text[] language sql immutable set search_path = '' as $$
 select case when p_key ~ '^54[0-9]{10}$' then array[p_key, '549' || substr(p_key, 3)] else array[p_key] end
$$;
revoke all on function private.phone_variants(text) from public, anon, authenticated, service_role;

-- 2. Test mode stores and finds codes by key
-- Same bodies as 20261027120000_phone_accounts.sql; create or replace keeps the signatures and grants.

create or replace function public.send_sms_hook(event jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
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

-- In test mode only: 000000 for a number whose code was sent in the last 10 minutes returns that code. The log names
-- the account the code is for: the number's holder (signing in), else the one account adding it (phone_change);
-- null when nobody, or more than one account, is adding it.
create or replace function public.exchange_test_code(p_phone text, p_code text) returns text language plpgsql security definer set search_path = '' as $$
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
