#!/bin/bash
# Invoke only with the disposable cluster created by scripts/test-database.sh (full mode). Chat safety races (plan
# docs/superpowers/plans/2026-11-11-chat-3-safety.md, Task 2; ruling SR3). It commits rows across sessions, so its ids
# have the prefix e8 and it deletes its plans, chats rows and users at the end. Each race is made to meet in the order
# that deadlocked before SR3, with a session holding a lock until the others wait.
# (1) A report and the reported host's account deletion. The 'report_filed' lock is held, so the report waits after
# storing its row; the deletion then holds the host's plans and waits on the reported message. The report takes the
# plan's row (for key share) before its row, as the deletion takes the plan before the message, so it waits there
# instead of on the plan after the message: no deadlock (40P01), and both go through.
# (2) A fold and the deletion of the person who brought the folded account and reported it. A session holds the web
# account's phone invitation, so the fold waits there holding its guest row; the deletion then waits on that guest row
# (its brought_by), and only after it deletes the reports it filed, as the fold re-points them: no deadlock.
# (3) The plan-3 rollback and a send already reading the chat rules and the blocked terms. The chat's lock is held, so
# the send waits after those reads; the rollback then locks the tables in the order a send or a report meets them, the
# outbox last, so it waits for the send, which goes through, and then runs (in a transaction rolled back here).
# (4) remove-reported-message.sql while the author's delete_message holds the chat's row: the script waits, removes
# nothing, and prints the message's final state (deleted), never the one it read before waiting.
set -euo pipefail
pg_bin="$1"
socket="$2"
port="$3"
repo="$(cd "$(dirname "$0")/../../.." && pwd)"
args=(-X -v ON_ERROR_STOP=1 -h "$socket" -p "$port" -U postgres -d postgres)
u() { echo "e8000000-0000-4000-8000-0000000000$1"; }
p() { echo "e8100000-0000-4000-8000-0000000000$1"; }
"$pg_bin/psql" "${args[@]}" >"$socket/chat-safety-concurrency-seed.log" <<'SQL'
select set_config('resbite.system','roll',false);
-- 01 a host whose account is deleted in (1); 02 the reporter; 03 a moderator; 04 the person deleted in (2), who brought
-- 05; 05 a web account (no app session, owns nothing) folded into 06, an app account; 07 the host of (2), (3) and (4);
-- 08 a writer. Live grants, no roster row (the harness checks the roster is empty at the end); 01 and 04 have a fresh
-- session for their deletions.
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data)
 select ('e8000000-0000-4000-8000-0000000000'||n)::uuid,'chat-safety-race-'||n||'@resbite-test.invalid',now(),'{}'
 from unnest(array['01','02','03','04','05','06','07','08']) n;
insert into auth.sessions(id,user_id,created_at) values ('e8200000-0000-4000-8000-000000000001','e8000000-0000-4000-8000-000000000001',now()),
 ('e8200000-0000-4000-8000-000000000004','e8000000-0000-4000-8000-000000000004',now());
insert into public.profiles(id,display_name)
 select ('e8000000-0000-4000-8000-0000000000'||n)::uuid,'Race '||n from unnest(array['01','02','03','04','05','07','08']) n;
insert into private.beta_access(user_id,source)
 select ('e8000000-0000-4000-8000-0000000000'||n)::uuid,'maintainer' from unnest(array['01','02','03','04','06','07','08']) n;
insert into private.app_sessions(user_id)
 select ('e8000000-0000-4000-8000-0000000000'||n)::uuid from unnest(array['01','02','03','04','06','07','08']) n;
insert into private.chat_rules_acceptances(user_id,version)
 select ('e8000000-0000-4000-8000-0000000000'||n)::uuid,private.chat_rules_version() from unnest(array['01','02','07','08']) n;
