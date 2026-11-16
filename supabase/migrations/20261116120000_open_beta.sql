-- Open beta (owner, 16 Nov 2026: "I don't want this check any more. The app is open for beta testers."). Any
-- confirmed account may use the app: a confirmed email or phone, not anonymous, not banned in Auth, not suspended by
-- the owner (a revoked grant or a disabled roster row) and not leaving. The tester roster and the access grants no
-- longer gate anything; the waiting-for-access screen is left only for suspended accounts.
--
-- Hosted-compatible. Each redefined body is the hosted one (the file named above it) with only the lines named in
-- its comment changed; grants are unchanged (create or replace keeps them). Rollback:
-- supabase/rollback/20261116120000_open_beta.rollback.sql. The resbite's own approval is untouched: an answer
-- through the event link still waits for the host.
--
-- Not changed here, because they aren't on the hosted project: the local-only deletion functions
-- prepare_deletion_intent and activate_deletion_intent (20260929125858, 20261022120001) still ask for a roster row
-- or a grant. The deletion release must change them the same way (see qa/deletion-recovery-ledger.md).

-- The old rule's grant half: an enabled roster row for the account's own confirmed email, or a live grant. It no
-- longer decides who may use the app. It only keeps three flows as they were for old testers and grant holders:
-- join_by_link and request_to_join don't ask them for the 18+ tick again, and an approval records a grant.
create function private.granted_access(p_user uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select exists (select 1 from auth.users u where u.id = p_user and u.email_confirmed_at is not null
   and exists (select 1 from private.tester_roster r where r.email = lower(u.email) and r.enabled))
  or private.has_live_grant(p_user)
$$;
revoke all on function private.granted_access(uuid) from public, anon, authenticated, service_role;

-- The owner's ban: a revoked grant (beta_access.revoked_at, "the owner's ban for abuse") or a disabled roster row.
-- supabase/ops/suspend-account.sql sets them.
create function private.access_suspended(p_user uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select exists (select 1 from private.beta_access where user_id = p_user and revoked_at is not null)
  or exists (select 1 from auth.users u join private.tester_roster r on r.email = lower(u.email)
   where u.id = p_user and not r.enabled)
$$;
revoke all on function private.access_suspended(uuid) from public, anon, authenticated, service_role;

-- supabase/ops/suspend-account.sql records a revoked grant for an account that has none (nothing else would keep them
-- out now). The suspension remembers that it made that grant, so its undo deletes it instead of leaving a live grant
-- behind (a live grant would skip the 18+ tick in the link flows).
alter table private.suspensions add column grant_made boolean not null default false;

-- From 20261027120000_phone_accounts.sql: the roster-or-grant line becomes "not suspended".
create or replace function private.user_eligible(p_user uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select p_user is not null and exists (
  select 1 from auth.users u
  where u.id = p_user and (u.email_confirmed_at is not null or u.phone_confirmed_at is not null)
    and not coalesce(u.is_anonymous,false)
    and not private.access_suspended(u.id)
    and (u.banned_until is null or u.banned_until <= now())
 ) and not private.deletion_pending(p_user)
$$;

-- From 20261031120000_creating_a_resbite.sql: only old testers and grant holders take the claim path (the line
-- that tested eligible()); everyone else, now eligible too, keeps the path that asks for the name and the 18+ tick.
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
 if private.granted_access(v_uid) and private.eligible() then return private.claim_plan_link(p_code); end if;
 if exists(select 1 from auth.users u where u.id=v_uid
  and exists(select 1 from private.tester_roster r where r.email = lower(u.email) and not r.enabled)) then
  raise exception 'Invitation unavailable' using errcode='42501';
 end if;
 if p_code is null or p_code !~ '^[A-Za-z0-9_-]{22}$' then raise exception 'Invitation unavailable' using errcode='42501'; end if;
 select * into v_link from private.plan_links where code=p_code and revoked_at is null;
 if not found then raise exception 'Invitation unavailable' using errcode='42501'; end if;
 select * into v_plan from public.plans where id=v_link.plan_id for update;
 -- A link grants access only while its organizer may use the app themselves.
 if not found or v_plan.owner_id is null or v_plan.status<>'active' or private.plan_end(v_plan.starts_at,v_plan.ends_at)<=now()
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
 if not v_has_profile then insert into public.profiles(id,display_name) values(v_uid,btrim(p_name)); end if;
 perform private.request_join(v_uid,v_link,v_plan,'pending');
 return v_plan.id;
end $$;

-- From 20261031120000_creating_a_resbite.sql: the 18+ tick is asked of everyone but old testers and grant holders
-- (the line that tested eligible()).
create or replace function private.request_to_join(p_code text, p_name text, p_response text, p_terms_version text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_link private.plan_links; v_plan public.plans;
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
 if exists(select 1 from auth.users u where u.id=v_uid
  and exists(select 1 from private.tester_roster r where r.email = lower(u.email) and not r.enabled)) then
  raise exception 'Invitation unavailable' using errcode='42501';
 end if;
 if p_code is null or p_code !~ '^[A-Za-z0-9_-]{22}$' then raise exception 'Invitation unavailable' using errcode='42501'; end if;
 select * into v_link from private.plan_links where code=p_code;
 if not found then raise exception 'Invitation unavailable' using errcode='42501'; end if;
 select * into v_plan from public.plans where id=v_link.plan_id for update;
 if not found then raise exception 'Invitation unavailable' using errcode='42501'; end if;
 if v_plan.owner_id=v_uid or exists(select 1 from public.attendees where plan_id=v_plan.id and user_id=v_uid) then
  return private.request_join(v_uid,v_link,v_plan,p_response);
 end if;
 -- Read again under the plan lock: rotate_plan_link holds the same lock while it turns the link off.
 perform 1 from private.plan_links where id=v_link.id and revoked_at is null;
 if not found then raise exception 'Invitation unavailable' using errcode='42501'; end if;
 if v_plan.owner_id is null or v_plan.status<>'active' or private.plan_end(v_plan.starts_at,v_plan.ends_at)<=now() or not private.user_eligible(v_plan.owner_id) then
  raise exception 'Invitation unavailable' using errcode='42501';
 end if;
 if p_response is null or p_response not in ('pending','accepted','maybe','declined') then raise exception 'Invalid response' using errcode='22023'; end if;
 if not (private.granted_access(v_uid) and private.eligible()) and not exists(select 1 from private.age_attestations where user_id=v_uid) then
  if p_terms_version is null or p_terms_version !~ '^[0-9]{4}-[0-9]{2}$' then
   raise exception 'Age confirmation required' using errcode='22023';
  end if;
  insert into private.age_attestations(user_id,terms_version) values(v_uid,p_terms_version);
 end if;
 if not exists(select 1 from public.profiles where id=v_uid) then
  if coalesce(char_length(btrim(p_name)),0) not between 1 and 80 then raise exception 'Name required' using errcode='22023'; end if;
  insert into public.profiles(id,display_name) values(v_uid,btrim(p_name));
 end if;
 return private.request_join(v_uid,v_link,v_plan,p_response);
end $$;

-- From 20261111130000_circles_of_trust.sql: an approval still records a grant for anyone without one (the line
-- that tested user_eligible()).
create or replace function private.decide_join_request(p_plan uuid, p_user uuid, p_approve boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid; v_req private.join_requests;
begin
 if p_plan is null or p_user is null or p_approve is null then raise exception 'Invalid decision' using errcode='22023'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(least(auth.uid(),p_user)::text,47));
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(greatest(auth.uid(),p_user)::text,47));
 v_uid := private.require_link_owner(p_plan);
 select * into v_req from private.join_requests where plan_id=p_plan and user_id=p_user and status='waiting' for update;
 if not found then raise exception 'Request already decided' using errcode='22023'; end if;
 if not p_approve then
  -- Someone on the guest list is not waiting at the door (CO-R15).
  if exists(select 1 from public.attendees where plan_id=p_plan and user_id=p_user) then
   raise exception 'Request already decided' using errcode='22023';
  end if;
  update private.join_requests set status='declined', decided_at=now() where plan_id=p_plan and user_id=p_user;
  -- The refusal, for the series, and the links to the person's confirmed number.
  insert into private.plan_removals(series_id,user_id) select p.series_id,p_user from public.plans p where p.id=p_plan
  on conflict (series_id,user_id) where user_id is not null do update set removed_at=excluded.removed_at;
  update private.phone_invitations set revoked_at=now(), code_hash=null where plan_id=p_plan and revoked_at is null
   and phone=(select nullif(private.phone_key(u.phone),'') from auth.users u where u.id=p_user and u.phone_confirmed_at is not null);
  return jsonb_build_object('status','declined');
 end if;
 if exists(select 1 from private.beta_access where user_id=p_user and revoked_at is not null)
 or exists(select 1 from auth.users u where u.id=p_user
  and exists(select 1 from private.tester_roster r where r.email = lower(u.email) and not r.enabled)) then
  raise exception 'Invitation unavailable' using errcode='42501';
 end if;
 if not (private.granted_access(p_user) and private.user_eligible(p_user)) then
  if not exists(select 1 from auth.users u where u.id=p_user and (u.email_confirmed_at is not null or u.phone_confirmed_at is not null)
   and not coalesce(u.is_anonymous,false) and (u.banned_until is null or u.banned_until<=now()))
  or private.deletion_pending(p_user) then
   raise exception 'Invitation unavailable' using errcode='42501';
  end if;
  insert into private.beta_access(user_id,source,plan_link_id) values(p_user,'approval',v_req.plan_link_id) on conflict (user_id) do nothing;
 end if;
 -- Approved first: the new row's trigger ends only a request still waiting.
 update private.join_requests set status='approved', decided_at=now() where plan_id=p_plan and user_id=p_user;
 -- Level 1 with no bringer (CO-P13); a row the person already has keeps its reply.
 insert into public.attendees(plan_id,user_id,response) values(p_plan,p_user,v_req.response)
  on conflict (plan_id,user_id) do update set brought_by=null, level=1;
 -- The host lets them in: their records for the series go (the person, and their confirmed number).
 delete from private.plan_removals r using public.plans p where p.id=p_plan and r.series_id=p.series_id
  and (r.user_id=p_user or r.phone=(select nullif(private.phone_key(u.phone),'') from auth.users u where u.id=p_user and u.phone_confirmed_at is not null));
 -- A guest's link to them is no longer needed: its bringer's invite frees, as with a host's invitation (CO-R14).
 update private.phone_invitations set revoked_at=now(), code_hash=null where plan_id=p_plan and revoked_at is null and level>1
  and phone=(select nullif(private.phone_key(u.phone),'') from auth.users u where u.id=p_user and u.phone_confirmed_at is not null);
 insert into private.notification_outbox(plan_id,recipient_id,kind,dedupe_key,actor_id)
  values(p_plan,p_user,'join_approved','join-approved:'||p_plan||':'||p_user||':'||extract(epoch from v_req.created_at),v_uid) on conflict do nothing;
 return jsonb_build_object('status','approved');
end $$;

-- From 20261111160000_chat_safety.sql: a deletion request needs an account that isn't suspended, not a roster row
-- or a grant (the account line). Redefined only where it exists, as chat safety does: the hosted project doesn't have
-- it until the deletion release.
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
 or not exists(select 1 from auth.users u where u.id=p_user and u.email_confirmed_at is not null and not coalesce(u.is_anonymous,false) and not private.access_suspended(u.id) and (u.banned_until is null or u.banned_until<=now()))
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
 -- guest rows, and blocks before reports, as the fold takes them, so the two queue instead of deadlocking (SR3, SR5).
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
end $$
  $fn$;
 end if;
end $migration$;
