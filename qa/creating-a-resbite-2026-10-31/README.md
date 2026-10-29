# Creating a resbite: database rollout runbook (31 October 2026)

- **Spec:** [Creating a resbite design](../../docs/superpowers/specs/2026-10-28-creating-a-resbite-design.md).
- **Plan:** [Creating a resbite, plan 1: the database](../../docs/superpowers/plans/2026-10-28-creating-a-resbite-1-database.md).
- **Code:** branch `cr1-database`. **Nothing is applied to the hosted project, Vercel, Supabase functions or TestFlight.** Every step below needs the owner's explicit approval when it is done; this task executed none of them.

## What is built

- **One hosted-compatible migration**, `20261031120000_creating_a_resbite.sql`, depending only on the files in `supabase/tests/hosted-baseline/migrations.txt`:
  - Hosts: `public.plan_admins`, `private.is_host`, `private.host_ids`, `appoint_admin` and `remove_admin` (a Going guest who uses the app); every owner check that a host may now pass is widened, and hosts see the guests and the meeting details whatever their own reply. `require_link_owner` keeps its error text `Active plan owner required`, which the current TestFlight build matches. Nobody but the owner can remove the owner, and an admin cannot invite them as a guest.
  - The end is the boundary: `private.plan_end`; answers, changes, invitations, covers and the public pages count from the end, not the start.
  - Plans v4: `create_plan_v4` and `change_plan_v4` (a required end, To be decided, the repeat rule, cancelling by hosts). `create_plan_v3` and `change_plan_v3` stay, so the current build keeps working.
  - Mutes: `public.plan_mutes` and `set_plan_mute`; the sender's audience check skips the muted.
  - Repeats: `next_occurrence` and `roll_repeating_plans`, run by a pg_cron job (step 7), and the cover read policy widened for the next occurrence. The roll asks again only the guests who use the app and may still use it.
- **Outbox:** new kind `admin_added` and the detail `again` for `invited`.
- **Also changed in this branch (no hosted effect until deployed):** the `deliver-notifications` copy module (`supabase/functions/_shared/notification-copy.ts`) and the link site `links/` (the pages say "happened" from the end, "Every Thursday", "Place to be decided").
- **Rebased on the phone key (29 October 2026):** the branch sits on `main` after `20261030130000_phone_key.sql` went live. `invite_contacts`, `check_invited_number` and `answer_phone_invitation` start from that migration's bodies (numbers matched by key) with this plan's changes on top; the rollback restores those bodies; and `supabase/rollback/20261030130000_phone_key.rollback.sql` gained the guard the push rollback has (it refuses while `public.plan_admins` exists), so its sha256 changed.
- The details are in `supabase/README.md`, "Creating a resbite (CR)".

## Files and hashes

| File | sha256 |
| --- | --- |
| `supabase/migrations/20261031120000_creating_a_resbite.sql` | `daa5a4d6f6f951856c86cbc6cf7fb7428a744b8b419175036d8894027430ffcc` |
| `supabase/rollback/20261031120000_creating_a_resbite.rollback.sql` | `28ff6b7671123dab574e738a0758cae7a2d0ba11f98f5bfbfb2cf482fa8ceb26` |
| `supabase/rollback/20261030120000_push_delivery.rollback.sql` (edited by this plan: its guard now refuses while `public.plan_admins` exists) | `bd3e356095fb5ae64af6f1189e5fb4e877efb38961f1fcfa90789e9577c75558` (it was `5430f89f915b7a8d18703deee6eefe66de8ef2b41e2b7d4b185e3143632ce81e`) |
| `supabase/rollback/20261030130000_phone_key.rollback.sql` (edited by this plan: its guard now refuses while `public.plan_admins` exists) | `b474310fa6bae25368d995f3c6855b0686402d70a3ca8cbb90962c7eaf34d68a` (it was `a955455f81ce12e4c24f3c37adad1f5aa369eb0188e1d049cc0b388ed32ff2c9`) |
| `supabase/ops/schedule-roll-repeating-plans.sql` | `3a8202877260008723648dc4723b36aedb6d772f809b2552997765773040d74e` |
| `supabase/tests/hosted-baseline/20261031120000_creating_a_resbite.before.sql`, `.after.sql` | the rehearsal pair, run locally only |

