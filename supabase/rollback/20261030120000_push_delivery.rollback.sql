-- Rollback for 20261030120000_push_delivery.sql (push delivery). Run as one transaction, only with the owner's
-- approval:
--   begin; \i supabase/rollback/20261030120000_push_delivery.rollback.sql; commit;
-- It is for the hosted project, where that migration created every push object. It deletes:
--   - the delivery ledger, private.notification_deliveries, with every row in it: each notice's sends to each phone,
--     their tickets and outcomes;
--   - the outbox's expanded_at column, and the comment the migration put on its delivered_at;
--   - every function the migration created: the send-time audience notification_recipient_eligible(), the sender's
--     claim_notification_deliveries(), validate_notification_delivery() and finish_notification_delivery(), and
--     unregister_device() with its private body.
-- It restores verbatim register_device() and its public façade from
-- 20260917190517_resbite_private_tester_foundation.sql, with that file's grants (the hosted project has never run the
-- 20260918001308_notification_delivery_preparation body; the migration replaced the façade with the same text), and
-- fold_web_account() from 20261029120000_open_link_approval.sql (its public wrapper was never changed, and the revoke
-- repeats the migration's, which is 20261028120000_contact_invitations' for the private body).
-- Kept: registered devices stay, those registered under the migration's rules included (phone-only accounts, and
-- people waiting for a host's approval). Nothing sends to them, and the restored body lets an account register again
-- only once it has access (42501 otherwise), as before the migration. Undelivered notices stay in the outbox, unsent,
-- and delivered ones stay delivered; each notice's expanded_at goes with the column. Applied again later, the migration
-- treats every unsent notice as never expanded: any less than a day old goes out, even to a phone that already got it
-- before this ran. Folded accounts stay folded: a notice a fold gave to the app account keeps it.
-- Sender and builds: unschedule the sender first (select cron.unschedule('deliver-notifications'); see
-- supabase/ops/schedule-deliver-notifications.sql): once this has run, the functions it calls no longer exist. App
-- builds with push turned on call unregister_device() at sign-out, which no longer exists: the server's answer (404)
-- still lets them sign out. register_device() refuses an account without access again.
-- Order: run it before supabase/rollback/20261029120000_open_link_approval.rollback.sql, never after it. That file
-- restores the 20261028120000_contact_invitations fold_web_account() and drops private.join_requests; this one
-- restores plan 3's fold, which moves requests in that table, so it has to come back first. Run after that file, this
-- one would put plan 3's fold back over that file's, and every fold would fail on the missing table. Nor may that file
-- run while the push objects are in place: notification_recipient_eligible() reads private.join_requests, and nothing
-- in the catalog ties a function's body to a table, so the drop would go through and the sender's claim would then
-- fail whenever it had a notice to check, as would its check before each send; that file's guard refuses while
-- private.notification_deliveries exists. The guard below stops this file when that rollback has already run
-- (private.join_requests is gone); it changes nothing.

do $$ begin
 if to_regclass('private.join_requests') is null then raise exception 'Run this before the open-link approval rollback'; end if;
end $$;

-- The sender's functions, unregistering (the façade, then its body), and the send-time audience.
drop function public.unregister_device(text);
drop function private.unregister_device(text);
drop function public.finish_notification_delivery(uuid,uuid,text,text,integer);
drop function public.validate_notification_delivery(uuid,uuid);
drop function public.claim_notification_deliveries(integer);
drop function private.notification_recipient_eligible(bigint);

-- The ledger goes with its rows, indexes and constraints; the outbox keeps every notice, without expanded_at, and
-- delivered_at loses the comment the migration gave it (it had none before).
drop table private.notification_deliveries;
alter table private.notification_outbox drop column expanded_at;
comment on column private.notification_outbox.delivered_at is null;

-- The 20260917190517_resbite_private_tester_foundation body and façade, verbatim, with that file's grants: execute for
-- signed-in accounts only (it granted the private body with every private function, and the façade by name).
create or replace function private.register_device(p_token text,p_platform text) returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_tester();
begin
 if p_token is null or length(p_token) not between 10 and 300 then raise exception 'Invalid endpoint' using errcode='22023'; end if;
 insert into private.device_endpoints(token,user_id,platform) values(p_token,v_uid,p_platform)
 on conflict(token) do update set user_id=v_uid,platform=excluded.platform,updated_at=now();
end $$;
create or replace function public.register_device(p_token text,p_platform text) returns void language sql security invoker set search_path='' as $$ select private.register_device(p_token,p_platform) $$;
revoke all on function private.register_device(text,text),public.register_device(text,text) from public,anon,authenticated;
grant execute on function private.register_device(text,text),public.register_device(text,text) to authenticated;

-- The 20261029120000_open_link_approval body, verbatim. No grants: the private body is for its public wrapper alone.
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
 delete from private.join_requests f where f.user_id=p_from
  and (exists(select 1 from private.join_requests t where t.plan_id=f.plan_id and t.user_id=p_into)
   or exists(select 1 from public.attendees t where t.plan_id=f.plan_id and t.user_id=p_into)
   or exists(select 1 from public.plans p where p.id=f.plan_id and p.owner_id=p_into));
 update private.join_requests set user_id=p_into where user_id=p_from;
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
