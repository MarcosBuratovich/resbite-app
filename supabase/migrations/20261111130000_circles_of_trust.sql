-- Circles of trust: a host lets each guest bring people, a trusted guest brings a connection or a phone contact who
-- joins without approval, and a person the host removed is not brought straight back.
-- Spec: docs/superpowers/specs/2026-11-10-connections-and-circles-design.md (CO-D4, CO-D5, CO-D7, CO-P7–P13, CO-P15)
-- Plan: docs/superpowers/plans/2026-11-10-connections-2-circles-of-trust.md (Task 1)
-- Hosted-compatible: depends only on the migrations in supabase/tests/hosted-baseline/migrations.txt and
-- 20261111120000_connections_follow_ups.sql, whose roll it copies.
-- Rollback: supabase/rollback/20261111130000_circles_of_trust.rollback.sql
--
-- Levels (CO-P8): hosts (the owner and the admins) are level 0 by role and never bring through the circle: they invite.
-- Everyone a host invited, approved through the link, or claimed a per-person link is level 1 (the column defaults);
-- someone brought by a level-n guest is level n+1. A guest may bring while the resbite is open, they are Going or
-- Maybe, the host gave invites (bring_invites > 0) and their level is within bring_levels; each person they bring
-- uses one of their invites while that person is pending, Going or Maybe, or holds an unanswered link (CO-P10).
-- The circle is checked once, when the invitation is sent (CO-P15): answering never looks at it.

-- 1. The circle on the resbite (CO-D4, CO-P7): how many people each guest may bring (0, "Nobody", to 3) and how far it
-- goes (1 to 3 levels). Read through plan_read like every plans column; written only by set_plan_circle, copied by the
-- roll (CO-P12).
alter table public.plans
 add column bring_invites smallint not null default 0 check (bring_invites between 0 and 3),
 add column bring_levels smallint not null default 1 check (bring_levels between 1 and 3);

-- 2. Who brought whom. brought_by points at auth.users, never at public.profiles: a second foreign key from attendees to
-- profiles would make PostgREST refuse the profiles(display_name) embeds of every installed build (PGRST201). When the
-- account itself goes it becomes null; the deletion lifecycle clears it earlier, when the deletion is asked for
-- (section 6). On phone_invitations brought_by is the bringer, set when the link is sent (null for a host's link), and
-- level is the level its answerer gets: 1 for a host's link, the bringer's level + 1 for a guest's (this overrides the
-- design's default 2). Every row there today is a host's: level 1, no bringer.
alter table public.attendees
 add column brought_by uuid null references auth.users(id) on delete set null,
 add column level smallint not null default 1 check (level between 1 and 4);
create index attendees_brought_by_idx on public.attendees(brought_by) where brought_by is not null;
alter table private.phone_invitations
 add column brought_by uuid null references auth.users(id) on delete set null,
 add column level smallint not null default 1 check (level between 1 and 4);
create index phone_invitations_brought_by_idx on private.phone_invitations(brought_by) where brought_by is not null;

-- 3. Removals (C-R2): per series, whom a host removed (remove_guest), declined (decide_join_request) or whose link a host
-- revoked (revoke_phone_invitation, revoke_brought_invitation). A guest cannot bring them back to the series, by
-- connection or by number, and no link lets them back (answer_phone_invitation), until a host invites them again or
-- approves their request, which clears the record (invite_contacts, decide_join_request). A web account's records
-- follow the person into the app (fold_web_account). One row per key: a writer with a user and a number writes a user
-- row and a number row, each upserted on its own index. The database's own: RLS on, no policy, no grant.
create table private.plan_removals (
 series_id uuid not null,
 user_id uuid null references auth.users(id) on delete cascade,
 phone text null check (phone ~ '^[1-9][0-9]{6,14}$'),
 removed_at timestamptz not null default now(),
 check (user_id is not null or phone is not null)
);
create unique index plan_removals_series_user_idx on private.plan_removals(series_id, user_id) where user_id is not null;
create unique index plan_removals_series_phone_idx on private.plan_removals(series_id, phone) where phone is not null;
create index plan_removals_user_idx on private.plan_removals(user_id) where user_id is not null;
alter table private.plan_removals enable row level security;
revoke all on private.plan_removals from public, anon, authenticated, service_role;

-- 4. The new functions

-- Setting the circle (CO-P7): a host of an open resbite (require_link_owner, 42501 'Active plan owner required'
-- otherwise), with invites 0–3 and levels 1–3 (22023 'Invalid circle', nulls too). Lowering it later removes nobody
-- and stops only new bringing (CO-P11, CO-P15). It bumps the version, so an Edit open at the same moment gets its
-- usual 40001 'Plan changed; refresh', and tells nobody. Returns the new version.
create function private.set_plan_circle(p_plan uuid, p_invites smallint, p_levels smallint) returns integer
language plpgsql security definer set search_path = '' as $$
declare v_next integer;
begin
 perform private.require_link_owner(p_plan);
 if p_invites is null or p_levels is null or p_invites not between 0 and 3 or p_levels not between 1 and 3 then
  raise exception 'Invalid circle' using errcode='22023';
 end if;
 update public.plans set bring_invites=p_invites, bring_levels=p_levels, version=version+1 where id=p_plan returning version into v_next;
 return v_next;
end $$;
create function public.set_plan_circle(p_plan uuid, p_invites smallint, p_levels smallint) returns integer
language sql security invoker set search_path = '' as $$
 select private.set_plan_circle(p_plan,p_invites,p_levels)
$$;

-- What p_user may bring on p_plan (CO-P8, CO-P10). A host: nothing, level 0. Someone with no guest row: nothing, no
-- level. Otherwise allowed is the plan's bring_invites and level the guest row's; used counts the guest rows on the
-- plan they brought that are pending, Going or Maybe, and their unanswered, unrevoked links; remaining is what is left,
-- never below 0 (a series can carry more than allowed, CO-P12). may_bring is the gate without the count: an open
-- resbite, the guest Going or Maybe, invites given and the guest's level within the levels. The database's own: no API
-- role may call it (invite_contacts and my_bring_allowance are definers).
create function private.bring_allowance(p_plan uuid, p_user uuid)
returns table (allowed smallint, used smallint, remaining smallint, level smallint, may_bring boolean)
language plpgsql stable security definer set search_path = '' as $$
declare v_plan public.plans; v_att public.attendees; v_used integer;
begin
 if private.is_host(p_plan,p_user) then
  return query select 0::smallint, 0::smallint, 0::smallint, 0::smallint, false;
  return;
 end if;
 select * into v_att from public.attendees a where a.plan_id=p_plan and a.user_id=p_user;
 if not found then
  return query select 0::smallint, 0::smallint, 0::smallint, null::smallint, false;
  return;
 end if;
 select * into v_plan from public.plans p where p.id=p_plan;
 v_used := (select count(*) from public.attendees a where a.plan_id=p_plan and a.brought_by=p_user and a.response in ('pending','accepted','maybe'))
  + (select count(*) from private.phone_invitations i where i.plan_id=p_plan and i.brought_by=p_user and i.revoked_at is null and i.answered_at is null);
 return query select v_plan.bring_invites, v_used::smallint, greatest(v_plan.bring_invites-v_used,0)::smallint, v_att.level,
  v_plan.status='active' and private.plan_end(v_plan.starts_at,v_plan.ends_at)>now() and v_att.response in ('accepted','maybe')
  and v_plan.bring_invites>0 and v_att.level<=v_plan.bring_levels;
end $$;

-- The caller's allowance, for the "Bring someone" row and bring mode: {allowed, used, remaining, level, may_bring}.
-- Someone who is neither a host nor on the resbite is refused (42501 'Not invited').
create function private.my_bring_allowance(p_plan uuid) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := private.require_tester(); v_row record;
begin
 if not (private.is_host(p_plan,v_uid) or exists(select 1 from public.attendees a where a.plan_id=p_plan and a.user_id=v_uid)) then
  raise exception 'Not invited' using errcode='42501';
 end if;
 select * into v_row from private.bring_allowance(p_plan,v_uid);
 return jsonb_build_object('allowed',v_row.allowed,'used',v_row.used,'remaining',v_row.remaining,'level',v_row.level,'may_bring',v_row.may_bring);
end $$;
create function public.my_bring_allowance(p_plan uuid) returns jsonb language sql stable security invoker set search_path = '' as $$
 select private.my_bring_allowance(p_plan)
$$;

-- A host's view of the links guests sent (finding 8): one per live, unanswered link of a level above 1, oldest first,
-- as {id, ending, country, brought_by_name}. ending is the number's last two digits; the number itself is never
-- returned. brought_by_name is the bringer's first name, left out when there is no bringer or their account is being
-- deleted. A host removes one by its id (revoke_brought_invitation). Hosts only (42501 'Plan owner required'), also
-- after the end, as plan_phone_invitations.
create function private.plan_brought_invitations(p_plan uuid) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := private.require_tester();
begin
 if not private.is_host(p_plan,v_uid) then raise exception 'Plan owner required' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'ending',right(i.phone,2),'country',i.country)
   || coalesce((select jsonb_build_object('brought_by_name',split_part(btrim(pr.display_name),' ',1)) from public.profiles pr
     where pr.id=i.brought_by and not private.deletion_pending(pr.id)),'{}'::jsonb) order by i.created_at,i.id)
  from private.phone_invitations i where i.plan_id=p_plan and i.revoked_at is null and i.answered_at is null and i.level>1),'[]'::jsonb);
