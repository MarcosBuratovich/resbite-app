#!/bin/bash
# Invoke only with the disposable cluster created by scripts/test-database.sh (full mode: the deletion lifecycle is
# local-only). The group flag's locks against account deletion and the roll (plan docs/superpowers/plans/2026-11-11-chat-2-groups.md,
# Task 1; ruling GR2, D1). Chat core's deletion takes the chat rows it needs in one pass, in series order, after its plan
# loop (H28), so nothing it does before that pass may take a chat row a second deletion, or the roll, could need. It
# commits rows across sessions, so its ids have the prefix e8 (e8a… people, e8b… plans, e8c… sessions, e8d… deletion
# requests) and it deletes its plans, chat rows and people at the end.
# (0) A cancelled one-off takes no chat row. A session cancels a one-off under the deletion's flag (as the deletion's
# plan loop does: no line) and holds; another takes that chat's row nowait. Expected: free.
# (1) Two account deletions at once, three times. X and Y each own a future one-off and each wrote in the other's chat.
# A session holds the X–Y connection row, which both deletions delete after their plan loop, so both wait there; when
# it lets go, each takes the chat row of the series it wrote in. Expected: no 40P01, both deletions recorded.
# (2) The roll racing a deletion. D wrote in two groups' chats: A (series e8b…41, its current occurrence e8b…49, owned
# by O2) and B (e8b…45, owned by O1), both just ended, so the roll takes B's occurrence before A's (plan order) while the
# deletion takes A's chat row before B's (series order). A session holds O2's profile row, so the roll, having rolled B,
# waits on the key check of A's next occurrence (its owner), which runs before the group trigger; the deletion runs
# meanwhile; the hold lets go and the roll goes on to A. Expected: the roll takes no running group's chat row, so no
# deadlock: both groups rolled, the deletion recorded, D's words gone.
# The seed's guest rows are the cast, not answers, so they are made under the roll's flag and write no chat line.
set -euo pipefail
pg_bin="$1"
socket="$2"
port="$3"
args=(-X -v ON_ERROR_STOP=1 -h "$socket" -p "$port" -U postgres -d postgres)
u() { echo "e8a00000-0000-4000-8000-0000000000$1"; }
p() { echo "e8b00000-0000-4000-8000-0000000000$1"; }
s() { echo "e8c00000-0000-4000-8000-0000000000$1"; }
r() { echo "e8d00000-0000-4000-8000-0000000000$1"; }
wait_for() {
 local app="$1" condition="$2" what="$3"
 for attempt in {1..100}; do
  if [[ "$("$pg_bin/psql" "${args[@]}" -Atc "select count(*) from pg_stat_activity where application_name='$app' and $condition")" == 1 ]]; then return 0; fi
  sleep 0.05
 done
 echo "$what"; exit 1
}
# Waits until a session waits on a lock, or has finished.
wait_lock_or_done() {
 local app="$1"
 for attempt in {1..100}; do
  if [[ "$("$pg_bin/psql" "${args[@]}" -Atc "select count(*) from pg_stat_activity where application_name='$app' and state='active' and wait_event_type is distinct from 'Lock'")" == 0 ]]; then return 0; fi
  sleep 0.05
 done
}
person() {
 local id="$1" name="$2"
 echo "insert into auth.users(id,email,email_confirmed_at) values ('$id','g2-race-${id: -2}@resbite-test.invalid',now());
insert into public.profiles(id,display_name) values ('$id','$name');
insert into private.beta_access(user_id,source) values ('$id','maintainer');"
}

# (0) A one-off cancelled under the deletion's flag, held; its chat row taken nowait.
"$pg_bin/psql" "${args[@]}" >"$socket/chat-groups-concurrency-seed0.log" <<SQL
$(person "$(u 01)" 'Race owner')
insert into public.plans(id,owner_id,title,starts_at,ends_at,time_zone,place_label,categories) values
 ('$(p 01)','$(u 01)','Race picnic',now()+interval '3 days',now()+interval '3 days 2 hours','UTC','Park',array['community']);
SQL
PGAPPNAME=resbite_g2_cancel "$pg_bin/psql" "${args[@]}" >"$socket/chat-groups-concurrency-cancel.log" 2>&1 <<SQL &
begin;
select set_config('resbite.system','deletion',true);
update public.plans set status='cancelled' where id='$(p 01)';
select pg_sleep(1);
rollback;
SQL
cancel_pid=$!
wait_for resbite_g2_cancel "wait_event='PgSleep'" 'The cancelling session did not become ready'
if ! "$pg_bin/psql" "${args[@]}" -Atc "select 'FREE' from public.chats where series_id='$(p 01)' for update nowait" >"$socket/chat-groups-concurrency-nowait.log" 2>&1 \
  || ! grep -q '^FREE$' "$socket/chat-groups-concurrency-nowait.log"; then
 cat "$socket/chat-groups-concurrency-nowait.log"; echo "FAIL: cancelling a one-off took its chat row"; exit 1
