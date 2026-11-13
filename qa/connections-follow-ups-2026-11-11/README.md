# Connections follow-ups: database rollout runbook (11 November 2026)

- **Specs:** [Groups and chat design](../../docs/superpowers/specs/2026-11-10-groups-and-chat-design.md) (CH-P20) and [Connections and circles of trust design](../../docs/superpowers/specs/2026-11-10-connections-and-circles-design.md) (CO-P5, CO-P6).
- **Plan:** [Connections, plan 3: follow-ups](../../docs/superpowers/plans/2026-11-11-connections-3-follow-ups.md).
- **Code:** branch `co3-follow-ups`. **Nothing is applied to the hosted project, Supabase functions or TestFlight.** Every step below needs the owner's explicit approval when it is done. This task executed none of them.

## What is built

- **One hosted-compatible migration**, `20261111120000_connections_follow_ups.sql`. It depends only on the files in `supabase/tests/hosted-baseline/migrations.txt`. It creates no table and no public function, changes no existing grant and writes no row.
- **The roll carries every guest (CH-P20).**
  - `private.roll_repeating_plans()` is the creating-a-resbite body with one change: the carried-guest insert no longer skips a `withdrawn` reply.
  - A guest who was Going and then said Can't go is invited again to the next occurrence, not answered.
  - An admin who says Can't go has already lost the admin role (CR-P15), so the roll carries them as a guest.
  - Guests the old roll already dropped are not brought back. There is no backfill. Step 1 counts them.
- **A request's notice says how the two stand (CO-P5).**
  - A new helper, `private.pair_standing(plan, a, b)`, returns one of four values, or null (below). No API role may call it.
  - A person counts as going when they are the resbite's owner, or their own reply is Going or Maybe. An admin counts by their own reply alone.
  - It returns null when either person has no place on the resbite: neither its owner nor on its guest list, whatever the reply.
  - A request's own resbite never gives null: both people have a place on it. If it ever did, the notice would have no detail and the old wording, and nothing would fail.
  - `private.request_connection` stores the value as the notice's `detail`. The rest of its body is the connections body, verbatim.
  - The notice's key is still static (CO-R8). A request sent again keeps its first notice, with that notice's detail.
  - The outbox detail check is replaced by name. It keeps every earlier value and adds the four for `connection_request`.
- **The Connections card says the same (CO-P6).**
  - `private.my_connections()` reads a request's context from `private.pair_standing`, on the series' latest occurrence the caller may read.
  - The context is a fifth value, `from`, when the helper returns null (one of the two is not on that occurrence) and when there is no such occurrence.
  - It is `from` too when the caller may not see that occurrence's guests (they have not answered it and are not a host). The card then never says who is on a list the caller may not read (UX-P5).
  - The app words `from` as "From <title>", which stays true whatever happened since. The push never carries `from`.
  - The context is worked out for requests only. A connected row carries none.
- **The sender's copy** (`supabase/functions/_shared/notification-copy.ts`) words the request push from the detail. The title stays "<name> wants to connect". The body's full stop is left out when the title already ends in `.`, `!`, `?` or `…`.

| Detail | When | Push body |
| --- | --- | --- |
| `going` | The resbite is on (not cancelled, not ended) and both are going. | You're both going to <title>. |
| `invited` | It has not ended, and not `going`: one of them said Can't go or has not answered, or it was cancelled. | You're both invited to <title>. |
| `met` | It has ended, was not cancelled, and both were going. | You were both at <title>. |
| `were_invited` | It has ended, and not `met`. | You were both invited to <title>. |
| none | A notice queued before this migration. | The old rule: "You're both going to <title>." for a future start, else "You were both at <title>." |

- **Rulings made during the build** (they change what the plan describes):
  - There are four values, not three. With `were_invited`, "You were both at" goes only to two people who both went (Ruling 3).
  - The owner always counts as going. An admin counts only by their own reply, since a carried admin is pending until they answer (Ruling 5).
  - The push and the card share one helper (Ruling 6). The card's two fallbacks of Rulings 7 and 11 read `from`, not `met` (Ruling 14).
  - The rollback keeps every request notice and sets its detail to null. It deletes none of them (Ruling 4).
  - The rollback refuses, with 42501, once a later migration has redefined a function it restores (Ruling 14).