Recompute before asking for approval (`sha256sum <file>`): approve by file name and hash, and stop if a hash differs.

## Checks made locally

- `./scripts/test-database-docker.sh --hosted-baseline supabase/migrations/20261031120000_creating_a_resbite.sql`: the before file passes against the hosted baseline, the migration applies, the after file passes, `creating-a-resbite.sql` and every earlier baseline test pass.
- `./scripts/test-database-docker.sh` (full mode) passes.
- The rehearsal's `.after.sql` runs the rollback between `begin` and `rollback` and proves the fingerprint and the cover policies are back, that the guards refuse after the phone-key, push or open-link rollback (and the phone-key and push rollbacks refuse while this migration stands), and that the seeded plan and guest stay. Separately, the rollback, applied after the migration on the Docker database, restores the fingerprint of the baseline (functions with their grants, relations, columns, indexes, constraints, policies, triggers, comments, and the storage policies) exactly, and `gi1.sql`, `ux2.sql`, `contact-invitations.sql`, `open-link-approval.sql` and `push-delivery.sql` as they were before this plan then pass.

## Rollout runbook

**Order.** Snapshot, migration, snapshot, `deliver-notifications` redeploy, the `links/` deploy, the TestFlight build, and only then the cron job.

1. **Before snapshot.** Read-only, into this directory:
   - `supabase db query --linked -f supabase/ops/hosted-fingerprint.sql -o json > qa/creating-a-resbite-2026-10-31/hosted-before.json`
   - `supabase db query --linked -f supabase/ops/hosted-counts.sql -o json > qa/creating-a-resbite-2026-10-31/hosted-counts-before.json`
   - The storage policies, which the fingerprint (`public` and `private` only) does not cover, with `supabase db query --linked -o json "select policyname, cmd, qual, with_check from pg_policies where schemaname = 'storage' order by policyname" > qa/creating-a-resbite-2026-10-31/hosted-storage-policies-before.json`.
   - Compare the fingerprint with a local replay of `migrations.txt` (what hosted runs, the seventeen files). The push runbook's last comparison matched 282 of 282 objects, with hosted's default `service_role` grant on 14 older `public` objects and `public.unregister_device(text)` as the only differences; **confirm these figures from the real snapshot before approving**. Stop if anything else differs.
2. **Migration** (owner approves by file name and sha256, above). Never `supabase db push`: it would also push the local-only migrations. From the repository root, apply a copy wrapped in one transaction, then record it:

   ```
   mkdir -p /tmp/cr1 && { echo 'begin;'; cat supabase/migrations/20261031120000_creating_a_resbite.sql; echo; echo 'commit;'; } > /tmp/cr1/apply.sql
   supabase db query --linked -f /tmp/cr1/apply.sql
   supabase migration repair --status applied 20261031120000 --linked --yes
   ```

   - The push runbook recorded 16 history rows, so this should make 17: **confirm from the real snapshot before approving**. The hosted version is the file's own, `20261031120000`.
   - Backfills: every existing plan gets `series_id = id`. Nothing else is written.
   - The migration takes brief locks on `plans` (new columns, a trigger, two indexes) and on `notification_outbox` (two check constraints).
