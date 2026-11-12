-- Chat core: every resbite gets a chat. The people going (and the hosts) read and write it with the whole history, hosts
-- send announcements, Resbite writes the system lines, messages arrive live with a push, and a one-off resbite's chat
-- goes read-only 48 hours after its end.
-- Spec: docs/superpowers/specs/2026-11-10-groups-and-chat-design.md (CH-D1–D6; CH-P1–P3, P5–P12, P14–P19)
-- Plan: docs/superpowers/plans/2026-11-11-chat-1-core.md (Tasks 1 to 3), with the rulings in its Revised lists
-- Hosted-compatible: depends only on the migrations in supabase/tests/hosted-baseline/migrations.txt,
-- 20261111120000_connections_follow_ups.sql and 20261111130000_circles_of_trust.sql (private.first_name, and the claim,
-- the deletion request and the fold this file copies), and on the hosted project's Realtime (locally a stub in
-- supabase/tests/local/bootstrap.sql; this file never creates it).
-- Rollback: supabase/rollback/20261111140000_chat_core.rollback.sql (Task 3)
--
-- The chat's identity is the series (CH-P1): a one-off is its own series, and every occurrence of a repeating resbite
-- opens the same chat. Membership is computed, never stored (rule 1): private.chat_member decides, on the series'
-- current occurrence, and every read, write, push and realtime check calls it. Until plan 2 lands, a repeating series
-- follows the one-off rules on its current occurrence (Decision 4); nothing in this plan makes a chat a group.
-- Nobody reads the four tables directly (Decision 2, Global Constraints): RLS on, no policy, no grant, and the reads are
-- functions. Hosted grants every new public table, sequence and function to anon, authenticated and service_role by
-- default, so each one here is revoked from all four roles before its own grants (K-S5, K-N13).

-- Section 1 (Task 1): a chat per series, who is in it, when it closes, and the reads.

-- 1a. The tables.

-- One row per message, announcement or system line. series_id is the chat; plan_id is the occurrence current when it was
-- written (the day grouping, and the cascade). A system line has no author (K-B2): who acted is payload.actor, and every
-- other person in its payload is a uuid. A deleted account's messages lose their author and their words (Decision 14;
-- messages_touch, H42). client_id makes a resend from the phone the same message. created_at is the moment the row was
-- made (clock_timestamp(), so rows of one transaction keep their order); updated_at moves on every update
-- (messages_touch), for chat_messages_since.
create table public.messages (
 id bigint generated always as identity primary key,
 series_id uuid not null,
 plan_id uuid not null references public.plans(id) on delete cascade,
 author_id uuid null references public.profiles(id) on delete set null,
 kind text not null check (kind in ('message','announcement','system')),
 audience text null check (audience in ('going','everyone')),
 event text null,
 payload jsonb null,
 body text null check (body is null or char_length(body) between 1 and 1000),
 client_id uuid null,
 state text not null default 'sent' check (state in ('sent','deleted','removed')),
 created_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default now(),
 unique (author_id, client_id)
);
create index messages_series_idx on public.messages(series_id, id);
-- Serves chat_messages_since's "changed after the cursor".
create index messages_series_updated_idx on public.messages(series_id, updated_at);
-- Serves the latest announcements of a series: the invitation card's (my_chat_overview) and the pinned one (Task 2).
create index messages_series_announcements_idx on public.messages(series_id, id) where kind = 'announcement';
alter table public.messages enable row level security;
revoke all on public.messages from public, anon, authenticated, service_role;
-- The identity's sequence is granted by the same defaults; no role but the database's needs it.
revoke all on sequence public.messages_id_seq from public, anon, authenticated, service_role;

-- Every update moves updated_at, so a removal, a deletion or a line updated in place reaches chat_messages_since.
-- A message or an announcement whose author goes from someone to nobody loses its words, and reads deleted if it was
-- still sent (CH-P18, H42): however the profile went (the deletion request does it itself; a profile deleted any other
-- way nulls the author through the key), no words stay under "Someone". The stats trigger then fixes the count and
-- the pin. The fold moves an author to another account, never to nobody, so its messages keep their words. The
-- database's own: no role may call it.
create function private.messages_touch() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 new.updated_at := now();
 if new.kind in ('message','announcement') and old.author_id is not null and new.author_id is null then
  new.body := null;
  if new.state = 'sent' then new.state := 'deleted'; end if;
 end if;
 return new;
end $$;
revoke all on function private.messages_touch() from public, anon, authenticated, service_role;
create trigger messages_touch before update on public.messages for each row execute function private.messages_touch();

-- One row per series (Decision 3). is_group is the group flag's one definition (CH-R-A6): false here, and plan 2 sets it.
-- Task 2's trigger keeps last_message_id, last_message_at, pinned_message_id and message_count.
create table public.chats (
 series_id uuid primary key,
 is_group boolean not null default false,
 last_message_id bigint null,
 last_message_at timestamptz null,
 pinned_message_id bigint null,
 message_count int not null default 0
);
alter table public.chats enable row level security;
revoke all on public.chats from public, anon, authenticated, service_role;

-- The chat row comes with the plan: creating it, Do this again (a new series) and the roll (the same series, so nothing
-- new). The database's own: no role may call it.
create function private.plans_chat_row() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 insert into public.chats(series_id) values (new.series_id) on conflict do nothing;
 return null;
end $$;
revoke all on function private.plans_chat_row() from public, anon, authenticated, service_role;
create trigger plans_chat_row after insert on public.plans for each row execute function private.plans_chat_row();
-- Every series there is already.
insert into public.chats(series_id) select distinct series_id from public.plans on conflict do nothing;

-- How far each person has read (K-S11), and who muted a chat (CH-P8): written by Task 2's functions only.
create table public.chat_reads (
 series_id uuid,
 user_id uuid references public.profiles(id) on delete cascade,
 last_read_id bigint not null,
 primary key (series_id, user_id)
);
alter table public.chat_reads enable row level security;
revoke all on public.chat_reads from public, anon, authenticated, service_role;
create table public.chat_mutes (
 series_id uuid,
 user_id uuid references public.profiles(id) on delete cascade,
 muted_at timestamptz not null default now(),
 primary key (series_id, user_id)
);
alter table public.chat_mutes enable row level security;
revoke all on public.chat_mutes from public, anon, authenticated, service_role;

-- 1b. Who is in the chat, and when it closes. The database's own: no role may call any of them (K-N13). Each is SQL, so
-- each comes after what its body names (NOTE 6).

-- The series' current occurrence: the plan with no successor (nothing repeats from it), the latest start on a tie. Null
-- for a series that does not exist.
create function private.current_occurrence(p_series uuid) returns public.plans language sql stable security definer set search_path = '' as $$
 select p.* from public.plans p
 where p.series_id = p_series and not exists (select 1 from public.plans n where n.repeats_from = p.id)
 order by p.starts_at desc, p.id desc
 limit 1
$$;
revoke all on function private.current_occurrence(uuid) from public, anon, authenticated, service_role;