- **The app polish (Task 3), on this branch.** It needs a TestFlight build but no ordering with the server (step 5).
  - A request card words `invited` as "You're both invited to <title>" and `were_invited` as "You were both invited to <title>" (Ruling 6).
  - It words `from` as "From <title>" (Ruling 14). With no title it still reads "Met on Resbite", and a value it does not know still reads like `met`.
  - A failed refresh on Connections shows its line above the kept list, with Try again, never inside a sheet. An action's error shows in its own sheet or card (Ruling 8).
  - Invite people counts the connections it could not invite: "One connection you picked can't be invited right now." or "<n> connections you picked …". It adds "The others were invited." only when others were (Ruling 9).
  - Profile's Connections row keeps its chevron and lets its title wrap, so the badge never squeezes it at 320 px under Larger Text (Ruling 10). The badge stops at "99+".
  - The spoken labels come from the copy. A refused invitation of one connection is not sent again.

## Files and hashes

| File | sha256 |
| --- | --- |
| `supabase/migrations/20261111120000_connections_follow_ups.sql` | `72d1536db56c956ade36844c9d4c715fffa9222090c0cb64226166fff39ae3d6` |
| `supabase/rollback/20261111120000_connections_follow_ups.rollback.sql` | `e7d507923674073a6c8547b7d51c32722ee7abfae929e22d42b5ddfff1f1fe16` |
| `supabase/tests/hosted-baseline/20261111120000_connections_follow_ups.before.sql` | `b2b5676aed807d56309c9c91308ed73ab69b284ba0c39b3381abc32436f701c6` |
| `supabase/tests/hosted-baseline/20261111120000_connections_follow_ups.after.sql` | `723f50f4f4b771de36951ee33dfb308a93e4e4b95678bba947ef217f68a90688` |
| `supabase/ops/schedule-roll-repeating-plans.sql` (unchanged since creating a resbite; step 6) | `3a8202877260008723648dc4723b36aedb6d772f809b2552997765773040d74e` |

The before/after pair is the rehearsal, run locally only. Recompute before asking for approval (`sha256sum <file>`). Approve by file name and hash, and stop if a hash differs.

## Checks made locally (11 November 2026)

All of these ran on the merged branch, with the polish and the final fix wave (Ruling 14).

- Full mode passes, 35 PASS lines. They include `connections-follow-ups.sql` and the new concurrency script (two people asking each other at once make one connected pair).

  ```
  bash scripts/test-database-docker.sh
  ```

- The hosted baseline passes with the candidate named, 21 PASS lines. The before file passes on the baseline, the migration applies and the after file passes.

  ```
  bash scripts/test-database-docker.sh --hosted-baseline supabase/migrations/20261111120000_connections_follow_ups.sql
  ```

  - Name the candidate. Bare, this mode fails by design until this migration is live.
  - The reason: `tests.txt` lists `connections-follow-ups.sql`, and `creating-a-resbite.sql` expects the new roll, but `migrations.txt` lacks this file.
  - The after file rehearses the rollback in a transaction it rolls back. The first guard refuses when either function is gone.
  - The second guard refuses, with 42501, when the roll, `request_connection` or `my_connections` was redefined after this migration. Each is tried in turn.
  - With the three as the migration left them the rollback runs: every row is kept with a null detail, the three bodies and grants equal the previous ones, and `pair_standing` is gone.
- The app check passes: the typecheck, 696 tests in 79 runs, and the content validation.

  ```
  (cd mobile && npm run check)
  ```

- Every edge test file passes, 11 files and 80 tests, run from the repository root:

  ```
  for f in supabase/functions/_shared/*.test.ts; do node --import ./mobile/node_modules/tsx/dist/loader.mjs --test "$f"; done
  ```

