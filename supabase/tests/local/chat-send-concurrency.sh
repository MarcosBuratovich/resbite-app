#!/bin/bash
# Invoke only with the disposable cluster created by scripts/test-database.sh (full mode). Chat writes that race
# (plan docs/superpowers/plans/2026-11-11-chat-1-core.md, Task 2; K-B3.1, K-S8, Review Focus 2 and 3). It commits rows
# across sessions, so its ids have the prefix e9 and it deletes its plans, chats rows and users at the end (NOTE 2).
# (1) One phone sends the same message twice at once (the same client id). A third session holds the sender's lock
# (require_tester's, as decide-join-concurrency.sh does), so both sends are waiting when it lets go. Expected: one row,
# both calls return its id, no 23505. (1b) The race the lock hides here, as it runs on hosted, whose require_tester
# takes no lock: a row with that client id is inserted and not yet committed when the send arrives. The send waits on
# the key, then returns that row and tells nobody (send_message's step 7). (2) Two people write in one chat at once. A
# session holds the chat's lock (send_message's, K-B3.1), so both are waiting when it lets go. Expected: everyone else
# in the chat, and each writer, has exactly one chat_message notice (one push a minute, decided under the lock).
set -euo pipefail
pg_bin="$1"
socket="$2"
port="$3"
args=(-X -v ON_ERROR_STOP=1 -h "$socket" -p "$port" -U postgres -d postgres)
"$pg_bin/psql" "${args[@]}" >"$socket/chat-send-concurrency-seed.log" <<'SQL'
insert into auth.users(id,phone,phone_confirmed_at,raw_user_meta_data) values
 ('e9000000-0000-4000-8000-000000000001','447700900991',now(),'{}'),
 ('e9000000-0000-4000-8000-000000000002','447700900992',now(),'{}'),
 ('e9000000-0000-4000-8000-000000000003','447700900993',now(),'{}'),
 ('e9000000-0000-4000-8000-000000000004','447700900994',now(),'{}');
insert into public.profiles(id,display_name) values
 ('e9000000-0000-4000-8000-000000000001','Race host'),('e9000000-0000-4000-8000-000000000002','Race writer one'),
 ('e9000000-0000-4000-8000-000000000003','Race writer two'),('e9000000-0000-4000-8000-000000000004','Race reader');
insert into private.beta_access(user_id,source)
 select ('e9000000-0000-4000-8000-00000000000'||n)::uuid,'maintainer' from generate_series(1,4) n;
-- Two resbites (one for each race, so the first race's notices never hold the second's back), each with the host and
-- the three others Going.
insert into public.plans(id,owner_id,title,starts_at,time_zone,place_label,categories) values
 ('e9100000-0000-4000-8000-000000000001','e9000000-0000-4000-8000-000000000001','Race chat one','2099-08-05 19:00+00','UTC','Somewhere',array['community']),
 ('e9100000-0000-4000-8000-000000000002','e9000000-0000-4000-8000-000000000001','Race chat two','2099-08-06 19:00+00','UTC','Elsewhere',array['community']);
insert into public.attendees(plan_id,user_id,response)
 select p::uuid,('e9000000-0000-4000-8000-00000000000'||n)::uuid,'accepted'
 from unnest(array['e9100000-0000-4000-8000-000000000001','e9100000-0000-4000-8000-000000000002']) p, generate_series(2,4) n;
