-- Rollback for 20261111160000_chat_safety.sql (report and block, chat plan 3 of 3). Run as one transaction, only with
-- the owner's approval:
--   begin; \i supabase/rollback/20261111160000_chat_safety.rollback.sql; commit;
-- It is for the hosted project, where chat groups (20261111150000_chat_groups.sql) is applied: it restores the bodies
-- this migration replaced. What is lost, with nobody told:
--   - every block (private.blocks): blocked people's messages, announcements, pushes and invitations reach the blocker
--     again; a connection a block ended does not come back;
--   - every report (private.reports), open or closed, with its frozen words, and every report_filed notice, sent or not,
--     with its deliveries, so chat core's kind check can come back. Pushes already sent are not recalled;
--   - every moderator (private.moderators), every acceptance of the chat rules (private.chat_rules_acceptances) and
--     every blocked term (private.blocked_terms).
-- It drops block_user, my_blocks, report_message, report_user and accept_chat_rules (each in both schemas),
-- chat_rules_version, report_keep_days, invited_by and inviter_of, and the five tables (their indexes and the reports'
-- id sequence with them).
-- It restores, each byte for byte and keeping its grants (create or replace):
--   private.chat_messages, chat_messages_since, send_message, send_announcement, fold_web_account,
--   public.claim_notification_deliveries (the worker's; no wrapper) and, where it exists, private.request_account_deletion
--   (the deletion lifecycle is local-only: on the hosted project there is none, and nothing is done)
--                                             from 20261111140000_chat_core.sql (sha256
--                                             1047fb379a4e8a942b49db3f7134674caecf2cbb30f67e0ebf9f0f2fea6a78ce)
--   private.chat_summary, my_chat_overview, request_connection, notification_recipient_eligible
--                                             from 20261111150000_chat_groups.sql (sha256
--                                             068d7f42432862749646b4f7972e6cc9bc226d2670ca82d96610fd3b66759f23)
--   private.plan_connection_states            from 20261110120000_connections.sql (sha256
--                                             1f403e42f97e9c2b619fe7a5d778bee0dfd2146d7fffc5a2114b24cb32d112d8)
--   private.invite_contacts                   from 20261111130000_circles_of_trust.sql (sha256
--                                             04062e2b091fa582f59a3d1ff9a322e8019ce671c64d532d5c113d0916d77256)
--   private.contacts_on_resbite               from 20261030130000_phone_key.sql (sha256
--                                             d7cf188f6b63d14453a2b34d6c8c85838ed196d7a06e01e3bd94c66ae0a14667)
-- and the outbox's kind check with chat core's thirteen kinds. Every restored body comes back before the tables go, and
-- none of them names one of the five.
-- What people notice:
--   - a message the team removed stays removed, with payload {"by": "resbite"}: a build without plan 3 words it as
--     "Message removed by an admin";
--   - nobody is asked to accept the chat rules, and no term is refused;
--   - a closed report's record, and the daily read of reports and blocks, are gone; the scripts in supabase/ops that
--     read or write the five tables fail.
-- Builds and the sender (challenge I9): a build with plan 3's app calls accept_chat_rules, report_message, report_user,
-- block_user and my_blocks, which this file drops, and reads chat_summary's rules_accepted as missing, so it holds every
-- first message for the rules sheet and its I agree fails: it cannot send. Roll the app back first, or with this file,
-- as chat core's runbook does for its sender. The sender (deliver-notifications, with the moderators' push) needs
-- nothing: with no report_filed notice left it words none, so it may stay or go back.
-- If it stops with "deadlock detected", nothing has changed: run it again. A worker's claim, a chat being opened or a
-- block being made met it mid-way, each reading these tables in an order of its own (step 1).
-- Order (G-N11): roll back in reverse order only: this file first, then chat groups' (plan 2), then chat core's (plan
-- 1). The full order and the guarded chain are chat core's: chat 3 → chat 2 → chat 1 → circles → follow-ups, then
-- connections and creating-a-resbite, which have no guard (supabase/rollback/20261111140000_chat_core.rollback.sql,
-- lines 34-42). Plan 2's rollback refuses while private.blocks exists, so dropping it here is what lets plan 2's run
-- next; the two in turn land on chat core's bodies, and chat core's rollback then restores the circles' claim and fold.

-- 1. Nothing writes a notice, a block, a report, a moderator, an acceptance or a term until this commits, so a send or a
-- report made meanwhile waits for it instead of making it fail (challenge N6). The tables are taken in the order a send
-- or a report meets them (the rules, the terms, the blocks, the reports, the moderators), the outbox last, as chat
-- core's rollback takes it (SR3): one already past some of them finishes first, and this then runs. No one order
-- suits every caller (SR5): the worker's claim reads the outbox before the blocks and the moderators; a chat being
-- opened (chat_summary) reads the blocks before the rules; a block being made (block_user) reads the outbox before it
-- writes the block. One of these running at that moment can meet this file the other way: Postgres then stops this
-- file with "deadlock detected", having changed nothing, and it is run again.
lock table private.chat_rules_acceptances, private.blocked_terms, private.blocks, private.reports, private.moderators,
 private.notification_outbox in access exclusive mode;

