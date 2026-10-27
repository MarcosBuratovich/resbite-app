-- Open-link approval (docs/superpowers/specs/2026-10-27-contact-invitations-design.md CI-D9 and flow 6, plan
-- docs/superpowers/plans/2026-10-28-open-link-approval.md, Task 1).
-- The open event link no longer admits anyone on its own: whoever answers through it becomes a waiting request that
-- the host approves or declines. Waiting people never hold an attendee row or a live grant; approval is the only path
-- to both. The owner and people already on the event are never turned into requests.
-- Hosted-compatible: depends only on the migrations listed in supabase/tests/hosted-baseline/migrations.txt plus
-- 20261027120000_phone_accounts.sql and 20261028120000_contact_invitations.sql.
-- Rollback: supabase/rollback/20261029120000_open_link_approval.rollback.sql.

-- One request per person per event: the answer they gave and where it stands. plan_link_id is the link of the latest
-- request, so a decline holds on that link and a new link lets them ask again. created_at is when the current waiting
-- period began; decided_at when the host last decided. Deleting the account deletes its requests.
create table private.join_requests (
 plan_id uuid not null references public.plans(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 plan_link_id uuid references private.plan_links(id) on delete set null,
 response text not null check (response in ('pending','accepted','maybe','declined')),
 status text not null default 'waiting' check (status in ('waiting','approved','declined')),
 created_at timestamptz not null default now(),
 decided_at timestamptz,
 primary key (plan_id, user_id)
);
create index join_requests_user_idx on private.join_requests(user_id);
create index join_requests_plan_link_idx on private.join_requests(plan_link_id);
alter table private.join_requests enable row level security;
revoke all on private.join_requests from public, anon, authenticated;

-- The outbox gets 'join_request' (to the host, the requester as actor) and 'join_approved' (to the requester, the host
-- as actor), replaced by exact name keeping every existing kind. Both carry a null detail. Declines queue nothing.
alter table private.notification_outbox drop constraint notification_outbox_kind_check;
alter table private.notification_outbox add constraint notification_outbox_kind_check
 check (kind in ('invitation','rsvp','plan_changed','plan_cancelled','guest_note','invited','join_request','join_approved'));

-- A grant made by the host approving a request.
alter table private.beta_access drop constraint beta_access_source_check,
 add constraint beta_access_source_check check (source in ('link','maintainer','invitation','approval'));

-- The request itself, for a caller its callers have already checked (a live link to an open event, a confirmed
-- account allowed to ask). Returns {state, plan_id, response}: 'owner' (response null) or 'already' (the attendee's
-- response) write nothing; a decline on this same link gives 'declined' and changes nothing; anything else is
-- 'waiting' with the answer now stored. A request is new (a fresh waiting period: created_at now, decided_at cleared, one
-- join_request notice to the host) when there was none, or when it was approved and the person is no longer on the
-- event, or declined on an older link. Asking again while waiting only changes the answer and the link. 'pending'
-- (no answer yet: an old build's claim_plan_link or join_by_link, or the app opening the link) never replaces a stored
-- answer, waiting or reopened; the stored one is returned. The notice's dedupe key carries the waiting period's start,
-- so an earlier notice never swallows a later one.
create function private.request_join(p_uid uuid, p_link private.plan_links, p_plan public.plans, p_response text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_resp text; v_req private.join_requests; v_created timestamptz;
begin
 if p_plan.owner_id=p_uid then return jsonb_build_object('state','owner','plan_id',p_plan.id,'response',null); end if;
 select response into v_resp from public.attendees where plan_id=p_plan.id and user_id=p_uid;
 if found then return jsonb_build_object('state','already','plan_id',p_plan.id,'response',v_resp); end if;
 select * into v_req from private.join_requests where plan_id=p_plan.id and user_id=p_uid for update;
 if found and v_req.status='declined' and v_req.plan_link_id is not distinct from p_link.id then
  return jsonb_build_object('state','declined','plan_id',p_plan.id,'response',v_req.response);
 end if;
 if found and v_req.status='waiting' then
  update private.join_requests set response=case when p_response='pending' then response else p_response end, plan_link_id=p_link.id
   where plan_id=p_plan.id and user_id=p_uid returning response into v_resp;
  return jsonb_build_object('state','waiting','plan_id',p_plan.id,'response',v_resp);
 end if;
 if found then
  update private.join_requests set response=case when p_response='pending' then response else p_response end,
   plan_link_id=p_link.id, status='waiting', created_at=now(), decided_at=null
   where plan_id=p_plan.id and user_id=p_uid returning created_at, response into v_created, v_resp;
 else
  insert into private.join_requests(plan_id,user_id,plan_link_id,response) values(p_plan.id,p_uid,p_link.id,p_response)
   returning created_at, response into v_created, v_resp;
 end if;
 insert into private.notification_outbox(plan_id,recipient_id,kind,dedupe_key,actor_id)
  values(p_plan.id,p_plan.owner_id,'join_request',
   'join:'||p_plan.id||':'||p_uid||':'||coalesce(p_link.id::text,'')||':'||extract(epoch from v_created),p_uid) on conflict do nothing;
 return jsonb_build_object('state','waiting','plan_id',p_plan.id,'response',v_resp);
end $$;
revoke all on function private.request_join(uuid,private.plan_links,public.plans,text) from public, anon, authenticated, service_role;

-- Asking to join through the open link, from the web or the app. In order: a session, the caller's lock, a confirmed
-- (email or phone), non-anonymous account that isn't banned or being deleted (42501 "Sign-in required"); a ban (a
-- revoked grant) or a disabled roster row (42501 "Invitation unavailable"); the code's link, live or not, and the
-- event, locked (an unknown or malformed code is 42501 "Invitation unavailable"). The owner and anyone already on the
-- event get 'owner' or 'already' here, from any link, before or after the start, and nothing is written. Everyone else
-- needs a live link to an active event that hasn't started, whose organizer may still use the app (42501
-- "Invitation unavailable"), an answer (22023), the 18+ tick unless one is stored and a name of 1-80 characters unless
-- they have a profile (22023, as answer_phone_invitation). Then the request.
create function private.request_to_join(p_code text, p_name text, p_response text, p_terms_version text) returns jsonb
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
 if v_plan.owner_id is null or v_plan.status<>'active' or v_plan.starts_at<=now() or not private.user_eligible(v_plan.owner_id) then
  raise exception 'Invitation unavailable' using errcode='42501';
 end if;
 if p_response is null or p_response not in ('pending','accepted','maybe','declined') then raise exception 'Invalid response' using errcode='22023'; end if;
 if not exists(select 1 from private.age_attestations where user_id=v_uid) then
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

-- The open link's page for a signed-in caller: invitation_page, plus their request on that link's event and whether
-- they are its owner or on it. The code's link resolves live or not, as request_to_join. request is {status,
-- response} only while it still applies: waiting, or declined on this same link; null for the owner and anyone on the
-- event, and when asking again would start a new request (approved and since removed, or declined on an older link).
create function private.my_join_request(p_code text) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_page jsonb; v_link private.plan_links; v_plan public.plans; v_member text; v_req private.join_requests;
begin
 if v_uid is null then raise exception 'Sign-in required' using errcode='42501'; end if;
 v_page := private.invitation_page(p_code);
 if p_code is not null and p_code ~ '^[A-Za-z0-9_-]{22}$' then
  select * into v_link from private.plan_links where code=p_code;
  if found then
   select * into v_plan from public.plans where id=v_link.plan_id;
   if v_plan.owner_id=v_uid then v_member := 'owner';
   elsif exists(select 1 from public.attendees where plan_id=v_plan.id and user_id=v_uid) then v_member := 'attendee';
   else
    select * into v_req from private.join_requests where plan_id=v_plan.id and user_id=v_uid
     and (status='waiting' or (status='declined' and plan_link_id=v_link.id));
   end if;
  end if;
 end if;
 return v_page || jsonb_build_object('request',case when v_req.user_id is not null then jsonb_build_object('status',v_req.status,'response',v_req.response) end,
  'member',v_member);
