-- Push delivery (docs/superpowers/plans/2026-10-29-push-notifications.md, Task 1; spec
-- docs/superpowers/specs/2026-10-27-contact-invitations-design.md CI-D11, CI-P13 and "Notifications").
-- One file for the hosted project with every push piece of the local-only
-- 20260918001308_notification_delivery_preparation.sql, 20261014130000_ux2_notification_wording.sql,
-- 20261015130000_ux3_note_delivery.sql and the delivery half of 20261022120001_gi2_local_delivery_and_deletion.sql:
-- the delivery ledger, expanded_at, the claim, validate and finish worker functions, unregister_device (its body now
-- private, behind a public façade), the token rules of register_device and the send-time audience. Delivery is
-- widened to phone-only accounts, a person waiting for a host's approval may register a device, and folding a web
-- account carries its unsent notices.
-- The deletion lifecycle stays local-only: this file creates and redefines none of its objects.
-- Hosted-compatible: depends only on the migrations listed in supabase/tests/hosted-baseline/migrations.txt plus
-- 20261027120000_phone_accounts.sql, 20261028120000_contact_invitations.sql and 20261029120000_open_link_approval.sql.
-- It also runs after every local file, where the ledger, expanded_at and the functions exist already: the table, the
-- column and the index are made only when absent, with the local definitions verbatim (supabase/tests/push-delivery.sql
-- checks both modes read the same), functions are replaced, and every function gets its revoke, then its grant.
-- Rollback: supabase/rollback/20261030120000_push_delivery.rollback.sql.

-- The delivery ledger: one row per notice and device. The 20260918001308_notification_delivery_preparation definitions.
create table if not exists private.notification_deliveries (
 id uuid primary key default gen_random_uuid(),
 outbox_id bigint not null references private.notification_outbox(id) on delete cascade,
 token text not null,
 endpoint_updated_at timestamptz not null,
 state text not null default 'pending' check(state in ('pending','sending','ticket','received','failed','invalid','unknown','suppressed')),
 attempts integer not null default 0,
 next_attempt_at timestamptz not null default now(),
 lease_id uuid,
 lease_until timestamptz,
 ticket_id text,
 ticket_created_at timestamptz,
 unique(outbox_id,token)
);
alter table private.notification_deliveries enable row level security;
revoke all on private.notification_deliveries from public,anon,authenticated;
create index if not exists notification_deliveries_due_idx on private.notification_deliveries(next_attempt_at) where state in ('pending','ticket','sending');
alter table private.notification_outbox add column if not exists expanded_at timestamptz;
comment on column private.notification_outbox.delivered_at is 'Worker processing finished across all endpoints; not a guarantee of delivery or reading. Inspect delivery ledger outcomes.';

-- Who may get a notice, checked when it is expanded to devices, again by each claim and again before each send: an
-- account that may use the app (user_eligible: a confirmed email or phone, a roster row or a live grant, not anonymous,
-- not banned) and isn't being deleted; the event's organizer, or someone on it (a change notice or a Note to guests
-- only while they may still come); and a notice less than a day old. A request's notice goes out only for a request the
-- host would see in their list (plan_join_requests' filters): still waiting, in the waiting period the notice was made
-- in (so a notice from an earlier period never comes back when the person asks again), from someone who isn't on the
-- event another way and isn't being deleted, on an active event that hasn't started. So a host who has approved or
-- declined it isn't told someone asked. The 20261022120001_gi2_local_delivery_and_deletion body with the account
-- checks delegated to user_eligible() and deletion_pending(), so a phone-only account is notified, and the request
-- check added.
create or replace function private.notification_recipient_eligible(p_outbox bigint) returns boolean
language sql stable security definer set search_path='' as $$
 select exists (
 select 1 from private.notification_outbox o
 join public.plans plan on plan.id=o.plan_id
 where o.id=p_outbox
 and private.user_eligible(o.recipient_id) and not private.deletion_pending(o.recipient_id)
 and (plan.owner_id=o.recipient_id or exists(select 1 from public.attendees a where a.plan_id=plan.id and a.user_id=o.recipient_id
  and (o.kind not in ('plan_changed','guest_note') or a.response in ('accepted','maybe','pending'))))
 and o.created_at>now()-interval '24 hours'
 and (o.kind<>'join_request' or (plan.status='active' and plan.starts_at>now()
  and exists(select 1 from private.join_requests j where j.plan_id=o.plan_id and j.user_id=o.actor_id
   and j.status='waiting' and j.created_at<=o.created_at)
  and not exists(select 1 from public.attendees a where a.plan_id=o.plan_id and a.user_id=o.actor_id)
  and not private.deletion_pending(o.actor_id)))
 )
$$;
revoke all on function private.notification_recipient_eligible(bigint) from public,anon,authenticated,service_role;

-- Any signed-in account that may hold a device registers it: a session, then the caller's lock (require_tester's, so
-- this queues behind a deletion request), then an account that is confirmed (email or phone), not anonymous, not banned
-- and not being deleted, else 42501 "Sign-in required". It needn't be one that may use the app yet: a person waiting for
-- a host's approval registers, so join_approved can reach them. Who is told what is still decided when a notice is
-- expanded, and again before each send (notification_recipient_eligible). Otherwise the
-- 20260918001308_notification_delivery_preparation body: the token pattern, and a new generation (updated_at) only when
-- the account or the platform changes, so the same binding again keeps in-flight sends valid while a rebound phone
-- fences the previous account's. The one change besides the access check: a missing platform is refused with the
-- other bad input (22023 "Invalid endpoint"), where that body let it reach the not-null column (23502). The
-- foundation's public façade and grants.
create or replace function private.register_device(p_token text,p_platform text) returns void language plpgsql security definer set search_path='' as $$
declare v_uid uuid := auth.uid();
begin
 if v_uid is null then raise exception 'Sign-in required' using errcode='42501'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_uid::text,47));
 if not exists(select 1 from auth.users u where u.id=v_uid and (u.email_confirmed_at is not null or u.phone_confirmed_at is not null)
  and not coalesce(u.is_anonymous,false) and (u.banned_until is null or u.banned_until<=now()))
 or private.deletion_pending(v_uid) then
  raise exception 'Sign-in required' using errcode='42501';
 end if;
 if p_token is null or length(p_token)>300 or p_token !~ '^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$' or p_platform is null or p_platform not in ('ios','android') then
 raise exception 'Invalid endpoint' using errcode='22023'; end if;
 insert into private.device_endpoints(token,user_id,platform,updated_at) values(p_token,v_uid,p_platform,clock_timestamp())
 on conflict(token) do update set user_id=v_uid,platform=excluded.platform,
 updated_at=case when private.device_endpoints.user_id=v_uid and private.device_endpoints.platform=excluded.platform
 then private.device_endpoints.updated_at else clock_timestamp() end;
