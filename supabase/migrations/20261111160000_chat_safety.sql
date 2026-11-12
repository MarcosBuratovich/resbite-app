-- Chat safety: report and block (App Store guideline 1.2). Anyone can block anyone they meet in Resbite: the blocker
-- stops seeing the blocked person's messages and announcements and stops hearing from them, and the two are no longer
-- connected. The blocked person is never told (CH-P13): a block reads to them as a refusal or a removal of connections
-- does (G-B1), or as a number not on Resbite (Decision 11).
-- Spec: docs/superpowers/specs/2026-11-10-groups-and-chat-design.md (CH-P13, CH-P18)
-- Plan: docs/superpowers/plans/2026-11-11-chat-3-safety.md (Tasks 1 and 2), with the rulings in its Revised lists
-- Hosted-compatible: depends only on the migrations in supabase/tests/hosted-baseline/migrations.txt,
-- 20261111120000_connections_follow_ups.sql, 20261111130000_circles_of_trust.sql, 20261111140000_chat_core.sql and
-- 20261111150000_chat_groups.sql. Every body it replaces is copied from its latest definition as built and changed only
-- where its comment says ("Bases"): chat groups' (sha256 068d7f42432862749646b4f7972e6cc9bc226d2670ca82d96610fd3b66759f23)
-- for chat_summary, my_chat_overview, request_connection and notification_recipient_eligible; chat core's (sha256
-- 1047fb379a4e8a942b49db3f7134674caecf2cbb30f67e0ebf9f0f2fea6a78ce) for chat_messages, chat_messages_since, send_message,
-- send_announcement, the claim, the deletion request and the fold; the connections' (1f403e42f97e9c2b619fe7a5d778bee0dfd2146d7fffc5a2114b24cb32d112d8)
-- plan_connection_states, the circles' (04062e2b091fa582f59a3d1ff9a322e8019ce671c64d532d5c113d0916d77256)
-- invite_contacts and the phone_key's (d7cf188f6b63d14453a2b34d6c8c85838ed196d7a06e01e3bd94c66ae0a14667)
-- contacts_on_resbite. Each is create or replace, so its grants are kept; only the private bodies change, and the
-- public invoker wrappers stay as built, but for the worker's claim, which has no private twin (I-3).
-- Rollback: supabase/rollback/20261111160000_chat_safety.rollback.sql (it restores all fourteen bodies, then plan 2's may run)

-- Section 1 (Task 1): blocks, and the block rule in every read, every push and every way to connect.

-- 1a. The block (G-B1). One row per blocker and blocked person, kept until the blocker unblocks or either profile goes.
-- Nobody reads or writes it directly (row security on, no policies, no grants): block_user writes it, my_blocks lists
-- the caller's own, and the reads and pushes below consult it. The index serves "who blocked this person": the pushes,
-- send_message's fan-out and the contact lookup ask it, and it covers blocked_id's foreign key.
create table private.blocks (
 blocker_id uuid references public.profiles(id) on delete cascade,
 blocked_id uuid references public.profiles(id) on delete cascade,
 created_at timestamptz not null default now(),
 primary key (blocker_id, blocked_id),
 check (blocker_id <> blocked_id)
);
create index blocks_blocked_id_idx on private.blocks(blocked_id);
alter table private.blocks enable row level security;
revoke all on private.blocks from public, anon, authenticated, service_role;

-- 1b. Who invited the caller (challenge B4). The database's own: no role may call either. Both read auth.uid().
-- invited_by: the caller's guest row on p_plan has p_by as its bringer, or an 'invited' notice to the caller on p_plan
-- has p_by as its actor (an in-app invitation, circles_of_trust.sql:369 and :418, or the roll's, plan2.sql:473-478). The
-- notice is kept after delivery and goes with the guest row (circles_of_trust.sql:218, :669; plan2.sql:555), so it
-- names the invitation the caller holds.
create function private.invited_by(p_plan uuid, p_by uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select p_by is not null and (
  exists (select 1 from public.attendees a where a.plan_id = p_plan and a.user_id = auth.uid() and a.brought_by = p_by)
  or exists (select 1 from private.notification_outbox o where o.recipient_id = auth.uid() and o.kind = 'invited'
   and o.plan_id = p_plan and o.actor_id = p_by))
$$;
revoke all on function private.invited_by(uuid,uuid) from public, anon, authenticated, service_role;
-- inviter_of: the one person the app names as the caller's inviter on p_plan: the bringer on the caller's guest row;
-- else the actor of the caller's 'invited' notice there, when it names someone (one per plan and person, by its key);
-- else the plan's owner ("Ana invited you").
create function private.inviter_of(p_plan uuid) returns uuid language sql stable security definer set search_path = '' as $$
 select coalesce(
  (select a.brought_by from public.attendees a where a.plan_id = p_plan and a.user_id = auth.uid()),
  (select o.actor_id from private.notification_outbox o where o.recipient_id = auth.uid() and o.kind = 'invited' and o.plan_id = p_plan
   and o.actor_id is not null order by o.id desc limit 1),
  (select p.owner_id from public.plans p where p.id = p_plan))
$$;
revoke all on function private.inviter_of(uuid) from public, anon, authenticated, service_role;

-- 1c. Blocking and unblocking (G-B1, G-N12, G-S10, challenges B4 and I2). Silent either way. In order:
--  0. a null person or a null p_block: 22023 'Invalid block', as decide_join_request refuses a null decision
--     (circles_of_trust.sql:695), so a malformed call never reads as done; it names nobody;
--  1. the pair's lock, as the connection functions take it (hashtextextended(a||':'||b, 53)), so a request, an
--     acceptance or a removal at the same moment goes first or waits;
--  2. oneself: 22023 'That is you';
--  3. blocking (p_block true) someone the caller may not read gets the same success and stores nothing (G-N12). The
--     caller may read p_user when: can_read_profile says so; p_user wrote a message or an announcement in a chat the
--     caller is in now; p_user wrote a sent announcement whose audience includes the caller now (the invitation card
--     shows only sent ones, confirmation S7); p_user's request to join a resbite the caller hosts is waiting; or
--     p_user invited the caller to a plan the caller may read (invited_by: a guest who brought them, a host who
--     invited them in the app);
--  4. blocking stores the block (kept as first made, its time clock_timestamp, so my_blocks lists blocks made in one
--     transaction newest first), then leaves the pair as the refusal machinery would: connected, the row goes and a
--     hidden refusal of the blocker by the blocked person stays on the row's series, as remove_connection leaves it; a
--     request by the blocked person goes and a visible refusal stays on its series, as decline_connection leaves it; a
--     request by the blocker goes as cancel_connection_request takes it, the blocker's refusals by p_user hidden;
--  5. unblocking (p_block false) deletes the caller's own block of p_user, whatever the caller may read now (I2), and
--     nothing else: refusals stay, as after a "Not now".
create function private.block_user(p_user uuid, p_block boolean) returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_tester(); v_a uuid; v_b uuid; v_row public.connections;
begin
 if p_user is null or p_block is null then raise exception 'Invalid block' using errcode='22023'; end if;
 select p.user_a,p.user_b into v_a,v_b from private.pair(v_uid,p_user) p;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_a::text||':'||v_b::text,53));
 if p_user=v_uid then raise exception 'That is you' using errcode='22023'; end if;
 if not p_block then
  delete from private.blocks where blocker_id=v_uid and blocked_id=p_user;
  return;
 end if;
 if not (private.can_read_profile(p_user)
  or exists(select 1 from (select distinct m.series_id from public.messages m
    where m.author_id=p_user and m.kind in ('message','announcement')) s where private.chat_member(s.series_id,v_uid))
  or exists(select 1 from public.messages m where m.author_id=p_user and m.kind='announcement' and m.state='sent'
   and exists(select 1 from private.announcement_audience(m.series_id,m.audience) as r(id) where r.id=v_uid))
  or exists(select 1 from private.join_requests j where j.user_id=p_user and j.status='waiting' and private.is_host(j.plan_id,v_uid))
  or exists(select 1 from (select a.plan_id from public.attendees a where a.user_id=v_uid and a.brought_by=p_user
    union select o.plan_id from private.notification_outbox o where o.recipient_id=v_uid and o.kind='invited' and o.actor_id=p_user) x
   where private.can_read_plan(x.plan_id) and private.invited_by(x.plan_id,p_user))) then
  return;
 end if;
 insert into private.blocks(blocker_id,blocked_id,created_at) values(v_uid,p_user,pg_catalog.clock_timestamp()) on conflict do nothing;
 delete from public.connections where user_a=v_a and user_b=v_b returning * into v_row;
 if v_row.user_a is null then return; end if;
 if v_row.state='connected' then
  if v_row.series_id is not null then
   insert into private.connection_refusals(series_id,from_user,to_user,hidden) values(v_row.series_id,p_user,v_uid,true)
    on conflict (series_id,from_user,to_user) do update set hidden=excluded.hidden, refused_at=excluded.refused_at;
  end if;
 elsif v_row.requested_by=p_user then
  if v_row.series_id is not null then
   insert into private.connection_refusals(series_id,from_user,to_user) values(v_row.series_id,p_user,v_uid)
    on conflict (series_id,from_user,to_user) do update set hidden=excluded.hidden, refused_at=excluded.refused_at;
  end if;
 else
  update private.connection_refusals set hidden=true where from_user=v_uid and to_user=p_user and not hidden;
 end if;
end $$;
revoke all on function private.block_user(uuid,boolean) from public, anon, authenticated, service_role;
create function public.block_user(p_user uuid, p_block boolean) returns void language sql security invoker set search_path = '' as $$
 select private.block_user(p_user, p_block)
$$;
revoke all on function public.block_user(uuid,boolean) from public, anon, authenticated, service_role;
grant execute on function private.block_user(uuid,boolean), public.block_user(uuid,boolean) to authenticated;

-- 1d. Blocked people (G-S10): [{user_id, name}] for the people the caller blocked, newest first. name is chat_first_name
-- (chat_core.sql:201-203), the helper behind every names map: the first word of display_name, or null for a deleted,
-- deleting or folded profile (the app shows "Someone").
create function private.my_blocks() returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := private.require_tester();
begin
 return coalesce((select jsonb_agg(jsonb_build_object('user_id', b.blocked_id, 'name', private.chat_first_name(b.blocked_id))
   order by b.created_at desc, b.blocked_id)
  from private.blocks b where b.blocker_id = v_uid), '[]'::jsonb);
end $$;
revoke all on function private.my_blocks() from public, anon, authenticated, service_role;
create function public.my_blocks() returns jsonb language sql stable security invoker set search_path = '' as $$
 select private.my_blocks()
$$;
revoke all on function public.my_blocks() from public, anon, authenticated, service_role;
grant execute on function private.my_blocks(), public.my_blocks() to authenticated;

-- 1e. The history (Review Focus 1, challenge I1): chat core's two bodies as built (chat_core.sql:284-293 and :304-317),
-- create or replace, their grants and public wrappers kept. One change in each: the rows leave out messages and
-- announcements whose author the caller blocked, inside the query before its limit, so a page still holds up to p_limit
-- rows the caller may see and a since read up to 200 (the app reads a short newest page as "nothing earlier" and a full
-- 200 as a gap). System lines are never left out, whoever they name. names covers the rows returned, as built; every row
-- is still chat_row's (plan2.sql:711-720), so plan 2's place rule holds.
create or replace function private.chat_messages(p_series uuid, p_before bigint, p_limit int) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := private.require_tester(); v_rows jsonb; v_limit int := greatest(1, least(coalesce(p_limit, 50), 100));
begin
 if not private.chat_member(p_series, v_uid) then raise exception 'Not in this chat' using errcode='42501'; end if;
 select coalesce(jsonb_agg(private.chat_row(m, v_uid) order by m.id), '[]'::jsonb) into v_rows
 from (select * from public.messages m
       where m.series_id = p_series and (p_before is null or m.id < p_before)
         and not (m.kind in ('message','announcement') and exists (select 1 from private.blocks b where b.blocker_id = v_uid and b.blocked_id = m.author_id))
       order by m.id desc limit v_limit) m;
 return jsonb_build_object('rows', v_rows, 'names', private.chat_names(v_rows), 'as_of', now());
end $$;

create or replace function private.chat_messages_since(p_series uuid, p_after bigint, p_changed_after timestamptz) returns jsonb
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
         and not (m.kind in ('message','announcement') and exists (select 1 from private.blocks b where b.blocker_id = v_uid and b.blocked_id = m.author_id))
       order by m.id limit 200) m;
 return jsonb_build_object('rows', v_rows, 'names', private.chat_names(v_rows), 'as_of', now());
