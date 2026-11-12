-- Rollback for 20261111150000_chat_groups.sql (chat groups, chat plan 2 of 3). Run as one transaction, only with the
-- owner's approval:
--   begin; \i supabase/rollback/20261111150000_chat_groups.rollback.sql; commit;
-- It is for the hosted project, where chat core (20261111140000_chat_core.sql) is applied: it restores chat core's
-- bodies. What is lost, with nobody told:
--   - every leave record (private.series_leaves);
--   - every group flag's value: public.chats.is_group goes back to false on every row. The column stays: chat core's
--     rollback drops it with its table (CH-R-A6). Chat core sets the flag true nowhere, so its audiences then read as
--     before;
--   - every stop time (public.chats.stopped_at, dropped).
-- It drops the triggers plans_group_flag and attendees_clear_leave, the functions leave_series and series_is_group (each
-- in both schemas), group_stopped, chat_hide_line, chat_place_hidden, plans_group_flag() and attendees_clear_leave(), the
-- table private.series_leaves and the column public.chats.stopped_at.
-- It restores, each byte for byte and keeping its grants (create or replace):
--   private.attendees_chat_lines, plans_chat_lines, chat_member, chat_closes_at, chat_open, chat_summary,
--   notification_recipient_eligible, chat_row, my_chat_overview
--                                              from 20261111140000_chat_core.sql (sha256
--                                              1047fb379a4e8a942b49db3f7134674caecf2cbb30f67e0ebf9f0f2fea6a78ce)
--   private.can_see_guests                    from 20261031120000_creating_a_resbite.sql
--   private.request_connection                from 20261111120000_connections_follow_ups.sql (its public wrapper unchanged)
--   private.roll_repeating_plans              from 20261111130000_circles_of_trust.sql (sha256
--                                              04062e2b091fa582f59a3d1ff9a322e8019ce671c64d532d5c113d0916d77256)
-- chat_row goes back before chat_place_hidden is dropped, and every body that names a dropped helper or table before
-- that helper or table goes, so no call ever meets a missing one.
-- What people notice:
--   - this plan's lines stay in the chats: ended, next, left, stopped, made_group, cancelled with stop, and the deleted
--     cant_go and stopped lines. A build without plan 2 words an unknown event as no line (chatRules.ts:236-237);
--   - the restored circles roll sets no flag, so a real roll writes an admin line again for each admin it carries (chat
--     core's Decision 4);
--   - the restored roll skips nobody, so a person who left after the end (their row kept) is carried again at the next
--     roll (challenge NOTE 10); and it rolls a group whose owner may use the app again, even one whose chat had closed
--     meanwhile, since that stop time goes with the column (ruling GR3 Q1);
--   - people in a group's chat who are not Going or Maybe, or a host, lose it at once: the one-off rule applies to every
--     chat again (challenge NOTE 10). A group member who has not answered no longer sees its people (CH-P21);
--   - a group's messages and announcements in a cancelled week are no longer pushed (chat core's rule, H30) (B1);
--   - a member who has not answered reads the place in next and changed lines again (Decision 11), and rows no longer
--     carry plan_id: the chat build then reads every announcement as the current week's (Task 3's GR1);
--   - after a roll, a group's last announcement before it is pinned again and, sent to everyone, sits under the new
--     week's invitation on My resbites and the resbite page for everyone who has not answered (ruling GR4);
--   - the chat build's resbite pages keep working after this file: readEvent reads a missing series_is_group as "not a
--     group" (I4). Its Leave group answers with an error, since leave_series is gone.
-- Order (G-N11, B1): roll back in reverse order only, plan 3's first, because plan 3 copies this plan's
-- request_connection, chat_summary and notification_recipient_eligible. The guarded chain is chat 3 → chat 2 → chat 1 →
-- circles → follow-ups (supabase/rollback/20261111140000_chat_core.rollback.sql, lines 34-42): this file refuses while
-- plan 3 is applied (its private.blocks exists), and chat core's refuses while this plan is (private.series_leaves
-- exists), so dropping series_leaves here is what lets chat core's run next. A refusal changes nothing.

-- 1. Chat plan 3 is applied: its blocks exist.
do $$ begin
 if pg_catalog.to_regclass('private.blocks') is not null then
  raise exception 'Run the chat safety rollback before the chat groups rollback';
 end if;
end $$;

