-- Rehearsal for 20261028120000_contact_invitations (hosted-baseline mode only); .after.sql removes everything here.
-- 1. Data in the pre-migration shape: a host and a contact who have used the app (maintainer grants), a guest who
-- joined by an event link (a link grant), two phone accounts that have not (one to answer on the web, one to be
-- banned) and an email account to fold into; one event with the link guest on it and a notice already in the outbox.
insert into auth.users(id,email,email_confirmed_at,phone,phone_confirmed_at) values
 ('ca000000-0000-4000-8000-000000000001',null,null,'447700900801',now()),
 ('ca000000-0000-4000-8000-000000000002',null,null,'447700900802',now()),
 ('ca000000-0000-4000-8000-000000000003','invite-rehearsal-link@resbite-test.invalid',now(),null,null),
 ('ca000000-0000-4000-8000-000000000004',null,null,'447700900804',now()),
 ('ca000000-0000-4000-8000-000000000005','invite-rehearsal-email@resbite-test.invalid',now(),null,null),
 ('ca000000-0000-4000-8000-000000000006',null,null,'447700900806',now());
insert into public.profiles(id,display_name) values
 ('ca000000-0000-4000-8000-000000000001','Rehearsal host'),('ca000000-0000-4000-8000-000000000002','Rehearsal contact'),
 ('ca000000-0000-4000-8000-000000000003','Rehearsal link guest'),('ca000000-0000-4000-8000-000000000005','Rehearsal email');
insert into private.beta_access(user_id,source) values
 ('ca000000-0000-4000-8000-000000000001','maintainer'),('ca000000-0000-4000-8000-000000000002','maintainer'),
 ('ca000000-0000-4000-8000-000000000003','link');
insert into private.app_sessions(user_id) values ('ca000000-0000-4000-8000-000000000001'),('ca000000-0000-4000-8000-000000000002');
insert into public.plans(id,owner_id,title,starts_at,time_zone,place_label,categories) values
 ('cb000000-0000-4000-8000-000000000001','ca000000-0000-4000-8000-000000000001','Rehearsal picnic','2099-07-01 12:00+00','UTC','Park',array['community']);
insert into public.attendees(plan_id,user_id) values ('cb000000-0000-4000-8000-000000000001','ca000000-0000-4000-8000-000000000003');
insert into private.notification_outbox(plan_id,recipient_id,kind,dedupe_key,actor_id) values
 ('cb000000-0000-4000-8000-000000000001','ca000000-0000-4000-8000-000000000003','plan_cancelled','invite-rehearsal:cancelled','ca000000-0000-4000-8000-000000000001');

-- 2. The exact definitions and grants the migration replaces or relies on, both checks it widens, the private schema's
-- grants and the absence of every object it adds, so .after.sql can prove the rollback restores them.
create function private.invite_rehearsal_snapshot() returns table(name text, definition text)
language sql stable set search_path='' as $$
 with f(oid) as (values ('private.remove_guest(uuid,uuid)'::regprocedure),('public.remove_guest(uuid,uuid)'::regprocedure),
  ('private.require_link_owner(uuid)'::regprocedure),('private.require_tester()'::regprocedure),
  ('private.user_eligible(uuid)'::regprocedure),('private.used_app(uuid)'::regprocedure),
  ('private.phone_digits(text)'::regprocedure),('private.deletion_pending(uuid)'::regprocedure))
 select f.oid::text, pg_catalog.pg_get_functiondef(f.oid) from f
 union all
 select 'grants '||f.oid::text, p.proacl::text from f join pg_catalog.pg_proc p on p.oid=f.oid
 union all
 select 'constraint '||c.conrelid::regclass::text||' '||c.conname, pg_catalog.pg_get_constraintdef(c.oid) from pg_catalog.pg_constraint c
 where c.conrelid in ('private.notification_outbox'::regclass,'private.beta_access'::regclass)
 union all
 select 'schema private', n.nspacl::text from pg_catalog.pg_namespace n where n.nspname='private'
 union all
 select 'table '||t, pg_catalog.to_regclass(t)::text
 from unnest(array['private.phone_invitations','private.lookup_usage']) t
 union all
 select 'function '||fn, pg_catalog.to_regprocedure(fn)::text
 from unnest(array['private.charge_lookup(uuid,integer)',
  'private.contacts_on_resbite(text[])','public.contacts_on_resbite(text[])',
  'private.invite_contacts(uuid,jsonb)','public.invite_contacts(uuid,jsonb)',
  'private.plan_phone_invitations(uuid)','public.plan_phone_invitations(uuid)',
  'private.revoke_phone_invitation(uuid,text)','public.revoke_phone_invitation(uuid,text)',
  'private.personal_invitation_page(text)','public.personal_invitation_page(text)',
  'private.check_invited_number(text,text)','public.check_invited_number(text,text)',
  'private.answer_phone_invitation(text,text,text,text)','public.answer_phone_invitation(text,text,text,text)',
  'private.my_phone_invitation(text)','public.my_phone_invitation(text)',
  'private.fold_web_account(uuid,uuid)','public.fold_web_account(uuid,uuid)']) fn
$$;
revoke all on function private.invite_rehearsal_snapshot() from public, anon, authenticated, service_role;
create table private.invite_rehearsal_baseline as select * from private.invite_rehearsal_snapshot();
alter table private.invite_rehearsal_baseline enable row level security;
do $$ begin
 if exists(select 1 from private.invite_rehearsal_baseline where (name like 'table %' or name like 'function %') and definition is not null) then
  raise exception 'Contact-invitation objects exist before the migration';
 end if;
 if (select count(*) from private.invite_rehearsal_baseline where name like 'grants %' and definition is not null)<>8 then
  raise exception 'Expected eight function fingerprints with grants';
 end if;
 if has_schema_privilege('service_role','private','usage') then raise exception 'service_role already uses the private schema'; end if;
end $$;