end $$;

-- 1f. The chat's header, sheet and state (G-B3, challenges N2 and N3, confirmation 2's SHOULD 4): chat groups' body as
-- built (plan2.sql:237-264), create or replace, its grants and public wrapper kept. For the caller:
--  - pinned is the built row (on a group only while it was written on the current occurrence, GR4); when the caller
--    blocked its author, the latest sent announcement by someone the caller has not blocked, the rule inside the pick's
--    limit and on a group only among the current occurrence's announcements, or null;
--  - last is the built row (last_message_id) unless the caller blocked its author; then the newest row below it that
--    is neither by someone the caller blocked nor a system line whose state is deleted, or null (chat_hide_line already
--    keeps last_message_id itself off a hidden line). The fallback is skipped for a caller who blocked nobody;
--  - unread is the built test on the rows the caller may see; message_count is the built count less the chat's sent
--    messages and announcements by people the caller blocked, a subquery skipped for a caller who blocked nobody.
-- going, everyone, members and every other key are as built: the blocked person's counts never move (G-B1). names
-- covers pinned and last. Task 2 adds rules_accepted.
create or replace function private.chat_summary(p_series uuid) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := private.require_tester(); v_plan public.plans; v_chat public.chats; v_pinned jsonb; v_last jsonb; v_read bigint;
 v_blocks boolean;
begin
 if not private.chat_member(p_series, v_uid) then raise exception 'Not in this chat' using errcode='42501'; end if;
 v_plan := private.current_occurrence(p_series);
 select * into v_chat from public.chats c where c.series_id = p_series;
 v_blocks := exists (select 1 from private.blocks b where b.blocker_id = v_uid);
 select private.chat_row(m, v_uid) into v_pinned from public.messages m where m.id = v_chat.pinned_message_id and m.series_id = p_series
  and (not coalesce(v_chat.is_group, false) or m.plan_id = v_plan.id);
 if v_blocks and exists (select 1 from private.blocks b where b.blocker_id = v_uid and b.blocked_id = (v_pinned->>'author_id')::uuid) then
  select private.chat_row(m, v_uid) into v_pinned from public.messages m
  where m.series_id = p_series and m.kind = 'announcement' and m.state = 'sent'
   and (not coalesce(v_chat.is_group, false) or m.plan_id = v_plan.id)
   and not exists (select 1 from private.blocks b where b.blocker_id = v_uid and b.blocked_id = m.author_id)
  order by m.id desc limit 1;
 end if;
 select private.chat_row(m, v_uid) into v_last from public.messages m where m.id = v_chat.last_message_id and m.series_id = p_series;
 if v_blocks and exists (select 1 from private.blocks b where b.blocker_id = v_uid and b.blocked_id = (v_last->>'author_id')::uuid) then
  select private.chat_row(m, v_uid) into v_last from public.messages m
  where m.series_id = p_series and m.id < (v_last->>'id')::bigint and not (m.kind = 'system' and m.state = 'deleted')
   and not (v_blocks and m.kind in ('message','announcement') and exists (select 1 from private.blocks b where b.blocker_id = v_uid and b.blocked_id = m.author_id))
  order by m.id desc limit 1;
 end if;
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
   and m.author_id is distinct from v_uid and (m.payload->>'actor') is distinct from v_uid::text
   and not (v_blocks and m.kind in ('message','announcement') and exists (select 1 from private.blocks b where b.blocker_id = v_uid and b.blocked_id = m.author_id))),
  'message_count', coalesce(v_chat.message_count, 0) - case when v_blocks then (select count(*) from private.blocks b
   join public.messages m on m.author_id = b.blocked_id
   where b.blocker_id = v_uid and m.series_id = p_series and m.kind in ('message','announcement') and m.state = 'sent') else 0 end);
