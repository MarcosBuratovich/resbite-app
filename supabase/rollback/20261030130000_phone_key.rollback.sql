-- Rollback for 20261030130000_phone_key.sql (the phone key). Run as one transaction, only with the owner's approval:
--   begin; \i supabase/rollback/20261030130000_phone_key.rollback.sql; commit;
-- It restores what the migration replaced (the two test-mode functions) and drops every function the migration created.
-- The drops stay at the end: restores come above them.
-- It also puts the rewritten accounts' phone numbers (and their phone identities) back from private.phone_rewrites.
-- It does NOT put the re-keyed invitations back (a key is the old digits for every number except an Argentine mobile
-- saved with the 9, and the collapsed duplicates are gone) and it does not restore phone_change values.

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

-- Restores the five invitation functions (the 20261028120000_contact_invitations.sql bodies).
create or replace function private.contacts_on_resbite(p_phones text[]) returns text[] language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_tester(); v_n int := coalesce(cardinality(p_phones),0); v_out text[];
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_uid::text,47));
 if v_n>50 then raise exception 'Too many numbers' using errcode='22023'; end if;
 if v_n=0 then return array[]::text[]; end if;
 perform private.charge_lookup(v_uid,v_n);
 select coalesce(array_agg(d order by d),array[]::text[]) into v_out from (
  select distinct u.phone as d from auth.users u
  where u.phone = any(select private.phone_digits(x) from unnest(p_phones) x)
   and u.phone_confirmed_at is not null and u.id<>v_uid
   and private.user_eligible(u.id) and private.used_app(u.id)
   and exists(select 1 from public.profiles p where p.id=u.id)) s;
 return v_out;
end $$;

create or replace function private.invite_contacts(p_plan uuid, p_invites jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_link_owner(p_plan); v_item jsonb; v_phone text; v_country text; v_code text; v_holder uuid;
 v_kind text; v_out jsonb := '[]'::jsonb;
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_uid::text,47));
 if jsonb_typeof(p_invites) is distinct from 'array' or jsonb_array_length(p_invites)>50 then
  raise exception 'Invalid invitations' using errcode='22023';
 end if;
 -- The kind of each item tells the host who is On Resbite, so invitations spend the same daily budget as lookups.
 perform private.charge_lookup(v_uid,jsonb_array_length(p_invites));
 for v_item in select value from jsonb_array_elements(p_invites) loop
  if jsonb_typeof(v_item) is distinct from 'object' or jsonb_typeof(v_item->'phone') is distinct from 'string'
   or jsonb_typeof(v_item->'country') is distinct from 'string' or jsonb_typeof(v_item->'code') is distinct from 'string' then
   raise exception 'Invalid invitation' using errcode='22023';
  end if;
  v_phone := private.phone_digits(v_item->>'phone');
  v_country := v_item->>'country';
  v_code := v_item->>'code';
  if v_phone !~ '^[1-9][0-9]{6,14}$' or v_country !~ '^[1-9][0-9]{0,2}$' or v_code !~ '^[A-Za-z0-9_-]{22}$' then
   raise exception 'Invalid invitation' using errcode='22023';
  end if;
  select id into v_holder from auth.users where phone=v_phone and phone_confirmed_at is not null;
  if v_holder=v_uid or (v_holder is null and v_phone=(select private.phone_digits(phone) from auth.users where id=v_uid)) then
   v_kind := 'self';
  elsif v_holder is not null and exists(select 1 from public.attendees where plan_id=p_plan and user_id=v_holder) then
   v_kind := 'already';
  elsif v_holder is not null and private.user_eligible(v_holder) and private.used_app(v_holder)
   and exists(select 1 from public.profiles where id=v_holder) then
   v_kind := 'app';
   insert into public.attendees(plan_id,user_id) values(p_plan,v_holder) on conflict do nothing;
   insert into private.notification_outbox(plan_id,recipient_id,kind,dedupe_key,actor_id)
    values(p_plan,v_holder,'invited','invited:'||p_plan||':'||v_holder,v_uid) on conflict do nothing;
   update private.phone_invitations set revoked_at=now(), code_hash=null
    where plan_id=p_plan and phone=v_phone and revoked_at is null;
  else
   v_kind := 'link';
   insert into private.phone_invitations(plan_id,phone,country,code_hash,invited_by)
    values(p_plan,v_phone,v_country,extensions.digest(v_code,'sha256'),v_uid)
    on conflict (plan_id,phone) do update set country=excluded.country, code_hash=excluded.code_hash, revoked_at=null,
     user_id=case when private.phone_invitations.revoked_at is null then private.phone_invitations.user_id end,
     answered_at=case when private.phone_invitations.revoked_at is null then private.phone_invitations.answered_at end;
  end if;
  v_out := v_out || jsonb_build_array(jsonb_build_object('phone',v_phone,'kind',v_kind));
 end loop;
 return v_out;
end $$;


create or replace function private.revoke_phone_invitation(p_plan uuid, p_phone text) returns void language plpgsql security definer set search_path = '' as $$
declare v_user uuid;
begin
 perform private.require_link_owner(p_plan);
 update private.phone_invitations set revoked_at=now(), code_hash=null
  where plan_id=p_plan and phone=private.phone_digits(p_phone) returning user_id into v_user;
 if v_user is not null then delete from public.attendees where plan_id=p_plan and user_id=v_user; end if;
end $$;


