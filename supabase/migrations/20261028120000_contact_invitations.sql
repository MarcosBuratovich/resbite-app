-- Contact invitations, host side (docs/superpowers/specs/2026-10-27-contact-invitations-design.md, plan
-- docs/superpowers/plans/2026-10-28-contact-invites.md, Task 1).
-- A host invites people from their phone contacts, each invitation tied to a phone number: people who are "On Resbite"
-- get an in-app invitation, everyone else a personal link whose code the database keeps only as a hash.
-- Hosted-compatible: depends only on the migrations listed in supabase/tests/hosted-baseline/migrations.txt plus
-- 20261027120000_phone_accounts.sql.
-- Rollback: supabase/rollback/20261028120000_contact_invitations.rollback.sql.

-- One personal invitation per number per event. code_hash is sha256 of the 22-character code made on the host's phone;
-- the code itself is never stored. user_id/answered_at say who answered it. check_count/check_window limit wrong
-- phone checks on the invitation page.
create table private.phone_invitations (
 id uuid primary key default gen_random_uuid(),
 plan_id uuid not null references public.plans(id) on delete cascade,
 phone text not null check (phone ~ '^[1-9][0-9]{6,14}$'),
 country text not null check (country ~ '^[1-9][0-9]{0,2}$'),
 code_hash bytea unique,
 invited_by uuid not null,
 user_id uuid,
 answered_at timestamptz,
 created_at timestamptz not null default now(),
 revoked_at timestamptz,
 check_count int not null default 0,
 check_window timestamptz
);
create unique index phone_invitations_plan_phone_idx on private.phone_invitations(plan_id, phone);
alter table private.phone_invitations enable row level security;
revoke all on private.phone_invitations from public, anon, authenticated;

-- How many numbers each account has looked up today (UTC).
create table private.lookup_usage (
 user_id uuid primary key,
 day date not null,
 count int not null
);
alter table private.lookup_usage enable row level security;
revoke all on private.lookup_usage from public, anon, authenticated;

-- The outbox gets 'invited' (replaced by exact name, keeping every existing kind). Its detail check already allows no
-- detail for any kind but plan_changed and rsvp's own values, so an 'invited' row carries a null detail.
alter table private.notification_outbox drop constraint notification_outbox_kind_check;
alter table private.notification_outbox add constraint notification_outbox_kind_check
 check (kind in ('invitation','rsvp','plan_changed','plan_cancelled','guest_note','invited'));

-- A grant made by accepting an invitation.
alter table private.beta_access drop constraint beta_access_source_check,
 add constraint beta_access_source_check check (source in ('link','maintainer','invitation'));

-- The daily budget for finding out who is On Resbite: 500 numbers per caller per UTC day, shared by lookups and by
-- invitations. Over the limit is 22023 "Try again tomorrow." and nothing is charged. The caller's advisory lock (taken
-- by both users of this helper, as join_by_link does) makes the read and the write one step even where require_tester
-- takes no lock.
create function private.charge_lookup(p_uid uuid, p_count int) returns void language plpgsql security definer set search_path = '' as $$
declare v_today date := (now() at time zone 'utc')::date; v_used int;
begin
 select count into v_used from private.lookup_usage where user_id=p_uid and day=v_today;
 if coalesce(v_used,0)+p_count>500 then raise exception 'Try again tomorrow.' using errcode='22023'; end if;
 insert into private.lookup_usage(user_id,day,count) values(p_uid,v_today,p_count)
  on conflict (user_id) do update set day=excluded.day,
   count=case when private.lookup_usage.day=excluded.day then private.lookup_usage.count+excluded.count else excluded.count end;
end $$;
revoke all on function private.charge_lookup(uuid,int) from public, anon, authenticated, service_role;

-- Which of these numbers belong to people "On Resbite" (eligible and has used the app), never the caller. Returns their
-- digits. At most 50 numbers per call and 500 per caller per UTC day.
create function private.contacts_on_resbite(p_phones text[]) returns text[] language plpgsql security definer set search_path = '' as $$
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
   and private.user_eligible(u.id) and private.used_app(u.id)) s;
 return v_out;
end $$;

