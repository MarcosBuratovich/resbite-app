#!/bin/bash
# Invoke only with the disposable cluster created by scripts/test-database.sh (full mode: needs the local-only
# deletion lifecycle). A join that waits on the account's lock while a deletion request commits must see that
# request and write nothing.
set -euo pipefail
pg_bin="$1"
socket="$2"
port="$3"
args=(-X -v ON_ERROR_STOP=1 -h "$socket" -p "$port" -U postgres -d postgres)
"$pg_bin/psql" "${args[@]}" >"$socket/join-concurrency-seed.log" <<'SQL'
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
 ('b5000000-0000-4000-8000-000000000001','join-race-owner@resbite-test.invalid',now(),'{}'),
 ('b5000000-0000-4000-8000-000000000002','join-race-leaving@resbite-test.invalid',now(),'{}');
insert into auth.sessions(id,user_id) values('b5200000-0000-4000-8000-000000000002','b5000000-0000-4000-8000-000000000002');
insert into private.tester_roster(email) values('join-race-owner@resbite-test.invalid'),('join-race-leaving@resbite-test.invalid');
begin;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"b5000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.save_profile('Race owner');
select public.create_plan_v3('b5100000-0000-4000-8000-000000000001','Race night','',array['community'],null,
 '2099-08-01 19:00+00',null,'UTC','Somewhere','');
reset role;
insert into private.plan_links(plan_id,code) values('b5100000-0000-4000-8000-000000000001','JoinRaceJoinRaceJoin01');
commit;
SQL
# A roster tester with no profile asks to delete their account and holds the lock until the request commits.
PGAPPNAME=resbite_join_delete "$pg_bin/psql" "${args[@]}" >"$socket/join-concurrency-delete.log" 2>&1 <<'SQL' &
begin;
select public.request_account_deletion('b5000000-0000-4000-8000-000000000002','b5200000-0000-4000-8000-000000000002',
 'b5300000-0000-4000-8000-000000000002',repeat('e',64));
select pg_sleep(2);
commit;
SQL
delete_pid=$!
ready=false
for attempt in {1..50}; do
 if [[ "$("$pg_bin/psql" "${args[@]}" -Atc "select count(*) from pg_stat_activity where application_name='resbite_join_delete' and wait_event='PgSleep'")" == 1 ]]; then ready=true; break; fi
 sleep 0.05
done
if [[ "$ready" != true ]]; then cat "$socket/join-concurrency-delete.log"; echo 'Deletion request did not become ready'; exit 1; fi
PGAPPNAME=resbite_join_late "$pg_bin/psql" "${args[@]}" >"$socket/join-concurrency-join.log" 2>&1 <<'SQL' &
set role authenticated;
select set_config('request.jwt.claims','{"sub":"b5000000-0000-4000-8000-000000000002","role":"authenticated"}',false);
do $$ begin
 begin
  perform public.join_by_link('JoinRaceJoinRaceJoin01','Late Name','2026-10');
  raise exception 'A join that waited on a deletion request went ahead';
 exception when insufficient_privilege then
  if sqlerrm<>'Sign-in required' then raise; end if;
 end;
end $$;
SQL
join_pid=$!
blocked=false
for attempt in {1..30}; do
 if [[ "$("$pg_bin/psql" "${args[@]}" -Atc "select count(*) from pg_stat_activity where application_name='resbite_join_late' and wait_event='advisory'")" == 1 ]]; then blocked=true; break; fi
 sleep 0.05
done
if [[ "$blocked" != true ]]; then cat "$socket/join-concurrency-join.log"; echo 'Link join did not wait for the deletion request'; exit 1; fi
wait "$delete_pid" || { cat "$socket/join-concurrency-delete.log"; exit 1; }
wait "$join_pid" || { cat "$socket/join-concurrency-join.log"; exit 1; }
"$pg_bin/psql" "${args[@]}" >"$socket/join-concurrency-verify.log" <<'SQL'
do $$ begin
 if not exists(select 1 from private.account_deletion_jobs where user_id='b5000000-0000-4000-8000-000000000002') then raise exception 'Deletion request missing'; end if;
 if exists(select 1 from private.beta_access where user_id='b5000000-0000-4000-8000-000000000002')
 or exists(select 1 from private.age_attestations where user_id='b5000000-0000-4000-8000-000000000002')
 or exists(select 1 from public.profiles where id='b5000000-0000-4000-8000-000000000002')
 or exists(select 1 from public.attendees where user_id='b5000000-0000-4000-8000-000000000002')
 or exists(select 1 from private.notification_outbox where plan_id='b5100000-0000-4000-8000-000000000001') then
  raise exception 'A join that waited on a deletion request wrote something';
 end if;
end $$;
delete from private.account_deletion_jobs where user_id='b5000000-0000-4000-8000-000000000002';
delete from public.plans where id='b5100000-0000-4000-8000-000000000001';
delete from private.tester_roster where email in ('join-race-owner@resbite-test.invalid','join-race-leaving@resbite-test.invalid');
delete from public.profiles where id='b5000000-0000-4000-8000-000000000001';
delete from auth.users where id in ('b5000000-0000-4000-8000-000000000001','b5000000-0000-4000-8000-000000000002');
SQL
echo 'PASS: a link join waiting on a deletion request sees it and writes nothing'
