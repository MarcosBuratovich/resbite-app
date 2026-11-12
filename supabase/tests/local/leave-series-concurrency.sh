#!/bin/bash
# Invoke only with the disposable cluster created by scripts/test-database.sh (full mode: require_tester takes the
# caller's lock there, as decide-join-concurrency.sh relies on). Leaving a group while something else happens to it
# (plan docs/superpowers/plans/2026-11-11-chat-2-groups.md, Task 2; G-S5, Review Focus 4, ruling GR2 Q3). leave_series
# takes the series' current occurrence's plan row for update (the lock the roll and invite_contacts hold; for update,
# not for no key update, since an insert's foreign-key check takes key share), then resolves the current occurrence
# again and locks the new one when the roll made it meanwhile. The roll reads the leave record while holding the plan
# row it rolls. So each race ends with the person in (a guest row, no leave) or out (no guest row, a leave), never a row
# and a leave. It commits rows across sessions, so its ids have the prefix e8 (e8e… people, e8f… plans; chat-groups-
# concurrency.sh has e8a… to e8d…), and it deletes its plans, chat rows and people at the end.
# (1) The roll first. R1, a weekly group that has just ended: owner 01, admin 02 (Going), 03 Going, 04 Going. Session A,
# as postgres with no flag of its own, rolls and holds its transaction open; session B, 04, leaves once A holds the row
# lock. Expected: one new occurrence; 04 has no row on it, a leave, and is out of the chat. The new occurrence carries
# 02 and 03 with no joined line and no admin line: A set no flag, so only the roll's own set_config can silence them
# (I1).
# (2) The leave first, on R2 (seeded after (1), so (1)'s roll leaves it alone): 04 leaves R2, just ended, and holds the
# transaction open. The roll skips R2 (it returns 0). A second roll after the leave commits makes R2's next occurrence
# without 04, whose row on R2 stays (a real attendance) with the leave.
# (3) A host's invitation (invite_contacts): V, a running weekly group. (3a) 04 leaves V and holds; 01 invites 04 in
# the app, which waits on V's row, then finds 04 gone: 'app', a row, the leave cleared (in). (3b) 01's invitation of 04
# (already on V: 'already') holds; 04 leaves, which waits, then goes: no row, a leave (out).
# (4) A guest row inserted (any way in): G, a running weekly group. (4a) 03 leaves G and holds; a guest row for 03 is
# inserted, which waits, then lands and clears the leave (in). (4b) A guest row for 05 (not on G) is inserted and held;
# 05 leaves, which waits on G's row (the insert's key share), then finds the row: no row, a leave (out). Without the
# for update (with for no key update) the leave would not wait, and would be refused 'Not in this group'.
set -euo pipefail
pg_bin="$1"
socket="$2"
port="$3"
args=(-X -v ON_ERROR_STOP=1 -h "$socket" -p "$port" -U postgres -d postgres)
u() { echo "e8e00000-0000-4000-8000-0000000000$1"; }
p() { echo "e8f00000-0000-4000-8000-0000000000$1"; }
wait_for() {
 local app="$1" condition="$2" what="$3"
 for attempt in {1..100}; do
  if [[ "$("$pg_bin/psql" "${args[@]}" -Atc "select count(*) from pg_stat_activity where application_name='$app' and $condition")" == 1 ]]; then return 0; fi
  sleep 0.05
 done
 echo "FAIL: $what"; exit 1
}
q() { "$pg_bin/psql" "${args[@]}" -Atc "$1"; }
person() {
 local id="$1" name="$2"
 echo "insert into auth.users(id,email,email_confirmed_at) values ('$id','g2-leave-${id: -2}@resbite-test.invalid',now());
insert into public.profiles(id,display_name) values ('$id','$name');
insert into private.beta_access(user_id,source) values ('$id','maintainer');
insert into private.app_sessions(user_id) values ('$id');"
}
# A weekly plan of 01's (a group from its insert on), its times given.
weekly() {
 local id="$1" title="$2" starts="$3" ends="$4"
 echo "insert into public.plans(id,owner_id,title,starts_at,ends_at,time_zone,place_label,categories,repeat_weeks) values
 ('$id','$(u 01)','$title',$starts,$ends,'UTC','Hall',array['community'],1);"
}
# Signed in as someone, in a session of its own (role authenticated, the claims).
as() { echo "set role authenticated; select set_config('request.jwt.claims','{\"sub\":\"$1\",\"role\":\"authenticated\"}',false);"; }

