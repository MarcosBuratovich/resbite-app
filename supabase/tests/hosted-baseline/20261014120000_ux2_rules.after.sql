-- Rehearsal checks for 20261014120000_ux2_rules (hosted-baseline mode only).
-- 1. Pre-UX2 data survives unchanged.
do $$ begin
 if (select response||':'||version from public.attendees where plan_id='e9100000-0000-4000-8000-000000000001')<>'withdrawn:3' then raise exception 'Stored answer changed'; end if;
 if (select cover_description||':'||cover_revision from public.plans where id='e9100000-0000-4000-8000-000000000001')<>':1' then raise exception 'Adding the description changed the cover'; end if;
 if not exists(select 1 from private.notification_outbox where dedupe_key='ux2-rehearsal-1' and actor_id is null and detail is null) then raise exception 'Queued notice changed or lost'; end if;
end $$;
-- 2. The rollback restores every replaced definition and grant exactly; rehearsed, then undone.
begin;
\ir ../../rollback/20261014120000_ux2_rules.rollback.sql
do $$ declare item record; begin
 for item in
  select coalesce(b.name,n.name) as name, b.definition as before, n.definition as after
  from private.ux2_rehearsal_baseline b full join private.ux2_rehearsal_snapshot() n on n.name=b.name
 loop
  if item.before is distinct from item.after then raise exception 'Rollback did not restore %', item.name; end if;
 end loop;
 if to_regprocedure('private.can_see_guests(uuid)') is not null
    or to_regprocedure('public.set_plan_cover_description(uuid,text,bigint)') is not null
    or to_regprocedure('private.set_plan_cover_description(uuid,text,bigint)') is not null then
  raise exception 'Rollback left UX2 functions';
 end if;
 if exists(select 1 from public.plans where cover_description<>'') then raise exception 'Rollback left descriptions'; end if;
end $$;
rollback;
-- 3. Remove the seed and the rehearsal helpers so later tests start clean.
delete from private.notification_outbox where plan_id='e9100000-0000-4000-8000-000000000001';
delete from public.attendees where plan_id='e9100000-0000-4000-8000-000000000001';
delete from public.plans where id='e9100000-0000-4000-8000-000000000001';
delete from public.profiles where id in ('e9000000-0000-4000-8000-000000000001','e9000000-0000-4000-8000-000000000002');
delete from auth.users where id in ('e9000000-0000-4000-8000-000000000001','e9000000-0000-4000-8000-000000000002');
drop table private.ux2_rehearsal_baseline;
drop function private.ux2_rehearsal_snapshot();
