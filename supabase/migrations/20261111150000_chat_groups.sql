-- Chat groups: a repeating resbite's chat is a group. Everyone invited to its current occurrence reads and writes it,
-- whatever they answered this week; it stays open while the series runs, and it closes 48 hours after the series stops
-- (Edit → "Doesn't repeat", "Cancel this and stop repeating", or an owner who may no longer use the app). Someone who
-- leaves is kept off the next occurrence.
-- Spec: docs/superpowers/specs/2026-11-10-groups-and-chat-design.md (CH-D3; CH-P1, CH-P4, CH-P15, CH-P20)
-- Plan: docs/superpowers/plans/2026-11-11-chat-2-groups.md (Tasks 1 and 2), with the rulings in its Revised lists
-- Hosted-compatible: depends only on the migrations in supabase/tests/hosted-baseline/migrations.txt,
-- 20261111120000_connections_follow_ups.sql, 20261111130000_circles_of_trust.sql and 20261111140000_chat_core.sql. Every
-- body it replaces is copied from its latest definition as built and changed only where its comment says: chat core's
-- (sha256 1047fb379a4e8a942b49db3f7134674caecf2cbb30f67e0ebf9f0f2fea6a78ce), the circles roll (sha256
-- 04062e2b091fa582f59a3d1ff9a322e8019ce671c64d532d5c113d0916d77256), the follow-ups request_connection and the
-- creating-a-resbite can_see_guests.
-- Rollback: supabase/rollback/20261111150000_chat_groups.rollback.sql
--
-- Chat core made the group flag (public.chats.is_group, CH-R-A6) and never set it. This file sets it: the backfill below
-- for every series that repeats or was rolled, and plans_group_flag for every one from now on. It never goes back to
-- false (CH-P1). Membership stays computed (rule 1): chat core's private.chat_member decides, and this file redefines it
-- alone for groups, so every read, write, push, audience and realtime check that calls it follows.

-- Section 1 (Task 1): the group flag, who is in a group's chat, when it closes, and the summary.

-- 1a. The stop time and the leave record.

-- When a group stopped (G-S1, G-B7): Edit → "Doesn't repeat" sets it when it is not set yet; "Cancel this and stop
-- repeating", or a cancel once the repeat is off, sets it to the cancellation's time; the repeat coming back clears it.
-- Null on a running group and on a one-off, cancelled or not (challenge NOTE 12).
alter table public.chats add column stopped_at timestamptz null;

-- Who left a group (Decision 2, G-S5): the roll's skip list (Task 2), and the one exception to membership: someone who
-- leaves after the current occurrence ended keeps their guest row, a real attendance, and is out of the chat. Any way
-- back in clears it (Decision 1, attendees_clear_leave below). Nobody reads it directly: RLS on, no policy, no grant
-- (K-S5).
create table private.series_leaves (
 series_id uuid not null,
 user_id uuid not null references public.profiles(id) on delete cascade,
 left_at timestamptz not null default now(),
 primary key (series_id, user_id)
);
alter table private.series_leaves enable row level security;
revoke all on private.series_leaves from public, anon, authenticated, service_role;

-- 1b. Hiding a system line (Decision 6, I8): the one way a system line leaves the feed. It takes state 'deleted', so
-- messages_touch moves updated_at and messages_signal tells the open chats, and chat_messages_since brings it to the
-- rest (chat core never reports a row removed by SQL delete, m6). The chat's row is locked first, as chat core locks it
-- before a message row everywhere (H28: delete_message, remove_message, the deletion), and the chat's advisory lock is
-- never taken: a line's event holds its plan's row, and a send takes that lock before the row (chat_core.sql:886-889).
-- messages_chat_stats ignores a system row's change of state (it counts only messages and announcements), so the last
-- message is fixed here: when it was this line, it becomes the series' newest row that is not a deleted system line,
-- with that row's time, or nothing when no row is left (confirmation 2, NOTE 4). A row that is not a sent system line is
-- left as it is. The database's own: no role may call it.
create function private.chat_hide_line(p_id bigint) returns void language plpgsql security definer set search_path = '' as $$
declare v_series uuid; v_newest public.messages;
begin
 select m.series_id into v_series from public.messages m where m.id = p_id and m.kind = 'system' and m.state = 'sent';
 if v_series is null then return; end if;
 perform 1 from public.chats c where c.series_id = v_series for update;
 update public.messages set state = 'deleted' where id = p_id and kind = 'system' and state = 'sent';
 if not found then return; end if;
 if exists (select 1 from public.chats c where c.series_id = v_series and c.last_message_id = p_id) then
  select m.* into v_newest from public.messages m
  where m.series_id = v_series and not (m.kind = 'system' and m.state = 'deleted')
  order by m.id desc limit 1;
  update public.chats set last_message_id = v_newest.id, last_message_at = v_newest.created_at where series_id = v_series;
 end if;
end $$;
revoke all on function private.chat_hide_line(bigint) from public, anon, authenticated, service_role;

