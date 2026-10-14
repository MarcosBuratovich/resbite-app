-- Rollback for 20261014120000_ux2_rules.sql. Run inside one transaction:
--   begin; \i supabase/rollback/20261014120000_ux2_rules.rollback.sql; commit;
-- Restores the pre-UX2 rules exactly (rehearsed by hosted-baseline/20261014120000_ux2_rules.after.sql).
-- Kept, unused: attendees' wider answer check (a stored 'maybe' shows as "Not answered" in the old app),
-- the outbox actor_id/detail columns and check, and plans.cover_description (blanked here).

-- 1. The old edit function back on.
grant execute on function private.change_plan(uuid,integer,timestamptz,text,text,text,boolean) to authenticated;
grant execute on function public.change_plan(uuid,integer,timestamptz,text,text,text,boolean) to authenticated;

-- 2. Every reader of an event sees every guest again.
drop policy attendee_read on public.attendees;
create policy attendee_read on public.attendees for select to authenticated using (private.can_read_plan(plan_id));
create or replace function private.can_read_profile(p_id uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select private.eligible() and (p_id=auth.uid() or exists (
 select 1 from public.plans p where private.can_read_plan(p.id) and
 (p.owner_id=p_id or exists(select 1 from public.attendees a where a.plan_id=p.id and a.user_id=p_id))))
$$;
drop function private.can_see_guests(uuid);

-- 3. Answers, claims and edits as before UX2.
--    private.respond: the 20260917190517_resbite_private_tester_foundation body, verbatim.
create or replace function private.respond(p_plan uuid,p_response text,p_version integer) returns integer language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_tester(); v_plan public.plans; v_att public.attendees; v_next integer;
begin
 select * into v_plan from public.plans where id=p_plan for update;
 select * into v_att from public.attendees where plan_id=p_plan and user_id=v_uid for update;
 if v_att.user_id is null then raise exception 'Invitee required' using errcode='42501'; end if;
 if v_plan.status<>'active' or v_plan.starts_at<=now() then raise exception 'Plan unavailable' using errcode='22023'; end if;
 if p_response is null or p_response not in ('accepted','declined','withdrawn') then raise exception 'Invalid response' using errcode='22023'; end if;
 if p_version is distinct from v_att.version then
  if v_att.response=p_response and p_version=v_att.version-1 then return v_att.version; end if;
  raise exception 'Response changed; refresh' using errcode='40001';
 end if;
 if v_att.response=p_response then return v_att.version; end if;
 v_next:=v_att.version+1;
 update public.attendees set response=p_response,version=v_next,updated_at=now() where plan_id=p_plan and user_id=v_uid;
 insert into private.notification_outbox(plan_id,recipient_id,kind,dedupe_key) values(p_plan,v_plan.owner_id,'rsvp','rsvp:'||p_plan||':'||v_uid||':'||v_next) on conflict do nothing;
 return v_next;
end $$;
--    private.claim_invite: the 20261007210000_claim_notifies_owner body, verbatim.
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
 insert into private.notification_outbox(plan_id,recipient_id,kind,dedupe_key) values(v_inv.plan_id,v_plan.owner_id,'invitation','invite:'||v_inv.id) on conflict do nothing;
 return v_inv.plan_id;
end $$;
--    private.change_plan_v2: the 20261007150000_custom_events body, verbatim.
create or replace function private.change_plan_v2(p_plan uuid,p_version integer,p_title text,p_description text,p_categories text[],p_start timestamptz,p_zone text,p_place text,p_note text,p_cancel boolean default false)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_tester(); v_plan public.plans; v_next integer; v_cancel boolean := coalesce(p_cancel,false);
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
 else
  update public.plans set title=btrim(p_title),description=coalesce(p_description,''),categories=p_categories,
   starts_at=p_start,time_zone=p_zone,place_label=btrim(p_place),note=coalesce(p_note,''),latitude=null,longitude=null,version=v_next
  where id=p_plan;
 end if;
 insert into private.notification_outbox(plan_id,recipient_id,kind,dedupe_key)
 select p_plan,a.user_id,case when v_cancel then 'plan_cancelled' else 'plan_changed' end,'plan:'||p_plan||':'||v_next||':'||a.user_id
 from public.attendees a where a.plan_id=p_plan and a.user_id<>v_uid on conflict do nothing;
 return v_next;
end $$;

-- 4. Cover descriptions off.
drop function public.set_plan_cover_description(uuid,text,bigint);
drop function private.set_plan_cover_description(uuid,text,bigint);
--    private.track_cover_revision and private.redact_deleting_owner_plan: the 20261007200000_plan_covers
--    bodies, verbatim.
create or replace function private.track_cover_revision() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='INSERT' then
  new.cover_revision := 0;
 elsif new.cover_path is distinct from old.cover_path then
  new.cover_revision := old.cover_revision + 1;
 else
  new.cover_revision := old.cover_revision;
 end if;
 return new;
end $$;
create or replace function private.redact_deleting_owner_plan() returns trigger
language plpgsql set search_path = '' as $$
begin
 if new.owner_id is not null and exists(
  select 1 from public.profiles as p where p.id = new.owner_id and p.deletion_requested_at is not null) then
  new.title := 'Resbite';
  new.description := '';
  new.cover_path := null;
 end if;
 return new;
end $$;
alter table public.plans drop constraint plans_cover_description_valid;
update public.plans set cover_description='' where cover_description<>'';
