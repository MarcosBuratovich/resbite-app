-- Rehearsal for 20261014120000_ux2_rules (hosted-baseline mode only); .after.sql removes everything here.
-- 1. Data in the pre-UX2 shape.
insert into auth.users(id,email,email_confirmed_at) values
 ('e9000000-0000-4000-8000-000000000001','ux2-rehearsal-owner@resbite-test.invalid',now()),
 ('e9000000-0000-4000-8000-000000000002','ux2-rehearsal-guest@resbite-test.invalid',now());
insert into public.profiles(id,display_name) values
 ('e9000000-0000-4000-8000-000000000001','Rehearsal owner'),('e9000000-0000-4000-8000-000000000002','Rehearsal guest');
insert into public.plans(id,owner_id,title,description,categories,starts_at,time_zone,place_label)
 values('e9100000-0000-4000-8000-000000000001','e9000000-0000-4000-8000-000000000001','Rehearsal','',array['community'],now()+interval '1 day','UTC','Park');
update public.plans set cover_path='e9000000-0000-4000-8000-000000000001/e9100000-0000-4000-8000-000000000001/a.jpg'
 where id='e9100000-0000-4000-8000-000000000001';
insert into public.attendees(plan_id,user_id,response,version)
 values('e9100000-0000-4000-8000-000000000001','e9000000-0000-4000-8000-000000000002','withdrawn',3);
insert into private.notification_outbox(plan_id,recipient_id,kind,dedupe_key)
 values('e9100000-0000-4000-8000-000000000001','e9000000-0000-4000-8000-000000000001','rsvp','ux2-rehearsal-1');

-- 2. The exact definitions UX2 replaces, so .after.sql can prove the rollback restores them.
create function private.ux2_rehearsal_snapshot() returns table(name text, definition text)
language sql stable set search_path='' as $$
 select p.oid::regprocedure::text, pg_catalog.pg_get_functiondef(p.oid) from pg_catalog.pg_proc p
 where p.oid in ('private.respond(uuid,text,integer)'::regprocedure,'private.claim_invite(text)'::regprocedure,
  'private.change_plan_v2(uuid,integer,text,text,text[],timestamptz,text,text,text,boolean)'::regprocedure,
  'private.can_read_profile(uuid)'::regprocedure,'private.track_cover_revision()'::regprocedure,
  'private.redact_deleting_owner_plan()'::regprocedure)
 union all
 select 'policy attendee_read', pg_catalog.pg_get_expr(polqual,polrelid)||'|'||polcmd::text||'|'||polroles::regrole[]::text
 from pg_catalog.pg_policy where polname='attendee_read' and polrelid='public.attendees'::regclass
 union all
 select 'grants', string_agg(f||':'||r||':'||pg_catalog.has_function_privilege(r,f,'execute')::text, ',' order by f, r)
 from unnest(array['public.change_plan(uuid,integer,timestamptz,text,text,text,boolean)',
  'private.change_plan(uuid,integer,timestamptz,text,text,text,boolean)','public.respond(uuid,text,integer)',
  'private.respond(uuid,text,integer)','private.claim_invite(text)','private.can_read_profile(uuid)',
  'private.change_plan_v2(uuid,integer,text,text,text[],timestamptz,text,text,text,boolean)']) f,
  unnest(array['anon','authenticated','service_role']) r
$$;
revoke all on function private.ux2_rehearsal_snapshot() from public, anon, authenticated, service_role;
create table private.ux2_rehearsal_baseline as select * from private.ux2_rehearsal_snapshot();
alter table private.ux2_rehearsal_baseline enable row level security;
