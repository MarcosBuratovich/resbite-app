#!/bin/bash
# Invoke only with the disposable cluster created by scripts/test-database.sh. The host lowers the circle while a guest
# is bringing someone (plan 2026-11-10-connections-2-circles-of-trust, Task 1 Step 5 (b); scenario (a), two phones
# spending the last invite, is left out: the local require_tester queues the two calls on the guest's own lock, so it
# cannot fail here). The host's set_plan_circle(0,1) holds the plan's row (its transaction sleeps before committing);
# the guest's invite_contacts asks for the same row before it reads the allowance, so it waits, and then sees the
# lowered circle. Expected: the guest gets 42501 'Not allowed to bring people here' and nobody is added. With the
# allowance read above the plan-row lock the guest would read the old circle and bring the person: this fails.
set -euo pipefail
pg_bin="$1"
socket="$2"
port="$3"
args=(-X -v ON_ERROR_STOP=1 -h "$socket" -p "$port" -U postgres -d postgres)
"$pg_bin/psql" "${args[@]}" >"$socket/circles-concurrency-seed.log" <<'SQL'
insert into auth.users(id,phone,phone_confirmed_at,raw_user_meta_data) values
 ('f7000000-0000-4000-8000-000000000001','447700900771',now(),'{}'),
 ('f7000000-0000-4000-8000-000000000002','447700900772',now(),'{}'),
 ('f7000000-0000-4000-8000-000000000006','447700900776',now(),'{}');
insert into public.profiles(id,display_name) values
 ('f7000000-0000-4000-8000-000000000001','Race host'),('f7000000-0000-4000-8000-000000000002','Race guest'),
 ('f7000000-0000-4000-8000-000000000006','Race friend');
insert into private.beta_access(user_id,source) values
 ('f7000000-0000-4000-8000-000000000001','maintainer'),('f7000000-0000-4000-8000-000000000002','maintainer'),
 ('f7000000-0000-4000-8000-000000000006','maintainer');
-- The host's resbite, each guest may bring one; the guest is Going and connected to their friend.
insert into public.plans(id,owner_id,title,starts_at,time_zone,place_label,categories,bring_invites,bring_levels) values
 ('f7100000-0000-4000-8000-000000000001','f7000000-0000-4000-8000-000000000001','Race games','2099-08-04 19:00+00','UTC','Kitchen',array['community'],1,1);
insert into public.attendees(plan_id,user_id,response) values
 ('f7100000-0000-4000-8000-000000000001','f7000000-0000-4000-8000-000000000002','accepted');
insert into public.connections(user_a,user_b,state,requested_by,accepted_at) values
 ('f7000000-0000-4000-8000-000000000002','f7000000-0000-4000-8000-000000000006','connected','f7000000-0000-4000-8000-000000000002',now());
SQL
# The host lowers the circle to Nobody and holds the plan's row.
PGAPPNAME=resbite_circle_hold "$pg_bin/psql" "${args[@]}" >"$socket/circles-concurrency-hold.log" 2>&1 <<'SQL' &
begin;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"f7000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.set_plan_circle('f7100000-0000-4000-8000-000000000001',0::smallint,1::smallint);
select pg_sleep(1);
commit;
SQL
hold_pid=$!
wait_for() {
 local app="$1" column="$2" value="$3" what="$4"
 for attempt in {1..60}; do
  if [[ "$("$pg_bin/psql" "${args[@]}" -Atc "select count(*) from pg_stat_activity where application_name='$app' and $column='$value'")" == 1 ]]; then return 0; fi
  sleep 0.05
 done
 echo "$what"; exit 1
}
wait_for resbite_circle_hold wait_event PgSleep 'The host did not hold the plan'
# The guest brings their friend meanwhile: it waits on the plan's row.
PGAPPNAME=resbite_circle_bring "$pg_bin/psql" "${args[@]}" >"$socket/circles-concurrency-bring.log" 2>&1 <<'SQL' &
\set VERBOSITY verbose
set role authenticated;
select set_config('request.jwt.claims','{"sub":"f7000000-0000-4000-8000-000000000002","role":"authenticated"}',false);
select public.invite_contacts('f7100000-0000-4000-8000-000000000001',jsonb_build_array(jsonb_build_object('user','f7000000-0000-4000-8000-000000000006')));
SQL
bring_pid=$!
wait_for resbite_circle_bring wait_event_type Lock "The guest's bringing did not wait on the plan"
wait "$hold_pid" || { cat "$socket/circles-concurrency-hold.log"; echo "The host's change failed"; exit 1; }
bring_status=0
wait "$bring_pid" || bring_status=$?
if [[ "$bring_status" == 0 ]] || ! grep -q '42501: Not allowed to bring people here' "$socket/circles-concurrency-bring.log"; then
 cat "$socket/circles-concurrency-bring.log"; echo 'FAIL: the guest brought someone after the host lowered the circle'; exit 1
fi
"$pg_bin/psql" "${args[@]}" >"$socket/circles-concurrency-verify.log" <<'SQL'
do $$ begin
 if exists(select 1 from public.attendees where plan_id='f7100000-0000-4000-8000-000000000001' and user_id='f7000000-0000-4000-8000-000000000006')
 or exists(select 1 from private.notification_outbox where plan_id='f7100000-0000-4000-8000-000000000001') then
  raise exception 'FAIL: the friend was added, or told';
 end if;
 if (select (bring_invites,bring_levels) from public.plans where id='f7100000-0000-4000-8000-000000000001') is distinct from (0::smallint,1::smallint) then
  raise exception 'The host''s change did not stick';
 end if;
end $$;
delete from public.connections where user_a='f7000000-0000-4000-8000-000000000002' and user_b='f7000000-0000-4000-8000-000000000006';
delete from public.plans where id='f7100000-0000-4000-8000-000000000001';
delete from auth.users where id in ('f7000000-0000-4000-8000-000000000001','f7000000-0000-4000-8000-000000000002','f7000000-0000-4000-8000-000000000006');
SQL
echo "PASS: a guest bringing while the host lowers the circle waits on the plan's row, then is refused: nobody added"
