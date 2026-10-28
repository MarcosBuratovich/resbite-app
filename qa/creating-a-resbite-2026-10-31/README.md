# Creating a resbite: database rollout runbook (31 October 2026)

- **Spec:** [Creating a resbite design](../../docs/superpowers/specs/2026-10-28-creating-a-resbite-design.md).
- **Plan:** [Creating a resbite, plan 1: the database](../../docs/superpowers/plans/2026-10-28-creating-a-resbite-1-database.md).
- **Code:** branch `cr1-database`. **Nothing is applied to the hosted project, Vercel, Supabase functions or TestFlight.** Every step below needs the owner's explicit approval when it is done; this task executed none of them.

## What is built

- **One hosted-compatible migration**, `20261031120000_creating_a_resbite.sql`, depending only on the files in `supabase/tests/hosted-baseline/migrations.txt`:
  - Hosts: `public.plan_admins`, `private.is_host`, `private.host_ids`, `appoint_admin` and `remove_admin`; every owner check that a host may now pass is widened.
  - The end is the boundary: `private.plan_end`; answers, changes, invitations, covers and the public pages count from the end, not the start.
  - Plans v4: `create_plan_v4` and `change_plan_v4` (a required end, To be decided, the repeat rule, cancelling by hosts). `create_plan_v3` and `change_plan_v3` stay, so the current build keeps working.
  - Mutes: `public.plan_mutes` and `set_plan_mute`; the sender's audience check skips the muted.
  - Repeats: `next_occurrence` and `roll_repeating_plans`, run by a pg_cron job (step 5), and the cover read policy widened for the next occurrence.
- **Outbox:** new kind `admin_added` and the detail `again` for `invited`.
- **Also changed in this branch (no hosted effect until deployed):** the `deliver-notifications` copy module (`supabase/functions/_shared/notification-copy.ts`) and the link site `links/` (the pages say "happened" from the end, "Every Thursday", "Place to be decided").
- The details are in `supabase/README.md`, "Creating a resbite (CR)".

## Files and hashes

| File | sha256 |
| --- | --- |
| `supabase/migrations/20261031120000_creating_a_resbite.sql` | `fedeb77e2d226310252eacdef1b4770bf8690c71ac8f1ab905fcb8d4377f2b25` |
| `supabase/rollback/20261031120000_creating_a_resbite.rollback.sql` | `e763c51d4f089b1204125a50fd61b010464351a1e7e771c656da40daa235d64f` |
| `supabase/ops/schedule-roll-repeating-plans.sql` | `3a8202877260008723648dc4723b36aedb6d772f809b2552997765773040d74e` |
| `supabase/tests/hosted-baseline/20261031120000_creating_a_resbite.before.sql`, `.after.sql` | the rehearsal pair, run locally only |

Recompute before asking for approval (`sha256sum <file>`): approve by file name and hash, and stop if a hash differs.

## Checks made locally

- `./scripts/test-database-docker.sh --hosted-baseline supabase/migrations/20261031120000_creating_a_resbite.sql`: the before file passes against the hosted baseline, the migration applies, the after file passes, `creating-a-resbite.sql` and every earlier baseline test pass.
- `./scripts/test-database-docker.sh` (full mode) passes.
- The rollback, applied after the migration on the Docker database, restores the fingerprint of the baseline (functions with their grants, relations, columns, indexes, constraints, policies, triggers, comments, and the storage policies) exactly, and `gi1.sql`, `ux2.sql`, `contact-invitations.sql`, `open-link-approval.sql` and `push-delivery.sql` as they were before this plan then pass.

## Rollout runbook

**Order.** Snapshot, migration, snapshot, `deliver-notifications` redeploy, the `links/` deploy, the TestFlight build, and only then the cron job.

