#!/bin/bash
# Disposable local harness only. Verifies real concurrent transactions, not Storage HTTP.
set -euo pipefail
pg_bin="$1"
socket="$2"
port="$3"
args=(-X -v ON_ERROR_STOP=1 -h "$socket" -p "$port" -U postgres -d postgres)
"$pg_bin/psql" "${args[@]}" >"$socket/concurrency-seed.log" <<'SQL'
insert into auth.users(id,email,email_confirmed_at) values('71000000-0000-4000-8000-000000000001','concurrency@resbite-test.invalid',now());
insert into auth.sessions(id,user_id) values('72000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000001');
insert into private.tester_roster(email) values('concurrency@resbite-test.invalid');
insert into public.profiles(id,display_name) values('71000000-0000-4000-8000-000000000001','Synthetic concurrency');
SQL
PGAPPNAME=resbite_upload_fixture "$pg_bin/psql" "${args[@]}" >"$socket/concurrency-upload.log" 2>&1 <<'SQL' &
begin;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"71000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
insert into storage.objects(bucket_id,name,owner) values('profile-photos','71000000-0000-4000-8000-000000000001/in-flight.jpg','71000000-0000-4000-8000-000000000001');
select pg_sleep(3);
commit;
SQL
upload_pid=$!
# Observe the successful insert's sleeping transaction before issuing deletion.
ready=false
for attempt in {1..50}; do
  if [[ "$("$pg_bin/psql" "${args[@]}" -Atc "select count(*) from pg_stat_activity where application_name='resbite_upload_fixture' and wait_event='PgSleep'")" == 1 ]]; then ready=true; break; fi
  sleep 0.05
done
if [[ "$ready" != true ]]; then cat "$socket/concurrency-upload.log"; echo 'Upload fixture did not become ready'; exit 1; fi
PGAPPNAME=resbite_deletion_fixture "$pg_bin/psql" "${args[@]}" >"$socket/concurrency-delete.log" 2>&1 <<'SQL' &
select public.request_account_deletion('71000000-0000-4000-8000-000000000001','72000000-0000-4000-8000-000000000001','73000000-0000-4000-8000-000000000001',repeat('c',64));
SQL
delete_pid=$!
blocked=false
for attempt in {1..40}; do
  if [[ "$("$pg_bin/psql" "${args[@]}" -Atc "select count(*) from pg_stat_activity where application_name='resbite_deletion_fixture' and wait_event='advisory'")" == 1 ]]; then blocked=true; break; fi
  sleep 0.05
done
if [[ "$blocked" != true ]]; then cat "$socket/concurrency-delete.log"; echo 'Deletion did not wait for the in-flight upload'; exit 1; fi
wait "$upload_pid"
wait "$delete_pid"
"$pg_bin/psql" "${args[@]}" >"$socket/concurrency-verify.log" <<'SQL'
-- The first upload committed before the deletion request and is visible to cleanup.
do $$ begin
 if not exists(select 1 from storage.objects where name='71000000-0000-4000-8000-000000000001/in-flight.jpg') then raise exception 'In-flight upload was lost';end if;
 if not exists(select 1 from private.account_deletion_jobs where user_id='71000000-0000-4000-8000-000000000001') then raise exception 'Deletion did not commit';end if;
end $$;
set role authenticated;
select set_config('request.jwt.claims','{"sub":"71000000-0000-4000-8000-000000000001","role":"authenticated"}',false);
do $$ begin
 begin
  insert into storage.objects(bucket_id,name,owner) values('profile-photos','71000000-0000-4000-8000-000000000001/too-late.jpg','71000000-0000-4000-8000-000000000001');
  raise exception 'Upload after deletion was accepted';
 exception when insufficient_privilege then null;end;
end $$;
reset role;
select set_config('request.jwt.claims','{}',false);
delete from storage.objects where name like '71000000-0000-4000-8000-000000000001/%';
delete from auth.users where id='71000000-0000-4000-8000-000000000001';
delete from private.account_deletion_jobs where user_id='71000000-0000-4000-8000-000000000001';
SQL
"$pg_bin/psql" "${args[@]}" >"$socket/concurrency-seed2.log" <<'SQL'
insert into auth.users(id,email,email_confirmed_at) values('71000000-0000-4000-8000-000000000002','concurrency2@resbite-test.invalid',now());
insert into auth.sessions(id,user_id) values('72000000-0000-4000-8000-000000000002','71000000-0000-4000-8000-000000000002');
insert into private.tester_roster(email) values('concurrency2@resbite-test.invalid');
insert into public.profiles(id,display_name) values('71000000-0000-4000-8000-000000000002','Synthetic concurrency');
SQL
PGAPPNAME=resbite_deletion_first "$pg_bin/psql" "${args[@]}" >"$socket/concurrency-first.log" 2>&1 <<'SQL' &
begin;
select public.request_account_deletion('71000000-0000-4000-8000-000000000002','72000000-0000-4000-8000-000000000002','73000000-0000-4000-8000-000000000002',repeat('d',64));
select pg_sleep(3);
commit;
SQL
delete_pid=$!
ready=false
for attempt in {1..50}; do
 if [[ "$("$pg_bin/psql" "${args[@]}" -Atc "select count(*) from pg_stat_activity where application_name='resbite_deletion_first' and wait_event='PgSleep'")" == 1 ]]; then ready=true; break; fi
 sleep 0.05
done
if [[ "$ready" != true ]]; then cat "$socket/concurrency-first.log"; exit 1; fi
PGAPPNAME=resbite_upload_late "$pg_bin/psql" "${args[@]}" >"$socket/concurrency-late.log" 2>&1 <<'SQL' &
set role authenticated;
select set_config('request.jwt.claims','{"sub":"71000000-0000-4000-8000-000000000002","role":"authenticated"}',false);
insert into storage.objects(bucket_id,name,owner) values('profile-photos','71000000-0000-4000-8000-000000000002/blocked.jpg','71000000-0000-4000-8000-000000000002');
SQL
upload_pid=$!
blocked=false
for attempt in {1..40}; do
 if [[ "$("$pg_bin/psql" "${args[@]}" -Atc "select count(*) from pg_stat_activity where application_name='resbite_upload_late' and wait_event='advisory'")" == 1 ]]; then blocked=true; break; fi
 sleep 0.05
done
if [[ "$blocked" != true ]]; then cat "$socket/concurrency-late.log"; echo 'Late upload did not wait for deletion'; exit 1; fi
wait "$delete_pid"
if wait "$upload_pid"; then echo 'Late upload unexpectedly succeeded after deletion committed'; exit 1; fi
"$pg_bin/psql" "${args[@]}" >"$socket/concurrency-final.log" <<'SQL'
do $$ begin
 if exists(select 1 from storage.objects where name like '71000000-0000-4000-8000-000000000002/%') then raise exception 'Stale upload restored a deleted account photo';end if;
end $$;
delete from auth.users where id='71000000-0000-4000-8000-000000000002';
delete from private.account_deletion_jobs where user_id='71000000-0000-4000-8000-000000000002';
SQL
echo 'PASS: concurrent upload/deletion serialization and post-deletion write denial'
