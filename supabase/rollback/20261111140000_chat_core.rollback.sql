-- Rollback for 20261111140000_chat_core.sql (chat core, chat plan 1 of 3). Run as one transaction, only with the owner's
-- approval:
--   begin; \i supabase/rollback/20261111140000_chat_core.rollback.sql; commit;
-- It is for the hosted project, where 20261111130000_circles_of_trust.sql is applied (this file restores its claim, its
-- fold and its deletion request). What is lost, with nobody told:
--   - every chat: every message, announcement and system line, every read and every mute (public.messages,
--     public.chats with its is_group, public.chat_reads, public.chat_mutes, and the messages' indexes and id sequence);
--   - every 'chat_message' and 'announcement' outbox row, sent or not, with its deliveries, so the earlier kind check can
--     come back: a chat push or an announcement not yet sent is never sent. Sent pushes are not recalled.
-- It drops the Realtime policy chat_members_listen on realtime.messages (no phone may join a chat channel after it; the
-- broadcasts already in realtime.messages are Realtime's own and expire with it), the seven triggers (messages_signal,
-- attendees_chat_lines, plans_chat_lines, plan_admins_chat_lines, messages_chat_stats, messages_touch, plans_chat_row),
-- every function the migration made (the ten public calls with their private bodies, can_listen, the trigger functions
-- and the helpers, private.chat_is_group among them), the outbox's message_id (its index notification_outbox_message_idx
-- with it) and its index notification_outbox_recipient_kind_idx, and the four tables.
-- It restores, each keeping its grants (create or replace):
--   private.notification_recipient_eligible   from 20261110120000_connections.sql
--   public.claim_notification_deliveries      from 20261111130000_circles_of_trust.sql (the worker's; no wrapper)
--   private.fold_web_account                  from 20261111130000_circles_of_trust.sql (its public wrapper unchanged):
--                                             a fold no longer moves chat authors and lines, which go with the chat
--   public.finish_notification_delivery       from 20261030120000_push_delivery.sql (the worker's; no wrapper): it
--                                             refuses the outcome 'deferred' again, so the sender that hands jobs back
--                                             (Task 4's deliver-notifications) goes back to the earlier one before or
--                                             with this file: a hand-back it refuses leaves the job leased as sending,
--                                             and the next claim after the lease marks it unknown, never sent
--   private.request_account_deletion          from 20261111130000_circles_of_trust.sql, where it exists (the deletion
--                                             lifecycle is local-only: on the hosted project there is none, and nothing
--                                             is done)
-- and the outbox's kind check with the eleven kinds of 20261110120000_connections.sql.
-- Kept: everything else; the resbites, their guests and admins, and every other notice.
-- Builds: an app build with chat (the Chat row, /chat, the unread dots, the announcement lines, chat pushes) gets errors
-- from the calls dropped here and a refused channel. Roll the app back first. Installed builds from before chat read
-- nothing this removes.
-- Order (NOTE 5, H34): the three chat plans ship in one release, and roll back in this order only: chat 3 (safety),
-- chat 2 (groups), chat 1 (this file), then circles, the connections follow-ups, connections and creating-a-resbite.
-- Chat plan 2 must be rolled back first: its groups read this file's tables and functions. The guarded chain is
-- chat 3 → chat 2 → chat 1 → circles → follow-ups: plan 2's rollback refuses while plan 3 is applied, the guard below
-- refuses while plan 2 is (its private.series_leaves exists), the circles rollback refuses while chat is
-- (public.messages exists), and the follow-ups rollback refuses while circles is. Below it nothing guards: the
-- connections and creating-a-resbite rollbacks have no guard against chat, so never run either while chat is applied
-- (the connections one would take the chat kinds out of the outbox's check and the chat branch out of who may be told,
-- under a live chat). A refusal changes nothing.

-- 1. Chat plan 2 is applied: its leave records exist.
do $$ begin
 if pg_catalog.to_regclass('private.series_leaves') is not null then
  raise exception 'Run the chat groups rollback before the chat core rollback';
 end if;
end $$;

-- Nothing reads or writes a guest row, a plan, an admin, a message, a chat row, a read, a mute or a notice until this
-- commits.
lock table public.plans, public.attendees, public.plan_admins, public.messages, public.chats, public.chat_reads, public.chat_mutes,
 private.notification_outbox in access exclusive mode;

-- 2. Nobody may join a chat channel.
drop policy chat_members_listen on realtime.messages;

-- 3. The triggers: no line, no signal, no chat row, no figures.
drop trigger messages_signal on public.messages;
drop trigger attendees_chat_lines on public.attendees;
drop trigger plans_chat_lines on public.plans;
drop trigger plan_admins_chat_lines on public.plan_admins;
drop trigger messages_chat_stats on public.messages;
drop trigger messages_touch on public.messages;
drop trigger plans_chat_row on public.plans;

-- 4. Who may be told, as it was (20261110120000_connections.sql): every notice by the resbite or connection rule; no chat
-- kinds.
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
-- The worker's claim as it was (20261111130000_circles_of_trust.sql): no chat fields, and the jobs in the order the
-- notices were made, every kind alike.
create or replace function public.claim_notification_deliveries(p_limit integer default 25) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_outbox record; v_result jsonb;
begin
 -- Endpoint expansion is once per logical event; never notify a newly bound device about old events.
 for v_outbox in select o.id from private.notification_outbox o
 where o.expanded_at is null and o.delivered_at is null order by o.id limit 100 for update skip locked
 loop
  if private.notification_recipient_eligible(v_outbox.id) then
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
 with picked as (
 select d.id from private.notification_deliveries d where d.state in ('pending','ticket')
 and d.next_attempt_at<=now() and (d.lease_until is null or d.lease_until<now())
 order by d.next_attempt_at,d.id limit greatest(1,least(coalesce(p_limit,25),25)) for update skip locked
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
  where a.plan_id=o.plan_id and a.user_id=o.actor_id and a.brought_by<>o.recipient_id and not private.deletion_pending(b.id)) end)
 -- In the order the notices were made (circles of trust).
 order by o.id, d.id),'[]'::jsonb) into v_result
 from claimed d join private.notification_outbox o on o.id=d.outbox_id
 join public.plans plan on plan.id=o.plan_id
 left join public.profiles actor on actor.id=o.actor_id and actor.deletion_requested_at is null;
 update private.notification_outbox o set delivered_at=now() where o.expanded_at is not null and o.delivered_at is null
 and not exists(select 1 from private.notification_deliveries d where d.outbox_id=o.id and d.state in ('pending','sending','ticket'));
 return v_result;
