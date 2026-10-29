-- Rollback for 20261030130000_phone_key.sql (the phone key). Run as one transaction, only with the owner's approval:
--   begin; \i supabase/rollback/20261030130000_phone_key.rollback.sql; commit;
-- It restores what the migration replaced (the two test-mode functions) and drops every function the migration created.
-- The drops stay at the end: restores come above them.

create or replace function public.send_sms_hook(event jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
 v_phone text := private.phone_digits(coalesce(nullif(event->'user'->>'new_phone',''), event->'user'->>'phone'));
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
create or replace function public.exchange_test_code(p_phone text, p_code text) returns text language plpgsql security definer set search_path = '' as $$
declare
 v_phone text := private.phone_digits(p_phone);
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
 select id into v_user from auth.users where phone = v_phone;
 if v_user is null then
  select case when count(*) = 1 then (array_agg(id))[1] end into v_user from auth.users where phone_change = v_phone;
 end if;
 insert into private.test_mode_log(kind, phone_suffix, user_id) values ('exchanged', right(v_phone, 2), v_user);
 return v_otp;
end $$;
revoke all on function public.exchange_test_code(text, text) from public, anon, authenticated, service_role;
grant execute on function public.exchange_test_code(text, text) to anon, authenticated;

drop function private.phone_variants(text);
drop function private.phone_key(text);