-- Invites up to 50 people to an event (each item is charged to the daily lookup budget). Each item is {phone, country, code}; the result has one {phone, kind} per item, in
-- order: 'self' (the host's own number), 'already' (the holder is on the event), 'app' (On Resbite: added as pending
-- with a notice) or 'link' (a personal invitation by number, its code stored as a hash; inviting again replaces the
-- code, brings back a revoked invitation and keeps who answered).
create function private.invite_contacts(p_plan uuid, p_invites jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
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
  else
   v_kind := 'link';
   insert into private.phone_invitations(plan_id,phone,country,code_hash,invited_by)
    values(p_plan,v_phone,v_country,extensions.digest(v_code,'sha256'),v_uid)
    on conflict (plan_id,phone) do update set country=excluded.country, code_hash=excluded.code_hash, revoked_at=null;
  end if;
  v_out := v_out || jsonb_build_array(jsonb_build_object('phone',v_phone,'kind',v_kind));
 end loop;
 return v_out;
end $$;

-- The host's list: [{phone, country, answered, response}] for invitations that are not revoked. response is the answer
-- of whoever answered, from their attendee row.
create function private.plan_phone_invitations(p_plan uuid) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := private.require_tester();
begin
 if not exists(select 1 from public.plans where id=p_plan and owner_id=v_uid) then raise exception 'Plan owner required' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('phone',i.phone,'country',i.country,'answered',i.answered_at is not null,
   'response',(select a.response from public.attendees a where a.plan_id=i.plan_id and a.user_id=i.user_id)) order by i.created_at,i.phone)
  from private.phone_invitations i where i.plan_id=p_plan and i.revoked_at is null),'[]'::jsonb);
end $$;

-- Turns one invitation off, and takes off the event whoever answered it.
create function private.revoke_phone_invitation(p_plan uuid, p_phone text) returns void language plpgsql security definer set search_path = '' as $$
declare v_user uuid;
begin
 perform private.require_link_owner(p_plan);
 update private.phone_invitations set revoked_at=now(), code_hash=null
  where plan_id=p_plan and phone=private.phone_digits(p_phone) returning user_id into v_user;
 if v_user is not null then delete from public.attendees where plan_id=p_plan and user_id=v_user; end if;
end $$;

-- Removes a guest from the event. The 20261021120000_gi1_event_links body; it now also turns off the guest's phone
-- invitation.
create or replace function private.remove_guest(p_plan uuid,p_user uuid) returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid;
begin
 v_uid := private.require_link_owner(p_plan);
 if p_user=v_uid then raise exception 'The organizer cannot be removed' using errcode='22023'; end if;
 update private.invitations set revoked_at=now() where plan_id=p_plan and claimed_by=p_user and revoked_at is null;
 update private.phone_invitations set revoked_at=now(), code_hash=null where plan_id=p_plan and user_id=p_user;
 delete from public.attendees where plan_id=p_plan and user_id=p_user;
end $$;

create function public.contacts_on_resbite(p_phones text[]) returns text[] language sql security invoker set search_path = '' as $$
 select private.contacts_on_resbite(p_phones)
$$;
create function public.invite_contacts(p_plan uuid, p_invites jsonb) returns jsonb language sql security invoker set search_path = '' as $$
 select private.invite_contacts(p_plan,p_invites)
$$;
create function public.plan_phone_invitations(p_plan uuid) returns jsonb language sql stable security invoker set search_path = '' as $$
 select private.plan_phone_invitations(p_plan)
$$;
create function public.revoke_phone_invitation(p_plan uuid, p_phone text) returns void language sql security invoker set search_path = '' as $$
 select private.revoke_phone_invitation(p_plan,p_phone)
$$;
revoke all on function private.contacts_on_resbite(text[]), public.contacts_on_resbite(text[]),
 private.invite_contacts(uuid,jsonb), public.invite_contacts(uuid,jsonb),
 private.plan_phone_invitations(uuid), public.plan_phone_invitations(uuid),
 private.revoke_phone_invitation(uuid,text), public.revoke_phone_invitation(uuid,text)
 from public, anon, authenticated, service_role;
grant execute on function private.contacts_on_resbite(text[]), public.contacts_on_resbite(text[]),
 private.invite_contacts(uuid,jsonb), public.invite_contacts(uuid,jsonb),
 private.plan_phone_invitations(uuid), public.plan_phone_invitations(uuid),
 private.revoke_phone_invitation(uuid,text), public.revoke_phone_invitation(uuid,text)
 to authenticated;