"$pg_bin/psql" "${args[@]}" >"$socket/leave-concurrency-seed.log" <<SQL
$(person "$(u 01)" 'Lea Owner')
$(person "$(u 02)" 'Lou Admin')
$(person "$(u 03)" 'Liv Going')
$(person "$(u 04)" 'Lex Leaving')
$(person "$(u 05)" 'Len Late')
insert into public.connections(user_a,user_b,state,requested_by,accepted_at)
 values (least('$(u 01)'::uuid,'$(u 04)'::uuid),greatest('$(u 01)'::uuid,'$(u 04)'::uuid),'connected','$(u 01)',now());
$(weekly "$(p 01)" 'Leave race one' "now()-interval '2 hours'" "now()-interval '1 hour'")
$(weekly "$(p 31)" 'Leave race invite' "now()+interval '3 days'" "now()+interval '3 days 2 hours'")
$(weekly "$(p 41)" 'Leave race insert' "now()+interval '4 days'" "now()+interval '4 days 2 hours'")
-- The cast's rows are made under the roll's flag: they are the cast, not answers, so they write no line.
select set_config('resbite.system','roll',false);
insert into public.attendees(plan_id,user_id,response) values
 ('$(p 01)','$(u 02)','accepted'),('$(p 01)','$(u 03)','accepted'),('$(p 01)','$(u 04)','accepted'),
 ('$(p 31)','$(u 04)','accepted'),('$(p 41)','$(u 03)','accepted');
insert into public.plan_admins(plan_id,user_id,appointed_by) values ('$(p 01)','$(u 02)','$(u 01)');
select set_config('resbite.system','',false);
do \$\$ begin
 if (select count(*) from public.chats where series_id in ('$(p 01)','$(p 31)','$(p 41)') and is_group and stopped_at is null)<>3 then
  raise exception 'The race''s plans are not running groups';
 end if;
end \$\$;
SQL

# (1) The roll first.
PGAPPNAME=resbite_g2l_roll "$pg_bin/psql" "${args[@]}" -At >"$socket/leave-concurrency-roll1.log" 2>&1 <<'SQL' &
begin;
select 'ROLLED '||private.roll_repeating_plans();
select pg_sleep(1);
commit;
SQL
roll_pid=$!
wait_for resbite_g2l_roll "wait_event='PgSleep'" 'The roll did not hold its transaction open'
PGAPPNAME=resbite_g2l_leave "$pg_bin/psql" "${args[@]}" -At >"$socket/leave-concurrency-leave1.log" 2>&1 <<SQL &
\\set VERBOSITY verbose
$(as "$(u 04)")
select public.leave_series('$(p 01)');
SQL
leave_pid=$!
wait_for resbite_g2l_leave "wait_event_type='Lock'" "04's leave did not wait on the roll's row lock"
roll_status=0; leave_status=0
wait "$roll_pid" || roll_status=$?
wait "$leave_pid" || leave_status=$?
if [[ "$roll_status" != 0 || "$leave_status" != 0 ]]; then
 cat "$socket/leave-concurrency-roll1.log" "$socket/leave-concurrency-leave1.log"; echo "FAIL: the roll or the leave failed"; exit 1
fi
"$pg_bin/psql" "${args[@]}" >"$socket/leave-concurrency-verify1.log" <<SQL
do \$\$ declare v_new uuid := (select id from public.plans where repeats_from='$(p 01)'); begin
 if (select count(*) from public.plans where series_id='$(p 01)')<>2 or v_new is null then
  raise exception 'FAIL: the roll did not make one new occurrence';
 end if;
 if exists(select 1 from public.attendees where plan_id=v_new and user_id='$(u 04)')
 or not exists(select 1 from private.series_leaves where series_id='$(p 01)' and user_id='$(u 04)')
 or private.chat_member('$(p 01)','$(u 04)') then
  raise exception 'FAIL: 04, who left while the roll ran, has a row on the new occurrence, no leave, or is in the chat';
 end if;
 if (select string_agg(right(user_id::text,2),',' order by user_id) from public.attendees where plan_id=v_new)<>'02,03'
 or not exists(select 1 from public.plan_admins where plan_id=v_new and user_id='$(u 02)') then
  raise exception 'FAIL: the roll did not carry 02 (an admin) and 03';
 end if;
 if exists(select 1 from public.messages where plan_id=v_new and event in ('joined','admin'))
 or not exists(select 1 from public.messages where plan_id=v_new and event='next') then
  raise exception 'FAIL: the roll wrote a joined or admin line, or no next line: %',
   (select string_agg(event,',' order by id) from public.messages where series_id='$(p 01)');
 end if;
