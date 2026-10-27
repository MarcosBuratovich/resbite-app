#!/bin/bash
# Invoke only with the disposable cluster created by scripts/test-database.sh (full mode: needs the deletion
# lifecycle's require_tester, which takes the caller's lock). Two hosts each approve the other's request at the same
# moment. decide_join_request takes both people's locks in uuid order before require_tester takes the caller's, so the
# two decisions queue instead of deadlocking. A third session holds host two's lock first, so both decisions are
# waiting when it lets go.
set -euo pipefail
pg_bin="$1"
socket="$2"
port="$3"
args=(-X -v ON_ERROR_STOP=1 -h "$socket" -p "$port" -U postgres -d postgres)
"$pg_bin/psql" "${args[@]}" >"$socket/decide-concurrency-seed.log" <<'SQL'
insert into auth.users(id,phone,phone_confirmed_at,raw_user_meta_data) values
 ('b7000000-0000-4000-8000-000000000001','447700900701',now(),'{}'),
 ('b7000000-0000-4000-8000-000000000002','447700900702',now(),'{}');
insert into public.profiles(id,display_name) values
 ('b7000000-0000-4000-8000-000000000001','Race host one'),('b7000000-0000-4000-8000-000000000002','Race host two');
insert into private.beta_access(user_id,source) values
 ('b7000000-0000-4000-8000-000000000001','maintainer'),('b7000000-0000-4000-8000-000000000002','maintainer');
insert into public.plans(id,owner_id,title,starts_at,time_zone,place_label,categories) values
 ('b7100000-0000-4000-8000-000000000001','b7000000-0000-4000-8000-000000000001','Race one','2099-08-01 19:00+00','UTC','Somewhere',array['community']),
 ('b7100000-0000-4000-8000-000000000002','b7000000-0000-4000-8000-000000000002','Race two','2099-08-02 19:00+00','UTC','Elsewhere',array['community']);
-- Each host asked to join the other's event.
insert into private.join_requests(plan_id,user_id,response) values
 ('b7100000-0000-4000-8000-000000000001','b7000000-0000-4000-8000-000000000002','accepted'),
 ('b7100000-0000-4000-8000-000000000002','b7000000-0000-4000-8000-000000000001','accepted');
SQL
PGAPPNAME=resbite_decide_hold "$pg_bin/psql" "${args[@]}" >"$socket/decide-concurrency-hold.log" 2>&1 <<'SQL' &
begin;
select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('b7000000-0000-4000-8000-000000000002',47));
select pg_sleep(3);
commit;
SQL
hold_pid=$!
wait_for() {
 local app="$1" event="$2" what="$3"
 for attempt in {1..60}; do
  if [[ "$("$pg_bin/psql" "${args[@]}" -Atc "select count(*) from pg_stat_activity where application_name='$app' and wait_event='$event'")" == 1 ]]; then return 0; fi
  sleep 0.05
 done
 echo "$what"; exit 1
}
wait_for resbite_decide_hold PgSleep 'The lock holder did not become ready'
# Host one approves host two's request: it waits on host two's lock.
PGAPPNAME=resbite_decide_one "$pg_bin/psql" "${args[@]}" >"$socket/decide-concurrency-one.log" 2>&1 <<'SQL' &
set role authenticated;
select set_config('request.jwt.claims','{"sub":"b7000000-0000-4000-8000-000000000001","role":"authenticated"}',false);
do $$ begin perform public.decide_join_request('b7100000-0000-4000-8000-000000000001','b7000000-0000-4000-8000-000000000002',true); end $$;
SQL
one_pid=$!
wait_for resbite_decide_one advisory "Host one's decision did not wait"
# Host two approves host one's request at the same time.
PGAPPNAME=resbite_decide_two "$pg_bin/psql" "${args[@]}" >"$socket/decide-concurrency-two.log" 2>&1 <<'SQL' &
set role authenticated;
select set_config('request.jwt.claims','{"sub":"b7000000-0000-4000-8000-000000000002","role":"authenticated"}',false);
do $$ begin perform public.decide_join_request('b7100000-0000-4000-8000-000000000002','b7000000-0000-4000-8000-000000000001',true); end $$;
SQL
two_pid=$!
wait_for resbite_decide_two advisory "Host two's decision did not wait"
wait "$hold_pid" || { cat "$socket/decide-concurrency-hold.log"; exit 1; }
wait "$one_pid" || { cat "$socket/decide-concurrency-one.log"; echo "Host one's decision failed"; exit 1; }
wait "$two_pid" || { cat "$socket/decide-concurrency-two.log"; echo "Host two's decision failed"; exit 1; }
"$pg_bin/psql" "${args[@]}" >"$socket/decide-concurrency-verify.log" <<'SQL'
do $$ begin
 if (select count(*) from private.join_requests where plan_id in ('b7100000-0000-4000-8000-000000000001','b7100000-0000-4000-8000-000000000002') and status='approved')<>2
 or not exists(select 1 from public.attendees where plan_id='b7100000-0000-4000-8000-000000000001' and user_id='b7000000-0000-4000-8000-000000000002')
 or not exists(select 1 from public.attendees where plan_id='b7100000-0000-4000-8000-000000000002' and user_id='b7000000-0000-4000-8000-000000000001') then
  raise exception 'Both approvals should have gone through';
 end if;
end $$;
delete from public.plans where id in ('b7100000-0000-4000-8000-000000000001','b7100000-0000-4000-8000-000000000002');
delete from auth.users where id in ('b7000000-0000-4000-8000-000000000001','b7000000-0000-4000-8000-000000000002');
SQL
echo "PASS: two hosts approving each other's requests at once queue on their locks instead of deadlocking"