-- 1c. Whether a group has stopped (G-S4): it is a group, and either its stop time is set or the owner of its current
-- occurrence may no longer use the app (the roll skips such a plan, so the series stops with its last occurrence).
-- False on a one-off and on a series with no chat row. Before chat_closes_at, which names it (chat core's order,
-- :117-118). The database's own: no role may call it.
create function private.group_stopped(p_series uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select coalesce((
  select c.is_group and (c.stopped_at is not null or not private.user_eligible((private.current_occurrence(p_series)).owner_id))
  from public.chats c where c.series_id = p_series), false)
$$;
revoke all on function private.group_stopped(uuid) from public, anon, authenticated, service_role;

-- 1d. The flag and the stop time, kept by the plan's own changes (CH-P1, G-N4, G-S1). Only the series' current
-- occurrence speaks for the series. On update it compares the old row with the new:
--  - a repeat set (an insert that repeats, or the repeat going from none to some): a group, running (stopped_at null).
--    On a series that was already a group (a resume), the series' latest stopped line still sent is hidden
--    (chat_hide_line, Decision 12, I8), and no line is written. On a chat that becomes a group with messages in it
--    (message_count: sent messages and announcements, never system lines, K-N12): made_group {actor} (G-N8);
--  - into cancelled with no repeat ("Cancel this and stop repeating", or a cancel once Edit stopped it): stopped now,
--    over any earlier stop time (G-S1), on a group only: a cancelled one-off keeps no stop time (challenge NOTE 12);
--  - the repeat going from some to none while active (Edit → "Doesn't repeat"): stopped now unless it already was, on
--    a group (always, since it repeated), and stopped {actor, plan_id, starts_at, time_zone} with this occurrence's id,
--    start and zone (G-N13).
-- The flag never goes back to false. Its lines go through chat_system_line and its one removal through chat_hide_line,
-- never under the roll's or the deletion's flag (chat_lines_off); the flag and the stop time are written under them too.
-- Locks (H28, ruling GR2 D1): the plan's row first (held by the event: change_plan_v4, the roll, the deletion), then the
-- chat's row, then a message row (a line, a hide). The chat's row is taken only where it is written, and locked before it
-- is read: when a series becomes a group (its new row, or a one-off made weekly by Edit), on a resume, and when a group
-- stops. A one-off's row is never taken: a cancelled one-off writes nothing here (the cancellation updates a group's row
-- only). Nor is a running group's when the roll adds its next occurrence: that is the one insert that takes no row
-- here. A new series' own row, a one-off made weekly and a resume are written here, so they take it. So the deletion's
-- plan loop, which cancels its owner's future resbites under its flag, takes no chat row but a stopped group's
-- (written: the cancellation's stop time), and its ordered pass over the chat rows of the series it wrote in is
-- otherwise the first chat lock it takes. The roll takes a group's chat row when it writes the group's ended and next
-- lines (section 2), rolling in series order, so in the deletion's order (supabase/tests/local/chat-groups-concurrency.sh).
-- Known gap (ruling GR2, parked): two account deletions at once can still deadlock when each owns a group stopped by
-- Edit with a future occurrence and each wrote in the other's chat, since the plan loop writes that stop time, in plan
-- order, before the ordered pass. request_account_deletion is local-only; the fix, one sorted pass over the chat rows
-- before the plan loop, belongs to the account-deletion lifecycle. A repeat set and Edit's stop write the row by upsert,
-- so the flag never depends on firing after plans_chat_row (G-N4). The database's own: no role may call it.
create function private.plans_group_flag() returns trigger language plpgsql security definer set search_path = '' as $$
declare v_was boolean; v_count integer; v_line bigint;
begin
 if (private.current_occurrence(new.series_id)).id is distinct from new.id then return null; end if;
 if new.repeat_weeks is not null and (tg_op = 'INSERT' or old.repeat_weeks is null) then
  -- The roll's next occurrence of a running group: nothing to write, so its chat row is not taken.
  if tg_op = 'INSERT' and exists (select 1 from public.chats c where c.series_id = new.series_id and c.is_group and c.stopped_at is null) then
   return null;
  end if;
  select c.is_group, c.message_count into v_was, v_count from public.chats c where c.series_id = new.series_id for update;
  insert into public.chats(series_id, is_group, stopped_at) values (new.series_id, true, null)
  on conflict (series_id) do update set is_group = true, stopped_at = null;
  if not private.chat_lines_off() then
   if coalesce(v_was, false) then
    if tg_op = 'UPDATE' then
     select m.id into v_line from public.messages m
     where m.series_id = new.series_id and m.kind = 'system' and m.event = 'stopped' and m.state = 'sent'
     order by m.id desc limit 1;
     if v_line is not null then perform private.chat_hide_line(v_line); end if;
    end if;
   elsif coalesce(v_count, 0) > 0 then
    perform private.chat_system_line(new.id, 'made_group', '{}'::jsonb);
   end if;
  end if;
 elsif tg_op = 'UPDATE' and new.status = 'cancelled' and old.status is distinct from 'cancelled' and new.repeat_weeks is null then
  update public.chats set stopped_at = now() where series_id = new.series_id and is_group;
 elsif tg_op = 'UPDATE' and old.repeat_weeks is not null and new.repeat_weeks is null and old.status = 'active' and new.status = 'active' then
  insert into public.chats(series_id) values (new.series_id)
  on conflict (series_id) do update set stopped_at = coalesce(public.chats.stopped_at, now()) where public.chats.is_group;
  if private.chat_is_group(new.series_id) and not private.chat_lines_off() then
   perform private.chat_system_line(new.id, 'stopped',
    jsonb_build_object('plan_id', new.id, 'starts_at', new.starts_at, 'time_zone', new.time_zone));
  end if;
 end if;
 return null;
end $$;
revoke all on function private.plans_group_flag() from public, anon, authenticated, service_role;
create trigger plans_group_flag after insert or update of repeat_weeks, status on public.plans
 for each row execute function private.plans_group_flag();

-- 1e. The backfill (G-B7), after the trigger, as chat core's chat rows come after theirs (chat_core.sql:95-97): a plan
-- written while this file runs is flagged by the trigger or seen here. Every series with an occurrence that repeats, or
-- that was rolled from another, is a group. A group whose current occurrence (current_occurrence, chat core's pick) no
-- longer repeats, cancelled or not, has stopped. public.plans holds no time of a cancellation or of a change (only
-- created_at, version and guest_note_at), so that occurrence's end stands in, no later than now: a long-finished
-- stopped group comes out closed, and one stopped recently, or cancelled ahead of its date, stays open until its 48
-- hours pass. A series whose only occurrence lost its rule before this release can't be told from a one-off, and stays
-- one: its chat has no messages, since chat ships in this release. Chat core's backfill made one chats row per series
-- (chat_core.sql:97).
update public.chats c set is_group = true
where exists (select 1 from public.plans p where p.series_id = c.series_id and (p.repeat_weeks is not null or p.repeats_from is not null));
with s as (
 select x.series_id, o.starts_at, o.ends_at from public.chats x cross join lateral private.current_occurrence(x.series_id) o
 where x.is_group and o.id is not null and o.repeat_weeks is null
)
update public.chats c set stopped_at = least(now(), private.plan_end(s.starts_at, s.ends_at)) from s where s.series_id = c.series_id;

-- 1f. Any way back in clears a leave (Decision 1): a guest row inserted (a host's or a circle's invitation, a link, the
-- roll) or moved to the person by a fold onto the series' current occurrence (update of user_id: fold_web_account moves
-- a row by update and never inserts, chat_core.sql:1016; attendees_close_waiting fires on the same update for the same
-- reason, circles_of_trust.sql:85, I7). A row a fold moves on an earlier occurrence is an old week's attendance, not a
-- way back in, so the leave stays (ruling GR2 Q2, CH-P4). An update that leaves user_id as it was is no move. It clears
-- that person's leave of the plan's series, no other. The database's own: no role may call it.
create function private.attendees_clear_leave() returns trigger language plpgsql security definer set search_path = '' as $$
declare v_series uuid;
begin
 if tg_op = 'UPDATE' and new.user_id is not distinct from old.user_id then return null; end if;
 select p.series_id into v_series from public.plans p where p.id = new.plan_id;
 if tg_op = 'UPDATE' and (private.current_occurrence(v_series)).id is distinct from new.plan_id then return null; end if;
 delete from private.series_leaves l where l.series_id = v_series and l.user_id = new.user_id;
 return null;
end $$;
revoke all on function private.attendees_clear_leave() from public, anon, authenticated, service_role;
create trigger attendees_clear_leave after insert or update of user_id on public.attendees
 for each row execute function private.attendees_clear_leave();

-- 1g. Who is in the chat, and when it closes, for groups. Each is chat core's body as built, create or replace, with
-- the group branch added; a one-off keeps plan 1's rule word for word, and each keeps its grants (nobody). After
-- series_leaves and group_stopped, which they name (SQL bodies are checked when they are created).

-- In the chat (CH-P2, CH-D3, G-S5). A one-off, plan 1's rule (chat_core.sql:132-138): on the current occurrence, a host
-- or someone Going or Maybe. A group: on the current occurrence, a host, or anyone with a guest row, whatever they
-- answered; except someone with a leave for the series once the current occurrence has ended, who keeps the row and is
-- out (Decision 2). Still false for nobody and for a series that does not exist. chat_members filters by this, so it
-- follows unchanged. Its cost grows with people × occurrences: chat_members calls it once per candidate, each call
-- resolving current_occurrence again, and a group adds a series_leaves probe and the ended test, accepted for groups
-- of tens (G-S3's note).
create or replace function private.chat_member(p_series uuid, p_user uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select coalesce((
  select case when private.chat_is_group(p_series) then
    (private.is_host(c.id, p_user) or exists (select 1 from public.attendees a where a.plan_id = c.id and a.user_id = p_user))
    and not (private.plan_end(c.starts_at, c.ends_at) <= now()
     and exists (select 1 from private.series_leaves l where l.series_id = p_series and l.user_id = p_user))
   else private.is_host(c.id, p_user)
   or exists (select 1 from public.attendees a where a.plan_id = c.id and a.user_id = p_user and a.response in ('accepted','maybe'))
   end
  from private.current_occurrence(p_series) c
  where c.id is not null and p_user is not null), false)
$$;

-- When the chat closes (CH-P15). A one-off, plan 1's rule (:156-159): its end + 48 hours, null when cancelled. A group:
-- null while it runs (it never closes while the series runs); once stopped, 48 hours after the cancellation when its
-- current occurrence is cancelled and the stop time is set, else 48 hours after that occurrence's end (stopped by Edit,
-- or an owner who may no longer use the app).
create or replace function private.chat_closes_at(p_series uuid) returns timestamptz language sql stable security definer set search_path = '' as $$
 select case
  when not private.chat_is_group(p_series) then
   case when c.status = 'cancelled' then null else private.plan_end(c.starts_at, c.ends_at) + interval '48 hours' end
  when not private.group_stopped(p_series) then null
  when c.status = 'cancelled' and ch.stopped_at is not null then ch.stopped_at + interval '48 hours'
  else private.plan_end(c.starts_at, c.ends_at) + interval '48 hours' end
 from private.current_occurrence(p_series) c left join public.chats ch on ch.series_id = p_series
$$;

-- Open for writing (CH-R-A2, G-N5). A group: no close time means open, whatever this week's occurrence says, so "Cancel
-- just this one" keeps the chat open (CH-P15); else before the close time. A one-off, plan 1's rule (:165-168): before
-- the close time; with none, open unless cancelled. A series that does not exist is not open. The app decides "closed"
-- only from this.
create or replace function private.chat_open(p_series uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select case when c.id is not null and private.chat_is_group(p_series) then coalesce(now() < private.chat_closes_at(p_series), true)
  else coalesce(now() < private.chat_closes_at(p_series), c.status <> 'cancelled', false) end
 from private.current_occurrence(p_series) c
$$;

-- 1h. The chat's header, sheet and state: chat core's body as built (:248-274), create or replace, with one key changed:
-- stopped is group_stopped (false on a one-off) instead of false. is_group, repeat_weeks, members, going and everyone are
-- as built; members covers a group through this file's chat_member. public.chat_summary is not touched, and the grants
-- are kept (authenticated). Plan 3 copies this body.
create or replace function private.chat_summary(p_series uuid) returns jsonb language plpgsql stable security definer set search_path = '' as $$
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
  'is_group', coalesce(v_chat.is_group, false), 'stopped', private.group_stopped(p_series),
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

-- 1i. Whether the caller is in a group's chat, for the event page (G-N13, challenge NOTE 3): true when the caller may use
-- the app (private.eligible(), as can_see_guests and can_read_plan start), the series is a group and chat_member holds
-- for the caller, which covers the hosts of the current occurrence; false otherwise, never an error (ruling GR2 Q1). It
-- is the group branch of can_see_guests (Task 2), so the event page never takes someone for a group member whom the
-- people list treats as an outsider: a leaver after the end keeps a guest row, so can_read_plan passes on the current
-- occurrence, but is no member. For signed-in accounts only.
create function private.series_is_group(p_series uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select private.eligible() and private.chat_is_group(p_series) and private.chat_member(p_series, auth.uid())
$$;
revoke all on function private.series_is_group(uuid) from public, anon, authenticated, service_role;
create function public.series_is_group(p_series uuid) returns boolean language sql stable security invoker set search_path = '' as $$
 select private.series_is_group(p_series)
$$;
revoke all on function public.series_is_group(uuid) from public, anon, authenticated, service_role;
grant execute on function private.series_is_group(uuid), public.series_is_group(uuid) to authenticated;

-- Section 2 (Task 2): the group's lines, the roll, leaving, and who sees the group. Section 1 is never applied alone:
-- until chat_row changes below, a changed line would show the place to a member who has not answered.

-- 2a. An answer's line (K-S2, Decision 6, confirmation S3, CH-R-A5, I2). Chat core's body as built (chat_core.sql:920-952),
-- create or replace, its chat_lines_off() check first and its grants kept (nobody). For every chat, the search for the
-- line to merge into keeps to the answer's own occurrence (m.plan_id = new.plan_id, as chat core's note asks: a one-off
-- has one occurrence, so nothing changes for it) and to lines still sent, so a deleted line is never merged into or
-- brought back. The built rules otherwise stay: the search keeps to rows updated in the last 10 minutes
-- (messages_series_updated_idx), then tests created_at; a line merges only while no later system line names the person
-- (H33); only joined and cant_go lines are searched. On a group an answer changes no membership, so it changes one fact
-- at a time, and since the trigger fires on every update of response, changed or not, each case names its old states
-- (challenge NOTE 4):
--  - an insert, whatever its reply: joined {actor, user, brought_by when the row has a bringer}, always a new line. A
--    joined line is never rewritten;
--  - Going, Maybe or not answered into Can't go: cant_go {actor, user}, or that person's cant_go line on this
--    occurrence, still sent and made in the last 10 minutes, takes the new payload in place while H33's guard holds;
--  - Can't go into Going or Maybe within 10 minutes of that person's cant_go line on this occurrence, still sent: the
--    line is hidden (chat_hide_line: state deleted, so messages_signal and chat_messages_since tell the open screens,
--    and chats.last_message_id moves back with it). It moves nothing, so H33's guard does not apply (I2);
--  - nothing else writes a line: Can't go to Can't go, a reply sent again unchanged, not answered into Going or Maybe,
--    and a line of an earlier occurrence or over 10 minutes old all leave the chat as it is.
-- A one-off keeps plan 1's transitions and its 10-minute rule. The roll writes nothing here, since it runs under its
-- flag (G-B6); nothing infers "by the roll" from repeats_from (G-N2).
create or replace function private.attendees_chat_lines() returns trigger language plpgsql security definer set search_path = '' as $$
declare v_event text; v_payload jsonb; v_series uuid; v_line bigint; v_made timestamptz;
begin
 if private.chat_lines_off() then return null; end if;
 select p.series_id into v_series from public.plans p where p.id = new.plan_id;
 -- A group (Decision 6): one fact at a time, each case by its old states (the trigger fires on every update of response).
 if private.chat_is_group(v_series) then
  if tg_op = 'INSERT' then
   perform private.chat_system_line(new.plan_id, 'joined', jsonb_build_object('actor', auth.uid(), 'user', new.user_id)
    || case when new.brought_by is not null then jsonb_build_object('brought_by', new.brought_by) else '{}'::jsonb end);
   return null;
  elsif old.response in ('accepted','maybe','pending') and new.response in ('declined','withdrawn') then
   v_event := 'cant_go';
   v_payload := jsonb_build_object('actor', auth.uid(), 'user', new.user_id);
  elsif not (old.response in ('declined','withdrawn') and new.response in ('accepted','maybe')) then
   return null;
  end if;
  -- That person's latest cant_go line on this occurrence, still sent, made in the last 10 minutes (the same search as
  -- below, for cant_go lines only).
  select m.id, m.created_at into v_line, v_made from public.messages m
  where m.series_id = v_series and m.updated_at > now() - interval '10 minutes' and m.plan_id = new.plan_id and m.state = 'sent'
   and m.kind = 'system' and m.event = 'cant_go' and m.payload->>'user' = new.user_id::text
  order by m.id desc limit 1;
  if v_line is not null and v_made <= now() - interval '10 minutes' then v_line := null; end if;
  if v_event is null then
   -- Back to Going or Maybe: the line goes, by state (H33's guard is for a merge, which moves a line; this moves none).
   if v_line is not null then perform private.chat_hide_line(v_line); end if;
  elsif v_line is not null
   and not exists (select 1 from public.messages l where l.series_id = v_series and l.id > v_line and l.kind = 'system'
    and new.user_id::text in (l.payload->>'actor', l.payload->>'user', l.payload->>'brought_by')) then
   update public.messages set event = v_event, payload = v_payload where id = v_line;
  else
   perform private.chat_system_line(new.plan_id, v_event, v_payload);
  end if;
  return null;
 end if;
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
 select m.id, m.created_at into v_line, v_made from public.messages m
 where m.series_id = v_series and m.updated_at > now() - interval '10 minutes' and m.plan_id = new.plan_id and m.state = 'sent'
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

-- 2b. A change of the plan: chat core's body as built (chat_core.sql:963-980), create or replace, its grants kept
-- (nobody). One change: the cancelled line is cancelled {actor, stop, starts_at, time_zone} (G-S2), stop when the
-- cancellation ends the repeat (new.repeat_weeks is null: "Cancel this and stop repeating", or any cancel of a one-off),
-- and the cancelled occurrence's start and zone.
create or replace function private.plans_chat_lines() returns trigger language plpgsql security definer set search_path = '' as $$
declare v_time boolean; v_place boolean;
begin
 if private.chat_lines_off() then return null; end if;
 if new.status = 'cancelled' and old.status is distinct from 'cancelled' then
  perform private.chat_system_line(new.id, 'cancelled', jsonb_build_object('stop', new.repeat_weeks is null, 'starts_at', new.starts_at,
   'time_zone', new.time_zone));
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

-- 2c. The roll: the circles body as built (20261111130000_circles_of_trust.sql:585-642, sha256
-- 04062e2b091fa582f59a3d1ff9a322e8019ce671c64d532d5c113d0916d77256; I9), which carries every guest row, a brought guest
-- who said Can't go included, with their bringer and level (Decision 13, CO-Q1 "carried"). Its grants are kept
-- (nobody). The changes:
--  - first, the roll's flag (G-B6), for the rest of the calling transaction: the line triggers write no joined line for
--    a carried guest and no admin line for a carried admin, whoever calls it;
--  - the carried guests leave out anyone with a leave for the series, read while this plan's row is held (G-S5, Review
--    Focus 4);
--  - a carried row whose bringer was not carried loses its bringer (G-N3);
--  - after the new occurrence is in, two lines through chat_system_line with no actor (NOTE 8): ended {actor, title} on
--    the occurrence left behind, unless it was cancelled (G-S2, G-S6), and next {actor, plan_id, starts_at, time_zone,
--    place_label, place_tbd} on the new one;
--  - it rolls in series order. A line takes its chat's row (messages_chat_stats), and the roll holds every row it takes
--    to its commit, so it takes them in the order the account deletion does (its ordered pass, chat core's deletion
--    step): a roll in plan order could hold one group's row while waiting for another's that a deletion holds, waiting
--    for the first (supabase/tests/local/chat-groups-concurrency.sh, races 2 and 3). Plan rows are taken skip locked,
--    so their order matters to nothing else.
create or replace function private.roll_repeating_plans() returns integer language plpgsql security definer set search_path = '' as $$
declare p public.plans; v_id uuid; v_start timestamptz; v_end timestamptz; v_steps integer; v_count integer := 0; v_constraint text;
begin
 -- The roll's flag (G-B6): the line triggers write nothing for what the roll does, to the end of the calling
 -- transaction. The roll writes the group's own lines itself, below.
 perform set_config('resbite.system','roll',true);
 for p in
  select o.* from public.plans o
  where o.repeat_weeks is not null and (o.status='cancelled' or private.plan_end(o.starts_at,o.ends_at)<=now())
   and not exists(select 1 from public.plans n where n.repeats_from=o.id)
   and private.user_eligible(o.owner_id)
  order by o.series_id, o.id
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
   -- Each guest keeps who brought them and their level (CO-P12), but for someone who left the group (G-S5): their leave
   -- is read while this plan's row is held, which leave_series waits for, so no leave lands between this read and the
   -- insert (whose attendees_clear_leave would clear it).
   insert into public.attendees(plan_id,user_id,response,version,brought_by,level) select v_id,user_id,'pending',1,brought_by,level from public.attendees
    where plan_id=p.id and private.used_app(user_id) and private.user_eligible(user_id) and not private.deletion_pending(user_id)
     and not exists(select 1 from private.series_leaves l where l.series_id=p.series_id and l.user_id=attendees.user_id);
   -- A bringer who was not carried brought nobody here (G-N3).
   update public.attendees c set brought_by=null where c.plan_id=v_id and c.brought_by is not null
    and not exists(select 1 from public.attendees b where b.plan_id=v_id and b.user_id=c.brought_by);
   insert into public.plan_admins(plan_id,user_id,appointed_by,appointed_at) select v_id,pa.user_id,pa.appointed_by,now() from public.plan_admins pa
    where pa.plan_id=p.id and exists(select 1 from public.attendees a where a.plan_id=v_id and a.user_id=pa.user_id);
   insert into private.notification_outbox(plan_id,recipient_id,kind,dedupe_key,actor_id,detail)
   select v_id,a.user_id,'invited','invited:'||v_id||':'||a.user_id,p.owner_id,'again'
   from public.attendees a
   where a.plan_id=v_id and a.user_id<>p.owner_id
    and not exists(select 1 from public.plan_admins pa where pa.plan_id=v_id and pa.user_id=a.user_id)
   on conflict do nothing;
   -- The group's lines, with no actor (else chat_system_line writes auth.uid()): ended on the occurrence left behind,
   -- unless it was cancelled, whose cancelled line said so (G-S2, G-S6); next on the new one.
   if p.status<>'cancelled' then
    perform private.chat_system_line(p.id,'ended',jsonb_build_object('actor',null,'title',p.title));
   end if;
   perform private.chat_system_line(v_id,'next',jsonb_build_object('actor',null,'plan_id',v_id,'starts_at',v_start,'time_zone',p.time_zone,
    'place_label',p.place_label,'place_tbd',p.place_tbd));
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

-- 2d. Leaving a group (CH-P4, Decisions 1 and 2, G-S5, G-N1, G-N13, I6). The series' current occurrence's row is taken
-- for update, the lock the roll (for update of o) and invite_contacts (require_link_owner, or the guest's own) hold; for
-- update, not for no key update, so a guest row being inserted, whose key check takes key share, waits for the leave or
-- the leave for it. Then the current occurrence is resolved again, and the new one locked when the roll made it
-- meanwhile (ruling GR2 Q3). So a leave racing the roll, an invitation or a guest row ends with the person in (a row, no
-- leave) or out (no row, a leave), never both (supabase/tests/local/leave-series-concurrency.sh). Then, in this order:
--  - a group, and the caller in its chat, else 42501 'Not in this group' (a one-off, or a second leave);
--  - the owner: 42501 'Owner can''t leave'; an admin (a host): 42501 'Hosts can''t leave'. An admin steps down first by
--    answering Can't go, which ends the role (CR-P15);
--  - the leave, stored, or its time moved to now: the roll's skip list;
--  - the caller's personal links on the current occurrence revoked, as remove_guest revokes them, so an old link lets
--    no leaver back in (G-N1);
--  - the caller's guest row on the current occurrence deleted, with its invitation notice, sent or not, and its
--    deliveries, as remove_guest deletes it, so an invitation back is told again, even the same week (I6). Unless that
--    occurrence has ended and was not cancelled: then the row is a real attendance and stays, with its notice, and
--    chat_member leaves them out (Decision 2, G-N13);
--  - left {actor, user}, both the caller, also on a closed group (challenge NOTE 12). No notice. The delete writes no
--    line of its own: attendees_chat_lines fires on an insert or an update of response.
-- For signed-in accounts only, its private body too.
create function private.leave_series(p_series uuid) returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_tester(); v_plan public.plans; v_again uuid;
begin
 loop
  v_plan := private.current_occurrence(p_series);
  exit when v_plan.id is null;
  perform 1 from public.plans p where p.id = v_plan.id for update;
  v_again := (private.current_occurrence(p_series)).id;
  exit when v_again is not distinct from v_plan.id;
 end loop;
 if v_plan.id is null or not private.chat_is_group(p_series) or not private.chat_member(p_series, v_uid) then
  raise exception 'Not in this group' using errcode='42501';
 end if;
 -- The row as it is now that it is held.
 select * into v_plan from public.plans p where p.id = v_plan.id;
 if v_plan.owner_id = v_uid then raise exception 'Owner can''t leave' using errcode='42501'; end if;
 if private.is_host(v_plan.id, v_uid) then raise exception 'Hosts can''t leave' using errcode='42501'; end if;
 insert into private.series_leaves(series_id, user_id) values (p_series, v_uid)
 on conflict (series_id, user_id) do update set left_at = now();
 update private.invitations set revoked_at=now() where plan_id=v_plan.id and claimed_by=v_uid and revoked_at is null;
 update private.phone_invitations set revoked_at=now(), code_hash=null where plan_id=v_plan.id and user_id=v_uid;
 if v_plan.status = 'cancelled' or private.plan_end(v_plan.starts_at, v_plan.ends_at) > now() then
  delete from public.attendees where plan_id=v_plan.id and user_id=v_uid;
  delete from private.notification_outbox where dedupe_key='invited:'||v_plan.id||':'||v_uid;
 end if;
 perform private.chat_system_line(v_plan.id, 'left', jsonb_build_object('actor', v_uid, 'user', v_uid));
end $$;
revoke all on function private.leave_series(uuid) from public, anon, authenticated, service_role;
create function public.leave_series(p_series uuid) returns void language sql security invoker set search_path = '' as $$
 select private.leave_series(p_series)
$$;
revoke all on function public.leave_series(uuid) from public, anon, authenticated, service_role;
grant execute on function private.leave_series(uuid), public.leave_series(uuid) to authenticated;

-- 2e. Who sees a resbite's guests (CH-P21, G-B5, G-S3): the creating-a-resbite body (20261031120000_creating_a_resbite.sql:621),
-- create or replace, its grants kept (authenticated), its tests first and a group branch last: on a group's occurrence,
-- someone with a guest row on it, whatever the reply, who is in the group's chat now (chat_member). Someone who left or
-- was removed is in no chat, so falls back to the one-off rule on every occurrence, past ones included. attendee_read,
-- plan_admins_read and can_read_profile (and through it the avatar policy) follow. Cost (G-S3): it runs per row in
-- attendee_read and inside can_read_profile's loop over plans; hosts and answered guests never reach the group branch,
-- and chat_member resolves the current occurrence once (plans_series_idx, plans_repeats_from_key), so a member who has
-- not answered pays one such lookup per row read, accepted for groups of tens.
create or replace function private.can_see_guests(p_plan uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select private.eligible() and exists(select 1 from public.plans p where p.id=p_plan and (p.owner_id=auth.uid()
  or exists(select 1 from public.plan_admins pa where pa.plan_id=p.id and pa.user_id=auth.uid())
  or exists(select 1 from public.attendees a where a.plan_id=p.id and a.user_id=auth.uid() and a.response<>'pending')
  or (private.chat_is_group(p.series_id) and exists(select 1 from public.attendees a where a.plan_id=p.id and a.user_id=auth.uid())
   and private.chat_member(p.series_id,auth.uid()))))
$$;

-- 2f. Asking, from a resbite (CH-P21): the follow-ups body (20261111120000_connections_follow_ups.sql:130), create or
-- replace, its detail kept, its grants and public wrapper kept. One change, at its target check: on a group, the person
-- asked may be any guest, not answered included (they share a chat, and each sees the other's name through
-- can_see_guests). The caller still passes can_see_guests first, so a leaver asking from a past occurrence gets 42501
-- 'Names required'. Both have a place on p_plan, so pair_standing still gives one of its four values. Plan 3 copies
-- this body.
create or replace function private.request_connection(p_user uuid, p_plan uuid) returns text language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_tester(); v_a uuid; v_b uuid; v_series uuid; v_row public.connections; v_at timestamptz;
begin
 select p.user_a,p.user_b into v_a,v_b from private.pair(v_uid,p_user) p;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_a::text||':'||v_b::text,53));
 if p_user=v_uid then raise exception 'That is you' using errcode='22023'; end if;
 if not private.can_see_guests(p_plan) then raise exception 'Names required' using errcode='42501'; end if;
 -- CH-P21 (groups and chat): on a group any guest may be asked, whatever their reply; on a one-off, a guest who has
 -- answered. Someone whose account is being deleted is not on it either, as its owner too (the owner's row outlives the
 -- request).
 if private.deletion_pending(p_user) or not (private.is_host(p_plan,p_user)
  or exists(select 1 from public.attendees a where a.plan_id=p_plan and a.user_id=p_user
   and (a.response<>'pending' or private.chat_is_group((select p.series_id from public.plans p where p.id=p_plan))))) then
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
 -- The notice carries how the two stand on the resbite asked from, for its line (CO-P5).
 insert into private.notification_outbox(plan_id,recipient_id,kind,dedupe_key,actor_id,created_at,detail)
  values(p_plan,p_user,'connection_request','connect:'||v_a||':'||v_b||':'||v_series||':'||v_uid,v_uid,v_at,private.pair_standing(p_plan,v_uid,p_user))
  on conflict do nothing;
 return 'requested';
end $$;

-- 2g. Who may be told (P2-Q1, Decision 7, B1): chat core's body as built (chat_core.sql:652-692), already create or
-- replace there, so its grants are kept (nobody). In the chat branch only, a group's notice may be told while its chat
-- is open (chat_open: the week cancelled just this once, and the 48 hours after a stop), whatever its plan's status; a
-- one-off keeps plan.status<>'cancelled' (H30). Everything else is verbatim: the first two branches, the ages (an hour
-- for chat_message, a day for announcement), membership and the audience at claim time, both mutes, msg.state='sent'.
-- After section 1's chat_open, which its SQL body names. Plan 3 copies this body.
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
 and msg.state='sent' and case when private.chat_is_group(msg.series_id) then private.chat_open(msg.series_id) else plan.status<>'cancelled' end
 and (o.kind='chat_message' and o.created_at>now()-interval '1 hour'
   and private.chat_member(msg.series_id,o.recipient_id)
   and not exists(select 1 from public.chat_mutes cm where cm.series_id=msg.series_id and cm.user_id=o.recipient_id)
  or o.kind='announcement' and o.created_at>now()-interval '24 hours'
   and exists(select 1 from private.announcement_audience(msg.series_id,msg.audience) as r(id) where r.id=o.recipient_id))
 )
$$;

-- 2h. The place in the chat (Decision 11, I11, owner question G-QA's default). The resbite page shows a guest whose reply
-- is not yet given only the area, never the place, and a host always the place (placeLine through eventPlace, GI1);
-- the chat's lines follow the same rule. chat_place_hidden: true unless the viewer is a host of the series' current
-- occurrence (is_host) or has a guest row on it whose reply is not pending; true for a series that does not exist.
-- The database's own: no role may call it. Before chat_row, which names it.
create function private.chat_place_hidden(p_series uuid, p_viewer uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select coalesce((
  select not (private.is_host(c.id, p_viewer)
   or exists (select 1 from public.attendees a where a.plan_id = c.id and a.user_id = p_viewer and a.response <> 'pending'))
  from private.current_occurrence(p_series) c
  where c.id is not null), true)
$$;
revoke all on function private.chat_place_hidden(uuid,uuid) from public, anon, authenticated, service_role;

-- The row every read returns: chat core's body as built (chat_core.sql:209-215), create or replace, its grants kept
-- (nobody). Two changes. A next or changed line's payload leaves out place_label for a viewer chat_place_hidden hides it
-- from; every other key stays (place_tbd names no place). The helper runs only for those two events, so a page of 100
-- rows stays cheap. And every row carries its plan_id, the occurrence it was written on, so the app says "this <day>"
-- only for the current occurrence's announcements (Task 3's ruling GR1). The reads are not redefined: chat_messages,
-- chat_messages_since, chat_summary's pinned and last, and my_chat_overview's last all build their rows with this, as do
-- plan 3's copies of them. One-offs read as before, but for plan_id: everyone in a one-off's chat has answered or is a
-- host.
create or replace function private.chat_row(p_message public.messages, p_viewer uuid) returns jsonb language sql stable security definer set search_path = '' as $$
 select jsonb_build_object('id', p_message.id, 'kind', p_message.kind, 'audience', p_message.audience, 'event', p_message.event,
  'payload', case when p_message.kind = 'system' and p_message.event in ('next','changed')
   then case when private.chat_place_hidden(p_message.series_id, p_viewer) then p_message.payload - 'place_label' else p_message.payload end
   else p_message.payload end,
  'plan_id', p_message.plan_id, 'body', case when p_message.state = 'sent' then p_message.body end, 'state', p_message.state,
  'author_id', p_message.author_id, 'created_at', p_message.created_at, 'updated_at', p_message.updated_at)
  || case when p_message.author_id is not null and p_message.author_id = p_viewer
      then jsonb_build_object('client_id', p_message.client_id) else '{}'::jsonb end
$$;
