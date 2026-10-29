-- Rehearsal checks for 20261030130000_phone_key (hosted-baseline mode only).
-- 1. The older Argentine accounts are rewritten (phone and pending change) and recorded; the rest are untouched;
-- the duplicate invitations collapsed to the answered one, stored by key; the test codes are gone.
do $$ begin
 if (select phone from auth.users where id='e2000000-0000-4000-8000-000000000001') is distinct from '5491112340001' then
  raise exception 'The older Argentine account was not rewritten';
 end if;
 if (select phone from auth.users where id='e2000000-0000-4000-8000-000000000002') is distinct from '5491112340002'
 or (select phone from auth.users where id='e2000000-0000-4000-8000-000000000003') is distinct from '541112340003'
 or (select phone from auth.users where id='e2000000-0000-4000-8000-000000000004') is distinct from '5491112340003'
 or (select phone from auth.users where id='e2000000-0000-4000-8000-000000000005') is distinct from '447700900805' then
  raise exception 'An account that should stay was changed';
 end if;
 if (select phone from auth.users where id='e2000000-0000-4000-8000-000000000006') is distinct from '5491112340006'
 or (select phone_change from auth.users where id='e2000000-0000-4000-8000-000000000006') is distinct from '5491112340066' then
  raise exception 'The phone and the pending change were not both rewritten';
 end if;
 if (select count(*) from private.phone_rewrites where user_id::text like 'e2%')<>2
 or not exists(select 1 from private.phone_rewrites where user_id='e2000000-0000-4000-8000-000000000001' and old_phone='541112340001' and new_phone='5491112340001')
 or not exists(select 1 from private.phone_rewrites where user_id='e2000000-0000-4000-8000-000000000006' and old_phone='541112340006' and new_phone='5491112340006') then
  raise exception 'phone_rewrites rows wrong';
 end if;
 if (select count(*) from private.phone_invitations where plan_id='e2100000-0000-4000-8000-000000000001')<>2
 or not exists(select 1 from private.phone_invitations where plan_id='e2100000-0000-4000-8000-000000000001' and phone='541112347777'
   and user_id='e2000000-0000-4000-8000-000000000002')
 or not exists(select 1 from private.phone_invitations where plan_id='e2100000-0000-4000-8000-000000000001' and phone='541112348888') then
  raise exception 'Invitations were not collapsed and re-keyed';
 end if;
 if exists(select 1 from private.test_codes) then
  raise exception 'Test codes were not deleted';
 end if;
end $$;
-- 2. The collision count the runbook names: older numbers that also exist in the 549 form (the rehearsal's pair).
do $$ begin
 if (select count(*) from auth.users u where u.phone ~ '^54[0-9]{10}$'
     and exists(select 1 from auth.users v where v.phone='549'||substr(u.phone,3)))<>1 then
  raise exception 'Collision count is not the one pair';
 end if;
end $$;
-- Remove the seed so later tests start clean.
delete from public.plans where id='e2100000-0000-4000-8000-000000000001';
delete from private.phone_rewrites where user_id::text like 'e2%';
delete from auth.users where id::text like 'e2000000-0000-4000-8000-0000000000%';
delete from public.profiles where id='e2000000-0000-4000-8000-000000000005';
