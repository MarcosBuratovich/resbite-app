# Chat: release runbook (12 November 2026)

- **Spec:** [Groups and chat design](../../docs/superpowers/specs/2026-11-10-groups-and-chat-design.md) (CH-D1 to CH-D6, CH-P1 to CH-P19; screens CH-01 to CH-08; mockup `group-chat.html`).
- **Plans:** [chat 1, core](../../docs/superpowers/plans/2026-11-11-chat-1-core.md), [chat 2, groups](../../docs/superpowers/plans/2026-11-11-chat-2-groups.md) and [chat 3, safety](../../docs/superpowers/plans/2026-11-11-chat-3-safety.md). The [roadmap](../../docs/superpowers/plans/2026-11-11-roadmap-connections-groups-chat.md) (Phase 3) ships the three in **one release**.
- **Code:** chat core is on branch `ch1-core`, stacked on the circles branch `co2-circles-of-trust`. **Nothing is applied to the hosted project, Supabase functions, the Realtime settings, Vercel, EAS or TestFlight.** Every step below needs the owner's explicit approval when it is done. This task executed none of them.

**This runbook is written in parts.** This file holds chat core (plan 1). Plans 2 and 3 add their own sections, files and steps, and plan 3 completes the release order. Until then, nothing here is run.

**Chat core is not meant to go live on its own** (plan Decision 4).
- Until plan 2 lands, a repeating series follows the one-off rules on its current occurrence.
- Until plan 2's roll sets its flag, the real weekly roll writes an `admin` line, with no actor, into the chat for each admin it carries (`private.plan_admins_chat_lines`, `supabase/migrations/20261111140000_chat_core.sql:960-969`).
- Report and block (plan 3) must ship with any chat (App Store guideline 1.2, CH-P13).
- So the three migrations go in one sitting, in order, and the app reaches testers in one TestFlight build.

## What is built (chat core)

- **One hosted-compatible migration**, `20261111140000_chat_core.sql`. It depends on the files in `supabase/tests/hosted-baseline/migrations.txt`, the follow-ups migration and the circles migration. It calls `private.first_name` (circles) and copies the circles bodies of the claim, the fold and the deletion request.
  - It writes one row per existing series into `public.chats` (the backfill, line 88) and nothing else.
  - It never creates Realtime. It uses the hosted project's `realtime.send` and `realtime.messages`. Locally a stub in `supabase/tests/local/bootstrap.sql` stands in.
- **Four tables**, each with RLS on, no policy and no grant to any API role (lines 29-106): `public.messages`, `public.chats` (one row per series, with `is_group` false throughout plan 1), `public.chat_reads` and `public.chat_mutes`. The app reads and writes only through functions (Decision 2).
- **Who is in a chat** is computed on the series' current occurrence (`private.chat_member`, line 123): the owner, the admins, and guests who are Going or Maybe. A one-off's chat closes 48 hours after its end, or at once when cancelled (`private.chat_closes_at`, `private.chat_open`, lines 147-160).
- **Ten calls for signed-in accounts:**
  - the reads: `chat_summary`, `chat_messages`, `chat_messages_since` and `my_chat_overview`;
  - the writes: `send_message`, `send_announcement`, `delete_message`, `remove_message`, `mark_chat_read` and `set_chat_mute`.
  - Each public call is an invoker over a private definer with an empty `search_path`.
- **Writing** (lines 433-551):
  - a repeat of a client id returns the stored row, even after the close;
  - 1 to 1,000 characters with at least one visible (`private.chat_body`, line 422);
  - 30 messages and announcements a minute per person (`22023 'Slow down'`), and one announcement a minute per person per chat (`22023 'Too fast'`).