- **The fingerprint, on a local replay.**
  - `supabase/ops/hosted-fingerprint.sql` on a Docker replay of `migrations.txt` (19 files) gives 355 objects.
  - That matches the connections `hosted-after.json` 355 of 355 by definition, with the 15 known `acl` differences.
  - With this file applied there are 356. One is added: `private.pair_standing(uuid,uuid,uuid)`, granted to its owner only.
  - Four change by definition: `private.roll_repeating_plans()`, `private.request_connection(uuid,uuid)`, `private.my_connections()` and the constraint `notification_outbox_detail_check`.
  - Nothing is removed, no grant changes, and every table keeps its row count.
- **The dropped-guests count of step 1, seeded.** On the empty replay it returns `0 | 0 | 0 | 0`.
  - A seeded local run on the hosted baseline used the old roll to roll two weekly series.
  - One guest said Can't go after Going on both. A second was invited again by hand. A third never used the app. A fourth stayed Going.
  - The count returned `2 | 1 | 2 | 2`: two guest rows, one person, two series, two rolled occurrences. Only the first guest is counted.

## Rollout runbook

**Order.** Before snapshot with the roll-job check and the dropped-guests count, migration, after snapshot and advisors, `deliver-notifications` redeploy, device checks. The TestFlight build with the app polish has no order with these. The roll job comes only after the migration and the creating-a-resbite TestFlight build.

**Owner-run scripts.** The assistant's safety check refuses live reads and the apply, so the owner runs short scripts with `! bash ~/<name>.sh`. At rollout time the assistant writes each script into the home directory from the block in its step. The owner reads it, then runs it. Each runs from the checkout the rollout uses: `REPO`, by default `~/dev/resbite-app`, at the merged commit. None prints a secret, a phone number or an account id.

**The assistant's steps.** The advisors read (through the Supabase MCP server) and the `deliver-notifications` deploy are the assistant's. It does each once the owner approves it, as the connections record did.

1. **Before snapshot, the roll-job check and the dropped-guests count.** Read-only, into this directory, with `! bash ~/co3-before.sh`:

   ```bash
   #!/bin/bash
   # Read-only: the before snapshot, the roll-job check and the dropped-guests count (connections follow-ups, step 1).
   set -euo pipefail
   cd "${REPO:-$HOME/dev/resbite-app}"
   D=qa/connections-follow-ups-2026-11-11
   supabase db query --linked -f supabase/ops/hosted-fingerprint.sql -o json > "$D/hosted-before.json"
   supabase db query --linked -f supabase/ops/hosted-counts.sql -o json > "$D/hosted-counts-before.json"
   supabase db query --linked -o json "select policyname, cmd, qual, with_check from pg_policies where schemaname = 'storage' order by policyname" > "$D/hosted-storage-policies-before.json"
   supabase db query --linked "select count(*) as applied, max(version) as latest from supabase_migrations.schema_migrations"
   supabase db query --linked "select jobname from cron.job where jobname = 'roll-repeating-plans'"
   supabase db query --linked "select count(*) as guest_rows, count(distinct a.user_id) as people, count(distinct o.series_id) as series, (select count(*) from public.plans where repeats_from is not null) as rolled from public.plans o join public.plans nx on nx.repeats_from = o.id join public.attendees a on a.plan_id = o.id and a.response = 'withdrawn' where not exists (select 1 from public.attendees b where b.plan_id = nx.id and b.user_id = a.user_id) and private.used_app(a.user_id) and private.user_eligible(a.user_id) and not private.deletion_pending(a.user_id)"
   ```

   - Compare `hosted-before.json` with a local replay of `migrations.txt` (19 files). Expect 355 of 355 by definition.
   - The only differences should be the 15 known `acl` ones: hosted's default `service_role` grant on 14 older `public` objects and `public.unregister_device(text)`.
   - It should be identical by definition to the connections `hosted-after.json` of 11 November. **Confirm from the real snapshot before approving.** Stop if anything else differs.
   - The storage policies should match the replay, 7 of 7.
   - The history query should read `19 | 20261110120000`.
   - **The roll job.** The cron query lists the job if it exists. On hosted it is expected not to exist, as creating-a-resbite step 7 was held. Step 6 needs this answer.
   - **The dropped-guests count** always runs. The old roll did not carry a guest who said Can't go after Going. This migration changes only the rolls to come and brings no one back.
     - It returns four counts and nothing else. It shows no names, ids or phone numbers.
     - `guest_rows`, `people` and `series` count guests who said Can't go on an occurrence that was rolled, and have no row on the next one.
     - They count only guests the roll would carry now: they use the app, may still use it, and are not leaving.
     - A guest a host invited again by hand has a row, so is not counted.
     - `rolled` counts the occurrences the roll has made, by the job or by a run by hand.
     - Expected on hosted: `0 | 0 | 0 | 0`, if the roll has never run there.
     - If `guest_rows` is above 0, the owner decides on a repair before the apply. Rolled occurrences with no guest dropped need nothing.
     - If the CLI's role is refused the private functions, paste the same query into the SQL editor. It is read-only there too.