end $$;
create function public.plan_brought_invitations(p_plan uuid) returns jsonb language sql stable security invoker set search_path = '' as $$
 select private.plan_brought_invitations(p_plan)
$$;

-- A host removes a guest's link by its id: a link of p_plan above level 1 is revoked as revoke_phone_invitation revokes
-- one (its answerer, if any, leaves the resbite and any admin role), and the removal is recorded (the number, and the
-- person when it was answered). Any other id is a quiet no-op. A host of an open resbite only (require_link_owner).
create function private.revoke_brought_invitation(p_plan uuid, p_invitation uuid) returns void language plpgsql security definer set search_path = '' as $$
declare v_user uuid; v_phone text; v_series uuid;
begin
 perform private.require_link_owner(p_plan);
 update private.phone_invitations set revoked_at=now(), code_hash=null
  where id=p_invitation and plan_id=p_plan and level>1 returning user_id, phone into v_user, v_phone;
 if not found then return; end if;
 if v_user is not null then
  delete from public.plan_admins where plan_id=p_plan and user_id=v_user;
  delete from public.attendees where plan_id=p_plan and user_id=v_user;
 end if;
 select series_id into v_series from public.plans where id=p_plan;
 insert into private.plan_removals(series_id,phone) values(v_series,v_phone)
  on conflict (series_id,phone) where phone is not null do update set removed_at=excluded.removed_at;
 if v_user is not null then
  insert into private.plan_removals(series_id,user_id) values(v_series,v_user)
   on conflict (series_id,user_id) where user_id is not null do update set removed_at=excluded.removed_at;
 end if;
end $$;
create function public.revoke_brought_invitation(p_plan uuid, p_invitation uuid) returns void language sql security invoker set search_path = '' as $$
 select private.revoke_brought_invitation(p_plan,p_invitation)
$$;

-- A bringer takes back an in-app invitation nobody has answered (CO-P10): their own pending guest row (brought by the
-- caller, still pending) on an open resbite is deleted, under the plan's lock. Its unsent invitation notice then fails
-- eligibility (no guest row). Nothing is recorded: the bringer is not a host. Only a bringer who is on the resbite
-- (has a guest row) may, and only someone they brought for this occurrence (C18-I1): never a host (an admin the roll
-- carried, not yet answered), and never someone the roll carried from the occurrence before (only a host takes a
-- regular of the series off). Someone with no such row is refused before the plan's row is locked (a stranger never
-- waits for it). Anything else is 42501 'Not your invitation'.
create function private.withdraw_brought_invitation(p_plan uuid, p_user uuid) returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_tester(); v_plan public.plans;
begin
 if exists(select 1 from public.attendees a where a.plan_id=p_plan and a.user_id=v_uid)
  and exists(select 1 from public.attendees a where a.plan_id=p_plan and a.user_id=p_user and a.brought_by=v_uid and a.response='pending') then
  select * into v_plan from public.plans where id=p_plan for update;
  -- Read again under the lock.
  if v_plan.status='active' and private.plan_end(v_plan.starts_at,v_plan.ends_at)>now()
   and exists(select 1 from public.attendees a where a.plan_id=p_plan and a.user_id=v_uid)
   and not private.is_host(p_plan,p_user)
   and not exists(select 1 from public.attendees a where a.plan_id=v_plan.repeats_from and a.user_id=p_user) then
   delete from public.attendees where plan_id=p_plan and user_id=p_user and brought_by=v_uid and response='pending';
   if found then return; end if;
  end if;
 end if;
 raise exception 'Not your invitation' using errcode='42501';
end $$;
create function public.withdraw_brought_invitation(p_plan uuid, p_user uuid) returns void language sql security invoker set search_path = '' as $$
 select private.withdraw_brought_invitation(p_plan,p_user)
$$;

-- The bringers' first names, for the chain on the people list (CO-P11, C-R7): {"<bringer id>": "<first name>"} for each
-- account that brought someone whose guest row is on p_plan, whether or not the bringer is still on it, leaving out
-- an account being deleted (rule 10: the display then says nothing). Only for someone who may see the names
-- (can_see_guests: a host, or a guest who has answered), else 42501 'Names required'.
create function private.plan_bringers(p_plan uuid) returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
 if not private.can_see_guests(p_plan) then raise exception 'Names required' using errcode='42501'; end if;
 return coalesce((select jsonb_object_agg(pr.id::text,split_part(btrim(pr.display_name),' ',1)) from public.profiles pr
  where pr.id in (select a.brought_by from public.attendees a where a.plan_id=p_plan and a.brought_by is not null)
   and not private.deletion_pending(pr.id)),'{}'::jsonb);