end $$;

-- The caller's requests that are waiting or declined, on active events that haven't started, for the app's list. Never
-- the place; events they are on already are left out.
create function private.my_join_requests() returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
 if v_uid is null then raise exception 'Sign-in required' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('plan_id',p.id,'title',p.title,'starts_at',p.starts_at,'ends_at',p.ends_at,
   'time_zone',p.time_zone,'host',(select display_name from public.profiles where id=p.owner_id),'area',p.area,
   'image',case when p.cover_path is not null then jsonb_build_object('kind','cover','ref',p.cover_path)
    when p.activity_id is not null then jsonb_build_object('kind','activity','ref',p.activity_id)
    else jsonb_build_object('kind','mark','ref','') end,
   'response',j.response,'status',j.status) order by p.starts_at,p.id)
  from private.join_requests j join public.plans p on p.id=j.plan_id
  where j.user_id=v_uid and j.status in ('waiting','declined') and p.owner_id is not null and p.status='active' and p.starts_at>now()
   and not exists(select 1 from public.attendees a where a.plan_id=p.id and a.user_id=v_uid)),'[]'::jsonb);
end $$;

-- The waiting screen changes the answer by event: only a waiting request (22023 "Request already decided" when there
-- is none, or it was approved or declined). Nothing is queued.
create function private.change_join_answer(p_plan uuid, p_response text) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
 if v_uid is null then raise exception 'Sign-in required' using errcode='42501'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_uid::text,47));
 if p_response is null or p_response not in ('pending','accepted','maybe','declined') then raise exception 'Invalid response' using errcode='22023'; end if;
 update private.join_requests set response=p_response where plan_id=p_plan and user_id=v_uid and status='waiting';
 if not found then raise exception 'Request already decided' using errcode='22023'; end if;
 return jsonb_build_object('status','waiting','response',p_response);
