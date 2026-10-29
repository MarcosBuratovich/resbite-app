-- Rollback for 20261031120000_creating_a_resbite.sql (creating a resbite). Run as one transaction, only with the
-- owner's approval:
--   begin; \i supabase/rollback/20261031120000_creating_a_resbite.rollback.sql; commit;
-- It is for the hosted project, where that migration created every object below. It deletes:
--   - the admins, private.is_host() and private.host_ids() with public.plan_admins, and every admin appointed: the
--     owner is the only host again. The mutes, public.plan_mutes, with every row in it: notices flow again to everyone
--     who had muted a resbite;
--   - the repeat rule: plans.repeat_weeks, series_id, repeats_from and place_tbd with their indexes, the
--     plans_place_tbd_valid constraint and the plans_default_series trigger. Occurrences the roll already created stay
--     as ordinary resbites, each with its guests, its admins gone, and no longer repeating; a plan marked To be decided
--     keeps the label 'To be decided' and is an ordinary place again (it has no map point);
--   - every function the migration created: appoint_admin, remove_admin, set_plan_mute, plan_people_counts,
--     create_plan_v4 and change_plan_v4 (each with its public wrapper), next_occurrence, roll_repeating_plans,
--     plans_default_series and, last, plan_end;
--   - every 'admin_added' outbox row, and every 'invited' row with the detail 'again' (the invitations to a next
--     occurrence), delivered or not, so the earlier kind and detail checks can come back.
--     The choice: a row not yet sent goes with them. A new admin whose notice had not gone out is never told, and a
--     guest of a rolled occurrence whose invitation notice had not gone out is never told of it (they still find the
--     occurrence in My resbites). Delivered rows go too; sent pushes are not recalled. Rows younger than a day are the
--     ones the sender could still send: run this just after the sender has drained the outbox to lose none.
-- It restores verbatim, each from the file named above it, the 27 functions the migration redefined, with the grants
-- and public wrappers they already have (create or replace keeps both), and the three plan-covers storage policies
-- from 20261007200000_plan_covers.sql. The outbox kind check comes back from 20261029120000_open_link_approval.sql
-- and the detail check from 20261014120000_ux2_rules.sql.
-- Kept: the plans, guests and answers; the occurrences the roll created. A resbite is open until its start again, not
-- until its end: one that has started but not ended stops accepting answers and changes the moment this runs.
-- Builds: once this has run, app builds made with this plan call functions that no longer exist (create_plan_v4,
-- change_plan_v4, set_plan_mute, appoint_admin, remove_admin, plan_people_counts); see the runbook,
-- qa/creating-a-resbite-2026-10-31/README.md.
-- Order: run it first of the rollbacks. The phone key (supabase/rollback/20261030130000_phone_key.rollback.sql), push
-- delivery (supabase/rollback/20261030120000_push_delivery.rollback.sql) and open-link approval
-- (supabase/rollback/20261029120000_open_link_approval.rollback.sql) come after it, in that order: the three contact
-- bodies restored here (invite_contacts, check_invited_number, answer_phone_invitation) are the phone-key ones and call
-- private.phone_key() and phone_variants(), which the phone-key rollback drops; the push rollback drops
-- notification_recipient_eligible(), which this file would bring back; and the restored request and join bodies here
-- read private.join_requests, which the open-link rollback drops. The guard below stops this file when any of the three
-- has already run; it changes nothing.

do $$ begin
 if to_regprocedure('private.phone_key(text)') is null then raise exception 'Run the creating-a-resbite rollback before the phone-key rollback'; end if;
 if to_regclass('private.notification_deliveries') is null then raise exception 'Run the creating-a-resbite rollback before the push delivery rollback'; end if;
 if to_regclass('private.join_requests') is null then raise exception 'Run the creating-a-resbite rollback before the open-link approval rollback'; end if;
end $$;

-- The outbox rows the earlier checks do not allow, and the checks as they were.
delete from private.notification_outbox where kind='admin_added' or (kind='invited' and detail='again');
alter table private.notification_outbox drop constraint notification_outbox_kind_check;
alter table private.notification_outbox add constraint notification_outbox_kind_check
 check (kind in ('invitation','rsvp','plan_changed','plan_cancelled','guest_note','invited','join_request','join_approved'));
alter table private.notification_outbox drop constraint notification_outbox_detail_check;
alter table private.notification_outbox add constraint notification_outbox_detail_check check (
 detail is null
 or (kind='plan_changed' and detail in ('time','place','time_place'))
 or (kind='rsvp' and detail in ('accepted','maybe','declined','withdrawn')));

