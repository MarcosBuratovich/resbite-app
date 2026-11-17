#!/bin/bash
# Invoke only with the disposable cluster created by scripts/test-database.sh (full mode). Account deletions that race
# (plan docs/superpowers/plans/2026-11-17-asr-2-account-deletion.md, Task 2; ASR2-5, ASR2-6; ruling GR2). It commits
# rows across sessions, so its ids have the prefix d3 (d3a… people, d3b… plans, d3c… sessions, d3d… deletion requests,
# d3e… message client ids) and it deletes its plans, chat rows, jobs and people at the end.
# (1) Two hosts deleting at the same moment (Review Focus 4, GR2's parked gap), three times. X and Y each own a group
# stopped by Edit with a future occurrence (repeat_weeks null, its chat row a group with a stop time), each wrote in
# the other's group chat, and they are connected. A deletion's cancellation writes its own group's stop time (the plan
# flag trigger), which takes that chat row in plan order, before the ordered chat pass. A session holds the X–Y
# connection row, which the erase step deletes, so X's deletion waits there holding its own group's chat row. Y's
# deletion then waits on the deletions' lock (ASR2-5), before any row, instead of taking its group's chat row and
# waiting on the connection: once the hold lets go, X takes Y's chat row in its pass and commits, and Y goes on.
# Expected: both go through, no 40P01, two jobs.
# (2) A deletion racing a send in the host's group. H owns a weekly group with a future occurrence and G is in its
# chat. A session holds the group's chat row; G's send waits on it (the stats trigger), holding the occurrence's row for
# key share (its foreign-key check fires first); H's deletion then waits on that plan row (the close step's lock), not
# on the chat row. The deletion takes the plan before the chat row, as a send does, which the parked fix (every chat
# row in one sorted pass before the plans) would invert, so that a deletion holding the chat row and a send holding the
# plan could each wait for the other. Expected: no deadlock; G's message is stored with its words; H's job exists and
# the group's chat has stopped (D-20).
# A row wait is told by its relation: a session waiting on a row holds that row's tuple lock (or waits for it).
# The seed's guest rows are the cast, not answers, so they are made under the roll's flag and write no chat line.
set -euo pipefail
pg_bin="$1"
socket="$2"
port="$3"
args=(-X -v ON_ERROR_STOP=1 -h "$socket" -p "$port" -U postgres -d postgres)
u() { echo "d3a00000-0000-4000-8000-0000000000$1"; }
p() { echo "d3b00000-0000-4000-8000-0000000000$1"; }
s() { echo "d3c00000-0000-4000-8000-0000000000$1"; }
r() { echo "d3d00000-0000-4000-8000-0000000000$1"; }
m() { echo "d3e00000-0000-4000-8000-0000000000$1"; }
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
no_deadlock() {
 local what="$1"; shift
 if grep -q '40P01\|deadlock' "$@"; then cat "$@"; echo "FAIL: $what deadlocked"; exit 1; fi
}
person() {
 local id="$1" name="$2"
 echo "insert into auth.users(id,email,email_confirmed_at) values ('$id','d3-race-${id: -2}@resbite-test.invalid',now());
insert into public.profiles(id,display_name) values ('$id','$name');"
}

# (1) Two hosts deleting at once, each having written in the other's Edit-stopped group, three times.
for run in 1 2 3; do
 X="$(u ${run}1)"; Y="$(u ${run}2)"; PX="$(p ${run}1)"; PY="$(p ${run}2)"
 "$pg_bin/psql" "${args[@]}" >"$socket/account-deletion-concurrency-seed1-$run.log" <<SQL
$(person "$X" 'Xan Host')
$(person "$Y" 'Yas Host')
insert into auth.sessions(id,user_id,created_at) values ('$(s ${run}1)','$X',now()),('$(s ${run}2)','$Y',now());
insert into public.connections(user_a,user_b,state,requested_by,accepted_at)
 values (least('$X'::uuid,'$Y'::uuid),greatest('$X'::uuid,'$Y'::uuid),'connected','$X',now());
select set_config('resbite.system','roll',false);
insert into public.plans(id,owner_id,title,starts_at,ends_at,time_zone,place_label,categories,repeat_weeks) values
 ('$PX','$X','X choir',now()+interval '3 days',now()+interval '3 days 2 hours','UTC','Hall',array['community'],1),
 ('$PY','$Y','Y choir',now()+interval '4 days',now()+interval '4 days 2 hours','UTC','Hall',array['community'],1);
