# Circles of trust: rollout runbook (11 November 2026)

- **Spec:** [Connections and circles of trust design](../../docs/superpowers/specs/2026-11-10-connections-and-circles-design.md) (CO-D4, CO-D5, CO-D7, CO-P7 to CO-P13, CO-P15; screens CO-04 to CO-07).
- **Plan:** [Connections, plan 2: circles of trust](../../docs/superpowers/plans/2026-11-10-connections-2-circles-of-trust.md).
- **Code:** branch `co2-circles-of-trust`, stacked on the follow-ups branch `co3-follow-ups`. **Nothing is applied to the hosted project, Supabase functions, Vercel, EAS or TestFlight.** Every step below needs the owner's explicit approval when it is done. This task executed none of them.

## What is built

- **One hosted-compatible migration**, `20261111130000_circles_of_trust.sql`. It depends on the files in `supabase/tests/hosted-baseline/migrations.txt` and on the follow-ups migration `20261111120000_connections_follow_ups.sql`, whose roll it copies.
  - It writes no row. It adds columns with constant defaults, so existing rows read as before.
  - Every resbite reads as Nobody (`bring_invites` 0, `bring_levels` 1). Every guest row and link reads as a host's, level 1 with no bringer.
- **The circle (CO-D4, CO-P7).** `plans.bring_invites` (0 to 3) and `plans.bring_levels` (1 to 3), set only by `set_plan_circle`. The roll copies them (CO-P12).
- **Who brought whom.** `brought_by` and `level` on `public.attendees` and on `private.phone_invitations`.
  - Both `brought_by` columns point at `auth.users`, never at `profiles`. So the `profiles(display_name)` embeds of installed builds still resolve.
  - The roll carries `brought_by` and `level` with every guest (CO-P12, which overrides CO-P8's "carried is level 1").
- **Bringing (CO-P8 to CO-P10, CO-P15).** `invite_contacts` lets a guest bring when their allowance covers the batch.
  - The allowance is checked once, under the resbite's row lock, when the invitation is sent. A sent invitation stands.
  - Too many new people refuse the whole call (22023 'No invites left'). No allowance refuses it too (42501 'Not allowed to bring people here').
  - Sending one's own live link again costs nothing.
- **A removal sticks (CO-R12).** `private.plan_removals` remembers, per series, whom a host removed, declined or revoked.
  - A guest cannot bring that person back, by connection or by number. That person cannot answer a guest's link, or a host's link sent before the removal.
  - A host's own later invitation, or an approval, clears the record.
- **The people list (CO-07).** `plan_bringers` names the bringers. `plan_brought_invitations` gives a host the guests' unanswered links by their last two digits, never the number.
  - A host removes such a link by its id (`revoke_brought_invitation`).
  - A bringer takes back their own unanswered link (`revoke_phone_invitation`, widened) or in-app invitation (`withdraw_brought_invitation`).
- **On the list and waiting never both hold.** A trigger, `attendees_close_waiting`, ends a person's waiting request when they join the guest list by any path.
- **The sender** (`supabase/functions/_shared/notification-copy.ts`) words a brought person's answer for the hosts: "Clara is going · brought by Pedro." It needs the redeploy (step 4).
- **The web page** (`links/`) names the inviter on a guest's link: "Pedro invited you to Ana’s resbite". It needs the link-site deploy (step 5).
- **The app** (rides the TestFlight build, step 6):
  - the Circle of trust card on Invite people;
  - the resbite page's "Bring someone" row, and bring mode on Invite people;
  - the chain on the people list: "Brought by Pedro", the indent, the guests' links, and the bringer's own Send again and Remove.

The decisions and the calls made while building are in the [decision log](../../knowledge-base/08-decisions.md), under Circles of trust.

## Files and hashes

| File | sha256 |
| --- | --- |
| `supabase/migrations/20261111130000_circles_of_trust.sql` | `04062e2b091fa582f59a3d1ff9a322e8019ce671c64d532d5c113d0916d77256` |
| `supabase/rollback/20261111130000_circles_of_trust.rollback.sql` | `0c4f4bc033c632698783b8855e277c33cea52415a88521c74c88479433463146` |
| `supabase/tests/hosted-baseline/20261111130000_circles_of_trust.before.sql` | `0b2be16e10b84994deeb6baf2d7efe2bfa8630859095681d1ca51d7954759fd5` |
| `supabase/tests/hosted-baseline/20261111130000_circles_of_trust.after.sql` | `c500202fb5ae42daa9b3f93cc7aca34331e86fe13e6083ea644a76e78a0b33f4` |
| `supabase/migrations/20261111120000_connections_follow_ups.sql` (only while it is pending) | `72d1536db56c956ade36844c9d4c715fffa9222090c0cb64226166fff39ae3d6` |
| `supabase/rollback/20261111120000_connections_follow_ups.rollback.sql` | `e7d507923674073a6c8547b7d51c32722ee7abfae929e22d42b5ddfff1f1fe16` |
| `supabase/ops/hosted-fingerprint.sql` (unchanged) | `0778c53f98bc1cbdcee82487651dabc3fa246674a5d0efa1d6502e7746819a00` |
| `supabase/ops/hosted-counts.sql` (unchanged) | `15fe76aecba6bb5104d8795338c1ecaee9bd07ec9a2a9b7aba728e2bdae8c4a0` |

The follow-ups hashes are the ones in [its runbook](../connections-follow-ups-2026-11-11/README.md). The before/after pairs are the rehearsals, run locally only. Recompute before asking for approval (`sha256sum <file>`). Approve by file name and hash, and stop if a hash differs.

## Checks made locally (11 November 2026)

All of these ran on `co2-circles-of-trust`, with Tasks 1 to 7 combined.

- Full mode passes, 38 PASS lines: 28 SQL files, 9 race lines and the final line. They include `circles-of-trust.sql` and `circles-concurrency.sh`.

  ```
  bash scripts/test-database-docker.sh
  ```

- The hosted baseline passes with both candidates named, 23 PASS lines. Each before file passes on the baseline, each migration applies and each after file passes.

  ```
  bash scripts/test-database-docker.sh --hosted-baseline supabase/migrations/20261111120000_connections_follow_ups.sql supabase/migrations/20261111130000_circles_of_trust.sql
  ```

  - Name both candidates. Bare, this mode fails by design until both are live: `tests.txt` lists their tests.
  - The circles after file rehearses the rollback in a transaction it rolls back. Both guards are tried and refuse with their messages.
  - With the guards satisfied the rollback runs. All ten restored functions equal their snapshots, definitions and grants. Every new object is gone. The brought guests stay.
  - The guest's unanswered link is revoked, so no link a guest sent that nobody answered stays live (CO-Q2, the default). The host's own link and a guest's answered link stay live.
  - On a scratch copy with both lines appended to `migrations.txt`, the bare mode passes, 21 PASS lines.
- **The race (the plan's Task 1, Step 5).** `supabase/tests/local/circles-concurrency.sh` runs in full mode.
  - Scenario (b): the host lowers the circle to Nobody while a guest brings someone. The guest waits on the resbite's row, then gets 42501. Nobody is added.
  - Scenario (c): a stranger with a 300 ms lock timeout is refused before the row lock, three ways.
  - **Mutation run, once, not committed.** With the allowance read moved above the row lock, (b) failed: the guest's call returned `app` and the friend's row appeared. Restored, (b) passed in every run since.
- The app check passes: the typecheck, 810 tests, and the content validation.

  ```
  (cd mobile && npm run check)
  ```

- Every edge test file passes, 11 files and 82 tests, run from the repository root:

  ```
  for f in supabase/functions/_shared/*.test.ts; do node --import ./mobile/node_modules/tsx/dist/loader.mjs --test "$f"; done
  ```

- The link site's tests pass, 4 files and 81 tests, with the same loader. So does its browser check, `links/verify-personal.mjs`, run from `mobile/`.

  ```
  for f in links/*.test.mjs; do node --import ./mobile/node_modules/tsx/dist/loader.mjs --test "$f"; done
  (cd mobile && node --import tsx ../links/verify-personal.mjs)
  ```

- **The browser script**, `mobile/scripts/verify-circle.mjs`, passes on Expo web with every Supabase request stubbed. It walks the five scenarios in the plan: the host's card, bringing a connection, bringing a number, the host's chain and the bringer's list. It also takes back an in-app invitation as the bringer.
- **The fingerprint, on a local replay.**
  - `supabase/ops/hosted-fingerprint.sql` on a Docker replay of `migrations.txt` (19 files) gives 355 objects.
  - That matches the connections `hosted-after.json` of 11 November, 355 of 355 by definition, with the 15 known `acl` differences.
  - With the follow-ups file there are 356: one function added, four changed.
  - With both files there are 387. From the replay with the follow-ups file to this, 31 objects are added:
    - 15 functions: `set_plan_circle`, `my_bring_allowance`, `plan_bringers`, `plan_brought_invitations`, `revoke_brought_invitation` and `withdraw_brought_invitation`, each with its private body; and `private.bring_allowance`, `private.first_name` and `private.attendees_close_waiting`.
    - the table `private.plan_removals`, 5 indexes, 9 constraints and the trigger `attendees_close_waiting`.
  - 13 change by definition: ten functions and the tables `plans`, `attendees` and `private.phone_invitations`. The functions are `invite_contacts`, `answer_phone_invitation`, `personal_invitation_page`, `revoke_phone_invitation`, `plan_phone_invitations`, `remove_guest`, `decide_join_request`, `fold_web_account`, `roll_repeating_plans` and `public.claim_notification_deliveries`.
  - Nothing is removed and no grant changes. The storage policies stay 7 of 7.
  - The circles rollback, wrapped as below, gives back the 356 exactly. The follow-ups rollback then gives back the 355 exactly.
- **The scripts below, rehearsed.** They ran on a local replay through a stand-in for the CLI that sends each query to the local database.
  - Follow-ups pending: `circles` refused and changed nothing; `both` gave the 387 and the history `21 | 20261111130000`.
  - Run again, `both` and `circles` each refused and changed nothing.
  - Follow-ups applied by its own runbook: `both` refused and changed nothing; `circles` gave the 387.
  - The follow-ups rollback refused while circles was applied. The circles rollback gave back the 356. Run again, it failed and changed nothing.

## Rollout runbook

**Order.** The steps below, by their numbers:

0. The owner's answers to the owner questions, CO-Q1 and CO-Q2.
1. Before snapshot.
2. The migration.
3. After snapshot and advisors.
4. The `deliver-notifications` redeploy.
5. The link-site deploy.
6. Only then the TestFlight build.
7. The device checks.

The migration must be live before the TestFlight build. The new build reads `plans.bring_invites` and `bring_levels`, and its `readGuests` selects `brought_by,level`. On the old schema those reads fail, so the resbite page and Invite people do not load.

**If the follow-ups migration is still pending,** this runbook applies it too. One before/after snapshot pair covers both. The owner approves both files by name and sha256, and they go in order, in one transaction. The follow-ups runbook's other steps still hold: its step 1 count (in this step 1 too), its device checks and its roll-job step.
- When step 2 runs `both`, the follow-ups runbook takes no snapshots of its own. Its Applied section then records that its migration went with this one, and points to step 2 here and to this directory's snapshot files.

**Owner-run scripts.** The assistant's safety check refuses live reads and the apply, so the owner runs short scripts with `! bash ~/<name>.sh`.
- At rollout time the assistant writes each script into the home directory from the block in its step. The owner reads it, then runs it.
- Each runs from the checkout the rollout uses: `REPO`, by default `~/dev/resbite-app`, at the merged commit.
- None prints a secret, a phone number or an account id.

**The assistant's steps.** The advisors read (through the Supabase MCP server) and the `deliver-notifications` deploy are the assistant's. It does each once the owner approves it, as the connections record did.

0. **The owner questions, CO-Q1 and CO-Q2, before step 2.**
   - **CO-Q1, the roll.** The roll carries every guest (CH-P20). So a brought person who said Can't go comes back pending on the next occurrence, still counted for their bringer.
     - The bringer's `used` can then exceed `allowed`. They read no invites left (`remaining` 0) until the brought person says Can't go there, or a host removes them. A bringer cannot take back someone the roll carried (CO-R16).
     - **Built that way by default.** The alternative, not carrying a brought person who said Can't go, is one condition in the roll, and a new migration hash.
   - **CO-Q2, the bringers' links after a rollback.** Should a rollback keep the bringers' unanswered links live, showing their numbers to hosts?
     - The `plan_phone_invitations` the rollback restores lists every live link to a host, with its number. So, before restoring it, the rollback revokes every link a guest sent that nobody has answered, and no number a guest typed reaches a host.
     - The cost: those invitations stop working. Their page reads as no longer active, and an answer is refused.
     - **Built that way by default.** The alternative, keeping those links live and showing their numbers to hosts, is one statement out of the rollback, and a new rollback hash.
   - Record both answers under "Applied". With no answer, the defaults ship.
1. **Before snapshot, the history and two counts.** Read-only, into this directory, with `! bash ~/co2-before.sh`:

   ```bash
   #!/bin/bash
   # Read-only: the before snapshot, the history, the roll-job check and two counts (circles of trust, step 1).
   set -euo pipefail
   cd "${REPO:-$HOME/dev/resbite-app}"
   D=qa/circles-of-trust-2026-11-10
   supabase db query --linked -f supabase/ops/hosted-fingerprint.sql -o json > "$D/hosted-before.json"
   supabase db query --linked -f supabase/ops/hosted-counts.sql -o json > "$D/hosted-counts-before.json"
   supabase db query --linked -o json "select policyname, cmd, qual, with_check from pg_policies where schemaname = 'storage' order by policyname" > "$D/hosted-storage-policies-before.json"
   supabase db query --linked "select count(*) as applied, max(version) as latest from supabase_migrations.schema_migrations"
   supabase db query --linked "select jobname from cron.job where jobname = 'roll-repeating-plans'"
   supabase db query --linked "select count(*) as guest_rows, count(distinct a.user_id) as people, count(distinct o.series_id) as series, (select count(*) from public.plans where repeats_from is not null) as rolled from public.plans o join public.plans nx on nx.repeats_from = o.id join public.attendees a on a.plan_id = o.id and a.response = 'withdrawn' where not exists (select 1 from public.attendees b where b.plan_id = nx.id and b.user_id = a.user_id) and private.used_app(a.user_id) and private.user_eligible(a.user_id) and not private.deletion_pending(a.user_id)"
   supabase db query --linked "select count(*) as waiting_pairs from private.join_requests r join public.attendees a on a.plan_id = r.plan_id and a.user_id = r.user_id where r.status = 'waiting'"
   ```

   - **The history line decides step 2.**
     - `19 | 20261110120000`: the follow-ups migration is pending. Step 2 runs `both`.
     - `20 | 20261111120000`: it is live. Step 2 runs `circles`.
     - Anything else: stop.
   - **The fingerprint.** Compare `hosted-before.json` with a local replay, by `(kind, name)`. Stop if anything differs but the 15 known `acl` ones: hosted's default `service_role` grant on 14 older `public` objects, and `public.unregister_device(text)`.
     - With `19`: 355 of 355, as in the connections `hosted-after.json` of 11 November.
     - With `20`: 356 of 356, as in the follow-ups `hosted-after.json`.
     - **Confirm from the real snapshot before approving.**
   - The storage policies should match the replay, 7 of 7.
   - **The roll job.** The cron query lists `roll-repeating-plans` if it exists. Either answer is fine for this migration: its roll carries every guest, as the follow-ups roll does.
   - **The dropped-guests count** is the follow-ups runbook's. With `19`, read it and decide as its step 1 says, before step 2. With `20`, it was read there already.
   - **The waiting pairs** count guest rows that sit beside a waiting request on the same resbite, from before this migration (a known gap below). It shows counts only. The migration leaves them as they are.
     - The people list hides such a request, and a Decline of it is refused.
     - If the CLI's role is refused the private schema, paste the two count queries into the SQL editor. They are read-only there too.
2. **Migration** (the owner approves each file it applies, by file name and sha256, above). Never `supabase db push`: it would also push the local-only migrations. Run `! bash ~/co2-apply.sh both` or `! bash ~/co2-apply.sh circles`, as step 1's history line says. It checks the hashes, applies, records, and takes step 3's snapshots:

   ```bash
   #!/bin/bash
   # The circles-of-trust migration (steps 2 and 3), with the connections follow-ups migration first while that one is
   # pending. Say "both" or "circles", as step 1's history line says. Only after the owner approves each file it applies
   # by name and sha256.
   set -euo pipefail
   MODE="${1:-}"
   cd "${REPO:-$HOME/dev/resbite-app}"
   D=qa/circles-of-trust-2026-11-10
   FU=supabase/migrations/20261111120000_connections_follow_ups.sql
   CO=supabase/migrations/20261111130000_circles_of_trust.sql
   PAIR="pg_catalog.to_regprocedure('private.pair_standing(uuid,uuid,uuid)')"
   case "$MODE" in
     both)
       echo "72d1536db56c956ade36844c9d4c715fffa9222090c0cb64226166fff39ae3d6  $FU" | sha256sum -c -
       echo "04062e2b091fa582f59a3d1ff9a322e8019ce671c64d532d5c113d0916d77256  $CO" | sha256sum -c -
       FILES=("$FU" "$CO")
       VERSIONS=(20261111120000 20261111130000)
       GUARD="if $PAIR is not null then raise exception 'The connections follow-ups migration is already applied: if circles is not, run co2-apply.sh circles'; end if;"
       ;;
     circles)
       echo "04062e2b091fa582f59a3d1ff9a322e8019ce671c64d532d5c113d0916d77256  $CO" | sha256sum -c -
       FILES=("$CO")
       VERSIONS=(20261111130000)
       GUARD="if $PAIR is null then raise exception 'The connections follow-ups migration is not applied: run co2-apply.sh both'; end if;
    if pg_catalog.to_regclass('private.plan_removals') is not null then raise exception 'The circles-of-trust migration is already applied'; end if;"
       ;;
     *)
       echo "Say both or circles" >&2
       exit 1
       ;;
   esac
   mkdir -p /tmp/co2
   { echo 'begin;'; echo "do \$\$ begin $GUARD end \$\$;"; for f in "${FILES[@]}"; do cat "$f"; echo; done; echo 'commit;'; } > /tmp/co2/apply.sql
   supabase db query --linked -f /tmp/co2/apply.sql
   for v in "${VERSIONS[@]}"; do supabase migration repair --status applied "$v" --linked --yes; done
   supabase db query --linked "select count(*) as applied, max(version) as latest from supabase_migrations.schema_migrations"
   supabase db query --linked -f supabase/ops/hosted-fingerprint.sql -o json > "$D/hosted-after.json"
   supabase db query --linked -f supabase/ops/hosted-counts.sql -o json > "$D/hosted-counts-after.json"
   supabase db query --linked -o json "select policyname, cmd, qual, with_check from pg_policies where schemaname = 'storage' order by policyname" > "$D/hosted-storage-policies-after.json"
   ```

   - The script stops before applying if a hash differs.
   - Everything runs in one transaction, the guard first. The wrong mode, or a second run, is refused by the guard and changes nothing. Any other error rolls all of it back too, and the script stops before the history repair.
   - If the apply succeeded and only a repair failed, run the missing repair alone, from the repository root. Then run the script's last four lines, for the history and step 3's snapshots.

     ```
     supabase migration repair --status applied 20261111120000 --linked --yes
     supabase migration repair --status applied 20261111130000 --linked --yes
     ```

   - The history query should then read `21 | 20261111130000`.
   - **Locks.** The follow-ups file locks `private.notification_outbox` briefly. This file locks `public.plans`, `public.attendees` and `private.phone_invitations` briefly, to add the columns and their checks. Each check reads every row once, and the tables are small.
   - **Installed builds keep working** (the plan's Review Focus 1). No new foreign key links `attendees` to `profiles`, so their embeds resolve.
     - A host's `plan_phone_invitations` keeps today's shape. It leaves out the guests' links, which only the new build can make.
     - `invite_contacts` keeps its answer kinds, and the web page keeps its keys.
3. **After snapshot and advisors.**
   - `hosted-after.json` should match a local replay of `migrations.txt` plus both files: 387 of 387 by definition, with the same 15 `acl` differences.
   - A full match also means this migration's rollback will meet the bodies it was rehearsed on.
   - **Before to after**, by `(kind, name)`, as listed under the checks above.
     - From 356 (`circles`): 31 added and 13 changed.
     - From 355 (`both`): 32 added and 16 changed. The extra objects are `private.pair_standing`, `private.my_connections`, `private.request_connection` and the outbox's `notification_outbox_detail_check`; the roll is counted once.
     - Nothing is removed and no grant changes. `.after.sql` asserts the same shape locally.
   - **Counts.** One table more, `private.plan_removals`, with 0 rows. Every other table keeps its row count. The storage policies are unchanged, 7 of 7.
   - **Advisors.** Once the owner approves, the assistant reads them (security and performance) through the Supabase MCP server, into `hosted-advisors-after.json`.
     - Compare with the connections `hosted-advisors-after.json`: 42 findings, 10 WARN, the rest INFO, no ERROR.
     - **Expected: no new WARN and no ERROR.** The six new public functions are invokers. Their private bodies are definers in `private` with an empty `search_path`.
     - **New INFO lines are expected, of two kinds the file already has.**
       - `rls_enabled_no_policy` for `private.plan_removals`: RLS on and no policy, as for the 18 other private tables. No API role may read or write it.
       - `unused_index` for the three new plain indexes, `attendees_brought_by_idx`, `phone_invitations_brought_by_idx` and `plan_removals_user_idx`, until they are used.
     - If the linter does not count a partial index, `unindexed_foreign_keys` may also list the three new foreign keys. Each has a partial index on its column.
     - Unused-index notices can also come and go with use alone. Stop the rollout for anything else new.
   - Append these lines to `supabase/tests/hosted-baseline/migrations.txt`, the first only if step 2 ran `both`:

     ```
     20261111120000_connections_follow_ups.sql              20261111120000
     20261111130000_circles_of_trust.sql                    20261111130000
     ```

   - Then run the baseline with no candidate. It must pass from now on (checked on a scratch copy: 21 PASS lines):

     ```
     bash scripts/test-database-docker.sh --hosted-baseline
     ```

4. **Redeploy `deliver-notifications`** (Task 2 changed the `rsvp` wording). If the follow-ups redeploy has not been done yet, this one deploy covers both. Once the owner approves it, the assistant runs the deploy after step 2, from the repository root:

   ```
   supabase functions deploy deliver-notifications --no-verify-jwt --project-ref ewcsgvhuojxdpaspwsrx
   ```

   - `--no-verify-jwt` is required: without it the schedule's calls are refused. The secrets and the Vault entries stay as they are.
   - Either order with step 2 is safe.
     - The sender in place now ignores the claim's new `brought_by_name`, so an answer reads "Clara is going." until the redeploy.
     - The new sender with no `brought_by_name` words an answer as before.
   - Afterwards the function list should show `deliver-notifications` ACTIVE and `verify_jwt` false. Its version is one more than the version before this redeploy.
   - An unauthenticated POST to the function URL should answer 401 from the handler.
   - The owner then reads the schedule's runs after the redeploy with `! bash ~/co2-sender-check.sh` (read-only):

     ```bash
     #!/bin/bash
     # Read-only: the sender's last runs after the redeploy (circles of trust, step 4).
     set -euo pipefail
     cd "${REPO:-$HOME/dev/resbite-app}"
     supabase db query --linked "select status, return_message, start_time from cron.job_run_details where jobid = (select jobid from cron.job where jobname = 'deliver-notifications') order by start_time desc limit 5"
     supabase db query --linked "select status_code, content, created from net._http_response order by created desc limit 5"
     ```

   - Each run should succeed, and each call answer HTTP 200 with `"disabled":false`.
5. **Link site (`links/`) to production** (the owner's step, with the recipe of [the phone-key runbook](../phone-key-2026-10-29/README.md)). After step 2.
   - Either order with step 2 is safe. The new page with today's database has no `inviter`, so it uses the host's words, as today.
   - Before the TestFlight build reaches testers, the page must name the inviter. A brought person's link otherwise reads "Ana invited you", which is untrue.

   1. Generate, from the repository root:

      ```
      node --import ./mobile/node_modules/tsx/dist/loader.mjs links/generate.mjs https://link.resbite.com QY833VTUWL com.resbite.app /tmp/resbite-link
      ```

   2. From `/tmp/resbite-link`, link it, then delete the `.env.local` it writes:

      ```
      npx vercel link --yes --project resbite-link --scope creamos
      ```

   3. Note the previous production deployment's id first, for a rollback: the newest Production row of `npx vercel ls --scope creamos`.
   4. Deploy a preview, then check it serves the scripts as JavaScript. The SPA fallback can answer 200 with HTML, which is a failure.

      ```
      npx vercel deploy --yes --scope creamos
      curl -sI <preview>/personal-flow.mjs
      curl -sI <preview>/libphonenumber-min.js
      curl -sI <preview>/countries.mjs
      ```

   5. Then deploy to production:

      ```
      npx vercel deploy --prod --yes --scope creamos
      ```

   6. Check live: `/i/<unknown>` answers 200 "no longer active", and a host's own link still reads "Ana invited you".
6. **TestFlight build** (the owner's step), only after step 2, and with step 5 done before testers get it.
   - Build from the merged head and upload through EAS, as the earlier runbooks do.
   - An installed build keeps working after step 2 (step 2's notes). Hosts on it see the circle nowhere, and their guests see no Bring someone row: every resbite reads as Nobody until a host on the new build sets a circle.
7. **Device checks** (Ana as host, Pedro as guest, and Clara and Juli as the people Pedro brings). Use two phones, signing in as each account in turn where needed. Use tester accounts, and never write a real number in this file. The first check needs only step 2, on the build already installed. The others need steps 2, 4, 5 and 6 and the new build, and run in this order.
   - **Right after step 2, on the installed build.** As a host, the resbite page, the people list and Invite people load as before, with names and the invitation list.
   - **Set the circle.** As Ana, on Invite people, set "2" and "2 levels". The sentence names a guest who is Going: "Pedro can bring 2 people, and each of them can bring 2 more. Only people with a Resbite account."
     - Leave and come back: the card shows the saved choice.
     - The unselected options read clearly (Segmented's ink, 11.66:1).
     - Set Nobody: Pedro's resbite page loses Bring someone. Then set "2" and "2 levels" again.
   - **Bring a connection and a phone contact, on two phones.**
     - As Pedro, Going, the resbite page shows "Bring someone" and "Ana trusts you to bring 2 people. They’re in, no approval needed."
     - Bring Clara in the app. Clara's phone gets the invitation.
     - Before Clara answers, Pedro takes the invitation back on the people list, then brings Clara again. Clara's phone gets the invitation again.
     - Clara's Going reaches Ana as "Clara is going · brought by Pedro." (after step 4).
     - The row now reads "Ana trusts you to bring 1 more person. They’re in, no approval needed."
     - In bring mode, "1 left": once one connection is ticked, the others are dimmed, and VoiceOver says "No invites left" on them. The cap and refusal lines are announced as they appear (iOS only).
     - Bring Juli by number, by WhatsApp. The message reads "Pedro invited you to Ana’s <title>, <when>. Reply here: <link>".
   - **The bringer takes back a link.** Before Juli answers, Pedro opens the people list. Pedro's link shows under Invited, not answered yet, with "brought by you".
     - Send again opens the same message.
     - Remove takes it back, and the resbite page offers Bring someone again.
     - Pedro sends Juli a new link. The web page says "Pedro invited you to Ana’s resbite" (after step 5). Juli answers and is in without approval.
     - Once both invites are used, Pedro's row reads "You brought Clara and Juli", with no chevron.
   - **Check the chain.** On Ana's people list:
     - "Circle of trust: each person brings 2, two levels." under the title;
     - Clara and Juli right under Pedro, indented, each with "Brought by Pedro";
     - before Juli answered, Pedro's link showed as "Number ending ••NN · Invited by link · brought by Pedro", with no number shown.
     - At 320 points wide under Larger Text, a long name at depth 3 wraps beside the dots, never under them.
   - **The host removes a brought person; the bringer cannot bring them back.** Ana removes Clara.
     - Pedro tries to bring Clara again, by connection and by number. Both are refused with "One of these people can’t be brought here. Ask the host."
     - A removal also takes back any live link to Clara's number, Ana's own included (a known gap below).
     - Ana invites Clara in the app: that works, clears the record, and Clara's phone gets the invitation again.
   - **Remove the bringer.** Ana removes Pedro. The question adds "People they brought stay invited." Juli stays, one step up, still "Brought by Pedro".
     - VoiceOver moves to the question when Remove asks it, and to the next row after the remove.
   - **Android, when its build exists.** After a remove, focus moves to the next row (no Modal dismiss event there).

## Applied

Nothing yet. Each step's record goes here when it is done, as in the earlier runbooks. Step 0's answers to CO-Q1 and CO-Q2 go here first.

## Rollback

Only with the owner's approval, in one transaction.

**The full order, newest first.** Chat plan 3, chat plan 2, chat plan 1, circles (this file), follow-ups, connections, creating-a-resbite, then the earlier ones as the creating-a-resbite runbook lists. This list supersedes the "run this first" lines of the follow-ups runbook and of the connections and creating-a-resbite rollbacks' headers, which predate this file.

Every rollback below refuses to run too late, after a rollback that should follow it. Only this file and the follow-ups one also refuse to run too early. **The connections and creating-a-resbite rollbacks have no guard against running before the later rollbacks.** Run each of them only in this order. A refusal changes nothing.

- **The chat rollbacks** come first, when the chat plans ship. This file refuses while `public.messages` exists, with "Roll back the chat migrations before the circles-of-trust rollback" (the plan's Revision 3). Chat plan 1 copies this migration's claim and deletion bodies, and chat plan 2's group lines read `brought_by`.
- **This file** refuses once the follow-ups rollback has run (`private.pair_standing` gone), with "Run the circles-of-trust rollback before the connections follow-ups rollback". Run after it, this file would bring back the roll that one removed.
- **The follow-ups rollback** refuses, with 42501, while the roll, `request_connection` or `my_connections` is not its own body. So it refuses while circles is applied (rehearsed above), with "private.roll_repeating_plans() is not the connections follow-ups body: run the rollbacks of every later migration first".
  - It also refuses once the connections or creating-a-resbite rollback has run, with "Run the connections follow-ups rollback before the connections and creating-a-resbite rollbacks".
- **The connections rollback** refuses once the creating-a-resbite rollback has run, with "Run the connections rollback before the creating-a-resbite rollback". **Nothing stops it running before this file and the follow-ups one.** Then this file still runs, but it restores the connections body of `invite_contacts`, which reads the connections table that rollback dropped. Never run it out of order.
- **The creating-a-resbite rollback** refuses once the phone-key, push or open-link rollback has run, with "Run the creating-a-resbite rollback before the phone-key rollback" and its two like messages. **Nothing stops it running before the later rollbacks either.**
  - On a local replay with both files applied, run first, it committed. It removed 37 objects and changed 30: `public.plan_admins` and the roll were gone, and `private.plan_removals` was left behind.
  - Never run it out of order.

**This file's steps.**

1. **The app first.** Once this file has run, an installed build with the circle can't load a resbite or Invite people. Its plans read selects `bring_invites,bring_levels` and its `readGuests` selects `brought_by,level`, and this file drops those columns. The functions it drops answer that build with errors too.
   - Make a build without the circle the testers' build first, or accept that those screens fail on the circle build until one is.
2. The owner runs the rollback with `! bash ~/co2-rollback.sh`. It checks the hash, then runs the file in one transaction, with no psql `\i`, and takes a fingerprint:

   ```bash
   #!/bin/bash
   # The circles-of-trust rollback. Only with the owner's approval.
   set -euo pipefail
   cd "${REPO:-$HOME/dev/resbite-app}"
   D=qa/circles-of-trust-2026-11-10
   F=supabase/rollback/20261111130000_circles_of_trust.rollback.sql
   echo "0c4f4bc033c632698783b8855e277c33cea52415a88521c74c88479433463146  $F" | sha256sum -c -
   mkdir -p /tmp/co2 && { echo 'begin;'; cat "$F"; echo; echo 'commit;'; } > /tmp/co2/rollback.sql
   supabase db query --linked -f /tmp/co2/rollback.sql
   supabase db query --linked -f supabase/ops/hosted-fingerprint.sql -o json > "$D/hosted-after-rollback.json"
   ```

   - The script stops before running anything if the hash differs.
   - `hosted-after-rollback.json` should equal the follow-ups `hosted-after.json` by definition: 356 of 356, with the same 15 `acl` differences. Wrapped this way, the rollback did exactly that locally.
   - Run again, it fails at its first change, the revoke that reads the `level` column it already dropped, and changes nothing.
3. **What it does.**
   - It deletes no guest and no link. People already brought stay on their resbites as ordinary guests; who brought them and their levels go.
   - The circle numbers and the removal records are lost. A link still live to someone a host removed can then be answered again.
   - **First, it revokes the links guests sent that nobody has answered** (CO-Q2, the default). The `plan_phone_invitations` it restores lists every live link to a host, number included, so a number a guest typed would otherwise reach the hosts.
     - The cost: those invitations stop working. Their page reads as no longer active, and an answer is refused.
     - A guest's link that someone has answered stays live, so its answerer can still change their answer from it. The restored list returns it, number included, to a host who calls that function directly. No app build lists an answered link.
     - The hosts' own links are untouched.
   - It restores ten functions with their grants: `invite_contacts` (connections), five from creating-a-resbite, `decide_join_request` (open-link approval), `fold_web_account` and `claim_notification_deliveries` (push delivery), and the roll (follow-ups). `request_account_deletion` is restored only where it exists, which is local only.
   - It drops the trigger and its function, `private.first_name`, the seven new functions with their six public wrappers, `private.plan_removals` and the six new columns.
   - It locks the three tables first. Reads of them wait until it commits.
4. **The roll job stays.** The restored roll is the follow-ups one, which carries every guest. Unschedule it only if the follow-ups rollback follows, as that runbook's step 1 says.
5. **The sender and the link site need nothing.** The restored claim sends no `brought_by_name`, so the redeployed sender words answers as before. The new web page with no `inviter` uses the host's words.
6. Remove this migration's line from `supabase/tests/hosted-baseline/migrations.txt`.
   - The hosted migration history row stays, as the earlier rollbacks left theirs. Never run `supabase migration repair --status reverted`.

## Known gaps

Accepted during the build; none blocks the rollout.

- **A missed "is going" (pre-existing).** A host removes a guest and later invites them again. The fresh guest row starts at version 1, so its first answer's push key repeats the earlier one, and the host misses that one "is going".
- **The fold can undo a host's invitation.** Guest rows have no creation time. If a host removed someone's web-only account, then invited their app account in the app before the person folded the two, the fold takes that invitation off. The person needs another invitation. Rare.
- **The fold's order.** Inside the fold, the trigger closes the app account's waiting request on an occurrence before step 2d takes the account off that occurrence. Very rare: the web account must have answered a guest's link there.
- **Old waiting pairs.** A guest row beside a waiting request, from before this migration, stays on hosted. The people list hides the request, and a Decline of it is refused. Step 1 counts them.
- **A removal takes back the host's own link too.** Removing or declining someone revokes every live link to their confirmed number on that resbite, the host's own included. The host's list loses that link.
- **A link answered by an account that is later deleted (for the release that brings deletion to hosted).** The link stays live and answered: the deletion takes the answerer's guest row off, and the link's answerer becomes empty when the account goes.
  - The bringer's invite frees, since `used` counts only unanswered links and the guest rows still in. So the bringer can send that link again, uncounted.
  - Deletion is local only today (the migration's section 6). That release should also revoke the links the account answered.
- **Deferred minors.** A link's message and Send again write the time in the phone's zone, not the resbite's (pre-existing). `fold_web_account` does not move `brought_by`; a web-only account cannot bring.

## Accepted risks and the owner questions

Copied from the plan; CO-Q2 came after it.

- **Owner question, CO-Q1.** The roll carries every guest (CH-P20), so a brought person who said Can't go comes back pending with their bringer. The bringer's `used` on the next occurrence can exceed `allowed` (shown as no invites left, `remaining` 0).
  - Built that way by default (CO-Q1). The roadmap's owner table asks the owner before the circles migration (step 0).
  - The alternative, not carrying a brought person who said Can't go, is one condition in the roll.
- **Owner question, CO-Q2.** Keep the bringers' unanswered links live after a rollback, showing their numbers to hosts? By default the rollback revokes them before it restores the hosts' list of links, so no number a guest typed reaches a host, and those invitations stop working (step 0).
  - The alternative is one statement out of the rollback, and a new rollback hash.
- A bringer learns `already` for a number whose holder is on the resbite, spending nothing. Bringers already read every name (`attendee_read`), and `contacts_on_resbite` was already open to every tester.
- Anyone holding a forwarded personal link sees the bringer's first name. The phone-key check is unchanged, so neither lets anyone in.
- **Lock order, one account.** On hosted, where `require_tester` takes no lock, both `invite_contacts` branches take the plan row and then the caller's advisory lock. `answer_phone_invitation` takes them the other way round. The same account inviting and answering on one plan at the same instant could deadlock (40P01). Improbable, and hosts can already do it today.
- **Lock order, two accounts.** `decide_join_request` takes the host's and the requester's advisory locks, then the plan row. A host deciding the request of a guest who is bringing someone at the same instant can deadlock with them on hosted. Rare, and a retry works.
- **Lock order, the fold.** Its step that takes a removed account off can deadlock with a host's `remove_guest` of that account at the same instant. Either retry is harmless.
- A bringer learns `already` when someone else's live link already reaches the number, spending nothing: someone invited that number, not who.
- A bringer can infer that a host removed or declined someone, or that the person is waiting at the host's door. Bringing that one person is refused with 42501 while their allowance says they may bring. The message is the same as every other refusal and names nobody.
- A host sees a bringer's unanswered link only as "Number ending ••23 · Invited by link · brought by Sol": no name, no channel.

## Not done here

No hosted change, no function deployment, no link-site deployment and no TestFlight upload. Nothing was pushed.