SQL
wait_for() {
 local app="$1" column="$2" value="$3" what="$4"
 for attempt in {1..60}; do
  if [[ "$("$pg_bin/psql" "${args[@]}" -Atc "select count(*) from pg_stat_activity where application_name='$app' and $column='$value'")" == 1 ]]; then return 0; fi
  sleep 0.05
 done
 echo "$what"; exit 1
}
send() {
 local app="$1" user="$2" plan="$3" body="$4" client="$5"
 PGAPPNAME="$app" "$pg_bin/psql" "${args[@]}" -At >"$socket/$app.log" 2>&1 <<SQL &
\\set VERBOSITY verbose
set role authenticated;
select set_config('request.jwt.claims','{"sub":"$user","role":"authenticated"}',false);
select 'ID '||(public.send_message('$plan','$body','$client')->>'id');
SQL
}
# (1) The writer's lock is held; the same message is sent twice meanwhile.
PGAPPNAME=resbite_chat_hold "$pg_bin/psql" "${args[@]}" >"$socket/chat-send-concurrency-hold.log" 2>&1 <<'SQL' &
begin;
select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('e9000000-0000-4000-8000-000000000002',47));
select pg_sleep(2);
commit;
SQL
hold_pid=$!
wait_for resbite_chat_hold wait_event PgSleep 'The lock holder did not become ready'
send resbite_chat_same_one e9000000-0000-4000-8000-000000000002 e9100000-0000-4000-8000-000000000001 'On my way' e9300000-0000-4000-8000-000000000001
one_pid=$!
wait_for resbite_chat_same_one wait_event advisory 'The first send did not wait'
send resbite_chat_same_two e9000000-0000-4000-8000-000000000002 e9100000-0000-4000-8000-000000000001 'On my way' e9300000-0000-4000-8000-000000000001
two_pid=$!
wait_for resbite_chat_same_two wait_event advisory 'The second send did not wait'
wait "$hold_pid" || { cat "$socket/chat-send-concurrency-hold.log"; exit 1; }
wait "$one_pid" || { cat "$socket/resbite_chat_same_one.log"; echo 'FAIL: the first send failed'; exit 1; }
wait "$two_pid" || { cat "$socket/resbite_chat_same_two.log"; echo 'FAIL: the second send failed'; exit 1; }
first_id="$(grep '^ID ' "$socket/resbite_chat_same_one.log")"
second_id="$(grep '^ID ' "$socket/resbite_chat_same_two.log")"
stored_id="ID $("$pg_bin/psql" "${args[@]}" -Atc "select string_agg(id::text,',') from public.messages where client_id='e9300000-0000-4000-8000-000000000001'")"
if [[ "$first_id" != "$stored_id" || "$second_id" != "$stored_id" ]] || grep -q 23505 "$socket"/resbite_chat_same_*.log; then
 cat "$socket"/resbite_chat_same_*.log; echo "FAIL: the same message twice at once gave $first_id and $second_id, stored $stored_id"; exit 1
fi
echo "PASS: the same message sent twice at once is one row, and both sends return it"
# (1b) A row with the next client id is inserted and held uncommitted; the send with that id waits on the key.
PGAPPNAME=resbite_chat_row "$pg_bin/psql" "${args[@]}" >"$socket/chat-send-concurrency-row.log" 2>&1 <<'SQL' &
begin;
insert into public.messages(series_id,plan_id,author_id,kind,body,client_id) values
 ('e9100000-0000-4000-8000-000000000001','e9100000-0000-4000-8000-000000000001','e9000000-0000-4000-8000-000000000002','message',
  'Sent from the other phone','e9300000-0000-4000-8000-000000000002');
select pg_sleep(1);
commit;
SQL
row_pid=$!
wait_for resbite_chat_row wait_event PgSleep 'The first row was not held'
send resbite_chat_key e9000000-0000-4000-8000-000000000002 e9100000-0000-4000-8000-000000000001 'Sent from this phone' e9300000-0000-4000-8000-000000000002
key_pid=$!
wait_for resbite_chat_key wait_event_type Lock 'The send did not wait on the key'
wait "$row_pid" || { cat "$socket/chat-send-concurrency-row.log"; exit 1; }
wait "$key_pid" || { cat "$socket/resbite_chat_key.log"; echo 'FAIL: the send that met the key failed'; exit 1; }
"$pg_bin/psql" "${args[@]}" -v reply="$(grep '^ID ' "$socket/resbite_chat_key.log" | cut -c4-)" >"$socket/chat-send-concurrency-key.log" <<'SQL'
select set_config('e9.reply',:'reply',false);
do $$ declare v_row public.messages; begin
 select * into v_row from public.messages where client_id='e9300000-0000-4000-8000-000000000002';
 if (select count(*) from public.messages where client_id='e9300000-0000-4000-8000-000000000002')<>1
  or current_setting('e9.reply') is distinct from v_row.id::text or v_row.body<>'Sent from the other phone' then
  raise exception 'FAIL: the send that met the key did not return the row that won';
 end if;
 if exists(select 1 from private.notification_outbox where message_id=v_row.id) then
  raise exception 'FAIL: the send that met the key told someone';
 end if;