fi
wait "$cancel_pid" || { cat "$socket/chat-groups-concurrency-cancel.log"; exit 1; }
echo "PASS: a one-off cancelled under the deletion's flag takes no chat row"

# (1) Two account deletions at once, three times.
for run in 1 2 3; do
 X="$(u ${run}1)"; Y="$(u ${run}2)"; PX="$(p ${run}1)"; PY="$(p ${run}2)"
 "$pg_bin/psql" "${args[@]}" >"$socket/chat-groups-concurrency-seed1-$run.log" <<SQL
$(person "$X" 'Xan Leaving')
$(person "$Y" 'Yas Leaving')
insert into auth.sessions(id,user_id,created_at) values ('$(s ${run}1)','$X',now()),('$(s ${run}2)','$Y',now());
insert into public.connections(user_a,user_b,state,requested_by,accepted_at)
 values (least('$X'::uuid,'$Y'::uuid),greatest('$X'::uuid,'$Y'::uuid),'connected','$X',now());
insert into public.plans(id,owner_id,title,starts_at,ends_at,time_zone,place_label,categories) values
 ('$PX','$X','X picnic',now()+interval '3 days',now()+interval '3 days 2 hours','UTC','Park',array['community']),
 ('$PY','$Y','Y picnic',now()+interval '4 days',now()+interval '4 days 2 hours','UTC','Park',array['community']);
select set_config('resbite.system','roll',false);
insert into public.attendees(plan_id,user_id,response) values ('$PX','$Y','accepted'),('$PY','$X','accepted');
select set_config('resbite.system','',false);
insert into public.messages(series_id,plan_id,author_id,kind,body) values ('$PY','$PY','$X','message','From X'),('$PX','$PX','$Y','message','From Y');
SQL
 PGAPPNAME=resbite_g2_hold "$pg_bin/psql" "${args[@]}" >"$socket/chat-groups-concurrency-hold1-$run.log" 2>&1 <<SQL &
begin;
select 1 from public.connections where (user_a,user_b)=(least('$X'::uuid,'$Y'::uuid),greatest('$X'::uuid,'$Y'::uuid)) for update;
select pg_sleep(2);
commit;
SQL
 hold_pid=$!
 wait_for resbite_g2_hold "wait_event='PgSleep'" 'The connection row holder did not become ready'
 PGAPPNAME=resbite_g2_delete_x "$pg_bin/psql" "${args[@]}" >"$socket/chat-groups-concurrency-x-$run.log" 2>&1 <<SQL &
\\set VERBOSITY verbose
select private.request_account_deletion('$X','$(s ${run}1)','$(r ${run}1)',repeat('a',64));
SQL
 x_pid=$!
 wait_for resbite_g2_delete_x "wait_event_type='Lock'" "X's deletion did not wait on the connection row"
 PGAPPNAME=resbite_g2_delete_y "$pg_bin/psql" "${args[@]}" >"$socket/chat-groups-concurrency-y-$run.log" 2>&1 <<SQL &
\\set VERBOSITY verbose
select private.request_account_deletion('$Y','$(s ${run}2)','$(r ${run}2)',repeat('b',64));
SQL
 y_pid=$!
 wait_for resbite_g2_delete_y "wait_event_type='Lock'" "Y's deletion did not wait on the connection row"
 hold_status=0; x_status=0; y_status=0
 wait "$hold_pid" || hold_status=$?
 wait "$x_pid" || x_status=$?
 wait "$y_pid" || y_status=$?
 if [[ "$hold_status" != 0 || "$x_status" != 0 || "$y_status" != 0 ]] \
   || grep -q -E '40P01|deadlock' "$socket/chat-groups-concurrency-x-$run.log" "$socket/chat-groups-concurrency-y-$run.log" \
   || [[ "$("$pg_bin/psql" "${args[@]}" -Atc "select count(*) from private.account_deletion_jobs where user_id in ('$X','$Y')")" != 2 ]]; then
  cat "$socket/chat-groups-concurrency-x-$run.log" "$socket/chat-groups-concurrency-y-$run.log"
  echo "FAIL: two account deletions at once (run $run) did not both go through"; exit 1
 fi
done
echo "PASS: two account deletions at once, each owning a one-off and each having written in the other's chat, both go through (3 runs, no deadlock)"

# (2) The roll racing a deletion.
D="$(u 41)"; O1="$(u 42)"; O2="$(u 43)"; SA="$(p 41)"; SB="$(p 45)"; PA2="$(p 49)"
"$pg_bin/psql" "${args[@]}" >"$socket/chat-groups-concurrency-seed2.log" <<SQL
$(person "$D" 'Dee Leaving')
$(person "$O1" 'Oli Owner')
$(person "$O2" 'Ola Owner')
insert into auth.sessions(id,user_id,created_at) values ('$(s 41)','$D',now());
insert into public.plans(id,owner_id,title,starts_at,ends_at,time_zone,place_label,categories,repeat_weeks) values
 ('$SA','$O2','Race choir',now()-interval '7 days 2 hours',now()-interval '7 days 1 hour','UTC','Hall',array['community'],1),
 ('$SB','$O1','Race swim',now()-interval '2 hours',now()-interval '1 hour','UTC','Pool',array['physical'],1);