end \$\$;
SQL
grep -q '^ROLLED 1$' "$socket/leave-concurrency-roll1.log" || { cat "$socket/leave-concurrency-roll1.log"; echo "FAIL: the roll did not roll R1 alone"; exit 1; }
echo "PASS: a member who leaves while the roll runs is not carried, and the roll's own flag silences its joined and admin lines"

# (2) The leave first, on R2, seeded now.
"$pg_bin/psql" "${args[@]}" >"$socket/leave-concurrency-seed2.log" <<SQL
$(weekly "$(p 21)" 'Leave race two' "now()-interval '2 hours'" "now()-interval '1 hour'")
select set_config('resbite.system','roll',false);
insert into public.attendees(plan_id,user_id,response) values ('$(p 21)','$(u 03)','accepted'),('$(p 21)','$(u 04)','accepted');
select set_config('resbite.system','',false);
SQL
PGAPPNAME=resbite_g2l_leave2 "$pg_bin/psql" "${args[@]}" -At >"$socket/leave-concurrency-leave2.log" 2>&1 <<SQL &
\\set VERBOSITY verbose
begin;
$(as "$(u 04)")
select public.leave_series('$(p 21)');
select pg_sleep(1);
commit;
SQL
leave_pid=$!
wait_for resbite_g2l_leave2 "wait_event='PgSleep'" "04's leave did not hold its transaction open"
first="$(q "select 'ROLLED '||private.roll_repeating_plans()")"
leave_status=0
wait "$leave_pid" || leave_status=$?
[[ "$leave_status" == 0 ]] || { cat "$socket/leave-concurrency-leave2.log"; echo "FAIL: the leave failed"; exit 1; }
[[ "$first" == 'ROLLED 0' ]] || { echo "$first"; echo "FAIL: the roll did not skip the plan the leave held"; exit 1; }
second="$(q "select 'ROLLED '||private.roll_repeating_plans()")"
[[ "$second" == 'ROLLED 1' ]] || { echo "$second"; echo "FAIL: the second roll did not roll R2"; exit 1; }
"$pg_bin/psql" "${args[@]}" >"$socket/leave-concurrency-verify2.log" <<SQL
do \$\$ declare v_new uuid := (select id from public.plans where repeats_from='$(p 21)'); begin
 if v_new is null or exists(select 1 from public.attendees where plan_id=v_new and user_id='$(u 04)')
 or not exists(select 1 from public.attendees where plan_id=v_new and user_id='$(u 03)') then
  raise exception 'FAIL: R2''s next occurrence is missing, carries 04, or lost 03';
 end if;
 if not exists(select 1 from public.attendees where plan_id='$(p 21)' and user_id='$(u 04)')
 or not exists(select 1 from private.series_leaves where series_id='$(p 21)' and user_id='$(u 04)')
 or private.chat_member('$(p 21)','$(u 04)') then
  raise exception 'FAIL: 04, who left after the end, lost the row on R2, has no leave, or is in the chat';
 end if;
end \$\$;
SQL
echo "PASS: the roll skips a plan whose leave holds it, then rolls it without the leaver"

