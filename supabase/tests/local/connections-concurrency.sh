#!/bin/bash
# Invoke only with the disposable cluster created by scripts/test-database.sh. Two people who share a resbite ask each
# other at the same moment. request_connection takes the pair's lock first, so the two requests queue: the first stores
# the request, the second finds it and accepts. A third session holds the pair's lock first, so both requests are
# waiting when it lets go; each request then waits 0.2 s before its commit, so the second runs while the first's row is
# not yet committed. Expected: one pair row, connected; no unique violation in either session; at most one acceptance
# notice.
set -euo pipefail
pg_bin="$1"
socket="$2"
port="$3"
args=(-X -v ON_ERROR_STOP=1 -h "$socket" -p "$port" -U postgres -d postgres)
"$pg_bin/psql" "${args[@]}" >"$socket/connect-concurrency-seed.log" <<'SQL'
insert into auth.users(id,phone,phone_confirmed_at,raw_user_meta_data) values
 ('b8000000-0000-4000-8000-000000000001','447700900811',now(),'{}'),
 ('b8000000-0000-4000-8000-000000000002','447700900812',now(),'{}');
insert into public.profiles(id,display_name) values
 ('b8000000-0000-4000-8000-000000000001','Race asker one'),('b8000000-0000-4000-8000-000000000002','Race asker two');
insert into private.beta_access(user_id,source) values
 ('b8000000-0000-4000-8000-000000000001','maintainer'),('b8000000-0000-4000-8000-000000000002','maintainer');
-- One's supper, with two Going.
insert into public.plans(id,owner_id,title,starts_at,time_zone,place_label,categories) values
 ('b8100000-0000-4000-8000-000000000001','b8000000-0000-4000-8000-000000000001','Race supper','2099-08-03 19:00+00','UTC','Kitchen',array['community']);
insert into public.attendees(plan_id,user_id,response) values
 ('b8100000-0000-4000-8000-000000000001','b8000000-0000-4000-8000-000000000002','accepted');
SQL
PGAPPNAME=resbite_connect_hold "$pg_bin/psql" "${args[@]}" >"$socket/connect-concurrency-hold.log" 2>&1 <<'SQL' &
begin;
select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('b8000000-0000-4000-8000-000000000001:b8000000-0000-4000-8000-000000000002',53));
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
wait_for resbite_connect_hold PgSleep 'The lock holder did not become ready'
# One asks two: it waits on the pair's lock.
PGAPPNAME=resbite_connect_one "$pg_bin/psql" "${args[@]}" >"$socket/connect-concurrency-one.log" 2>&1 <<'SQL' &
begin;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"b8000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.request_connection('b8000000-0000-4000-8000-000000000002','b8100000-0000-4000-8000-000000000001');
select pg_sleep(0.2);
commit;
SQL
one_pid=$!
wait_for resbite_connect_one advisory "One's request did not wait"
# Two asks one at the same time.
PGAPPNAME=resbite_connect_two "$pg_bin/psql" "${args[@]}" >"$socket/connect-concurrency-two.log" 2>&1 <<'SQL' &
begin;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"b8000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select public.request_connection('b8000000-0000-4000-8000-000000000001','b8100000-0000-4000-8000-000000000001');
select pg_sleep(0.2);
commit;
SQL
two_pid=$!
wait_for resbite_connect_two advisory "Two's request did not wait"
wait "$hold_pid" || { cat "$socket/connect-concurrency-hold.log"; exit 1; }
wait "$one_pid" || { cat "$socket/connect-concurrency-one.log"; echo "One's request failed"; exit 1; }
wait "$two_pid" || { cat "$socket/connect-concurrency-two.log"; echo "Two's request failed"; exit 1; }
if grep -Eqi 'unique|duplicate key|error' "$socket/connect-concurrency-one.log" "$socket/connect-concurrency-two.log"; then
 cat "$socket/connect-concurrency-one.log" "$socket/connect-concurrency-two.log"; echo 'A request met an error'; exit 1
fi
# One of the two said requested, the other connected.
if [[ "$(cat "$socket/connect-concurrency-one.log" "$socket/connect-concurrency-two.log" | grep -cw requested)" != 1 ]] \
 || [[ "$(cat "$socket/connect-concurrency-one.log" "$socket/connect-concurrency-two.log" | grep -cw connected)" != 1 ]]; then
 cat "$socket/connect-concurrency-one.log" "$socket/connect-concurrency-two.log"; echo 'Expected one requested and one connected'; exit 1
fi
"$pg_bin/psql" "${args[@]}" >"$socket/connect-concurrency-verify.log" <<'SQL'
do $$ begin
 if (select count(*) from public.connections where 'b8000000-0000-4000-8000-000000000001' in (user_a,user_b))<>1
 or not exists(select 1 from public.connections where user_a='b8000000-0000-4000-8000-000000000001'
   and user_b='b8000000-0000-4000-8000-000000000002' and state='connected') then
  raise exception 'Expected one connected pair';
 end if;
 if (select count(*) from private.notification_outbox where kind='connection_accepted' and plan_id='b8100000-0000-4000-8000-000000000001')>1 then
  raise exception 'More than one acceptance notice';
 end if;
end $$;
delete from public.connections where user_a='b8000000-0000-4000-8000-000000000001' and user_b='b8000000-0000-4000-8000-000000000002';
delete from public.plans where id='b8100000-0000-4000-8000-000000000001';
delete from auth.users where id in ('b8000000-0000-4000-8000-000000000001','b8000000-0000-4000-8000-000000000002');
SQL
echo "PASS: two people asking each other at once queue on the pair's lock: one connected pair, no unique violation"