insert into public.plans(id,owner_id,title,starts_at,ends_at,time_zone,place_label,categories,repeat_weeks,series_id,repeats_from) values
 ('$PA2','$O2','Race choir',now()-interval '2 hours',now()-interval '1 hour','UTC','Hall',array['community'],1,'$SA','$SA');
select set_config('resbite.system','roll',false);
insert into public.attendees(plan_id,user_id,response) values ('$PA2','$D','accepted'),('$SB','$D','accepted');
select set_config('resbite.system','',false);
insert into public.messages(series_id,plan_id,author_id,kind,body) values ('$SA','$PA2','$D','message','Sing on'),('$SB','$SB','$D','message','Swim on');
do \$\$ begin
 if (select count(*) from public.chats where series_id in ('$SA','$SB') and is_group and stopped_at is null)<>2 then
  raise exception 'The race''s two series are not running groups';
 end if;
end \$\$;
SQL
PGAPPNAME=resbite_g2_block "$pg_bin/psql" "${args[@]}" >"$socket/chat-groups-concurrency-block.log" 2>&1 <<SQL &
begin;
select 1 from public.profiles where id='$O2' for update;
select pg_sleep(2);
commit;
SQL
block_pid=$!
wait_for resbite_g2_block "wait_event='PgSleep'" 'The blocking session did not become ready'
PGAPPNAME=resbite_g2_roll "$pg_bin/psql" "${args[@]}" -At >"$socket/chat-groups-concurrency-roll.log" 2>&1 <<'SQL' &
\set VERBOSITY verbose
select set_config('resbite.system','roll',false);
select 'ROLLED '||private.roll_repeating_plans();
SQL
roll_pid=$!
wait_for resbite_g2_roll "wait_event_type='Lock'" "The roll did not wait on the key check of A's next occurrence"
PGAPPNAME=resbite_g2_delete_d "$pg_bin/psql" "${args[@]}" >"$socket/chat-groups-concurrency-d.log" 2>&1 <<SQL &
\\set VERBOSITY verbose
select private.request_account_deletion('$D','$(s 41)','$(r 41)',repeat('d',64));
SQL
d_pid=$!
wait_lock_or_done resbite_g2_delete_d
block_status=0; roll_status=0; d_status=0
wait "$block_pid" || block_status=$?
wait "$roll_pid" || roll_status=$?
wait "$d_pid" || d_status=$?
if [[ "$block_status" != 0 || "$roll_status" != 0 || "$d_status" != 0 ]] \
  || grep -q -E '40P01|deadlock' "$socket/chat-groups-concurrency-roll.log" "$socket/chat-groups-concurrency-d.log"; then
 cat "$socket/chat-groups-concurrency-roll.log" "$socket/chat-groups-concurrency-d.log"
 echo "FAIL: the roll and a deletion at once deadlocked, or one failed"; exit 1
fi
"$pg_bin/psql" "${args[@]}" >"$socket/chat-groups-concurrency-verify2.log" <<SQL
do \$\$ begin
 if (select count(*) from public.plans where repeats_from in ('$SB','$PA2'))<>2 then
  raise exception 'FAIL: the roll did not roll both groups';
 end if;
 if not exists(select 1 from private.account_deletion_jobs where user_id='$D')
 or exists(select 1 from public.messages where series_id in ('$SA','$SB') and (author_id is not null or state<>'deleted')) then
  raise exception 'FAIL: the deletion was not recorded, or D''s words stayed';
 end if;
end \$\$;
SQL
echo "PASS: the roll racing an account deletion takes no running group's chat row: both groups roll, the deletion goes through"

# Cleanup: the plans (their guest rows, admins and messages go with them), the chat rows, the deletion jobs, the
# broadcasts, and the people (their profiles, grants, sessions and connections go with them).
"$pg_bin/psql" "${args[@]}" >"$socket/chat-groups-concurrency-cleanup.log" <<'SQL'
delete from public.plans where series_id::text like 'e8b00000-%';
delete from public.chats where series_id::text like 'e8b00000-%';
delete from private.account_deletion_jobs where user_id::text like 'e8a00000-%';
delete from realtime.messages where topic like 'chat:e8b00000-%';
delete from auth.users where id::text like 'e8a00000-%';
do $$ begin
 if exists(select 1 from public.plans where series_id::text like 'e8b00000-%' or owner_id::text like 'e8a00000-%')
 or exists(select 1 from public.chats where series_id::text like 'e8b00000-%')
 or exists(select 1 from public.messages where series_id::text like 'e8b00000-%')
 or exists(select 1 from public.profiles where id::text like 'e8a00000-%')
 or exists(select 1 from private.account_deletion_jobs where user_id::text like 'e8a00000-%')
 or exists(select 1 from private.notification_outbox where recipient_id::text like 'e8a00000-%')
 or exists(select 1 from realtime.messages where topic like 'chat:e8b00000-%') then
  raise exception 'The race''s rows were not cleaned up';
 end if;
end $$;
SQL