insert into private.moderators(user_id) values ('e8000000-0000-4000-8000-000000000003');
insert into public.plans(id,owner_id,title,starts_at,time_zone,place_label,categories) values
 ('e8100000-0000-4000-8000-000000000001','e8000000-0000-4000-8000-000000000001','Race report','2099-09-01 19:00+00','UTC','Here',array['community']),
 ('e8100000-0000-4000-8000-000000000002','e8000000-0000-4000-8000-000000000007','Race fold','2099-09-02 19:00+00','UTC','There',array['community']),
 ('e8100000-0000-4000-8000-000000000003','e8000000-0000-4000-8000-000000000007','Race chat','2099-09-03 19:00+00','UTC','Yonder',array['community']);
insert into public.attendees(plan_id,user_id,response,brought_by) values
 ('e8100000-0000-4000-8000-000000000001','e8000000-0000-4000-8000-000000000002','accepted',null),
 ('e8100000-0000-4000-8000-000000000002','e8000000-0000-4000-8000-000000000004','accepted',null),
 ('e8100000-0000-4000-8000-000000000002','e8000000-0000-4000-8000-000000000005','accepted','e8000000-0000-4000-8000-000000000004'),
 ('e8100000-0000-4000-8000-000000000003','e8000000-0000-4000-8000-000000000008','accepted',null);
-- The host's words on (1)'s resbite; 04's report about 05, its guest (2); 05's phone invitation (2); 08's words on (4)'s
-- resbite and the host's report of them.
insert into public.messages(series_id,plan_id,author_id,kind,body,client_id) values
 ('e8100000-0000-4000-8000-000000000001','e8100000-0000-4000-8000-000000000001','e8000000-0000-4000-8000-000000000001','message',
  'Host words','e8300000-0000-4000-8000-000000000001'),
 ('e8100000-0000-4000-8000-000000000003','e8100000-0000-4000-8000-000000000003','e8000000-0000-4000-8000-000000000008','message',
  'Writer words','e8300000-0000-4000-8000-000000000002');
insert into private.reports(reporter_id,target_user_id,series_id,plan_id,about,reason) values
 ('e8000000-0000-4000-8000-000000000004','e8000000-0000-4000-8000-000000000005','e8100000-0000-4000-8000-000000000002',
  'e8100000-0000-4000-8000-000000000002','user','spam');
insert into private.reports(reporter_id,target_user_id,message_id,series_id,plan_id,about,reason,frozen_body,frozen_author)
 select 'e8000000-0000-4000-8000-000000000007','e8000000-0000-4000-8000-000000000008',m.id,m.series_id,m.plan_id,'message','spam',m.body,m.author_id
 from public.messages m where m.client_id='e8300000-0000-4000-8000-000000000002';
insert into private.phone_invitations(plan_id,phone,country,invited_by,user_id,answered_at) values
 ('e8100000-0000-4000-8000-000000000002','447700900851','44','e8000000-0000-4000-8000-000000000007','e8000000-0000-4000-8000-000000000005',now());
SQL
wait_for() {
 local app="$1" column="$2" value="$3" what="$4"
 for attempt in {1..60}; do
  if [[ "$("$pg_bin/psql" "${args[@]}" -Atc "select count(*) from pg_stat_activity where application_name='$app' and $column='$value'")" == 1 ]]; then return 0; fi
  sleep 0.05
 done
 echo "$what"; exit 1
}
no_deadlock() {
 local what="$1"; shift
 if grep -q '40P01\|deadlock' "$@"; then cat "$@"; echo "FAIL: $what deadlocked"; exit 1; fi
}

