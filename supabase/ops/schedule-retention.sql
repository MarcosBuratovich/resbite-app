-- Schedule retention (App Store readiness plan 6, spec C3): run the daily purges, and call the cleanup-profile-photos
-- Edge Function, which cleans profile photos and then covers, every ten minutes.
--
-- OWNER-RUN, NOT A MIGRATION. Paste into the hosted project's SQL editor and run once, with approval.
-- It cannot run in the local Docker test harness (no pg_cron or pg_net there); do not add it to a test list.
--
-- What it does
--   1. Enables pg_cron and pg_net if they are absent.
--   2. Removes any existing 'retention-purge' and 'cleanup-images' jobs, so re-running is safe.
--   3. Schedules 'retention-purge' to run every day at 03:47 UTC. Each run calls private.run_retention() as the job's
--      owner (postgres); no API role may execute it. It deletes what docs/compliance/retention-schedule.md says is due,
--      skips what a legal hold keeps, and logs the counts ("resbite retention:" in the Postgres logs), never ids.
--      (03:17 is plan 1's sms-records-sweep and 03:32 plan 2's purge-deletion-receipts.)
--   4. Schedules 'cleanup-images' to run every ten minutes. Each run POSTs '{}' to the function with
--      "Authorization: Bearer <secret>" and a 60 second timeout. The function cleans profile-photos, then plan-covers:
--      it removes each orphaned photo and replaced cover once it has waited 7 days observed, and each one a takedown
--      script queued (remove-profile-photo.sql, remove-resbite-content.sql) at the next run, but never one a legal hold
--      keeps.
--   The URL and secret are read from Vault at each run (vault.decrypted_secrets), so no secret is in this file and
--   rotating a secret needs no reschedule.
--
-- Prerequisites (the owner does these first)
--   - 20261117130000_retention_and_team_tools.sql is applied (it defines private.run_retention() and the worker RPCs
--     the function calls).
--   - The cleanup-profile-photos function is deployed with verify_jwt = false, from the commit that sets its source
--     gate PHOTO_CLEANUP_RELEASE_APPROVED to true. It does nothing until PROFILE_PHOTO_CLEANUP_ENABLED is true.
--   - Two Vault secrets exist (Dashboard > Project Settings > Vault, or vault.create_secret):
--       profile_photo_cleanup_url     the function URL, https://<project-ref>.supabase.co/functions/v1/cleanup-profile-photos
--       profile_photo_cleanup_secret  the same value as the function's PROFILE_PHOTO_CLEANUP_SECRET
--
-- To undo
--   select cron.unschedule('retention-purge');
--   select cron.unschedule('cleanup-images');
--   Unschedule both before running supabase/rollback/20261117130000_retention_and_team_tools.rollback.sql: it refuses
--   while either is scheduled.
--
-- Reference: https://supabase.com/docs/guides/functions/schedule-functions
--   (Scheduling Edge Functions, with pg_cron, pg_net and Vault secrets.)

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- Idempotent: drop existing jobs of these names first.
select cron.unschedule(jobid) from cron.job where jobname = 'retention-purge';
select cron.unschedule(jobid) from cron.job where jobname = 'cleanup-images';

select cron.schedule(
  'retention-purge',
  '47 3 * * *',
  $job$ select private.run_retention(); $job$
);

select cron.schedule(
  'cleanup-images',
  '*/10 * * * *',
  $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'profile_photo_cleanup_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'profile_photo_cleanup_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  ) as request_id;
  $job$
);