- **One push a minute is decided when the message is written** (Decision 6). Under the chat's lock, `send_message` queues no `chat_message` notice for a person who already has one for that chat from the last 60 seconds (lines 483-490). An announcement is always queued for its audience.
- **Delete and remove** (lines 562-596) keep the row and drop the words. Both work after the close (K-S17, the owner's question in step 0). A host's own message is deleted, never removed.
- **System lines** are written by triggers on `public.attendees`, `public.plans` and `public.plan_admins`, in the same transaction as the change (lines 872-969): joined, can't go, admin, changed and cancelled. The roll's and the deletion's flag (`resbite.system`) silence them.
- **The live signal.** `private.messages_signal` broadcasts `{id, kind, state}` on the private channel `chat:<series_id>` after every insert or update of a message (lines 1077-1087).
  - Its `perform realtime.send(...)` sits in a block that turns any error into a WARNING (lines 1079-1083). So a broadcast never stops a write.
- **The Realtime policy** `chat_members_listen` on `realtime.messages` (lines 1106-1108), for reading, to `authenticated`. Three conditions must hold:
  - the row is a broadcast;
  - the row is on the very topic being joined;
  - `private.can_listen` allows it. `can_listen` (lines 1093-1101) requires the topic to be exactly `chat:<lower-case uuid>` before any cast, the caller to pass `private.user_eligible`, and the caller to be in that chat now.
- **The notices.** Two new outbox kinds, `chat_message` and `announcement`, each with its `message_id` (line 369). Who may be told gets a chat branch (lines 640-680):
  - the message is still sent and its plan is not cancelled;
  - a `chat_message` is under an hour old, and its recipient is in the chat and has not muted it;
  - an announcement is under a day old, and its recipient is in its audience now;
  - Mute this resbite silences both.
- **The sender's side of the database.**
  - The claim expands every other kind before the chat kinds (line 698), so a change is never queued behind a lively chat.
  - It returns `series_id`, `message_id`, `message_body` and `audience` (lines 739-741).
  - `finish_notification_delivery` gains the outcome `deferred` (lines 758-781): a job the sender could not start goes back to pending at once, and the attempt the claim counted is given back.
- **Account deletion**, only where the local deletion lifecycle exists (`to_regprocedure` guard, lines 792-855). On the hosted project there is none, and nothing is done.
  - The flag goes up first (line 815).
  - A deleted account's messages and announcements then lose their words and their author (line 844).
  - Its reads and mutes go (line 846).
- **The fold** (`fold_web_account`, line 976) moves a web account's messages and its place in the chat's lines to the app account (lines 1055-1063).
- **The sender** (`supabase/functions/_shared/`, rides the redeploy of step 4):
  - **The words** (`notification-copy.ts:159-172`). A chat push reads "<first name>: <words>" and an announcement "Announcement from <first name>: <words>", under the resbite's title.
    - The words are made one clean line and cut at 120 graphemes, and the name at 30.
    - With no name or no visible words, the push is the generic one.
  - **The tap data** (`notification-engine.ts:68-76`). A chat push's data is `{type: "chat", seriesId, planId, notificationId}`. A chat job without a valid series id is never sent (lines 86-95).
  - **The claim loop.** The first claim takes 25, later claims take 10, and no claim, send or receipt check starts once 5 seconds have passed (`budgetMs = 5_000`, `notification-engine.ts:131-174`). Each claimed job not yet started is finished as `deferred`.
- **The app** rides the TestFlight build (step 6):
  - the `/chat` screen;
  - the Chat row on the resbite page;
  - the unread dot and the announcement line on My resbites;
  - push taps and in-app banners for chat;
  - the When sheet's "The chat closes 48 hours after the end time.";
  - the notification ask on a chat's first open;
  - the Chat messages topic on Data & privacy.
  - The sample conversation is gone.

The decisions and the calls made while building are in the [decision log](../../knowledge-base/08-decisions.md), under Chat core.

## Files and hashes

| File | sha256 |
| --- | --- |
| `supabase/migrations/20261111140000_chat_core.sql` | `a7421f307cdf73bad0493bf01cf5c86ceb7292719a1d27f2a60c8296da79a079` |
| `supabase/rollback/20261111140000_chat_core.rollback.sql` | `d212e53eacb904a260bbdd3c371ddc7424829ea7a5b7d6c98b3e7c89fb132214` |
| `supabase/tests/hosted-baseline/20261111140000_chat_core.before.sql` | `e498c9f396a5fb1371422f9cb7f00e39ac900edc51e08aadb2a73d33d3c64db6` |
| `supabase/tests/hosted-baseline/20261111140000_chat_core.after.sql` | `cabc541b71e8300a683e9582a6de351687664f65ebdfea36ba138b35dcc5010d` |
| `supabase/migrations/20261111120000_connections_follow_ups.sql` (applied by [its runbook](../connections-follow-ups-2026-11-11/README.md)) | `72d1536db56c956ade36844c9d4c715fffa9222090c0cb64226166fff39ae3d6` |
| `supabase/migrations/20261111130000_circles_of_trust.sql` (applied by [its runbook](../circles-of-trust-2026-11-10/README.md)) | `04062e2b091fa582f59a3d1ff9a322e8019ce671c64d532d5c113d0916d77256` |
| `supabase/ops/hosted-fingerprint.sql` (unchanged) | `0778c53f98bc1cbdcee82487651dabc3fa246674a5d0efa1d6502e7746819a00` |
| `supabase/ops/hosted-counts.sql` (unchanged) | `15fe76aecba6bb5104d8795338c1ecaee9bd07ec9a2a9b7aba728e2bdae8c4a0` |
| `supabase/ops/schedule-deliver-notifications.sql` (unchanged; step 0's question) | `b87d60d02b78bc7e0603b563bbc71492385c03ee0540427b952759645524608a` |

The before/after pair is the rehearsal, run locally only. Recompute before asking for approval (`sha256sum <file>`). Approve by file name and hash, and stop if a hash differs.

## Checks made locally (12 November 2026)

All of these ran on `ch1-core` at `99d4035`, with chat core's eight build tasks combined.

- Full mode passes, 44 PASS lines: 29 SQL files, 14 race lines and the final line. They include `chat.sql` and `chat-send-concurrency.sh`, whose five lines cover these races:
  - the same message sent twice at once is one row;
  - a send meeting its own commit returns that row;
  - two writers give each member exactly one chat notice;
  - a removal and an account deletion queue on the chat's row;
  - a host losing the role while a removal waits is refused.

  ```
  bash scripts/test-database-docker.sh
  ```

  - Six `messages_signal: no broadcast for message …` WARNINGs are expected (`chat.sql:1906-1934`). They come from the tests that break `realtime.send` on purpose: each write still commits.
- The hosted baseline passes with the three candidates named, in order, 25 PASS lines. Each before file passes on the baseline, each migration applies and each after file passes.

  ```
  bash scripts/test-database-docker.sh --hosted-baseline supabase/migrations/20261111120000_connections_follow_ups.sql supabase/migrations/20261111130000_circles_of_trust.sql supabase/migrations/20261111140000_chat_core.sql
  ```

  - Name all three. Bare, this mode fails by design until all three are live: `tests.txt` lists their tests.
  - `.before.sql` asserts step 1's Realtime checks against the stub: `realtime.send(jsonb,text,text,boolean)` resolves, `realtime.messages` has `extension` and `topic`, and no policy exists in `realtime`.
  - `.after.sql` asserts:
    - exactly one policy on `realtime.messages`;
    - no role holds any table privilege on the four tables or the id sequence;
    - the ten calls are for `authenticated` only, and every private function is a definer with an empty `search_path`;
    - the seven triggers;
    - the redefined functions keep their grants.
  - It then rehearses the rollback in a transaction it rolls back. The guard refuses while a stand-in `private.series_leaves` exists, and changes nothing. Run for real, the rollback restores each redefined function, the outbox's check, columns and indexes and the triggers exactly, and removes the policy, the four tables, the functions and the chat notices. The resbites, the guest and an ordinary notice stay.
- The app check passes: the typecheck, 1,024 tests in 92 runs, and the content validation.

  ```
  (cd mobile && npm run check)
  ```

- Every edge test file passes, 11 files and 107 tests, run from the repository root:

  ```
  node --import ./mobile/node_modules/tsx/dist/loader.mjs --test $(find supabase/functions -name "*.test.ts" | sort)
  ```

- **The browser scripts** passed during the build, against a fake project URL with every Supabase request stubbed. They were not run again for this task. The last runs are `verify-chat.mjs` 44, `verify-event.mjs` 23, `review-ui.mjs`, `verify-rsvp.mjs`, `verify-circle.mjs`, `verify-connections.mjs`, `verify-contact-invites.mjs`, `verify-planning.mjs` and `verify-account.mjs`. The Realtime socket is answered by `page.routeWebSocket`.
- **The fingerprint, on a local replay** (Docker, `supabase/ops/hosted-fingerprint.sql` with `psql --csv`).
  - `migrations.txt` alone gives 355 objects. With the follow-ups file there are 356, and with circles 387.
  - With chat core there are 464. From 387, 77 objects are added:
    - 41 functions: the ten public calls with their ten private bodies, and 21 private helpers and trigger functions;
    - the four tables, and 14 constraints and 11 indexes (the outbox's `message_id` foreign key and its two new indexes among them);
    - the seven triggers.
  - Six change by definition: `claim_notification_deliveries`, `finish_notification_delivery`, `private.fold_web_account`, `private.notification_recipient_eligible`, the outbox table (its `message_id`) and its `notification_outbox_kind_check`.
  - Nothing is removed and no grant changes. On the replay, which has no plans, `public.chats` has 0 rows.
  - The fingerprint covers `public` and `private` only. The Realtime policy is outside it, so steps 1 and 3 check it by its own queries.
  - The rollback, wrapped as below, gives back the 387 exactly, and leaves no policy in `realtime`. Run again, it passes its guard, fails at its `lock table` (`public.messages` is gone), and changes nothing.
- **The scripts below, rehearsed.** Each ran on a local replay through a stand-in for the CLI that sends each query to the local database. Small stand-ins took the place of the history table, `cron.job`, `cron.job_run_details` and `net._http_response`, which only hosted has. Two testers each owned a one-off.
  - With circles not yet applied, `ch1-apply.sh` refused with "The circles-of-trust migration is not applied: run its runbook first" and changed nothing.
  - With circles applied, `ch1-before.sh` read `send_resolves` true, `columns_found` 2, `realtime_policies` 0, `realtime_usage`, `may_send` and `may_add_policy` true, and `series` 2.
  - `ch1-apply.sh` applied and wrote the seven snapshot files. Run again, it refused with "The chat core migration is already applied" and changed nothing.
  - `ch1-after-checks.sh` read one policy and the chat policy; the signal's owner `postgres`, a definer with `search_path=""` that may use `realtime` and call `realtime.send`, its failure a warning; `members_may_ask` true, `anon_may_ask` and `chat_member_granted` false; and `chats` 2 = `series` 2, `groups` 0, `messages` 0.
  - `ch1-listen-check.sh`, for one tester: their own chat true, the other tester's false, their own topic in capitals false. A malformed id stopped it before any query.
  - After one broadcast, the step 7 count read 1.
  - `ch1-throughput.sh`, on five sample answers (clean, clean with `deferred` 4, cut short by a later claim, 503, timed out), read `clean` 2, `cut_short` 1, `failed_or_timed_out` 2 and `deferred` 4.
  - `ch1-rollback.sh` left `realtime_policies` 0. Run again, it failed at its `lock table` and changed nothing.

## Rollout runbook

**Before this runbook.** The follow-ups and circles migrations are live by their own runbooks: the history reads `21 | 20261111130000`. Chat core refuses to apply otherwise (step 2's guard). If their sender redeploys are still pending when this sitting comes, step 4 here carries their words too.

**Order.** The steps below, by their numbers:

0. The owner's answers to the owner questions.
1. Before snapshot, with the Realtime checks.
2. The migration (with plans 2 and 3, once their sections exist).
3. After snapshot, the Realtime checks, advisors.
4. The `deliver-notifications` redeploy.
5. Realtime "Allow public access" off.
6. The TestFlight build. Testers update before anyone chats.
7. The device checks.
8. The throughput check during the first busy chat hour.

- **The migration goes before the sender** (step 4 after step 2).
  - The hosted `finish_notification_delivery` refuses the new outcome `deferred` until this migration is live (`supabase/migrations/20261030120000_push_delivery.sql`, restored by the rollback at `supabase/rollback/20261111140000_chat_core.rollback.sql:239-260`).
  - The new sender hands back every job it could not start before its budget ran out, as `deferred`. Against the old finish that hand-back fails. The job stays leased as `sending`, and the claim marks it `unknown` once the lease ends, so it is never sent.
- **The migration and the sender go before the build.** The chat build calls the ten functions and joins `chat:<series>`. The build reaches testers only once Realtime's public access is off (step 5).

**Owner-run scripts.** The assistant's safety check refuses live reads and the apply, so the owner runs short scripts with `! bash ~/<name>.sh`.
- At rollout time the assistant writes each script into the home directory from the block in its step. The owner reads it, then runs it.
- Each runs from the checkout the rollout uses: `REPO`, by default `~/dev/resbite-app`, at the merged commit.
- None prints a secret, a phone number or an account id.

**The assistant's steps.** The advisors read (through the Supabase MCP server) and the `deliver-notifications` deploy are the assistant's. It does each once the owner approves it, as the connections record did.

0. **The owner questions, before step 2.** Record each answer under "Applied". With no answer, the defaults ship.
   - **K-S17, Delete and Remove on a closed chat.** By default an author deletes their own message, and hosts remove anyone's, after the chat closes (plan Decision 7; `delete_message` and `remove_message` check no close, `supabase/migrations/20261111140000_chat_core.sql:562-590`). The reasoning: "reading only" means no new messages, and moderation and a person's own words should not expire with the chat.
     - **Built that way by default.** The alternative, refusing both after the close, is one check in each function, and a new migration hash.
   - **The sender's budget and the schedule's timeout** (an offer, as one change).
     - The schedule calls the sender with a 10-second pg_net timeout (`timeout_milliseconds := 10000`, `supabase/ops/schedule-deliver-notifications.sql:44`).
     - The claim loop starts nothing new once 5 seconds have passed (`budgetMs = 5_000`, `supabase/functions/_shared/notification-engine.ts:136`).
     - Each provider or journal call may take up to 10 seconds (`AbortSignal.timeout(10000)`, `supabase/functions/_shared/notification-adapters.ts:23` and `:78`). So a send started just before 5 seconds can run to about 15, past the caller's 10. That call is then recorded as timed out. A send cut off mid-way stays leased as `sending`, and the claim marks it `unknown` after the two-minute lease, never sent again (`supabase/migrations/20261111140000_chat_core.sql:708-710`).
     - The offer: raise the schedule's timeout (re-run the ops file with a larger `timeout_milliseconds`) and the loop's budget (a sender change and a redeploy) together, so the budget plus one call stays under the timeout.
     - **Default: unchanged** (10 seconds and 5). Step 8's `deferred` and `failed_or_timed_out` counts show whether it matters. Neither file is changed by this runbook.
   - **The words on the lock screen (CH-P7).** A chat push shows the message's words ("Leo: I can bring the snacks"). The alternative is "Leo sent a message".
     - **Built that way by default**, as the roadmap's owner table says. The alternative is a sender change and a redeploy.
   - Plans 2 and 3 add their own questions here (for example the support address, the moderators and the blocked terms).
1. **Before snapshot, the history, the Realtime checks and the series count.** Read-only, into this directory, with `! bash ~/ch1-before.sh`:

   ```bash
   #!/bin/bash
   # Read-only: the before snapshot, the history, the Realtime checks, the series count and the jobs (chat core, step 1).
   set -euo pipefail
   cd "${REPO:-$HOME/dev/resbite-app}"
   D=qa/chat-release
   supabase db query --linked -f supabase/ops/hosted-fingerprint.sql -o json > "$D/hosted-before.json"
   supabase db query --linked -f supabase/ops/hosted-counts.sql -o json > "$D/hosted-counts-before.json"
   supabase db query --linked -o json "select policyname, cmd, qual, with_check from pg_policies where schemaname = 'storage' order by policyname" > "$D/hosted-storage-policies-before.json"
   supabase db query --linked "select count(*) as applied, max(version) as latest from supabase_migrations.schema_migrations"
   supabase db query --linked "select pg_catalog.to_regprocedure('realtime.send(jsonb,text,text,boolean)') is not null as send_resolves, (select count(*) from information_schema.columns where table_schema = 'realtime' and table_name = 'messages' and column_name in ('extension', 'topic')) as columns_found, (select count(*) from pg_catalog.pg_policies where schemaname = 'realtime') as realtime_policies"
   supabase db query --linked "select current_user as applying_role, has_schema_privilege(current_user, 'realtime', 'usage') as realtime_usage, has_function_privilege(current_user, 'realtime.send(jsonb,text,text,boolean)', 'execute') as may_send, pg_catalog.pg_get_userbyid(c.relowner) as messages_owner, pg_catalog.pg_has_role(current_user, c.relowner, 'USAGE') as may_add_policy from pg_catalog.pg_class c where c.oid = 'realtime.messages'::regclass"
   supabase db query --linked "select count(distinct series_id) as series from public.plans"
   supabase db query --linked "select jobname from cron.job where jobname in ('deliver-notifications', 'roll-repeating-plans') order by jobname"
   ```

   - **The history line** should read `21 | 20261111130000`: follow-ups and circles are live. With `19` or `20`, finish the circles runbook first. Anything else: stop.
   - **The fingerprint.** Compare `hosted-before.json` with a local replay of `migrations.txt` plus the follow-ups and circles files, by `(kind, name)`.
     - Expect 387 of 387 by definition, as in the circles `hosted-after.json`.
     - The only differences should be the 15 known `acl` ones: hosted's default `service_role` grant on 14 older `public` objects, and `public.unregister_device(text)`.
     - **Confirm from the real snapshot before approving.** Stop if anything else differs. A full match also means the chat rollback will meet the bodies it was rehearsed on.
   - The storage policies should match the replay, 7 of 7.
   - **Realtime as the migration needs it (K-S5).** Stop on any other answer.
     - `send_resolves` true, `columns_found` 2 and `realtime_policies` 0.
     - `realtime_usage` and `may_send` true for the role the CLI applies with. That role owns `private.messages_signal`, the definer that calls `realtime.send`.
       - Without them nothing fails: every broadcast becomes a WARNING and the write commits (lines 1079-1083). But no phone hears a signal, and every open chat waits for its 20-second poll.
     - `may_add_policy` true: that role may act as `realtime.messages`' owner, which `create policy` needs. Without it the apply fails at the policy and rolls back whole.
     - If `to_regprocedure` reads false, the `may_send` query fails instead, and the script stops there.
   - **The series count** is what step 3's `public.chats` row count should be (the backfill), plus any resbite made in between.
   - **The jobs.** `deliver-notifications` should be listed. `roll-repeating-plans` is listed if the follow-ups runbook created it.
     - With the roll job and chat core but not plan 2, the roll writes an `admin` line for each carried admin (Decision 4). That is one reason chat core waits for plan 2.
   - If the CLI's role is refused the `realtime` or `private` reads, paste the queries into the SQL editor. They are read-only there too.
2. **Migration** (the owner approves the file by name and sha256, above, in the release sitting with plans 2 and 3). Never `supabase db push`: it would also push the local-only migrations. Run `! bash ~/ch1-apply.sh`. It checks the hash, applies in one transaction, records, and takes step 3's snapshots:

   ```bash
   #!/bin/bash
   # The chat core migration (steps 2 and 3). Only after the owner approves the file by name and sha256, in the release
   # sitting with chat plans 2 and 3: chat core is not meant to go live on its own.
   set -euo pipefail
   cd "${REPO:-$HOME/dev/resbite-app}"
   D=qa/chat-release
   F=supabase/migrations/20261111140000_chat_core.sql
   echo "a7421f307cdf73bad0493bf01cf5c86ceb7292719a1d27f2a60c8296da79a079  $F" | sha256sum -c -
   GUARD="if pg_catalog.to_regclass('private.plan_removals') is null or pg_catalog.to_regprocedure('private.first_name(text)') is null then raise exception 'The circles-of-trust migration is not applied: run its runbook first'; end if;
    if pg_catalog.to_regclass('public.messages') is not null then raise exception 'The chat core migration is already applied'; end if;"
   mkdir -p /tmp/ch1
   { echo 'begin;'; echo "do \$\$ begin $GUARD end \$\$;"; cat "$F"; echo; echo 'commit;'; } > /tmp/ch1/apply.sql
   supabase db query --linked -f /tmp/ch1/apply.sql
   supabase migration repair --status applied 20261111140000 --linked --yes
   supabase db query --linked "select count(*) as applied, max(version) as latest from supabase_migrations.schema_migrations"
   supabase db query --linked -f supabase/ops/hosted-fingerprint.sql -o json > "$D/hosted-after.json"
   supabase db query --linked -f supabase/ops/hosted-counts.sql -o json > "$D/hosted-counts-after.json"
   supabase db query --linked -o json "select policyname, cmd, qual, with_check from pg_policies where schemaname = 'storage' order by policyname" > "$D/hosted-storage-policies-after.json"
   supabase db query --linked -o json "select policyname, cmd, roles, qual, with_check from pg_policies where schemaname = 'realtime' order by policyname" > "$D/hosted-realtime-policies-after.json"
   ```

   - The script stops before applying if the hash differs.
   - Everything runs in one transaction, the guard first. Before circles, or a second run, the guard refuses and changes nothing. Any other error rolls all of it back too, and the script stops before the history repair.
   - If the apply succeeded and only the repair failed, run the repair alone, from the repository root. Then run the script's last five lines, for the history and step 3's snapshots.

     ```
     supabase migration repair --status applied 20261111140000 --linked --yes
     ```

   - The history query should then read `22 | 20261111140000`. When plans 2 and 3 complete this runbook, their files follow in the same sitting, in order.
   - **Locks, all brief.**
     - `private.notification_outbox`: the new column and its foreign key, the kind check re-added (it reads every row once) and two indexes.
     - `public.plans`, `public.attendees` and `public.plan_admins`: the new triggers.
     - `realtime.messages`: the new policy.
     - The schedule's run in that minute may wait for the commit. That is harmless.
   - **Installed builds keep working.** They call nothing this migration made or changed, and they read the same plans and guests.
     - A chat notice can only exist once someone writes in a chat, which needs the new build.
     - Until step 4, the old sender would word such a job with the generic text and a `plan_update` tap.
3. **After snapshot, the Realtime checks and advisors.**
   - `hosted-after.json` should match a local replay of `migrations.txt` plus the three files: 464 of 464 by definition, with the same 15 `acl` differences.
   - **Before to after**, by `(kind, name)`, as listed under the checks above: 77 added and 6 changed. Nothing is removed and no grant changes. `.after.sql` asserts the same shape locally.
   - **Counts.** Four tables more:
     - `messages`, `chat_reads` and `chat_mutes` with 0 rows;
     - `chats` with step 1's series count, plus any resbite made in between.
     - Every other table keeps its row count. The storage policies are unchanged, 7 of 7.
   - **Realtime after the migration (K-S5).** Read-only, with `! bash ~/ch1-after-checks.sh`:

     ```bash
     #!/bin/bash
     # Read-only: the Realtime policy, the signal's definer and the chat rows after the migration (chat core, step 3).
     set -euo pipefail
     cd "${REPO:-$HOME/dev/resbite-app}"
     supabase db query --linked "select count(*) as realtime_policies, count(*) filter (where policyname = 'chat_members_listen' and cmd = 'SELECT' and roles = '{authenticated}'::name[] and qual like '%can_listen%' and qual like '%topic%' and with_check is null) as the_chat_policy from pg_catalog.pg_policies where schemaname = 'realtime'"
     supabase db query --linked "select pg_catalog.pg_get_userbyid(p.proowner) as signal_owner, p.prosecdef as definer, p.proconfig as settings, has_schema_privilege(p.proowner, 'realtime', 'usage') as owner_realtime_usage, has_function_privilege(p.proowner, 'realtime.send(jsonb,text,text,boolean)', 'execute') as owner_may_send, p.prosrc like '%exception when others then%raise warning%' as failure_is_a_warning from pg_catalog.pg_proc p where p.oid = 'private.messages_signal()'::regprocedure"
     supabase db query --linked "select has_function_privilege('authenticated', 'private.can_listen(text)', 'execute') as members_may_ask, has_function_privilege('anon', 'private.can_listen(text)', 'execute') as anon_may_ask, has_function_privilege('authenticated', 'private.chat_member(uuid,uuid)', 'execute') as chat_member_granted"
     supabase db query --linked "select (select count(*) from public.chats) as chats, (select count(distinct series_id) from public.plans) as series, (select count(*) from public.chats where is_group) as groups, (select count(*) from public.messages) as messages"
     ```

     - **Exactly one policy on `realtime.messages`:** `realtime_policies` 1 and `the_chat_policy` 1. `hosted-realtime-policies-after.json` holds its text. It should read as lines 1106-1108: a broadcast, on the topic being joined, that `private.can_listen` allows.
     - **The signal's definer:**
       - `signal_owner` is step 1's `applying_role`, `definer` true, and `settings` holds `search_path=""`;
       - `owner_realtime_usage` and `owner_may_send` are true;
       - `failure_is_a_warning` is true: the call is wrapped, so a failure raises a WARNING and never fails the write.
     - `members_may_ask` true, `anon_may_ask` false and `chat_member_granted` false (K-N13).
     - `chats` equals `series` (plus any made in between), `groups` 0 (plan 1 sets none) and `messages` 0.
     - A real `realtime.messages` row needs a real message, so it is checked in step 7.
   - **Advisors.** Once the owner approves, the assistant reads them (security and performance) through the Supabase MCP server, into `hosted-advisors-after.json`.
     - Compare with the newest earlier `hosted-advisors-after.json` (circles' if it was taken, else connections': 42 findings, 10 WARN, the rest INFO, no ERROR).
     - **Expected: no new WARN and no ERROR.** The ten public calls are invokers. Their private bodies and every other new function are definers in `private`, with an empty `search_path`. So neither `*_security_definer_function_executable` lint gains a line.
     - **New INFO lines are expected, of kinds the file already has.**
       - `rls_enabled_no_policy` for the four new public tables, `messages`, `chats`, `chat_reads` and `chat_mutes`: RLS on and no policy (Decision 2). No API role may read or write them.
       - `unindexed_foreign_keys` for `messages_plan_id_fkey`, `chat_reads_user_id_fkey` and `chat_mutes_user_id_fkey`. No index leads with those columns (lines 45-49, 91-104); they serve only cascades and the deletion step.
       - `unused_index` for the plain new indexes until they are used: `messages_series_idx`, `messages_series_updated_idx`, `messages_series_announcements_idx`, `messages_author_created_idx`, `notification_outbox_recipient_kind_idx` and `notification_outbox_message_idx`.
     - Unused-index notices can also come and go with use alone. Stop the rollout for anything else new.
   - Append this line to `supabase/tests/hosted-baseline/migrations.txt`:

     ```
     20261111140000_chat_core.sql                           20261111140000
     ```

   - Then run the baseline with no candidate. It must pass from now on, once plans 2 and 3's lines are appended too (their tests are in `tests.txt` by then):

     ```
     bash scripts/test-database-docker.sh --hosted-baseline
     ```

4. **Redeploy `deliver-notifications`, after step 2.** It carries Task 4's chat words, the chat tap data and the claim loop with its `deferred` hand-back. It also carries the follow-ups and circles wording if their redeploys are still pending. Once the owner approves it, the assistant runs the deploy from the repository root:

   ```
   supabase functions deploy deliver-notifications --no-verify-jwt --project-ref ewcsgvhuojxdpaspwsrx
   ```

   - **Not before step 2:** the old finish refuses `deferred` (the Order notes above).
   - `--no-verify-jwt` is required: without it the schedule's calls are refused. The secrets and the Vault entries stay as they are.
   - Afterwards the function list should show `deliver-notifications` ACTIVE and `verify_jwt` false. Its version is one more than the version before this redeploy.
   - Record under "Applied" the version before and the commit it was deployed from: a rollback puts that sender back first (Rollback, step 2).
   - An unauthenticated POST to the function URL should answer 401 from the handler (`supabase/functions/deliver-notifications/handler.ts:16-21`).
   - The owner then reads the schedule's runs after the redeploy with `! bash ~/ch1-sender-check.sh` (read-only):

     ```bash
     #!/bin/bash
     # Read-only: the sender's last runs after the redeploy (chat core, step 4).
     set -euo pipefail
     cd "${REPO:-$HOME/dev/resbite-app}"
     supabase db query --linked "select status, return_message, start_time from cron.job_run_details where jobid = (select jobid from cron.job where jobname = 'deliver-notifications') order by start_time desc limit 5"
     supabase db query --linked "select status_code, timed_out, error_msg, content, created from net._http_response order by created desc limit 5"
     ```

   - **The answer's shape** (`handler.ts:22-35`, `notification-engine.ts:171-173`). Read the status and the `error` field together:
     - HTTP 200 with `{"disabled":false,"processed":N,"deferred":M}` is a clean run. `deferred` counts the jobs handed back for the next run.
     - HTTP 200 with an `"error":"Notification claim failed"` field is a run that a later claim cut short. What it did stands, and the jobs it did not reach wait for the next run. **It is not a clean run, though its status is 200.**
     - HTTP 503 with `{"error":"Notification processing incomplete"}` is a run whose first claim failed. A 401 means the secret is wrong. `{"disabled":true,…}` means delivery is switched off.
     - Each run should succeed, and each call should answer 200 with `"disabled":false` and no `error` field.
5. **Realtime "Allow public access" off** (the owner, in the dashboard's Realtime settings, CH-P10), before the build reaches testers.
   - With it off, only private channels may be joined, so every join passes the policy of step 3.
   - Chat is the only Realtime use in the app (`mobile/src/state/chatSession.ts:960`, a private channel), so nothing else changes.
   - Record the change and its time under "Applied".
6. **TestFlight build** (the owner's step), only after steps 2, 4 and 5, and with plans 2 and 3 in it.
   - Build from the merged head and upload through EAS, as the earlier runbooks do.
   - **Testers update first (K-N8).** Every tester installs the chat build before people start chatting. Tell them before the build is released to their group.
     - Membership follows the reply, not the build. So a Going tester on an older build gets chat pushes.
     - On an older build, a chat push's tap does nothing: its `parseNotificationTarget` refuses the type `chat` and the extra `seriesId`.
     - With an older build open, no chat banner shows: its handler shows only `plan_update` pushes.
7. **Device checks** (Ana as host, Pedro and Clara as guests, Sol invited and not answered). Use two phones, signing in as each account in turn where needed. Use tester accounts, and never write a real number or account id in this file. They need steps 2 to 6 and the new build, and run in this order.
   - **Live delivery, with the app open.** Ana and Pedro, both Going, open the chat on two phones. Pedro sends "I can bring the snacks".
     - It appears on Ana's open screen within a few seconds, well before the 20-second poll (`POLL_MS`, `mobile/src/state/chatSession.ts:33`). Send twice more: each arrives as fast. That shows the phone's join of `chat:<series>` passed the policy.
     - Then the real `realtime.messages` row, read-only:

       ```
       ! bash -c 'cd "${REPO:-$HOME/dev/resbite-app}" && supabase db query --linked "select count(*) as chat_broadcasts from realtime.messages where topic like '"'"'chat:%'"'"' and inserted_at > now() - interval '"'"'5 minutes'"'"'"'
       ```

       It should be at least 1.
   - **A refused subscribe (the policy's topic condition).** A join is allowed only for a topic that is exactly `chat:<lower-case uuid>`, from a caller who passes `private.user_eligible`, and who is in that chat now (`can_listen`, `supabase/migrations/20261111140000_chat_core.sql:1093-1099`). The phone check above shows the allowed side.
     - For the refused side, the owner asks the database what Realtime asks it, as a tester, inside a transaction that is rolled back. Run `! bash ~/ch1-listen-check.sh <tester account id> <a series they chat in> <a series they are not in>`. The ids go only into a temporary file that the script removes, never into this directory.

       ```bash
       #!/bin/bash
       # Read-only: may this tester listen to these two chats' channels, as Realtime's policy asks (chat core, step 7)?
       # Prints three answers and nothing else. Nothing is written: the transaction is rolled back.
       set -euo pipefail
       cd "${REPO:-$HOME/dev/resbite-app}"
       U='^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       for v in "${1:-}" "${2:-}" "${3:-}"; do [[ "$v" =~ $U ]] || { echo "Pass three lower-case uuids" >&2; exit 1; }; done
       Q="$(mktemp)"; trap 'rm -f "$Q"' EXIT
       cat > "$Q" <<SQL
       begin;
       do \$\$ begin perform set_config('request.jwt.claims', '{"sub":"$1","role":"authenticated"}', true); end \$\$;
       set local role authenticated;
       select private.can_listen('chat:$2') as their_chat, private.can_listen('chat:$3') as another_chat,
        private.can_listen('chat:' || upper('$2')) as upper_case_topic;
       rollback;
       SQL
       supabase db query --linked -f "$Q"
       ```

       - Expected: `their_chat` true, `another_chat` false and `upper_case_topic` false.
       - It was rehearsed on a local replay through a stand-in for the CLI, with a member and a non-member (the checks above).
       - If the dashboard's Realtime inspector can join a private channel as a chosen user, joining `chat:<another series>` as that tester should be refused too.
   - **A push, with the app closed.** Pedro sends while Ana's app is closed. Ana's phone shows "<title>" over "Pedro: …".
     - Over 120 graphemes, the words end with "…".
     - The tap opens the chat.
   - **An announcement banner while Resbite is open on My resbites, and none for a chat on screen (K-S9).**
     - Ana announces to Everyone invited while Pedro has My resbites open. A banner shows "Announcement from Ana: …".
     - With that chat open on Pedro's phone, a new message shows no banner. With another chat open, it does (`showsInForeground`, `mobile/src/domain/reminders.ts:73-83`).
   - **One push a minute, in a lively chat.** Pedro sends five messages within a minute. Ana's phone gets one push, the first one's. The rest arrive in the chat with the unread dot.
   - **Mute.**
     - With Mute chat on, Ana gets no message push, and announcements still arrive.
     - With Mute this resbite on, neither arrives.
   - **A host's removal blanks the other phone's open chat (K-B1).** Ana removes one of Pedro's messages while Pedro has the chat open. On Pedro's phone the bubble reads "Message removed by an admin", with no text, within a few seconds.
   - **A removed guest's open chat refuses.** Ana removes Pedro from the resbite while his chat is open. His screen shows "You’re not in this chat." and the field goes. The channel is removed at once (K-N1), and no later message or push about this chat reaches him.
   - **A pending invitee's announcement tap opens the event (K-B4).** Sol, invited and not answered, gets Ana's Everyone invited announcement. Its tap opens the resbite, never the gone note. The invitation card on My resbites shows "Announcement from Ana · …".
   - **The composer with the keyboard up (K-S15).**
     - The field sits right on the keyboard, with no gap above it.
     - The list holds its place as the keyboard rises and falls, and drags the keyboard down interactively.
     - While the keyboard shows, the pinned card collapses to one line and the closing line hides.
     - The build keeps `KeyboardAvoidingView` (`mobile/app/chat.tsx:545`), so this check decides it.
   - **VoiceOver and Larger Text.**
     - On a bubble, the rotor's actions offer Delete message (own) or Remove message (host) (`chat.tsx:819`).
     - At the largest Larger Text, the composer, the pinned card and the closed card fit at 320 points with nothing clipped.
     - A long-press right after the chat loads opens the actions sheet on the right message.
   - **VoiceOver swipe order** reads newest first, each label carrying its day ("Leo, I can bring the snacks, Sat 15 Nov, 18:02"). **TalkBack** does the same, when the Android build exists.
   - **Expo web (review only).** A long-press right after a refocus read opens the right message's sheet. Releasing a long-press on a link (`LinkText`, `chat.tsx:889`) does not also open the link's confirm.
   - **Send enables for "🎉" alone.** The visible-text rule matches astral characters on Hermes (`hasVisibleText`, `mobile/src/domain/chatRules.ts:446-448`).
   - **A link's long-press on iOS** opens the message's actions, not the browser. A tap asks "Open example.com?" first.
   - **At the 1,000 limit on iOS,** a paste past the limit is cut and VoiceOver says "Only the first 1,000 characters fit.". Every cut announces it (`sayTooLong`, `chat.tsx:122-123`, called at `:316`), so typing on at the limit may repeat it on each keystroke. This check decides whether that repetition is acceptable.
   - **The 48-hour close.** On a one-off that ended, the line under the pinned card reads "This chat closes <day> at <time>, in N hours. Any final words?", then minutes in the last hour.
     - At the close, the field gives way to "This chat closed on <day>." and the reason, without leaving the screen. A message typed then stays under the card as "Not sent:".
     - The Chat row reads "Chat closed · N messages".
     - Delete and Remove still work (K-S17's default).
8. **Throughput check during the first busy chat hour (K-B3.5).** Read-only, every 10 minutes or so, with `! bash ~/ch1-throughput.sh`:

   ```bash
   #!/bin/bash
   # Read-only: the outbox's queue and the sender's last hour (chat core, step 8).
   set -euo pipefail
   cd "${REPO:-$HOME/dev/resbite-app}"
   supabase db query --linked "select count(*) as waiting, count(*) filter (where kind in ('chat_message', 'announcement')) as chat_waiting, coalesce(max(now() - created_at), interval '0') as oldest_wait from private.notification_outbox where expanded_at is null"
   supabase db query --linked "with r as (select status_code, case when left(content, 1) = '{' then content::jsonb end as body from net._http_response where created > now() - interval '1 hour') select count(*) as calls, count(*) filter (where status_code = 200 and body->>'disabled' = 'false' and body->>'error' is null) as clean, count(*) filter (where status_code = 200 and body->>'error' is not null) as cut_short, count(*) filter (where status_code is distinct from 200) as failed_or_timed_out, coalesce(sum((body->>'processed')::int), 0) as processed, coalesce(sum((body->>'deferred')::int), 0) as deferred from r"
   ```

   - `waiting` stays under 100, and `oldest_wait` under 2 minutes.
   - **The check keys on the status and the `error` field together.** `clean` equals `calls`, and `cut_short` and `failed_or_timed_out` are 0. A run cut short by a later claim answers 200 with `error` set, so it counts under `cut_short`, never `clean`.
   - `deferred` above 0 in a burst is the loop handing back jobs it had no time for; the next run takes them. Many runs with `deferred` above 0, or any `failed_or_timed_out`, bring back step 0's budget question.
   - **A `plan_changed` made then reaches the other phone within two minutes.** Ana changes the time of another resbite Pedro is Going to while the chat is busy (the claim expands it before the chat kinds, `supabase/migrations/20261111140000_chat_core.sql:698`).

## Applied

Nothing yet. Each step's record goes here when it is done, as in the earlier runbooks. Step 0's answers go here first.

## Rollback

Only with the owner's approval, in one transaction.

**The full order, newest first (NOTE 5).** Roll back in this order only: chat 3, chat 2, chat 1 (this file), circles, follow-ups, connections, creating-a-resbite. Then the earlier ones, as the creating-a-resbite runbook lists.

- **The guarded chain** is chat 3 → chat 2 → chat 1 → circles → follow-ups. Each refuses to run too early, and a refusal changes nothing.
  - Plan 2's rollback refuses while plan 3 is applied.
  - This file refuses while plan 2's `private.series_leaves` exists (NOTE 4), with "Run the chat groups rollback before the chat core rollback" (`supabase/rollback/20261111140000_chat_core.rollback.sql:44-49`).
  - The circles rollback refuses while `public.messages` exists, with "Roll back the chat migrations before the circles-of-trust rollback" (`supabase/rollback/20261111130000_circles_of_trust.rollback.sql:47-48`). Without that guard, rolling circles back would put the pre-chat claim and deletion bodies under plan 1. With plan 2 applied, every group roll would also fail on `brought_by`.
  - The follow-ups rollback refuses while circles is applied.
- **Below the chain nothing guards.** The connections and creating-a-resbite rollbacks have no guard against chat. Their files belong to live runbooks, so they stay unchanged. **Never run either while chat is applied.** The connections one would take the chat kinds out of the outbox's check, and the chat branch out of who may be told, under a live chat.

**This file's steps.**

1. **The app first.** Once this file has run, a chat build gets errors from every chat call and a refused channel. Make a build without chat the testers' build first, or accept that the Chat row hides, the chat screen fails and chat pushes stop until one is.
2. **The old sender goes back before or with this file.** The rollback restores `finish_notification_delivery` from `20261030120000_push_delivery.sql`, which refuses `deferred` again (rollback header, lines 21-25).
   - Against the restored finish, a hand-back from the chat sender fails. The job stays leased as `sending`, and the next claim after the lease marks it `unknown`, never sent.
   - So redeploy the sender as it was before step 4 first, from the commit recorded under "Applied". It handles a chat job as a generic push until the rollback removes those jobs.
3. The owner runs the rollback with `! bash ~/ch1-rollback.sh`. It checks the hash, then runs the file in one transaction, with no psql `\i`, and takes a fingerprint:

   ```bash
   #!/bin/bash
   # The chat core rollback. Only with the owner's approval, after chat plans 3 and 2 are rolled back and the old sender is back.
   set -euo pipefail
   cd "${REPO:-$HOME/dev/resbite-app}"
   D=qa/chat-release
   F=supabase/rollback/20261111140000_chat_core.rollback.sql
   echo "d212e53eacb904a260bbdd3c371ddc7424829ea7a5b7d6c98b3e7c89fb132214  $F" | sha256sum -c -
   mkdir -p /tmp/ch1 && { echo 'begin;'; cat "$F"; echo; echo 'commit;'; } > /tmp/ch1/rollback.sql
   supabase db query --linked -f /tmp/ch1/rollback.sql
   supabase db query --linked -f supabase/ops/hosted-fingerprint.sql -o json > "$D/hosted-after-rollback.json"
   supabase db query --linked "select count(*) as realtime_policies from pg_catalog.pg_policies where schemaname = 'realtime'"
   ```

   - The script stops before running anything if the hash differs.
   - `hosted-after-rollback.json` should equal the circles `hosted-after.json` by definition: 387 of 387, with the same 15 `acl` differences. `realtime_policies` should be 0. Wrapped this way, the rollback did exactly that locally.
   - Run again, it fails at its `lock table` (the tables are gone) and changes nothing.
4. **What it does** (its header, lines 1-42).
   - **What is lost, with nobody told:**
     - every chat: every message, announcement and system line, every read and every mute;
     - every `chat_message` and `announcement` notice, sent or not, with its deliveries. A chat push not yet sent is never sent. Sent pushes are not recalled.
   - It drops the policy `chat_members_listen`, the seven triggers, every function the migration made, the outbox's `message_id` with its index, `notification_outbox_recipient_kind_idx` and the four tables.
   - It restores five functions, each keeping its grants:
     - `notification_recipient_eligible` (connections);
     - `claim_notification_deliveries` and `fold_web_account` (circles);
     - `finish_notification_delivery` (push delivery);
     - `request_account_deletion` from the circles body, only where it exists (K-N9, BLOCKING 1; rollback lines 262-313). On the hosted project it does not exist yet, and nothing is done.
   - It puts back the outbox's kind check with its eleven kinds. It locks the plans, guests, admins, the chat tables and the outbox first. Reads of them wait until it commits.
   - Everything else is kept: the resbites, their guests and admins, and every other notice.
5. **Realtime's setting can stay off.** No app uses a public channel. The broadcasts already in `realtime.messages` are Realtime's own and expire with it.
6. Remove this migration's line from `supabase/tests/hosted-baseline/migrations.txt`.
   - The hosted migration history row stays, as the earlier rollbacks left theirs. Never run `supabase migration repair --status reverted`.

## Known gaps

Accepted during the build, unless marked; none blocks the rollout.

- **A minute's first message deleted before delivery** (K-S1, Decision 6). That minute then pushes nothing: the later messages were never queued.
- **A bare signal after a removal** (K-N1). A removed person's open socket may still hear a bare `{id, kind, state}` until its token refreshes. It never carries words, and their next read is refused.
- **A line committing late can sit below a read mark** (`supabase/migrations/20261111140000_chat_core.sql:864-867`). A system line takes no chat lock. One that commits after a reader marked a later id read never reads as unread. `chat_messages_since` still brings it.
- **The roll and plan 1** (Decision 4). Until plan 2, the roll writes an `admin` line for each carried admin.
- **Account deletion is local only.** On hosted no account can be deleted yet, so the chat's deletion step (`supabase/migrations/20261111140000_chat_core.sql:783-855`) runs nowhere there. The roadmap's account-deletion item says what that project must carry, including the local `activate_deletion_intent`, which writes chat lines and keeps messages.
- **Outbox retention** (K-N11). Chat writes one notice per recipient per message. A cleanup of delivered rows is on the roadmap's later list.
- **Found while writing this runbook, not ruled on: sign-out leaves chat pushes on the phone.** Sign-out dismisses only the pushes typed `plan_update` (`mobile/src/services/pushDevice.ts:342-354`).
  - A chat push carries a person's words, and it stays in Notification Center for whoever signs in next. Connection pushes stay too (before chat).
  - The fix is one condition in `dismissShownPushes`. This task changed no app code.

## Not done here

No hosted change, no function deployment, no Realtime setting, no schedule change and no TestFlight upload. Nothing was pushed.