-- Edit → "Doesn't repeat": each group stops, its occurrence still ahead.
update public.plans set repeat_weeks=null where id in ('$PX','$PY');
insert into public.attendees(plan_id,user_id,response) values ('$PX','$Y','accepted'),('$PY','$X','accepted');
select set_config('resbite.system','',false);
insert into public.messages(series_id,plan_id,author_id,kind,body,client_id) values
 ('$PY','$PY','$X','message','From X','$(m ${run}1)'),('$PX','$PX','$Y','message','From Y','$(m ${run}2)');
do \$\$ begin
 if (select count(*) from public.chats where series_id in ('$PX','$PY') and is_group and stopped_at is not null)<>2
 or exists(select 1 from public.plans where id in ('$PX','$PY') and (repeat_weeks is not null or status<>'active' or starts_at<=now())) then
  raise exception 'The race''s two groups are not stopped by Edit with an occurrence ahead';
 end if;
end \$\$;
SQL
 PGAPPNAME=resbite_d3_hold1 "$pg_bin/psql" "${args[@]}" >"$socket/account-deletion-concurrency-hold1-$run.log" 2>&1 <<SQL &
begin;
select 1 from public.connections where (user_a,user_b)=(least('$X'::uuid,'$Y'::uuid),greatest('$X'::uuid,'$Y'::uuid)) for update;
select pg_sleep(2);
commit;
SQL
 hold_pid=$!
 wait_for resbite_d3_hold1 "wait_event='PgSleep'" 'The connection row holder did not become ready'
 PGAPPNAME=resbite_d3_delete_x "$pg_bin/psql" "${args[@]}" >"$socket/account-deletion-concurrency-x-$run.log" 2>&1 <<SQL &
\\set VERBOSITY verbose
select private.request_account_deletion('$X','$(s ${run}1)','$(r ${run}1)',repeat('a',64));
SQL
 x_pid=$!
 wait_for resbite_d3_delete_x "wait_event_type='Lock' and $(on_row_of public.connections)" "X's deletion did not wait on the connection row"
 PGAPPNAME=resbite_d3_delete_y "$pg_bin/psql" "${args[@]}" >"$socket/account-deletion-concurrency-y-$run.log" 2>&1 <<SQL &
\\set VERBOSITY verbose
select private.request_account_deletion('$Y','$(s ${run}2)','$(r ${run}2)',repeat('b',64));
SQL
 y_pid=$!
 wait_for resbite_d3_delete_y "wait_event_type='Lock' and wait_event='advisory'" "Y's deletion did not wait on the deletions' lock"
 hold_status=0; x_status=0; y_status=0
 wait "$hold_pid" || hold_status=$?
 wait "$x_pid" || x_status=$?
 wait "$y_pid" || y_status=$?
 no_deadlock "Two hosts deleting at once (run $run)" "$socket/account-deletion-concurrency-x-$run.log" "$socket/account-deletion-concurrency-y-$run.log"
 if [[ "$hold_status" != 0 || "$x_status" != 0 || "$y_status" != 0 ]] \
   || [[ "$("$pg_bin/psql" "${args[@]}" -Atc "select count(*) from private.account_deletion_jobs where user_id in ('$X','$Y')")" != 2 ]]; then
  cat "$socket/account-deletion-concurrency-x-$run.log" "$socket/account-deletion-concurrency-y-$run.log"
  echo "FAIL: two account deletions at once (run $run) did not both go through"; exit 1
 fi
done
echo "PASS: two account deletions at once, each owning an Edit-stopped group and each having written in the other's, both go through (3 runs, no deadlock)"

# (2) A deletion racing a send in the host's group.
H="$(u 41)"; G="$(u 42)"; PH="$(p 41)"
"$pg_bin/psql" "${args[@]}" >"$socket/account-deletion-concurrency-seed2.log" <<SQL
$(person "$H" 'Hil Host')
$(person "$G" 'Gil Guest')
insert into auth.sessions(id,user_id,created_at) values ('$(s 41)','$H',now());
insert into private.chat_rules_acceptances(user_id,version) values ('$G',private.chat_rules_version());
select set_config('resbite.system','roll',false);
insert into public.plans(id,owner_id,title,starts_at,ends_at,time_zone,place_label,categories,repeat_weeks) values
 ('$PH','$H','H swim',now()+interval '2 days',now()+interval '2 days 2 hours','UTC','Pool',array['physical'],1);
