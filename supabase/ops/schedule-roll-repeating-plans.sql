-- Schedule the roll of repeating resbites: create each repeating resbite's next occurrence every five minutes.
--
-- OWNER-RUN, NOT A MIGRATION. Paste into the hosted project's SQL editor and run once, with approval.
-- It cannot run in the local Docker test harness (no pg_cron there); do not add it to a test list.
--
-- What it does
--   1. Enables pg_cron if it is absent.
--   2. Removes any existing 'roll-repeating-plans' job, so re-running is safe.
--   3. Schedules 'roll-repeating-plans' to run every five minutes. Each run calls private.roll_repeating_plans() as
--      the job's owner (postgres); no API role may execute that function. It creates the next occurrence of every
--      repeating resbite that has ended, or was cancelled on its own, and queues the invitations for it; the
--      deliver-notifications job sends them.
--
-- Prerequisites (the owner does these first)
--   - 20261031120000_creating_a_resbite.sql is applied (it defines private.roll_repeating_plans()).
--
-- To undo
--   select cron.unschedule('roll-repeating-plans');
--
-- Reference: https://supabase.com/docs/guides/cron

create extension if not exists pg_cron with schema pg_catalog;

-- Idempotent: drop an existing job of this name first.
select cron.unschedule(jobid) from cron.job where jobname = 'roll-repeating-plans';

select cron.schedule(
  'roll-repeating-plans',
  '*/5 * * * *',
  $job$ select private.roll_repeating_plans(); $job$
);