# (1) A report and the reported host's deletion.
PGAPPNAME=resbite_safety_hold1 "$pg_bin/psql" "${args[@]}" >"$socket/chat-safety-hold1.log" 2>&1 <<'SQL' &
begin;
select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('report_filed',0));
select pg_sleep(2);
commit;
SQL
hold_pid=$!
wait_for resbite_safety_hold1 wait_event PgSleep 'The report_filed lock holder did not become ready'
message_id="$("$pg_bin/psql" "${args[@]}" -Atc "select id from public.messages where client_id='e8300000-0000-4000-8000-000000000001'")"
PGAPPNAME=resbite_safety_report "$pg_bin/psql" "${args[@]}" -v id="$message_id" >"$socket/resbite_safety_report.log" 2>&1 <<'SQL' &
\set VERBOSITY verbose
set role authenticated;
select set_config('request.jwt.claims','{"sub":"e8000000-0000-4000-8000-000000000002","role":"authenticated"}',false);
select public.report_message(:id,'harassment',null);
SQL
report_pid=$!
wait_for resbite_safety_report wait_event advisory 'The report did not wait on the report_filed lock'
PGAPPNAME=resbite_safety_deletion "$pg_bin/psql" "${args[@]}" >"$socket/resbite_safety_deletion.log" 2>&1 <<'SQL' &
\set VERBOSITY verbose
select private.request_account_deletion('e8000000-0000-4000-8000-000000000001','e8200000-0000-4000-8000-000000000001',
 'e8300000-0000-4000-8000-000000000011',repeat('a',64));
SQL
deletion_pid=$!
wait_for resbite_safety_deletion wait_event_type Lock 'The deletion did not wait on the report'
wait "$hold_pid" || { cat "$socket/chat-safety-hold1.log"; exit 1; }
report_status=0; deletion_status=0
wait "$report_pid" || report_status=$?
wait "$deletion_pid" || deletion_status=$?
no_deadlock 'A report and the reported host'"'"'s deletion' "$socket/resbite_safety_report.log" "$socket/resbite_safety_deletion.log"
if [[ "$report_status" != 0 || "$deletion_status" != 0 ]]; then
 cat "$socket/resbite_safety_report.log" "$socket/resbite_safety_deletion.log"; echo 'FAIL: a report and the reported host'"'"'s deletion did not both go through'; exit 1
fi
"$pg_bin/psql" "${args[@]}" >"$socket/chat-safety-verify1.log" <<'SQL'
do $$ begin
 if (select (r.frozen_body,r.target_user_id) from private.reports r where r.reporter_id='e8000000-0000-4000-8000-000000000002')
   is distinct from ('Host words'::text,'e8000000-0000-4000-8000-000000000001'::uuid)
  or (select (state,body) from public.messages where client_id='e8300000-0000-4000-8000-000000000001') is distinct from ('deleted'::text,null::text)
  or not exists(select 1 from private.notification_outbox where kind='report_filed' and recipient_id='e8000000-0000-4000-8000-000000000003') then
  raise exception 'FAIL: the report or the deletion did not end as both done';
 end if;
end $$;
SQL
echo "PASS: a report and the reported host's account deletion at once queue on the plan's row: no deadlock"

# (2) A fold and the deletion of the person who brought and reported the folded account.
PGAPPNAME=resbite_safety_hold2 "$pg_bin/psql" "${args[@]}" >"$socket/chat-safety-hold2.log" 2>&1 <<'SQL' &
begin;
select 1 from private.phone_invitations where user_id='e8000000-0000-4000-8000-000000000005' for update;
select pg_sleep(2);
commit;
SQL
hold_pid=$!
wait_for resbite_safety_hold2 wait_event PgSleep 'The phone invitation holder did not become ready'
PGAPPNAME=resbite_safety_fold "$pg_bin/psql" "${args[@]}" >"$socket/resbite_safety_fold.log" 2>&1 <<'SQL' &
\set VERBOSITY verbose
select private.fold_web_account('e8000000-0000-4000-8000-000000000005','e8000000-0000-4000-8000-000000000006');
SQL
fold_pid=$!
wait_for resbite_safety_fold wait_event_type Lock 'The fold did not wait on the phone invitation'
PGAPPNAME=resbite_safety_deletion2 "$pg_bin/psql" "${args[@]}" >"$socket/resbite_safety_deletion2.log" 2>&1 <<'SQL' &
\set VERBOSITY verbose
select private.request_account_deletion('e8000000-0000-4000-8000-000000000004','e8200000-0000-4000-8000-000000000004',
 'e8300000-0000-4000-8000-000000000014',repeat('b',64));
