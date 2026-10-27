-- Contact invitations, host side (docs/superpowers/specs/2026-10-27-contact-invitations-design.md, plan
-- docs/superpowers/plans/2026-10-28-contact-invites.md, Task 1).
-- A host invites people from their phone contacts, each invitation tied to a phone number: people who are "On Resbite"
-- get an in-app invitation, everyone else a personal link whose code the database keeps only as a hash.
-- Hosted-compatible: depends only on the migrations listed in supabase/tests/hosted-baseline/migrations.txt plus
-- 20261027120000_phone_accounts.sql.
-- Rollback: supabase/rollback/20261028120000_contact_invitations.rollback.sql (added with the last part of this file's work).

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