end $$;
create or replace function public.register_device(p_token text,p_platform text) returns void language sql security invoker set search_path='' as $$ select private.register_device(p_token,p_platform) $$;
revoke all on function private.register_device(text,text),public.register_device(text,text) from public,anon,authenticated;
grant execute on function private.register_device(text,text),public.register_device(text,text) to authenticated;

-- The worker's claim. Each job carries what the sender may say (UX2-D4): never the place, note, description or cover
-- description. The 20261014130000_ux2_notification_wording body, verbatim.
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
 'actor_name',actor.display_name)),'[]'::jsonb) into v_result
 from claimed d join private.notification_outbox o on o.id=d.outbox_id
 join public.plans plan on plan.id=o.plan_id
 left join public.profiles actor on actor.id=o.actor_id and actor.deletion_requested_at is null;
 update private.notification_outbox o set delivered_at=now() where o.expanded_at is not null and o.delivered_at is null
 and not exists(select 1 from private.notification_deliveries d where d.outbox_id=o.id and d.state in ('pending','sending','ticket'));
 return v_result;
end $$;

-- Checked right before each send. The 20260918001308_notification_delivery_preparation body, verbatim.
create or replace function public.validate_notification_delivery(p_id uuid,p_lease uuid) returns boolean
language sql security definer set search_path='' as $$
 select exists(select 1 from private.notification_deliveries d
 join private.notification_outbox o on o.id=d.outbox_id
 join private.device_endpoints e on e.token=d.token and e.user_id=o.recipient_id and e.updated_at=d.endpoint_updated_at
 where d.id=p_id and d.lease_id=p_lease and d.lease_until>now() and d.state in ('sending','ticket')
 and private.notification_recipient_eligible(o.id))
$$;

-- The worker's outcome. The 20260918001308_notification_delivery_preparation body, verbatim.
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

revoke all on function public.claim_notification_deliveries(integer),public.validate_notification_delivery(uuid,uuid),public.finish_notification_delivery(uuid,uuid,text,text,integer) from public,anon,authenticated;
grant execute on function public.claim_notification_deliveries(integer),public.validate_notification_delivery(uuid,uuid),public.finish_notification_delivery(uuid,uuid,text,text,integer) to service_role;

-- Cleanup works even after roster removal/deletion request, but cannot remove another user's endpoint.
-- The 20260918001308_notification_delivery_preparation body, verbatim, as a private definer behind a public
-- invoker façade (the house pattern, as register_device); in full mode the façade replaces that file's definer.
create or replace function private.unregister_device(p_token text) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 delete from private.device_endpoints where token=p_token and user_id=auth.uid();
end $$;
create or replace function public.unregister_device(p_token text) returns void language sql security invoker set search_path='' as $$ select private.unregister_device(p_token) $$;
revoke all on function private.unregister_device(text),public.unregister_device(text) from public,anon,authenticated;
grant execute on function private.unregister_device(text),public.unregister_device(text) to authenticated;

-- Folding a web-only account carries the notices it caused that haven't gone out yet: they name the app account, which
-- now holds its requests and answers, instead of nobody once the web profile is deleted (a join_request about a moved
-- request would otherwise also stop reaching the host). Notices already processed keep their actor, blanked with the
-- profile. A web request dropped because the app account has its own takes its unsent notice with it, so the host
-- isn't told twice. The 20261029120000_open_link_approval body with those two steps added (in 2a, and 2b); its grants
-- and its public wrapper are unchanged (the revoke below repeats 20261028120000_contact_invitations' for the private
-- body, which has no grant).
create or replace function private.fold_web_account(p_from uuid, p_into uuid) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_moved integer; v_disabled boolean;
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
revoke all on function private.fold_web_account(uuid,uuid) from public, anon, authenticated, service_role;
