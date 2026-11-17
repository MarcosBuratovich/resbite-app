-- Replay deletions after a backup restore (App Store readiness plan 2:
-- docs/superpowers/plans/2026-11-17-asr-2-account-deletion.md; D-4, ASR2-10, DEL-6).
--
-- OWNER-RUN, NOT A MIGRATION. Step 5 of qa/deletion-restore-procedure.md: after the restore, with the Data API still
-- off, and after any legal hold set or lifted since the backup has been put right. Paste this into the hosted
-- project's SQL editor. In the editor's copy only, put the contents of the receipts.json that
-- supabase/ops/export-deletion-receipts.sql wrote before the restore in place of the empty array [] in the input line
-- below, between its quotes. The whole file as the CLI wrote it ({"boundary": ..., "rows": [...], "warning": ...}) and
-- its rows array alone are both read. Never save the filled-in copy.
-- Each receipt is queued again with its original request id and hash (private.replay_account_deletion), so the
-- person's saved receipt still resolves. The account's future resbites are cancelled and the account is erased at
-- once, or, under a legal hold, only the close step runs and the job waits for the hold. The cleanup worker removes
-- the account's files and its Auth user once the schedule is back.
-- One row per answer, with its count. Record the three counts:
--   gone      the restored database has no such Auth user, so there is nothing to delete (the account was made after
--             the backup, or was already fully deleted when the backup was taken);
--   present   the account already has a deletion job in the restored database, and the worker carries on with it;
--   replayed  queued again.
-- Running it twice is safe: the second run answers present for every row the first replayed.
-- Edit: the receipts, in place of [].
with input(j) as (values ('[]'::jsonb)),
r as (select private.replay_account_deletion(x.user_id, x.request_id, decode(x.recovery_hash,'hex')) as result
 from input, jsonb_to_recordset(coalesce(j->'rows', j)) as x(user_id uuid, request_id uuid, recovery_hash text))
select result, count(*) from r group by result order by result;