SQL
deletion_pid=$!
wait_for resbite_safety_deletion2 wait_event_type Lock 'The deletion did not wait on the fold'
wait "$hold_pid" || { cat "$socket/chat-safety-hold2.log"; exit 1; }
fold_status=0; deletion_status=0
wait "$fold_pid" || fold_status=$?
wait "$deletion_pid" || deletion_status=$?
no_deadlock 'A fold and a deletion' "$socket/resbite_safety_fold.log" "$socket/resbite_safety_deletion2.log"
if [[ "$fold_status" != 0 || "$deletion_status" != 0 ]]; then
 cat "$socket/resbite_safety_fold.log" "$socket/resbite_safety_deletion2.log"; echo 'FAIL: a fold and a deletion did not both go through'; exit 1
fi
"$pg_bin/psql" "${args[@]}" >"$socket/chat-safety-verify2.log" <<'SQL'
do $$ begin
 if exists(select 1 from public.profiles where id='e8000000-0000-4000-8000-000000000005')
  or (select (user_id,brought_by) from public.attendees where plan_id='e8100000-0000-4000-8000-000000000002'
   and user_id='e8000000-0000-4000-8000-000000000006') is distinct from ('e8000000-0000-4000-8000-000000000006'::uuid,null::uuid)
  or exists(select 1 from private.reports where reporter_id='e8000000-0000-4000-8000-000000000004') then
  raise exception 'FAIL: the fold or the deletion did not end as both done';
 end if;
end $$;
SQL
echo "PASS: a fold and the deletion of the person who brought and reported the folded account take guest rows first: no deadlock"

# (4) remove-reported-message.sql while the author's deletion of the message holds the chat's row.
report_id="$("$pg_bin/psql" "${args[@]}" -Atc "select id from private.reports where reporter_id='e8000000-0000-4000-8000-000000000007'")"
written_id="$("$pg_bin/psql" "${args[@]}" -Atc "select id from public.messages where client_id='e8300000-0000-4000-8000-000000000002'")"
PGAPPNAME=resbite_safety_author "$pg_bin/psql" "${args[@]}" -v id="$written_id" >"$socket/resbite_safety_author.log" 2>&1 <<'SQL' &
begin;
set role authenticated;
select set_config('request.jwt.claims','{"sub":"e8000000-0000-4000-8000-000000000008","role":"authenticated"}',true);
select public.delete_message(:id);
select pg_sleep(1.5);
commit;
SQL
author_pid=$!
wait_for resbite_safety_author wait_event PgSleep "The author's deletion did not hold the chat's row"
sed -e "s/(values (0))/(values ($report_id))/" "$repo/supabase/ops/remove-reported-message.sql" >"$socket/chat-safety-remove.sql"
PGAPPNAME=resbite_safety_remove "$pg_bin/psql" "${args[@]}" -At -F '|' -f "$socket/chat-safety-remove.sql" >"$socket/resbite_safety_remove.log" 2>&1 &
remove_pid=$!
wait_for resbite_safety_remove wait_event_type Lock 'remove-reported-message.sql did not wait on the chat'"'"'s row'
wait "$author_pid" || { cat "$socket/resbite_safety_author.log"; exit 1; }
wait "$remove_pid" || { cat "$socket/resbite_safety_remove.log"; echo 'FAIL: remove-reported-message.sql failed'; exit 1; }
if [[ "$(cat "$socket/resbite_safety_remove.log")" != "$written_id|deleted" ]] \
 || [[ "$("$pg_bin/psql" "${args[@]}" -Atc "select state||'|'||coalesce(payload::text,'none') from public.messages where id=$written_id")" != 'deleted|none' ]]; then
 cat "$socket/resbite_safety_remove.log"; echo 'FAIL: remove-reported-message.sql printed a state the message no longer has, or removed it'; exit 1
