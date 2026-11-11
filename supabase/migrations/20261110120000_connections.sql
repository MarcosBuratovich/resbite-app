-- Connections: the database. Spec: docs/superpowers/specs/2026-11-10-connections-and-circles-design.md
-- Plan: docs/superpowers/plans/2026-11-10-connections-1-connections.md
-- Hosted-compatible: depends only on the migrations in supabase/tests/hosted-baseline/migrations.txt
-- Rollback: supabase/rollback/20261110120000_connections.rollback.sql

-- 1. The pair (CO-D2, CO-D3, CO-P3)
-- Two people who share a resbite connect: one asks, the other accepts. One row per pair, the smaller id first, so a
-- request and the request back meet on the same row. series_id is the resbite (series) the request was made from, the
-- one they met at; a refusal is kept per series. Nobody reads or writes the table directly (row security on, no
-- policies, no grants): the functions below write it and the read functions are the only way in.
create table public.connections (
 user_a uuid not null references public.profiles(id) on delete cascade,
 user_b uuid not null references public.profiles(id) on delete cascade,
 state text not null check (state in ('requested','connected')),
 requested_by uuid not null,
 series_id uuid,
 created_at timestamptz not null default now(),
 accepted_at timestamptz,
 primary key (user_a,user_b),
 constraint connections_ordered check (user_a<user_b),
 constraint connections_requester check (requested_by in (user_a,user_b))
);
create index connections_user_b_idx on public.connections(user_b);
alter table public.connections enable row level security;
revoke all on public.connections from public, anon, authenticated, service_role;

-- "Not now": from_user asked, to_user refused, on that series; or to_user removed the connection with from_user that
-- began there (CO-P14). from_user cannot ask to_user again from it, and is never told (CO-P3); asking from another series
-- is a real request, and the refusal stays: one chance per series. Only an acceptance between the two clears refusals,
-- all of theirs.
-- hidden is what from_user sees of the pair: false, their request still looks sent, on every resbite they share, and they
-- still read to_user's profile (a "Not now", or asking again after one); true, they see no request (a removal, which
-- leaves nothing they had sent, or their cancel). A visible refusal stands for from_user's request: to_user asking
-- accepts it. Functions only.
create table private.connection_refusals (
 series_id uuid not null,
 from_user uuid not null references public.profiles(id) on delete cascade,
 to_user uuid not null references public.profiles(id) on delete cascade,
 refused_at timestamptz not null default now(),
 hidden boolean not null default false,
 primary key (series_id,from_user,to_user)
);
-- The refusals are read by the two people (from_user and to_user) on any series, and the primary key leads with the
-- series: this index serves those reads and covers from_user's foreign key.
create index connection_refusals_users_idx on private.connection_refusals(from_user,to_user);
alter table private.connection_refusals enable row level security;
revoke all on private.connection_refusals from public, anon, authenticated;

-- The two ids in the table's order: the smaller first.
create function private.pair(a uuid, b uuid) returns table (user_a uuid, user_b uuid) language sql immutable set search_path = '' as $$
 select least(a,b), greatest(a,b)
$$;
revoke all on function private.pair(uuid,uuid) from public, anon, authenticated, service_role;

-- 2. The two notices (CO-P5): 'connection_request' to the person asked and 'connection_accepted' to the requester, each
-- with a resbite the two share as plan_id and a null detail. The kind check is replaced by exact name, keeping every
-- existing value; the detail check stays as 20261031120000_creating_a_resbite.sql left it.
alter table private.notification_outbox drop constraint notification_outbox_kind_check;
alter table private.notification_outbox add constraint notification_outbox_kind_check
 check (kind in ('invitation','rsvp','plan_changed','plan_cancelled','guest_note','invited','join_request','join_approved','admin_added',
  'connection_request','connection_accepted'));

