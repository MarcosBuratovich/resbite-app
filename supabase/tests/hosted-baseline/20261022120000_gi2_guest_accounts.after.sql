-- Rehearsal checks for 20261022120000_gi2_guest_accounts (hosted-baseline mode only).
-- 1. The migration added the three tables and the six functions, redefined eligible(), granted nobody access by
-- itself and left the pre-GI2 data alone: the organizer is still approved, the account without a roster row is not.
do $$ begin
 if exists(select 1 from private.gi2_rehearsal_snapshot() where (name like 'table %' or name like 'function %') and definition is null) then
  raise exception 'GI2 objects missing after the apply';
 end if;
 if (select definition from private.gi2_rehearsal_baseline where name='private.eligible()')
    =(select definition from private.gi2_rehearsal_snapshot() where name='private.eligible()') then
  raise exception 'eligible() not redefined by the apply';
 end if;
 if exists(select 1 from private.beta_access) or exists(select 1 from private.age_attestations) or exists(select 1 from private.link_opens) then
  raise exception 'The apply wrote rows';
 end if;
 if (select title from public.plans where id='b9100000-0000-4000-8000-000000000001')<>'Rehearsal night' then raise exception 'Event changed'; end if;
end $$;
begin;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"b9000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ begin
 if public.account_access_status()->>'status'<>'approved' then raise exception 'Roster organizer not approved after the apply'; end if;
end $$;
select set_config('request.jwt.claims','{"sub":"b9000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ begin
 if public.account_access_status()->>'status'<>'access_pending' then raise exception 'Account approved by the apply alone'; end if;
end $$;
rollback;
-- 2. A guest joins through a live link, then the rollback restores eligible() and its grants exactly and removes
-- every GI2 object; rehearsed, then undone.
begin;
insert into private.plan_links(plan_id,code) values ('b9100000-0000-4000-8000-000000000001','BBBBBBBBBBBBBBBBBBBBBB');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"b9000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ begin
 perform public.note_link_open('BBBBBBBBBBBBBBBBBBBBBB');
 if public.join_by_link('BBBBBBBBBBBBBBBBBBBBBB','Rehearsal guest','2026-10')<>'b9100000-0000-4000-8000-000000000001' then raise exception 'Join returned the wrong plan'; end if;
 if public.account_access_status()->>'status'<>'approved' then raise exception 'Guest not approved after joining'; end if;
end $$;
reset role;
do $$ begin
 if (select count(*) from private.beta_access where user_id='b9000000-0000-4000-8000-000000000002')<>1
 or (select count(*) from private.age_attestations where user_id='b9000000-0000-4000-8000-000000000002')<>1
 or (select count(*) from private.link_opens)<>1 then raise exception 'Join or open not recorded'; end if;
end $$;
\ir ../../rollback/20261022120000_gi2_guest_accounts.rollback.sql
do $$ declare item record; begin
 for item in
  select coalesce(b.name,n.name) as name, b.definition as before, n.definition as after
  from private.gi2_rehearsal_baseline b full join private.gi2_rehearsal_snapshot() n on n.name=b.name
 loop
  if item.before is distinct from item.after then raise exception 'Rollback did not restore %', item.name; end if;
 end loop;
 if to_regclass('private.beta_access') is not null
    or to_regclass('private.age_attestations') is not null
    or to_regclass('private.link_opens') is not null
    or to_regprocedure('private.has_live_grant(uuid)') is not null
    or to_regprocedure('private.user_eligible(uuid)') is not null
    or to_regprocedure('private.deletion_pending(uuid)') is not null
    or to_regprocedure('private.join_by_link(text,text,text)') is not null
    or to_regprocedure('public.join_by_link(text,text,text)') is not null
    or to_regprocedure('public.note_link_open(text)') is not null then
  raise exception 'Rollback left GI2 objects';
 end if;
 -- The guest keeps the profile and the place on the event; the roster is unchanged.
 if (select display_name from public.profiles where id='b9000000-0000-4000-8000-000000000002') is distinct from 'Rehearsal guest'
 or (select response from public.attendees where plan_id='b9100000-0000-4000-8000-000000000001' and user_id='b9000000-0000-4000-8000-000000000002') is distinct from 'pending' then
  raise exception 'Rollback lost the guest';
 end if;
 if (select count(*) from private.tester_roster where email like 'gi2-rehearsal-%')<>1 then raise exception 'Rollback changed the roster'; end if;
end $$;
-- The link-made account loses access; the roster organizer keeps it.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"b9000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ begin
 if public.account_access_status()->>'status'<>'access_pending' then raise exception 'Link-made account still approved after the rollback'; end if;
end $$;
select set_config('request.jwt.claims','{"sub":"b9000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ begin
 if public.account_access_status()->>'status'<>'approved' then raise exception 'Roster organizer lost access in the rollback'; end if;
end $$;
reset role;
rollback;
-- 3. Remove the seed and the rehearsal helpers so later tests start clean.
delete from public.plans where id='b9100000-0000-4000-8000-000000000001';
delete from public.profiles where id='b9000000-0000-4000-8000-000000000001';
delete from private.tester_roster where email='gi2-rehearsal-owner@resbite-test.invalid';
delete from auth.users where id in ('b9000000-0000-4000-8000-000000000001','b9000000-0000-4000-8000-000000000002');
drop table private.gi2_rehearsal_baseline;
drop function private.gi2_rehearsal_snapshot();
