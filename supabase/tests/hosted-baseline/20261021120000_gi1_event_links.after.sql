-- Rehearsal checks for 20261021120000_gi1_event_links (hosted-baseline mode only).
-- 1. Pre-GI1 data: the event gained an empty area, nothing else changed, and the guest is still Going.
do $$ begin
 if (select area from public.plans where id='a9100000-0000-4000-8000-000000000001')<>'' then raise exception 'Area not empty after the apply'; end if;
 if (select response from public.attendees where plan_id='a9100000-0000-4000-8000-000000000001' and user_id='a9000000-0000-4000-8000-000000000002')<>'accepted' then raise exception 'Guest changed'; end if;
 if exists(select 1 from private.plan_links) then raise exception 'A link appeared without being asked for'; end if;
end $$;
-- 2. The rollback restores every replaced definition and the grants exactly; rehearsed, then undone.
begin;
insert into private.plan_links(plan_id,code) values ('a9100000-0000-4000-8000-000000000001','AAAAAAAAAAAAAAAAAAAAAA');
update public.plans set area='Near Old Street' where id='a9100000-0000-4000-8000-000000000001';
\ir ../../rollback/20261021120000_gi1_event_links.rollback.sql
do $$ declare item record; begin
 for item in
  select coalesce(b.name,n.name) as name, b.definition as before, n.definition as after
  from private.gi1_rehearsal_baseline b full join private.gi1_rehearsal_snapshot() n on n.name=b.name
 loop
  if item.before is distinct from item.after then raise exception 'Rollback did not restore %', item.name; end if;
 end loop;
 if to_regclass('private.plan_links') is not null
    or to_regprocedure('public.invitation_page(text)') is not null
    or to_regprocedure('public.claim_plan_link(text)') is not null
    or to_regprocedure('public.plan_link(uuid)') is not null
    or to_regprocedure('public.rotate_plan_link(uuid)') is not null
    or to_regprocedure('public.remove_guest(uuid,uuid)') is not null
    or to_regprocedure('private.new_link_code()') is not null
    or to_regprocedure('private.require_link_owner(uuid)') is not null then
  raise exception 'Rollback left GI1 objects';
 end if;
 if (select response from public.attendees where plan_id='a9100000-0000-4000-8000-000000000001' and user_id='a9000000-0000-4000-8000-000000000002')<>'accepted' then raise exception 'Rollback lost the guest'; end if;
end $$;
rollback;
-- 3. Remove the seed and the rehearsal helpers so later tests start clean.
delete from public.attendees where plan_id='a9100000-0000-4000-8000-000000000001';
delete from public.plans where id='a9100000-0000-4000-8000-000000000001';
delete from public.profiles where id in ('a9000000-0000-4000-8000-000000000001','a9000000-0000-4000-8000-000000000002');
delete from auth.users where id in ('a9000000-0000-4000-8000-000000000001','a9000000-0000-4000-8000-000000000002');
drop table private.gi1_rehearsal_baseline;
drop function private.gi1_rehearsal_snapshot();