-- 3. Asking, accepting, refusing, cancelling and removing (CO-P2, CO-P3, CO-P5)
-- Each function takes the pair's advisory lock first, so two calls on one pair (two people asking each other at once, a
-- double tap) run one after the other: the second finds the first's row and never meets the primary key.
-- The request's notice is keyed by the pair, the series asked from and who asked, and nothing else (CO-R8): it is queued
-- once, however often the request is cancelled and sent again from that series (a request is not a nudge), and goes
-- while a request by that person stands (section 5); asking from another series is told on its own. The acceptance's
-- key ends with the exact time of the acceptance, as an epoch with its fraction: a retry queues nothing twice, while a
-- second acceptance (after a removal) is told, however soon after the first. Each notice's created_at is its row's time
-- when it is queued (for a request, the first one from that series, as nothing is queued after it), so the audience
-- tells an acceptance notice of the pair's current connection from one of an earlier, removed one, older than the row.

-- Asking, from a resbite. The caller must see names there (can_see_guests: a host, or a guest who has answered), and the
-- person asked must be on it as its owner, an admin or a guest who has answered (Going, Maybe or Can't go), and not be
-- leaving (deletion pending), else 42501 'Not on this resbite': someone who hasn't answered can't be asked, as the
-- request would tell them who else is on it (UX2-D6). Attendee rows stay after the end, so connecting stays possible on
-- an ended resbite. Returns 'requested' (asked now or before) or 'connected' (connected before, or the other person had
-- asked: asking back accepts, as it does when the other person's request was refused by the caller and still looks sent
-- to them, a visible refusal, whatever the caller's own refusals). It never returns a refused state (CO-P3): when there
-- is no row and the person asked refused the caller on this series (a "Not now", or a removal), it returns 'requested'
-- too, and stores and sends nothing but shows the caller's refusals as sent again, so the app shows "Request sent" as for
-- any request. Refused only on other series, the request is a real one, and those refusals stay.
create function private.request_connection(p_user uuid, p_plan uuid) returns text language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_tester(); v_a uuid; v_b uuid; v_series uuid; v_row public.connections; v_at timestamptz;
begin
 select p.user_a,p.user_b into v_a,v_b from private.pair(v_uid,p_user) p;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_a::text||':'||v_b::text,53));
 if p_user=v_uid then raise exception 'That is you' using errcode='22023'; end if;
 if not private.can_see_guests(p_plan) then raise exception 'Names required' using errcode='42501'; end if;
 -- CH-P21 (groups and chat): on a group any guest may be asked, whatever their reply; public.chats does not exist yet.
 -- Someone whose account is being deleted is not on it either, as its owner too (the owner's row outlives the request).
 if private.deletion_pending(p_user) or not (private.is_host(p_plan,p_user)
  or exists(select 1 from public.attendees a where a.plan_id=p_plan and a.user_id=p_user and a.response<>'pending')) then
  raise exception 'Not on this resbite' using errcode='42501';
 end if;
 select series_id into v_series from public.plans where id=p_plan;
 select * into v_row from public.connections where user_a=v_a and user_b=v_b for update;
 if found then
  if v_row.state='connected' then return 'connected'; end if;
  if v_row.requested_by=v_uid then return 'requested'; end if;
  -- The other person had asked: asking back is accepting, even on the series where they once refused the caller.
  perform private.accept_connection(p_user);
  return 'connected';
 end if;
 -- The other person's request, refused by the caller, still looks sent to them: it stands, and asking accepts it. This
 -- comes first: when each refused the other (the caller's refusal hidden by their cancel, so the other's request was a
 -- real one), whoever asks next connects the two, even from the series where their own request was refused.
 if exists(select 1 from private.connection_refusals where from_user=p_user and to_user=v_uid and not hidden) then
  insert into public.connections(user_a,user_b,state,requested_by,series_id,created_at)
   values(v_a,v_b,'requested',p_user,v_series,pg_catalog.clock_timestamp());
  perform private.accept_connection(p_user);
  return 'connected';
 end if;
 -- Refused on this series: it looks sent, and nothing is stored or sent.
 if exists(select 1 from private.connection_refusals where series_id=v_series and from_user=v_uid and to_user=p_user) then
  update private.connection_refusals set hidden=false where from_user=v_uid and to_user=p_user;
  return 'requested';
 end if;
 -- Refused only on other series: a real request. Those refusals stay, so asking from their series again stays quiet.
 -- clock_timestamp, not now(): requests made in one transaction keep the order they were made in (Requests lists the
 -- newest first). The notice is the pair's, the series' and the requester's, once (section 3's header): sent again,
 -- the request queues nothing, and the first notice, stamped with the first request's time, stands for it.
 insert into public.connections(user_a,user_b,state,requested_by,series_id,created_at)
  values(v_a,v_b,'requested',v_uid,v_series,pg_catalog.clock_timestamp()) returning created_at into v_at;
 insert into private.notification_outbox(plan_id,recipient_id,kind,dedupe_key,actor_id,created_at)
  values(p_plan,p_user,'connection_request','connect:'||v_a||':'||v_b||':'||v_series||':'||v_uid,v_uid,v_at)
  on conflict do nothing;
 return 'requested';