-- Nothing reads or writes a plan, a guest row, a chat row or a leave until this commits.
lock table public.plans, public.attendees, public.chats, private.series_leaves in access exclusive mode;

-- 2. The triggers: no flag kept, no stop time, no leave cleared.
drop trigger plans_group_flag on public.plans;
drop trigger attendees_clear_leave on public.attendees;

-- 3. Chat core's bodies, as built: the one-off rules for every chat; no group line; a cancelled line is {actor}; a push
-- about a cancelled plan's chat is never told; a row has no plan_id and every reader reads the place; the pin and the
-- invitation card's announcement are the series' latest, whatever its occurrence.
create or replace function private.attendees_chat_lines() returns trigger language plpgsql security definer set search_path = '' as $$
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

create or replace function private.plans_chat_lines() returns trigger language plpgsql security definer set search_path = '' as $$
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

create or replace function private.chat_member(p_series uuid, p_user uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select coalesce((
  select private.is_host(c.id, p_user)
   or exists (select 1 from public.attendees a where a.plan_id = c.id and a.user_id = p_user and a.response in ('accepted','maybe'))
  from private.current_occurrence(p_series) c
  where c.id is not null and p_user is not null), false)
$$;

create or replace function private.chat_closes_at(p_series uuid) returns timestamptz language sql stable security definer set search_path = '' as $$
 select case when c.status = 'cancelled' then null else private.plan_end(c.starts_at, c.ends_at) + interval '48 hours' end
 from private.current_occurrence(p_series) c
$$;

create or replace function private.chat_open(p_series uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select coalesce(now() < private.chat_closes_at(p_series), c.status <> 'cancelled', false)
 from private.current_occurrence(p_series) c
$$;

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

create or replace function private.chat_row(p_message public.messages, p_viewer uuid) returns jsonb language sql stable security definer set search_path = '' as $$
 select jsonb_build_object('id', p_message.id, 'kind', p_message.kind, 'audience', p_message.audience, 'event', p_message.event,
  'payload', p_message.payload, 'body', case when p_message.state = 'sent' then p_message.body end, 'state', p_message.state,
  'author_id', p_message.author_id, 'created_at', p_message.created_at, 'updated_at', p_message.updated_at)
  || case when p_message.author_id is not null and p_message.author_id = p_viewer
      then jsonb_build_object('client_id', p_message.client_id) else '{}'::jsonb end
$$;

create or replace function private.my_chat_overview() returns jsonb language plpgsql stable security definer set search_path = '' as $$
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

-- 4. Who sees a resbite's guests: the creating-a-resbite body (a host, or a guest who has answered).
create or replace function private.can_see_guests(p_plan uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select private.eligible() and exists(select 1 from public.plans p where p.id=p_plan and (p.owner_id=auth.uid()
  or exists(select 1 from public.plan_admins pa where pa.plan_id=p.id and pa.user_id=auth.uid())
  or exists(select 1 from public.attendees a where a.plan_id=p.id and a.user_id=auth.uid() and a.response<>'pending')))
$$;

-- 5. Asking, from a resbite: the follow-ups body (the person asked has answered, or is a host).
create or replace function private.request_connection(p_user uuid, p_plan uuid) returns text language plpgsql security definer set search_path = '' as $$
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
 -- The notice carries how the two stand on the resbite asked from, for its line (CO-P5).
 insert into private.notification_outbox(plan_id,recipient_id,kind,dedupe_key,actor_id,created_at,detail)
  values(p_plan,p_user,'connection_request','connect:'||v_a||':'||v_b||':'||v_series||':'||v_uid,v_uid,v_at,private.pair_standing(p_plan,v_uid,p_user))
  on conflict do nothing;
 return 'requested';
end $$;

-- 6. The roll: the circles body (no flag of its own, no leave skipped, every bringer kept, no line).
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

-- 7. What this plan made: the calls, the helpers and the trigger functions; then the leave record and the stop time.
drop function public.leave_series(uuid);
drop function private.leave_series(uuid);
drop function public.series_is_group(uuid);
drop function private.series_is_group(uuid);
drop function private.group_stopped(uuid);
drop function private.chat_hide_line(bigint);
drop function private.chat_place_hidden(uuid,uuid);
drop function private.plans_group_flag();
drop function private.attendees_clear_leave();
drop table private.series_leaves;
alter table public.chats drop column stopped_at;

-- 8. The group flag back to false on every chats row; the column stays for chat core's rollback.
update public.chats set is_group = false where is_group;
