# Connections: database rollout runbook (10 November 2026)

- **Spec:** [Connections and circles of trust design](../../docs/superpowers/specs/2026-11-10-connections-and-circles-design.md) (CO-D1 to CO-D8, CO-P1 to CO-P6, CO-P14).
- **Plan:** [Connections, plan 1](../../docs/superpowers/plans/2026-11-10-connections-1-connections.md).
- **Code:** branch `co1-connections`. **Nothing is applied to the hosted project, Vercel, Supabase functions or TestFlight.** Every step below needs the owner's explicit approval when it is done; this task executed none of them.

## What is built

- **One hosted-compatible migration**, `20261110120000_connections.sql`:
  - `public.connections` (a pair, who asked, the series they met at, when) and `private.connection_refusals` (a refusal with a `hidden` flag). `public.connections` has RLS on and **no policy**: the app reads it only through functions, never directly.
  - Functions, each with a public wrapper: `request_connection`, `accept_connection`, `decline_connection`, `cancel_connection_request`, `remove_connection`, and the reads `my_connections` (`requests` and `connected`) and `plan_connection_states`. `invite_contacts` accepts a `{user}` item for a connection (42501 `Not a connection` otherwise, and for an ineligible or leaving account).
  - Outbox: new kinds `connection_request` and `connection_accepted` (payload type `connection`). A request pushes once per pair, series and requester, however often it is cancelled and sent again: its dedupe key is `connect:<a>:<b>:<series>:<requester>`, with no timestamp, and the one notice goes while a request by that person stands. The acceptance's key keeps the acceptance's exact timestamp, and only the notice of the current connection goes.
  - Account deletion: the migration redefines the deletion lifecycle to delete connections and refusals, but **guarded**: the lifecycle does not exist on hosted, so there the redefinition is skipped (see "Not done here").
