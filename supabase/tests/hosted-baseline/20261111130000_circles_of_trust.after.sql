-- Rehearsal checks for 20261111130000_circles_of_trust (hosted-baseline mode only).
-- 1. The apply. The rows from before the migration say no circle, no bringer, level 1. Exactly one foreign key links
-- attendees to profiles and one plans to profiles (the installed builds' embeds still resolve); both brought_by
-- columns point at auth.users and become null when the account goes. plan_removals has RLS on and no policy. The ten
-- redefined functions kept their grants; the six public wrappers are for signed-in accounts only, and so are their
-- private bodies (as the house does it: never anon, never service_role); bring_allowance is for no API role; the seven
-- private functions are definers with an empty search path.
do $$ declare r text; f text; begin
 if (select (bring_invites,bring_levels) from public.plans where id='c2100000-0000-4000-8000-000000000001') is distinct from (0::smallint,1::smallint)
 or (select (brought_by,level) from public.attendees where plan_id='c2100000-0000-4000-8000-000000000001') is distinct from (null::uuid,1::smallint)
 or (select (brought_by,level) from private.phone_invitations where plan_id='c2100000-0000-4000-8000-000000000001') is distinct from (null::uuid,1::smallint) then
  raise exception 'Rows from before the migration do not read as no circle, no bringer, level 1';
 end if;
 if (select count(*) from pg_catalog.pg_constraint where conrelid='public.attendees'::regclass and confrelid='public.profiles'::regclass)<>1
 or (select count(*) from pg_catalog.pg_constraint where conrelid='public.plans'::regclass and confrelid='public.profiles'::regclass)<>1 then
  raise exception 'A second foreign key to profiles';
 end if;
 if (select count(*) from pg_catalog.pg_constraint c join pg_catalog.pg_attribute a on a.attrelid=c.conrelid and a.attnum=c.conkey[1]
   where c.contype='f' and c.confrelid='auth.users'::regclass and c.confdeltype='n' and a.attname='brought_by'
    and c.conrelid in ('public.attendees'::regclass,'private.phone_invitations'::regclass) and cardinality(c.conkey)=1)<>2 then
  raise exception 'brought_by does not reference auth.users on delete set null on both tables';
 end if;
 if not (select relrowsecurity from pg_catalog.pg_class where oid='private.plan_removals'::regclass)
 or exists(select 1 from pg_catalog.pg_policy where polrelid='private.plan_removals'::regclass) then
  raise exception 'plan_removals has no RLS, or a policy';
 end if;
 foreach r in array array['anon','authenticated','service_role'] loop
  if has_table_privilege(r,'private.plan_removals','select') or has_table_privilege(r,'private.plan_removals','insert') then
   raise exception '% may read or write plan_removals', r;
  end if;
 end loop;
 if exists(select 1 from private.co2_rehearsal_functions f
   where (select p.proacl::text from pg_catalog.pg_proc p where p.oid=f.signature::regprocedure) is distinct from f.grants) then
  raise exception 'A redefined function''s grants changed';
 end if;
 foreach f in array array['set_plan_circle(uuid,smallint,smallint)','my_bring_allowance(uuid)','plan_bringers(uuid)',
  'plan_brought_invitations(uuid)','revoke_brought_invitation(uuid,uuid)','withdraw_brought_invitation(uuid,uuid)'] loop
  if not has_function_privilege('authenticated','public.'||f,'execute') or not has_function_privilege('authenticated','private.'||f,'execute')
  or has_function_privilege('anon','public.'||f,'execute') or has_function_privilege('anon','private.'||f,'execute')
  or has_function_privilege('service_role','public.'||f,'execute') or has_function_privilege('service_role','private.'||f,'execute') then
   raise exception 'public.% or its body has the wrong grants', f;
  end if;
  if (select prosecdef from pg_catalog.pg_proc where oid=('public.'||f)::regprocedure) then raise exception 'public.% is a definer', f; end if;
 end loop;
 foreach r in array array['anon','authenticated','service_role'] loop
  if has_function_privilege(r,'private.bring_allowance(uuid,uuid)','execute') then raise exception '% may call bring_allowance', r; end if;
 end loop;
 if (select count(*) from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname='private'
   and p.proname in ('set_plan_circle','bring_allowance','my_bring_allowance','plan_bringers','plan_brought_invitations',
    'revoke_brought_invitation','withdraw_brought_invitation')
   and p.prosecdef and p.proconfig=array['search_path=""'])<>7 then
  raise exception 'A new private function is not a definer with an empty search path';
 end if;
end $$;

-- 2. The rollback, rehearsed and undone. Seed what it changes: a circle on the resbite, a guest's in-app bringing and
-- their link, a removal record. Try its two guards: it refuses once the follow-ups rollback has run (pair_standing,
-- renamed, stands in) and while chat is applied (a public.messages table stands in); a refusal changes nothing. Then
-- run it: the ten functions, with their grants, are the ones .before.sql recorded; the seven new functions, the six
-- wrappers, plan_removals and the six columns are gone; the people brought stay as ordinary guests and the link stays
-- live.
begin;
insert into auth.users(id,phone,phone_confirmed_at) values
 ('c2000000-0000-4000-8000-000000000003','447700900884',now()),
 ('c2000000-0000-4000-8000-000000000004','447700900885',now());
insert into public.profiles(id,display_name) values
 ('c2000000-0000-4000-8000-000000000003','Rehearsal friend'),('c2000000-0000-4000-8000-000000000004','Rehearsal other');
update public.plans set bring_invites=2, bring_levels=2 where id='c2100000-0000-4000-8000-000000000001';
insert into public.attendees(plan_id,user_id,response,brought_by,level) values
 ('c2100000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-000000000003','pending','c2000000-0000-4000-8000-000000000002',2);
insert into private.phone_invitations(plan_id,phone,country,code_hash,invited_by,brought_by,level) values
 ('c2100000-0000-4000-8000-000000000001','447700900886','44',extensions.digest(repeat('S',22),'sha256'),
  'c2000000-0000-4000-8000-000000000002','c2000000-0000-4000-8000-000000000002',2);
insert into private.plan_removals(series_id,user_id) select series_id,'c2000000-0000-4000-8000-000000000004' from public.plans
 where id='c2100000-0000-4000-8000-000000000001';
\set co2_rehearsal_rollback `cat :'resbite_repo'/supabase/rollback/20261111130000_circles_of_trust.rollback.sql`
create temporary table co2_rehearsal_scripts on commit drop as select :'co2_rehearsal_rollback'::text as rollback;
do $$ begin
 if coalesce(length(btrim((select rollback from co2_rehearsal_scripts))),0)=0 then raise exception 'The rollback text is empty'; end if;
 begin
  alter function private.pair_standing(uuid,uuid,uuid) rename to co2_rehearsal_renamed;
  execute (select rollback from co2_rehearsal_scripts);
  raise exception 'The circles rollback ran after the follow-ups rollback';
 exception when raise_exception then
  if sqlerrm is distinct from 'Run the circles-of-trust rollback before the connections follow-ups rollback' then raise; end if;
 end;
 begin
  create table public.messages(id integer);
  execute (select rollback from co2_rehearsal_scripts);
  raise exception 'The circles rollback ran while chat is applied';
 exception when raise_exception then
  if sqlerrm is distinct from 'Roll back the chat migrations before the circles-of-trust rollback' then raise; end if;
 end;
 if pg_catalog.to_regprocedure('private.pair_standing(uuid,uuid,uuid)') is null or pg_catalog.to_regclass('public.messages') is not null
 or pg_catalog.to_regprocedure('public.set_plan_circle(uuid,smallint,smallint)') is null or pg_catalog.to_regclass('private.plan_removals') is null then
  raise exception 'A refusal changed something';
 end if;
end $$;
\ir ../../rollback/20261111130000_circles_of_trust.rollback.sql
do $$ begin
 if exists(select 1 from private.co2_rehearsal_functions f
   where pg_catalog.pg_get_functiondef(f.signature::regprocedure) is distinct from f.definition
   or (select p.proacl::text from pg_catalog.pg_proc p where p.oid=f.signature::regprocedure) is distinct from f.grants) then
  raise exception 'Rollback did not restore %', (select string_agg(f.signature,', ') from private.co2_rehearsal_functions f
   where pg_catalog.pg_get_functiondef(f.signature::regprocedure) is distinct from f.definition
   or (select p.proacl::text from pg_catalog.pg_proc p where p.oid=f.signature::regprocedure) is distinct from f.grants);
 end if;
 if exists(select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private')
   and p.proname in ('set_plan_circle','bring_allowance','my_bring_allowance','plan_bringers','plan_brought_invitations',
    'revoke_brought_invitation','withdraw_brought_invitation')) then
  raise exception 'Rollback left a new function';
 end if;
 if pg_catalog.to_regclass('private.plan_removals') is not null then raise exception 'Rollback left plan_removals'; end if;
 if exists(select 1 from pg_catalog.pg_attribute where not attisdropped and (
   (attrelid='public.plans'::regclass and attname in ('bring_invites','bring_levels'))
   or (attrelid='public.attendees'::regclass and attname in ('brought_by','level'))
   or (attrelid='private.phone_invitations'::regclass and attname in ('brought_by','level')))) then
  raise exception 'Rollback left a circle column';
 end if;
 if not exists(select 1 from public.attendees where plan_id='c2100000-0000-4000-8000-000000000001' and user_id='c2000000-0000-4000-8000-000000000003'
   and response='pending')
 or not exists(select 1 from private.phone_invitations where plan_id='c2100000-0000-4000-8000-000000000001' and phone='447700900886'
   and revoked_at is null and code_hash=extensions.digest(repeat('S',22),'sha256')) then
  raise exception 'Rollback lost a brought guest or a bringer''s live link';
 end if;
end $$;
rollback;

-- 3. Remove the rehearsal's rows and helper so later tests start clean.
delete from public.plans where id='c2100000-0000-4000-8000-000000000001';
delete from public.profiles where id in ('c2000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-000000000002');
delete from auth.users where id in ('c2000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-000000000002');
drop table private.co2_rehearsal_functions;