end $$;

-- 1g. My resbites' view (G-B3, challenges B4, N2 and N3, confirmation I-1 and NOTE 6): chat groups' body as built
-- (plan2.sql:728-759, chat core's with GR4's one clause), create or replace, its grants and public wrapper kept. Each
-- chat's last, unread and count follow chat_summary's rules above. The card's announcement keeps its rule (the latest
-- sent one whose audience includes the caller, on a group only one written on the current occurrence) and gains "whose
-- author the caller has not blocked", inside its limit, so it falls back to the latest by someone else, or none. New:
-- inviters, {"<plan_id>": "<user id>"}, always present ({} when empty): for each of the caller's unanswered rows on a
-- series' current occurrence that is active and has not ended, the same rows the card reads but whether or not an
-- announcement exists, inviter_of(plan), left out when the caller blocked them. names also covers each inviter.
create or replace function private.my_chat_overview() returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := private.require_tester(); v_chats jsonb; v_lasts jsonb; v_announcements jsonb; v_authors jsonb;
 v_blocks boolean; v_inviters jsonb; v_inviter_rows jsonb;
begin
 v_blocks := exists (select 1 from private.blocks b where b.blocker_id = v_uid);
 select coalesce(jsonb_object_agg(s.series_id, jsonb_build_object(
   'unread', exists (select 1 from public.messages m where m.series_id = s.series_id and m.state = 'sent' and m.id > s.read_id
    and m.author_id is distinct from v_uid and (m.payload->>'actor') is distinct from v_uid::text
    and not (v_blocks and m.kind in ('message','announcement') and exists (select 1 from private.blocks b where b.blocker_id = v_uid and b.blocked_id = m.author_id))),
   'last', s.last, 'open', private.chat_open(s.series_id), 'count', s.count)), '{}'::jsonb),
  coalesce(jsonb_agg(s.last) filter (where s.last is not null), '[]'::jsonb)
 into v_chats, v_lasts
 from (select c.series_id, coalesce(ch.message_count, 0) - case when v_blocks then (select count(*) from private.blocks b
          join public.messages m on m.author_id = b.blocked_id
          where b.blocker_id = v_uid and m.series_id = c.series_id and m.kind in ('message','announcement') and m.state = 'sent')
         else 0 end as count,
        coalesce((select r.last_read_id from public.chat_reads r where r.series_id = c.series_id and r.user_id = v_uid), 0) as read_id,
        (select case when v_blocks and m.kind in ('message','announcement') and exists (select 1 from private.blocks b where b.blocker_id = v_uid and b.blocked_id = m.author_id)
          then (select private.chat_row(e, v_uid) from public.messages e
                where e.series_id = c.series_id and e.id < m.id and not (e.kind = 'system' and e.state = 'deleted')
                 and not (v_blocks and e.kind in ('message','announcement')
                  and exists (select 1 from private.blocks b where b.blocker_id = v_uid and b.blocked_id = e.author_id))
                order by e.id desc limit 1)
          else private.chat_row(m, v_uid) end
         from public.messages m where m.id = ch.last_message_id and m.series_id = c.series_id) as last
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
          and (not private.chat_is_group(p.series_id) or m.plan_id = p.id)
          and not exists (select 1 from private.blocks b where b.blocker_id = v_uid and b.blocked_id = m.author_id)
          and exists (select 1 from private.announcement_audience(p.series_id, m.audience) as r(id) where r.id = v_uid)
         order by m.id desc limit 1) m
       where a.user_id = v_uid and a.response = 'pending' and p.status = 'active'
        and private.plan_end(p.starts_at, p.ends_at) > now()
        and p.id = (private.current_occurrence(p.series_id)).id) x;
 select coalesce(jsonb_object_agg(x.plan_id, x.inviter), '{}'::jsonb), coalesce(jsonb_agg(jsonb_build_object('author_id', x.inviter)), '[]'::jsonb)
 into v_inviters, v_inviter_rows
 from (select p.id as plan_id, private.inviter_of(p.id) as inviter
       from public.attendees a join public.plans p on p.id = a.plan_id
       where a.user_id = v_uid and a.response = 'pending' and p.status = 'active'
        and private.plan_end(p.starts_at, p.ends_at) > now()
        and p.id = (private.current_occurrence(p.series_id)).id) x
 where x.inviter is not null and not exists (select 1 from private.blocks b where b.blocker_id = v_uid and b.blocked_id = x.inviter);
 return jsonb_build_object('chats', v_chats, 'announcements', v_announcements, 'inviters', v_inviters,
  'names', private.chat_names(v_lasts || v_authors || v_inviter_rows));
end $$;

-- 1h. Who may be told (G-S13, R-Q5, Decision 18, challenge B2): chat groups' body as built (plan2.sql:647-687), create or
-- replace, its grants kept (nobody); plan 2's group case in the chat branch (:680) stays exactly as built. A notice is
-- not told to someone who blocked its actor: in the first branch for every kind but plan_changed, plan_cancelled and
-- the roll's "<title> is on again" (invited with detail 'again', the owner its actor), which name nobody and are the
-- resbite's own news; in the connection branch too (no pair row survives a block, so this only guards); and in the chat
-- branch, the message's author. A blocked person's join request is still listed to every host by plan_join_requests.
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
 and (o.kind in ('plan_changed','plan_cancelled') or (o.kind='invited' and o.detail is not distinct from 'again')
  or not exists(select 1 from private.blocks k where k.blocker_id=o.recipient_id and k.blocked_id=o.actor_id))
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
 and not exists(select 1 from private.blocks k where k.blocker_id=o.recipient_id and k.blocked_id=o.actor_id)
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
 and not exists(select 1 from private.blocks k where k.blocker_id=o.recipient_id and k.blocked_id=msg.author_id)
 and (o.kind='chat_message' and o.created_at>now()-interval '1 hour'
   and private.chat_member(msg.series_id,o.recipient_id)
   and not exists(select 1 from public.chat_mutes cm where cm.series_id=msg.series_id and cm.user_id=o.recipient_id)
  or o.kind='announcement' and o.created_at>now()-interval '24 hours'
   and exists(select 1 from private.announcement_audience(msg.series_id,msg.audience) as r(id) where r.id=o.recipient_id))
 )
$$;

-- 1i. The worker's claim (confirmation I-3, R-Q5): chat core's body as built (chat_core.sql:705-773; nothing later
-- redefines it), create or replace, its grants kept (service_role only). One clause: an rsvp's brought_by_name leaves
-- out a bringer the recipient blocked, so that host reads "Clara is going." and every other host's push still names the
-- bringer. A host who blocked the answerer gets no rsvp at all: its actor is the answerer (1h).
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
  where a.plan_id=o.plan_id and a.user_id=o.actor_id and a.brought_by<>o.recipient_id and not private.deletion_pending(b.id)
  and not exists(select 1 from private.blocks k where k.blocker_id=o.recipient_id and k.blocked_id=b.id)) end,
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