-- The plan-covers policies as 20261007200000_plan_covers.sql made them (they call plan_end and read plan_admins, so
-- they come back before those go).
drop policy resbite_cover_read on storage.objects;
drop policy resbite_cover_insert on storage.objects;
drop policy resbite_cover_update on storage.objects;
create policy resbite_cover_insert on storage.objects for insert to authenticated with check (
 bucket_id='plan-covers' and (select private.eligible())
 and (storage.foldername(name))[1]=(select auth.uid())::text
 and exists(select 1 from public.plans p where p.id::text=(storage.foldername(name))[2]
  and p.owner_id=(select auth.uid()) and p.status='active' and p.starts_at>now())
);
create policy resbite_cover_update on storage.objects for update to authenticated using (
 bucket_id='plan-covers' and (select private.eligible())
 and (storage.foldername(name))[1]=(select auth.uid())::text
 and exists(select 1 from public.plans p where p.id::text=(storage.foldername(name))[2]
  and p.owner_id=(select auth.uid()) and p.status='active' and p.starts_at>now())
) with check (
 bucket_id='plan-covers' and (select private.eligible())
 and (storage.foldername(name))[1]=(select auth.uid())::text
 and exists(select 1 from public.plans p where p.id::text=(storage.foldername(name))[2]
  and p.owner_id=(select auth.uid()) and p.status='active' and p.starts_at>now())
);
-- The owner reads their own uploads (interrupted-upload recovery). Anyone else who can
-- read the plan reads only its current cover. No delete policy: clients only detach.
create policy resbite_cover_read on storage.objects for select to authenticated using (
 bucket_id='plan-covers' and (select private.eligible()) and exists(
  select 1 from public.plans p where p.id::text=(storage.foldername(name))[2]
   and p.owner_id::text=(storage.foldername(name))[1]
   and (p.owner_id=(select auth.uid()) or p.cover_path=name))
);

-- Every redefined function, as the hosted project had it before the migration.
-- change_plan_v3 (20261021120000_gi1_event_links.sql)
create or replace function private.change_plan_v3(p_plan uuid,p_version integer,p_title text,p_description text,p_categories text[],p_start timestamptz,p_ends timestamptz,p_zone text,p_place text,p_note text,p_cancel boolean default false,p_keep_length boolean default false,p_area text default null)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_tester(); v_plan public.plans; v_next integer; v_cancel boolean := coalesce(p_cancel,false);
 v_time boolean; v_place boolean; v_ends timestamptz;
begin
 select * into v_plan from public.plans where id=p_plan for update;
 if not found or v_plan.owner_id is distinct from v_uid then raise exception 'Owner required' using errcode='42501'; end if;
 if v_plan.status<>'active' or v_plan.starts_at<=now() then raise exception 'Plan unavailable' using errcode='22023'; end if;
 if p_version is distinct from v_plan.version then raise exception 'Plan changed; refresh' using errcode='40001'; end if;
 if not v_cancel and (p_start is null or p_start<=now() or not exists(select 1 from pg_catalog.pg_timezone_names where name=p_zone)) then raise exception 'Invalid future schedule' using errcode='22023'; end if;
 v_ends := case when p_keep_length then p_start+(v_plan.ends_at-v_plan.starts_at) else p_ends end;
 if not v_cancel and v_ends is not null and v_ends<=p_start then raise exception 'The end must be after the start' using errcode='22023'; end if;
 v_next := v_plan.version+1;
 if v_cancel then
  -- Terminal; the other arguments are ignored.
  update public.plans set status='cancelled',version=v_next where id=p_plan;
  update private.invitations set revoked_at=now() where plan_id=p_plan and revoked_at is null;
  insert into private.notification_outbox(plan_id,recipient_id,kind,dedupe_key,actor_id)
  select p_plan,a.user_id,'plan_cancelled','plan:'||p_plan||':'||v_next||':'||a.user_id,v_uid
  from public.attendees a where a.plan_id=p_plan and a.user_id<>v_uid on conflict do nothing;
 else
  -- A zone change at the same instant moves the shown time, so it counts as a time change.
  v_time := p_start is distinct from v_plan.starts_at or p_zone is distinct from v_plan.time_zone;
  v_place := btrim(p_place) is distinct from v_plan.place_label;
  update public.plans set title=btrim(p_title),description=coalesce(p_description,''),categories=p_categories,
   starts_at=p_start,ends_at=v_ends,time_zone=p_zone,place_label=btrim(p_place),latitude=null,longitude=null,version=v_next,
   area=case when p_area is null then v_plan.area else btrim(p_area) end
  where id=p_plan;
  perform private.write_meeting_details(p_plan,coalesce(p_note,''));
  if v_time or v_place then
   insert into private.notification_outbox(plan_id,recipient_id,kind,dedupe_key,actor_id,detail)
   select p_plan,a.user_id,'plan_changed','plan:'||p_plan||':'||v_next||':'||a.user_id,v_uid,
    case when v_time and v_place then 'time_place' when v_time then 'time' else 'place' end
   from public.attendees a
   where a.plan_id=p_plan and a.user_id<>v_uid and a.response in ('accepted','maybe','pending')
   on conflict do nothing;
  end if;
 end if;
 return v_next;
