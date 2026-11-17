-- Schedule account deletion's two workers: call the cleanup-account Edge Function every five minutes, and the
-- purge-deletion-receipts Edge Function once a day.
--
-- OWNER-RUN, NOT A MIGRATION. Paste into the hosted project's SQL editor and run once, with approval.
-- It cannot run in the local Docker test harness (no pg_cron or pg_net there); do not add it to a test list.
--
-- What it does
--   1. Enables pg_cron and pg_net if they are absent.
--   2. Removes any existing 'cleanup-account' and 'purge-deletion-receipts' jobs, so re-running is safe.
--   3. Schedules 'cleanup-account' to run every five minutes. It removes each deleted account's files (profile-photos
--      and plan-covers under the account's folder), then its Auth user, then finishes the job.
--   4. Schedules 'purge-deletion-receipts' to run daily at 03:32 UTC. It removes complete deletion receipts 30 days
--      after completion. (03:17 is plan 1's sms-records-sweep and 03:47 plan 6's retention-purge.)
--   Each run POSTs '{}' to its function with "Authorization: Bearer <secret>" and a 10 second timeout.
--   The URLs and secrets are read from Vault at each run (vault.decrypted_secrets), so no secret is in this file and
--   rotating a secret needs no reschedule.
--
-- Prerequisites (the owner does these first)
--   - 20261117110000_account_deletion_release.sql is applied (it defines the worker RPCs both functions call).
--   - The cleanup-account and purge-deletion-receipts functions are deployed with verify_jwt = false.
--   - Four Vault secrets exist (Dashboard > Project Settings > Vault, or vault.create_secret):
--       cleanup_account_url             the function URL, https://<project-ref>.supabase.co/functions/v1/cleanup-account
--       cleanup_account_secret          the same value as the function's ACCOUNT_CLEANUP_SECRET
--       purge_deletion_receipts_url     the function URL, https://<project-ref>.supabase.co/functions/v1/purge-deletion-receipts
--       purge_deletion_receipts_secret  the same value as the function's ACCOUNT_RECEIPT_PURGE_SECRET
--   The workers still do nothing until their release gates in supabase/functions/_shared/deletion-release.ts are true
--   in the deployed functions and ACCOUNT_DELETION_ENABLED (and, for the purge, ACCOUNT_RECEIPT_PURGE_ENABLED) is true.
--
-- To undo
--   select cron.unschedule('cleanup-account');
--   select cron.unschedule('purge-deletion-receipts');
--
-- Reference: https://supabase.com/docs/guides/functions/schedule-functions
--   (Scheduling Edge Functions, with pg_cron, pg_net and Vault secrets.)

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- Idempotent: drop existing jobs of these names first.
select cron.unschedule(jobid) from cron.job where jobname in ('cleanup-account', 'purge-deletion-receipts');

select cron.schedule(
  'cleanup-account',
  '*/5 * * * *',
  $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'cleanup_account_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cleanup_account_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 10000
  ) as request_id;
  $job$
);

select cron.schedule(
  'purge-deletion-receipts',
  '32 3 * * *',
  $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'purge_deletion_receipts_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'purge_deletion_receipts_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 10000
  ) as request_id;
  $job$
);