-- 1j. Writing (confirmation S2, challenge N1): chat core's body as built (chat_core.sql:464-504), create or replace, its
-- grants and public wrapper kept. The chat_message fan-out leaves out every member who blocked the author, and the one
-- push a minute no longer counts a notice whose message's author the recipient blocked, so a blocked author's notice
-- queued in the minute before the block never takes the blocker's one push. The chat's lock and the rule are as built;
-- the eligibility check stays the second guard. Task 2 adds its two checks to this body.
create or replace function private.send_message(p_series uuid, p_body text, p_client_id uuid) returns jsonb
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
   and not exists (select 1 from private.blocks b where b.blocker_id = r.id and b.blocked_id = v_uid)
   and not exists (select 1 from private.notification_outbox o join public.messages m on m.id = o.message_id
                   where o.recipient_id = r.id and o.kind = 'chat_message' and m.series_id = p_series
                     and o.created_at > now() - interval '60 seconds'
                     and not exists (select 1 from private.blocks b where b.blocker_id = r.id and b.blocked_id = m.author_id))
 on conflict do nothing;
 select * into v_row from public.messages m where m.id = v_id;
 return private.chat_row(v_row, v_uid);
end $$;

-- 1k. Asking to connect (G-B1, G-B2, CH-R-A1): chat groups' body as built (plan2.sql:588-639), create or replace, its
-- detail, grants and public wrapper kept, its pair lock first. The block checks go right after the built body reads the
-- plan's series (:605, which already follows 'That is you' and the two visibility refusals), so a blocked person asking
-- where nobody may ask gets the same 42501 as anyone, and before the pair row and every accept path: a block by the
-- caller is 22023 'Unblock first'; a block of the caller leaves a visible refusal on this series, queues nothing and
-- returns 'requested'.
create or replace function private.request_connection(p_user uuid, p_plan uuid) returns text language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_tester(); v_a uuid; v_b uuid; v_series uuid; v_row public.connections; v_at timestamptz;
begin
 select p.user_a,p.user_b into v_a,v_b from private.pair(v_uid,p_user) p;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_a::text||':'||v_b::text,53));
 if p_user=v_uid then raise exception 'That is you' using errcode='22023'; end if;
 if not private.can_see_guests(p_plan) then raise exception 'Names required' using errcode='42501'; end if;
 -- CH-P21 (groups and chat): on a group any guest in its chat now may be asked, whatever their reply; otherwise, as on a
 -- one-off, a guest who has answered, so someone who left a group is no longer asked through an unanswered row (ruling
 -- GR3 Q2). Someone whose account is being deleted is not on it either, as its owner too (the owner's row outlives the
 -- request).
 if private.deletion_pending(p_user) or not (private.is_host(p_plan,p_user)
  or exists(select 1 from public.attendees a where a.plan_id=p_plan and a.user_id=p_user
   and (a.response<>'pending' or exists(select 1 from public.plans p where p.id=p_plan and private.chat_is_group(p.series_id)
    and private.chat_member(p.series_id,p_user))))) then
  raise exception 'Not on this resbite' using errcode='42501';
 end if;
 select series_id into v_series from public.plans where id=p_plan;
 -- Blocks (G-B1, G-B2), after the two visibility refusals and before every accept path (CH-R-A1). The caller's own block
 -- is theirs to undo. A block of the caller reads to them as a "Not now": a visible refusal on this series, nothing
 -- queued, and the request looks sent.
 if exists(select 1 from private.blocks where blocker_id=v_uid and blocked_id=p_user) then
  raise exception 'Unblock first' using errcode='22023';
 end if;
 if exists(select 1 from private.blocks where blocker_id=p_user and blocked_id=v_uid) then
  insert into private.connection_refusals(series_id,from_user,to_user,hidden) values(v_series,v_uid,p_user,false)
   on conflict (series_id,from_user,to_user) do update set hidden=false;
  return 'requested';
 end if;
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

