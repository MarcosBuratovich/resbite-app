-- Schedule the sweep of Twilio's message records: call the send-sms Edge Function's sweep route once a day.
--
-- OWNER-RUN, NOT A MIGRATION. Paste into the hosted project's SQL editor and run once, with approval.
-- It cannot run in the local Docker test harness (no pg_cron or pg_net there); do not add it to a test list.
--
-- What it does
--   1. Enables pg_cron and pg_net if they are absent.
--   2. Removes any existing 'sms-records-sweep' job, so re-running is safe.
--   3. Schedules 'sms-records-sweep' to run every day at 03:17 UTC. Each run POSTs to the sweep route with
--      "Authorization: Bearer <secret>" and a 30 second timeout. The route deletes every message record at Twilio
--      whose status is final and that is over a day old (the Privacy Policy's placeholder 5 proposal).
--   The URL and secret are read from Vault at each run (vault.decrypted_secrets), so no secret is in this
--   file and rotating a secret needs no reschedule.
--
-- Prerequisites (the owner does these first)
--   - The send-sms function is deployed with verify_jwt = false, and its secrets are set (supabase/functions/send-sms/README.md).
--   - Two Vault secrets exist (Dashboard > Project Settings > Vault, or vault.create_secret):
--       sms_sweep_url     the sweep route's URL: the project URL (https://<project-ref>.supabase.co)
--                         followed by /functions/v1/send-sms/sweep
--       sms_sweep_secret  the same value as the function's SMS_SWEEP_SECRET
--   Skip this script if the owner fills the Privacy Policy's placeholder 5 another way: the route then does nothing.
--
-- To undo
--   select cron.unschedule('sms-records-sweep');
--
-- Reference: https://supabase.com/docs/guides/functions/schedule-functions
--   (Scheduling Edge Functions, with pg_cron, pg_net and Vault secrets.)

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- Idempotent: drop an existing job of this name first.
select cron.unschedule(jobid) from cron.job where jobname = 'sms-records-sweep';

select cron.schedule(
  'sms-records-sweep',
  '17 3 * * *',
  $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'sms_sweep_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'sms_sweep_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  ) as request_id;
  $job$
);
