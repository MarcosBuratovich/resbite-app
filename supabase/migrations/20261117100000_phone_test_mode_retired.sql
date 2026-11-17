-- Phone-code test mode retired (App Store readiness plan 1: docs/superpowers/plans/2026-11-17-asr-1-phone-codes.md,
-- Task 5 and Decision 11; AS-D5). Supabase Auth's Send SMS hook is the send-sms Edge Function now (it texts the code
-- through Twilio), so the Postgres hook, the 000000 swap and the three tables that served them go:
--   public.exchange_test_code(text, text), public.send_sms_hook(jsonb), private.test_codes, private.test_mode_log and
--   private.phone_mode.
-- private.phone_digits stays: the invitation functions use it.
-- Hosted-compatible: all five exist on the hosted project (20261027120000_phone_accounts.sql,
-- 20261030130000_phone_key.sql), so no "if exists". Rollback:
-- supabase/rollback/20261117100000_phone_test_mode_retired.rollback.sql (recreates them empty, with test mode off).
--
-- Preconditions its apply script guards (qa/phone-codes-2026-11-17/README.md, sitting 2), stopping before any change:
--   - test mode is off (private.phone_mode.test_mode false: supabase/ops/phone-test-mode-off.sql has run);
--   - no code is stored (private.test_codes is empty).
-- Preconditions it does not guard, which the owner confirms before approving this file:
--   - BR-2026-001 is recorded in the breach log (docs/compliance/breach-response.md section 11), from the review
--     (supabase/ops/phone-test-mode-review.sql): this drops the log it reads;
--   - the C11 record shows the Send SMS hook on HTTPS (the send-sms function): while Auth still points at
--     public.send_sms_hook, dropping it would fail every code request.
-- A build older than the one that sends the code as typed calls exchange_test_code only on a typed 000000; after this
-- it gets an error there and reads "Check your connection and try again." (the plan's Known gaps, 1).
drop function public.exchange_test_code(text, text);
drop function public.send_sms_hook(jsonb);
drop table private.test_codes;
drop table private.test_mode_log;
drop table private.phone_mode;
