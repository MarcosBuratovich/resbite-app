-- Chat core: every resbite gets a chat. The people going (and the hosts) read and write it with the whole history, hosts
-- send announcements, Resbite writes the system lines, messages arrive live with a push, and a one-off resbite's chat
-- goes read-only 48 hours after its end.
-- Spec: docs/superpowers/specs/2026-11-10-groups-and-chat-design.md (CH-D1–D6; CH-P1–P3, P5–P12, P14–P19)
-- Plan: docs/superpowers/plans/2026-11-11-chat-1-core.md (Tasks 1 to 3), with the rulings in its Revised lists
-- Hosted-compatible: depends only on the migrations in supabase/tests/hosted-baseline/migrations.txt,
-- 20261111120000_connections_follow_ups.sql and 20261111130000_circles_of_trust.sql (private.first_name), and on the
-- hosted project's Realtime (locally a stub in supabase/tests/local/bootstrap.sql; this file never creates it).
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
-- other person in its payload is a uuid. A deleted account's messages lose their author (Decision 14). client_id makes
-- a resend from the phone the same message. created_at is the moment the row was made (clock_timestamp(), so rows of
-- one transaction keep their order); updated_at moves on every update (messages_touch), for chat_messages_since.
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
alter table public.messages enable row level security;
revoke all on public.messages from public, anon, authenticated, service_role;
-- The identity's sequence is granted by the same defaults; no role but the database's needs it.
revoke all on sequence public.messages_id_seq from public, anon, authenticated, service_role;

-- Every update moves updated_at, so a removal, a deletion or a line updated in place reaches chat_messages_since.
-- The database's own: no role may call it.
create function private.messages_touch() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 new.updated_at := now();
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

-- Open for writing: before the close time; with no close time, unless the current occurrence is cancelled (on a
-- one-off, never). A series that does not exist is not open. Plan 2 redefines it for groups: a null close time on a
-- group means open (CH-R-A2, NOTE 1).
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
-- occurrence's people who have not answered when the chat is not a group. On a one-off these are "Going" and "Everyone
-- invited"; once plan 2 makes every group attendee a member, "Going this Thursday" and "Everyone in the group". A group
-- member who left after the end keeps their guest row but is no member, so is in neither. Any other audience: nobody.
create function private.announcement_audience(p_series uuid, p_audience text) returns setof uuid language sql stable security definer set search_path = '' as $$
 select m.id from private.chat_members(p_series) as m(id), private.current_occurrence(p_series) c
 where p_audience = 'everyone'
  or (p_audience = 'going' and (private.is_host(c.id, m.id)
   or exists (select 1 from public.attendees a where a.plan_id = c.id and a.user_id = m.id and a.response in ('accepted','maybe'))))
 union
 select a.user_id from private.current_occurrence(p_series) c join public.attendees a on a.plan_id = c.id
 where p_audience = 'everyone' and a.response = 'pending' and not private.chat_is_group(p_series)
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

-- The names a set of rows needs (K-B2, Shared interfaces): {"<uuid>": first name or null} for each row's author_id and
-- every top-level payload value that is a uuid, keyed as written. A uuid that is not a person (plan 2's plan_id in its
-- "next" and "stopped" lines) maps to null, and the app never shows it (NOTE 9). Anything that is not a row is skipped.
create function private.chat_names(p_rows jsonb) returns jsonb language sql stable security definer set search_path = '' as $$
 select coalesce(jsonb_object_agg(u.id, private.chat_first_name(u.id::uuid)), '{}'::jsonb)
 from (
  select r.value->>'author_id' as id
  from jsonb_array_elements(case when jsonb_typeof(p_rows) = 'array' then p_rows else '[]'::jsonb end) r
  where jsonb_typeof(r.value) = 'object' and r.value->>'author_id' is not null
  union
  select v.value #>> '{}'
  from jsonb_array_elements(case when jsonb_typeof(p_rows) = 'array' then p_rows else '[]'::jsonb end) r
   cross join lateral jsonb_each(case when jsonb_typeof(r.value->'payload') = 'object' then r.value->'payload' else '{}'::jsonb end) v
  where jsonb_typeof(v.value) = 'string'
   and v.value #>> '{}' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
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
-- chat of its current occurrence; count is message_count. announcements: for each plan where the caller has not
-- answered, the latest announcement to everyone still sent that was written while that plan was current; id lets
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
         where m.series_id = p.series_id and m.plan_id = p.id and m.kind = 'announcement' and m.audience = 'everyone' and m.state = 'sent'
         order by m.id desc limit 1) m
       where a.user_id = v_uid and a.response = 'pending') x;
 return jsonb_build_object('chats', v_chats, 'announcements', v_announcements, 'names', private.chat_names(v_lasts || v_authors));
end $$;
revoke all on function private.my_chat_overview() from public, anon, authenticated, service_role;
create function public.my_chat_overview() returns jsonb language sql stable security invoker set search_path = '' as $$
 select private.my_chat_overview()
$$;
revoke all on function public.my_chat_overview() from public, anon, authenticated, service_role;
grant execute on function private.my_chat_overview(), public.my_chat_overview() to authenticated;