end $$;
create function public.request_connection(p_user uuid, p_plan uuid) returns text language sql security invoker set search_path = '' as $$
 select private.request_connection(p_user,p_plan)
$$;
revoke all on function private.request_connection(uuid,uuid), public.request_connection(uuid,uuid) from public, anon, authenticated, service_role;
grant execute on function private.request_connection(uuid,uuid), public.request_connection(uuid,uuid) to authenticated;

-- Accepting: only the person asked. Every refusal between the two, either way, on any series, goes: they are
-- connected now. The requester is told ("You and Ana are now connected"); the notice's resbite is
-- the latest occurrence of the series they met at or, when that series is gone, the latest resbite the two share. With
-- neither, the acceptance stands and nobody is told (an outbox row needs a resbite).
create function private.accept_connection(p_user uuid) returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_tester(); v_a uuid; v_b uuid; v_row public.connections; v_plan uuid; v_at timestamptz;
begin
 select p.user_a,p.user_b into v_a,v_b from private.pair(v_uid,p_user) p;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_a::text||':'||v_b::text,53));
 select * into v_row from public.connections where user_a=v_a and user_b=v_b for update;
 if not found or v_row.state<>'requested' or v_row.requested_by is distinct from p_user then raise exception 'No request' using errcode='42501'; end if;
 update public.connections set state='connected',accepted_at=pg_catalog.clock_timestamp() where user_a=v_a and user_b=v_b returning accepted_at into v_at;
 delete from private.connection_refusals where (from_user,to_user) in ((v_a,v_b),(v_b,v_a));
 select id into v_plan from public.plans where series_id=v_row.series_id order by starts_at desc,id limit 1;
 if v_plan is null then
  select p.id into v_plan from public.plans p where p.id in (
   (select id from public.plans where owner_id=v_a union select plan_id from public.attendees where user_id=v_a)
   intersect
   (select id from public.plans where owner_id=v_b union select plan_id from public.attendees where user_id=v_b))
  order by p.starts_at desc,p.id limit 1;
 end if;
 if v_plan is not null then
  insert into private.notification_outbox(plan_id,recipient_id,kind,dedupe_key,actor_id,created_at)
   values(v_plan,p_user,'connection_accepted','connected:'||v_a||':'||v_b||':'||extract(epoch from v_at),v_uid,v_at)
   on conflict do nothing;
 end if;
end $$;
create function public.accept_connection(p_user uuid) returns void language sql security invoker set search_path = '' as $$
 select private.accept_connection(p_user)
$$;
revoke all on function private.accept_connection(uuid), public.accept_connection(uuid) from public, anon, authenticated, service_role;
grant execute on function private.accept_connection(uuid), public.accept_connection(uuid) to authenticated;

