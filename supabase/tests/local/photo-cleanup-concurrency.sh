#!/bin/bash
# Disposable harness only; arguments must come from scripts/test-database.sh.
# SQL metadata operations simulate the Storage service, not its blob API.
set -euo pipefail
pg_bin="$1"
socket="$2"
port="$3"
args=(-X -v ON_ERROR_STOP=1 -h "$socket" -p "$port" -U postgres -d postgres)
await_state() {
  local application="$1" event="$2"
  for attempt in {1..80}; do
    if [[ "$("$pg_bin/psql" "${args[@]}" -Atc "select count(*) from pg_stat_activity where application_name='$application' and wait_event='$event'")" == 1 ]]; then return 0; fi
    sleep 0.05
  done
  echo "Fixture did not reach expected state: $application / $event"
  return 1
}
"$pg_bin/psql" "${args[@]}" >"$socket/photo-concurrency-seed.log" <<'SQL'
insert into auth.users(id,email,email_confirmed_at) values('85000000-0000-4000-8000-000000000001','photo-concurrency@resbite-test.invalid',now());
insert into private.tester_roster(email) values('photo-concurrency@resbite-test.invalid');
insert into public.profiles(id,display_name) values('85000000-0000-4000-8000-000000000001','Photo concurrency');
insert into storage.objects(bucket_id,name) select 'profile-photos','85000000-0000-4000-8000-000000000001/'||name from unnest(array['attach.jpg','upload.jpg','retire.jpg']) name;
select public.claim_orphan_profile_photos(5);
update private.profile_photo_cleanup_jobs set observed_at=now()-interval '8 days' where user_id='85000000-0000-4000-8000-000000000001';
SQL
PGAPPNAME=resbite_photo_attach_first "$pg_bin/psql" "${args[@]}" >"$socket/photo-attach-first.log" 2>&1 <<'SQL' &
begin;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"85000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.set_avatar('85000000-0000-4000-8000-000000000001/attach.jpg');
select pg_sleep(2);
commit;
SQL
attach_pid=$!
await_state resbite_photo_attach_first PgSleep
"$pg_bin/psql" "${args[@]}" >"$socket/photo-skip-attach.log" <<'SQL'
do $$ begin
 if public.claim_orphan_profile_photos(5)<>'[]'::jsonb then raise exception 'Cleanup raced an attachment'; end if;
end $$;
SQL
wait "$attach_pid"

PGAPPNAME=resbite_photo_upload_first "$pg_bin/psql" "${args[@]}" >"$socket/photo-upload-first.log" 2>&1 <<'SQL' &
begin;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"85000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
update storage.objects set owner='85000000-0000-4000-8000-000000000001' where name='85000000-0000-4000-8000-000000000001/upload.jpg';
select pg_sleep(2);
commit;
SQL
upload_pid=$!
await_state resbite_photo_upload_first PgSleep
"$pg_bin/psql" "${args[@]}" >"$socket/photo-skip-upload.log" <<'SQL'
do $$ begin
 if public.claim_orphan_profile_photos(5)<>'[]'::jsonb then raise exception 'Cleanup raced an upload'; end if;
end $$;
SQL
wait "$upload_pid"

PGAPPNAME=resbite_photo_retire_first "$pg_bin/psql" "${args[@]}" >"$socket/photo-retire-first.log" 2>&1 <<'SQL' &
begin;
do $$ declare jobs jsonb; prepared jsonb; begin
 jobs:=public.claim_orphan_profile_photos(5);
 if jsonb_array_length(jobs)<>1 then raise exception 'Attached or recently uploaded file was claimed'; end if;
 prepared:=public.prepare_orphan_profile_photo((jobs->0->>'jobId')::uuid,(jobs->0->>'leaseId')::uuid);
 if prepared->>'path'<>'85000000-0000-4000-8000-000000000001/retire.jpg' then raise exception 'Wrong path retired'; end if;
end $$;
select pg_sleep(2);
commit;
SQL
retire_pid=$!
await_state resbite_photo_retire_first PgSleep
PGAPPNAME=resbite_photo_attach_late "$pg_bin/psql" "${args[@]}" >"$socket/photo-attach-late.log" 2>&1 <<'SQL' &
set role authenticated;
select set_config('request.jwt.claims','{"sub":"85000000-0000-4000-8000-000000000001","role":"authenticated"}',false);
select public.set_avatar('85000000-0000-4000-8000-000000000001/retire.jpg');
SQL
attach_pid=$!
PGAPPNAME=resbite_photo_upload_late "$pg_bin/psql" "${args[@]}" >"$socket/photo-upload-late.log" 2>&1 <<'SQL' &
set role authenticated;
select set_config('request.jwt.claims','{"sub":"85000000-0000-4000-8000-000000000001","role":"authenticated"}',false);
update storage.objects set owner='85000000-0000-4000-8000-000000000001' where name='85000000-0000-4000-8000-000000000001/retire.jpg';
SQL
upload_pid=$!
await_state resbite_photo_attach_late advisory
await_state resbite_photo_upload_late advisory
wait "$retire_pid"
if wait "$attach_pid"; then echo 'Attachment accepted a retired path'; exit 1; fi
if wait "$upload_pid"; then echo 'Upload reused a retired path'; exit 1; fi
"$pg_bin/psql" "${args[@]}" >"$socket/photo-concurrency-final.log" <<'SQL'
do $$ begin
 if (select avatar_path from public.profiles where id='85000000-0000-4000-8000-000000000001')<>'85000000-0000-4000-8000-000000000001/attach.jpg' then raise exception 'Current photo replaced by retired path'; end if;
 if (select count(*) from storage.objects where name like '85000000-0000-4000-8000-000000000001/%')<>3 then raise exception 'SQL cleanup removed Storage metadata'; end if;
end $$;
delete from storage.objects where name like '85000000-0000-4000-8000-000000000001/%';
delete from private.profile_photo_cleanup_jobs where user_id='85000000-0000-4000-8000-000000000001';
delete from private.profile_photo_retired_paths where user_id='85000000-0000-4000-8000-000000000001';
delete from auth.users where id='85000000-0000-4000-8000-000000000001';
delete from private.tester_roster where email='photo-concurrency@resbite-test.invalid';
SQL
echo 'PASS: concurrent photo attachment/upload versus irreversible path retirement'