2. **Migration** (the owner approves by file name and sha256, above). Never `supabase db push`: it would also push the local-only migrations. `! bash ~/co3-apply.sh` checks the hash, applies, records, and takes step 3's snapshots:

   ```bash
   #!/bin/bash
   # The connections follow-ups migration (steps 2 and 3). Only after the owner approves the file by name and sha256.
   set -euo pipefail
   cd "${REPO:-$HOME/dev/resbite-app}"
   D=qa/connections-follow-ups-2026-11-11
   F=supabase/migrations/20261111120000_connections_follow_ups.sql
   echo "72d1536db56c956ade36844c9d4c715fffa9222090c0cb64226166fff39ae3d6  $F" | sha256sum -c -
   mkdir -p /tmp/co3 && { echo 'begin;'; cat "$F"; echo; echo 'commit;'; } > /tmp/co3/apply.sql
   supabase db query --linked -f /tmp/co3/apply.sql
   supabase migration repair --status applied 20261111120000 --linked --yes
   supabase db query --linked "select count(*) as applied, max(version) as latest from supabase_migrations.schema_migrations"
   supabase db query --linked -f supabase/ops/hosted-fingerprint.sql -o json > "$D/hosted-after.json"
   supabase db query --linked -f supabase/ops/hosted-counts.sql -o json > "$D/hosted-counts-after.json"
   supabase db query --linked -o json "select policyname, cmd, qual, with_check from pg_policies where schemaname = 'storage' order by policyname" > "$D/hosted-storage-policies-after.json"
   ```

   - The script stops before applying if the hash differs.
   - The file runs in one transaction. Any error rolls all of it back, and the script stops before the history repair.
   - If the apply succeeded and only the repair failed, run the repair alone, from the repository root. Then run the script's last four lines, for the history and step 3's snapshots.

     ```
     supabase migration repair --status applied 20261111120000 --linked --yes
     ```

   - Running the whole script again would only fail. The second apply stops at `create function private.pair_standing`, which already exists, and changes nothing (checked locally).
   - The history query should then read `20 | 20261111120000`, one row more.
   - There is no backfill, and the migration writes no row.
   - It takes a brief lock on `private.notification_outbox` to replace the detail check, as the earlier migrations did.
   - The re-added check validates every existing row. They all pass, as it keeps every earlier value.