-- In the chat (CH-P2, the one-off rule): on the current occurrence, a host (the owner, or an admin still on it) or
-- someone Going or Maybe. Not answered and Can't go are not in. Plan 2 replaces this for groups, and only this.
create function private.chat_member(p_series uuid, p_user uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select coalesce((
  select private.is_host(c.id, p_user)
   or exists (select 1 from public.attendees a where a.plan_id = c.id and a.user_id = p_user and a.response in ('accepted','maybe'))
  from private.current_occurrence(p_series) c
  where c.id is not null and p_user is not null), false)
$$;
revoke all on function private.chat_member(uuid,uuid) from public, anon, authenticated, service_role;

-- Everyone in the chat (K-S4): the current occurrence's hosts and guests, filtered by chat_member. Every fan-out,
-- audience and count uses it, so plan 2 changes membership in chat_member alone.
create function private.chat_members(p_series uuid) returns setof uuid language sql stable security definer set search_path = '' as $$
 select m.id from (
  select h.id from private.current_occurrence(p_series) c cross join lateral private.host_ids(c.id) as h(id) where c.id is not null
  union
  select a.user_id from private.current_occurrence(p_series) c join public.attendees a on a.plan_id = c.id
 ) m
 where private.chat_member(p_series, m.id)
$$;
revoke all on function private.chat_members(uuid) from public, anon, authenticated, service_role;

-- When the chat closes (CH-P15, CH-D4): the current occurrence's end (its start when it has none) + 48 hours, computed,
-- never stored. Null means "no close time" (Shared interfaces): on a one-off only when it was cancelled, which closes the
-- chat at once (CH-R-A2). Plan 2 returns null for a running group.
create function private.chat_closes_at(p_series uuid) returns timestamptz language sql stable security definer set search_path = '' as $$
 select case when c.status = 'cancelled' then null else private.plan_end(c.starts_at, c.ends_at) + interval '48 hours' end
 from private.current_occurrence(p_series) c
$$;
revoke all on function private.chat_closes_at(uuid) from public, anon, authenticated, service_role;

-- Open for writing: before the close time; with no close time, open unless cancelled; on a one-off a null close time
-- means cancelled, so closed. A series that does not exist is not open. Plan 2 redefines it for groups: a null close
-- time on a group means open (CH-R-A2, NOTE 1).
create function private.chat_open(p_series uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select coalesce(now() < private.chat_closes_at(p_series), c.status <> 'cancelled', false)
 from private.current_occurrence(p_series) c
$$;
revoke all on function private.chat_open(uuid) from public, anon, authenticated, service_role;

-- The group flag, read from its one column (CH-R-A6): false throughout plan 1. Before announcement_audience (NOTE 6).
create function private.chat_is_group(p_series uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select coalesce((select c.is_group from public.chats c where c.series_id = p_series), false)
$$;
revoke all on function private.chat_is_group(uuid) from public, anon, authenticated, service_role;

-- Who an announcement reaches (K-N2, SHOULD 1), defined once, from chat_members, so plan 2 needs no change. 'going': the
-- members who are a host of the current occurrence or Going or Maybe on it. 'everyone': every member, plus the current
-- occurrence's people who have not answered when the chat is not a group, while that occurrence is active and has not
-- ended (H30): an invitation that is over, or cancelled, reaches nobody new. On a one-off these are "Going" and
-- "Everyone invited"; once plan 2 makes every group attendee a member, "Going this Thursday" and "Everyone in the group".
-- A group member who left after the end keeps their guest row but is no member, so is in neither. Any other audience:
-- nobody.
create function private.announcement_audience(p_series uuid, p_audience text) returns setof uuid language sql stable security definer set search_path = '' as $$
 select m.id from private.chat_members(p_series) as m(id), private.current_occurrence(p_series) c
 where p_audience = 'everyone'
  or (p_audience = 'going' and (private.is_host(c.id, m.id)
   or exists (select 1 from public.attendees a where a.plan_id = c.id and a.user_id = m.id and a.response in ('accepted','maybe'))))
 union
 select a.user_id from private.current_occurrence(p_series) c join public.attendees a on a.plan_id = c.id
 where p_audience = 'everyone' and a.response = 'pending' and not private.chat_is_group(p_series)
  and c.status = 'active' and private.plan_end(c.starts_at, c.ends_at) > now()
$$;
revoke all on function private.announcement_audience(uuid,text) from public, anon, authenticated, service_role;

-- 1c. Names and rows. The database's own: no role may call them.

-- A person's first name in a chat (rule 8), the circles helper's (CO-R17), so a name reads the same in a push and in a
-- chat line. Null when the profile is gone (a folded web account) or its account is being deleted or was: the app
-- shows "Someone".
create function private.chat_first_name(p_user uuid) returns text language sql stable security definer set search_path = '' as $$
 select private.first_name(p.display_name) from public.profiles p where p.id = p_user and p.deletion_requested_at is null
$$;
revoke all on function private.chat_first_name(uuid) from public, anon, authenticated, service_role;

-- The row every read returns: {id, kind, audience, event, payload, body, state, author_id, created_at, updated_at,
-- client_id}. The body only while the row is sent; client_id only on the viewer's own rows, so a phone can match what
-- it sent and nobody learns another's.
create function private.chat_row(p_message public.messages, p_viewer uuid) returns jsonb language sql stable security definer set search_path = '' as $$
 select jsonb_build_object('id', p_message.id, 'kind', p_message.kind, 'audience', p_message.audience, 'event', p_message.event,
  'payload', p_message.payload, 'body', case when p_message.state = 'sent' then p_message.body end, 'state', p_message.state,
  'author_id', p_message.author_id, 'created_at', p_message.created_at, 'updated_at', p_message.updated_at)
  || case when p_message.author_id is not null and p_message.author_id = p_viewer
      then jsonb_build_object('client_id', p_message.client_id) else '{}'::jsonb end
$$;
revoke all on function private.chat_row(public.messages,uuid) from public, anon, authenticated, service_role;

-- The names a set of rows needs (K-B2, Shared interfaces, H22): {"<uuid>": first name or null} for each row's
-- author_id and for the payload's person keys, actor, user and brought_by, when they hold a uuid; keyed as written. No
-- other payload value is looked up: a place label or a title is free text, and a uuid typed there must never turn into
-- someone's first name. Plans 2 and 3 add their own person keys here by name. Anything that is not a row is skipped.
create function private.chat_names(p_rows jsonb) returns jsonb language sql stable security definer set search_path = '' as $$
 select coalesce(jsonb_object_agg(u.id, private.chat_first_name(u.id::uuid)), '{}'::jsonb)
 from (
  select r.value->>'author_id' as id
  from jsonb_array_elements(case when jsonb_typeof(p_rows) = 'array' then p_rows else '[]'::jsonb end) r
  where jsonb_typeof(r.value) = 'object' and r.value->>'author_id' is not null
  union
  select r.value->'payload'->>k.key
  from jsonb_array_elements(case when jsonb_typeof(p_rows) = 'array' then p_rows else '[]'::jsonb end) r
   cross join unnest(array['actor','user','brought_by']) as k(key)
  where jsonb_typeof(r.value->'payload') = 'object' and jsonb_typeof(r.value->'payload'->k.key) = 'string'
   and r.value->'payload'->>k.key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 ) u
$$;
revoke all on function private.chat_names(jsonb) from public, anon, authenticated, service_role;

-- 1d. The reads. Each refuses anyone not in the chat, 42501 'Not in this chat', and is for signed-in accounts only, its
-- private body too (the house shape). Plan 3 copies these bodies to hide a blocked author.

-- The chat's header, sheet and state (K-N2, K-N7, K-S11, K-S12): {series_id, plan_id, title, starts_at, ends_at,
-- time_zone, status, repeat_weeks, is_group, stopped, closes_at, open, host, accepted, members, going, everyone, pinned,
-- last, names, muted_chat, muted_resbite, last_read_id, unread, message_count}, about the current occurrence. accepted
-- is the event page's Going number ("6 going"); members is "People in this chat · N"; going and everyone are the
-- announcement sheet's. pinned and last are rows (or null), and names covers both. last_read_id is 0 before any read.
-- unread: a sent row after the caller's read that is neither theirs nor a line about something they did. is_group is
-- chats.is_group and stopped is false: plan 2 fills them, keeping both names.
create function private.chat_summary(p_series uuid) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := private.require_tester(); v_plan public.plans; v_chat public.chats; v_pinned jsonb; v_last jsonb; v_read bigint;
begin
 if not private.chat_member(p_series, v_uid) then raise exception 'Not in this chat' using errcode='42501'; end if;
 v_plan := private.current_occurrence(p_series);
 select * into v_chat from public.chats c where c.series_id = p_series;
 select private.chat_row(m, v_uid) into v_pinned from public.messages m where m.id = v_chat.pinned_message_id and m.series_id = p_series;
 select private.chat_row(m, v_uid) into v_last from public.messages m where m.id = v_chat.last_message_id and m.series_id = p_series;
 select r.last_read_id into v_read from public.chat_reads r where r.series_id = p_series and r.user_id = v_uid;
 return jsonb_build_object(
  'series_id', p_series, 'plan_id', v_plan.id, 'title', v_plan.title, 'starts_at', v_plan.starts_at, 'ends_at', v_plan.ends_at,
  'time_zone', v_plan.time_zone, 'status', v_plan.status, 'repeat_weeks', v_plan.repeat_weeks,
  'is_group', coalesce(v_chat.is_group, false), 'stopped', false,
  'closes_at', private.chat_closes_at(p_series), 'open', private.chat_open(p_series),
  'host', private.is_host(v_plan.id, v_uid),
  'accepted', (select count(*) from public.attendees a where a.plan_id = v_plan.id and a.response = 'accepted'),
  'members', (select count(*) from private.chat_members(p_series)),
  'going', (select count(*) from private.announcement_audience(p_series, 'going')),
  'everyone', (select count(*) from private.announcement_audience(p_series, 'everyone')),
  'pinned', v_pinned, 'last', v_last, 'names', private.chat_names(jsonb_build_array(v_pinned, v_last)),
  'muted_chat', exists (select 1 from public.chat_mutes cm where cm.series_id = p_series and cm.user_id = v_uid),
  'muted_resbite', exists (select 1 from public.plan_mutes pm where pm.series_id = p_series and pm.user_id = v_uid),
  'last_read_id', coalesce(v_read, 0),
  'unread', exists (select 1 from public.messages m where m.series_id = p_series and m.state = 'sent' and m.id > coalesce(v_read, 0)
   and m.author_id is distinct from v_uid and (m.payload->>'actor') is distinct from v_uid::text),
  'message_count', coalesce(v_chat.message_count, 0));
end $$;
revoke all on function private.chat_summary(uuid) from public, anon, authenticated, service_role;
create function public.chat_summary(p_series uuid) returns jsonb language sql stable security invoker set search_path = '' as $$
 select private.chat_summary(p_series)
$$;
revoke all on function public.chat_summary(uuid) from public, anon, authenticated, service_role;
grant execute on function private.chat_summary(uuid), public.chat_summary(uuid) to authenticated;

-- A page of the history (rule 2): {rows, names, as_of}. rows in id order, the page ending just before p_before (the
-- newest when null); p_limit clamped to 1..100, 50 when null (K-N10). as_of is now(), the app's next cursor (K-B1).
create function private.chat_messages(p_series uuid, p_before bigint, p_limit int) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := private.require_tester(); v_rows jsonb; v_limit int := greatest(1, least(coalesce(p_limit, 50), 100));
begin
 if not private.chat_member(p_series, v_uid) then raise exception 'Not in this chat' using errcode='42501'; end if;
 select coalesce(jsonb_agg(private.chat_row(m, v_uid) order by m.id), '[]'::jsonb) into v_rows
 from (select * from public.messages m
       where m.series_id = p_series and (p_before is null or m.id < p_before)
       order by m.id desc limit v_limit) m;
 return jsonb_build_object('rows', v_rows, 'names', private.chat_names(v_rows), 'as_of', now());
end $$;
revoke all on function private.chat_messages(uuid,bigint,int) from public, anon, authenticated, service_role;
create function public.chat_messages(p_series uuid, p_before bigint default null, p_limit int default 50) returns jsonb
language sql stable security invoker set search_path = '' as $$
 select private.chat_messages(p_series, p_before, p_limit)
$$;
revoke all on function public.chat_messages(uuid,bigint,int) from public, anon, authenticated, service_role;
grant execute on function private.chat_messages(uuid,bigint,int), public.chat_messages(uuid,bigint,int) to authenticated;

-- What changed since the app's last read (K-B1): {rows, names, as_of}. One read covers new rows, changed rows (a
-- removal, a deletion, a line updated in place) and late commits; up to 200 rows in id order.
create function private.chat_messages_since(p_series uuid, p_after bigint, p_changed_after timestamptz) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := private.require_tester(); v_rows jsonb;
begin
 if not private.chat_member(p_series, v_uid) then raise exception 'Not in this chat' using errcode='42501'; end if;
 -- rows: newer than the newest id the app holds, or changed since its cursor (a removal, a deletion, a line updated in
 -- place, or a row whose transaction committed after the last read). A null cursor tests ids only.
 select coalesce(jsonb_agg(private.chat_row(m, v_uid) order by m.id), '[]'::jsonb) into v_rows
 from (select * from public.messages m
       where m.series_id = p_series
         and (m.id > coalesce(p_after, 0) or (p_changed_after is not null and m.updated_at > p_changed_after))
       order by m.id limit 200) m;
 return jsonb_build_object('rows', v_rows, 'names', private.chat_names(v_rows), 'as_of', now());
end $$;
revoke all on function private.chat_messages_since(uuid,bigint,timestamptz) from public, anon, authenticated, service_role;
create function public.chat_messages_since(p_series uuid, p_after bigint, p_changed_after timestamptz) returns jsonb
language sql stable security invoker set search_path = '' as $$
 select private.chat_messages_since(p_series, p_after, p_changed_after)
$$;
revoke all on function public.chat_messages_since(uuid,bigint,timestamptz) from public, anon, authenticated, service_role;
grant execute on function private.chat_messages_since(uuid,bigint,timestamptz), public.chat_messages_since(uuid,bigint,timestamptz) to authenticated;

-- My resbites' view (CH-P14, the invitation card): {"chats": {"<series_id>": {unread, last, open, count}},
-- "announcements": {"<plan_id>": {id, author_id, body}}, "names": {…}}. chats: every series where the caller is in the
-- chat of its current occurrence; count is message_count. announcements (H22, H23): for the caller's unanswered row on
-- a series' current occurrence, while it is active and has not ended, the series' latest sent announcement whose
-- audience includes the caller (the pinned one, when that reaches them), keyed by that occurrence. A past, cancelled or
-- ended occurrence gives none, so an invitation that is over, or a guest taken off, keeps no announcement. id lets
-- plan 3 report it from the card (SHOULD 7). names covers every last row and every announcement's author. Anyone
-- signed in may ask: it holds only their own.
create function private.my_chat_overview() returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := private.require_tester(); v_chats jsonb; v_lasts jsonb; v_announcements jsonb; v_authors jsonb;
begin
 select coalesce(jsonb_object_agg(s.series_id, jsonb_build_object(
   'unread', exists (select 1 from public.messages m where m.series_id = s.series_id and m.state = 'sent' and m.id > s.read_id
    and m.author_id is distinct from v_uid and (m.payload->>'actor') is distinct from v_uid::text),
   'last', s.last, 'open', private.chat_open(s.series_id), 'count', s.count)), '{}'::jsonb),
  coalesce(jsonb_agg(s.last) filter (where s.last is not null), '[]'::jsonb)
 into v_chats, v_lasts
 from (select c.series_id, coalesce(ch.message_count, 0) as count,
        coalesce((select r.last_read_id from public.chat_reads r where r.series_id = c.series_id and r.user_id = v_uid), 0) as read_id,
        (select private.chat_row(m, v_uid) from public.messages m where m.id = ch.last_message_id and m.series_id = c.series_id) as last
       from (select p.series_id from public.plans p where p.owner_id = v_uid
             union
             select p.series_id from public.attendees a join public.plans p on p.id = a.plan_id where a.user_id = v_uid) c
       left join public.chats ch on ch.series_id = c.series_id
       where private.chat_member(c.series_id, v_uid)) s;
 select coalesce(jsonb_object_agg(x.plan_id, jsonb_build_object('id', x.id, 'author_id', x.author_id, 'body', x.body)), '{}'::jsonb),
  coalesce(jsonb_agg(jsonb_build_object('author_id', x.author_id)), '[]'::jsonb)
 into v_announcements, v_authors
 from (select p.id as plan_id, m.id, m.author_id, m.body
       from public.attendees a join public.plans p on p.id = a.plan_id
       cross join lateral (select m.id, m.author_id, m.body from public.messages m
         where m.series_id = p.series_id and m.kind = 'announcement' and m.state = 'sent'
          and exists (select 1 from private.announcement_audience(p.series_id, m.audience) as r(id) where r.id = v_uid)
         order by m.id desc limit 1) m
       where a.user_id = v_uid and a.response = 'pending' and p.status = 'active'
        and private.plan_end(p.starts_at, p.ends_at) > now()
        and p.id = (private.current_occurrence(p.series_id)).id) x;
 return jsonb_build_object('chats', v_chats, 'announcements', v_announcements, 'names', private.chat_names(v_lasts || v_authors));