-- "Not now": only the person asked. The request goes, silently, and the refusal is kept for its series. A request with
-- no series leaves nothing to key a refusal on: it just goes.
create function private.decline_connection(p_user uuid) returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_tester(); v_a uuid; v_b uuid; v_row public.connections;
begin
 select p.user_a,p.user_b into v_a,v_b from private.pair(v_uid,p_user) p;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_a::text||':'||v_b::text,53));
 select * into v_row from public.connections where user_a=v_a and user_b=v_b for update;
 if not found or v_row.state<>'requested' or v_row.requested_by is distinct from p_user then raise exception 'No request' using errcode='42501'; end if;
 delete from public.connections where user_a=v_a and user_b=v_b;
 if v_row.series_id is not null then
  insert into private.connection_refusals(series_id,from_user,to_user) values(v_row.series_id,p_user,v_uid)
   on conflict (series_id,from_user,to_user) do update set hidden=excluded.hidden, refused_at=excluded.refused_at;
 end if;
end $$;
create function public.decline_connection(p_user uuid) returns void language sql security invoker set search_path = '' as $$
 select private.decline_connection(p_user)
$$;
revoke all on function private.decline_connection(uuid), public.decline_connection(uuid) from public, anon, authenticated, service_role;
grant execute on function private.decline_connection(uuid), public.decline_connection(uuid) to authenticated;

-- Cancelling: the requester takes a live request back, silently; it may be sent again. A request refused unseen is
-- taken back too, as far as the caller can tell: with no row left, every refusal of the caller by p_user, on any series,
-- is hidden, so the caller's people lists show no request (it stays a refusal: asking again from there still looks sent
-- and sends nothing). Anything else (the other person's request, a connection) is a quiet no-op.
create function private.cancel_connection_request(p_user uuid) returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_tester(); v_a uuid; v_b uuid;
begin
 select p.user_a,p.user_b into v_a,v_b from private.pair(v_uid,p_user) p;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_a::text||':'||v_b::text,53));
 delete from public.connections where user_a=v_a and user_b=v_b and state='requested' and requested_by=v_uid;
 if not exists(select 1 from public.connections where user_a=v_a and user_b=v_b) then
  update private.connection_refusals set hidden=true where from_user=v_uid and to_user=p_user and not hidden;
 end if;
end $$;
create function public.cancel_connection_request(p_user uuid) returns void language sql security invoker set search_path = '' as $$
 select private.cancel_connection_request(p_user)
$$;
revoke all on function private.cancel_connection_request(uuid), public.cancel_connection_request(uuid) from public, anon, authenticated, service_role;
grant execute on function private.cancel_connection_request(uuid), public.cancel_connection_request(uuid) to authenticated;

-- Removing: either side ends a connection, silently. It is kept as a refusal of the other side by the remover on the
-- series they met at (CO-P14): the one removed cannot ask again from it (they may from another resbite they share),
-- while the remover may. The refusal is hidden: the one removed sent no request, so their people lists show none until
-- they ask. A connection with no series leaves nothing to key it on. Nothing to remove is quiet.
create function private.remove_connection(p_user uuid) returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_tester(); v_a uuid; v_b uuid; v_row public.connections;
begin
 select p.user_a,p.user_b into v_a,v_b from private.pair(v_uid,p_user) p;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_a::text||':'||v_b::text,53));
 delete from public.connections where user_a=v_a and user_b=v_b and state='connected' returning * into v_row;
 if v_row.series_id is not null then
  insert into private.connection_refusals(series_id,from_user,to_user,hidden) values(v_row.series_id,p_user,v_uid,true)
   on conflict (series_id,from_user,to_user) do update set hidden=excluded.hidden, refused_at=excluded.refused_at;
 end if;
end $$;
create function public.remove_connection(p_user uuid) returns void language sql security invoker set search_path = '' as $$
 select private.remove_connection(p_user)
$$;
revoke all on function private.remove_connection(uuid), public.remove_connection(uuid) from public, anon, authenticated, service_role;
grant execute on function private.remove_connection(uuid), public.remove_connection(uuid) to authenticated;