-- Invitee side (plan Task 2). The web page reads a personal invitation without a session, checks the typed number, signs
-- the person in with a phone code and records their answer.

-- The public read, as invitation_page: state, host, title, time, area, how many are going and which image. Plus the last
-- two digits of the invited number and its calling code, so the page can ask for the rest. Never the full number, the
-- exact place, Meeting details or guests' names. Unknown, malformed, revoked and ownerless are indistinguishable.
create function private.personal_invitation_page(p_code text) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_inv private.phone_invitations; v_plan public.plans; v_host text; v_going integer; v_state text;
begin
 if p_code is null or p_code !~ '^[A-Za-z0-9_-]{22}$' then return jsonb_build_object('state','inactive'); end if;
 select * into v_inv from private.phone_invitations where code_hash=extensions.digest(p_code,'sha256') and revoked_at is null;
 if not found then return jsonb_build_object('state','inactive'); end if;
 select * into v_plan from public.plans where id=v_inv.plan_id;
 if not found or v_plan.owner_id is null then return jsonb_build_object('state','inactive'); end if;
 select display_name into v_host from public.profiles where id=v_plan.owner_id;
 v_state := case when v_plan.status<>'active' then 'cancelled' when v_plan.starts_at<=now() then 'happened' else 'open' end;
 if v_state<>'open' then return jsonb_build_object('state',v_state,'host',v_host,'title',v_plan.title); end if;
 select count(*) into v_going from public.attendees where plan_id=v_plan.id and response='accepted';
 return jsonb_build_object('state','open','host',v_host,'title',v_plan.title,'starts_at',v_plan.starts_at,'ends_at',v_plan.ends_at,
  'time_zone',v_plan.time_zone,'area',v_plan.area,'going',v_going,
  'image',case when v_plan.cover_path is not null then jsonb_build_object('kind','cover','ref',v_plan.cover_path)
   when v_plan.activity_id is not null then jsonb_build_object('kind','activity','ref',v_plan.activity_id)
   else jsonb_build_object('kind','mark','ref','') end,
  'ending',right(v_inv.phone,2),'country',v_inv.country);
end $$;
create function public.personal_invitation_page(p_code text) returns jsonb language sql stable security definer set search_path = '' as $$
 select private.personal_invitation_page(p_code)
$$;

-- Does the typed number match the invited one? True or false only, for a live open invitation; 10 checks per invitation
-- per hour (the count is a single update, so concurrent calls queue on the row).
create function private.check_invited_number(p_code text, p_phone text) returns boolean language plpgsql security definer set search_path = '' as $$
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
create function public.check_invited_number(p_code text, p_phone text) returns boolean language sql security definer set search_path = '' as $$
 select private.check_invited_number(p_code,p_phone)
$$;

-- Records the answer of the person who signed in with the invited number. In order: the caller's lock, the invitation,
-- the caller's confirmed number, the event, the invitation's owner, a ban, the answer, the age tick, the name, the grant,
-- the attendee row, the invitation's answer and a notice to the host (as respond does).
create function private.answer_phone_invitation(p_code text, p_name text, p_response text, p_terms_version text) returns jsonb
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

-- The page, plus the caller's own answer when they are attached to it.
create function private.my_phone_invitation(p_code text) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_page jsonb := private.personal_invitation_page(p_code); v_resp text;
begin
 if v_uid is null then raise exception 'Sign-in required' using errcode='42501'; end if;
 select a.response into v_resp from private.phone_invitations i join public.attendees a on a.plan_id=i.plan_id and a.user_id=i.user_id
  where i.code_hash=extensions.digest(p_code,'sha256') and i.revoked_at is null and i.user_id=v_uid;
 return v_page || jsonb_build_object('response',v_resp);
end $$;

create function public.answer_phone_invitation(p_code text, p_name text, p_response text, p_terms_version text) returns jsonb language sql security invoker set search_path = '' as $$
 select private.answer_phone_invitation(p_code,p_name,p_response,p_terms_version)
$$;
create function public.my_phone_invitation(p_code text) returns jsonb language sql stable security invoker set search_path = '' as $$
 select private.my_phone_invitation(p_code)
$$;
revoke all on function private.personal_invitation_page(text), public.personal_invitation_page(text),
 private.check_invited_number(text,text), public.check_invited_number(text,text),
 private.answer_phone_invitation(text,text,text,text), public.answer_phone_invitation(text,text,text,text),
 private.my_phone_invitation(text), public.my_phone_invitation(text)
 from public, anon, authenticated, service_role;