end $$;

-- respond (20261014120000_ux2_rules.sql)
create or replace function private.respond(p_plan uuid,p_response text,p_version integer) returns integer language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_tester(); v_plan public.plans; v_att public.attendees; v_next integer;
begin
 select * into v_plan from public.plans where id=p_plan for update;
 select * into v_att from public.attendees where plan_id=p_plan and user_id=v_uid for update;
 if v_att.user_id is null then raise exception 'Invitee required' using errcode='42501'; end if;
 if v_plan.status<>'active' or v_plan.starts_at<=now() then raise exception 'Plan unavailable' using errcode='22023'; end if;
 if p_response is null or p_response not in ('accepted','maybe','declined','withdrawn') then raise exception 'Invalid response' using errcode='22023'; end if;
 if p_version is distinct from v_att.version then
  if v_att.response=p_response and p_version=v_att.version-1 then return v_att.version; end if;
  raise exception 'Response changed; refresh' using errcode='40001';
 end if;
 if v_att.response=p_response then return v_att.version; end if;
 v_next:=v_att.version+1;
 update public.attendees set response=p_response,version=v_next,updated_at=now() where plan_id=p_plan and user_id=v_uid;
 insert into private.notification_outbox(plan_id,recipient_id,kind,dedupe_key,actor_id,detail)
 values(p_plan,v_plan.owner_id,'rsvp','rsvp:'||p_plan||':'||v_uid||':'||v_next,v_uid,p_response) on conflict do nothing;
 return v_next;
end $$;

-- claim_invite (20261014120000_ux2_rules.sql)
create or replace function private.claim_invite(p_token text) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_tester(); v_inv private.invitations; v_plan public.plans; v_id uuid;
begin
 -- Lock plan before invitation consistently with cancellation/revocation.
 select plan_id into v_id from private.invitations where token_hash=extensions.digest(p_token,'sha256');
 select * into v_plan from public.plans where id=v_id for update;
 select * into v_inv from private.invitations where token_hash=extensions.digest(p_token,'sha256') for update;
 if v_inv.id is null or v_plan.status<>'active' or v_plan.starts_at<=now() or v_inv.revoked_at is not null or (v_inv.claimed_by is not null and v_inv.claimed_by<>v_uid) then raise exception 'Invitation unavailable' using errcode='42501'; end if;
 if v_plan.owner_id=v_uid then raise exception 'Owner cannot claim own invitation' using errcode='22023'; end if;
 if v_inv.intended_email is not null and not exists(select 1 from auth.users where id=v_uid and lower(email)=v_inv.intended_email and email_confirmed_at is not null) then raise exception 'Invitation unavailable' using errcode='42501'; end if;
 if v_inv.claimed_by=v_uid then return v_inv.plan_id; end if;
 update private.invitations set claimed_by=v_uid where id=v_inv.id;
 insert into public.attendees(plan_id,user_id) values(v_inv.plan_id,v_uid) on conflict do nothing;
 insert into private.notification_outbox(plan_id,recipient_id,kind,dedupe_key,actor_id) values(v_inv.plan_id,v_plan.owner_id,'invitation','invite:'||v_inv.id,v_uid) on conflict do nothing;
 return v_inv.plan_id;
end $$;