-- 4. What each person may read of the pair (CO-P3, CO-P6)
-- The two read functions are the only way the app learns about pairs (section 1), and the profile rule after them the
-- only other place that reads them: what each shows a refused requester is what they would see were their request live.

-- The caller's Connections (CO-P6): the requests to them, newest first, and their connections, by name, with the other
-- person's name and photo and the resbite they met at. Requests the caller sent are not listed: a refused one would
-- vanish from such a list (CO-P3). title is that series' latest occurrence the caller may read (can_read_plan: its owner
-- or on its guest list; CO-R9), null when the series is gone or the caller may read none of it, so a guest removed or
-- not carried to a later occurrence never reads its title (the app shows "Met on Resbite"). context, on a request, is
-- 'going' while that occurrence is on (not cancelled, not ended) and both are on it (each a host, or a guest who is Going
-- or Maybe), else 'met'.
create function private.my_connections() returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := private.require_tester();
begin
 return (with people as (
   select o.other, c.state, c.requested_by, c.series_id, c.created_at, pr.display_name as name, pr.avatar_path, pr.avatar_revision,
    lp.title,
    case when lp.status='active' and private.plan_end(lp.starts_at,lp.ends_at)>now()
     and (select bool_and(private.is_host(lp.id,u.id) or exists(select 1 from public.attendees a
       where a.plan_id=lp.id and a.user_id=u.id and a.response in ('accepted','maybe'))) from (values (v_uid),(o.other)) u(id))
    then 'going' else 'met' end as context
   from public.connections c
   cross join lateral (select case when c.user_a=v_uid then c.user_b else c.user_a end as other) o
   join public.profiles pr on pr.id=o.other
   left join lateral (select p.id, p.title, p.status, p.starts_at, p.ends_at from public.plans p where p.series_id=c.series_id
    and private.can_read_plan(p.id) order by p.starts_at desc, p.id limit 1) lp on true
   where c.user_a=v_uid or c.user_b=v_uid)
  select jsonb_build_object(
   'requests',coalesce((select jsonb_agg(jsonb_build_object('user_id',p.other,'name',p.name,'avatar_path',p.avatar_path,
     'avatar_revision',p.avatar_revision,'series_id',p.series_id,'title',p.title,'context',p.context) order by p.created_at desc,p.other)
    from people p where p.state='requested' and p.requested_by=p.other),'[]'::jsonb),
   'connected',coalesce((select jsonb_agg(jsonb_build_object('user_id',p.other,'name',p.name,'avatar_path',p.avatar_path,
     'avatar_revision',p.avatar_revision,'series_id',p.series_id,'title',p.title) order by p.name,p.other)
    from people p where p.state='connected'),'[]'::jsonb)));
end $$;
create function public.my_connections() returns jsonb language sql stable security invoker set search_path = '' as $$
 select private.my_connections()
$$;
revoke all on function private.my_connections(), public.my_connections() from public, anon, authenticated, service_role;
grant execute on function private.my_connections(), public.my_connections() to authenticated;