3. **After snapshot and advisors.**
   - `hosted-after.json` should match a local replay of `migrations.txt` plus this file: 356 of 356 by definition, with the same 15 `acl` differences. A full match also means this migration's rollback guard will pass on hosted: the definitions carry the function bodies verbatim, and the local rehearsal ran the rollback on those same bodies.
   - Before to after: one function added, `private.pair_standing(uuid,uuid,uuid)`, which no API role may run.
   - Four objects change: the three functions above and the outbox constraint `notification_outbox_detail_check`. Nothing is removed and no grant changes. `.after.sql` asserts the same shape locally.
   - Every table keeps its row count. The storage policies are unchanged, 7 of 7.
   - **Advisors.** Once the owner approves, the assistant reads them (security and performance) through the Supabase MCP server, into `hosted-advisors-after.json`.
   - Compare with the connections `hosted-advisors-after.json`: 42 findings, 10 WARN, the rest INFO, no ERROR.
   - **Expected: no new finding.** The new helper is a definer in `private` with an empty `search_path`, and no API role may run it. The migration adds no table, index, policy or foreign key.
   - Unused-index notices can come and go with use alone, not from this file. Stop the rollout for anything else new.
   - Append this line to `supabase/tests/hosted-baseline/migrations.txt`:

     ```
     20261111120000_connections_follow_ups.sql              20261111120000
     ```

   - Then run the baseline with no candidate. It must pass from now on:

     ```
     bash scripts/test-database-docker.sh --hosted-baseline
     ```

