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

-- 3. The invitation functions compare by key
-- Same bodies as 20261028120000_contact_invitations.sql; only the phone comparisons change. create or replace keeps the
-- signatures and grants, and the public facades stay as they are. Invitations are stored by key; a person is found
-- under either spelling of their number (private.phone_variants), the one equal to the key first.
-- Other comparisons of auth.users.phone / phone_invitations.phone in the live migrations (20261027120000_phone_accounts,
-- 20261028120000_contact_invitations, 20261029120000_open_link_approval, 20261030120000_push_delivery):
--  - send_sms_hook, exchange_test_code (phone_accounts): redefined in section 2 above.
--  - contacts_on_resbite, invite_contacts, revoke_phone_invitation, check_invited_number, answer_phone_invitation
--    (contact_invitations): redefined here.
--  - personal_invitation_page: right(phone,2) only shows the last two digits; not a comparison.
--  - plan_phone_invitations: reads the stored key; not a comparison.
--  - my_phone_invitation: reads by user_id; not a comparison.
--  - fold_web_account: moves user_id on invitations; not a comparison.
--  - open_link_approval's guest list: right(u.phone,2) shows the last two digits of an account; not a comparison.
--  - private.phone_digits (phone_accounts) only defines the digits helper; push_delivery has no phone comparisons.

-- Returns the keys of the sent numbers that belong to people On Resbite (sorted, distinct), not the accounts' digits.
create or replace function private.contacts_on_resbite(p_phones text[]) returns text[] language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_tester(); v_n int := coalesce(cardinality(p_phones),0); v_out text[];
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_uid::text,47));
 if v_n>50 then raise exception 'Too many numbers' using errcode='22023'; end if;
 if v_n=0 then return array[]::text[]; end if;
 perform private.charge_lookup(v_uid,v_n);
 select coalesce(array_agg(d order by d),array[]::text[]) into v_out from (
  select distinct k as d from (select private.phone_key(x) as k from unnest(p_phones) x) s
  where k<>'' and exists(select 1 from auth.users u where u.phone = any(private.phone_variants(s.k))
   and u.phone_confirmed_at is not null and u.id<>v_uid
   and private.user_eligible(u.id) and private.used_app(u.id)
   and exists(select 1 from public.profiles p where p.id=u.id))) t;
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
  v_phone := private.phone_key(v_item->>'phone');
  v_country := v_item->>'country';
  v_code := v_item->>'code';
  if v_phone !~ '^[1-9][0-9]{6,14}$' or v_country !~ '^[1-9][0-9]{0,2}$' or v_code !~ '^[A-Za-z0-9_-]{22}$' then
   raise exception 'Invalid invitation' using errcode='22023';
  end if;
  select id into v_holder from auth.users where phone = any(private.phone_variants(v_phone)) and phone_confirmed_at is not null
   order by phone=v_phone desc limit 1;
  if v_holder=v_uid or (v_holder is null and v_phone=(select private.phone_key(phone) from auth.users where id=v_uid)) then
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
  where plan_id=p_plan and phone=private.phone_key(p_phone) returning user_id into v_user;
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
 return private.phone_key(p_phone)=v_inv.phone;
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
  and private.phone_key(u.phone)=v_inv.phone and not coalesce(u.is_anonymous,false)
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

-- 4. Existing rows
-- Invitations: where one plan holds the same number in two spellings, keep the answered one, then the live one, then the
-- newest, and delete the rest; then store every invitation by key.
delete from private.phone_invitations where id in (
 select id from (
  select id, row_number() over (partition by plan_id, private.phone_key(phone)
   order by user_id is not null desc, revoked_at is null desc, created_at desc, id) rn
  from private.phone_invitations) d
 where rn > 1);
update private.phone_invitations set phone = private.phone_key(phone) where phone <> private.phone_key(phone);

-- Test-mode codes were stored by the old digits and live ten minutes; drop them.
delete from private.test_codes;

-- Accounts: an older Argentine number (54 and ten digits) becomes its 549 form unless another account already holds
-- that form (those pairs stay as they are). The rewrites are recorded so the rollback can put the numbers back.
create table private.phone_rewrites (
 user_id uuid primary key,
 old_phone text not null,
 new_phone text not null,
 rewritten_at timestamptz not null default now()
);
alter table private.phone_rewrites enable row level security;
revoke all on private.phone_rewrites from public, anon, authenticated;
insert into private.phone_rewrites(user_id, old_phone, new_phone)
 select u.id, u.phone, '549' || substr(u.phone, 3) from auth.users u
 where u.phone ~ '^54[0-9]{10}$'
  and not exists(select 1 from auth.users v where v.phone = '549' || substr(u.phone, 3));
update auth.users u set phone = r.new_phone from private.phone_rewrites r where r.user_id = u.id;
update auth.users set phone_change = '549' || substr(phone_change, 3)
 where phone_change ~ '^54[0-9]{10}$'
  and not exists(select 1 from auth.users v where v.phone = '549' || substr(auth.users.phone_change, 3));
-- The hosted project also keeps the number in the phone identity; the local harness has no identities table.
do $$ begin
 if to_regclass('auth.identities') is not null then
  execute $x$ update auth.identities i set identity_data = jsonb_set(i.identity_data, '{phone}', to_jsonb(r.new_phone))
   from private.phone_rewrites r
   where i.user_id = r.user_id and i.provider = 'phone' and i.identity_data->>'phone' = r.old_phone $x$;
 end if;
end $$;