end $$;
revoke all on function private.my_chat_overview() from public, anon, authenticated, service_role;
create function public.my_chat_overview() returns jsonb language sql stable security invoker set search_path = '' as $$
 select private.my_chat_overview()
$$;
revoke all on function public.my_chat_overview() from public, anon, authenticated, service_role;
grant execute on function private.my_chat_overview(), public.my_chat_overview() to authenticated;

-- Section 2 (Task 2): writing, announcements, delete and remove, mutes and reads; the two notices with one push a
-- minute; the claim's chat fields; the deletion step.

-- 2a. The outbox's two chat kinds. A chat notice names the message it is about: message_id, which goes with the
-- message. The kind check is replaced by exact name, keeping the eleven of 20261110120000_connections. The index serves
-- the one-push-a-minute test of send_message (K-B3.1, K-N11): a recipient's chat notices by time.
alter table private.notification_outbox add column message_id bigint null references public.messages(id) on delete cascade;
alter table private.notification_outbox drop constraint notification_outbox_kind_check;
alter table private.notification_outbox add constraint notification_outbox_kind_check
 check (kind in ('invitation','rsvp','plan_changed','plan_cancelled','guest_note','invited','join_request','join_approved','admin_added',
  'connection_request','connection_accepted','chat_message','announcement'));
create index notification_outbox_recipient_kind_idx on private.notification_outbox(recipient_id, kind, created_at);
-- Serves the cascade when a message goes, and the claim's and the check's way from a notice to its message.
create index notification_outbox_message_idx on private.notification_outbox(message_id);
-- Serves the writers' limits (K-S8): an author's messages and announcements of the last minute.
create index messages_author_created_idx on public.messages(author_id, created_at);

