-- Rehearsal checks for 20261015120000_ux3_event_details (hosted-baseline mode only).
-- 1. Pre-UX3 data: the note moved intact to Meeting details, the empty one made no row, the notice is untouched.
do $$ begin
 if (select note from public.plan_meeting_details where plan_id='f9100000-0000-4000-8000-000000000001') is distinct from 'Gate 4512' then raise exception 'Note not moved'; end if;
 if (select string_agg(has_meeting_details::text,',' order by id) from public.plans where id::text like 'f91%')<>'true,false' then raise exception 'Flags wrong after the move'; end if;
 if exists(select 1 from public.plan_meeting_details where plan_id='f9100000-0000-4000-8000-000000000002') then raise exception 'Empty note made a row'; end if;
 if exists(select 1 from public.plans where note<>'') then raise exception 'A note stayed on an event'; end if;
 if exists(select 1 from public.plans where id::text like 'f91%' and (ends_at is not null or guest_note<>'' or guest_note_at is not null)) then raise exception 'New columns not empty'; end if;
 if not exists(select 1 from private.notification_outbox where dedupe_key='ux3-rehearsal-1') then raise exception 'Queued notice lost'; end if;
end $$;
-- 2. The rollback restores every replaced definition, the notes and the grants exactly; rehearsed, then undone.
begin;
update public.plans set ends_at=starts_at+interval '1 hour',guest_note='Hello',guest_note_at=now() where id='f9100000-0000-4000-8000-000000000002';
\ir ../../rollback/20261015120000_ux3_event_details.rollback.sql
do $$ declare item record; begin
 for item in
  select coalesce(b.name,n.name) as name, b.definition as before, n.definition as after
  from private.ux3_rehearsal_baseline b full join private.ux3_rehearsal_snapshot() n on n.name=b.name
 loop
  if item.before is distinct from item.after then raise exception 'Rollback did not restore %', item.name; end if;
 end loop;
 if (select note from public.plans where id='f9100000-0000-4000-8000-000000000001') is distinct from 'Gate 4512' then raise exception 'Rollback lost the note'; end if;
 if to_regclass('public.plan_meeting_details') is not null
    or to_regprocedure('public.set_guest_note(uuid,text)') is not null
    or to_regprocedure('private.can_read_meeting_details(uuid)') is not null then
  raise exception 'Rollback left UX3 objects';
 end if;
end $$;
rollback;
-- 3. Remove the seed and the rehearsal helpers so later tests start clean.
delete from private.notification_outbox where plan_id in ('f9100000-0000-4000-8000-000000000001','f9100000-0000-4000-8000-000000000002');
delete from public.plans where id in ('f9100000-0000-4000-8000-000000000001','f9100000-0000-4000-8000-000000000002');
delete from public.profiles where id='f9000000-0000-4000-8000-000000000001';
delete from auth.users where id='f9000000-0000-4000-8000-000000000001';
drop table private.ux3_rehearsal_baseline;
drop function private.ux3_rehearsal_snapshot();