end $$;

-- The host's waiting list: [{user_id, name, response, ending, created_at}], ending being the last two digits of the
-- person's number, or null. People already on the event are left out. Owner only (42501).
create function private.plan_join_requests(p_plan uuid) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := private.require_tester();
begin
 if not exists(select 1 from public.plans where id=p_plan and owner_id=v_uid) then raise exception 'Plan owner required' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('user_id',j.user_id,'name',(select display_name from public.profiles where id=j.user_id),
   'response',j.response,'ending',(select nullif(right(u.phone,2),'') from auth.users u where u.id=j.user_id),'created_at',j.created_at)
   order by j.created_at,j.user_id)
  from private.join_requests j where j.plan_id=p_plan and j.status='waiting'
   and not exists(select 1 from public.attendees a where a.plan_id=j.plan_id and a.user_id=j.user_id)),'[]'::jsonb);
end $$;

-- The host approves or declines a waiting request. Both people's locks come first, in uuid order, then the plan's:
-- the requester's lock before the plan's, as request_to_join takes them, and a fixed order between the two users so
-- two hosts approving each other's requests at once queue instead of deadlocking (require_tester then takes the
-- caller's lock again, which is re-entrant; the deletion lifecycle's require_tester locks the caller, locally now and on
-- hosted with plan 4). Only the owner of an active event that hasn't started (42501), and only a waiting request (22023
-- "Request already decided"). Approving puts the person on the event with their answer (someone who joined another way
-- meanwhile keeps theirs) and grants access unless they may use the app already; an account that is banned, being
-- deleted, holds a revoked grant or a disabled roster row is refused (42501) and the request stays waiting. The person
-- gets a join_approved notice. Declining queues nothing.
create function private.decide_join_request(p_plan uuid, p_user uuid, p_approve boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid; v_req private.join_requests;
begin
 if p_approve is null then raise exception 'Invalid decision' using errcode='22023'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(least(auth.uid(),p_user)::text,47));
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(greatest(auth.uid(),p_user)::text,47));
 v_uid := private.require_link_owner(p_plan);
 select * into v_req from private.join_requests where plan_id=p_plan and user_id=p_user and status='waiting' for update;
 if not found then raise exception 'Request already decided' using errcode='22023'; end if;
 if not p_approve then
  update private.join_requests set status='declined', decided_at=now() where plan_id=p_plan and user_id=p_user;
  return jsonb_build_object('status','declined');
 end if;
 if not private.user_eligible(p_user) then
  if not exists(select 1 from auth.users u where u.id=p_user and (u.email_confirmed_at is not null or u.phone_confirmed_at is not null)
   and not coalesce(u.is_anonymous,false) and (u.banned_until is null or u.banned_until<=now()))
  or private.deletion_pending(p_user)
  or exists(select 1 from private.beta_access where user_id=p_user and revoked_at is not null)
  or exists(select 1 from auth.users u where u.id=p_user
   and exists(select 1 from private.tester_roster r where r.email = lower(u.email) and not r.enabled)) then
   raise exception 'Invitation unavailable' using errcode='42501';
  end if;
  insert into private.beta_access(user_id,source,plan_link_id) values(p_user,'approval',v_req.plan_link_id) on conflict (user_id) do nothing;
 end if;
 insert into public.attendees(plan_id,user_id,response) values(p_plan,p_user,v_req.response) on conflict do nothing;
 update private.join_requests set status='approved', decided_at=now() where plan_id=p_plan and user_id=p_user;
 insert into private.notification_outbox(plan_id,recipient_id,kind,dedupe_key,actor_id)
  values(p_plan,p_user,'join_approved','join-approved:'||p_plan||':'||p_user||':'||extract(epoch from v_req.created_at),v_uid) on conflict do nothing;
 return jsonb_build_object('status','approved');