-- 2b. The chat row's figures (K-S12, K-N12, Decision 9), kept by a trigger on every message written or changed:
-- last_message_id and last_message_at follow the newest row inserted (any kind; a lower id committing late never moves
-- them back); message_count counts the messages and announcements that are sent, so it moves when one is written sent
-- or leaves sent; pinned_message_id is the latest announcement still sent, recomputed when an announcement is written
-- or changes state, so removing or deleting the pinned one pins the one before, or nothing. The chat row is locked
-- before it is read, so a writer that waited on another reads what that one committed. It runs under the roll and
-- deletion flags too: a deleted account's announcement unpins. The database's own: no role may call it.
create function private.messages_chat_stats() returns trigger language plpgsql security definer set search_path = '' as $$
declare v_delta int := 0; v_pin boolean;
begin
 if new.kind in ('message','announcement') and new.state = 'sent' then v_delta := 1; end if;
 if tg_op = 'UPDATE' then
  if old.kind in ('message','announcement') and old.state = 'sent' then v_delta := v_delta - 1; end if;
  v_pin := 'announcement' in (old.kind, new.kind) and old.state is distinct from new.state;
  if v_delta = 0 and not v_pin then return null; end if;
 else
  v_pin := new.kind = 'announcement';
 end if;
 perform 1 from public.chats c where c.series_id = new.series_id for update;
 update public.chats c set
  last_message_id = case when tg_op = 'INSERT' and new.id > coalesce(c.last_message_id, 0) then new.id else c.last_message_id end,
  last_message_at = case when tg_op = 'INSERT' and new.id > coalesce(c.last_message_id, 0) then new.created_at else c.last_message_at end,
  message_count = c.message_count + v_delta,
  pinned_message_id = case when v_pin then (select max(m.id) from public.messages m
   where m.series_id = new.series_id and m.kind = 'announcement' and m.state = 'sent') else c.pinned_message_id end
 where c.series_id = new.series_id;
 return null;
end $$;
revoke all on function private.messages_chat_stats() from public, anon, authenticated, service_role;
create trigger messages_chat_stats after insert or update on public.messages for each row execute function private.messages_chat_stats();

-- 2c. The words of a message or an announcement (K-S8, step 4; H28, H30): trimmed at both ends of white space, of the
-- blanks this database's \s misses (U+00A0, U+0085, U+115F, U+1680, U+2000–U+200B, U+2028, U+2029, U+202F, U+205F,
-- U+2060, U+2800, U+3000, U+3164, U+FEFF, U+FFA0) and of ZWNJ (U+200C); then 1 to 1000 characters, at least one of
-- them visible as the sender's visible() counts it: not white space, a control character (Cc), a format character
-- (Cf: U+00AD, U+0600–U+0605, U+061C, U+06DD, U+070F, U+0890–U+0891, U+08E2, U+180E, U+200B–U+200F, U+202A–U+202E,
-- U+2060–U+2064, U+2066–U+206F, U+FEFF, U+FFF9–U+FFFB, U+110BD, U+110CD, U+13430–U+1343F, U+1BCA0–U+1BCA3,
-- U+1D173–U+1D17A, U+E0001, U+E0020–U+E007F), a default-ignorable one (U+034F, U+115F, U+1160, U+17B4, U+17B5,
-- U+180B–U+180F, U+2065, U+3164, U+FE00–U+FE0F, U+FFA0, U+FFF0–U+FFF8, U+E0000–U+E0FFF) or a braille blank (U+2800).
-- Null when they are not. A ZWJ or a zero-width space inside the words is kept: it holds an emoji or a word together.
-- The classes name every character, since \s here does not take U+00A0 and hosted's may differ. Over 16,000 bytes is
-- null, refused like any unusable body, before any pattern runs (H42): the 1,000 characters kept are at most 4,000
-- bytes, the rest is room for blanks around them, and a megabyte posted again and again costs no regex. The
-- database's own: no role may call it.
create function private.chat_body(p_body text) returns text language sql immutable security definer set search_path = '' as $$
 select t.body from (select case when pg_catalog.octet_length(p_body) <= 16000 then pg_catalog.regexp_replace(p_body,
   '^[\s\u0085\u00a0\u115f\u1680\u2000-\u200c\u2028\u2029\u202f\u205f\u2060\u2800\u3000\u3164\ufeff\uffa0]+'
   '|[\s\u0085\u00a0\u115f\u1680\u2000-\u200c\u2028\u2029\u202f\u205f\u2060\u2800\u3000\u3164\ufeff\uffa0]+$', '', 'g') end as body) t
 where pg_catalog.char_length(t.body) between 1 and 1000
  and t.body ~ ('[^\s\u0001-\u001f\u007f-\u00a0\u00ad\u034f\u0600-\u0605\u061c\u06dd\u070f\u0890\u0891\u08e2\u115f\u1160\u1680'
   '\u17b4\u17b5\u180b-\u180f\u2000-\u200f\u2028-\u202f\u205f-\u206f\u2800\u3000\u3164\ufe00-\ufe0f\ufeff\uffa0\ufff0-\ufffb'
   '\U000110bd\U000110cd\U00013430-\U0001343f\U0001bca0-\U0001bca3\U0001d173-\U0001d17a\U000e0000-\U000e0fff]')
$$;
revoke all on function private.chat_body(text) from public, anon, authenticated, service_role;

-- 2d. Writing (K-S8, K-B3.1, Decision 6). Each returns the row as chat_row gives it (the app names its own rows "You",
-- so no names map). Checks, in this order:
--  1. the caller's row with this client id is returned as it is and nothing is queued, so a resend after a lost
--     answer, after the close or after leaving gets its stored row; on another series or of the other kind it is not
--     the same message, 22023 'Invalid message';
--  2. send_message: in the chat, else 42501 'Not in this chat'; send_announcement: a host of the current occurrence,
--     else 42501 'Hosts only';
--  3. open, else 22023 'Chat closed'; the words (chat_body) and, for an announcement, its audience (going or everyone),
--     else 22023 'Invalid message';
--  4. the author's lock (require_tester's key), so one person's parallel calls meet the limits one at a time (H28);
--     send_announcement: no announcement by the caller in this chat in the last minute, else 22023 'Too fast';
--  5. no more than 30 messages and announcements by the caller, in any chat, in the last minute: the 31st is
--     22023 'Slow down';
--  6. the chat's lock (K-B3.1), held to the commit, so writers in one chat queue their notices one after another;
--  7. the insert, on conflict (author_id, client_id) doing nothing: when nothing comes back, a concurrent repeat won,
--     and that row is returned (with step 1's checks) and nothing queued;
--  8. the notices. A message: one chat_message to each other member, unless they already have one for this chat from
--     the last 60 seconds (one push a minute, decided here; the first message of the minute is pushed). An
--     announcement: one to each person its audience reaches but the author, never held back (CH-P7). Both on the
--     current occurrence, with the author as actor and the row as message_id (H6).
create function private.send_message(p_series uuid, p_body text, p_client_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_tester(); v_row public.messages; v_body text; v_plan uuid; v_id bigint;
begin
 select * into v_row from public.messages m where m.author_id = v_uid and m.client_id = p_client_id;
 if found then
  if v_row.series_id is distinct from p_series or v_row.kind <> 'message' then raise exception 'Invalid message' using errcode='22023'; end if;
  return private.chat_row(v_row, v_uid);
 end if;
 if not private.chat_member(p_series, v_uid) then raise exception 'Not in this chat' using errcode='42501'; end if;
 if not private.chat_open(p_series) then raise exception 'Chat closed' using errcode='22023'; end if;
 v_body := private.chat_body(p_body);
 if v_body is null then raise exception 'Invalid message' using errcode='22023'; end if;
 -- The author's lock (require_tester's key; already held where require_tester takes it), so one person's writes queue
 -- one after another and the limits below hold under parallel calls (H28).
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_uid::text, 47));
 if (select count(*) from public.messages m where m.author_id = v_uid and m.kind in ('message','announcement')
     and m.created_at > now() - interval '1 minute') >= 30 then
  raise exception 'Slow down' using errcode='22023';
 end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('chat:'||p_series, 0));
 v_plan := (private.current_occurrence(p_series)).id;
 insert into public.messages(series_id, plan_id, author_id, kind, body, client_id)
 values (p_series, v_plan, v_uid, 'message', v_body, p_client_id)
 on conflict (author_id, client_id) do nothing returning id into v_id;
 if v_id is null then
  select * into v_row from public.messages m where m.author_id = v_uid and m.client_id = p_client_id;
  if v_row.series_id is distinct from p_series or v_row.kind <> 'message' then raise exception 'Invalid message' using errcode='22023'; end if;
  return private.chat_row(v_row, v_uid);
 end if;
 insert into private.notification_outbox(plan_id, recipient_id, kind, dedupe_key, actor_id, message_id)
 select v_plan, r.id, 'chat_message', 'chat:'||v_id||':'||r.id, v_uid, v_id
 from private.chat_members(p_series) as r(id)
 where r.id <> v_uid
   and not exists (select 1 from private.notification_outbox o join public.messages m on m.id = o.message_id
                   where o.recipient_id = r.id and o.kind = 'chat_message' and m.series_id = p_series
                     and o.created_at > now() - interval '60 seconds')
 on conflict do nothing;
 select * into v_row from public.messages m where m.id = v_id;
 return private.chat_row(v_row, v_uid);
end $$;
revoke all on function private.send_message(uuid,text,uuid) from public, anon, authenticated, service_role;
create function public.send_message(p_series uuid, p_body text, p_client_id uuid) returns jsonb
language sql security invoker set search_path = '' as $$
 select private.send_message(p_series, p_body, p_client_id)