- **Rulings made during the build that change what the design describes** (the design's CO-P3 is read per series; the build reads it pair-wide):
  - Refusals are read pair-wide and are invisible to the refused side: the sheet keeps "Request sent · Cancel request" after a refusal, whatever series they share.
  - A refuser who asks back connects at once (a visible refusal counts as the other's standing request); a hidden refusal (cancelled, or made by a removal) does not.
  - Removing a connection records a refusal for the removed side (CO-P14: they cannot ask again from the series they met at); accepting clears all refusals between the pair.
  - `public.connections` has no direct reads; `my_connections` has no `sent` list (it would expose refusals).
  - "Met at" in `my_connections` names only an occurrence the caller may read (`can_read_plan`); otherwise the title is null and the app shows "Met on Resbite".
  - Two people who each refused the other connect when either asks next (the other's visible refusal is checked before the caller's own); someone whose account is being deleted cannot be asked, even as the owner (42501 `Not on this resbite`).
  - The people list shows the owner's row first under Going, with the "Hosting" badge, and its group titles count that row ("Going · 6" over six rows); the event page's people row still counts guests only.
  - The Profile row and the People screen are both called "People lists"; "Connections" is a new row above it.
- **Also changed in this branch (no hosted effect until deployed):** the `deliver-notifications` copy module (`supabase/functions/_shared/notification-copy.ts`) gained `connection_request` and `connection_accepted`; the app has the Connections screen, Connect/Cancel/Accept on the people list, "Your connections" on Invite people, and the push-tap routing to Connections.

## Files and hashes

| File | sha256 |
| --- | --- |
| `supabase/migrations/20261110120000_connections.sql` | `1f403e42f97e9c2b619fe7a5d778bee0dfd2146d7fffc5a2114b24cb32d112d8` |
| `supabase/rollback/20261110120000_connections.rollback.sql` | `ba1eba4dbd8a0b5268603a1ee426c6284ab5ae54b40479886379f8ffedfcbfc6` |
| `supabase/tests/hosted-baseline/20261110120000_connections.before.sql` | `cf0f3ef4332d595cc28f5eb6fc9a580375a107974e062fa7a2cc99e005d61667` |
| `supabase/tests/hosted-baseline/20261110120000_connections.after.sql` | `f82fb95f8ae8a0b1d5d75d98089da74af921ee497130ddbb9f8680c2dc49bdb3` |

The before/after pair is the rehearsal, run locally only. Recompute before asking for approval (`sha256sum <file>`): approve by file name and hash, and stop if a hash differs.

## Checks made locally

- `bash scripts/test-database-docker.sh` (full mode): passes, `connections.sql` included.
- `./scripts/test-database-docker.sh --hosted-baseline supabase/migrations/20261110120000_connections.sql`: the before file passes against the hosted baseline, the migration applies, the after file passes. The line for this migration is not yet in `supabase/tests/hosted-baseline/migrations.txt` and `tests.txt` already lists `connections.sql`, so until this migration is live any `--hosted-baseline` run of another candidate must pass this migration as a candidate too.
- Edge copy tests, per file from the repository root (this Node has no `--experimental-transform-types`): `node --import ./mobile/node_modules/tsx/dist/loader.mjs supabase/functions/_shared/<file>.test.ts`.
- `(cd mobile && npm run check)` passes.
- Browser scripts against Expo web on 8081 (`cd mobile && npx expo start --web --port 8081`, stop it by PID): `mobile/scripts/verify-connections.mjs` (Connections screen, people-list Connect/Cancel/Accept, Your connections on Invite people), `verify-people.mjs`, `verify-event.mjs`, `review-ui.mjs`, `verify-contact-invites.mjs`, `verify-invitations.mjs`.

## Rollout runbook

**Order.** Snapshot, migration, snapshot, `deliver-notifications` redeploy, TestFlight build, device checks. There is no cron job and no `links/` change in this plan.

1. **Before snapshot.** Read-only, into this directory (owner-run scripts, as in the earlier runbooks):
   - `supabase db query --linked -f supabase/ops/hosted-fingerprint.sql -o json > qa/connections-2026-11-10/hosted-before.json`
   - `supabase db query --linked -f supabase/ops/hosted-counts.sql -o json > qa/connections-2026-11-10/hosted-counts-before.json`
   - The storage policies: `supabase db query --linked -o json "select policyname, cmd, qual, with_check from pg_policies where schemaname = 'storage' order by policyname" > qa/connections-2026-11-10/hosted-storage-policies-before.json`.
   - Compare the fingerprint with a local replay of `migrations.txt` (what hosted runs). Stop if anything differs beyond what the creating-a-resbite runbook recorded (hosted's default `service_role` grant on older `public` objects and `public.unregister_device(text)`); **confirm from the real snapshot before approving**.
2. **Migration** (owner approves by file name and sha256, above). Never `supabase db push`: it would also push the local-only migrations. From the repository root:

   ```
   mkdir -p /tmp/co1 && { echo 'begin;'; cat supabase/migrations/20261110120000_connections.sql; echo; echo 'commit;'; } > /tmp/co1/apply.sql
   supabase db query --linked -f /tmp/co1/apply.sql
   supabase migration repair --status applied 20261110120000 --linked --yes
   ```

   - The history should gain one row (**confirm the count from the real snapshot**). The hosted version is the file's own, `20261110120000`.
   - No backfill. The deletion lifecycle redefinition is skipped on hosted (guarded).
3. **After snapshot and advisors.**
   - The same three commands into `hosted-after.json`, `hosted-counts-after.json` and `hosted-storage-policies-after.json`.
   - Compare `hosted-after.json` with a local replay of `migrations.txt` plus this file; `.after.sql` asserts the shape. Every existing table keeps its row count; `connections` is new at 0 rows. The storage policies do not change.
   - Run the Supabase advisors and compare with the creating-a-resbite `hosted-advisors-after.json`. Expected after the apply, all INFO: `rls_enabled_no_policy` on `public.connections` (by design: no direct reads) and on `private.connection_refusals` (as on every other `private` table); `unindexed_foreign_keys` on `connection_refusals_to_user_fkey` only (`connection_refusals_users_idx` covers `from_user`, and both `public.connections` keys are covered; read from a local run of the advisor's queries on the hosted baseline plus this file); possibly `unused_index` on `connections_user_b_idx` and `connection_refusals_users_idx` while they are new (check). No new WARN or ERROR, and no new `SECURITY DEFINER` function executable by `anon` (the definers are in `private`; the `public` wrappers are invokers). Stop the rollout for any WARN or ERROR, or for anything else new.
   - Append `20261110120000_connections.sql   20261110120000` to `supabase/tests/hosted-baseline/migrations.txt`, and run `./scripts/test-database-docker.sh --hosted-baseline` (no candidates).
4. **Redeploy `deliver-notifications`** (the copy gained `connection_request` and `connection_accepted`; payload type `connection`). With the owner's approval, from the repository root:

   ```
   supabase functions deploy deliver-notifications --no-verify-jwt --project-ref ewcsgvhuojxdpaspwsrx
   ```

   `--no-verify-jwt` is required: without it the schedule's calls are refused. Secrets and Vault entries stay. Until this is done the sender has no words for the two new notices.
5. **TestFlight build** with the Connections screens (the owner's step). The database changes are additive: the current build keeps working, with no connection UI.
6. **Device checks** (two phones, after steps 2 to 5):
   - Request from a people list (Connect on a person who answered), and the "Pedro wants to connect" push on the other phone.
   - Accept from Connections, and the "You and Ana are now connected" push on the requester's phone.
   - Invite a connection from Invite people ("Your connections"), and the invitation push.
   - Remove connection (in-place confirm), silent for the other side.
   - A tap on each of the two connection pushes lands on Connections.

## Applied (11 November 2026)

- Step 1 (before, 11 November 2026): `hosted-before.json`, `hosted-counts-before.json` and `hosted-storage-policies-before.json`, taken by the owner from their shell with `~/co1-before.sh` (the assistant's safety check refuses live reads). The fingerprint matches a Docker replay of `migrations.txt` (eighteen files) 325 of 325 by definition; the only differences are the 15 known `acl` ones (hosted's default `service_role` grant on 14 older `public` objects and `public.unregister_device(text)`), the same list as on 5 November. It is identical by definition to the creating-a-resbite `hosted-after.json` of 5 November, so nothing structural changed on hosted in between; only row counts grew from testing (`plans` 34 → 38, `attendees` 11 → 12, eight `private` tables likewise). The storage policies match the replay 7 of 7. Hosted migration history: last applied `20261031120000`; `20261110120000` local only.
- The owner approved `20261110120000_connections.sql` by sending its sha256 `1f403e42…12d8` in chat; the file's hash was recomputed and matched.
- Step 2 (apply, 11 November 2026): the assistant's safety check refused to run the apply itself ("Production Deploy"), so the owner ran `~/co1-apply.sh`. It checks the hash, applies the file wrapped in `begin;`/`commit;` with `supabase db query --linked -f` (no rows returned, no error), then runs `supabase migration repair --status applied 20261110120000 --linked --yes`. The history now ends `20261110120000 | 20261110120000`.
- Step 3 (after): `hosted-after.json`, `hosted-counts-after.json` and `hosted-storage-policies-after.json`, taken by the same script. The fingerprint matches the Docker replay of `migrations.txt` plus this file 355 of 355, with the same 15 `acl` differences. Before to after: 30 new objects (15 functions, 9 constraints, 4 indexes, the tables `connections` and `connection_refusals`) and 4 changed (`can_read_profile`, `invite_contacts`, `notification_recipient_eligible` and the outbox kind check); nothing removed. The storage policies are unchanged, 7 of 7. Every existing table kept its row count; the two new tables are empty.
- **Advisors** (`hosted-advisors-after.json`, read through the Supabase MCP server on 11 November 2026; security and performance). 37 findings became 42: exactly the five INFO ones predicted above (`rls_enabled_no_policy` on `public.connections` and `private.connection_refusals`, `unindexed_foreign_keys` on `connection_refusals_to_user_fkey`, `unused_index` on `connections_user_b_idx` and `connection_refusals_users_idx`). None disappeared, no ERROR, and the 10 WARN entries are the same as on 5 November (the five link-site functions callable without signing in, by design).
- `20261110120000_connections.sql` appended to `supabase/tests/hosted-baseline/migrations.txt`; `./scripts/test-database-docker.sh --hosted-baseline` (no candidates) passes, `connections.sql` included.
- Step 4 done on 11 November 2026, with the owner's approval ("approved, redeploy deliver-notifications"): `supabase functions deploy deliver-notifications --no-verify-jwt --project-ref ewcsgvhuojxdpaspwsrx` from the repository root at `main` 5c0a053 (script size 8.569 kB). The function list afterwards shows `deliver-notifications` ACTIVE, version 4, `verify_jwt` false; an unauthenticated POST to the function URL answers 401 from the handler. The schedule's runs after the redeploy are checked by the owner with `~/co1-sender-check.sh` (read-only; the assistant's safety check refuses the read); each call should still be HTTP 200 with `"disabled":false`. The owner ran it at 15:16 UTC: four runs from 15:13 to 15:16 (the redeploy was at about 14:46 UTC), each `succeeded`, each call HTTP 200 `{"disabled":false,"processed":0}`.
- Not done yet: step 5 (the TestFlight build; `main` is not pushed yet), step 6 (device checks).

## Rollback

Only with the owner's approval, in one transaction, after the sender has drained the outbox if no pending notice is to be lost. **Order:** this rollback runs before the creating-a-resbite rollback (`supabase/rollback/20261031120000_creating_a_resbite.rollback.sql`), never after it: the kind check it restores is that migration's, and its guard stops it, changing nothing, once that rollback has run (`public.plan_admins` gone).

1. `begin; \i supabase/rollback/20261110120000_connections.rollback.sql; commit;` (sha256 above). It deletes the connection functions and their wrappers, `public.connections` and `private.connection_refusals` with every row (every connection, request and refusal is gone, nobody is told), and every `connection_request` and `connection_accepted` outbox row, delivered or not, so the earlier kind check can come back; it restores `private.can_read_profile`, `private.invite_contacts`, `private.notification_recipient_eligible` and (guarded, only where it exists) `private.request_account_deletion` to their previous bodies, and the outbox kind check to its earlier list.
2. Builds made with this plan call functions that no longer exist: the Connections screen, Connect and "Your connections" fail until the old build is back. Redeploy the previous `deliver-notifications` from the previous commit.
3. Remove the line for this migration from `supabase/tests/hosted-baseline/migrations.txt` if it was appended. The hosted migration history row stays (the earlier rollbacks left theirs too); never run `supabase migration repair --status reverted`.

## Not done here

No hosted change, no function deployment, no TestFlight upload, nothing pushed.

- **The circle of trust** (plan 2, `docs/superpowers/plans/2026-11-10-connections-2-circles-of-trust.md`).
- **The TestFlight build.**
- **Hosted deletion:** the account-deletion lifecycle does not exist on hosted, so deleting an account there will not clear that person's connections or refusals until the release that carries the lifecycle also carries the two deletes this migration guards.
- **Deferred minors from the build's ledger:**
  - Task 1: `.after.sql` does not check `search_path = ''` on the definers; `connection_refusals.to_user` has no index of its own (the advisor INFO above); pre-existing push-delivery NOTICE noise in the harness log. (The silence of decline, cancel and remove is now asserted, and the `(from_user, to_user)` index added, in the final fix wave.)
  - Task 2: the acceptance notice still names the series' latest occurrence, which the requester may not be on (its push copy names no resbite; `my_connections` now names only an occurrence the caller may read); test gaps (cancel no-op when a pair row remains, cross-series cancel hiding, connected ordering versus creation order); two stale comments in the migration.
  - Task 3: `my_connections` lists people a `{user}` invite item may refuse with 42501 (ineligible or leaving); the picker handles the error without losing the phone items.
  - Final review: the request push says "You're both going to …" even when one of the two can't go (left for the owner's review of the copy). A request cancelled on one series and sent from another before the sender runs can push once for each series: still one push per pair, series and requester, as a request's notice is not tied to the series of the request standing.
