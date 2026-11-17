-- Rehearsal for 20261117120000_terms_acceptance (hosted-baseline mode only); .after.sql removes everything here.
-- 1. The six functions the migration redefines, with their grants, as they stand, so .after.sql can prove the apply
-- changes only the lines it names and keeps the grants, and that the rollback restores them exactly. A missing one
-- fails here (the cast to regprocedure).
create table private.ba_rehearsal_functions as
 select f as signature, pg_catalog.pg_get_functiondef(f::regprocedure) as definition,
  (select p.proacl::text from pg_catalog.pg_proc p where p.oid=f::regprocedure) as grants
 from unnest(array['private.account_access_status()','private.attest_age(text)','private.join_by_link(text,text,text)',
  'private.request_to_join(text,text,text,text)','private.answer_phone_invitation(text,text,text,text)',
  'private.fold_web_account(uuid,uuid)']) f;
alter table private.ba_rehearsal_functions enable row level security;

-- 2. Fixtures, kept until .after.sql removes them: 01 and 02, confirmed phone accounts whose 18+ ticks were given with
-- the versions 2026-10 and 2026-11 at known times, for the backfill.
insert into auth.users(id,email,email_confirmed_at,phone,phone_confirmed_at) values
 ('ba000000-0000-4000-8000-000000000001',null,null,'447700900961',now()),
 ('ba000000-0000-4000-8000-000000000002',null,null,'447700900962',now());
insert into private.age_attestations(user_id,confirmed_at,terms_version) values
 ('ba000000-0000-4000-8000-000000000001','2026-10-20 10:00+00','2026-10'),
 ('ba000000-0000-4000-8000-000000000002','2026-11-02 09:30+00','2026-11');

-- 3. The pre-state: neither table, accept_terms or a helper exists, and the access check has its two keys.
do $$ begin
 if (select count(*) from private.ba_rehearsal_functions where definition is not null and grants is not null)<>6 then
  raise exception 'A function to redefine is missing or has no grants';
 end if;
 if pg_catalog.to_regclass('private.terms_versions') is not null or pg_catalog.to_regclass('private.terms_acceptances') is not null then
  raise exception 'The terms tables already exist';
 end if;
 if pg_catalog.to_regprocedure('public.accept_terms(text)') is not null or pg_catalog.to_regprocedure('private.accept_terms(text)') is not null
   or pg_catalog.to_regprocedure('private.note_terms(uuid,text,text)') is not null or pg_catalog.to_regprocedure('private.terms_needed(uuid)') is not null
   or pg_catalog.to_regprocedure('private.terms_version()') is not null then
  raise exception 'accept_terms or a terms helper already exists';
 end if;
 if (select definition from private.ba_rehearsal_functions where signature='private.account_access_status()') like '%terms%' then
  raise exception 'account_access_status already reports the terms';
 end if;
end $$;