$$;
revoke all on function public.send_message(uuid,text,uuid) from public, anon, authenticated, service_role;
grant execute on function private.send_message(uuid,text,uuid), public.send_message(uuid,text,uuid) to authenticated;

create function private.send_announcement(p_series uuid, p_body text, p_audience text, p_client_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_tester(); v_row public.messages; v_body text; v_plan uuid; v_id bigint;
begin
 select * into v_row from public.messages m where m.author_id = v_uid and m.client_id = p_client_id;
 if found then
  if v_row.series_id is distinct from p_series or v_row.kind <> 'announcement' then raise exception 'Invalid message' using errcode='22023'; end if;
  return private.chat_row(v_row, v_uid);
 end if;
 v_plan := (private.current_occurrence(p_series)).id;
 if v_plan is null or not private.is_host(v_plan, v_uid) then raise exception 'Hosts only' using errcode='42501'; end if;
 if not private.chat_open(p_series) then raise exception 'Chat closed' using errcode='22023'; end if;
 v_body := private.chat_body(p_body);
 if v_body is null or p_audience is null or p_audience not in ('going','everyone') then
  raise exception 'Invalid message' using errcode='22023';
 end if;
 -- The author's lock, as send_message takes it (H28).
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_uid::text, 47));
 if exists (select 1 from public.messages m where m.author_id = v_uid and m.series_id = p_series and m.kind = 'announcement'
     and m.created_at > now() - interval '1 minute') then
  raise exception 'Too fast' using errcode='22023';
 end if;
 if (select count(*) from public.messages m where m.author_id = v_uid and m.kind in ('message','announcement')
     and m.created_at > now() - interval '1 minute') >= 30 then
  raise exception 'Slow down' using errcode='22023';
 end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('chat:'||p_series, 0));
 insert into public.messages(series_id, plan_id, author_id, kind, audience, body, client_id)
 values (p_series, v_plan, v_uid, 'announcement', p_audience, v_body, p_client_id)
 on conflict (author_id, client_id) do nothing returning id into v_id;
 if v_id is null then
  select * into v_row from public.messages m where m.author_id = v_uid and m.client_id = p_client_id;
  if v_row.series_id is distinct from p_series or v_row.kind <> 'announcement' then raise exception 'Invalid message' using errcode='22023'; end if;
  return private.chat_row(v_row, v_uid);
 end if;
 insert into private.notification_outbox(plan_id, recipient_id, kind, dedupe_key, actor_id, message_id)
 select v_plan, r.id, 'announcement', 'announce:'||v_id||':'||r.id, v_uid, v_id
 from private.announcement_audience(p_series, p_audience) as r(id)
 where r.id <> v_uid
 on conflict do nothing;
 select * into v_row from public.messages m where m.id = v_id;
 return private.chat_row(v_row, v_uid);
end $$;
revoke all on function private.send_announcement(uuid,text,text,uuid) from public, anon, authenticated, service_role;
create function public.send_announcement(p_series uuid, p_body text, p_audience text, p_client_id uuid) returns jsonb
language sql security invoker set search_path = '' as $$
 select private.send_announcement(p_series, p_body, p_audience, p_client_id)
$$;
revoke all on function public.send_announcement(uuid,text,text,uuid) from public, anon, authenticated, service_role;
grant execute on function private.send_announcement(uuid,text,text,uuid), public.send_announcement(uuid,text,text,uuid) to authenticated;

-- 2e. Delete and remove (K-B2, K-N12, K-S17, Decision 7). Only messages and announcements: a system line is neither
-- the caller's nor removable. delete_message: the caller's own row, else 42501 'Not your message'; it becomes deleted
-- with no body. remove_message: a row in a chat where the caller is a host of the current occurrence, else 42501
-- 'Hosts only'; it becomes removed with no body, or deleted when it is the caller's own, so a host's words never read
-- "removed". Both work after the close. A row already deleted or removed keeps its state: a removal is never turned
-- into a deletion by its author, and a retry changes nothing. Each locks the chat's row before the message's, as the
-- stats trigger and the deletion take them (H28), so a removal and an account deletion never deadlock. remove_message
-- asks again under that lock whether the caller is a host (Task 3), so a host whose role went while the removal
-- waited removes nothing.
create function private.delete_message(p_id bigint) returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_tester(); v_row public.messages;
begin
 select * into v_row from public.messages m where m.id = p_id and m.kind in ('message','announcement');
 if not found or v_row.author_id is distinct from v_uid then raise exception 'Not your message' using errcode='42501'; end if;
 perform 1 from public.chats c where c.series_id = v_row.series_id for update;
 update public.messages set state = 'deleted', body = null where id = p_id and state = 'sent' and author_id = v_uid;
end $$;
revoke all on function private.delete_message(bigint) from public, anon, authenticated, service_role;
create function public.delete_message(p_id bigint) returns void language sql security invoker set search_path = '' as $$
 select private.delete_message(p_id)
$$;
revoke all on function public.delete_message(bigint) from public, anon, authenticated, service_role;
grant execute on function private.delete_message(bigint), public.delete_message(bigint) to authenticated;

create function private.remove_message(p_id bigint) returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_tester(); v_row public.messages;
begin
 select * into v_row from public.messages m where m.id = p_id and m.kind in ('message','announcement');
 if not found or not coalesce(private.is_host((private.current_occurrence(v_row.series_id)).id, v_uid), false) then
  raise exception 'Hosts only' using errcode='42501';
 end if;
 perform 1 from public.chats c where c.series_id = v_row.series_id for update;
 if not coalesce(private.is_host((private.current_occurrence(v_row.series_id)).id, v_uid), false) then
  raise exception 'Hosts only' using errcode='42501';
 end if;
 update public.messages set state = case when author_id = v_uid then 'deleted' else 'removed' end, body = null
 where id = p_id and state = 'sent';
end $$;
revoke all on function private.remove_message(bigint) from public, anon, authenticated, service_role;
create function public.remove_message(p_id bigint) returns void language sql security invoker set search_path = '' as $$
 select private.remove_message(p_id)
$$;
revoke all on function public.remove_message(bigint) from public, anon, authenticated, service_role;
grant execute on function private.remove_message(bigint), public.remove_message(bigint) to authenticated;

-- 2f. Reads and mutes (K-S11, CH-P8, H23). For someone in the chat, else 42501 'Not in this chat'. mark_chat_read
-- moves the caller's read forward only, and never past the chat's last message: a larger id reads as far as that, and
-- a null id reads nothing (it moves no read). set_chat_mute mutes the chat's pushes of messages (announcements still
-- come) or, with false, unmutes.
create function private.mark_chat_read(p_series uuid, p_last_id bigint) returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_tester(); v_id bigint;
begin
 if not private.chat_member(p_series, v_uid) then raise exception 'Not in this chat' using errcode='42501'; end if;
 select least(greatest(coalesce(p_last_id, 0), 0), coalesce(c.last_message_id, 0)) into v_id from public.chats c where c.series_id = p_series;
 insert into public.chat_reads(series_id, user_id, last_read_id) values (p_series, v_uid, coalesce(v_id, 0))
 on conflict (series_id, user_id) do update set last_read_id = greatest(public.chat_reads.last_read_id, excluded.last_read_id);
end $$;
revoke all on function private.mark_chat_read(uuid,bigint) from public, anon, authenticated, service_role;
create function public.mark_chat_read(p_series uuid, p_last_id bigint) returns void language sql security invoker set search_path = '' as $$
 select private.mark_chat_read(p_series, p_last_id)
$$;
revoke all on function public.mark_chat_read(uuid,bigint) from public, anon, authenticated, service_role;
grant execute on function private.mark_chat_read(uuid,bigint), public.mark_chat_read(uuid,bigint) to authenticated;

create function private.set_chat_mute(p_series uuid, p_muted boolean) returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_tester();
begin
 if not private.chat_member(p_series, v_uid) then raise exception 'Not in this chat' using errcode='42501'; end if;
 if p_muted then
  insert into public.chat_mutes(series_id, user_id) values (p_series, v_uid) on conflict do nothing;
 else
  delete from public.chat_mutes where series_id = p_series and user_id = v_uid;
 end if;
end $$;
revoke all on function private.set_chat_mute(uuid,boolean) from public, anon, authenticated, service_role;
create function public.set_chat_mute(p_series uuid, p_muted boolean) returns void language sql security invoker set search_path = '' as $$
 select private.set_chat_mute(p_series, p_muted)
$$;
revoke all on function public.set_chat_mute(uuid,boolean) from public, anon, authenticated, service_role;
grant execute on function private.set_chat_mute(uuid,boolean), public.set_chat_mute(uuid,boolean) to authenticated;