fi
echo "PASS: remove-reported-message.sql waiting on the author's deletion prints the message's final state and removes nothing"

# (3) The plan-3 rollback and a send in flight (the rollback is rolled back here).
PGAPPNAME=resbite_safety_hold3 "$pg_bin/psql" "${args[@]}" >"$socket/chat-safety-hold3.log" 2>&1 <<'SQL' &
begin;
select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('chat:e8100000-0000-4000-8000-000000000003',0));
select pg_sleep(2);
commit;
SQL
hold_pid=$!
wait_for resbite_safety_hold3 wait_event PgSleep 'The chat lock holder did not become ready'
PGAPPNAME=resbite_safety_send "$pg_bin/psql" "${args[@]}" >"$socket/resbite_safety_send.log" 2>&1 <<'SQL' &
\set VERBOSITY verbose
set role authenticated;
select set_config('request.jwt.claims','{"sub":"e8000000-0000-4000-8000-000000000008","role":"authenticated"}',false);
select 'ID '||(public.send_message('e8100000-0000-4000-8000-000000000003','Racing the rollback','e8300000-0000-4000-8000-000000000003')->>'id');
SQL
send_pid=$!
wait_for resbite_safety_send wait_event advisory 'The send did not wait on the chat'
PGAPPNAME=resbite_safety_rollback "$pg_bin/psql" "${args[@]}" >"$socket/resbite_safety_rollback.log" 2>&1 <<SQL &
\\set VERBOSITY verbose
begin;
\\i $repo/supabase/rollback/20261111160000_chat_safety.rollback.sql
select 'ROLLBACK RAN';
rollback;
SQL
rollback_pid=$!
wait_for resbite_safety_rollback wait_event_type Lock 'The rollback did not wait on the send'
wait "$hold_pid" || { cat "$socket/chat-safety-hold3.log"; exit 1; }
send_status=0; rollback_status=0
wait "$send_pid" || send_status=$?
wait "$rollback_pid" || rollback_status=$?
no_deadlock 'The rollback and a send' "$socket/resbite_safety_send.log" "$socket/resbite_safety_rollback.log"
if [[ "$send_status" != 0 || "$rollback_status" != 0 ]] || ! grep -q 'ROLLBACK RAN' "$socket/resbite_safety_rollback.log" \
 || [[ "$("$pg_bin/psql" "${args[@]}" -Atc "select count(*) from public.messages where client_id='e8300000-0000-4000-8000-000000000003'")" != 1 ]] \
 || [[ -z "$("$pg_bin/psql" "${args[@]}" -Atc "select to_regclass('private.blocks')")" ]]; then
 cat "$socket/resbite_safety_send.log" "$socket/resbite_safety_rollback.log"; echo 'FAIL: the rollback and a send did not both go through'; exit 1
fi
echo "PASS: the plan-3 rollback waits for a send already reading the rules, takes the outbox last, and both go through"

"$pg_bin/psql" "${args[@]}" >"$socket/chat-safety-concurrency-cleanup.log" <<'SQL'
delete from public.plans where id::text like 'e8100000-%';
delete from public.chats where series_id::text like 'e8100000-%';
delete from private.account_deletion_jobs where user_id::text like 'e8000000-%';
delete from realtime.messages where topic like 'chat:e8100000-%';
delete from auth.users where id::text like 'e8000000-%';
do $$ begin
 if exists(select 1 from public.profiles where id::text like 'e8000000-%') or exists(select 1 from private.reports where plan_id::text like 'e8100000-%')
  or exists(select 1 from private.moderators where user_id::text like 'e8000000-%') then
  raise exception 'FAIL: chat-safety-concurrency.sh left rows behind';
 end if;
end $$;
SQL