end $$;
-- Folding a web account as it was (20261111130000_circles_of_trust.sql): no chat step.
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
 -- 4. The web profile.
 delete from public.profiles where id=p_from;
 return jsonb_build_object('moved_attendees',v_moved);
end $$;
-- The worker's outcome as it was (20261030120000_push_delivery.sql): no 'deferred'.
create or replace function public.finish_notification_delivery(p_id uuid,p_lease uuid,p_outcome text,p_ticket text default null,p_delay_seconds integer default 0)
returns void language plpgsql security definer set search_path='' as $$
declare d private.notification_deliveries; v_recipient uuid;
begin
 if p_outcome not in ('ticket','received','retry','failed','invalid','unknown','suppressed') then raise exception 'Invalid delivery outcome'; end if;
 select * into d from private.notification_deliveries where id=p_id and lease_id=p_lease and lease_until>now() for update;
 if not found then return; end if; -- deletion or obsolete worker lease
 if p_outcome='ticket' and (p_ticket is null or length(p_ticket) not between 1 and 512) then raise exception 'Ticket required'; end if;
 if p_outcome='invalid' then
  select recipient_id into v_recipient from private.notification_outbox where id=d.outbox_id;
  delete from private.device_endpoints where token=d.token and user_id=v_recipient and updated_at=d.endpoint_updated_at;
 end if;
 update private.notification_deliveries set
 state=case when p_outcome='retry' then case when attempts>=8 then 'unknown' when ticket_id is null then 'pending' else 'ticket' end else p_outcome end,
 ticket_id=case when p_outcome='ticket' then p_ticket else ticket_id end,
 ticket_created_at=case when p_outcome='ticket' then now() else ticket_created_at end,
 next_attempt_at=now()+make_interval(secs=>greatest(30,least(coalesce(p_delay_seconds,30),3600))),
 lease_id=null,lease_until=null where id=d.id;
 update private.notification_outbox o set delivered_at=now() where o.id=d.outbox_id
 and not exists(select 1 from private.notification_deliveries x where x.outbox_id=o.id and x.state in ('pending','sending','ticket'));
end $$;

-- 5. Asking to delete an account as it was (20261111130000_circles_of_trust.sql), where the local-only deletion lifecycle
-- exists: no chat flag, and no messages, reads or mutes to clear.
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

-- 6. Every function the migration made: the ten public calls and their private bodies, the listening check, the trigger
-- functions and the helpers.
drop function public.chat_summary(uuid), private.chat_summary(uuid),
 public.chat_messages(uuid,bigint,integer), private.chat_messages(uuid,bigint,integer),
 public.chat_messages_since(uuid,bigint,timestamptz), private.chat_messages_since(uuid,bigint,timestamptz),
 public.my_chat_overview(), private.my_chat_overview(),
 public.send_message(uuid,text,uuid), private.send_message(uuid,text,uuid),
 public.send_announcement(uuid,text,text,uuid), private.send_announcement(uuid,text,text,uuid),
 public.delete_message(bigint), private.delete_message(bigint),
 public.remove_message(bigint), private.remove_message(bigint),
 public.mark_chat_read(uuid,bigint), private.mark_chat_read(uuid,bigint),
 public.set_chat_mute(uuid,boolean), private.set_chat_mute(uuid,boolean);
drop function private.can_listen(text), private.messages_signal(), private.attendees_chat_lines(), private.plans_chat_lines(),
 private.plan_admins_chat_lines(), private.chat_lines_off(), private.chat_system_line(uuid,text,jsonb),
 private.messages_chat_stats(), private.chat_body(text), private.messages_touch(), private.plans_chat_row();
drop function private.chat_names(jsonb), private.chat_row(public.messages,uuid), private.chat_first_name(uuid),
 private.announcement_audience(uuid,text), private.chat_is_group(uuid), private.chat_open(uuid), private.chat_closes_at(uuid),
 private.chat_members(uuid), private.chat_member(uuid,uuid), private.current_occurrence(uuid);

-- 7. The outbox as it was (20261110120000_connections.sql): the two chat kinds' rows go (their deliveries with them),
-- then the recipient index, the message_id column (its index and its key with it) and the kind check with the chat
-- kinds.
delete from private.notification_outbox where kind in ('chat_message','announcement');
drop index private.notification_outbox_recipient_kind_idx;
alter table private.notification_outbox drop column message_id;
alter table private.notification_outbox drop constraint notification_outbox_kind_check;
alter table private.notification_outbox add constraint notification_outbox_kind_check
 check (kind in ('invitation','rsvp','plan_changed','plan_cancelled','guest_note','invited','join_request','join_approved','admin_added',
  'connection_request','connection_accepted'));

-- 8. The four tables, with their rows, indexes and the messages' id sequence; chats.is_group goes with its table.
drop table public.chat_mutes, public.chat_reads, public.chats, public.messages;