create or replace function private.check_invited_number(p_code text, p_phone text) returns boolean language plpgsql security definer set search_path = '' as $$
declare v_inv private.phone_invitations; v_count int;
begin
 if p_code is null or p_code !~ '^[A-Za-z0-9_-]{22}$' then return false; end if;
 select i.* into v_inv from private.phone_invitations i join public.plans p on p.id=i.plan_id
  where i.code_hash=extensions.digest(p_code,'sha256') and i.revoked_at is null
   and p.owner_id is not null and p.status='active' and p.starts_at>now();
 if not found then return false; end if;
 update private.phone_invitations set
  check_count=case when check_window is null or check_window<=now()-interval '1 hour' then 1 else check_count+1 end,
  check_window=case when check_window is null or check_window<=now()-interval '1 hour' then now() else check_window end
  where id=v_inv.id and (check_window is null or check_window<=now()-interval '1 hour' or check_count<10)
  returning check_count into v_count;
 if v_count is null then raise exception 'Too many tries. Try again later.' using errcode='22023'; end if;
 return private.phone_digits(p_phone)=v_inv.phone;
end $$;

create or replace function private.answer_phone_invitation(p_code text, p_name text, p_response text, p_terms_version text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_inv private.phone_invitations; v_plan public.plans; v_has_profile boolean; v_att public.attendees; v_next integer;
begin
 if v_uid is null then raise exception 'Sign-in required' using errcode='42501'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_uid::text,47));
 if p_code is null or p_code !~ '^[A-Za-z0-9_-]{22}$' then raise exception 'Invitation unavailable' using errcode='42501'; end if;
 select * into v_inv from private.phone_invitations where code_hash=extensions.digest(p_code,'sha256') and revoked_at is null;
 if not found then raise exception 'Invitation unavailable' using errcode='42501'; end if;
 if not exists(select 1 from auth.users u where u.id=v_uid and u.phone_confirmed_at is not null
  and private.phone_digits(u.phone)=v_inv.phone and not coalesce(u.is_anonymous,false)
  and (u.banned_until is null or u.banned_until<=now())) or private.deletion_pending(v_uid) then
  raise exception 'That isn''t the invited number.' using errcode='42501';
 end if;
 select * into v_plan from public.plans where id=v_inv.plan_id for update;
 if not found or v_plan.owner_id is null or v_plan.status<>'active' or v_plan.starts_at<=now() or v_plan.owner_id=v_uid
 or not private.user_eligible(v_plan.owner_id) then
  raise exception 'Invitation unavailable' using errcode='42501';
 end if;
 -- Read again under the plan lock: revoking an invitation takes the same lock through its owner checks.
 select * into v_inv from private.phone_invitations where id=v_inv.id and revoked_at is null;
 if not found then raise exception 'Invitation unavailable' using errcode='42501'; end if;
 if v_inv.user_id is not null and v_inv.user_id<>v_uid then raise exception 'Invitation unavailable' using errcode='42501'; end if;
 if exists(select 1 from private.beta_access where user_id=v_uid and revoked_at is not null) then
  raise exception 'Invitation unavailable' using errcode='42501';
 end if;
 if exists(select 1 from auth.users u where u.id=v_uid
  and exists(select 1 from private.tester_roster r where r.email = lower(u.email) and not r.enabled)) then
  raise exception 'Invitation unavailable' using errcode='42501';
 end if;
 if p_response is null or p_response not in ('accepted','maybe','declined') then raise exception 'Invalid response' using errcode='22023'; end if;
 if not exists(select 1 from private.age_attestations where user_id=v_uid) then
  if p_terms_version is null or p_terms_version !~ '^[0-9]{4}-[0-9]{2}$' then
   raise exception 'Age confirmation required' using errcode='22023';
  end if;
  insert into private.age_attestations(user_id,terms_version) values(v_uid,p_terms_version);
 end if;
 v_has_profile := exists(select 1 from public.profiles where id=v_uid);
 if not v_has_profile then
  if coalesce(char_length(btrim(p_name)),0) not between 1 and 80 then raise exception 'Name required' using errcode='22023'; end if;
  insert into public.profiles(id,display_name) values(v_uid,btrim(p_name));
 end if;
 insert into private.beta_access(user_id,source) values(v_uid,'invitation') on conflict (user_id) do nothing;
 select * into v_att from public.attendees where plan_id=v_plan.id and user_id=v_uid for update;
 if v_att.user_id is null then
  insert into public.attendees(plan_id,user_id,response) values(v_plan.id,v_uid,p_response) returning * into v_att;
 else
  -- The same answer again changes nothing, as respond.
  if v_att.response<>p_response then
   update public.attendees set response=p_response,version=version+1,updated_at=now()
    where plan_id=v_plan.id and user_id=v_uid returning * into v_att;
  else
   update private.phone_invitations set user_id=v_uid, answered_at=coalesce(answered_at,now()) where id=v_inv.id;
   return jsonb_build_object('response',p_response,'plan_id',v_plan.id);
  end if;
 end if;
 update private.phone_invitations set user_id=v_uid, answered_at=now() where id=v_inv.id;
 insert into private.notification_outbox(plan_id,recipient_id,kind,dedupe_key,actor_id,detail)
  values(v_plan.id,v_plan.owner_id,'rsvp','rsvp:'||v_plan.id||':'||v_uid||':'||v_att.version,v_uid,p_response) on conflict do nothing;
 return jsonb_build_object('response',p_response,'plan_id',v_plan.id);
end $$;

update auth.users u set phone = r.old_phone from private.phone_rewrites r where r.user_id = u.id and u.phone = r.new_phone;
do $$ begin
 if to_regclass('auth.identities') is not null then
  execute $x$ update auth.identities i set identity_data = jsonb_set(i.identity_data, '{phone}', to_jsonb(r.old_phone))
   from private.phone_rewrites r
   where i.user_id = r.user_id and i.provider = 'phone' and i.identity_data->>'phone' = r.new_phone $x$;
 end if;
end $$;
drop table private.phone_rewrites;

drop function private.phone_variants(text);
drop function private.phone_key(text);
