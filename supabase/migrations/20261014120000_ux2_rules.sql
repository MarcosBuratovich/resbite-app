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
