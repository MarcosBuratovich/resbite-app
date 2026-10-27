-- Rollback for 20261029120000_open_link_approval.sql (open-link approval). Run as one transaction, only with the
-- owner's approval:
--   begin; \i supabase/rollback/20261029120000_open_link_approval.rollback.sql; commit;
-- It deletes:
--   - every open-link request, waiting, approved or declined, with its table. Waiting people were never on the event
--     and hold no grant from asking, so nothing else of theirs goes: they tap the link again and, while it is live and
--     the event open, the restored bodies put them straight on it, as before the migration. A decline no longer holds
--     either: a declined person who taps a live link joins, unless the host turns it off;
--   - every 'join_request' and 'join_approved' outbox row (the request and approval notices, delivered or not), so
--     the earlier kind check can come back.
-- It turns every 'approval' grant into a 'link' grant on the same row (one grant per account; its link and times
-- stay): a live one stays live, so approved guests keep their access as a link grant gave it under GI2, and a revoked
-- one stays revoked, so a ban stays a ban.
-- It restores verbatim claim_plan_link() from 20261021120000_gi1_event_links.sql, join_by_link() from
-- 20261027120000_phone_accounts.sql and fold_web_account() from 20261028120000_contact_invitations.sql (their grants
-- and public façades were never changed), and the outbox kind check and the grant-source check from
-- 20261028120000_contact_invitations.sql; and drops every function the migration created.
-- Kept: approved guests stay on their events with their answers, as they would have joined under GI2; the profiles,
-- names and 18+ ticks people gave while asking stay. Folded accounts stay folded: a request a fold moved goes with the
-- table.
-- Builds: once this has run, app and web builds made with this plan call functions that no longer exist (the open
-- link, the waiting screen, Waiting for you); see step 7 of qa/open-link-approval-2026-10-29/README.md.
-- Order: run it before supabase/rollback/20261028120000_contact_invitations.rollback.sql, never after it. That file
-- drops fold_web_account() with its public wrapper, and private.phone_invitations, which the fold body restored here
-- updates: run after it, this file would bring back the private fold on its own, executable by any signed-in account
-- instead of no one, updating a table that is gone, and would widen that file's two checks again. That file's checks
-- also cannot go back while request notices or approval grants exist, and only this file clears them. The guard
-- below stops this file when that rollback has already run (private.phone_invitations is gone); it changes nothing.

do $$ begin
 if to_regclass('private.phone_invitations') is null then raise exception 'Run this before the contact-invitations rollback'; end if;
end $$;

-- Asking and deciding.
drop function public.decide_join_request(uuid,uuid,boolean);
drop function private.decide_join_request(uuid,uuid,boolean);
drop function public.plan_join_requests(uuid);
drop function private.plan_join_requests(uuid);
drop function public.change_join_answer(uuid,text);
drop function private.change_join_answer(uuid,text);
drop function public.my_join_requests();
drop function private.my_join_requests();
drop function public.my_join_request(text);
drop function private.my_join_request(text);
drop function public.request_to_join(text,text,text,text);
drop function private.request_to_join(text,text,text,text);
drop function private.request_join(uuid,private.plan_links,public.plans,text);

-- The 20261021120000_gi1_event_links body, verbatim.
create or replace function private.claim_plan_link(p_code text) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_tester(); v_link private.plan_links; v_plan public.plans;
begin
 if p_code is null or p_code !~ '^[A-Za-z0-9_-]{22}$' then raise exception 'Invitation unavailable' using errcode='42501'; end if;
 select * into v_link from private.plan_links where code=p_code;
 if not found then raise exception 'Invitation unavailable' using errcode='42501'; end if;
 select * into v_plan from public.plans where id=v_link.plan_id for update;
 if not found then raise exception 'Invitation unavailable' using errcode='42501'; end if;
 if v_plan.owner_id=v_uid or exists(select 1 from public.attendees where plan_id=v_plan.id and user_id=v_uid) then return v_plan.id; end if;
 -- Read again under the plan lock: rotate_plan_link holds the same lock while it turns the link off.
 perform 1 from private.plan_links where id=v_link.id and revoked_at is null;
 if not found then raise exception 'Invitation unavailable' using errcode='42501'; end if;
 if v_plan.status<>'active' or v_plan.starts_at<=now() then raise exception 'Invitation unavailable' using errcode='42501'; end if;
 insert into public.attendees(plan_id,user_id) values(v_plan.id,v_uid);
 insert into private.notification_outbox(plan_id,recipient_id,kind,dedupe_key,actor_id)
  values(v_plan.id,v_plan.owner_id,'invitation','link:'||v_link.id||':'||v_uid,v_uid) on conflict do nothing;
 return v_plan.id;