# (3a) 04 leaves V and holds; 01's invitation waits, then brings 04 back: 'app', a row, no leave.
PGAPPNAME=resbite_g2l_leave3 "$pg_bin/psql" "${args[@]}" -At >"$socket/leave-concurrency-leave3.log" 2>&1 <<SQL &
\\set VERBOSITY verbose
begin;
$(as "$(u 04)")
select public.leave_series('$(p 31)');
select pg_sleep(1);
commit;
SQL
leave_pid=$!
wait_for resbite_g2l_leave3 "wait_event='PgSleep'" "04's leave of V did not hold its transaction open"
PGAPPNAME=resbite_g2l_invite3 "$pg_bin/psql" "${args[@]}" -At >"$socket/leave-concurrency-invite3.log" 2>&1 <<SQL &
\\set VERBOSITY verbose
$(as "$(u 01)")
select 'KIND '||(public.invite_contacts('$(p 31)',jsonb_build_array(jsonb_build_object('user','$(u 04)')))->0->>'kind');
SQL
invite_pid=$!
wait_for resbite_g2l_invite3 "wait_event_type='Lock'" "01's invitation did not wait on the leave's row lock"
leave_status=0; invite_status=0
wait "$leave_pid" || leave_status=$?
wait "$invite_pid" || invite_status=$?
if [[ "$leave_status" != 0 || "$invite_status" != 0 ]] || ! grep -q '^KIND app$' "$socket/leave-concurrency-invite3.log" \
  || [[ "$(q "select exists(select 1 from public.attendees where plan_id='$(p 31)' and user_id='$(u 04)')::text||','||exists(select 1 from private.series_leaves where series_id='$(p 31)' and user_id='$(u 04)')::text")" != 'true,false' ]]; then
 cat "$socket/leave-concurrency-leave3.log" "$socket/leave-concurrency-invite3.log"; echo "FAIL: an invitation racing a leave did not bring 04 back"; exit 1
fi
# (3b) 01's invitation holds; 04's leave waits, then takes 04 out: no row, a leave.
PGAPPNAME=resbite_g2l_invite3b "$pg_bin/psql" "${args[@]}" -At >"$socket/leave-concurrency-invite3b.log" 2>&1 <<SQL &
\\set VERBOSITY verbose
begin;
$(as "$(u 01)")
select 'KIND '||(public.invite_contacts('$(p 31)',jsonb_build_array(jsonb_build_object('user','$(u 04)')))->0->>'kind');
select pg_sleep(1);
commit;
SQL
invite_pid=$!
wait_for resbite_g2l_invite3b "wait_event='PgSleep'" "01's invitation did not hold its transaction open"
PGAPPNAME=resbite_g2l_leave3b "$pg_bin/psql" "${args[@]}" -At >"$socket/leave-concurrency-leave3b.log" 2>&1 <<SQL &
\\set VERBOSITY verbose
$(as "$(u 04)")
select public.leave_series('$(p 31)');
SQL
leave_pid=$!
wait_for resbite_g2l_leave3b "wait_event_type='Lock'" "04's leave did not wait on the invitation's row lock"
leave_status=0; invite_status=0
wait "$invite_pid" || invite_status=$?
wait "$leave_pid" || leave_status=$?
if [[ "$leave_status" != 0 || "$invite_status" != 0 ]] || ! grep -q '^KIND already$' "$socket/leave-concurrency-invite3b.log" \
  || [[ "$(q "select exists(select 1 from public.attendees where plan_id='$(p 31)' and user_id='$(u 04)')::text||','||exists(select 1 from private.series_leaves where series_id='$(p 31)' and user_id='$(u 04)')::text")" != 'false,true' ]]; then
 cat "$socket/leave-concurrency-invite3b.log" "$socket/leave-concurrency-leave3b.log"; echo "FAIL: a leave racing an invitation did not take 04 out"; exit 1
fi
echo "PASS: a leave racing a host's invitation ends with the person in or out, never a row and a leave"