-- create_invite (20260917190517_resbite_private_tester_foundation.sql)
create or replace function private.create_invite(p_id uuid,p_plan uuid,p_token text,p_email text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_tester(); v_plan public.plans; v_existing private.invitations; v_hash bytea;
begin
 select * into v_plan from public.plans where id=p_plan for update;
 if not found or v_plan.owner_id<>v_uid then raise exception 'Owner required' using errcode='42501'; end if;
 if v_plan.status<>'active' or v_plan.starts_at<=now() then raise exception 'Plan unavailable' using errcode='22023'; end if;
 if p_token is null or p_token !~ '^[a-f0-9]{64}$' then raise exception '256-bit random hex token required' using errcode='22023'; end if;
 v_hash := extensions.digest(p_token,'sha256');
 select * into v_existing from private.invitations where id=p_id;
 if found then
  if v_existing.plan_id<>p_plan or v_existing.token_hash<>v_hash or v_existing.intended_email is distinct from nullif(lower(btrim(p_email)),'') or v_existing.revoked_at is not null then raise exception 'Invitation identifier already used' using errcode='22023'; end if;
  return p_id;
 end if;
 insert into private.invitations(id,plan_id,token_hash,intended_email) values(p_id,p_plan,v_hash,nullif(lower(btrim(p_email)),''));
 return p_id;
end $$;

-- revoke_invite (20260917190517_resbite_private_tester_foundation.sql)
create or replace function private.revoke_invite(p_id uuid) returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_tester(); v_plan uuid; v_inv private.invitations;
begin
 select plan_id into v_plan from private.invitations where id=p_id;
 perform 1 from public.plans where id=v_plan and owner_id=v_uid and status='active' and starts_at>now() for update;
 if not found then raise exception 'Active plan owner required' using errcode='42501'; end if;
 select * into v_inv from private.invitations where id=p_id for update;
 update private.invitations set revoked_at=now() where id=p_id;
 if v_inv.claimed_by is not null and not exists(select 1 from private.invitations where plan_id=v_plan and claimed_by=v_inv.claimed_by and revoked_at is null) then
  delete from public.attendees where plan_id=v_plan and user_id=v_inv.claimed_by;
 end if;
end $$;

-- revoke_phone_invitation (20261030130000_phone_key.sql)
create or replace function private.revoke_phone_invitation(p_plan uuid, p_phone text) returns void language plpgsql security definer set search_path = '' as $$
declare v_user uuid;
begin
 perform private.require_link_owner(p_plan);
 update private.phone_invitations set revoked_at=now(), code_hash=null
  where plan_id=p_plan and phone=private.phone_key(p_phone) returning user_id into v_user;
 if v_user is not null then delete from public.attendees where plan_id=p_plan and user_id=v_user; end if;
end $$;

-- set_plan_cover_if_current (20261007200000_plan_covers.sql)
create or replace function private.set_plan_cover_if_current(p_plan uuid,p_path text,p_expected_path text,p_expected_revision bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_uid uuid := private.require_tester(); v_plan public.plans;
begin
 if p_expected_revision is null or p_expected_revision<0 then raise exception 'Invalid cover revision' using errcode='22023'; end if;
 select * into v_plan from public.plans where id=p_plan for update;
 if not found or v_plan.owner_id<>v_uid then raise exception 'Owner required' using errcode='42501'; end if;
 if v_plan.status<>'active' or v_plan.starts_at<=now() then raise exception 'Plan unavailable' using errcode='22023'; end if;
 if p_path is not null and (p_path !~ ('^'||v_uid::text||'/'||p_plan::text||'/[A-Za-z0-9-]+\.jpg$') or not exists(
   select 1 from storage.objects where bucket_id='plan-covers' and name=p_path)) then
  raise exception 'Own uploaded cover required' using errcode='42501';
 end if;
 if v_plan.cover_path is not distinct from p_expected_path and v_plan.cover_revision=p_expected_revision then
  if v_plan.cover_path is distinct from p_path then
   update public.plans set cover_path=p_path where id=p_plan returning * into v_plan;
  end if;
 elsif v_plan.cover_path is not distinct from p_path
   and v_plan.cover_revision>0 and v_plan.cover_revision-1=p_expected_revision then
  -- Only the exact next revision acknowledges a lost successful reply (no ABA replay).
  null;
 else
  raise exception 'The cover changed elsewhere; reload before saving' using errcode='40001';
 end if;
 return jsonb_build_object('cover_path',v_plan.cover_path,'cover_revision',v_plan.cover_revision);
end $$;

-- set_plan_cover_description (20261014120000_ux2_rules.sql)
create or replace function private.set_plan_cover_description(p_plan uuid,p_description text,p_expected_revision bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_uid uuid := private.require_tester(); v_plan public.plans; v_text text := btrim(coalesce(p_description,''));
begin
 if p_expected_revision is null or p_expected_revision<0 then raise exception 'Invalid cover revision' using errcode='22023'; end if;
 if char_length(v_text)>200 then raise exception 'Photo description too long' using errcode='22023'; end if;
 select * into v_plan from public.plans where id=p_plan for update;
 if not found or v_plan.owner_id<>v_uid then raise exception 'Owner required' using errcode='42501'; end if;
 if v_plan.status<>'active' or v_plan.starts_at<=now() then raise exception 'Plan unavailable' using errcode='22023'; end if;
 if v_plan.cover_revision=p_expected_revision then
  if v_plan.cover_path is null and v_text<>'' then raise exception 'Add a cover photo first' using errcode='22023'; end if;
  if v_plan.cover_description<>v_text then
   update public.plans set cover_description=v_text where id=p_plan returning * into v_plan;
  end if;
 elsif v_plan.cover_description=v_text and v_plan.cover_revision-1=p_expected_revision then
  -- Only the exact next revision acknowledges a lost successful reply (no ABA replay).
  null;
 else
  raise exception 'The cover changed elsewhere; reload before saving' using errcode='40001';
 end if;
 return jsonb_build_object('cover_path',v_plan.cover_path,'cover_description',v_plan.cover_description,'cover_revision',v_plan.cover_revision);
end $$;

-- require_link_owner (20261021120000_gi1_event_links.sql)
create or replace function private.require_link_owner(p_plan uuid) returns uuid language plpgsql set search_path = '' as $$
declare v_uid uuid := private.require_tester();
begin
 perform 1 from public.plans where id=p_plan and owner_id=v_uid and status='active' and starts_at>now() for update;
 if not found then raise exception 'Active plan owner required' using errcode='42501'; end if;
 return v_uid;
end $$;

-- invitation_page (20261021120000_gi1_event_links.sql)
create or replace function private.invitation_page(p_code text) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_link private.plan_links; v_plan public.plans; v_host text; v_going integer; v_state text;
begin
 if p_code is null or p_code !~ '^[A-Za-z0-9_-]{22}$' then return jsonb_build_object('state','inactive'); end if;
 select * into v_link from private.plan_links where code=p_code and revoked_at is null;
 if not found then return jsonb_build_object('state','inactive'); end if;
 select * into v_plan from public.plans where id=v_link.plan_id;
 if not found or v_plan.owner_id is null then return jsonb_build_object('state','inactive'); end if;
 select display_name into v_host from public.profiles where id=v_plan.owner_id;
 v_state := case when v_plan.status<>'active' then 'cancelled' when v_plan.starts_at<=now() then 'happened' else 'open' end;
 if v_state<>'open' then return jsonb_build_object('state',v_state,'host',v_host,'title',v_plan.title); end if;
 select count(*) into v_going from public.attendees where plan_id=v_plan.id and response='accepted';
 return jsonb_build_object('state','open','host',v_host,'title',v_plan.title,'starts_at',v_plan.starts_at,'ends_at',v_plan.ends_at,
  'time_zone',v_plan.time_zone,'area',v_plan.area,'going',v_going,
  'image',case when v_plan.cover_path is not null then jsonb_build_object('kind','cover','ref',v_plan.cover_path)
   when v_plan.activity_id is not null then jsonb_build_object('kind','activity','ref',v_plan.activity_id)
   else jsonb_build_object('kind','mark','ref','') end);
end $$;

-- personal_invitation_page (20261028120000_contact_invitations.sql)
create or replace function private.personal_invitation_page(p_code text) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_inv private.phone_invitations; v_plan public.plans; v_host text; v_going integer; v_state text;
begin
 if p_code is null or p_code !~ '^[A-Za-z0-9_-]{22}$' then return jsonb_build_object('state','inactive'); end if;
 select * into v_inv from private.phone_invitations where code_hash=extensions.digest(p_code,'sha256') and revoked_at is null;
 if not found then return jsonb_build_object('state','inactive'); end if;
 select * into v_plan from public.plans where id=v_inv.plan_id;
 if not found or v_plan.owner_id is null then return jsonb_build_object('state','inactive'); end if;
 select display_name into v_host from public.profiles where id=v_plan.owner_id;
 v_state := case when v_plan.status<>'active' then 'cancelled' when v_plan.starts_at<=now() then 'happened' else 'open' end;
 if v_state<>'open' then return jsonb_build_object('state',v_state,'host',v_host,'title',v_plan.title); end if;
 select count(*) into v_going from public.attendees where plan_id=v_plan.id and response='accepted';
 return jsonb_build_object('state','open','host',v_host,'title',v_plan.title,'starts_at',v_plan.starts_at,'ends_at',v_plan.ends_at,
  'time_zone',v_plan.time_zone,'area',v_plan.area,'going',v_going,
  'image',case when v_plan.cover_path is not null then jsonb_build_object('kind','cover','ref',v_plan.cover_path)
   when v_plan.activity_id is not null then jsonb_build_object('kind','activity','ref',v_plan.activity_id)
   else jsonb_build_object('kind','mark','ref','') end,
  'ending',right(v_inv.phone,2),'country',v_inv.country);
end $$;

-- check_invited_number (20261030130000_phone_key.sql)
create or replace function private.check_invited_number(p_code text, p_phone text) returns boolean language plpgsql security definer set search_path = '' as $$
declare v_inv private.phone_invitations; v_count int;
begin
 if p_code is null or p_code !~ '^[A-Za-z0-9_-]{22}$' then return false; end if;
 select i.* into v_inv from private.phone_invitations i join public.plans p on p.id=i.plan_id
  where i.code_hash=extensions.digest(p_code,'sha256') and i.revoked_at is null
   and p.owner_id is not null and p.status='active' and p.starts_at>now();
 if not found then return false; end if;
 update private.phone_invitations set
  check_count=case when check_window is null or check_window<=now()-interval '1 hour' then 1 else check_count+1 end,
  check_window=case when check_window is null or check_window<=now()-interval '1 hour' then now() else check_window end
  where id=v_inv.id and (check_window is null or check_window<=now()-interval '1 hour' or check_count<10)
  returning check_count into v_count;
 if v_count is null then raise exception 'Too many tries. Try again later.' using errcode='22023'; end if;
 return private.phone_key(p_phone)=v_inv.phone;
end $$;

-- answer_phone_invitation (20261030130000_phone_key.sql)
create or replace function private.answer_phone_invitation(p_code text, p_name text, p_response text, p_terms_version text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_inv private.phone_invitations; v_plan public.plans; v_has_profile boolean; v_att public.attendees; v_next integer;
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
 if not found or v_plan.owner_id is null or v_plan.status<>'active' or v_plan.starts_at<=now() or v_plan.owner_id=v_uid
 or not private.user_eligible(v_plan.owner_id) then
  raise exception 'Invitation unavailable' using errcode='42501';
 end if;
 -- Read again under the plan lock: revoking an invitation takes the same lock through its owner checks.
 select * into v_inv from private.phone_invitations where id=v_inv.id and revoked_at is null;
 if not found then raise exception 'Invitation unavailable' using errcode='42501'; end if;
 if v_inv.user_id is not null and v_inv.user_id<>v_uid then raise exception 'Invitation unavailable' using errcode='42501'; end if;
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
 select * into v_att from public.attendees where plan_id=v_plan.id and user_id=v_uid for update;
 if v_att.user_id is null then
  insert into public.attendees(plan_id,user_id,response) values(v_plan.id,v_uid,p_response) returning * into v_att;
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
 insert into private.notification_outbox(plan_id,recipient_id,kind,dedupe_key,actor_id,detail)
  values(v_plan.id,v_plan.owner_id,'rsvp','rsvp:'||v_plan.id||':'||v_uid||':'||v_att.version,v_uid,p_response) on conflict do nothing;
 return jsonb_build_object('response',p_response,'plan_id',v_plan.id);
end $$;

-- claim_plan_link (20261029120000_open_link_approval.sql)
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

-- join_by_link (20261029120000_open_link_approval.sql)
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

-- request_to_join (20261029120000_open_link_approval.sql)
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
 if v_plan.owner_id is null or v_plan.status<>'active' or v_plan.starts_at<=now() or not private.user_eligible(v_plan.owner_id) then
  raise exception 'Invitation unavailable' using errcode='42501';
 end if;
 if p_response is null or p_response not in ('pending','accepted','maybe','declined') then raise exception 'Invalid response' using errcode='22023'; end if;
 if not private.eligible() and not exists(select 1 from private.age_attestations where user_id=v_uid) then
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

-- plan_join_requests (20261029120000_open_link_approval.sql)
create or replace function private.plan_join_requests(p_plan uuid) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := private.require_tester();
begin
 if not exists(select 1 from public.plans where id=p_plan and owner_id=v_uid) then raise exception 'Plan owner required' using errcode='42501'; end if;
 if not exists(select 1 from public.plans where id=p_plan and status='active' and starts_at>now()) then return '[]'::jsonb; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('user_id',j.user_id,'name',(select display_name from public.profiles where id=j.user_id),
   'response',j.response,'ending',(select nullif(right(u.phone,2),'') from auth.users u where u.id=j.user_id),'created_at',j.created_at)
   order by j.created_at,j.user_id)
  from private.join_requests j where j.plan_id=p_plan and j.status='waiting'
   and not exists(select 1 from public.attendees a where a.plan_id=j.plan_id and a.user_id=j.user_id)
   and not private.deletion_pending(j.user_id)),'[]'::jsonb);
end $$;

-- my_join_requests (20261029120000_open_link_approval.sql)
create or replace function private.my_join_requests() returns jsonb language plpgsql stable security definer set search_path = '' as $$
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

-- change_join_answer (20261029120000_open_link_approval.sql)
create or replace function private.change_join_answer(p_plan uuid, p_response text) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
 if v_uid is null then raise exception 'Sign-in required' using errcode='42501'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_uid::text,47));
 if p_response is null or p_response not in ('pending','accepted','maybe','declined') then raise exception 'Invalid response' using errcode='22023'; end if;
 if not exists(select 1 from private.join_requests where plan_id=p_plan and user_id=v_uid and status='waiting')
 or exists(select 1 from public.attendees where plan_id=p_plan and user_id=v_uid) then
  raise exception 'Request already decided' using errcode='22023';
 end if;
 if not exists(select 1 from public.plans where id=p_plan and status='active' and starts_at>now()) then
  raise exception 'Invitation unavailable' using errcode='42501';
 end if;
 update private.join_requests set response=p_response where plan_id=p_plan and user_id=v_uid and status='waiting';
 if not found then raise exception 'Request already decided' using errcode='22023'; end if;
 return jsonb_build_object('status','waiting','response',p_response);
