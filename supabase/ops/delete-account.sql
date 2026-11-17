-- Delete an account for the person who can't do it in the app (App Store readiness plan 2:
-- docs/superpowers/plans/2026-11-17-asr-2-account-deletion.md; AS-R3, D-19).
--
-- OWNER-RUN, NOT A MIGRATION (AS-R3). For web-only, banned and under-18 accounts, which can't delete themselves in the
-- app, and only after docs/compliance/data-requests.md section 4's identity check and a legal-hold check. Paste it into
-- the hosted project's SQL editor, put the account id below in the editor's copy only, and run. It runs the same
-- lifecycle as Delete account in the app (private.operator_account_deletion): the job, the cancellations and the
-- erase step at once, or, under a legal hold, only the cancellations, the job held until the hold is lifted. The
-- cleanup worker then removes the account's photos, covers and Auth user. An account that already has a job answers
-- that job, so running it twice is safe. An id with no Auth user is refused: 22023 'No such account'.
-- It prints the request id and the status. Keep the request id in the request log, never here. To check later:
--   select status, completed_at from private.account_deletion_jobs where request_id = '<id>';
-- Never delete the user from the Auth dashboard instead: that skips the lifecycle (no cancellations, the messages keep
-- their words) and leaves the account's files with no record.
-- Edit: the account id.
with input(user_id) as (values ('00000000-0000-0000-0000-000000000000'::uuid))
select private.operator_account_deletion(i.user_id) as request from input i;