-- The people list's dots: the connections body as built (20261110120000_connections.sql:278-294), create or replace, its
-- grants and public wrapper kept. One change: someone the caller blocked reads 'none'. The blocked person's own view is
-- as built, so a block reads to them as a removal or a refusal does. my_connections is not redefined: no pair row
-- survives a block (CH-R-A5).
create or replace function private.plan_connection_states(p_plan uuid) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := private.require_tester();
begin
 if not private.can_see_guests(p_plan) then raise exception 'Names required' using errcode='42501'; end if;
 return coalesce((select jsonb_object_agg(m.id::text, case
    when exists(select 1 from private.blocks b where b.blocker_id=v_uid and b.blocked_id=m.id) then 'none'
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

-- 1l. Inviting (G-S13, Decision 11, challenge I5). invite_contacts: the circles body as built
-- (20261111130000_circles_of_trust.sql:301-443), create or replace, its grants and public wrapper kept, its host and
-- non-host branches as built. One change, in the choice between 'app' and 'link': a number whose holder blocked the
-- caller takes the unknown-number path, a personal invitation ('link'): no guest row, no notice and no 'app' answer, and
-- nothing tells the inviter. 'self' and 'already' come before that choice and are unchanged. An item by user needs a
-- connection, which no block leaves.
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
     and exists(select 1 from public.profiles where id=v_holder)
     and not exists(select 1 from private.blocks b where b.blocker_id=v_holder and b.blocked_id=v_uid) then
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
       -- A host's link counts from when the host last sent it (CO-R12); a guest's sent again keeps its time.
       created_at=case when private.phone_invitations.revoked_at is null and not v_host then private.phone_invitations.created_at else excluded.created_at end,
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

-- contacts_on_resbite: the phone_key body as built (20261030130000_phone_key.sql:92-107; nothing later redefines it),
-- create or replace, its grants and public wrapper kept. A holder who blocked the caller is left out, so the invite
-- screen shows no "On Resbite" for them and its 'link' answer matches what it said. Every number is charged to the
-- lookup budget, as built.
create or replace function private.contacts_on_resbite(p_phones text[]) returns text[] language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_tester(); v_n int := coalesce(cardinality(p_phones),0); v_out text[];
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_uid::text,47));
 if v_n>50 then raise exception 'Too many numbers' using errcode='22023'; end if;
 if v_n=0 then return array[]::text[]; end if;
 perform private.charge_lookup(v_uid,v_n);
 select coalesce(array_agg(d order by d),array[]::text[]) into v_out from (
  select distinct v.d from (select private.phone_digits(x) as g, private.phone_key(x) as k from unnest(p_phones) x) s
  cross join lateral (values (s.g), (s.k)) v(d)
  where s.k<>'' and exists(select 1 from auth.users u where u.phone = any(private.phone_variants(s.k))
   and u.phone_confirmed_at is not null and u.id<>v_uid
   and not exists(select 1 from private.blocks b where b.blocker_id=u.id and b.blocked_id=v_uid)
   and private.user_eligible(u.id) and private.used_app(u.id)
   and exists(select 1 from public.profiles p where p.id=u.id))) t;
 return v_out;
end $$;

-- Section 2 (Task 2): reports, moderators and the report_filed notice, the chat rules, the blocked terms, the deletion
-- step and the fold. The team reads and acts on reports with the owner-run scripts in supabase/ops (open-reports.sql,
-- close-report.sql, remove-reported-message.sql, suspend-account.sql, moderators.sql, blocked-terms.sql and
-- purge-closed-reports.sql). Three of section 1's bodies are redefined here, each copied from section 1 with only this
-- section's lines added (chat-safety.sql checks it): chat_summary, send_message and notification_recipient_eligible.

-- 2a. Reports (CH-P13, CH-P18, G-B4(b), G-N12, G-S9; challenges N5, I7 and I11; Decision 7). One row per report, made
-- by report_message or report_user and read and closed by the team's scripts. Nobody reads or writes it directly. A
-- profile removed any way takes the reports it filed (reporter_id, on delete cascade, as messages_touch takes a
-- departed author's words whatever way the profile went, H42); the deletion request deletes them itself. A report
-- about someone keeps target_user_id and frozen_author until it is closed (close-report.sql) and is deleted 180 days
-- after (purge-closed-reports.sql). about is what was reported, which outlives the message row (N5). frozen_body and
-- frozen_author are the words and the author when the message was reported. One report per reporter and message
-- (G-N12), and one open report per reporter, person and series (confirmation NOTE 8), keyed on about so a message
-- report whose message row went never meets a report about the person. The other two indexes serve the limit's count
-- and reporter_id's cascade, and message_id's set null. suspended_roster and suspended_grant_at record what
-- suspend-account.sql changed when it suspended the reported person (their roster row disabled; the time it revoked
-- their live grant), so its undo puts back only that, never an earlier ban (SR3).
create table private.reports (
 id bigint generated always as identity primary key,
 reporter_id uuid null references public.profiles(id) on delete cascade,
 target_user_id uuid null,
 message_id bigint null references public.messages(id) on delete set null,
 series_id uuid null,
 plan_id uuid null,
 about text not null check (about in ('message','user')),
 reason text not null check (reason in ('harassment','spam','inappropriate','other')),
 details text null check (details is null or char_length(details) <= 500),
 frozen_body text null,
 frozen_author uuid null,
 created_at timestamptz not null default now(),
 status text not null default 'open' check (status in ('open','reviewed','actioned')),
 reviewed_at timestamptz null,
 review_note text null,
 action text null check (action is null or action in ('none','message_removed','account_suspended','both')),
 suspended_roster boolean not null default false,
 suspended_grant_at timestamptz null
);
create unique index reports_reporter_message_key on private.reports(reporter_id, message_id) where message_id is not null;
create unique index reports_open_user_key on private.reports(reporter_id, target_user_id, series_id) where about = 'user' and status = 'open';
create index reports_reporter_created_idx on private.reports(reporter_id, created_at);
create index reports_message_idx on private.reports(message_id);
alter table private.reports enable row level security;
revoke all on private.reports from public, anon, authenticated, service_role;
revoke all on sequence private.reports_id_seq from public, anon, authenticated, service_role;

-- 2b. The moderators (G-B4(c)): the accounts each new report pushes. moderators.sql sets them; the migration seeds
-- nobody (the owner is the one moderator until they name a backup, R-Q4). A profile that goes takes its row.
create table private.moderators (user_id uuid primary key references public.profiles(id) on delete cascade);
alter table private.moderators enable row level security;
revoke all on private.moderators from public, anon, authenticated, service_role;

-- 2c. The chat rules (G-B4(d), Decision 8): one row per person and version accepted, written by accept_chat_rules. A
-- first message or announcement waits for the current version (send_message, send_announcement).
create table private.chat_rules_acceptances (
 user_id uuid not null references public.profiles(id) on delete cascade,
 version text not null,
 accepted_at timestamptz not null default now(),
 primary key (user_id, version)
);
alter table private.chat_rules_acceptances enable row level security;
revoke all on private.chat_rules_acceptances from public, anon, authenticated, service_role;

-- 2d. The blocked terms (G-B4(a), Decision 9, challenge N4): the words no message or announcement may hold, set by
-- blocked-terms.sql; the migration seeds none. Each term is lowercased and trimmed, 1 to 80 characters, holds no regex
-- character (so it always matches literally), starts and ends on a word character (so \m and \M can hold: '@ss' or 'n-'
-- could never match) and has its words one plain space apart, with no other blank: none \s takes, and none of the
-- blanks chat_body names besides (a no-break space among them, which \s here does not take; SR3's D1).
create table private.blocked_terms (
 term text primary key check (term = lower(btrim(term)) and char_length(term) between 1 and 80 and term !~ '[][\\.^$*+?(){}|]'
  and term ~ '^\w(.*\w)?$' and term !~ '\s\s|[^\S ]' and term !~ '[\u0085\u00a0\u115f\u1680\u2000-\u200c\u2028\u2029\u202f\u205f\u2060\u2800\u3000\u3164\ufeff\uffa0]')
);
alter table private.blocked_terms enable row level security;
revoke all on private.blocked_terms from public, anon, authenticated, service_role;

-- 2e. Two values, each in one place, and nobody's but the database's: the chat rules' current version, and how many
-- days a closed report is kept (the ruling on I11, R-Q3; open-reports.sql and purge-closed-reports.sql read it).
create function private.chat_rules_version() returns text language sql stable security definer set search_path = '' as $$
 select '2026-11'::text
$$;
revoke all on function private.chat_rules_version() from public, anon, authenticated, service_role;
create function private.report_keep_days() returns integer language sql stable security definer set search_path = '' as $$
 select 180
$$;
revoke all on function private.report_keep_days() from public, anon, authenticated, service_role;

-- 2f. Agreeing to the chat rules (G-B4(d)): the caller accepts the current version, once (a repeat changes nothing).
-- For signed-in accounts only, its private body too.
create function private.accept_chat_rules() returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_tester();
begin
 insert into private.chat_rules_acceptances(user_id, version) values (v_uid, private.chat_rules_version()) on conflict do nothing;
end $$;
revoke all on function private.accept_chat_rules() from public, anon, authenticated, service_role;
create function public.accept_chat_rules() returns void language sql security invoker set search_path = '' as $$
 select private.accept_chat_rules()
$$;
revoke all on function public.accept_chat_rules() from public, anon, authenticated, service_role;
grant execute on function private.accept_chat_rules(), public.accept_chat_rules() to authenticated;

-- 2g. The outbox's report_filed kind (G-B4(c)): the kind check by exact name, chat core's thirteen kinds and this one.
alter table private.notification_outbox drop constraint notification_outbox_kind_check;
alter table private.notification_outbox add constraint notification_outbox_kind_check
 check (kind in ('invitation','rsvp','plan_changed','plan_cancelled','guest_note','invited','join_request','join_approved','admin_added',
  'connection_request','connection_accepted','chat_message','announcement','report_filed'));

-- 2h. Who may be told (G-B4(c), challenge N8, N14 (a)): section 1's body, with report_filed left out of the first branch
-- (a moderator's guest row on the reported resbite never makes it eligible) and a fourth branch of its own: the
-- recipient is a moderator now, may use the app, is not being deleted, and the notice is under a day old. No
-- membership test and no mute apply. Its grants are kept (nobody).
create or replace function private.notification_recipient_eligible(p_outbox bigint) returns boolean
language sql stable security definer set search_path='' as $$
 select exists (
 select 1 from private.notification_outbox o
 join public.plans plan on plan.id=o.plan_id
 where o.id=p_outbox and o.kind not in ('connection_request','connection_accepted','chat_message','announcement','report_filed')
 and private.user_eligible(o.recipient_id) and not private.deletion_pending(o.recipient_id)
 and (private.is_host(plan.id,o.recipient_id) or exists(select 1 from public.attendees a where a.plan_id=plan.id and a.user_id=o.recipient_id
  and (o.kind not in ('plan_changed','guest_note') or a.response in ('accepted','maybe','pending'))))
 and (o.kind not in ('rsvp','invitation','join_request') or private.is_host(plan.id,o.recipient_id))
 and o.created_at>now()-interval '24 hours'
 and not exists(select 1 from public.plan_mutes m where m.series_id=plan.series_id and m.user_id=o.recipient_id)
 and (o.kind in ('plan_changed','plan_cancelled') or (o.kind='invited' and o.detail is not distinct from 'again')
  or not exists(select 1 from private.blocks k where k.blocker_id=o.recipient_id and k.blocked_id=o.actor_id))
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
 and not exists(select 1 from private.blocks k where k.blocker_id=o.recipient_id and k.blocked_id=o.actor_id)
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
 and not exists(select 1 from private.blocks k where k.blocker_id=o.recipient_id and k.blocked_id=msg.author_id)
 and (o.kind='chat_message' and o.created_at>now()-interval '1 hour'
   and private.chat_member(msg.series_id,o.recipient_id)
   and not exists(select 1 from public.chat_mutes cm where cm.series_id=msg.series_id and cm.user_id=o.recipient_id)
  or o.kind='announcement' and o.created_at>now()-interval '24 hours'
   and exists(select 1 from private.announcement_audience(msg.series_id,msg.audience) as r(id) where r.id=o.recipient_id))
 ) or exists (
 select 1 from private.notification_outbox o
 where o.id=p_outbox and o.kind='report_filed'
 and exists(select 1 from private.moderators m where m.user_id=o.recipient_id)
 and private.user_eligible(o.recipient_id) and not private.deletion_pending(o.recipient_id)
 and o.created_at>now()-interval '24 hours'
 )
$$;

-- 2i. The chat's header (G-B4(d)): section 1's body, gaining rules_accepted, whether the caller accepted the current
-- version of the chat rules (the app reads it as rulesAccepted). Its grants and public wrapper are kept.
create or replace function private.chat_summary(p_series uuid) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := private.require_tester(); v_plan public.plans; v_chat public.chats; v_pinned jsonb; v_last jsonb; v_read bigint;
 v_blocks boolean;
begin
 if not private.chat_member(p_series, v_uid) then raise exception 'Not in this chat' using errcode='42501'; end if;
 v_plan := private.current_occurrence(p_series);
 select * into v_chat from public.chats c where c.series_id = p_series;
 v_blocks := exists (select 1 from private.blocks b where b.blocker_id = v_uid);
 select private.chat_row(m, v_uid) into v_pinned from public.messages m where m.id = v_chat.pinned_message_id and m.series_id = p_series
  and (not coalesce(v_chat.is_group, false) or m.plan_id = v_plan.id);
 if v_blocks and exists (select 1 from private.blocks b where b.blocker_id = v_uid and b.blocked_id = (v_pinned->>'author_id')::uuid) then
  select private.chat_row(m, v_uid) into v_pinned from public.messages m
  where m.series_id = p_series and m.kind = 'announcement' and m.state = 'sent'
   and (not coalesce(v_chat.is_group, false) or m.plan_id = v_plan.id)
   and not exists (select 1 from private.blocks b where b.blocker_id = v_uid and b.blocked_id = m.author_id)
  order by m.id desc limit 1;
 end if;
 select private.chat_row(m, v_uid) into v_last from public.messages m where m.id = v_chat.last_message_id and m.series_id = p_series;
 if v_blocks and exists (select 1 from private.blocks b where b.blocker_id = v_uid and b.blocked_id = (v_last->>'author_id')::uuid) then
  select private.chat_row(m, v_uid) into v_last from public.messages m
  where m.series_id = p_series and m.id < (v_last->>'id')::bigint and not (m.kind = 'system' and m.state = 'deleted')
   and not (v_blocks and m.kind in ('message','announcement') and exists (select 1 from private.blocks b where b.blocker_id = v_uid and b.blocked_id = m.author_id))
  order by m.id desc limit 1;
 end if;
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
  'rules_accepted', exists (select 1 from private.chat_rules_acceptances r where r.user_id = v_uid and r.version = private.chat_rules_version()),
  'last_read_id', coalesce(v_read, 0),
  'unread', exists (select 1 from public.messages m where m.series_id = p_series and m.state = 'sent' and m.id > coalesce(v_read, 0)
   and m.author_id is distinct from v_uid and (m.payload->>'actor') is distinct from v_uid::text
   and not (v_blocks and m.kind in ('message','announcement') and exists (select 1 from private.blocks b where b.blocker_id = v_uid and b.blocked_id = m.author_id))),
  'message_count', coalesce(v_chat.message_count, 0) - case when v_blocks then (select count(*) from private.blocks b
   join public.messages m on m.author_id = b.blocked_id
   where b.blocker_id = v_uid and m.series_id = p_series and m.kind in ('message','announcement') and m.state = 'sent') else 0 end);
end $$;

-- 2j. Writing (G-B4(a) and (d), challenge N4, confirmation 2's NOTE 6): section 1's send_message and chat core's
-- send_announcement as built (chat_core.sql:513-555), create or replace, their grants and public wrappers kept, each
-- with two checks: right after the chat's open check, the caller has accepted the current chat rules, else 22023
-- 'Rules not accepted'; right after chat_body gives the words (plan 1's trim, which strips U+00A0 and the other
-- blanks, the one rule for both checks), they hold no blocked term as a whole word, in any case, a space in a term
-- matching any run of blanks or a line break, else 22023 'Not allowed'. chat_body refuses a body over 16,000 bytes
-- before any pattern (H42), so no term ever meets a huge one. A repeated client id still returns its stored row first
-- (step 1), so a resend after the rules moved on gets it.
create or replace function private.send_message(p_series uuid, p_body text, p_client_id uuid) returns jsonb
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
 -- The chat rules (G-B4(d), Decision 8): the current version accepted, else 22023 'Rules not accepted'.
 if not exists (select 1 from private.chat_rules_acceptances r where r.user_id = v_uid and r.version = private.chat_rules_version()) then
  raise exception 'Rules not accepted' using errcode='22023';
 end if;
 v_body := private.chat_body(p_body);
 if v_body is null then raise exception 'Invalid message' using errcode='22023'; end if;
 -- The blocked terms (G-B4(a), challenge N4): a listed term as a whole word, in any case; a space in it is any run of
 -- the blanks chat_body trims (a line break, a no-break space and the others \s here misses; SR3's D1). chat_body has
 -- already refused a body over 16,000 bytes, so no term meets a huge one.
 if exists (select 1 from private.blocked_terms t
  where v_body ~* ('\m' || replace(t.term, ' ', '[\s\u0085\u00a0\u115f\u1680\u2000-\u200c\u2028\u2029\u202f\u205f\u2060\u2800\u3000\u3164\ufeff\uffa0]+') || '\M')) then
  raise exception 'Not allowed' using errcode='22023';
 end if;
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
   and not exists (select 1 from private.blocks b where b.blocker_id = r.id and b.blocked_id = v_uid)
   and not exists (select 1 from private.notification_outbox o join public.messages m on m.id = o.message_id
                   where o.recipient_id = r.id and o.kind = 'chat_message' and m.series_id = p_series
                     and o.created_at > now() - interval '60 seconds'
                     and not exists (select 1 from private.blocks b where b.blocker_id = r.id and b.blocked_id = m.author_id))
 on conflict do nothing;
 select * into v_row from public.messages m where m.id = v_id;
 return private.chat_row(v_row, v_uid);
end $$;

create or replace function private.send_announcement(p_series uuid, p_body text, p_audience text, p_client_id uuid) returns jsonb
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
 -- The chat rules (G-B4(d), Decision 8): the current version accepted, else 22023 'Rules not accepted'.
 if not exists (select 1 from private.chat_rules_acceptances r where r.user_id = v_uid and r.version = private.chat_rules_version()) then
  raise exception 'Rules not accepted' using errcode='22023';
 end if;
 v_body := private.chat_body(p_body);
 if v_body is null or p_audience is null or p_audience not in ('going','everyone') then
  raise exception 'Invalid message' using errcode='22023';
 end if;
 -- The blocked terms (G-B4(a), challenge N4): a listed term as a whole word, in any case; a space in it is any run of
 -- the blanks chat_body trims (a line break, a no-break space and the others \s here misses; SR3's D1). chat_body has
 -- already refused a body over 16,000 bytes, so no term meets a huge one.
 if exists (select 1 from private.blocked_terms t
  where v_body ~* ('\m' || replace(t.term, ' ', '[\s\u0085\u00a0\u115f\u1680\u2000-\u200c\u2028\u2029\u202f\u205f\u2060\u2800\u3000\u3164\ufeff\uffa0]+') || '\M')) then
  raise exception 'Not allowed' using errcode='22023';
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

-- 2k. Reporting (CH-P13, G-B4(b), (c) and (e), G-S9, G-N12, R-Q1; challenges I3, I7, N5 and N8; confirmation NOTEs 8 and
-- 15). Each first refuses a reason outside the four, no reason, or details over 500 characters, with 23514 'Invalid
-- report' and nothing more: left to the table's checks, the error's detail would print the row, the reported words and
-- every id in it, to the caller and to the log (SR3). It refuses what the caller may not report with 22023 'Report
-- unavailable', the same words for a stranger, a system line, a message no longer sent, the caller's own message or the
-- caller themselves; then, in this order (I7):
--  1. the caller's lock, the author's lock chat core's writes take (hashtextextended(uid, 47)), so one person's
--     reports meet the limit one at a time;
--  2. a repeat (the caller's report of the same message, or the caller's open report about the same person on the
--     series) stores nothing, queues nothing and returns as the first did, so a repeat never reads as the limit;
--  3. at most 20 reports by the caller made in the last 24 hours, whatever their status, else 22023 'Report limit';
--  4. the insert, after the plan's row for key share, so a report takes the plan before the message (the reports' key
--     on it) as the account deletion does, and the two never deadlock (SR3);
--  5. the notices: one report_filed to each moderator but the reporter and the reported person (N8), on the report's
--     plan, with no actor and no message, so the push names nobody and carries nothing (Decision 10). Under the lock
--     'report_filed' (taken after the caller's), none goes to a moderator who already has one from the last 10 minutes
--     (I7): the daily read lists every open report. It is not a chat kind, so the claim takes it before any chat job.
-- Nothing of a report reaches the reported person, and no error says who reported or what.
-- report_message: the message is a message or an announcement still sent, by someone else, and the caller is in its
-- chat now; or a host of the message's plan, or on it (any answer on a group; on a one-off Going or Maybe, a member
-- when it was written, NOTE 15); or left the group after it was written (leave_series takes the row on the occurrence
-- they left); or an announcement whose audience includes the caller now. Its words and author are frozen; the reported
-- person is the author, on the message's series and plan.
create function private.report_message(p_id bigint, p_reason text, p_details text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_tester(); v_msg public.messages; v_id bigint;
begin
 if p_reason is null or p_reason not in ('harassment','spam','inappropriate','other')
  or (p_details is not null and pg_catalog.char_length(p_details) > 500) then
  raise exception 'Invalid report' using errcode='23514';
 end if;
 select * into v_msg from public.messages m where m.id = p_id;
 if v_msg.id is null or v_msg.kind not in ('message','announcement') or v_msg.state <> 'sent' or v_msg.author_id is null
  or v_msg.author_id = v_uid or not (private.chat_member(v_msg.series_id, v_uid)
   or private.is_host(v_msg.plan_id, v_uid)
   or exists (select 1 from public.attendees a where a.plan_id = v_msg.plan_id and a.user_id = v_uid
    and (private.chat_is_group(v_msg.series_id) or a.response in ('accepted','maybe')))
   or exists (select 1 from private.series_leaves l where l.series_id = v_msg.series_id and l.user_id = v_uid and l.left_at > v_msg.created_at)
   or (v_msg.kind = 'announcement'
    and exists (select 1 from private.announcement_audience(v_msg.series_id, v_msg.audience) as r(id) where r.id = v_uid))) then
  raise exception 'Report unavailable' using errcode='22023';
 end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_uid::text, 47));
 if exists (select 1 from private.reports r where r.reporter_id = v_uid and r.message_id = p_id) then return; end if;
 if (select count(*) from private.reports r where r.reporter_id = v_uid and r.created_at > now() - interval '24 hours') >= 20 then
  raise exception 'Report limit' using errcode='22023';
 end if;
 perform 1 from public.plans p where p.id = v_msg.plan_id for key share;
 insert into private.reports(reporter_id, target_user_id, message_id, series_id, plan_id, about, reason, details, frozen_body, frozen_author)
 values (v_uid, v_msg.author_id, v_msg.id, v_msg.series_id, v_msg.plan_id, 'message', p_reason, p_details, v_msg.body, v_msg.author_id)
 on conflict do nothing returning id into v_id;
 if v_id is null then return; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('report_filed', 0));
 insert into private.notification_outbox(plan_id, recipient_id, kind, dedupe_key)
 select v_msg.plan_id, m.user_id, 'report_filed', 'report:'||v_id||':'||m.user_id
 from private.moderators m
 where m.user_id <> v_uid and m.user_id <> v_msg.author_id
  and not exists (select 1 from private.notification_outbox o where o.recipient_id = m.user_id and o.kind = 'report_filed'
   and o.created_at > now() - interval '10 minutes')
 on conflict do nothing;
end $$;
revoke all on function private.report_message(bigint,text,text) from public, anon, authenticated, service_role;
create function public.report_message(p_id bigint, p_reason text, p_details text default null) returns void
language sql security invoker set search_path = '' as $$
 select private.report_message(p_id, p_reason, p_details)
$$;
revoke all on function public.report_message(bigint,text,text) from public, anon, authenticated, service_role;
grant execute on function private.report_message(bigint,text,text), public.report_message(bigint,text,text) to authenticated;

-- report_user: someone else, on a series, when one of these holds (each also where block_user lets the caller block):
--  - some occurrence of the series shows the caller its guests (can_see_guests), and p_user is its owner, an admin or
--    on it;
--  - the caller has a guest row on some occurrence, whatever its answer, and p_user is its owner or invited the caller
--    there (invited_by: the bringer, or the in-app invitation's actor), so an unanswered invitee can report the owner
--    the card names and the person who invited them (R-Q1, confirmation I-2);
--  - p_user wrote a message or an announcement in the series and the caller is in its chat now (S5: a one-off guest the
--    host removed after they wrote), or p_user wrote a sent announcement there whose audience includes the caller now
--    (the invitation card shows only sent ones, as block_user reads it);
--  - p_user's request to connect with the caller, made on the series, is waiting (I3), so the person a request reached
--    can report its sender.
-- plan_id is the latest occurrence that admits the report; else the plan of p_user's latest words that do; else, for a
-- waiting request, the series' current occurrence. Every report_filed notice so has a plan (the claim joins plans on
-- it, and the sender refuses a job without one).
create function private.report_user(p_user uuid, p_series uuid, p_reason text, p_details text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_tester(); v_plan uuid; v_member boolean; v_id bigint;
begin
 if p_reason is null or p_reason not in ('harassment','spam','inappropriate','other')
  or (p_details is not null and pg_catalog.char_length(p_details) > 500) then
  raise exception 'Invalid report' using errcode='23514';
 end if;
 if p_user is not null and p_series is not null and p_user <> v_uid then
  select p.id into v_plan from public.plans p
  where p.series_id = p_series
   and ((private.can_see_guests(p.id) and (p.owner_id = p_user
      or exists (select 1 from public.plan_admins pa where pa.plan_id = p.id and pa.user_id = p_user)
      or exists (select 1 from public.attendees a where a.plan_id = p.id and a.user_id = p_user)))
    or (exists (select 1 from public.attendees a where a.plan_id = p.id and a.user_id = v_uid)
     and (p.owner_id = p_user or private.invited_by(p.id, p_user))))
  order by p.starts_at desc, p.id desc limit 1;
  if v_plan is null then
   v_member := private.chat_member(p_series, v_uid);
   select m.plan_id into v_plan from public.messages m
   where m.series_id = p_series and m.author_id = p_user and m.kind in ('message','announcement')
    and (v_member or (m.kind = 'announcement' and m.state = 'sent'
     and exists (select 1 from private.announcement_audience(p_series, m.audience) as r(id) where r.id = v_uid)))
   order by m.id desc limit 1;
  end if;
  if v_plan is null and exists (select 1 from public.connections c
    where (c.user_a, c.user_b) = (least(v_uid, p_user), greatest(v_uid, p_user))
     and c.state = 'requested' and c.requested_by = p_user and c.series_id = p_series) then
   v_plan := (private.current_occurrence(p_series)).id;
  end if;
 end if;
 if v_plan is null then raise exception 'Report unavailable' using errcode='22023'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_uid::text, 47));
 if exists (select 1 from private.reports r where r.reporter_id = v_uid and r.about = 'user' and r.target_user_id = p_user
   and r.series_id = p_series and r.status = 'open') then
  return;
 end if;
 if (select count(*) from private.reports r where r.reporter_id = v_uid and r.created_at > now() - interval '24 hours') >= 20 then
  raise exception 'Report limit' using errcode='22023';
 end if;
 perform 1 from public.plans p where p.id = v_plan for key share;
 insert into private.reports(reporter_id, target_user_id, series_id, plan_id, about, reason, details)
 values (v_uid, p_user, p_series, v_plan, 'user', p_reason, p_details)
 on conflict do nothing returning id into v_id;
 if v_id is null then return; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('report_filed', 0));
 insert into private.notification_outbox(plan_id, recipient_id, kind, dedupe_key)
 select v_plan, m.user_id, 'report_filed', 'report:'||v_id||':'||m.user_id
 from private.moderators m
 where m.user_id <> v_uid and m.user_id <> p_user
  and not exists (select 1 from private.notification_outbox o where o.recipient_id = m.user_id and o.kind = 'report_filed'
   and o.created_at > now() - interval '10 minutes')
 on conflict do nothing;
end $$;
revoke all on function private.report_user(uuid,uuid,text,text) from public, anon, authenticated, service_role;
create function public.report_user(p_user uuid, p_series uuid, p_reason text, p_details text default null) returns void
language sql security invoker set search_path = '' as $$
 select private.report_user(p_user, p_series, p_reason, p_details)
$$;
revoke all on function public.report_user(uuid,uuid,text,text) from public, anon, authenticated, service_role;
grant execute on function private.report_user(uuid,uuid,text,text), public.report_user(uuid,uuid,text,text) to authenticated;

-- 2l. Deletion (CH-P18, G-S11, Decision 7): chat core's body as built (chat_core.sql:817-874, inside its guard,
-- :814-877; nothing later redefines it), redefined only where it exists, as chat core does, its grants kept and its
-- set_config('resbite.system','deletion',true) kept. After the built step that empties brought_by on the guest rows
-- they brought (so it takes guest rows before blocks and reports, as the fold does; SR3), it also deletes their blocks
-- both ways (locked first in one order, so two deletions of people who blocked each other
-- never deadlock on them), the reports they filed, their chat-rules acceptances and their moderator row. Reports about
-- them stay, with their frozen words (messages_touch empties their messages however the profile goes), until closed. The
-- built body already deletes their own notices, a moderator's queued report_filed with them. These deletes take no chat
-- row, so plan 2's parked gap (ruling GR2) is neither fixed nor widened here.
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
 -- Chat safety (CH-P18, G-S11, Decision 7): the account's blocks both ways (locked in one order first), the reports it
 -- filed, its chat-rules acceptances and its moderator row. Reports about it stay, with their frozen words. After the
 -- guest rows, as the fold takes them before blocks and reports, so the two never deadlock (SR3).
 perform 1 from private.blocks where blocker_id=p_user or blocked_id=p_user order by blocker_id, blocked_id for update;
 delete from private.blocks where blocker_id=p_user or blocked_id=p_user;
 delete from private.reports where reporter_id=p_user;
 delete from private.chat_rules_acceptances where user_id=p_user;
 delete from private.moderators where user_id=p_user;
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