4. **Redeploy `deliver-notifications`** (Task 2 changed the request push's words). Once the owner approves it, the assistant runs the deploy after step 2, from the repository root:

   ```
   supabase functions deploy deliver-notifications --no-verify-jwt --project-ref ewcsgvhuojxdpaspwsrx
   ```

   - `--no-verify-jwt` is required: without it the schedule's calls are refused. The secrets and the Vault entries stay as they are.
   - Either order with step 2 is safe. The sender in place now ignores the detail and words a request by its start time.
   - The new sender words a request with no detail the same way. Until the redeploy, request pushes keep the old wording, and nothing fails.
   - Afterwards the function list should show `deliver-notifications` ACTIVE and `verify_jwt` false. Its version is one more than the version before this redeploy (5 if nothing else was deployed).
   - An unauthenticated POST to the function URL should answer 401 from the handler.
   - The owner then reads the schedule's runs after the redeploy with `! bash ~/co3-sender-check.sh` (read-only):

     ```bash
     #!/bin/bash
     # Read-only: the sender's last runs after the redeploy (connections follow-ups, step 4).
     set -euo pipefail
     cd "${REPO:-$HOME/dev/resbite-app}"
     supabase db query --linked "select status, return_message, start_time from cron.job_run_details where jobid = (select jobid from cron.job where jobname = 'deliver-notifications') order by start_time desc limit 5"
     supabase db query --linked "select status_code, content, created from net._http_response order by created desc limit 5"
     ```

   - Each run should succeed, and each call answer HTTP 200 with `"disabled":false`.
5. **TestFlight build** (the owner's step). It has no ordering with steps 1 to 4.
   - The app polish (Task 3, on this branch) rides the next TestFlight build. It words `invited` as "You're both invited to <title>" and `were_invited` as "You were both invited to <title>".
   - A build made before the polish reads a request's context by one rule, `requestLine` in `mobile/app/connections.tsx:19-20` on `main` (3b5be48).
   - With no title it shows "Met on Resbite". With `going` it shows "You're both going to <title>".
   - Any other value shows "You were both at <title>", the `met` wording. So such a build shows `invited`, `were_invited` and `from` as "You were both at <title>".
   - That build does not check the value, so nothing breaks.
   - One line changes on such a build once the migration is live. A request involving an admin who has not answered an upcoming resbite used to read "You're both going to <title>". It now reads "You were both at <title>" (`invited`), though the resbite has not happened. The fallback `from` reads "You were both at <title>" there too. The polished build words both truly.
   - A polished build on a server without this migration gets only `going` and `met`, and words them as before.
6. **Roll job** (creating-a-resbite runbook, step 7). It may be created once this migration is live and the creating-a-resbite TestFlight build is out.
   - Not before: the old roll drops a guest who said Can't go, for good.
   - The owner runs it from their shell, from the repository root:

     ```
     ! bash -c '
     supabase db query --linked \
       -f supabase/ops/schedule-roll-repeating-plans.sql
     '
     ```

   - Then check the job's role and its first runs, as that step says. `username` must be `postgres`.
7. **Device checks** (two phones, after steps 2 and 4; the card and screen checks need the polished build).
   - A request pushes once per pair, series and person asking (CO-R8). Use a fresh pair or a fresh series for each check.
   - Ask from a resbite you are both Going to. The push reads "You're both going to <title>."
   - Ask from an upcoming resbite the other said Can't go to. The push reads "You're both invited to <title>."
   - Ask from an ended resbite you both went to. The push reads "You were both at <title>."
   - Ask from an ended resbite one of you skipped. The push reads "You were both invited to <title>."
   - **The two new card lines.** On a resbite that does not repeat, the card names the same resbite as the push.
   - So the request card on Connections reads "You're both invited to <title>" and "You were both invited to <title>" in the two checks above.
   - On a repeating resbite the card reads the series' latest occurrence. A person who has not answered it reads "From <title>". So does anyone when the person asking is not on that occurrence.
   - **A failed refresh (Ruling 8).** With Connections loaded, turn on Airplane Mode, then leave the app and come back.
   - The error line shows above the kept list, with Try again, never inside a sheet. Opening or closing a sheet does not clear it.
   - Try again shows busy while it runs, with no jump in the layout. The line goes once a read succeeds.
   - **Counted refusals (Ruling 9).** On Invite people, pick a connection who can no longer be invited (an account being deleted, say). Pick another connection or a number not yet on the resbite with it.
   - The line reads "One connection you picked can't be invited right now. The others were invited."
   - With that connection as the only pick, the Pick step shows "One connection you picked can't be invited right now."
   - **The row keeps its chevron (Ruling 10).** At 320 points wide with the largest Larger Text, Profile's Connections row keeps its chevron and its badge.
   - **The roll (after step 6).** On a weekly resbite, a guest says Going, then Can't go (stored as `withdrawn`).
   - After the occurrence ends, they are on the next one, not answered, and get the "<title> is on again" push.

## Applied

**12 November 2026.** The owner ran the scripts from `main` at f68b60f (the merged stack) and approved the file by name and sha256 (`72d1536d…1fe3d6`, rechecked by the script).
- Step 1: history `19 | 20261110120000`; no `roll-repeating-plans` job; dropped guests `0 | 0 | 0 | 0`; `hosted-before.json` identical to the connections `hosted-after.json`, 355 of 355; storage policies 7.
- Step 2: applied in one transaction; history `20 | 20261111120000`.
- Step 3: 355 → 356; added `private.pair_standing(uuid,uuid,uuid)`; changed the three functions and `notification_outbox_detail_check`; nothing removed, no grant changed; row counts unchanged; storage 7 unchanged. Advisors were read once after circles (that runbook's record), covering both.
- Step 4: no separate redeploy. The sender was redeployed once, after the chat migrations (the chat runbook's step 4), because the merged sender needs chat core's `deferred` outcome.
- Recorded in `supabase/tests/hosted-baseline/migrations.txt`. The bare baseline then needs the later migrations listed too (main carries their tests); with all five listed it passes.

## Rollback

Only with the owner's approval, in one transaction.

1. **The roll job first.** If `cron.job` has `roll-repeating-plans` (step 6 created it; step 1's cron query lists it), the owner unschedules it before anything else, from the repository root:

   ```
   supabase db query --linked "select cron.unschedule('roll-repeating-plans')"
   ```

   - Why: the rollback puts the old roll back. With the job still running, each roll from then on drops every guest who went from Going to Can't go, for good.
   - The statement fails when there is no such job. Then nothing needs unscheduling.
   - Afterwards step 1's cron query should list no job. Create it again (step 6) only once this migration is live again.
2. The owner runs the rollback with `! bash ~/co3-rollback.sh`. It checks the hash, then runs the file in one transaction, with no psql `\i`:

   ```bash
   #!/bin/bash
   # The connections follow-ups rollback. Only with the owner's approval.
   set -euo pipefail
   cd "${REPO:-$HOME/dev/resbite-app}"
   F=supabase/rollback/20261111120000_connections_follow_ups.rollback.sql
   echo "e7d507923674073a6c8547b7d51c32722ee7abfae929e22d42b5ddfff1f1fe16  $F" | sha256sum -c -
   mkdir -p /tmp/co3 && { echo 'begin;'; cat "$F"; echo; echo 'commit;'; } > /tmp/co3/rollback.sql
   supabase db query --linked -f /tmp/co3/rollback.sql
   ```

   - The script stops before running anything if the hash differs.
   - Wrapped this way, the rollback ran locally after the migration and gave back the baseline's fingerprint, 355 of 355.
   - It deletes no row, so it need not wait for the sender to drain the outbox.
   - Every `connection_request` notice with a detail keeps its row, delivered or not, with the detail set to null.
   - A notice not yet sent then goes with the no-detail wording. The rows' keys still stop a second notice for a request already told.
   - It first locks the outbox against writes. A request that reaches its notice meanwhile fails once the rollback commits. Asking again works.
   - It restores `private.roll_repeating_plans` (the creating-a-resbite body) with its grants.
   - It restores `private.request_connection` and `private.my_connections` (the connections bodies) with their grants. Their public wrappers stay.
   - It drops `private.pair_standing` and puts back the creating-a-resbite detail check.
   - Everything else is kept, including the occurrences the roll already made and every guest it carried.
3. **Order.** Run this rollback after the rollbacks of every later migration, and before those of earlier ones.
   - Later migrations (circles, the chat plans) redefine the roll, `request_connection` or `my_connections`. Their rollbacks put this migration's bodies back, so they run first.
   - This file refuses with 42501, changing nothing, while any of the three is not this migration's body. It compares `md5(prosrc)` with the values recorded in the file.
   - Then the connections rollback, `supabase/rollback/20261110120000_connections.rollback.sql`.
   - Then the creating-a-resbite rollback, `supabase/rollback/20261031120000_creating_a_resbite.rollback.sql`. The roll job is already unscheduled (rollback step 1). Then the earlier ones, as the creating-a-resbite runbook lists.
   - This file's first guard stops it, changing nothing, once the connections or the creating-a-resbite rollback has run.
   - The connections rollback's header still says to run it first of the rollbacks. That header predates this file and is left unchanged, as its hash is part of a live runbook.
   - Nothing stops the connections rollback if it runs first by mistake. Then this file refuses, and `private.pair_standing` stays behind, unused.
   - In that case the roll also keeps carrying every guest until the creating-a-resbite rollback. A local run on the hosted baseline showed exactly this.
   - A leftover `private.pair_standing` can be dropped by hand, with the owner's approval. The owner runs, from the repository root:

     ```
     supabase db query --linked "drop function private.pair_standing(uuid,uuid,uuid)"
     ```

4. After it, the redeployed sender words request pushes by the start time again. No sender redeploy is needed.
   - No app build calls anything this migration made. A polished build gets only `going` and `met`.
5. Remove the line for this migration from `supabase/tests/hosted-baseline/migrations.txt` if it was appended.
   - The hosted migration history row stays, as the earlier rollbacks left theirs. Never run `supabase migration repair --status reverted`.

## Not done here

No hosted change, no function deployment, no schedule and no TestFlight upload. Nothing was pushed.

- **Guests the old roll already dropped** stay dropped. Step 1 counts them.
- **Task 3's deferred minors:**
  - At 320 px under Larger Text, the one-word Row title breaks mid-word ("Connecti/ons"). The chevron and badge stay.
  - The Connections bar title overlaps Back beyond the project's own Larger Text emulation. This plan does not change it.
- **Deferred minors from the build's ledger:**
  - A request's detail is fixed by its first notice (the static key, CO-R8). A request sent again from the same series after things change keeps the first wording.
  - A request's first detail can be out of date when a reply changes while its notice waits. The window is the sender's minute.
  - `invited` can describe a request from the organizer, or from a resbite cancelled before its end. That wording stays (Q-P20d).
  - A title ending in a closing quote or bracket still gets a full stop. A newline in a title passes through to the push.