end $$;
SQL
echo "PASS: a send that meets its own message committing at once returns that row and tells nobody"
# (2) The chat's lock is held; two people write meanwhile.
PGAPPNAME=resbite_chat_hold2 "$pg_bin/psql" "${args[@]}" >"$socket/chat-send-concurrency-hold2.log" 2>&1 <<'SQL' &
begin;
select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('chat:e9100000-0000-4000-8000-000000000002',0));
select pg_sleep(2);
commit;
SQL
hold_pid=$!
wait_for resbite_chat_hold2 wait_event PgSleep 'The chat lock holder did not become ready'
send resbite_chat_writer_one e9000000-0000-4000-8000-000000000002 e9100000-0000-4000-8000-000000000002 'First!' e9300000-0000-4000-8000-000000000003
one_pid=$!
wait_for resbite_chat_writer_one wait_event advisory "Writer one's send did not wait on the chat"
send resbite_chat_writer_two e9000000-0000-4000-8000-000000000003 e9100000-0000-4000-8000-000000000002 'No, me!' e9300000-0000-4000-8000-000000000004
two_pid=$!
wait_for resbite_chat_writer_two wait_event advisory "Writer two's send did not wait on the chat"
wait "$hold_pid" || { cat "$socket/chat-send-concurrency-hold2.log"; exit 1; }
wait "$one_pid" || { cat "$socket/resbite_chat_writer_one.log"; echo "FAIL: writer one's send failed"; exit 1; }
wait "$two_pid" || { cat "$socket/resbite_chat_writer_two.log"; echo "FAIL: writer two's send failed"; exit 1; }
"$pg_bin/psql" "${args[@]}" >"$socket/chat-send-concurrency-verify.log" <<'SQL'
do $$ declare v text; begin
 select string_agg(right(u::text,2)||':'||(select count(*) from private.notification_outbox o join public.messages m on m.id=o.message_id
   where o.kind='chat_message' and o.recipient_id=u and m.series_id='e9100000-0000-4000-8000-000000000002'),',' order by u) into v
 from unnest(array['e9000000-0000-4000-8000-000000000001','e9000000-0000-4000-8000-000000000002','e9000000-0000-4000-8000-000000000003',
  'e9000000-0000-4000-8000-000000000004']::uuid[]) u;
 if v is distinct from '01:1,02:1,03:1,04:1' or (select count(*) from public.messages where series_id='e9100000-0000-4000-8000-000000000002' and kind='message')<>2 then
  raise exception 'FAIL: two writers at once gave notices %', v;
 end if;
end $$;
SQL
echo "PASS: two people writing in one chat at once give everyone in it exactly one chat notice"
"$pg_bin/psql" "${args[@]}" >"$socket/chat-send-concurrency-cleanup.log" <<'SQL'
delete from public.plans where id in ('e9100000-0000-4000-8000-000000000001','e9100000-0000-4000-8000-000000000002');
delete from public.chats where series_id in ('e9100000-0000-4000-8000-000000000001','e9100000-0000-4000-8000-000000000002');
delete from auth.users where id in ('e9000000-0000-4000-8000-000000000001','e9000000-0000-4000-8000-000000000002',
 'e9000000-0000-4000-8000-000000000003','e9000000-0000-4000-8000-000000000004');
do $$ begin
 if exists(select 1 from public.messages where series_id in ('e9100000-0000-4000-8000-000000000001','e9100000-0000-4000-8000-000000000002'))
 or exists(select 1 from public.chats where series_id in ('e9100000-0000-4000-8000-000000000001','e9100000-0000-4000-8000-000000000002'))
 or exists(select 1 from public.profiles where id::text like 'e9000000-%') then
  raise exception 'The race''s rows were not cleaned up';
 end if;
end $$;
SQL