-- 2m. Folding a web account into an app account (challenge I4): chat core's body as built (chat_core.sql:1000-1091;
-- nothing later redefines it), create or replace, its grants and public wrapper kept, with one step before the web
-- profile goes, so the profile's delete does not take the web account's blocks with it and no report keeps naming an id
-- that no longer exists. A connection the app account already had with someone who blocked the web account stays
-- (Known gaps).
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
 -- 3c. Chat safety (challenge I4): each block naming the web account, as blocker or blocked, is made again with the
 -- app account in its place, kept as first made (on conflict nothing), leaving out one that would block oneself; the
 -- web account's rows go with its profile. Reports name the app account where they named the web one (reporter,
 -- reported person, frozen author). First, a report that would then repeat another (the same message by the same
 -- reporter, or an open report by one reporter about one person on one series) goes, so the move meets no unique index
 -- (confirmation 2's NOTE 2-b): the web account's, or of two that both named it, the later. A report one of the two
 -- accounts filed about the other goes too: after the fold it would be about oneself (SR3, Q-1).
 insert into private.blocks(blocker_id,blocked_id,created_at)
  select k.blocker,k.blocked,k.created_at from (select case when b.blocker_id=p_from then p_into else b.blocker_id end as blocker,
   case when b.blocked_id=p_from then p_into else b.blocked_id end as blocked, b.created_at
   from private.blocks b where p_from in (b.blocker_id,b.blocked_id)) k
  where k.blocker<>k.blocked
 on conflict do nothing;
 delete from private.reports r where (r.reporter_id=p_from and p_into in (r.target_user_id,r.frozen_author))
  or (r.reporter_id=p_into and p_from in (r.target_user_id,r.frozen_author));
 delete from private.reports f where f.reporter_id=p_from and f.message_id is not null
  and exists(select 1 from private.reports t where t.reporter_id=p_into and t.message_id=f.message_id);
 delete from private.reports f where f.about='user' and f.status='open' and p_from in (f.reporter_id,f.target_user_id)
  and exists(select 1 from private.reports t where t.id<>f.id and t.about='user' and t.status='open' and t.series_id=f.series_id
   and (case when t.reporter_id=p_from then p_into else t.reporter_id end)=(case when f.reporter_id=p_from then p_into else f.reporter_id end)
   and (case when t.target_user_id=p_from then p_into else t.target_user_id end)=(case when f.target_user_id=p_from then p_into else f.target_user_id end)
   and (t.id<f.id or not p_from in (t.reporter_id,t.target_user_id)));
 update private.reports set reporter_id=case when reporter_id=p_from then p_into else reporter_id end,
  target_user_id=case when target_user_id=p_from then p_into else target_user_id end,
  frozen_author=case when frozen_author=p_from then p_into else frozen_author end
 where p_from in (reporter_id,target_user_id,frozen_author);
 -- 4. The web profile.
 delete from public.profiles where id=p_from;
 return jsonb_build_object('moved_attendees',v_moved);
end $$;