end $$;

-- The 20261027120000_phone_accounts body, verbatim.
create or replace function private.join_by_link(p_code text,p_name text,p_terms_version text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_link private.plan_links; v_plan public.plans; v_has_profile boolean;
begin
 if v_uid is null then raise exception 'Sign-in required' using errcode='42501'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_uid::text,47));
 if not exists(select 1 from auth.users u where u.id=v_uid and (u.email_confirmed_at is not null or u.phone_confirmed_at is not null)
  and not coalesce(u.is_anonymous,false) and (u.banned_until is null or u.banned_until<=now()))
 or private.deletion_pending(v_uid) then
  raise exception 'Sign-in required' using errcode='42501';
 end if;
 if exists(select 1 from private.beta_access where user_id=v_uid and revoked_at is not null) then
  raise exception 'Invitation unavailable' using errcode='42501';
 end if;
 if private.eligible() then return private.claim_plan_link(p_code); end if;
 if exists(select 1 from auth.users u where u.id=v_uid
  and exists(select 1 from private.tester_roster r where r.email = lower(u.email) and not r.enabled)) then
  raise exception 'Invitation unavailable' using errcode='42501';
 end if;
 if p_code is null or p_code !~ '^[A-Za-z0-9_-]{22}$' then raise exception 'Invitation unavailable' using errcode='42501'; end if;
 select * into v_link from private.plan_links where code=p_code and revoked_at is null;
 if not found then raise exception 'Invitation unavailable' using errcode='42501'; end if;
 select * into v_plan from public.plans where id=v_link.plan_id for update;
 -- A link grants access only while its organizer may use the app themselves.
 if not found or v_plan.owner_id is null or v_plan.status<>'active' or v_plan.starts_at<=now()
 or not private.user_eligible(v_plan.owner_id) then
  raise exception 'Invitation unavailable' using errcode='42501';
 end if;
 -- Read again under the plan lock: rotate_plan_link holds the same lock while it turns the link off.
 perform 1 from private.plan_links where id=v_link.id and revoked_at is null;
 if not found then raise exception 'Invitation unavailable' using errcode='42501'; end if;
 -- Defensive: the organizer check above already refuses this unless the roster changed after eligible().
 if v_plan.owner_id=v_uid then raise exception 'Invitation unavailable' using errcode='42501'; end if;
 v_has_profile := exists(select 1 from public.profiles where id=v_uid);
 if not v_has_profile and coalesce(char_length(btrim(p_name)),0) not between 1 and 80 then
  raise exception 'Name required' using errcode='22023';
 end if;
 if not exists(select 1 from private.age_attestations where user_id=v_uid) then
  if p_terms_version is null or p_terms_version !~ '^[0-9]{4}-[0-9]{2}$' then
   raise exception 'Age confirmation required' using errcode='22023';
  end if;
  insert into private.age_attestations(user_id,terms_version) values(v_uid,p_terms_version);
 end if;
 insert into private.beta_access(user_id,source,plan_link_id) values(v_uid,'link',v_link.id);
 if not v_has_profile then insert into public.profiles(id,display_name) values(v_uid,btrim(p_name)); end if;
 insert into public.attendees(plan_id,user_id) values(v_plan.id,v_uid) on conflict do nothing;
 if found then
  insert into private.notification_outbox(plan_id,recipient_id,kind,dedupe_key,actor_id)
   values(v_plan.id,v_plan.owner_id,'invitation','link:'||v_link.id||':'||v_uid,v_uid) on conflict do nothing;
 end if;
 return v_plan.id;
end $$;

-- The 20261028120000_contact_invitations body, verbatim.
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

-- Request and approval notices go first: the 20261028120000_contact_invitations check has neither kind.
delete from private.notification_outbox where kind in ('join_request','join_approved');
alter table private.notification_outbox drop constraint notification_outbox_kind_check;
alter table private.notification_outbox add constraint notification_outbox_kind_check
 check (kind in ('invitation','rsvp','plan_changed','plan_cancelled','guest_note','invited'));

-- Approval grants become link grants next, in place: the 20261028120000_contact_invitations check has no approval
-- source. A live grant stays live, and a ban (a revoked grant) stays a ban.
update private.beta_access set source='link' where source='approval';
alter table private.beta_access drop constraint beta_access_source_check,
 add constraint beta_access_source_check check (source in ('link','maintainer','invitation'));

drop table private.join_requests;