end $$;

-- set_guest_note (20261015120000_ux3_event_details.sql)
create or replace function private.set_guest_note(p_plan uuid,p_note text) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_tester(); v_plan public.plans; v_text text := btrim(coalesce(p_note,'')); v_at timestamptz;
begin
 if char_length(v_text)>280 then raise exception 'Note too long' using errcode='22023'; end if;
 select * into v_plan from public.plans where id=p_plan for update;
 if not found or v_plan.owner_id is distinct from v_uid then raise exception 'Owner required' using errcode='42501'; end if;
 if v_plan.status<>'active' or now()>=coalesce(v_plan.ends_at,v_plan.starts_at+interval '1 hour') then
  raise exception 'Plan unavailable' using errcode='22023';
 end if;
 if v_text=v_plan.guest_note then
  return jsonb_build_object('guest_note',v_plan.guest_note,'guest_note_at',v_plan.guest_note_at);
 end if;
 v_at := case when v_text='' then null else pg_catalog.clock_timestamp() end;
 update public.plans set guest_note=v_text,guest_note_at=v_at where id=p_plan;
 if v_text<>'' then
  insert into private.notification_outbox(plan_id,recipient_id,kind,dedupe_key,actor_id)
  select p_plan,a.user_id,'guest_note','note:'||p_plan||':'||pg_catalog.to_char(v_at,'YYYYMMDDHH24MISSUS')||':'||a.user_id,v_uid
  from public.attendees a where a.plan_id=p_plan and a.user_id<>v_uid and a.response in ('accepted','maybe','pending')
  on conflict do nothing;
 end if;
 return jsonb_build_object('guest_note',v_text,'guest_note_at',v_at);
