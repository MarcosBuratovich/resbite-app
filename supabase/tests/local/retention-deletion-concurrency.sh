#!/bin/bash
# Invoke only with the disposable cluster created by scripts/test-database.sh (full mode). The daily retention run racing
# an in-app account deletion (App Store readiness plan 6, 20261117130000_retention_and_team_tools.sql; the final
# review's cross-cutting #7). It commits rows across sessions, so its ids have the prefix c8 (c8a… people, c8b… plans,
# c8c… sessions, c8d… deletion requests) and it deletes its plans, chat rows, jobs and people at the end.
# The run holds the chat rows purge_chats locked until it commits, and only then reaches purge_web_accounts, which
# queues plan 2's deletion for a dormant web account. A deletion takes the account's lock, then the deletions' lock
# (ASR2-5), then the chat rows of the chats its account wrote in. So: the run locks the chat row of Uma's old one-off;
# Uma's deletion then holds the deletions' lock and waits on that row; the run reaches its dormant web account, Wen.
# purge_web_accounts only tries the deletions' lock: it finds it taken and refuses with 55P03, so the run reads null for
# web_accounts and warns with that SQLSTATE, and commits; Uma's deletion then goes through. Before the fix the run waited
# for the deletions' lock and one of the two was aborted as a deadlock (40P01). Wen's deletion is queued by the next
# run. Expected: no 40P01, the run's warning reads 55P03, Uma's job exists, and Wen is queued by the next run only.
set -euo pipefail
pg_bin="$1"
socket="$2"
port="$3"
args=(-X -v ON_ERROR_STOP=1 -h "$socket" -p "$port" -U postgres -d postgres)
u() { echo "c8a00000-0000-4000-8000-0000000000$1"; }
p() { echo "c8b00000-0000-4000-8000-0000000000$1"; }
s() { echo "c8c00000-0000-4000-8000-0000000000$1"; }
r() { echo "c8d00000-0000-4000-8000-0000000000$1"; }
wait_for() {
 local app="$1" condition="$2" what="$3"
 for attempt in {1..100}; do
  if [[ "$("$pg_bin/psql" "${args[@]}" -Atc "select count(*) from pg_stat_activity where application_name='$app' and $condition")" == 1 ]]; then return 0; fi
  sleep 0.05
 done
 echo "$what"; exit 1
}
# A session of that name holds or waits for a row lock (a tuple lock) on that table.
on_row_of() { echo "exists(select 1 from pg_locks l where l.pid=pg_stat_activity.pid and l.locktype='tuple' and l.relation='$1'::regclass)"; }
U="$(u 01)"; H="$(u 02)"; W="$(u 03)"; P="$(p 01)"

# The seed: Hal hosted a one-off that ended 100 days ago (its chat closed 98 days ago, so purge_chats empties it), where
# Uma, an app account, was a guest and wrote. Wen is a web-only account made 13 months ago, idle since: dormant.
"$pg_bin/psql" "${args[@]}" >"$socket/retention-deletion-concurrency-seed.log" <<SQL
insert into auth.users(id,email,email_confirmed_at,phone,phone_confirmed_at) values
 ('$U','c8-race-01@resbite-test.invalid',now(),'447700900881',now()),
 ('$H','c8-race-02@resbite-test.invalid',now(),'447700900882',now());
insert into auth.users(id,phone,phone_confirmed_at,created_at) values ('$W','447700900883',now()-interval '13 months',now()-interval '13 months');
insert into public.profiles(id,display_name) values ('$U','Uma Guest'),('$H','Hal Host'),('$W','Wen Web');
insert into private.app_sessions(user_id) values ('$U'),('$H');
insert into auth.sessions(id,user_id,created_at) values ('$(s 01)','$U',now());
select set_config('resbite.system','roll',false);
insert into public.plans(id,owner_id,title,starts_at,ends_at,time_zone,place_label,categories) values
 ('$P','$H','Old picnic',now()-interval '100 days 2 hours',now()-interval '100 days','UTC','Park',array['community']);
insert into public.attendees(plan_id,user_id,response) values ('$P','$U','accepted');
insert into public.messages(series_id,plan_id,author_id,kind,body,created_at) values ('$P','$P','$U','message','See you there',now()-interval '100 days');
select set_config('resbite.system','',false);
do \$\$ begin
 if '$W'::uuid not in (select private.dormant_web_accounts()) or private.deletion_pending('$U') then
  raise exception 'The race''s web account is not dormant, or Uma is already being deleted';
 end if;