-- The people list's dots: the caller's state with each person on the resbite (its owner, its admins and every guest row,
-- whatever the reply), the caller left out, keyed by user id. Only for someone who sees the names there. With no pair,
-- a refusal by that person of the caller, on any series, reads 'requested_by_me', as if the request still stood
-- (CO-P3: the refusal is invisible), unless it is hidden (a removal, or the caller's cancel), which reads 'none'; the
-- refuser reads 'none'.
create function private.plan_connection_states(p_plan uuid) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := private.require_tester();
begin
 if not private.can_see_guests(p_plan) then raise exception 'Names required' using errcode='42501'; end if;
 return coalesce((select jsonb_object_agg(m.id::text, case
    when c.state='connected' then 'connected'
    when c.state='requested' and c.requested_by=v_uid then 'requested_by_me'
    when c.state='requested' then 'requested_by_them'
    when exists(select 1 from private.connection_refusals r where r.from_user=v_uid and r.to_user=m.id and not r.hidden)
     then 'requested_by_me'
    else 'none' end)
  from (select owner_id as id from public.plans where id=p_plan
   union select user_id from public.plan_admins where plan_id=p_plan
   union select user_id from public.attendees where plan_id=p_plan) m
  left join public.connections c on (c.user_a,c.user_b)=(least(v_uid,m.id),greatest(v_uid,m.id))
  where m.id is not null and m.id<>v_uid),'{}'::jsonb);
end $$;
create function public.plan_connection_states(p_plan uuid) returns jsonb language sql stable security invoker set search_path = '' as $$
 select private.plan_connection_states(p_plan)
$$;
revoke all on function private.plan_connection_states(uuid), public.plan_connection_states(uuid) from public, anon, authenticated, service_role;
grant execute on function private.plan_connection_states(uuid), public.plan_connection_states(uuid) to authenticated;

-- Profiles: the two sides of a pair, asked or connected, read each other's name and photo (the avatar storage policy
-- calls this too), and so does a refused requester whose request still looks sent to them (a visible refusal), as if it
-- were live. Otherwise the 20261014120000_ux2_rules body; its grants are kept.
create or replace function private.can_read_profile(p_id uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select private.eligible() and (p_id=auth.uid() or exists (
 select 1 from public.plans p where private.can_read_plan(p.id) and
 (p.owner_id=p_id or (private.can_see_guests(p.id) and exists(select 1 from public.attendees a where a.plan_id=p.id and a.user_id=p_id))))
 or exists(select 1 from public.connections c where (c.user_a, c.user_b) = (least(auth.uid(), p_id), greatest(auth.uid(), p_id)))
 or exists(select 1 from private.connection_refusals r where r.from_user = auth.uid() and r.to_user = p_id and not r.hidden))
$$;

-- 5. Inviting a connection, the two notices' eligibility, deletion (CO-P4, CO-P5)

-- Inviting a connection in the app (CO-P4): beside {phone, country, code}, an item may be {user}, someone the caller is
-- connected to, invited as an On Resbite contact is: 'already' when they are on the resbite (its owner, or any guest
-- row), else 'app' (a pending guest row and the 'invited' notice, from the caller). Anyone the caller is not connected to
-- is refused (42501 'Not a connection'), and so is a connection who may not use the app (not eligible, or leaving), with
-- the same message so nothing about them shows; a user that is not an id is an invalid item (22023). A {user} item's result
-- is {user, kind}, in order with the {phone, kind} ones. The 50-item cap is the whole batch's. Otherwise the
-- 20261031120000_creating_a_resbite body; its grants are kept.
create or replace function private.invite_contacts(p_plan uuid, p_invites jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_link_owner(p_plan); v_item jsonb; v_phone text; v_country text; v_code text; v_holder uuid;
 v_kind text; v_out jsonb := '[]'::jsonb; v_user uuid;
begin
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
   if v_item->>'user' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'Invalid invitation' using errcode='22023';
   end if;
   v_user := (v_item->>'user')::uuid;
   -- The pair's row is held while the invitation is made: a removal at the same moment goes first or waits.
   perform 1 from public.connections where (user_a,user_b)=(least(v_uid,v_user),greatest(v_uid,v_user)) and state='connected' for share;
   if not found or not private.user_eligible(v_user) or private.deletion_pending(v_user) then
    raise exception 'Not a connection' using errcode='42501';
   end if;
   if v_user=(select owner_id from public.plans where id=p_plan)
    or exists(select 1 from public.attendees where plan_id=p_plan and user_id=v_user) then
    v_kind := 'already';
   else
    v_kind := 'app';
    insert into public.attendees(plan_id,user_id) values(p_plan,v_user) on conflict do nothing;
    insert into private.notification_outbox(plan_id,recipient_id,kind,dedupe_key,actor_id)
     values(p_plan,v_user,'invited','invited:'||p_plan||':'||v_user,v_uid) on conflict do nothing;
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
  v_out := v_out || jsonb_build_array(jsonb_build_object('phone',private.phone_digits(v_item->>'phone'),'kind',v_kind));
 end loop;
 return v_out;
end $$;

-- The two connection notices (CO-P5) go to a side of the pair while what they tell still stands: a request while one by
-- the actor is live, and an acceptance while the two are connected. A request's notice is not held to the row's time:
-- one notice serves every request the actor sends from that series (CO-R8, section 3), so a request cancelled and sent
-- again is not told again, but its first notice may still go while it stands. An acceptance's is: only the notice of
-- the connection as it stands goes, not one of an earlier, removed connection (section 3 stamps it with accepted_at).
-- Their resbite (plan_id) only names where the two met: no membership test, and a mute does not apply. Every other kind
-- keeps the 20261031120000_creating_a_resbite body, verbatim but for the kind test that leaves the two to their own
-- branch.
create or replace function private.notification_recipient_eligible(p_outbox bigint) returns boolean
language sql stable security definer set search_path='' as $$
 select exists (
 select 1 from private.notification_outbox o
 join public.plans plan on plan.id=o.plan_id
 where o.id=p_outbox and o.kind not in ('connection_request','connection_accepted')
 and private.user_eligible(o.recipient_id) and not private.deletion_pending(o.recipient_id)
 and (private.is_host(plan.id,o.recipient_id) or exists(select 1 from public.attendees a where a.plan_id=plan.id and a.user_id=o.recipient_id
  and (o.kind not in ('plan_changed','guest_note') or a.response in ('accepted','maybe','pending'))))
 and (o.kind not in ('rsvp','invitation','join_request') or private.is_host(plan.id,o.recipient_id))
 and o.created_at>now()-interval '24 hours'
 and not exists(select 1 from public.plan_mutes m where m.series_id=plan.series_id and m.user_id=o.recipient_id)
 and (o.kind<>'join_request' or (plan.status='active' and private.plan_end(plan.starts_at,plan.ends_at)>now()
  and exists(select 1 from private.join_requests j where j.plan_id=o.plan_id and j.user_id=o.actor_id
   and j.status='waiting' and j.created_at<=o.created_at)
  and not exists(select 1 from public.attendees a where a.plan_id=o.plan_id and a.user_id=o.actor_id)
  and not private.deletion_pending(o.actor_id)))
 ) or exists (
 select 1 from private.notification_outbox o
 where o.id=p_outbox and o.kind in ('connection_request','connection_accepted')
 and private.user_eligible(o.recipient_id) and not private.deletion_pending(o.recipient_id)
 and o.created_at>now()-interval '24 hours'
 and exists(select 1 from public.connections c
  where (c.user_a,c.user_b)=(least(o.recipient_id,o.actor_id),greatest(o.recipient_id,o.actor_id))
  and (o.kind='connection_accepted' and c.state='connected' and o.created_at>=c.accepted_at
   or o.kind='connection_request' and c.state='requested' and c.requested_by=o.actor_id))
 )
$$;

-- Deletion (spec, "Deletion is explicit"): the profile stays, as 'Deleted member', so the foreign keys never cascade; the
-- account's pairs and refusals, either side, are deleted with the request. The deletion lifecycle is local-only
-- (20261022120001_gi2_local_delivery_and_deletion; the hosted project has none of it, and 20261030120000_push_delivery
-- keeps it so): its request function is redefined only where it exists, so this file still applies on the hosted
-- baseline, and the release that brings deletion to hosted must carry these two deletes. Otherwise the 20261022120001
-- body; its grants are kept.
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
 delete from public.attendees where user_id=p_user;
 delete from private.device_endpoints where user_id=p_user;
 delete from private.notification_outbox where recipient_id=p_user;
 return jsonb_build_object('requestId',p_request,'status','queued');
end $$;
$fn$;
 end if;
end $migration$;
