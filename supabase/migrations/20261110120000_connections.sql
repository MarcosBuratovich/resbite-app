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
-- began there (CO-P14). from_user cannot ask to_user again from it, and is never told (CO-P3); to_user may still ask.
-- An acceptance between the two on that series clears it. Functions only.
create table private.connection_refusals (
 series_id uuid not null,
 from_user uuid not null references public.profiles(id) on delete cascade,
 to_user uuid not null references public.profiles(id) on delete cascade,
 refused_at timestamptz not null default now(),
 primary key (series_id,from_user,to_user)
);
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
-- double tap) run one after the other: the second finds the first's row and never meets the primary key. Each notice's
-- dedupe key ends with the time of its row, to the second (the request's created_at, the acceptance's accepted_at): a
-- retry queues nothing twice, while a request sent again after a cancel or a removal, or a second acceptance, is told.

-- Asking, from a resbite. The caller must see names there (can_see_guests: a host, or a guest who has answered), and the
-- person asked must be on it as its owner, an admin or a guest who has answered (Going, Maybe or Can't go): someone who
-- hasn't answered can't be asked, as the request would tell them who else is on it (UX2-D6). Attendee rows stay after
-- the end, so connecting stays possible on an ended resbite. Returns 'requested' (asked now or before) or 'connected'
-- (connected before, or the other person had asked: asking back accepts). It never returns a refused state (CO-P3):
-- when there is no row and the person asked refused the caller on this series (a "Not now", or a removal), it returns
-- 'requested' too, and stores and sends nothing, so the app shows "Request sent" as for any request.
create function private.request_connection(p_user uuid, p_plan uuid) returns text language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_tester(); v_a uuid; v_b uuid; v_series uuid; v_row public.connections; v_at timestamptz;
begin
 select p.user_a,p.user_b into v_a,v_b from private.pair(v_uid,p_user) p;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_a::text||':'||v_b::text,53));
 if p_user=v_uid then raise exception 'That is you' using errcode='22023'; end if;
 if not private.can_see_guests(p_plan) then raise exception 'Names required' using errcode='42501'; end if;
 -- CH-P21 (groups and chat): on a group any guest may be asked, whatever their reply; public.chats does not exist yet.
 if not (private.is_host(p_plan,p_user)
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
 -- Refused on this series: it looks sent, and nothing is stored or sent.
 if exists(select 1 from private.connection_refusals where series_id=v_series and from_user=v_uid and to_user=p_user) then return 'requested'; end if;
 -- clock_timestamp, not now(): the notice's key carries the request's time, so a request sent again after a cancel is
 -- told again even when both fall in one transaction.
 insert into public.connections(user_a,user_b,state,requested_by,series_id,created_at)
  values(v_a,v_b,'requested',v_uid,v_series,pg_catalog.clock_timestamp()) returning created_at into v_at;
 insert into private.notification_outbox(plan_id,recipient_id,kind,dedupe_key,actor_id)
  values(p_plan,p_user,'connection_request','connect:'||v_a||':'||v_b||':'||v_series||':'||extract(epoch from v_at)::bigint,v_uid) on conflict do nothing;
 return 'requested';
end $$;
create function public.request_connection(p_user uuid, p_plan uuid) returns text language sql security invoker set search_path = '' as $$
 select private.request_connection(p_user,p_plan)
$$;
revoke all on function private.request_connection(uuid,uuid), public.request_connection(uuid,uuid) from public, anon, authenticated, service_role;
grant execute on function private.request_connection(uuid,uuid), public.request_connection(uuid,uuid) to authenticated;

-- Accepting: only the person asked. A refusal between the two on the request's series, either way, goes: they are
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
 delete from private.connection_refusals where series_id=v_row.series_id and (from_user,to_user) in ((v_a,v_b),(v_b,v_a));
 select id into v_plan from public.plans where series_id=v_row.series_id order by starts_at desc,id limit 1;
 if v_plan is null then
  select p.id into v_plan from public.plans p where p.id in (
   (select id from public.plans where owner_id=v_a union select plan_id from public.attendees where user_id=v_a)
   intersect
   (select id from public.plans where owner_id=v_b union select plan_id from public.attendees where user_id=v_b))
  order by p.starts_at desc,p.id limit 1;
 end if;
 if v_plan is not null then
  insert into private.notification_outbox(plan_id,recipient_id,kind,dedupe_key,actor_id)
   values(v_plan,p_user,'connection_accepted','connected:'||v_a||':'||v_b||':'||extract(epoch from v_at)::bigint,v_uid) on conflict do nothing;
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
  insert into private.connection_refusals(series_id,from_user,to_user) values(v_row.series_id,p_user,v_uid) on conflict do nothing;
 end if;
end $$;
create function public.decline_connection(p_user uuid) returns void language sql security invoker set search_path = '' as $$
 select private.decline_connection(p_user)
$$;
revoke all on function private.decline_connection(uuid), public.decline_connection(uuid) from public, anon, authenticated, service_role;
grant execute on function private.decline_connection(uuid), public.decline_connection(uuid) to authenticated;

-- Cancelling: the requester takes a live request back, silently; it may be sent again. Anything else (no request, the
-- other person's, a connection, or a request refused unseen) is a quiet no-op.
create function private.cancel_connection_request(p_user uuid) returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_tester(); v_a uuid; v_b uuid;
begin
 select p.user_a,p.user_b into v_a,v_b from private.pair(v_uid,p_user) p;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_a::text||':'||v_b::text,53));
 delete from public.connections where user_a=v_a and user_b=v_b and state='requested' and requested_by=v_uid;
end $$;
create function public.cancel_connection_request(p_user uuid) returns void language sql security invoker set search_path = '' as $$
 select private.cancel_connection_request(p_user)
$$;
revoke all on function private.cancel_connection_request(uuid), public.cancel_connection_request(uuid) from public, anon, authenticated, service_role;
grant execute on function private.cancel_connection_request(uuid), public.cancel_connection_request(uuid) to authenticated;

-- Removing: either side ends a connection, silently. It is kept as a refusal of the other side by the remover on the
-- series they met at (CO-P14): the one removed cannot ask again from it (they may from another resbite they share),
-- while the remover may. A connection with no series leaves nothing to key it on. Nothing to remove is quiet.
create function private.remove_connection(p_user uuid) returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_tester(); v_a uuid; v_b uuid; v_row public.connections;
begin
 select p.user_a,p.user_b into v_a,v_b from private.pair(v_uid,p_user) p;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_a::text||':'||v_b::text,53));
 delete from public.connections where user_a=v_a and user_b=v_b and state='connected' returning * into v_row;
 if v_row.series_id is not null then
  insert into private.connection_refusals(series_id,from_user,to_user) values(v_row.series_id,p_user,v_uid) on conflict do nothing;
 end if;
end $$;
create function public.remove_connection(p_user uuid) returns void language sql security invoker set search_path = '' as $$
 select private.remove_connection(p_user)
$$;
revoke all on function private.remove_connection(uuid), public.remove_connection(uuid) from public, anon, authenticated, service_role;
grant execute on function private.remove_connection(uuid), public.remove_connection(uuid) to authenticated;
