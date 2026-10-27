-- Schedule the push sender: call the deliver-notifications Edge Function every minute.
--
-- OWNER-RUN, NOT A MIGRATION. Paste into the hosted project's SQL editor and run once, with approval.
-- It cannot run in the local Docker test harness (no pg_cron or pg_net there); do not add it to a test list.
--
-- What it does
--   1. Enables pg_cron and pg_net if they are absent.
--   2. Removes any existing 'deliver-notifications' job, so re-running is safe.
--   3. Schedules 'deliver-notifications' to run every minute. Each run POSTs to the function with
--      "Authorization: Bearer <secret>" and a 10 second timeout.
--   The URL and secret are read from Vault at each run (vault.decrypted_secrets), so no secret is in this
--   file and rotating a secret needs no reschedule.
--
-- Prerequisites (the owner does these first)
--   - The deliver-notifications function is deployed with verify_jwt = false.
--   - Two Vault secrets exist (Dashboard > Project Settings > Vault, or vault.create_secret):
--       deliver_notifications_url     the function URL, https://<project-ref>.supabase.co/functions/v1/deliver-notifications
--       deliver_notifications_secret  the same value as the function's NOTIFICATION_WORKER_SECRET
--   The sender still sends nothing until DELIVERY_RELEASE_APPROVED is true in the deployed function.
--
-- To undo
--   select cron.unschedule('deliver-notifications');
--
-- Reference: https://supabase.com/docs/guides/functions/schedule-functions
--   (Scheduling Edge Functions, with pg_cron, pg_net and Vault secrets.)

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- Idempotent: drop an existing job of this name first.
select cron.unschedule(jobid) from cron.job where jobname = 'deliver-notifications';

select cron.schedule(
  'deliver-notifications',
  '* * * * *',
  $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'deliver_notifications_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'deliver_notifications_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 10000
  ) as request_id;
  $job$
);
