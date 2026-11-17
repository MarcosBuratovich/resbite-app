-- Rollback for 20261117120000_terms_acceptance.sql: puts back the six hosted bodies it replaced (account_access_status,
-- attest_age, join_by_link, request_to_join, answer_phone_invitation, fold_web_account) and drops accept_terms (both
-- schemas), note_terms, terms_needed, terms_version and the two tables. It loses every per-version acceptance record and
-- every published Terms version; private.age_attestations, the first 18+ tick, is untouched. Grants on the six are
-- unchanged throughout (create or replace keeps them). The app's Accept your Terms screen then finds no terms_version in
-- the status and asks nobody.
-- Roll back in reverse order only: 20261117122000 (C9), then 20261117121000 (C7), then this one; and this one before
-- 20261116120000_open_beta.rollback.sql, whose guard would not notice this migration's lines. It refuses (42501) if any
-- of the six is not this migration's body (a later migration redefined it: run that one's rollback first).
do $$ declare f text; d text; v_ours boolean; begin
 foreach f in array array['account_access_status()','attest_age(text)','join_by_link(text,text,text)',
   'request_to_join(text,text,text,text)','answer_phone_invitation(text,text,text,text)','fold_web_account(uuid,uuid)'] loop
  if pg_catalog.to_regprocedure('private.'||f) is null then raise exception 'private.% is missing', f; end if;
  d := pg_catalog.pg_get_functiondef(('private.'||f)::regprocedure);
  v_ours := case f when 'account_access_status()' then d like '%terms_needed%'
   when 'fold_web_account(uuid,uuid)' then d like '%private.terms_acceptances%'
   else d like '%private.note_terms(%' end;
  if not v_ours then
   raise exception 'private.% is not the terms acceptance body: run the rollbacks of every later migration first', f using errcode='42501';
  end if;
 end loop;
end $$;

-- The 20261027120000_phone_accounts.sql body.
create or replace function private.account_access_status() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_user auth.users; v_status text;
begin
 if v_uid is null then
  raise exception 'Authenticated account required' using errcode='42501';
 end if;
 select * into v_user from auth.users where id=v_uid;
 if not found then
  raise exception 'Authenticated account required' using errcode='42501';
 end if;
 if private.eligible() then
  v_status := 'approved';
 elsif v_user.email_confirmed_at is null and v_user.phone_confirmed_at is null
   and not coalesce(v_user.is_anonymous,false)
   and (v_user.banned_until is null or v_user.banned_until<=now())
   and not exists(select 1 from public.profiles p where p.id=v_uid and p.deletion_requested_at is not null)
 then
  v_status := 'unconfirmed';
 else
  v_status := 'access_pending';
 end if;
 return jsonb_build_object('account_id',v_uid,'status',v_status);
end $$;

-- The 20261027120000_phone_accounts.sql body.
create or replace function private.attest_age(p_terms_version text) returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
 if v_uid is null or not exists(select 1 from auth.users where id=v_uid) then
  raise exception 'Sign-in required' using errcode='42501';
 end if;
 if p_terms_version is null or p_terms_version !~ '^[0-9]{4}-[0-9]{2}$' then
  raise exception 'Age confirmation required' using errcode='22023';
 end if;
 insert into private.age_attestations(user_id,terms_version) values (v_uid,p_terms_version)
  on conflict (user_id) do nothing;
end $$;

-- The 20261116120000_open_beta.sql body.
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

-- The 20261116120000_open_beta.sql body.
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

