-- UX2 rules (docs/superpowers/specs/2026-10-14-ux2-design.md): Maybe, who gets notified and what is
-- recorded, the guest list after answering, cover descriptions, and the old edit function switched off.
-- Hosted-compatible: depends only on the migrations listed in supabase/tests/hosted-baseline/migrations.txt.
-- Rollback: supabase/rollback/20261014120000_ux2_rules.rollback.sql.

-- Maybe (UX-P3). Replaced by exact name: if the live name differs, this fails instead of leaving two checks.
alter table public.attendees drop constraint attendees_response_check;
alter table public.attendees add constraint attendees_response_check
 check (response in ('pending','accepted','maybe','declined','withdrawn'));

-- What happened and who did it, for the notification wording (UX2-D4). Rows queued before UX2 keep nulls.
alter table private.notification_outbox
 add column actor_id uuid references public.profiles(id) on delete set null,
 add column detail text,
 add constraint notification_outbox_detail_check check (
  detail is null
  or (kind='plan_changed' and detail in ('time','place','time_place'))
  or (kind='rsvp' and detail in ('accepted','maybe','declined','withdrawn')));
create index notification_outbox_actor_idx on private.notification_outbox(actor_id);

-- Maybe is an answer; each answer records who answered and what. Otherwise the foundation body.
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

-- A claim records the person claiming. Otherwise the 20261007210000_claim_notifies_owner body.
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

-- Only a new time or place notifies, and only people who may still come; cancelling tells everyone (UX-P4).
-- Otherwise the 20261007150000_custom_events body.
create or replace function private.change_plan_v2(p_plan uuid,p_version integer,p_title text,p_description text,p_categories text[],p_start timestamptz,p_zone text,p_place text,p_note text,p_cancel boolean default false)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_tester(); v_plan public.plans; v_next integer; v_cancel boolean := coalesce(p_cancel,false);
 v_time boolean; v_place boolean;
begin
 select * into v_plan from public.plans where id=p_plan for update;
 if not found or v_plan.owner_id<>v_uid then raise exception 'Owner required' using errcode='42501'; end if;
 if v_plan.status<>'active' or v_plan.starts_at<=now() then raise exception 'Plan unavailable' using errcode='22023'; end if;
 if p_version is distinct from v_plan.version then raise exception 'Plan changed; refresh' using errcode='40001'; end if;
 if not v_cancel and (p_start is null or p_start<=now() or not exists(select 1 from pg_catalog.pg_timezone_names where name=p_zone)) then raise exception 'Invalid future schedule' using errcode='22023'; end if;
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
   starts_at=p_start,time_zone=p_zone,place_label=btrim(p_place),note=coalesce(p_note,''),latitude=null,longitude=null,version=v_next
  where id=p_plan;
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

-- The first "change event" function would bypass these rules; the app has used change_plan_v2 since CE1.
revoke execute on function public.change_plan(uuid,integer,timestamptz,text,text,text,boolean) from authenticated;
revoke execute on function private.change_plan(uuid,integer,timestamptz,text,text,text,boolean) from authenticated;

-- Guest list after answering (UX-P5). The organizer sees every guest; an invitee sees the organizer and
-- themselves until they answer (Going, Maybe or Can't make it), then everyone. Names and profile photos
-- follow the same rule, because the avatar storage policy calls can_read_profile.
create function private.can_see_guests(p_plan uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select private.eligible() and exists(select 1 from public.plans p where p.id=p_plan and (p.owner_id=auth.uid()
  or exists(select 1 from public.attendees a where a.plan_id=p.id and a.user_id=auth.uid() and a.response<>'pending')))
$$;
revoke all on function private.can_see_guests(uuid) from public, anon, authenticated, service_role;
grant execute on function private.can_see_guests(uuid) to authenticated;

drop policy attendee_read on public.attendees;
create policy attendee_read on public.attendees for select to authenticated
 using (private.can_read_plan(plan_id) and (user_id=(select auth.uid()) or private.can_see_guests(plan_id)));

create or replace function private.can_read_profile(p_id uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select private.eligible() and (p_id=auth.uid() or exists (
 select 1 from public.plans p where private.can_read_plan(p.id) and
 (p.owner_id=p_id or (private.can_see_guests(p.id) and exists(select 1 from public.attendees a where a.plan_id=p.id and a.user_id=p_id)))))
$$;

-- Cover description (spec "Cover description", amended): read aloud by VoiceOver; saved on its own,
-- after the photo; cleared by the database whenever the photo changes.
alter table public.plans add column cover_description text not null default '',
 add constraint plans_cover_description_valid check (
  cover_description=btrim(cover_description) and char_length(cover_description)<=200
  and (cover_path is not null or cover_description=''));

-- The revision now moves for the photo or its description, once per change. A new or removed photo never
-- keeps the previous photo's description, whichever function or trigger changed it.
-- Otherwise the 20261007200000_plan_covers body.
create or replace function private.track_cover_revision() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='INSERT' then
  new.cover_revision := 0;
 else
  if new.cover_path is distinct from old.cover_path then
   new.cover_description := '';
  end if;
  if new.cover_path is distinct from old.cover_path or new.cover_description is distinct from old.cover_description then
   new.cover_revision := old.cover_revision + 1;
  else
   new.cover_revision := old.cover_revision;
  end if;
 end if;
 return new;
end $$;

-- Deletion redaction also blanks the description (create or replace keeps its privileges).
create or replace function private.redact_deleting_owner_plan() returns trigger
language plpgsql set search_path = '' as $$
begin
 if new.owner_id is not null and exists(
  select 1 from public.profiles as p where p.id = new.owner_id and p.deletion_requested_at is not null) then
  new.title := 'Resbite';
  new.description := '';
  new.cover_path := null;
  new.cover_description := '';
 end if;
 return new;
end $$;

create function private.set_plan_cover_description(p_plan uuid,p_description text,p_expected_revision bigint)
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
create function public.set_plan_cover_description(p_plan uuid,p_description text,p_expected_revision bigint)
returns jsonb language sql security invoker set search_path='' as $$
 select private.set_plan_cover_description(p_plan,p_description,p_expected_revision)
$$;
revoke all on function private.set_plan_cover_description(uuid,text,bigint), public.set_plan_cover_description(uuid,text,bigint)
 from public, anon, authenticated, service_role;
grant execute on function private.set_plan_cover_description(uuid,text,bigint), public.set_plan_cover_description(uuid,text,bigint)
 to authenticated;