end $$;
create function public.plan_bringers(p_plan uuid) returns jsonb language sql stable security invoker set search_path = '' as $$
 select private.plan_bringers(p_plan)
$$;

-- 5. The redefined functions. Each keeps its signature, its grants and its public wrapper (create or replace).

-- Inviting and bringing (CO-P9, CO-P10, rule 6, C-R2, C-R3). The 20261110120000_connections body, with a branch for a
-- caller who is not a host: a guest whose allowance says may_bring brings people, who join without approval.
--
-- Opening. A host (private.is_host) goes through require_link_owner as today, so a host of an ended resbite still gets
-- 'Active plan owner required'. Anyone else must have a guest row on the resbite, checked before its row is locked
-- (someone not on it never waits for the row), else 42501 'Not allowed to bring people here'. They then take the
-- plan's row (for update) and only then read the allowance, so a circle lowered at the same moment (set_plan_circle
-- holds the same row) is seen. The resbite must be open (not cancelled, not ended) and the guest still on it, else the
-- same 42501. A guest who may not bring (not may_bring) may still send their own live links again (C19, CO-P15: a sent
-- invitation stands, and the app's Send again makes a new code), and nothing else: any other item, and any item by
-- user (an in-app invitation, never a link sent again), refuses the whole call with that 42501. Then both branches take the caller's advisory lock and charge the lookup budget (numbers only),
-- as today.
-- Lock order: in both branches the plan's row, then the caller's advisory lock (locally require_tester takes that lock
-- first, before either). Two functions take them the other way round, so on the hosted project, where require_tester
-- takes no lock, each can deadlock (40P01) with a bringing at the same instant. answer_phone_invitation takes the
-- answerer's advisory lock, then the plan's row: the same account bringing and answering on one resbite at once.
-- decide_join_request takes the advisory locks of the host and of the requester, then the plan's row (require_link_owner):
-- a host deciding a request of a guest who is bringing someone on that resbite at that moment (the guest has a guest row
-- and a waiting request, from before the host's door was kept from guests). Accepted: both improbable, a retry works,
-- and hosts could already do the first.
--
-- What is written. A guest's new guest rows and links are brought_by the caller at the caller's level + 1; a host's
-- have no bringer and level 1. Every link created or reopened has invited_by the caller.
--
-- A guest's items. 'self' and 'already' (the person is the owner or has a guest row) are as today and cost nothing.
-- Then, in this order, for the person (a {user}, or the holder of a number) and the number (the item's, or the
-- {user}'s confirmed number):
--  1. a removal on record for the series, of the person or the number, or a request to join this resbite from the
--     person that is waiting for the host (CO-D6: the open link is the host's door): the whole call is refused, 42501
--     'Not allowed to bring people here';
--  2. a live link to the number that is not the caller's (a host's, or another bringer's): 'already', nothing written;
--  3. the caller's own live link: sent again, at no cost: a link takes the item's new code (the app sends the code it
--     has just made), an in-app outcome revokes the link and adds the pending row;
--  4. otherwise (a revoked link, or none): new, and counted; a reopened link takes invited_by, brought_by and level
--     from this invitation, and comes back fresh, created now (C21 counts a host's link from its creation).
-- New items are counted as they come; one more than remaining is 22023 'No invites left', which undoes the whole batch.
--
-- A host's items, as today, plus: a link makes the row the host's (no bringer, level 1, whoever sent it before, since
-- the host's code is now the live one; invited_by the host, and created now, when the old link was revoked: a link
-- sent again while live keeps its creation time, so it is still the link from before a removal); an in-app outcome, {user}
-- included, revokes every live link on the person's number, a bringer's included, which frees that bringer's invite
-- (a number's holder is found by the number's key, so the item's key is the holder's); and an 'app' or 'link' item
-- clears the series' removal records of that person and number.
create or replace function private.invite_contacts(p_plan uuid, p_invites jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_tester(); v_host boolean; v_item jsonb; v_phone text; v_country text; v_code text; v_holder uuid;
 v_kind text; v_out jsonb := '[]'::jsonb; v_user uuid; v_series uuid; v_brought uuid; v_level smallint := 1; v_may boolean;
 v_remaining integer := 0; v_new integer := 0; v_key text; v_live private.phone_invitations; v_open boolean; v_on boolean;
begin
 v_host := private.is_host(p_plan,v_uid);
 if v_host then
  perform private.require_link_owner(p_plan);
 else
  -- Only someone on the resbite gets as far as its row's lock.
  if not exists(select 1 from public.attendees a where a.plan_id=p_plan and a.user_id=v_uid) then
   raise exception 'Not allowed to bring people here' using errcode='42501';
  end if;
  -- The plan's row first, then the allowance.
  select p.status='active' and private.plan_end(p.starts_at,p.ends_at)>now() into v_open from public.plans p where p.id=p_plan for update;
  select a.may_bring, a.level+1, a.remaining, a.level is not null into v_may, v_level, v_remaining, v_on
   from private.bring_allowance(p_plan,v_uid) a;
  if not coalesce(v_open,false) or not coalesce(v_on,false) then
   raise exception 'Not allowed to bring people here' using errcode='42501';
  end if;
  v_may := coalesce(v_may,false);
  v_brought := v_uid;
 end if;
 select series_id into v_series from public.plans where id=p_plan;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_uid::text,47));
 if jsonb_typeof(p_invites) is distinct from 'array' or jsonb_array_length(p_invites)>50 then
  raise exception 'Invalid invitations' using errcode='22023';
 end if;
 -- The kind of each item tells the host who is On Resbite, so invitations spend the same daily budget as lookups: the
 -- numbers only, as an item by user looks nothing up.
 perform private.charge_lookup(v_uid,(select count(*)::int from jsonb_array_elements(p_invites) e
  where jsonb_typeof(e.value->'user') is distinct from 'string'));
 for v_item in select value from jsonb_array_elements(p_invites) loop
  if jsonb_typeof(v_item->'user')='string' then
   -- A guest who may not bring sends no in-app invitation.
   if not v_host and not v_may then raise exception 'Not allowed to bring people here' using errcode='42501'; end if;
   if v_item->>'user' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'Invalid invitation' using errcode='22023';
   end if;
   v_user := (v_item->>'user')::uuid;
   -- The pair's row is held while the invitation is made: a removal at the same moment goes first or waits.
   perform 1 from public.connections where (user_a,user_b)=(least(v_uid,v_user),greatest(v_uid,v_user)) and state='connected' for share;
   if not found or not private.user_eligible(v_user) or private.deletion_pending(v_user) then
    raise exception 'Not a connection' using errcode='42501';
   end if;
   -- The person's confirmed number: the links to it are invitations of this person.
   v_key := (select nullif(private.phone_key(u.phone),'') from auth.users u where u.id=v_user and u.phone_confirmed_at is not null);
   if v_user=(select owner_id from public.plans where id=p_plan)
    or exists(select 1 from public.attendees where plan_id=p_plan and user_id=v_user) then
    v_kind := 'already';
   else
    if not v_host then
     if exists(select 1 from private.plan_removals r where r.series_id=v_series and (r.user_id=v_user or r.phone=v_key))
      or exists(select 1 from private.join_requests j where j.plan_id=p_plan and j.user_id=v_user and j.status='waiting') then
      raise exception 'Not allowed to bring people here' using errcode='42501';
     end if;
     select * into v_live from private.phone_invitations where plan_id=p_plan and phone=v_key and revoked_at is null;
    end if;
    if not v_host and v_live.id is not null and v_live.brought_by is distinct from v_uid then
     v_kind := 'already';
    else
     if not v_host and v_live.id is null then
      v_new := v_new+1;
      if v_new>v_remaining then raise exception 'No invites left' using errcode='22023'; end if;
     end if;
     v_kind := 'app';
     insert into public.attendees(plan_id,user_id,brought_by,level) values(p_plan,v_user,v_brought,v_level) on conflict do nothing;
     insert into private.notification_outbox(plan_id,recipient_id,kind,dedupe_key,actor_id)
      values(p_plan,v_user,'invited','invited:'||p_plan||':'||v_user,v_uid) on conflict do nothing;
     update private.phone_invitations set revoked_at=now(), code_hash=null
      where plan_id=p_plan and phone=v_key and revoked_at is null;
     if v_host then
      delete from private.plan_removals where series_id=v_series and (user_id=v_user or phone=v_key);
     end if;
    end if;
   end if;
   v_out := v_out || jsonb_build_array(jsonb_build_object('user',v_user,'kind',v_kind));
   continue;
  end if;
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
   order by id = v_uid desc, phone <> v_phone desc limit 1;
  if v_holder=v_uid or (v_holder is null and v_phone=(select private.phone_key(phone) from auth.users where id=v_uid)) then
   v_kind := 'self';
  elsif v_holder is not null and (v_holder=(select owner_id from public.plans where id=p_plan)
   or exists(select 1 from public.attendees where plan_id=p_plan and user_id=v_holder)) then
   v_kind := 'already';
  else
   if not v_host then
    if exists(select 1 from private.plan_removals r where r.series_id=v_series and (r.phone=v_phone or r.user_id=v_holder))
     or exists(select 1 from private.join_requests j where j.plan_id=p_plan and j.user_id=v_holder and j.status='waiting') then
     raise exception 'Not allowed to bring people here' using errcode='42501';
    end if;
    select * into v_live from private.phone_invitations where plan_id=p_plan and phone=v_phone and revoked_at is null;
   end if;
   if not v_host and v_live.id is not null and v_live.brought_by is distinct from v_uid then
    v_kind := 'already';
   else
    if not v_host and v_live.id is null then
     if not v_may then raise exception 'Not allowed to bring people here' using errcode='42501'; end if;
     v_new := v_new+1;
     if v_new>v_remaining then raise exception 'No invites left' using errcode='22023'; end if;
    end if;
    if v_holder is not null and private.user_eligible(v_holder) and private.used_app(v_holder)
     and exists(select 1 from public.profiles where id=v_holder) then
     v_kind := 'app';
     insert into public.attendees(plan_id,user_id,brought_by,level) values(p_plan,v_holder,v_brought,v_level) on conflict do nothing;
     insert into private.notification_outbox(plan_id,recipient_id,kind,dedupe_key,actor_id)
      values(p_plan,v_holder,'invited','invited:'||p_plan||':'||v_holder,v_uid) on conflict do nothing;
     update private.phone_invitations set revoked_at=now(), code_hash=null
      where plan_id=p_plan and phone=v_phone and revoked_at is null;
    else
     v_kind := 'link';
     insert into private.phone_invitations(plan_id,phone,country,code_hash,invited_by,brought_by,level)
      values(p_plan,v_phone,v_country,extensions.digest(v_code,'sha256'),v_uid,v_brought,v_level)
      on conflict (plan_id,phone) do update set country=excluded.country, code_hash=excluded.code_hash, revoked_at=null,
       user_id=case when private.phone_invitations.revoked_at is null then private.phone_invitations.user_id end,
       answered_at=case when private.phone_invitations.revoked_at is null then private.phone_invitations.answered_at end,
       invited_by=case when private.phone_invitations.revoked_at is null then private.phone_invitations.invited_by else excluded.invited_by end,
       created_at=case when private.phone_invitations.revoked_at is null then private.phone_invitations.created_at else excluded.created_at end,
       brought_by=excluded.brought_by, level=excluded.level;
    end if;
    if v_host then
     delete from private.plan_removals where series_id=v_series and (phone=v_phone or user_id=v_holder);
    end if;
   end if;
  end if;
  -- A guest who may not bring only sends their own links again.
  if not v_host and not v_may and v_kind in ('self','already') then raise exception 'Not allowed to bring people here' using errcode='42501'; end if;
  v_out := v_out || jsonb_build_array(jsonb_build_object('phone',private.phone_digits(v_item->>'phone'),'kind',v_kind));
 end loop;
 return v_out;
end $$;

-- Answering a personal link: a new guest row takes the link's bringer and level (CO-P15: the circle is not checked
-- again; a bringer who has since left, or lowered numbers, change nothing). Someone already on the resbite keeps their
-- own row, bringer and level. A removal sticks (C-R2, C19): a link is refused as a revoked link is (42501 'Invitation
-- unavailable') when its answerer or its number is on record for the series, with one exception (C21): a host's own
-- link (level 1) created after the latest of those records is the host's later decision, so it answers normally, and
-- answering it clears them (the answerer's and the number's). This covers a person removed while they had no confirmed
-- number, whom the host then linked by a number nobody held yet (the host's invitation cleared only the number's
-- record). A link made before the removal, the host's or a guest's, and any guest's link (level > 1) stay refused
-- while a record stands. A refusal undoes everything the call wrote, so it cannot revoke the link itself: the links to
-- a person's confirmed number are revoked when the host removes or declines them (remove_guest, decide_join_request),
-- and this check stops the rest (a number the person confirmed afterwards). Otherwise the
-- 20261031120000_creating_a_resbite body.
create or replace function private.answer_phone_invitation(p_code text, p_name text, p_response text, p_terms_version text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_inv private.phone_invitations; v_plan public.plans; v_has_profile boolean; v_att public.attendees; v_next integer;
 v_removed timestamptz;
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
 if not found or v_plan.owner_id is null or v_plan.status<>'active' or private.plan_end(v_plan.starts_at,v_plan.ends_at)<=now() or v_plan.owner_id=v_uid
 or not private.user_eligible(v_plan.owner_id) then
  raise exception 'Invitation unavailable' using errcode='42501';
 end if;
 -- Read again under the plan lock: revoking an invitation takes the same lock through its owner checks.
 select * into v_inv from private.phone_invitations where id=v_inv.id and revoked_at is null;
 if not found then raise exception 'Invitation unavailable' using errcode='42501'; end if;
 if v_inv.user_id is not null and v_inv.user_id<>v_uid then raise exception 'Invitation unavailable' using errcode='42501'; end if;
 -- The person or the number a host removed, declined or revoked on this series (C19), unless this is the host's own
 -- link made after the latest of those records (C21), whose answer clears them.
 v_removed := (select max(r.removed_at) from private.plan_removals r
  where r.series_id=v_plan.series_id and (r.user_id=v_uid or r.phone=v_inv.phone));
 if v_removed is not null then
  if v_inv.level=1 and v_inv.created_at>v_removed then
   delete from private.plan_removals where series_id=v_plan.series_id and (user_id=v_uid or phone=v_inv.phone);
  else
   raise exception 'Invitation unavailable' using errcode='42501';
  end if;
 end if;
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
  -- The link's bringer and level (CO-P15).
  insert into public.attendees(plan_id,user_id,response,brought_by,level) values(v_plan.id,v_uid,p_response,v_inv.brought_by,v_inv.level) returning * into v_att;
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
 if p_response='declined' then delete from public.plan_admins where plan_id=v_plan.id and user_id=v_uid; end if;
 insert into private.notification_outbox(plan_id,recipient_id,kind,dedupe_key,actor_id,detail)
  select v_plan.id,h,'rsvp','rsvp:'||v_plan.id||':'||v_uid||':'||v_att.version||case when h=v_plan.owner_id then '' else ':'||h end,v_uid,p_response from private.host_ids(v_plan.id) h where h<>v_uid on conflict do nothing;
 return jsonb_build_object('response',p_response,'plan_id',v_plan.id);
end $$;

-- The personal page names the person who brought you (CO-P9): the open payload carries "inviter", the bringer's first
-- name, when the link has a bringer whose account is not being deleted (which renames its profile 'Deleted member');
-- otherwise there is no inviter key. host and every other key are unchanged. Otherwise the
-- 20261031120000_creating_a_resbite body.
create or replace function private.personal_invitation_page(p_code text) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_inv private.phone_invitations; v_plan public.plans; v_host text; v_going integer; v_state text; v_inviter text;
begin
 if p_code is null or p_code !~ '^[A-Za-z0-9_-]{22}$' then return jsonb_build_object('state','inactive'); end if;
 select * into v_inv from private.phone_invitations where code_hash=extensions.digest(p_code,'sha256') and revoked_at is null;
 if not found then return jsonb_build_object('state','inactive'); end if;
 select * into v_plan from public.plans where id=v_inv.plan_id;
 if not found or v_plan.owner_id is null then return jsonb_build_object('state','inactive'); end if;
 select display_name into v_host from public.profiles where id=v_plan.owner_id;
 v_state := case when v_plan.status<>'active' then 'cancelled' when private.plan_end(v_plan.starts_at,v_plan.ends_at)<=now() then 'happened' else 'open' end;
 if v_state<>'open' then return jsonb_build_object('state',v_state,'host',v_host,'title',v_plan.title); end if;
 select count(*) into v_going from public.attendees where plan_id=v_plan.id and response='accepted';
 v_inviter := (select nullif(split_part(btrim(pr.display_name),' ',1),'') from public.profiles pr
  where pr.id=v_inv.brought_by and not private.deletion_pending(pr.id));
 return jsonb_build_object('state','open','host',v_host,'title',v_plan.title,'starts_at',v_plan.starts_at,'ends_at',v_plan.ends_at,
  'time_zone',v_plan.time_zone,'area',v_plan.area,'place_tbd',v_plan.place_tbd,'repeat_weeks',v_plan.repeat_weeks,'going',v_going,
  'image',case when v_plan.cover_path is not null then jsonb_build_object('kind','cover','ref',v_plan.cover_path)
   when v_plan.activity_id is not null then jsonb_build_object('kind','activity','ref',v_plan.activity_id)
   else jsonb_build_object('kind','mark','ref','') end,
  'ending',right(v_inv.phone,2),'country',v_inv.country)
  || case when v_inviter is null then '{}'::jsonb else jsonb_build_object('inviter',v_inviter) end;
end $$;

-- The roll copies the circle (CO-P12): the next occurrence takes bring_invites and bring_levels, and each guest carried
-- keeps who brought them and their level (CO-P12 overrides CO-P8's "carried along a series is level 1"), so a brought
-- person counts against their bringer's invites on every occurrence while they are in. Every guest is carried, a
-- brought person who said Can't go too (CH-P20), so the bringer's used can exceed allowed on the next occurrence
-- (remaining stays 0; the owner question in the plan). Otherwise the 20261111120000_connections_follow_ups body.
create or replace function private.roll_repeating_plans() returns integer language plpgsql security definer set search_path = '' as $$
declare p public.plans; v_id uuid; v_start timestamptz; v_end timestamptz; v_steps integer; v_count integer := 0; v_constraint text;
begin
 for p in
  select o.* from public.plans o
  where o.repeat_weeks is not null and (o.status='cancelled' or private.plan_end(o.starts_at,o.ends_at)<=now())
   and not exists(select 1 from public.plans n where n.repeats_from=o.id)
   and private.user_eligible(o.owner_id)
  order by o.id
  for update of o skip locked
 loop
  -- Each plan has its own block: a plan that cannot roll (a bad time zone, say) is skipped with a warning, the rest roll.
  begin
   v_steps := 1;
   loop
    v_start := private.next_occurrence(p.starts_at,p.time_zone,p.repeat_weeks*v_steps);
    v_end := private.next_occurrence(p.ends_at,p.time_zone,p.repeat_weeks*v_steps);
    -- A start in a spring-forward gap lands an hour later, so an end just after the gap would come before it: keep the length.
    if v_end<=v_start then v_end := v_start+(p.ends_at-p.starts_at); end if;
    exit when private.plan_end(v_start,v_end)>now() or v_steps>=600;
    v_steps := v_steps+1;
   end loop;
   -- More than 600 repeats behind: give up on this plan.
   continue when private.plan_end(v_start,v_end)<=now();
   v_id := gen_random_uuid();
   -- The cover trigger starts cover_revision at 0 again; title and categories are given, so the activity trigger keeps them.
   -- The circle comes along (CO-P12).
   insert into public.plans(id,owner_id,activity_id,title,description,categories,starts_at,ends_at,time_zone,place_label,place_tbd,
    latitude,longitude,area,guest_note,guest_note_at,cover_path,cover_revision,cover_description,has_meeting_details,repeat_weeks,
    series_id,repeats_from,status,version,bring_invites,bring_levels)
   values(v_id,p.owner_id,p.activity_id,p.title,p.description,p.categories,v_start,v_end,p.time_zone,p.place_label,p.place_tbd,
    p.latitude,p.longitude,p.area,p.guest_note,p.guest_note_at,p.cover_path,p.cover_revision,p.cover_description,p.has_meeting_details,p.repeat_weeks,
    p.series_id,p.id,'active',1,p.bring_invites,p.bring_levels);
   insert into public.plan_meeting_details(plan_id,note) select v_id,note from public.plan_meeting_details where plan_id=p.id;
   -- Each guest keeps who brought them and their level (CO-P12).
   insert into public.attendees(plan_id,user_id,response,version,brought_by,level) select v_id,user_id,'pending',1,brought_by,level from public.attendees
    where plan_id=p.id and private.used_app(user_id) and private.user_eligible(user_id) and not private.deletion_pending(user_id);
   insert into public.plan_admins(plan_id,user_id,appointed_by,appointed_at) select v_id,pa.user_id,pa.appointed_by,now() from public.plan_admins pa
    where pa.plan_id=p.id and exists(select 1 from public.attendees a where a.plan_id=v_id and a.user_id=pa.user_id);
   insert into private.notification_outbox(plan_id,recipient_id,kind,dedupe_key,actor_id,detail)
   select v_id,a.user_id,'invited','invited:'||v_id||':'||a.user_id,p.owner_id,'again'
   from public.attendees a
   where a.plan_id=v_id and a.user_id<>p.owner_id
    and not exists(select 1 from public.plan_admins pa where pa.plan_id=v_id and pa.user_id=a.user_id)
   on conflict do nothing;
   v_count := v_count+1;
  exception when unique_violation then
   -- Another run created this plan's next occurrence first: skip it quietly. Any other unique violation skips the plan with a warning.
   get stacked diagnostics v_constraint = constraint_name;
   if v_constraint is distinct from 'plans_repeats_from_key' then
    raise warning 'roll_repeating_plans: plan % skipped: %', p.id, sqlerrm;
   end if;
  when others then
   raise warning 'roll_repeating_plans: plan % skipped: %', p.id, sqlerrm;
  end;
 end loop;
 return v_count;
end $$;

-- Removing a guest is recorded for the series (C-R2), so the guest's friends cannot bring them back and no link lets
-- them back (answer_phone_invitation); the live links to their confirmed number, a host's or a guest's, are revoked
-- with it (C19: removing the person is the host's remedy, CO-P15), which frees a bringer's invite. An admin who removes
-- themself is leaving, which no host did: nothing is recorded or revoked for them. Nothing else changes: the people the
-- guest brought keep their rows, bringer and level (CO-P11). Otherwise the 20261031120000_creating_a_resbite body.
create or replace function private.remove_guest(p_plan uuid,p_user uuid) returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid; v_owner uuid;
begin
 v_uid := private.require_link_owner(p_plan);
 select owner_id into v_owner from public.plans where id=p_plan;
 if p_user=v_owner then
  if v_uid=v_owner then raise exception 'The organizer cannot be removed' using errcode='22023'; end if;
  raise exception 'The organizer cannot be removed' using errcode='42501';
 end if;
 if p_user<>v_uid and v_uid is distinct from v_owner and exists(select 1 from public.plan_admins where plan_id=p_plan and user_id=p_user) then
  raise exception 'Owner required' using errcode='42501';
 end if;
 update private.invitations set revoked_at=now() where plan_id=p_plan and claimed_by=p_user and revoked_at is null;
 update private.phone_invitations set revoked_at=now(), code_hash=null where plan_id=p_plan and user_id=p_user;
 delete from public.plan_admins where plan_id=p_plan and user_id=p_user;
 delete from public.attendees where plan_id=p_plan and user_id=p_user;
 -- The removal, for the series (an account that does not exist has nothing to record), and the links to the person's
 -- confirmed number.
 if p_user<>v_uid then
  insert into private.plan_removals(series_id,user_id) select p.series_id,p_user from public.plans p
   where p.id=p_plan and exists(select 1 from auth.users u where u.id=p_user)
  on conflict (series_id,user_id) where user_id is not null do update set removed_at=excluded.removed_at;
  update private.phone_invitations set revoked_at=now(), code_hash=null where plan_id=p_plan and revoked_at is null
   and phone=(select nullif(private.phone_key(u.phone),'') from auth.users u where u.id=p_user and u.phone_confirmed_at is not null);
 end if;
end $$;

-- Declining a request to join is recorded for the series too (C-R2): a guest cannot then bring the person the host
-- turned down, and no link lets them in (answer_phone_invitation); the live links to their confirmed number are revoked
-- with it, as when a host removes someone (C19). Approving is the host letting the person in (CO-P13): their guest row
-- is level 1 with no bringer, a row they already had included (it keeps its reply, as before), and the person's records
-- for the series go, as a host's own invitation clears them (C18-Q4). Otherwise the 20261029120000_open_link_approval
-- body.
create or replace function private.decide_join_request(p_plan uuid, p_user uuid, p_approve boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid; v_req private.join_requests;
begin
 if p_plan is null or p_user is null or p_approve is null then raise exception 'Invalid decision' using errcode='22023'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(least(auth.uid(),p_user)::text,47));
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(greatest(auth.uid(),p_user)::text,47));
 v_uid := private.require_link_owner(p_plan);
 select * into v_req from private.join_requests where plan_id=p_plan and user_id=p_user and status='waiting' for update;
 if not found then raise exception 'Request already decided' using errcode='22023'; end if;
 if not p_approve then
  update private.join_requests set status='declined', decided_at=now() where plan_id=p_plan and user_id=p_user;
  -- The refusal, for the series, and the links to the person's confirmed number.
  insert into private.plan_removals(series_id,user_id) select p.series_id,p_user from public.plans p where p.id=p_plan
  on conflict (series_id,user_id) where user_id is not null do update set removed_at=excluded.removed_at;
  update private.phone_invitations set revoked_at=now(), code_hash=null where plan_id=p_plan and revoked_at is null
   and phone=(select nullif(private.phone_key(u.phone),'') from auth.users u where u.id=p_user and u.phone_confirmed_at is not null);
  return jsonb_build_object('status','declined');
 end if;
 if exists(select 1 from private.beta_access where user_id=p_user and revoked_at is not null)
 or exists(select 1 from auth.users u where u.id=p_user
  and exists(select 1 from private.tester_roster r where r.email = lower(u.email) and not r.enabled)) then
  raise exception 'Invitation unavailable' using errcode='42501';
 end if;
 if not private.user_eligible(p_user) then
  if not exists(select 1 from auth.users u where u.id=p_user and (u.email_confirmed_at is not null or u.phone_confirmed_at is not null)
   and not coalesce(u.is_anonymous,false) and (u.banned_until is null or u.banned_until<=now()))
  or private.deletion_pending(p_user) then
   raise exception 'Invitation unavailable' using errcode='42501';
  end if;
  insert into private.beta_access(user_id,source,plan_link_id) values(p_user,'approval',v_req.plan_link_id) on conflict (user_id) do nothing;
 end if;
 -- Level 1 with no bringer (CO-P13); a row the person already has keeps its reply.
 insert into public.attendees(plan_id,user_id,response) values(p_plan,p_user,v_req.response)
  on conflict (plan_id,user_id) do update set brought_by=null, level=1;
 -- The host lets them in: their records for the series go (the person, and their confirmed number).
 delete from private.plan_removals r using public.plans p where p.id=p_plan and r.series_id=p.series_id
  and (r.user_id=p_user or r.phone=(select nullif(private.phone_key(u.phone),'') from auth.users u where u.id=p_user and u.phone_confirmed_at is not null));
 update private.join_requests set status='approved', decided_at=now() where plan_id=p_plan and user_id=p_user;
 insert into private.notification_outbox(plan_id,recipient_id,kind,dedupe_key,actor_id)
  values(p_plan,p_user,'join_approved','join-approved:'||p_plan||':'||p_user||':'||extract(epoch from v_req.created_at),v_uid) on conflict do nothing;
 return jsonb_build_object('status','approved');
end $$;

-- Revoking a link by number. A host, as today (require_link_owner; the answerer leaves the resbite and any admin role),
-- and the revocation is recorded for the series (C-R2): the number, and the person when it was answered. A guest may
-- revoke a link they brought that nobody has answered and that is still live, while the resbite is open, whatever
-- their own reply (CO-P10): the invite frees, and nothing is recorded. Someone with no such link is refused before
-- the plan's row is locked. Anything else is 42501 'Active plan owner required', as a guest gets today. Otherwise the
-- 20261031120000_creating_a_resbite body.
create or replace function private.revoke_phone_invitation(p_plan uuid, p_phone text) returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_tester(); v_user uuid; v_phone text; v_series uuid;
begin
 if private.is_host(p_plan,v_uid) then
  perform private.require_link_owner(p_plan);
  update private.phone_invitations set revoked_at=now(), code_hash=null
   where plan_id=p_plan and phone=private.phone_key(p_phone) returning user_id, phone into v_user, v_phone;
  if v_user is not null then
   delete from public.plan_admins where plan_id=p_plan and user_id=v_user;
   delete from public.attendees where plan_id=p_plan and user_id=v_user;
  end if;
  if v_phone is not null then
   select series_id into v_series from public.plans where id=p_plan;
   insert into private.plan_removals(series_id,phone) values(v_series,v_phone)
    on conflict (series_id,phone) where phone is not null do update set removed_at=excluded.removed_at;
   if v_user is not null then
    insert into private.plan_removals(series_id,user_id) values(v_series,v_user)
     on conflict (series_id,user_id) where user_id is not null do update set removed_at=excluded.removed_at;
   end if;
  end if;
  return;
 end if;
 -- A bringer, under the plan's lock as a host's revocation is. Only someone with such a link gets as far as the lock.
 if not exists(select 1 from private.phone_invitations where plan_id=p_plan and phone=private.phone_key(p_phone) and brought_by=v_uid
  and answered_at is null and revoked_at is null) then
  raise exception 'Active plan owner required' using errcode='42501';
 end if;
 perform 1 from public.plans where id=p_plan and status='active' and private.plan_end(starts_at,ends_at)>now() for update;
 if found then
  update private.phone_invitations set revoked_at=now(), code_hash=null
   where plan_id=p_plan and phone=private.phone_key(p_phone) and brought_by=v_uid and answered_at is null and revoked_at is null;
  if found then return; end if;
 end if;
 raise exception 'Active plan owner required' using errcode='42501';
end $$;

-- The list of links by number. A host gets today's list, in today's shape (installed builds read phone on every row),
-- of the hosts' own links (level 1); the links guests sent are in plan_brought_invitations, without their numbers. A
-- guest gets only the links they brought, in the same shape (they remove theirs by number), so a guest who brought
-- nobody gets []. Anyone else is refused (42501 'Plan owner required'). Otherwise the
-- 20261031120000_creating_a_resbite body.
create or replace function private.plan_phone_invitations(p_plan uuid) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := private.require_tester(); v_host boolean;
begin
 v_host := private.is_host(p_plan,v_uid);
 if not v_host and not exists(select 1 from public.attendees a where a.plan_id=p_plan and a.user_id=v_uid) then
  raise exception 'Plan owner required' using errcode='42501';
 end if;
 return coalesce((select jsonb_agg(jsonb_build_object('phone',i.phone,'country',i.country,'answered',i.answered_at is not null,
   'response',(select a.response from public.attendees a where a.plan_id=i.plan_id and a.user_id=i.user_id)) order by i.created_at,i.phone)
  from private.phone_invitations i where i.plan_id=p_plan and i.revoked_at is null
   and case when v_host then i.level=1 else i.brought_by is not distinct from v_uid end),'[]'::jsonb);
end $$;

-- Folding a web-only account into the app account keeps the person's removal records (C19, #38): a record of the web
-- account moves to the app account, which a guest then cannot bring back either. Otherwise the
-- 20261030120000_push_delivery body; its grants and its public wrapper are kept.
create or replace function private.fold_web_account(p_from uuid, p_into uuid) returns jsonb language plpgsql security definer set search_path = '' as $$
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
 -- 2a. Open-link requests: where the account already has its own request, is on the event or organizes it, its own
 -- stands and the web one goes; the rest move with their answer, link and status.
 -- Where its own request stands, the web one's unsent notice goes with it, so the host is told once.
 delete from private.notification_outbox o where o.kind='join_request' and o.actor_id=p_from and o.delivered_at is null
  and exists(select 1 from private.join_requests t where t.plan_id=o.plan_id and t.user_id=p_into);
 delete from private.join_requests f where f.user_id=p_from
  and (exists(select 1 from private.join_requests t where t.plan_id=f.plan_id and t.user_id=p_into)
   or exists(select 1 from public.attendees t where t.plan_id=f.plan_id and t.user_id=p_into)
   or exists(select 1 from public.plans p where p.id=f.plan_id and p.owner_id=p_into));
 update private.join_requests set user_id=p_into where user_id=p_from;
 -- 2b. Notices the account caused that haven't gone out yet name the app account.
 update private.notification_outbox set actor_id=p_into where actor_id=p_from and delivered_at is null;
 -- 2c. Removal records (circles of trust): a record of the web account is a record of the person, so it moves to the
 -- app account before the web account goes (deleting it would cascade the record away). One the app account already
 -- has for that series stands.
 insert into private.plan_removals(series_id,user_id,removed_at) select series_id,p_into,removed_at from private.plan_removals
  where user_id=p_from on conflict do nothing;
 delete from private.plan_removals where user_id=p_from;
 -- 3. The tick and the grant, unless the account has its own. A revoked grant is a ban: one on either side stays. An
 -- account whose tester-roster entry is disabled gets no live grant, as join_by_link and answer_phone_invitation.
 v_disabled := exists(select 1 from auth.users u where u.id=p_into
  and exists(select 1 from private.tester_roster r where r.email = lower(u.email) and not r.enabled));
 if not exists(select 1 from private.age_attestations where user_id=p_into) then
  update private.age_attestations set user_id=p_into where user_id=p_from;
 end if;
 if not exists(select 1 from private.beta_access where user_id=p_into) then
  insert into private.beta_access(user_id,source,plan_link_id,granted_at,revoked_at)
   select p_into,source,plan_link_id,granted_at,revoked_at from private.beta_access
   where user_id=p_from and (revoked_at is not null or not v_disabled);
 else
  update private.beta_access t set revoked_at=f.revoked_at from private.beta_access f
   where t.user_id=p_into and t.revoked_at is null and f.user_id=p_from and f.revoked_at is not null;
 end if;
 -- The web account's live grant and tick go, so a fold whose user deletion then fails leaves no second account that
 -- gets in; its ban stays, so that account still can't join by a link or answer an invitation.
 delete from private.beta_access where user_id=p_from and revoked_at is null;
 delete from private.age_attestations where user_id=p_from;
 -- 4. The web profile.
 delete from public.profiles where id=p_from;
 return jsonb_build_object('moved_attendees',v_moved);
end $$;

-- 6. Deletion (rule 10, CO-P15): asking to delete an account also empties "brought by" wherever it names the account,
-- on guest rows and on links (the links stay live: a sent invitation stands, now with no bringer), and deletes the
-- account's removal records. The deletion lifecycle is local-only (20261022120001_gi2_local_delivery_and_deletion; the
-- hosted project has none of it): its request function is redefined only where it exists, so this file still applies
-- on the hosted baseline, and the release that brings deletion to hosted must carry these three statements beside the
-- two deletes of 20261110120000_connections. Otherwise the 20261110120000_connections body; its grants are kept.
do $migration$ begin
 if pg_catalog.to_regprocedure('private.request_account_deletion(uuid,uuid,uuid,text)') is not null then
  execute $fn$
create or replace function private.request_account_deletion(p_user uuid,p_session uuid,p_request uuid,p_recovery text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_job private.account_deletion_jobs; v_plan public.plans;
begin
 if p_user is null or p_request is null or p_recovery is null or p_recovery !~ '^[a-f0-9]{64}$' then
 raise exception 'Invalid deletion request' using errcode='22023'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user::text,47));
 select * into v_job from private.account_deletion_jobs where user_id=p_user;
 if found then
  if v_job.request_id<>p_request or v_job.recovery_hash<>extensions.digest(p_recovery,'sha256') then
   raise exception 'Deletion already requested' using errcode='22023'; end if;
  return jsonb_build_object('requestId',v_job.request_id,'status',v_job.status);
 end if;
 -- Edge validates Auth tokens and recent AMR; SQL also requires that the proof's
 -- session is real, belongs to this user and was freshly created, not refreshed.
 if not exists(select 1 from auth.sessions where id=p_session and user_id=p_user and created_at>=now()-interval '5 minutes' and created_at<=now()+interval '30 seconds')
 or not exists(select 1 from auth.users u where u.id=p_user and u.email_confirmed_at is not null and not coalesce(u.is_anonymous,false) and (exists(select 1 from private.tester_roster r where r.email=lower(u.email) and r.enabled) or private.has_live_grant(u.id)) and (u.banned_until is null or u.banned_until<=now()))
 then raise exception 'Fresh eligible authentication required' using errcode='42501'; end if;
 insert into private.account_deletion_jobs(request_id,user_id,recovery_hash) values(p_request,p_user,extensions.digest(p_recovery,'sha256'));
 delete from private.tester_roster where email=(select lower(email) from auth.users where id=p_user);
 update public.profiles set deletion_requested_at=now(),display_name='Deleted member',avatar_path=null where id=p_user;
 -- Lock plans in a deterministic order, preserving others' access to cancellation.
 for v_plan in select * from public.plans where owner_id=p_user order by id for update loop
  if v_plan.status='active' and v_plan.starts_at>now() then
   update public.plans set status='cancelled',version=version+1 where id=v_plan.id;
   insert into private.notification_outbox(plan_id,recipient_id,kind,dedupe_key)
    select v_plan.id,a.user_id,'plan_cancelled','deletion:'||p_request||':'||v_plan.id||':'||a.user_id from public.attendees a
    where a.plan_id=v_plan.id and a.user_id<>p_user on conflict do nothing;
  end if;
  update public.plans set place_label='Meeting place removed',note='',latitude=null,longitude=null where id=v_plan.id;
  update private.invitations set revoked_at=coalesce(revoked_at,now()),intended_email=null where plan_id=v_plan.id;
 end loop;
 update private.invitations set revoked_at=coalesce(revoked_at,now()),claimed_by=null,intended_email=null where claimed_by=p_user;
 delete from public.connections where p_user in (user_a,user_b);
 delete from private.connection_refusals where from_user=p_user or to_user=p_user;
 -- Circles of trust: nobody was brought by a deleted account, and its removal records go.
 update public.attendees set brought_by=null where brought_by=p_user;
 update private.phone_invitations set brought_by=null where brought_by=p_user;
 delete from private.plan_removals where user_id=p_user;
 delete from public.attendees where user_id=p_user;
 delete from private.device_endpoints where user_id=p_user;
 delete from private.notification_outbox where recipient_id=p_user;
 return jsonb_build_object('requestId',p_request,'status','queued');
end $$;
$fn$;
 end if;
end $migration$;

-- 7. Grants. bring_allowance is the database's own; the six others, private and public, are for signed-in accounts.
revoke all on function private.bring_allowance(uuid,uuid) from public, anon, authenticated, service_role;
revoke all on function private.set_plan_circle(uuid,smallint,smallint), public.set_plan_circle(uuid,smallint,smallint),
 private.my_bring_allowance(uuid), public.my_bring_allowance(uuid),
 private.plan_brought_invitations(uuid), public.plan_brought_invitations(uuid),
 private.revoke_brought_invitation(uuid,uuid), public.revoke_brought_invitation(uuid,uuid),
 private.withdraw_brought_invitation(uuid,uuid), public.withdraw_brought_invitation(uuid,uuid),
 private.plan_bringers(uuid), public.plan_bringers(uuid)
 from public, anon, authenticated, service_role;
grant execute on function private.set_plan_circle(uuid,smallint,smallint), public.set_plan_circle(uuid,smallint,smallint),
 private.my_bring_allowance(uuid), public.my_bring_allowance(uuid),
 private.plan_brought_invitations(uuid), public.plan_brought_invitations(uuid),
 private.revoke_brought_invitation(uuid,uuid), public.revoke_brought_invitation(uuid,uuid),
 private.withdraw_brought_invitation(uuid,uuid), public.withdraw_brought_invitation(uuid,uuid),
 private.plan_bringers(uuid), public.plan_bringers(uuid)
 to authenticated;
