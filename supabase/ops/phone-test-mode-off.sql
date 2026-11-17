-- Phone-code test mode off: the switch-off sitting (App Store readiness plan 1:
-- docs/superpowers/plans/2026-11-17-asr-1-phone-codes.md, Task 5 and Decision 9; qa/phone-accounts-2026-10-27/README.md
-- steps 7.1 and 7.2).
--
-- OWNER-RUN, NOT A MIGRATION. Run it only once the Send SMS hook is on HTTPS (the send-sms function) and a real code
-- has been proven (qa/phone-codes-2026-11-17/README.md, sitting 1): test mode off under the Postgres hook refuses every
-- code. Plain statements, with no begin, commit or psql meta-command: the owner script wraps it in one transaction
-- behind its guard and runs it with supabase db query --linked -f.
--
-- What it does, in that one transaction:
--   1. Turns test mode off: public.exchange_test_code then swaps 000000 for nothing, and the Postgres hook refuses.
--   2. Empties private.test_codes, the latest code per number.
--   3. Ends every session: deletes every refresh token and every session, so everyone signs in again (by text code,
--      Apple, Google or password). Access tokens already issued work until they expire (an hour) but can't be
--      refreshed.
--   4. Prints counts only, one row: test_mode (false), codes_left (0), sessions_left (0), refresh_tokens_left (0) and
--      log_rows_kept (as before).
-- private.test_mode_log is not touched: supabase/ops/phone-test-mode-review.sql reads it next, and BR-2026-001 is
-- recorded from it before the retiring migration (20261117100000_phone_test_mode_retired) drops it.
update private.phone_mode set test_mode = false, changed_at = now();
truncate private.test_codes;
delete from auth.refresh_tokens;
delete from auth.sessions;
select coalesce((select test_mode from private.phone_mode), false) as test_mode,
 (select count(*) from private.test_codes) as codes_left,
 (select count(*) from auth.sessions) as sessions_left,
 (select count(*) from auth.refresh_tokens) as refresh_tokens_left,
 (select count(*) from private.test_mode_log) as log_rows_kept;