end $$;

-- plan_phone_invitations (20261028120000_contact_invitations.sql)
create or replace function private.plan_phone_invitations(p_plan uuid) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := private.require_tester();
begin
 if not exists(select 1 from public.plans where id=p_plan and owner_id=v_uid) then raise exception 'Plan owner required' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('phone',i.phone,'country',i.country,'answered',i.answered_at is not null,
   'response',(select a.response from public.attendees a where a.plan_id=i.plan_id and a.user_id=i.user_id)) order by i.created_at,i.phone)
  from private.phone_invitations i where i.plan_id=p_plan and i.revoked_at is null),'[]'::jsonb);
end $$;

-- remove_guest (20261028120000_contact_invitations.sql)
create or replace function private.remove_guest(p_plan uuid,p_user uuid) returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid;
begin
 v_uid := private.require_link_owner(p_plan);
 if p_user=v_uid then raise exception 'The organizer cannot be removed' using errcode='22023'; end if;
 update private.invitations set revoked_at=now() where plan_id=p_plan and claimed_by=p_user and revoked_at is null;
 update private.phone_invitations set revoked_at=now(), code_hash=null where plan_id=p_plan and user_id=p_user;
 delete from public.attendees where plan_id=p_plan and user_id=p_user;
end $$;

-- invite_contacts (20261030130000_phone_key.sql)
create or replace function private.invite_contacts(p_plan uuid, p_invites jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_link_owner(p_plan); v_item jsonb; v_phone text; v_country text; v_code text; v_holder uuid;
 v_kind text; v_out jsonb := '[]'::jsonb;
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_uid::text,47));
 if jsonb_typeof(p_invites) is distinct from 'array' or jsonb_array_length(p_invites)>50 then
  raise exception 'Invalid invitations' using errcode='22023';
 end if;
 -- The kind of each item tells the host who is On Resbite, so invitations spend the same daily budget as lookups.
 perform private.charge_lookup(v_uid,jsonb_array_length(p_invites));
 for v_item in select value from jsonb_array_elements(p_invites) loop
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
  elsif v_holder is not null and exists(select 1 from public.attendees where plan_id=p_plan and user_id=v_holder) then
   v_kind := 'already';
  elsif v_holder is not null and private.user_eligible(v_holder) and private.used_app(v_holder)
   and exists(select 1 from public.profiles where id=v_holder) then
   v_kind := 'app';
   insert into public.attendees(plan_id,user_id) values(p_plan,v_holder) on conflict do nothing;
   insert into private.notification_outbox(plan_id,recipient_id,kind,dedupe_key,actor_id)
    values(p_plan,v_holder,'invited','invited:'||p_plan||':'||v_holder,v_uid) on conflict do nothing;
   update private.phone_invitations set revoked_at=now(), code_hash=null
    where plan_id=p_plan and phone=v_phone and revoked_at is null;
  else
   v_kind := 'link';
   insert into private.phone_invitations(plan_id,phone,country,code_hash,invited_by)
    values(p_plan,v_phone,v_country,extensions.digest(v_code,'sha256'),v_uid)
    on conflict (plan_id,phone) do update set country=excluded.country, code_hash=excluded.code_hash, revoked_at=null,
     user_id=case when private.phone_invitations.revoked_at is null then private.phone_invitations.user_id end,
     answered_at=case when private.phone_invitations.revoked_at is null then private.phone_invitations.answered_at end;
  end if;
  v_out := v_out || jsonb_build_array(jsonb_build_object('phone',private.phone_digits(v_item->>'phone'),'kind',v_kind));
 end loop;
 return v_out;
