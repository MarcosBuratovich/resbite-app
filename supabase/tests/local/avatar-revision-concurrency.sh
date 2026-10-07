#!/bin/bash
# Disposable cluster only. Competing uploads must not overwrite a newer choice.
set -euo pipefail
pg_bin="$1"
socket="$2"
port="$3"
args=(-X -v ON_ERROR_STOP=1 -h "$socket" -p "$port" -U postgres -d postgres)
"$pg_bin/psql" "${args[@]}" >"$socket/avatar-cas-seed.log" <<'SQL'
insert into auth.users(id,email,email_confirmed_at) values('88000000-0000-4000-8000-000000000001','avatar-race@resbite-test.invalid',now());
insert into private.tester_roster(email) values('avatar-race@resbite-test.invalid');
insert into public.profiles(id,display_name) values('88000000-0000-4000-8000-000000000001','Synthetic owner');
insert into storage.objects(bucket_id,name,owner) values
 ('profile-photos','88000000-0000-4000-8000-000000000001/a.jpg','88000000-0000-4000-8000-000000000001'),
 ('profile-photos','88000000-0000-4000-8000-000000000001/b.jpg','88000000-0000-4000-8000-000000000001');
SQL
PGAPPNAME=resbite_avatar_newer "$pg_bin/psql" "${args[@]}" >"$socket/avatar-cas-newer.log" 2>&1 <<'SQL' &
begin;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"88000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.set_avatar_if_current('88000000-0000-4000-8000-000000000001/a.jpg',null,0);
select pg_sleep(2);
commit;
SQL
newer_pid=$!
ready=false
for attempt in {1..50}; do
 if [[ "$("$pg_bin/psql" "${args[@]}" -Atc "select count(*) from pg_stat_activity where application_name='resbite_avatar_newer' and wait_event='PgSleep'")" == 1 ]]; then ready=true; break; fi
 sleep 0.05
done
if [[ "$ready" != true ]]; then cat "$socket/avatar-cas-newer.log"; echo 'Newer avatar save did not become ready'; exit 1; fi
PGAPPNAME=resbite_avatar_stale "$pg_bin/psql" "${args[@]}" >"$socket/avatar-cas-stale.log" 2>&1 <<'SQL' &
set role authenticated;
select set_config('request.jwt.claims','{"sub":"88000000-0000-4000-8000-000000000001","role":"authenticated"}',false);
do $$ begin
 begin
  perform public.set_avatar_if_current('88000000-0000-4000-8000-000000000001/b.jpg',null,0);
  raise exception 'Competing stale avatar replaced newer choice';
 exception when serialization_failure then null;
 end;
end $$;
SQL
stale_pid=$!
blocked=false
for attempt in {1..30}; do
 if [[ "$("$pg_bin/psql" "${args[@]}" -Atc "select count(*) from pg_stat_activity where application_name='resbite_avatar_stale' and wait_event='advisory'")" == 1 ]]; then blocked=true; break; fi
 sleep 0.05
done
if [[ "$blocked" != true ]]; then cat "$socket/avatar-cas-stale.log"; echo 'Competing avatar did not wait for the account lock'; exit 1; fi
wait "$newer_pid"
wait "$stale_pid"
"$pg_bin/psql" "${args[@]}" >"$socket/avatar-cas-verify.log" <<'SQL'
do $$ begin
 if not exists(select 1 from public.profiles where id='88000000-0000-4000-8000-000000000001'
   and avatar_path='88000000-0000-4000-8000-000000000001/a.jpg' and avatar_revision=1) then
  raise exception 'Concurrent avatar CAS lost newer selection';
 end if;
end $$;
set role authenticated;
select set_config('request.jwt.claims','{"sub":"88000000-0000-4000-8000-000000000001","role":"authenticated"}',false);
do $$ begin
 if public.set_avatar_if_current('88000000-0000-4000-8000-000000000001/a.jpg',null,0)
   <> '{"avatar_path":"88000000-0000-4000-8000-000000000001/a.jpg","avatar_revision":1}'::jsonb then
  raise exception 'Retry after concurrent rejected save was not acknowledged';
 end if;
end $$;
reset role;
select set_config('request.jwt.claims','{}',false);
delete from storage.objects where name like '88000000-0000-4000-8000-000000000001/%';
delete from auth.users where id='88000000-0000-4000-8000-000000000001';
delete from private.tester_roster where email='avatar-race@resbite-test.invalid';
SQL
echo 'PASS: concurrent stale avatar save rejected; newer choice and exact retry retained'