grant execute on function private.personal_invitation_page(text), public.personal_invitation_page(text),
 private.check_invited_number(text,text), public.check_invited_number(text,text) to anon, authenticated;
grant execute on function private.answer_phone_invitation(text,text,text,text), public.answer_phone_invitation(text,text,text,text),
 private.my_phone_invitation(text), public.my_phone_invitation(text) to authenticated;

-- Folding (plan Task 3). An account that adds a number already held by a web-only account (one that answered on the
-- web and never used the app) takes that account's answers, invitations, 18+ tick and grant (never a live grant when
-- its tester-roster entry is disabled); what doesn't move is deleted, and the fold-phone-account Edge Function then
-- deletes the web-only user. Refuses (22023) the same account on both sides, an account that has used the app or
-- organizes an event, and a target that doesn't exist. A source already folded or deleted moves nothing, so a retry is
-- safe. Both users' locks are taken in uuid order before any row.
create function private.fold_web_account(p_from uuid, p_into uuid) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_moved integer; v_disabled boolean;
begin
 if p_from is null or p_into is null or p_from=p_into then raise exception 'Invalid accounts' using errcode='22023'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(least(p_from,p_into)::text,47));
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(greatest(p_from,p_into)::text,47));
 if not exists(select 1 from auth.users where id=p_into) then raise exception 'Unknown account' using errcode='22023'; end if;
 if private.used_app(p_from) then raise exception 'The account has used the app' using errcode='22023'; end if;
 if exists(select 1 from public.plans where owner_id=p_from) then raise exception 'The account organizes events' using errcode='22023'; end if;
 -- Add your number comes before About you, so the account may have no profile yet: it takes the name given on the web.
 insert into public.profiles(id,display_name) select p_into, display_name from public.profiles where id=p_from
  on conflict (id) do nothing;
 -- 1. Places: where the account is already on the event, or organizes it, its own place stays and the web one goes.
 delete from public.attendees f where f.user_id=p_from
  and (exists(select 1 from public.attendees t where t.plan_id=f.plan_id and t.user_id=p_into)
   or exists(select 1 from public.plans p where p.id=f.plan_id and p.owner_id=p_into));
 update public.attendees set user_id=p_into where user_id=p_from;
 get diagnostics v_moved = row_count;
 -- 2. Invitations.
 update private.phone_invitations set user_id=p_into where user_id=p_from;
 -- 3. The tick and the grant, unless the account has its own. A revoked grant is a ban: one on either side stays. An
 -- account whose tester-roster entry is disabled gets no live grant, as join_by_link and answer_phone_invitation.
 v_disabled := exists(select 1 from auth.users u where u.id=p_into
  and exists(select 1 from private.tester_roster r where r.email = lower(u.email) and not r.enabled));
 if not exists(select 1 from private.age_attestations where user_id=p_into) then
  update private.age_attestations set user_id=p_into where user_id=p_from;
 end if;
 if not exists(select 1 from private.beta_access where user_id=p_into) then
  update private.beta_access set user_id=p_into where user_id=p_from and (revoked_at is not null or not v_disabled);
 else
  update private.beta_access t set revoked_at=f.revoked_at from private.beta_access f
   where t.user_id=p_into and t.revoked_at is null and f.user_id=p_from and f.revoked_at is not null;
 end if;
 -- What didn't move goes, so a fold whose user deletion then fails leaves no second account that gets in.
 delete from private.beta_access where user_id=p_from;
 delete from private.age_attestations where user_id=p_from;
 -- 4. The web profile.
 delete from public.profiles where id=p_from;
 return jsonb_build_object('moved_attendees',v_moved);
end $$;
-- The Edge Function calls this through REST with the service-role key, which has no use of the private schema on the
-- hosted project, so it is the definer, as invitation_page is for anon. Only the service role may call it; no one may
-- call the private body.
create function public.fold_web_account(p_from uuid, p_into uuid) returns jsonb language sql security definer set search_path = '' as $$
 select private.fold_web_account(p_from,p_into)
$$;
revoke all on function private.fold_web_account(uuid,uuid), public.fold_web_account(uuid,uuid)
 from public, anon, authenticated, service_role;
grant execute on function public.fold_web_account(uuid,uuid) to service_role;
