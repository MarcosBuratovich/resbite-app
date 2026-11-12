-- Chat groups: a repeating resbite's chat is a group. Everyone invited to its current occurrence reads and writes it,
-- whatever they answered this week; it stays open while the series runs, and it closes 48 hours after the series stops
-- (Edit → "Doesn't repeat", "Cancel this and stop repeating", or an owner who may no longer use the app). Someone who
-- leaves is kept off the next occurrence.
-- Spec: docs/superpowers/specs/2026-11-10-groups-and-chat-design.md (CH-D3; CH-P1, CH-P4, CH-P15, CH-P20)
-- Plan: docs/superpowers/plans/2026-11-11-chat-2-groups.md (Tasks 1 and 2), with the rulings in its Revised lists
-- Hosted-compatible: depends only on the migrations in supabase/tests/hosted-baseline/migrations.txt,
-- 20261111120000_connections_follow_ups.sql, 20261111130000_circles_of_trust.sql and 20261111140000_chat_core.sql. Every
-- body it replaces is copied from chat core as built (sha256 1047fb379a4e8a942b49db3f7134674caecf2cbb30f67e0ebf9f0f2fea6a78ce)
-- and changed only where its comment says.
-- Rollback: supabase/rollback/20261111150000_chat_groups.rollback.sql (Task 2)
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
-- only). Nor is a running group's when the roll adds its next occurrence. So the deletion's plan loop, which cancels its
-- owner's future resbites under its flag, takes no chat row but a stopped group's (written: the cancellation's stop
-- time), and its ordered pass over the chat rows of the series it wrote in is otherwise the first chat lock it takes;
-- the roll holds no chat row that a deletion waits for (supabase/tests/local/chat-groups-concurrency.sh). A repeat set
-- and Edit's stop write the row by upsert, so the flag never depends on firing after plans_chat_row (G-N4). The
-- database's own: no role may call it.
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