end $$;

create function public.request_to_join(p_code text, p_name text, p_response text, p_terms_version text) returns jsonb language sql security invoker set search_path = '' as $$
 select private.request_to_join(p_code,p_name,p_response,p_terms_version)
$$;
create function public.my_join_request(p_code text) returns jsonb language sql stable security invoker set search_path = '' as $$
 select private.my_join_request(p_code)
$$;
create function public.my_join_requests() returns jsonb language sql stable security invoker set search_path = '' as $$
 select private.my_join_requests()
$$;
create function public.change_join_answer(p_plan uuid, p_response text) returns jsonb language sql security invoker set search_path = '' as $$
 select private.change_join_answer(p_plan,p_response)
$$;
create function public.plan_join_requests(p_plan uuid) returns jsonb language sql stable security invoker set search_path = '' as $$
 select private.plan_join_requests(p_plan)
$$;
create function public.decide_join_request(p_plan uuid, p_user uuid, p_approve boolean) returns jsonb language sql security invoker set search_path = '' as $$
 select private.decide_join_request(p_plan,p_user,p_approve)
$$;
revoke all on function private.request_to_join(text,text,text,text), public.request_to_join(text,text,text,text),
 private.my_join_request(text), public.my_join_request(text),
 private.my_join_requests(), public.my_join_requests(),
 private.change_join_answer(uuid,text), public.change_join_answer(uuid,text),
 private.plan_join_requests(uuid), public.plan_join_requests(uuid),
 private.decide_join_request(uuid,uuid,boolean), public.decide_join_request(uuid,uuid,boolean)
 from public, anon, authenticated, service_role;
grant execute on function private.request_to_join(text,text,text,text), public.request_to_join(text,text,text,text),
 private.my_join_request(text), public.my_join_request(text),
 private.my_join_requests(), public.my_join_requests(),
 private.change_join_answer(uuid,text), public.change_join_answer(uuid,text),
 private.plan_join_requests(uuid), public.plan_join_requests(uuid),
 private.decide_join_request(uuid,uuid,boolean), public.decide_join_request(uuid,uuid,boolean)
 to authenticated;

-- Joining by the event link, now asking to join. The 20261021120000_gi1_event_links body with one change: someone new,
-- on a live link to an open event, gets a waiting request (request_join, not answered yet) instead of an attendee row
-- and its invitation notice. The organizer and anyone already on the event still get the plan id from any of its
-- links; the refusals are unchanged. Its grants and its public façade are unchanged.
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
 perform private.request_join(v_uid,v_link,v_plan,'pending');
 return v_plan.id;
end $$;

-- Joining by the event link from a new account, now asking to join. The 20261027120000_phone_accounts body with every
-- check, the tick and the profile unchanged; instead of the grant, the attendee row and the invitation notice, a
-- waiting request (request_join, not answered yet). Its grants and its public façade are unchanged.
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
 if not v_has_profile then insert into public.profiles(id,display_name) values(v_uid,btrim(p_name)); end if;
 perform private.request_join(v_uid,v_link,v_plan,'pending');
 return v_plan.id;
end $$;
