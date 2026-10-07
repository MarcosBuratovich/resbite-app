#!/bin/bash
# Invoke only with the disposable cluster created by scripts/test-database.sh.
set -euo pipefail
pg_bin="$1"
socket="$2"
port="$3"
args=(-X -v ON_ERROR_STOP=1 -h "$socket" -p "$port" -U postgres -d postgres)
"$pg_bin/psql" "${args[@]}" >"$socket/details-concurrency-seed.log" <<'SQL'
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data)
 values('83000000-0000-4000-8000-000000000001','details-race@resbite-test.invalid',now(),
 '{"keep":"root","registration_details":{"birth_date":"1990-01-01","phone":"+447700900123","city":"London","interests":[]}}');
SQL
PGAPPNAME=resbite_details_remove "$pg_bin/psql" "${args[@]}" >"$socket/details-concurrency-remove.log" 2>&1 <<'SQL' &
begin;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"83000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.save_registration_details(
 '{"birth_date":"1990-01-01","phone":"+447700900123","city":"London","interests":[]}',
 '{"birth_date":null,"phone":null,"city":null,"interests":[]}');
select pg_sleep(2);
commit;
SQL
remove_pid=$!
ready=false
for attempt in {1..50}; do
 if [[ "$("$pg_bin/psql" "${args[@]}" -Atc "select count(*) from pg_stat_activity where application_name='resbite_details_remove' and wait_event='PgSleep'")" == 1 ]]; then ready=true; break; fi
 sleep 0.05
done
if [[ "$ready" != true ]]; then cat "$socket/details-concurrency-remove.log"; echo 'Details removal did not become ready'; exit 1; fi
PGAPPNAME=resbite_details_stale "$pg_bin/psql" "${args[@]}" >"$socket/details-concurrency-stale.log" 2>&1 <<'SQL' &
set role authenticated;
select set_config('request.jwt.claims','{"sub":"83000000-0000-4000-8000-000000000001","role":"authenticated"}',false);
do $$ begin
 begin
  perform public.save_registration_details(
   '{"birth_date":"1990-01-01","phone":"+447700900123","city":"London","interests":[]}',
   '{"birth_date":"1990-01-01","phone":"+447700900123","city":"Paris","interests":[]}');
  raise exception 'Stale edit restored removed details';
 exception when serialization_failure then null;
 end;
end $$;
SQL
stale_pid=$!
blocked=false
for attempt in {1..30}; do
 if [[ "$("$pg_bin/psql" "${args[@]}" -Atc "select count(*) from pg_stat_activity where application_name='resbite_details_stale' and wait_event='advisory'")" == 1 ]]; then blocked=true; break; fi
 sleep 0.05
done
if [[ "$blocked" != true ]]; then cat "$socket/details-concurrency-stale.log"; echo 'Stale details save did not wait'; exit 1; fi
wait "$remove_pid"
wait "$stale_pid"
"$pg_bin/psql" "${args[@]}" >"$socket/details-concurrency-verify.log" <<'SQL'
do $$ begin
 if (select raw_user_meta_data from auth.users where id='83000000-0000-4000-8000-000000000001')
   is distinct from '{"keep":"root","registration_details_version":1,"registration_details":{"birth_date":null,"phone":null,"city":null,"interests":[]}}'::jsonb then
  raise exception 'Concurrent edit restored removed private data';
 end if;
end $$;
delete from auth.users where id='83000000-0000-4000-8000-000000000001';
SQL
echo 'PASS: concurrent account-details removal survives stale save'
