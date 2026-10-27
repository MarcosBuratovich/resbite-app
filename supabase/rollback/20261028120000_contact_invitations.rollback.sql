-- Rollback for 20261028120000_contact_invitations.sql (host side, invitee side and folding). Run as one transaction,
-- only with the owner's approval:
--   begin; \i supabase/rollback/20261028120000_contact_invitations.rollback.sql; commit;
-- It deletes:
--   - every personal invitation and every daily lookup count, with their tables: every /i/ link stops working, and the
--     codes kept on hosts' phones open nothing;
--   - every 'invited' outbox row (the notices of in-app invitations), so the earlier kind check can come back;
--   - every live 'invitation' grant: people who got access by answering a personal invitation lose it and wait on the
--     access-pending screen, unless the roster or another grant lets them in. A revoked 'invitation' grant is a ban, so
--     it becomes a revoked 'maintainer' grant instead and the ban stays.
-- It restores verbatim remove_guest() from 20261021120000_gi1_event_links.sql (its grants were never changed), the
-- outbox kind check from 20261015120000_ux3_event_details.sql and the grant-source check from
-- 20261027120000_phone_accounts.sql; drops every function the migration created; and takes back the private schema
-- from service_role, unless 20260918001316_account_deletion_lifecycle.sql, which gives it too, has run.
-- Kept: guests who answered or were invited in the app stay on their events with their answers, profiles and 18+
-- ticks. Folded accounts stay folded: the places and ticks they took are not moved back (a grant they took goes with
-- the invitation grants above), and the deleted web profiles and users do not return.
-- Order: run it before supabase/rollback/20261027120000_phone_accounts.rollback.sql, never after it: that file's
-- link-only grant check cannot go back while invitation grants exist (this file would then widen it again), and it
-- drops used_app() and phone_digits(), which the functions dropped here call. It also deletes maintainer grants, so a
-- ban kept here does not survive both rollbacks.

-- Folding.
drop function public.fold_web_account(uuid,uuid);
drop function private.fold_web_account(uuid,uuid);

-- Invitee side.
drop function public.my_phone_invitation(text);
drop function private.my_phone_invitation(text);
drop function public.answer_phone_invitation(text,text,text,text);
drop function private.answer_phone_invitation(text,text,text,text);
drop function public.check_invited_number(text,text);
drop function private.check_invited_number(text,text);
drop function public.personal_invitation_page(text);
drop function private.personal_invitation_page(text);

-- Host side.
drop function public.revoke_phone_invitation(uuid,text);
drop function private.revoke_phone_invitation(uuid,text);
drop function public.plan_phone_invitations(uuid);
drop function private.plan_phone_invitations(uuid);
drop function public.invite_contacts(uuid,jsonb);
drop function private.invite_contacts(uuid,jsonb);
drop function public.contacts_on_resbite(text[]);
drop function private.contacts_on_resbite(text[]);
drop function private.charge_lookup(uuid,integer);

-- The 20261021120000_gi1_event_links body, verbatim.
create or replace function private.remove_guest(p_plan uuid,p_user uuid) returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid;
begin
 v_uid := private.require_link_owner(p_plan);
 if p_user=v_uid then raise exception 'The organizer cannot be removed' using errcode='22023'; end if;
 update private.invitations set revoked_at=now() where plan_id=p_plan and claimed_by=p_user and revoked_at is null;
 delete from public.attendees where plan_id=p_plan and user_id=p_user;
end $$;

-- In-app invitation notices go first: the 20261015120000_ux3_event_details check has no 'invited' kind.
delete from private.notification_outbox where kind='invited';
alter table private.notification_outbox drop constraint notification_outbox_kind_check;
alter table private.notification_outbox add constraint notification_outbox_kind_check
 check (kind in ('invitation','rsvp','plan_changed','plan_cancelled','guest_note'));

-- Invitation grants go next: the 20261027120000_phone_accounts check allows link and maintainer grants only. A ban
-- (a revoked grant) stays a ban as a revoked maintainer grant.
update private.beta_access set source='maintainer' where source='invitation' and revoked_at is not null;
delete from private.beta_access where source='invitation';
alter table private.beta_access drop constraint beta_access_source_check,
 add constraint beta_access_source_check check (source in ('link','maintainer'));

drop table private.lookup_usage;
drop table private.phone_invitations;

-- The fold was service_role's only use of the private schema on the hosted project.
do $$ begin
 if pg_catalog.to_regprocedure('private.claim_account_deletions(integer)') is null then
  revoke usage on schema private from service_role;
 end if;
end $$;