1. **Before snapshot.** Read-only, into this directory:
   - `supabase db query --linked -f supabase/ops/hosted-fingerprint.sql -o json > qa/creating-a-resbite-2026-10-31/hosted-before.json`
   - `supabase db query --linked -f supabase/ops/hosted-counts.sql -o json > qa/creating-a-resbite-2026-10-31/hosted-counts-before.json`
   - Compare the fingerprint with a local replay of `migrations.txt` (it matched 282 of 282 after the push migration; the only difference is hosted's default `service_role` grant on 14 older `public` objects, and one more on `public.unregister_device(text)`). Stop if anything else differs.
2. **Migration** (owner approves by file name and sha256, above). Never `supabase db push`: it would also push the local-only migrations. From the repository root, apply a copy wrapped in one transaction, then record it:

   ```
   mkdir -p /tmp/cr1 && { echo 'begin;'; cat supabase/migrations/20261031120000_creating_a_resbite.sql; echo; echo 'commit;'; } > /tmp/cr1/apply.sql
   supabase db query --linked -f /tmp/cr1/apply.sql
   supabase migration repair --status applied 20261031120000 --linked --yes
   ```

   - Hosted has 16 history rows; after this it has 17. The hosted version is the file's own, `20261031120000`.
   - Backfills: every existing plan gets `series_id = id`. Nothing else is written.
   - The migration takes brief locks on `plans` (new columns, a trigger, two indexes) and on `notification_outbox` (two check constraints).
3. **After snapshot and advisors.**
   - The same two commands into `hosted-after.json` and `hosted-counts-after.json`. Expect the new objects only (the rehearsal's `.after.sql` lists them), every existing table with its row count, plus `plan_admins` and `plan_mutes` at 0.
   - Run the Supabase advisors. Expect no new WARN or ERROR. INFO notices for the new unused indexes (`plan_admins_user_idx`, `plans_series_idx`) are likely. No new `SECURITY DEFINER` function is executable by `anon`, and `roll_repeating_plans` by nobody.
   - Append `20261031120000_creating_a_resbite.sql   20261031120000` to `supabase/tests/hosted-baseline/migrations.txt`, and run `./scripts/test-database-docker.sh --hosted-baseline` (no candidates).
4. **Redeploy `deliver-notifications`** (the copy module changed: the `admin_added` notice and the `invited` notice with the detail `again`). With the owner's approval, from the repository root:

   ```
   supabase functions deploy deliver-notifications --no-verify-jwt --project-ref ewcsgvhuojxdpaspwsrx
   ```

   `--no-verify-jwt` is required: without it the schedule's calls are refused. The secrets and the Vault entries stay as they are. Until this is done, the sender has no words for the two new notices, so deploy it before the cron job exists.
5. **Link site (`links/`) to production**, as the earlier runbooks describe, from this box. With the owner's approval:
   1. Generate: `node --import ./mobile/node_modules/tsx/dist/loader.mjs links/generate.mjs https://link.resbite.com QY833VTUWL com.resbite.app /tmp/resbite-link`.
   2. From `/tmp/resbite-link`: `npx vercel link --yes --project resbite-link --scope creamos`, then delete the `.env.local` it writes.
   3. Check a preview deployment first (`npx vercel deploy --yes --scope creamos`), then `npx vercel deploy --prod --yes --scope creamos`. Note the previous production deployment's id from `npx vercel ls` first, for a rollback.
   4. Check live: an open resbite's page; a running resbite's page says it is open until its end, and an ended one says it happened.
6. **TestFlight build.** The build with plans 2 and 3 (the screens for creating, hosts, mutes and repeats) must ship **before the cron job is created**. An old build cannot show the rolled occurrences' end times, but it can open them. Rolled occurrences carry an end, and an old build opens a plan with an end without trouble; it just does not show it. Until the build ships, create no job: a repeating resbite can only be made by the new build anyway, so the roll finds nothing to do until then, and the order costs nothing.
7. **Cron job** (owner runs it from their shell, as with the sender's schedule; the assistant's safety check doesn't let it create recurring jobs). Paste with `! bash`, from the repository root, after steps 2 to 6:

   ```
   ! bash -c '
   supabase db query --linked \
     -f supabase/ops/schedule-roll-repeating-plans.sql
   '
   ```

   - It enables `pg_cron` if absent, removes any job named `roll-repeating-plans`, and schedules it every five minutes as `postgres`.
   - **Check** a few minutes later:

     ```
     select status, return_message, start_time from cron.job_run_details
      where jobid = (select jobid from cron.job where jobname = 'roll-repeating-plans')
      order by start_time desc limit 5;
     ```

     Each run should succeed. A skipped plan shows as a warning in the Postgres logs ("roll_repeating_plans: plan ... skipped").
   - To stop it: `select cron.unschedule('roll-repeating-plans');`.
8. **Hosted-state notes.** `series_id` is not null on every plan from now on (a trigger fills it for any insert that names none). Rolled occurrences are ordinary plans; no extra rows exist beyond them and their guests' pending attendances.

## Rollback

Only with the owner's approval, in one transaction, **before** the other rollbacks:

1. Unschedule the job: `select cron.unschedule('roll-repeating-plans');`.
2. `begin; \i supabase/rollback/20261031120000_creating_a_resbite.rollback.sql; commit;` (sha256 above). It stops with a message, changing nothing, if the push-delivery or open-link-approval rollback has already run: run this one first, then push (`20261030120000`), then open-link approval (`20261029120000`).
3. It deletes: the admins (the owner is the only host again), the mutes, the repeat rule and its columns (rolled occurrences stay as ordinary resbites), `place_tbd` (a To be decided place stays the label "To be decided"), the v4 functions, the `admin_added` outbox rows and the `again` invitations; and it restores the 23 redefined functions, the three cover policies and the two outbox checks to their previous bodies.
4. After it, a resbite is open until its start again, not its end: one that is running stops accepting answers and changes at once. Builds made with this plan call functions that no longer exist (`create_plan_v4`, `change_plan_v4`, `set_plan_mute`, `appoint_admin`, `remove_admin`): creating, editing and muting fail until the old build is back. Redeploy `links/` from the previous commit (it reads `place_tbd` and `repeat_weeks`, which then are missing, and shows neither) and the previous `deliver-notifications`.

## Not done here

No hosted change, no function deployment, no Vercel step, no schedule and no TestFlight upload. Nothing was pushed.