end $$;

-- can_see_guests (20261014120000_ux2_rules.sql)
create or replace function private.can_see_guests(p_plan uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select private.eligible() and exists(select 1 from public.plans p where p.id=p_plan and (p.owner_id=auth.uid()
  or exists(select 1 from public.attendees a where a.plan_id=p.id and a.user_id=auth.uid() and a.response<>'pending')))
$$;

-- can_read_meeting_details (20261015120000_ux3_event_details.sql)
create or replace function private.can_read_meeting_details(p_plan uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select private.eligible() and exists(select 1 from public.plans p where p.id=p_plan and (p.owner_id=auth.uid()
  or exists(select 1 from public.attendees a where a.plan_id=p.id and a.user_id=auth.uid() and a.response in ('accepted','maybe'))))
$$;

-- request_join (20261029120000_open_link_approval.sql)
create or replace function private.request_join(p_uid uuid, p_link private.plan_links, p_plan public.plans, p_response text) returns jsonb
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

-- notification_recipient_eligible (20261030120000_push_delivery.sql)
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

-- The mutes and the repeats.
drop function private.roll_repeating_plans();
drop function private.next_occurrence(timestamptz,text,integer);
drop function public.set_plan_mute(uuid,boolean);
drop function private.set_plan_mute(uuid,boolean);
drop table public.plan_mutes;

-- Plans v4.
drop function public.change_plan_v4(uuid,integer,text,text,text[],timestamptz,timestamptz,text,text,boolean,smallint,text,text,boolean,boolean);
drop function public.create_plan_v4(uuid,text,text,text[],text,timestamptz,timestamptz,text,text,boolean,smallint,text,double precision,double precision,text);
drop function private.change_plan_v4(uuid,integer,text,text,text[],timestamptz,timestamptz,text,text,boolean,smallint,text,text,boolean,boolean);
drop function private.create_plan_v4(uuid,text,text,text[],text,timestamptz,timestamptz,text,text,boolean,smallint,text,double precision,double precision,text);
alter table public.plans drop constraint plans_place_tbd_valid;
drop trigger plans_default_series on public.plans;
drop function private.plans_default_series();
drop index public.plans_repeats_from_key;
drop index public.plans_series_idx;
alter table public.plans drop column repeats_from, drop column series_id, drop column repeat_weeks, drop column place_tbd;

-- The people counts (they call is_host, so they go before it).
drop function public.plan_people_counts(uuid);
drop function private.plan_people_counts(uuid);

-- Admins and the helpers; plan_end goes last, nothing reads it any more.
drop function public.remove_admin(uuid,uuid);
drop function public.appoint_admin(uuid,uuid);
drop function private.remove_admin(uuid,uuid);
drop function private.appoint_admin(uuid,uuid);
drop table public.plan_admins;
drop function private.host_ids(uuid);
drop function private.is_host(uuid,uuid);
drop function private.plan_end(timestamptz,timestamptz);