-- 2g. Who may be told (K-N3, CH-P7, CH-P8). The two chat kinds get a branch of their own: the recipient may use the app
-- and is not being deleted, has not muted the resbite (plan_mutes, by series), the message is still sent, and its plan
-- (the notice's) has not been cancelled since (H30, Task 3); a chat_message under an hour old (K-N3), to someone in the
-- chat now who has not muted it; an announcement under a day old, to someone its audience reaches now
-- (announcement_audience: a host, Going or Maybe, or not answered for everyone while the one-off is active and has not
-- ended), muted chat or not. Every other kind keeps the 20261110120000_connections body, verbatim but for the kind test
-- that leaves the chat kinds out of the first branch; its grants are kept (nobody).
create or replace function private.notification_recipient_eligible(p_outbox bigint) returns boolean
language sql stable security definer set search_path='' as $$
 select exists (
 select 1 from private.notification_outbox o
 join public.plans plan on plan.id=o.plan_id
 where o.id=p_outbox and o.kind not in ('connection_request','connection_accepted','chat_message','announcement')
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
 ) or exists (
 select 1 from private.notification_outbox o
 join public.messages msg on msg.id=o.message_id
 join public.plans plan on plan.id=o.plan_id
 where o.id=p_outbox and o.kind in ('chat_message','announcement')
 and private.user_eligible(o.recipient_id) and not private.deletion_pending(o.recipient_id)
 and not exists(select 1 from public.plan_mutes m where m.series_id=msg.series_id and m.user_id=o.recipient_id)
 and msg.state='sent' and plan.status<>'cancelled'
 and (o.kind='chat_message' and o.created_at>now()-interval '1 hour'
   and private.chat_member(msg.series_id,o.recipient_id)
   and not exists(select 1 from public.chat_mutes cm where cm.series_id=msg.series_id and cm.user_id=o.recipient_id)
  or o.kind='announcement' and o.created_at>now()-interval '24 hours'
   and exists(select 1 from private.announcement_audience(msg.series_id,msg.audience) as r(id) where r.id=o.recipient_id))
 )
$$;

-- 2h. The worker's claim, with the chat (K-B3.2, H42): the expansion and the pick both take every other kind before
-- the chat kinds, so a change, a cancellation or an answer is never queued or sent behind a lively chat's notices. The
-- expansion makes no delivery for a chat_message its recipient has already read (chat_reads at or past the message):
-- a push for words already read is noise. It is checked once, there: a read after the expansion still gets its push.
-- Each job also carries series_id (the chat it opens), message_id (as text, like outbox_id: H6), message_body (the
-- words, for the two chat kinds only, while the message is sent) and audience (an announcement's). All four are null
-- for every other kind. A chat notice over an hour old is dropped by the eligibility check (K-N3, H17), as an
-- announcement over a day old is. actor_name is null for an actor who is being deleted or was (H19), as
-- brought_by_name is. The one push a minute is send_message's (Decision 6): the claim has no such rule. Otherwise the
-- 20261111130000_circles_of_trust body (brought_by_name, the rsvp of someone no longer on the guest list suppressed,
-- the jobs in the order the notices were made); its grants are kept (service_role only).
create or replace function public.claim_notification_deliveries(p_limit integer default 25) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_outbox record; v_result jsonb;
begin
 -- Endpoint expansion is once per logical event; never notify a newly bound device about old events. The chat kinds
 -- come last (K-B3.2).
 for v_outbox in select o.id from private.notification_outbox o
 where o.expanded_at is null and o.delivered_at is null order by (o.kind in ('chat_message','announcement')), o.id limit 100 for update skip locked
 loop
  if private.notification_recipient_eligible(v_outbox.id)
   and not exists(select 1 from private.notification_outbox o join public.messages m on m.id=o.message_id
    join public.chat_reads r on r.series_id=m.series_id and r.user_id=o.recipient_id
    where o.id=v_outbox.id and o.kind='chat_message' and r.last_read_id>=o.message_id) then
   insert into private.notification_deliveries(outbox_id,token,endpoint_updated_at)
   select o.id,e.token,e.updated_at from private.notification_outbox o
   join private.device_endpoints e on e.user_id=o.recipient_id where o.id=v_outbox.id
   on conflict do nothing;
  end if;
  update private.notification_outbox set expanded_at=now() where id=v_outbox.id;
 end loop;
 -- A crashed send without a persisted ticket is uncertain: never blindly send it again.
 update private.notification_deliveries set state='unknown',lease_id=null,lease_until=null
 where state='sending' and lease_until<now();
 update private.notification_deliveries d set state='suppressed',lease_id=null,lease_until=null
 where d.state in ('pending','ticket') and (not private.notification_recipient_eligible(d.outbox_id)
 or not exists(select 1 from private.device_endpoints e join private.notification_outbox o on o.id=d.outbox_id
 where e.token=d.token and e.user_id=o.recipient_id and e.updated_at=d.endpoint_updated_at));
 -- An answer from someone no longer on the guest list (removed since) is not news (circles of trust).
 update private.notification_deliveries d set state='suppressed',lease_id=null,lease_until=null
 from private.notification_outbox o where o.id=d.outbox_id and d.state='pending' and o.kind='rsvp' and o.actor_id is not null
 and not exists(select 1 from public.attendees a where a.plan_id=o.plan_id and a.user_id=o.actor_id);
 -- The pick takes every other kind first too (K-B3.2, H42): deliveries expanded in one claim share their
 -- next_attempt_at, and earlier ones have an earlier one, so by time alone a change would wait behind the chat jobs
 -- expanded with it or before it.
 with picked as (
 select d.id from private.notification_deliveries d join private.notification_outbox o on o.id=d.outbox_id
 where d.state in ('pending','ticket')
 and d.next_attempt_at<=now() and (d.lease_until is null or d.lease_until<now())
 order by (o.kind in ('chat_message','announcement')),d.next_attempt_at,d.id limit greatest(1,least(coalesce(p_limit,25),25))
 for update of d skip locked
 ), claimed as (
 update private.notification_deliveries d set lease_id=gen_random_uuid(),lease_until=now()+interval '2 minutes',
 attempts=d.attempts+1,state=case when d.ticket_id is null then 'sending' else 'ticket' end
 from picked where d.id=picked.id returning d.*
 )
 select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'lease_id',d.lease_id,'outbox_id',d.outbox_id::text,
 'plan_id',o.plan_id,'recipient_id',o.recipient_id,'token',d.token,'attempts',d.attempts,
 'ticket_id',d.ticket_id,'ticket_created_at',d.ticket_created_at,
 'kind',o.kind,'detail',o.detail,'title',plan.title,'starts_at',plan.starts_at,'time_zone',plan.time_zone,
 'actor_name',actor.display_name,
 -- Who brought the person who answered (circles of trust): an rsvp only, by first name, unless that account is being
 -- deleted or is the recipient; null otherwise, so other jobs carry nothing more (UX2-D4).
 'brought_by_name',case when o.kind='rsvp' then (select private.first_name(b.display_name)
  from public.attendees a join public.profiles b on b.id=a.brought_by
  where a.plan_id=o.plan_id and a.user_id=o.actor_id and a.brought_by<>o.recipient_id and not private.deletion_pending(b.id)) end,
 -- The chat (chat core): the chat a notice opens, its message and, for the two chat kinds only, the words.
 'series_id',msg.series_id,'message_id',o.message_id::text,
 'message_body',case when o.kind in ('chat_message','announcement') and msg.state='sent' then msg.body end,
 'audience',msg.audience)
 -- In the order the notices were made (circles of trust).
 order by o.id, d.id),'[]'::jsonb) into v_result
 from claimed d join private.notification_outbox o on o.id=d.outbox_id
 join public.plans plan on plan.id=o.plan_id
 left join public.profiles actor on actor.id=o.actor_id and not private.deletion_pending(o.actor_id)
 left join public.messages msg on msg.id=o.message_id;
 update private.notification_outbox o set delivered_at=now() where o.expanded_at is not null and o.delivered_at is null
 and not exists(select 1 from private.notification_deliveries d where d.outbox_id=o.id and d.state in ('pending','sending','ticket'));
 return v_result;
end $$;