insert into public.attendees(plan_id,user_id,response) values ('$PH','$G','accepted');
select set_config('resbite.system','',false);
do \$\$ begin
 if not exists(select 1 from public.chats where series_id='$PH' and is_group and stopped_at is null) then
  raise exception 'The race''s group is not running';
 end if;
end \$\$;
SQL
PGAPPNAME=resbite_d3_hold2 "$pg_bin/psql" "${args[@]}" >"$socket/account-deletion-concurrency-hold2.log" 2>&1 <<SQL &
begin;
select 1 from public.chats where series_id='$PH' for update;
select pg_sleep(2);
commit;
SQL
hold_pid=$!
wait_for resbite_d3_hold2 "wait_event='PgSleep'" 'The chat row holder did not become ready'
PGAPPNAME=resbite_d3_send "$pg_bin/psql" "${args[@]}" >"$socket/account-deletion-concurrency-send.log" 2>&1 <<SQL &
\\set VERBOSITY verbose
begin;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"$G","role":"authenticated"}',true);
select public.send_message('$PH','Still on for Thursday?','$(m 42)');
commit;
SQL
send_pid=$!
wait_for resbite_d3_send "wait_event_type='Lock' and $(on_row_of public.chats)" "G's send did not wait on the chat row"
PGAPPNAME=resbite_d3_delete_h "$pg_bin/psql" "${args[@]}" >"$socket/account-deletion-concurrency-h.log" 2>&1 <<SQL &
\\set VERBOSITY verbose
select private.request_account_deletion('$H','$(s 41)','$(r 41)',repeat('c',64));
SQL
h_pid=$!
wait_for resbite_d3_delete_h "wait_event_type='Lock' and $(on_row_of public.plans)" "H's deletion did not wait on the plan"
hold_status=0; send_status=0; h_status=0
wait "$hold_pid" || hold_status=$?
wait "$send_pid" || send_status=$?
wait "$h_pid" || h_status=$?
no_deadlock "A deletion racing a send in the host's group" "$socket/account-deletion-concurrency-send.log" "$socket/account-deletion-concurrency-h.log"
if [[ "$hold_status" != 0 || "$send_status" != 0 || "$h_status" != 0 ]]; then
 cat "$socket/account-deletion-concurrency-send.log" "$socket/account-deletion-concurrency-h.log"
 echo "FAIL: a deletion racing a send in the host's group did not both go through"; exit 1
fi
"$pg_bin/psql" "${args[@]}" >"$socket/account-deletion-concurrency-verify2.log" <<SQL
do \$\$ begin
 if (select body from public.messages where author_id='$G' and client_id='$(m 42)') is distinct from 'Still on for Thursday?' then
  raise exception 'FAIL: G''s message was not stored with its words';
 end if;
 if not exists(select 1 from private.account_deletion_jobs where user_id='$H')
 or (select stopped_at from public.chats where series_id='$PH') is null then
  raise exception 'FAIL: H''s deletion was not recorded, or the group''s chat did not stop';
 end if;
end \$\$;
SQL
echo "PASS: an account deletion racing a send in the host's group waits on the plan, after the send: no deadlock, the message stored, the group stopped"

# Cleanup: the plans (their guest rows, messages and notices go with them), the chat rows, the deletion jobs, the
# broadcasts, and the people (their profiles, sessions, connections and acceptances go with them).
"$pg_bin/psql" "${args[@]}" >"$socket/account-deletion-concurrency-cleanup.log" <<'SQL'
delete from public.plans where series_id::text like 'd3b00000-%';
delete from public.chats where series_id::text like 'd3b00000-%';
delete from private.account_deletion_jobs where user_id::text like 'd3a00000-%';
delete from realtime.messages where topic like 'chat:d3b00000-%';
delete from auth.users where id::text like 'd3a00000-%';
do $$ begin
 if exists(select 1 from public.plans where series_id::text like 'd3b00000-%' or owner_id::text like 'd3a00000-%')
 or exists(select 1 from public.chats where series_id::text like 'd3b00000-%')
 or exists(select 1 from public.messages where series_id::text like 'd3b00000-%')
 or exists(select 1 from public.profiles where id::text like 'd3a00000-%')
 or exists(select 1 from private.account_deletion_jobs where user_id::text like 'd3a00000-%')
 or exists(select 1 from private.notification_outbox where recipient_id::text like 'd3a00000-%')
 or exists(select 1 from private.chat_rules_acceptances where user_id::text like 'd3a00000-%')
 or exists(select 1 from realtime.messages where topic like 'chat:d3b00000-%') then
  raise exception 'The race''s rows were not cleaned up';
 end if;
end $$;
SQL