-- 2. The report_filed notices, sent or not, and their deliveries with them.
delete from private.notification_outbox where kind = 'report_filed';

-- 3. Chat core's kind check: its thirteen kinds.
alter table private.notification_outbox drop constraint notification_outbox_kind_check;
alter table private.notification_outbox add constraint notification_outbox_kind_check
 check (kind in ('invitation','rsvp','plan_changed','plan_cancelled','guest_note','invited','join_request','join_approved','admin_added',
  'connection_request','connection_accepted','chat_message','announcement'));

-- 4. Chat core's bodies, as built: the history, the summary's figures and the writes know no block; a message needs no
-- acceptance and holds any word; the claim names any bringer; the fold moves no block and no report; and, where it
-- exists, the deletion leaves blocks, reports, acceptances and moderator rows (their tables go below).
create or replace function private.chat_messages(p_series uuid, p_before bigint, p_limit int) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := private.require_tester(); v_rows jsonb; v_limit int := greatest(1, least(coalesce(p_limit, 50), 100));
begin
 if not private.chat_member(p_series, v_uid) then raise exception 'Not in this chat' using errcode='42501'; end if;
 select coalesce(jsonb_agg(private.chat_row(m, v_uid) order by m.id), '[]'::jsonb) into v_rows
 from (select * from public.messages m
       where m.series_id = p_series and (p_before is null or m.id < p_before)
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
       order by m.id limit 200) m;
 return jsonb_build_object('rows', v_rows, 'names', private.chat_names(v_rows), 'as_of', now());
end $$;

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
   and not exists (select 1 from private.notification_outbox o join public.messages m on m.id = o.message_id
                   where o.recipient_id = r.id and o.kind = 'chat_message' and m.series_id = p_series
                     and o.created_at > now() - interval '60 seconds')
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

do $rollback$ begin
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
end $rollback$;

-- 5. Chat groups' bodies, as built (challenge B2): the summary with its current-occurrence pin and no rules_accepted,
-- the overview with its current-occurrence card announcement and no inviters (GR4), asking to connect with its group
-- rule and no block check, and who may be told with its P2-Q1 group rule, no block test and no report_filed branch.
create or replace function private.chat_summary(p_series uuid) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := private.require_tester(); v_plan public.plans; v_chat public.chats; v_pinned jsonb; v_last jsonb; v_read bigint;
begin
 if not private.chat_member(p_series, v_uid) then raise exception 'Not in this chat' using errcode='42501'; end if;
 v_plan := private.current_occurrence(p_series);
 select * into v_chat from public.chats c where c.series_id = p_series;
 select private.chat_row(m, v_uid) into v_pinned from public.messages m where m.id = v_chat.pinned_message_id and m.series_id = p_series
  and (not coalesce(v_chat.is_group, false) or m.plan_id = v_plan.id);
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
          and (not private.chat_is_group(p.series_id) or m.plan_id = p.id)
          and exists (select 1 from private.announcement_audience(p.series_id, m.audience) as r(id) where r.id = v_uid)
         order by m.id desc limit 1) m
       where a.user_id = v_uid and a.response = 'pending' and p.status = 'active'
        and private.plan_end(p.starts_at, p.ends_at) > now()
        and p.id = (private.current_occurrence(p.series_id)).id) x;
 return jsonb_build_object('chats', v_chats, 'announcements', v_announcements, 'names', private.chat_names(v_lasts || v_authors));
end $$;

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

-- 6. The people list's dots, inviting by number and the contact lookup, as their migrations built them: no block reads
-- 'none', turns an invitation into a link, or hides a number.
create or replace function private.plan_connection_states(p_plan uuid) returns jsonb language plpgsql stable security definer set search_path = '' as $$
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
   and private.user_eligible(u.id) and private.used_app(u.id)
   and exists(select 1 from public.profiles p where p.id=u.id))) t;
 return v_out;
end $$;

-- 7. What this plan made: the calls (public wrapper first), the helpers, then the five tables.
drop function public.block_user(uuid,boolean);
drop function private.block_user(uuid,boolean);
drop function public.my_blocks();
drop function private.my_blocks();
drop function public.report_message(bigint,text,text);
drop function private.report_message(bigint,text,text);
drop function public.report_user(uuid,uuid,text,text);
drop function private.report_user(uuid,uuid,text,text);
drop function public.accept_chat_rules();
drop function private.accept_chat_rules();
drop function private.chat_rules_version();
drop function private.report_keep_days();
drop function private.invited_by(uuid,uuid);
drop function private.inviter_of(uuid);
drop table private.blocks;
drop table private.reports;
drop table private.moderators;
drop table private.chat_rules_acceptances;
drop table private.blocked_terms;