-- 2i. The worker's outcome (H21): 'deferred' is a job the sender claimed but could not start before its budget ran out.
-- It goes back at once (no 30 s floor; the delay is clamped to 0..3600 and the sender sends 0) to pending, or to ticket
-- when it holds one (its ticket_id is kept: the sender sends no ticket), and the attempt the claim counted is given
-- back, so a job handed back is never lost to the attempt limit. Otherwise the 20261030120000_push_delivery body; its
-- grants are kept (service_role only).
create or replace function public.finish_notification_delivery(p_id uuid,p_lease uuid,p_outcome text,p_ticket text default null,p_delay_seconds integer default 0)
returns void language plpgsql security definer set search_path='' as $$
declare d private.notification_deliveries; v_recipient uuid;
begin
 if p_outcome not in ('ticket','received','retry','failed','invalid','unknown','suppressed','deferred') then raise exception 'Invalid delivery outcome'; end if;
 select * into d from private.notification_deliveries where id=p_id and lease_id=p_lease and lease_until>now() for update;
 if not found then return; end if; -- deletion or obsolete worker lease
 if p_outcome='ticket' and (p_ticket is null or length(p_ticket) not between 1 and 512) then raise exception 'Ticket required'; end if;
 if p_outcome='invalid' then
  select recipient_id into v_recipient from private.notification_outbox where id=d.outbox_id;
  delete from private.device_endpoints where token=d.token and user_id=v_recipient and updated_at=d.endpoint_updated_at;
 end if;
 update private.notification_deliveries set
 state=case when p_outcome='retry' then case when attempts>=8 then 'unknown' when ticket_id is null then 'pending' else 'ticket' end
  when p_outcome='deferred' then case when ticket_id is null then 'pending' else 'ticket' end else p_outcome end,
 attempts=case when p_outcome='deferred' then greatest(attempts-1,0) else attempts end,
 ticket_id=case when p_outcome='ticket' then p_ticket else ticket_id end,
 ticket_created_at=case when p_outcome='ticket' then now() else ticket_created_at end,
 next_attempt_at=case when p_outcome='deferred' then now()+make_interval(secs=>greatest(0,least(coalesce(p_delay_seconds,0),3600)))
  else now()+make_interval(secs=>greatest(30,least(coalesce(p_delay_seconds,30),3600))) end,
 lease_id=null,lease_until=null where id=d.id;
 update private.notification_outbox o set delivered_at=now() where o.id=d.outbox_id
 and not exists(select 1 from private.notification_deliveries x where x.outbox_id=o.id and x.state in ('pending','sending','ticket'));
end $$;

-- 2j. Deletion (K-S2, K-B2, K-N5, Decision 14, H27). Asking to delete an account first sets the deletion's flag, so no
-- chat line is written for what the deletion does (its cancellations, the place scrub); then, besides what it did, the
-- account's messages and announcements lose their words and their author (those still sent read deleted, a removed one
-- stays removed), and its chat reads and mutes go.
-- It never edits a system line's payload (K-S3). The deletion lifecycle is local-only (20261022120001_gi2_local_delivery_and_deletion;
-- the hosted project has none of it): the function is redefined only where it exists, so this file still applies on
-- the hosted baseline, and the release that brings deletion to hosted must carry these statements. Otherwise the
-- 20261111130000_circles_of_trust body (BLOCKING 1: it empties brought_by and deletes the removal records); its
-- grants are kept.
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
 -- Chat (K-S2): from here to the commit, the chat-line triggers write nothing, so the cancellations and the scrub below
 -- write no line.
 perform set_config('resbite.system','deletion',true);
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
 -- Chat (K-B2, K-N5, Decision 14, H27): the account's messages and announcements lose their words and their author;
 -- those still sent read deleted, and one a host removed stays removed. Each chat's row is locked first, in one order,
 -- before the message rows, as delete_message, remove_message and the stats trigger take them, so they never deadlock
 -- with each other (H28). A deleted announcement unpins (K-S12). A system line is left as it is, payload and all
 -- (K-S3): the names map shows the person as nobody. Its reads and mutes go.
 perform 1 from public.chats c where c.series_id in (select m.series_id from public.messages m
  where m.author_id=p_user and m.kind in ('message','announcement')) order by c.series_id for update;
 update public.messages set state=case when state='sent' then 'deleted' else state end,body=null,author_id=null
  where author_id=p_user and kind in ('message','announcement');
 delete from public.chat_reads where user_id=p_user;
 delete from public.chat_mutes where user_id=p_user;
 delete from public.attendees where user_id=p_user;
 delete from private.device_endpoints where user_id=p_user;
 delete from private.notification_outbox where recipient_id=p_user;
 return jsonb_build_object('requestId',p_request,'status','queued');
end $$;
$fn$;
 end if;
end $migration$;

-- Section 3 (Task 3): Resbite's own lines and the live signal.

-- 3a. The system lines (Decision 1, K-B2, K-S2, K-S3). Triggers on public.attendees, public.plans and public.plan_admins
-- write them in the same transaction as the change (CH rule 7), so respond, answer_phone_invitation,
-- decide_join_request, change_plan_v4, appoint_admin and every later writer of those rows get them for free. A line has
-- no author: who acted is payload.actor (auth.uid(), null when nobody did, as in the roll), and every other person in
-- it is a uuid that the reads name (chat_names: actor, user, brought_by). The app words the line, so plan 2 changes
-- wording for groups without touching the server. A line takes no chat lock: every event that writes one already holds
-- its plan's row (for update), and a message's insert takes that row's key-share lock after the chat's lock, so a line
-- waiting for the chat's lock under the plan's would deadlock against it. A line committing late may therefore sit
-- below a reader's read mark and never read as unread (accepted in Task 1's review); chat_messages_since still brings it.

-- A system line on a plan's chat: kind system, no author, the event, and the payload with actor = auth.uid() unless it
-- names an actor itself (the payload's keys win, so plan 2's roll writes its group lines with actor null through this,
-- on purpose). It checks no flag. The database's own: no role may call it (K-N13).
create function private.chat_system_line(p_plan uuid, p_event text, p_payload jsonb) returns void
language sql security definer set search_path = '' as $$
 insert into public.messages(series_id, plan_id, kind, event, payload)
 select p.series_id, p.id, 'system', p_event, jsonb_build_object('actor', auth.uid()) || coalesce(p_payload, '{}'::jsonb)
 from public.plans p where p.id = p_plan
$$;
revoke all on function private.chat_system_line(uuid,text,jsonb) from public, anon, authenticated, service_role;

-- Whether the chat-line triggers stand down (K-S2, Shared interfaces): under the roll's flag (plan 2's roll writes its
-- own lines) and the deletion's (request_account_deletion: its cancellations and its place scrub are no news). The
-- flag is transaction-local, set with set_config('resbite.system', …, true). The database's own: no role may call it.
create function private.chat_lines_off() returns boolean language sql stable security definer set search_path = '' as $$
 select coalesce(pg_catalog.current_setting('resbite.system', true), '') in ('roll', 'deletion')
$$;
revoke all on function private.chat_lines_off() from public, anon, authenticated, service_role;

-- An answer (K-S2, Decision 10, H8). Into Going or Maybe from anything else: joined {actor, user, brought_by when the
-- guest row has a bringer}. Out of Going or Maybe into Can't go: cant_go {actor, user}. A row put in not answered
-- writes nothing, and so does a move between Going and Maybe. When that person's latest joined or cant_go line in the
-- series was made in the last 10 minutes and no later system line names them (as actor, user or brought_by: H33), it is
-- that line that changes (its event and payload; created_at stays, updated_at moves, and messages_signal tells the open
-- chats again) instead of a new one, so a reply flipped back and forth is one line, and the feed's order stays true:
-- "Leo is now an admin" never sits under a "Leo can't make it" that came after it. Only joined and cant_go lines merge.
-- The trigger fires on the answer only (insert, or update of response): a guest row moved between
-- accounts (fold_web_account) or ended by the circles trigger beside it (attendees_close_waiting) writes nothing of its
-- own, and a row deleted later in the same transaction keeps the line it wrote. The database's own: no role may call it.
create function private.attendees_chat_lines() returns trigger language plpgsql security definer set search_path = '' as $$
declare v_event text; v_payload jsonb; v_series uuid; v_line bigint; v_made timestamptz;
begin
 if private.chat_lines_off() then return null; end if;
 if new.response in ('accepted','maybe') and (tg_op = 'INSERT' or old.response not in ('accepted','maybe')) then
  v_event := 'joined';
  v_payload := jsonb_build_object('actor', auth.uid(), 'user', new.user_id)
   || case when new.brought_by is not null then jsonb_build_object('brought_by', new.brought_by) else '{}'::jsonb end;
 elsif tg_op = 'UPDATE' and old.response in ('accepted','maybe') and new.response in ('declined','withdrawn') then
  v_event := 'cant_go';
  v_payload := jsonb_build_object('actor', auth.uid(), 'user', new.user_id);
 else
  return null;
 end if;
 -- That person's latest joined or cant_go line. Only a line made in the last 10 minutes can merge, so the search keeps
 -- to the rows updated in those 10 minutes (messages_series_updated_idx). On insert a row's updated_at (now(), its
 -- transaction's start) is a moment before its created_at (clock_timestamp()), so a line made in the last moments of
 -- the 10 minutes can be missed: the answer then writes a new line instead of merging, which is harmless. Ids follow
 -- the order rows are made in, so the highest id found is the latest line.
 select p.series_id into v_series from public.plans p where p.id = new.plan_id;
 select m.id, m.created_at into v_line, v_made from public.messages m
 where m.series_id = v_series and m.updated_at > now() - interval '10 minutes'
  and m.kind = 'system' and m.event in ('joined','cant_go') and m.payload->>'user' = new.user_id::text
 order by m.id desc limit 1;
 if v_line is not null and v_made > now() - interval '10 minutes'
  and not exists (select 1 from public.messages l where l.series_id = v_series and l.id > v_line and l.kind = 'system'
   and new.user_id::text in (l.payload->>'actor', l.payload->>'user', l.payload->>'brought_by')) then
  update public.messages set event = v_event, payload = v_payload where id = v_line;
 else
  perform private.chat_system_line(new.plan_id, v_event, v_payload);
 end if;
 return null;