# (4a) 03 leaves G and holds; a guest row for 03 waits, then lands and clears the leave.
PGAPPNAME=resbite_g2l_leave4 "$pg_bin/psql" "${args[@]}" -At >"$socket/leave-concurrency-leave4.log" 2>&1 <<SQL &
\\set VERBOSITY verbose
begin;
$(as "$(u 03)")
select public.leave_series('$(p 41)');
select pg_sleep(1);
commit;
SQL
leave_pid=$!
wait_for resbite_g2l_leave4 "wait_event='PgSleep'" "03's leave of G did not hold its transaction open"
PGAPPNAME=resbite_g2l_insert4 "$pg_bin/psql" "${args[@]}" -At >"$socket/leave-concurrency-insert4.log" 2>&1 <<SQL &
\\set VERBOSITY verbose
insert into public.attendees(plan_id,user_id,response) values ('$(p 41)','$(u 03)','pending');
SQL
insert_pid=$!
wait_for resbite_g2l_insert4 "wait_event_type='Lock'" "The guest row for 03 did not wait on the leave"
leave_status=0; insert_status=0
wait "$leave_pid" || leave_status=$?
wait "$insert_pid" || insert_status=$?
if [[ "$leave_status" != 0 || "$insert_status" != 0 ]] \
  || [[ "$(q "select exists(select 1 from public.attendees where plan_id='$(p 41)' and user_id='$(u 03)')::text||','||exists(select 1 from private.series_leaves where series_id='$(p 41)' and user_id='$(u 03)')::text")" != 'true,false' ]]; then
 cat "$socket/leave-concurrency-leave4.log" "$socket/leave-concurrency-insert4.log"; echo "FAIL: a guest row racing a leave did not bring 03 back"; exit 1
fi
# (4b) A guest row for 05 holds G's key share; 05's leave waits on it, then takes 05 out.
PGAPPNAME=resbite_g2l_insert4b "$pg_bin/psql" "${args[@]}" -At >"$socket/leave-concurrency-insert4b.log" 2>&1 <<SQL &
\\set VERBOSITY verbose
begin;
insert into public.attendees(plan_id,user_id,response) values ('$(p 41)','$(u 05)','pending');
select pg_sleep(1);
commit;
SQL
insert_pid=$!
wait_for resbite_g2l_insert4b "wait_event='PgSleep'" "The guest row for 05 did not hold its transaction open"
PGAPPNAME=resbite_g2l_leave4b "$pg_bin/psql" "${args[@]}" -At >"$socket/leave-concurrency-leave4b.log" 2>&1 <<SQL &
\\set VERBOSITY verbose
$(as "$(u 05)")
select public.leave_series('$(p 41)');
SQL
leave_pid=$!
wait_for resbite_g2l_leave4b "wait_event_type='Lock'" "05's leave did not wait on the guest row's key share (for update)"
leave_status=0; insert_status=0
wait "$insert_pid" || insert_status=$?
wait "$leave_pid" || leave_status=$?
if [[ "$leave_status" != 0 || "$insert_status" != 0 ]] \
  || [[ "$(q "select exists(select 1 from public.attendees where plan_id='$(p 41)' and user_id='$(u 05)')::text||','||exists(select 1 from private.series_leaves where series_id='$(p 41)' and user_id='$(u 05)')::text")" != 'false,true' ]]; then
 cat "$socket/leave-concurrency-insert4b.log" "$socket/leave-concurrency-leave4b.log"; echo "FAIL: a leave racing a guest row did not take 05 out"; exit 1
fi
echo "PASS: a leave racing a guest row ends with the person in or out, never a row and a leave"

# Cleanup: the plans (their guest rows, admins and messages go with them), the chat rows, the broadcasts, and the
# people (their profiles, grants, sessions, connections and leaves go with them).
"$pg_bin/psql" "${args[@]}" >"$socket/leave-concurrency-cleanup.log" <<'SQL'
delete from public.plans where series_id::text like 'e8f00000-%';
delete from public.chats where series_id::text like 'e8f00000-%';
delete from realtime.messages where topic like 'chat:e8f00000-%';
delete from auth.users where id::text like 'e8e00000-%';
do $$ begin
 if exists(select 1 from public.plans where series_id::text like 'e8f00000-%' or owner_id::text like 'e8e00000-%')
 or exists(select 1 from public.chats where series_id::text like 'e8f00000-%')
 or exists(select 1 from public.messages where series_id::text like 'e8f00000-%')
 or exists(select 1 from public.profiles where id::text like 'e8e00000-%')
 or exists(select 1 from private.series_leaves where series_id::text like 'e8f00000-%' or user_id::text like 'e8e00000-%')
 or exists(select 1 from private.app_sessions where user_id::text like 'e8e00000-%')
 or exists(select 1 from private.notification_outbox where recipient_id::text like 'e8e00000-%')
 or exists(select 1 from realtime.messages where topic like 'chat:e8f00000-%') then
  raise exception 'The leave race''s rows were not cleaned up';
 end if;
end $$;
SQL