end \$\$;
SQL

PGAPPNAME=resbite_c8_run "$pg_bin/psql" "${args[@]}" -At >"$socket/retention-deletion-concurrency-run.log" 2>&1 <<SQL &
\\set VERBOSITY verbose
begin;
select 'chats', private.purge_chats();
select pg_sleep(3);
select 'web_accounts_null', (private.run_retention()->'web_accounts') = 'null'::jsonb;
commit;
SQL
run_pid=$!
wait_for resbite_c8_run "wait_event='PgSleep'" 'The run did not reach its pause after purge_chats'
PGAPPNAME=resbite_c8_delete "$pg_bin/psql" "${args[@]}" >"$socket/retention-deletion-concurrency-delete.log" 2>&1 <<SQL &
\\set VERBOSITY verbose
select private.request_account_deletion('$U','$(s 01)','$(r 01)',repeat('a',64));
SQL
delete_pid=$!
wait_for resbite_c8_delete "wait_event_type='Lock' and $(on_row_of public.chats)" "Uma's deletion did not wait on the chat row the run holds"
run_status=0; delete_status=0
wait "$run_pid" || run_status=$?
wait "$delete_pid" || delete_status=$?
if grep -q '40P01\|deadlock' "$socket/retention-deletion-concurrency-run.log" "$socket/retention-deletion-concurrency-delete.log"; then
 cat "$socket/retention-deletion-concurrency-run.log" "$socket/retention-deletion-concurrency-delete.log"
 echo "FAIL: the retention run and an in-app deletion deadlocked"; exit 1
fi
if [[ "$run_status" != 0 || "$delete_status" != 0 ]] \
  || ! grep -q 'resbite retention: web_accounts failed (55P03)' "$socket/retention-deletion-concurrency-run.log" \
  || ! grep -q '^web_accounts_null|t$' "$socket/retention-deletion-concurrency-run.log"; then
 cat "$socket/retention-deletion-concurrency-run.log" "$socket/retention-deletion-concurrency-delete.log"
 echo "FAIL: the run did not read null for web_accounts with 55P03 while a deletion held the deletions' lock, or a session failed"; exit 1
fi
"$pg_bin/psql" "${args[@]}" >"$socket/retention-deletion-concurrency-verify.log" <<SQL
do \$\$ declare v_queued integer; begin
 if not exists(select 1 from private.account_deletion_jobs where user_id='$U' and request_id='$(r 01)') then
  raise exception 'FAIL: Uma''s deletion was not recorded';
 end if;
 if private.deletion_pending('$W') then raise exception 'FAIL: Wen was queued while the deletions'' lock was taken'; end if;
 -- The next day's run.
 v_queued := private.purge_web_accounts();
 if v_queued <> 1 or not private.deletion_pending('$W') then
  raise exception 'FAIL: the next run queued % web accounts, Wen among them: %', v_queued, private.deletion_pending('$W');
 end if;
end \$\$;
SQL
echo "PASS: the retention run and an in-app deletion at once: the run tries the deletions' lock, reads null for web_accounts (55P03) and commits, the deletion goes through, no deadlock; the next run queues the web account"

# Cleanup: the plan (its guest rows and messages go with it), its chat row, the deletion jobs, the broadcasts, and the
# people (their profiles, sessions and app sessions go with them).
"$pg_bin/psql" "${args[@]}" >"$socket/retention-deletion-concurrency-cleanup.log" <<'SQL'
delete from public.plans where series_id::text like 'c8b00000-%';
delete from public.chats where series_id::text like 'c8b00000-%';
delete from private.account_deletion_jobs where user_id::text like 'c8a00000-%';
delete from private.notification_outbox where recipient_id::text like 'c8a00000-%';
delete from realtime.messages where topic like 'chat:c8b00000-%';
delete from auth.users where id::text like 'c8a00000-%';
do $$ begin
 if exists(select 1 from public.plans where series_id::text like 'c8b00000-%' or owner_id::text like 'c8a00000-%')
 or exists(select 1 from public.chats where series_id::text like 'c8b00000-%')
 or exists(select 1 from public.messages where series_id::text like 'c8b00000-%')
 or exists(select 1 from public.profiles where id::text like 'c8a00000-%')
 or exists(select 1 from private.account_deletion_jobs where user_id::text like 'c8a00000-%')
 or exists(select 1 from realtime.messages where topic like 'chat:c8b00000-%') then
  raise exception 'The race''s rows were not cleaned up';
 end if;
end $$;
SQL