end $$;
revoke all on function private.attendees_chat_lines() from public, anon, authenticated, service_role;
create trigger attendees_chat_lines after insert or update of response on public.attendees
 for each row execute function private.attendees_chat_lines();

-- A change of the plan (K-S2, K-S3). Cancelled: cancelled {actor}. While it is active, what change_plan_v4 counts as a
-- change: the time (starts_at, ends_at or time_zone distinct) or the place (place_label distinct; a place_tbd flip
-- with the label as it is writes nothing): changed {actor, what (time, place or time_place), from_start, to_start,
-- from_end, to_end, from_zone, to_zone, place_label (the new one)}. A title, a note, a circle (set_plan_circle) or a
-- version writes nothing. The deletion's scrub writes nothing under its flag, and the payload is never edited after
-- (K-S3). Plan 2 redefines this by name. The database's own: no role may call it.
create function private.plans_chat_lines() returns trigger language plpgsql security definer set search_path = '' as $$
declare v_time boolean; v_place boolean;
begin
 if private.chat_lines_off() then return null; end if;
 if new.status = 'cancelled' and old.status is distinct from 'cancelled' then
  perform private.chat_system_line(new.id, 'cancelled', '{}'::jsonb);
 elsif new.status = 'active' and old.status = 'active' then
  v_time := new.starts_at is distinct from old.starts_at or new.ends_at is distinct from old.ends_at or new.time_zone is distinct from old.time_zone;
  v_place := new.place_label is distinct from old.place_label;
  if v_time or v_place then
   perform private.chat_system_line(new.id, 'changed', jsonb_build_object(
    'what', case when v_time and v_place then 'time_place' when v_time then 'time' else 'place' end,
    'from_start', old.starts_at, 'to_start', new.starts_at, 'from_end', old.ends_at, 'to_end', new.ends_at,
    'from_zone', old.time_zone, 'to_zone', new.time_zone, 'place_label', new.place_label));
  end if;
 end if;
 return null;
end $$;
revoke all on function private.plans_chat_lines() from public, anon, authenticated, service_role;
create trigger plans_chat_lines after update on public.plans for each row execute function private.plans_chat_lines();

-- An appointment (appoint_admin): admin {actor, user}. Until plan 2's roll sets its flag, the roll's carried admins
-- write one each, with no actor (Decision 4). The database's own: no role may call it.
create function private.plan_admins_chat_lines() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 if private.chat_lines_off() then return null; end if;
 perform private.chat_system_line(new.plan_id, 'admin', jsonb_build_object('actor', auth.uid(), 'user', new.user_id));
 return null;
end $$;
revoke all on function private.plan_admins_chat_lines() from public, anon, authenticated, service_role;
create trigger plan_admins_chat_lines after insert on public.plan_admins for each row execute function private.plan_admins_chat_lines();

-- 3b. Folding a web account into an app account (H34). The 20261111130000_circles_of_trust body, verbatim, with one step
-- added before the web profile goes: the web account's messages and its place in the chat's system lines (the payload
-- keys that hold people) move to the app account, so a merged person keeps their name in the chat ("Wren joined",
-- not "Someone joined") and their next answer merges with their own line. The guest rows it moves keep their answers
-- and write no line (attendees_chat_lines fires on an answer, never on a move). Its grants are kept.
create or replace function private.fold_web_account(p_from uuid, p_into uuid) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_moved integer; v_disabled boolean; v_row record;
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
 -- app account before the web account goes (deleting it would cascade the record away). Where the app account already
 -- has one for that series, it keeps the later time.
 insert into private.plan_removals(series_id,user_id,removed_at) select series_id,p_into,removed_at from private.plan_removals
  where user_id=p_from
 on conflict (series_id,user_id) where user_id is not null do update set removed_at=greatest(private.plan_removals.removed_at,excluded.removed_at);
 delete from private.plan_removals where user_id=p_from;
 -- 2d. The removal holds (CO-R12): the app account's places on resbites not yet ended of a series where it is on
 -- record.
 for v_row in select a.plan_id, p.series_id,
   (select max(r.removed_at) from private.plan_removals r where r.series_id=p.series_id and r.user_id=p_into) as removed_at
  from public.attendees a join public.plans p on p.id=a.plan_id
  where a.user_id=p_into and private.plan_end(p.starts_at,p.ends_at)>now()
   and exists(select 1 from private.plan_removals r where r.series_id=p.series_id and r.user_id=p_into)
  order by a.plan_id
 loop
  if exists(select 1 from private.phone_invitations i where i.plan_id=v_row.plan_id and i.user_id=p_into and i.level=1
    and i.answered_at is not null and i.revoked_at is null and i.created_at>v_row.removed_at) then
   -- The host's later link, made after the record.
   delete from private.plan_removals where series_id=v_row.series_id and user_id=p_into;
  else
   update private.invitations set revoked_at=now() where plan_id=v_row.plan_id and claimed_by=p_into and revoked_at is null;
   update private.phone_invitations set revoked_at=now(), code_hash=null where plan_id=v_row.plan_id and (user_id=p_into
    or (revoked_at is null and phone=(select nullif(private.phone_key(u.phone),'') from auth.users u where u.id=p_into and u.phone_confirmed_at is not null)));
   delete from public.plan_admins where plan_id=v_row.plan_id and user_id=p_into;
   delete from public.attendees where plan_id=v_row.plan_id and user_id=p_into;
  end if;
 end loop;
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
 -- 3b. Chat (chat core, H34): the person's words and their place in Resbite's lines go to the app account before the
 -- web profile goes (which would leave a message with no author and a line naming nobody): a message's author, and
 -- the person keys of a system line's payload (actor, user, brought_by; K-B2).
 update public.messages set author_id=p_into where author_id=p_from;
 update public.messages m set payload=m.payload
  ||case when m.payload->>'actor'=p_from::text then jsonb_build_object('actor',p_into) else '{}'::jsonb end
  ||case when m.payload->>'user'=p_from::text then jsonb_build_object('user',p_into) else '{}'::jsonb end
  ||case when m.payload->>'brought_by'=p_from::text then jsonb_build_object('brought_by',p_into) else '{}'::jsonb end
 where m.kind='system' and p_from::text in (m.payload->>'actor',m.payload->>'user',m.payload->>'brought_by');
 -- 4. The web profile.
 delete from public.profiles where id=p_from;
 return jsonb_build_object('moved_attendees',v_moved);
end $$;

-- 3c. The live signal (CH-D2, K-S6, NOTE 3). Every row written to a chat and every update of one (a removal, a
-- deletion, a line updated in place) broadcasts {id, kind, state} on the private channel chat:<series_id>, event chat:
-- a signal only, never the words, so the app fetches through the reads (K-B1), and a phone that misses one catches up
-- on its next read. The call to realtime.send runs in a block of its own that turns any error into a warning (H33): a
-- realtime.send that is missing, not granted, behind a schema the definer may not use, of another signature, or
-- failing inside, so a broadcast never stops a write, and the write commits with no broadcast. (Hosted's realtime.send
-- also catches its own insert errors.) The runbook checks Realtime before and after (K-S5). The database's own: no role
-- may call it.
create function private.messages_signal() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 begin
  perform realtime.send(jsonb_build_object('id', new.id, 'kind', new.kind, 'state', new.state), 'chat', 'chat:' || new.series_id::text, true);
 exception when others then
  raise warning 'messages_signal: no broadcast for message %: % %', new.id, sqlstate, sqlerrm;
 end;
 return null;
end $$;
revoke all on function private.messages_signal() from public, anon, authenticated, service_role;
create trigger messages_signal after insert or update on public.messages for each row execute function private.messages_signal();

-- Who may listen to a chat's channel (K-S6, H23): a topic that is exactly chat:<a lower-case uuid>, matched before any
-- cast, and a caller who may use the app (user_eligible) and is in that chat now (chat_member). Anything else is false,
-- never an error. plpgsql, so a constant topic is never cast before the match. Realtime's policy calls it as the
-- signed-in caller, so it is the one helper granted to authenticated; chat_member itself stays ungranted.
create function private.can_listen(p_topic text) returns boolean language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
 if p_topic is null or p_topic !~ '^chat:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return false; end if;
 if v_uid is null or not private.user_eligible(v_uid) then return false; end if;
 return coalesce(private.chat_member(substring(p_topic from 6)::uuid, v_uid), false);
end $$;
revoke all on function private.can_listen(text) from public, anon, authenticated, service_role;
grant execute on function private.can_listen(text) to authenticated;

-- Realtime's own check when a phone joins chat:<series> (private channels): a broadcast on the very topic being checked
-- (H34: whoever selects under the check reads that chat's signals, never another's), and the topic passes can_listen.
-- No policy lets anyone send: clients never do.
create policy chat_members_listen on realtime.messages for select to authenticated
 using (realtime.messages.extension = 'broadcast' and realtime.messages.topic = (select realtime.topic())
  and private.can_listen((select realtime.topic())));