-- The 20261111130000_circles_of_trust.sql body.
create or replace function private.answer_phone_invitation(p_code text, p_name text, p_response text, p_terms_version text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_inv private.phone_invitations; v_plan public.plans; v_has_profile boolean; v_att public.attendees; v_next integer;
 v_removed timestamptz;
begin
 if v_uid is null then raise exception 'Sign-in required' using errcode='42501'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_uid::text,47));
 if p_code is null or p_code !~ '^[A-Za-z0-9_-]{22}$' then raise exception 'Invitation unavailable' using errcode='42501'; end if;
 select * into v_inv from private.phone_invitations where code_hash=extensions.digest(p_code,'sha256') and revoked_at is null;
 if not found then raise exception 'Invitation unavailable' using errcode='42501'; end if;
 if not exists(select 1 from auth.users u where u.id=v_uid and u.phone_confirmed_at is not null
  and private.phone_key(u.phone)=v_inv.phone and not coalesce(u.is_anonymous,false)
  and (u.banned_until is null or u.banned_until<=now())) or private.deletion_pending(v_uid) then
  raise exception 'That isn''t the invited number.' using errcode='42501';
 end if;
 select * into v_plan from public.plans where id=v_inv.plan_id for update;
 if not found or v_plan.owner_id is null or v_plan.status<>'active' or private.plan_end(v_plan.starts_at,v_plan.ends_at)<=now() or v_plan.owner_id=v_uid
 or not private.user_eligible(v_plan.owner_id) then
  raise exception 'Invitation unavailable' using errcode='42501';
 end if;
 -- Read again under the plan lock: revoking an invitation takes the same lock through its owner checks.
 select * into v_inv from private.phone_invitations where id=v_inv.id and revoked_at is null;
 if not found then raise exception 'Invitation unavailable' using errcode='42501'; end if;
 if v_inv.user_id is not null and v_inv.user_id<>v_uid then raise exception 'Invitation unavailable' using errcode='42501'; end if;
 -- The person or the number a host removed, declined or revoked on this series (CO-R12), unless this is the host's own
 -- link made after the latest of those records, whose answer clears them.
 v_removed := (select max(r.removed_at) from private.plan_removals r
  where r.series_id=v_plan.series_id and (r.user_id=v_uid or r.phone=v_inv.phone));
 if v_removed is not null then
  if v_inv.level=1 and v_inv.created_at>v_removed then
   delete from private.plan_removals where series_id=v_plan.series_id and (user_id=v_uid or phone=v_inv.phone);
  else
   raise exception 'Invitation unavailable' using errcode='42501';
  end if;
 end if;
 if exists(select 1 from private.beta_access where user_id=v_uid and revoked_at is not null) then
  raise exception 'Invitation unavailable' using errcode='42501';
 end if;
 if exists(select 1 from auth.users u where u.id=v_uid
  and exists(select 1 from private.tester_roster r where r.email = lower(u.email) and not r.enabled)) then
  raise exception 'Invitation unavailable' using errcode='42501';
 end if;
 if p_response is null or p_response not in ('accepted','maybe','declined') then raise exception 'Invalid response' using errcode='22023'; end if;
 if not exists(select 1 from private.age_attestations where user_id=v_uid) then
  if p_terms_version is null or p_terms_version !~ '^[0-9]{4}-[0-9]{2}$' then
   raise exception 'Age confirmation required' using errcode='22023';
  end if;
  insert into private.age_attestations(user_id,terms_version) values(v_uid,p_terms_version);
 end if;
 v_has_profile := exists(select 1 from public.profiles where id=v_uid);
 if not v_has_profile then
  if coalesce(char_length(btrim(p_name)),0) not between 1 and 80 then raise exception 'Name required' using errcode='22023'; end if;
  insert into public.profiles(id,display_name) values(v_uid,btrim(p_name));
 end if;
 insert into private.beta_access(user_id,source) values(v_uid,'invitation') on conflict (user_id) do nothing;
 -- On the resbite now, so no longer waiting at the host's door (CO-R15).
 delete from private.join_requests where plan_id=v_plan.id and user_id=v_uid and status='waiting';
 select * into v_att from public.attendees where plan_id=v_plan.id and user_id=v_uid for update;
 if v_att.user_id is null then
  -- Answered first, so the new row's trigger (attendees_close_waiting), which ends guests' unanswered links to this
  -- number, leaves this one.
  update private.phone_invitations set user_id=v_uid, answered_at=now() where id=v_inv.id;
  -- The link's bringer and level (CO-P15).
  insert into public.attendees(plan_id,user_id,response,brought_by,level) values(v_plan.id,v_uid,p_response,v_inv.brought_by,v_inv.level) returning * into v_att;
 else
  -- The same answer again changes nothing, as respond.
  if v_att.response<>p_response then
   update public.attendees set response=p_response,version=version+1,updated_at=now()
    where plan_id=v_plan.id and user_id=v_uid returning * into v_att;
  else
   update private.phone_invitations set user_id=v_uid, answered_at=coalesce(answered_at,now()) where id=v_inv.id;
   return jsonb_build_object('response',p_response,'plan_id',v_plan.id);
  end if;
 end if;
 update private.phone_invitations set user_id=v_uid, answered_at=now() where id=v_inv.id;
 if p_response='declined' then delete from public.plan_admins where plan_id=v_plan.id and user_id=v_uid; end if;
 insert into private.notification_outbox(plan_id,recipient_id,kind,dedupe_key,actor_id,detail)
  select v_plan.id,h,'rsvp','rsvp:'||v_plan.id||':'||v_uid||':'||v_att.version||case when h=v_plan.owner_id then '' else ':'||h end,v_uid,p_response from private.host_ids(v_plan.id) h where h<>v_uid on conflict do nothing;
 return jsonb_build_object('response',p_response,'plan_id',v_plan.id);
end $$;

-- The 20261111160000_chat_safety.sql body.
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
 -- accounts filed about the other goes too: after the fold it would be about oneself (SR3, Q-1). The web account's
 -- block rows are locked first, in the order the account deletion locks a person's (blocker, then blocked), before any
 -- report: a deletion of someone who blocked and reported the web account then waits on them holding nothing this
 -- needs (SR5).
 perform 1 from private.blocks where p_from in (blocker_id,blocked_id) order by blocker_id, blocked_id for update;
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

drop function public.accept_terms(text);
drop function private.accept_terms(text);
drop function private.note_terms(uuid,text,text);
drop function private.terms_needed(uuid);
drop function private.terms_version();
drop table private.terms_acceptances;
drop table private.terms_versions;