3. **After snapshot and advisors.**
   - The same three commands into `hosted-after.json`, `hosted-counts-after.json` and `hosted-storage-policies-after.json`.
   - Compare `hosted-after.json` with a local replay of `migrations.txt` plus this file. Compared with the before snapshot the apply adds the objects of the admins, the mutes, the four `plans` columns (`place_tbd`, `repeat_weeks`, `series_id`, `repeats_from`) with their constraints and indexes, the `plans_default_series` trigger and 16 functions with their grants; it changes 26 function definitions (among them `can_see_guests`, `can_read_meeting_details` and `invite_contacts`) and the two outbox check constraints (no grant changes); and removes nothing. The storage policies change in exactly `resbite_cover_insert`, `resbite_cover_update` and `resbite_cover_read`. `.after.sql` asserts all of it. Every existing table keeps its row count, with `plan_admins` and `plan_mutes` at 0.
   - Run the Supabase advisors and compare with the push runbook's `hosted-advisors-after.json` (**confirm what is expected from the real snapshots**). No new WARN or ERROR is expected. Likely INFO notices: unused indexes (`plan_admins_user_idx`, `plans_series_idx` and `plans_repeats_from_key`) and unindexed foreign keys (`plan_admins.appointed_by` and `plan_mutes.user_id`). No new `SECURITY DEFINER` function is executable by `anon`, and `roll_repeating_plans` by nobody. Stop and compare if anything else appears.
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

   - It enables `pg_cron` if absent, removes any job named `roll-repeating-plans`, and schedules it every five minutes.
   - **Check the job's role** at once:

     ```
     select jobname, username from cron.job where jobname = 'roll-repeating-plans';
     ```

     pg_cron runs a job as the role that scheduled it, so `username` must be a role that may execute `private.roll_repeating_plans()`, which no API role may: `postgres`, the role the SQL editor uses. If it shows any other role (the CLI may connect as a login role of its own), unschedule the job (below) and schedule it again by pasting `supabase/ops/schedule-roll-repeating-plans.sql` into the SQL editor, then check again.
   - **Check** a few minutes later:

     ```
     select status, return_message, start_time from cron.job_run_details
      where jobid = (select jobid from cron.job where jobname = 'roll-repeating-plans')
      order by start_time desc limit 5;
     ```

     Each run should succeed. A skipped plan shows as a warning in the Postgres logs ("roll_repeating_plans: plan ... skipped").
   - To stop it: `select cron.unschedule(jobid) from cron.job where jobname = 'roll-repeating-plans';` (no error when it was never created).
8. **Hosted-state notes.** `series_id` is not null on every plan from now on (a trigger fills it for any insert that names none). Rolled occurrences are ordinary plans; no extra rows exist beyond them and their guests' pending attendances.

## Rollback

Only with the owner's approval, in one transaction, **before** the other rollbacks:

1. Unschedule the job, if it was created (this does not fail when it was not): `select cron.unschedule(jobid) from cron.job where jobname = 'roll-repeating-plans';`.
2. `begin; \i supabase/rollback/20261031120000_creating_a_resbite.rollback.sql; commit;` (sha256 above). It stops with a message, changing nothing, if the phone-key, push-delivery or open-link-approval rollback has already run. The order is enforced both ways: **this plan edited `supabase/rollback/20261030120000_push_delivery.rollback.sql` and `supabase/rollback/20261030130000_phone_key.rollback.sql`** (new sha256s in the table above) so their guards stop them while `public.plan_admins` exists ("Run the creating-a-resbite rollback (20261031120000) first"). Run this one first, then the phone key (`20261030130000`), then push (`20261030120000`), then open-link approval (`20261029120000`).
3. It deletes: the admins (the owner is the only host again), the mutes, the repeat rule and its columns (rolled occurrences stay as ordinary resbites), `place_tbd` (a To be decided place stays the label "To be decided"), the v4 functions, the `admin_added` outbox rows and the `again` invitations, sent or not (a guest of a rolled occurrence whose notice had not gone out is never told; run it just after the sender has drained the outbox to lose none); and it restores the 26 redefined functions, the three cover policies and the two outbox checks to their previous bodies (for `invite_contacts`, `check_invited_number` and `answer_phone_invitation`, the phone-key bodies of `20261030130000`).
4. After it, a resbite is open until its start again, not its end: one that is running stops accepting answers and changes at once. Builds made with this plan call functions that no longer exist (`create_plan_v4`, `change_plan_v4`, `set_plan_mute`, `appoint_admin`, `remove_admin`): creating, editing and muting fail until the old build is back. Redeploy `links/` from the previous commit (it reads `place_tbd` and `repeat_weeks`, which then are missing, and shows neither) and the previous `deliver-notifications`.

## Not done here

No hosted change, no function deployment, no Vercel step, no schedule and no TestFlight upload. Nothing was pushed.
