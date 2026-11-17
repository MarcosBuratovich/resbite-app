# Restoring a backup without undoing deletions

- **Written:** 17 November 2026, with the account deletion release (App Store readiness plan 2, [`docs/superpowers/plans/2026-11-17-asr-2-account-deletion.md`](../docs/superpowers/plans/2026-11-17-asr-2-account-deletion.md); spec C2, DEL-6 and F11; decisions D-4, D-15 and ASR2-10 in [`knowledge-base/08-decisions.md`](../knowledge-base/08-decisions.md)).
- **Who:** the owner runs every step, with their own approval at the time. The scripts are `supabase/ops/export-deletion-receipts.sql` and `supabase/ops/replay-deletions.sql`. Both are tested locally in `supabase/tests/account-deletion-release.sql`, section S8.
- **Applies** once `20261117110000_account_deletion_release.sql` is live (the runbook, [`qa/account-deletion-2026-11-17/README.md`](account-deletion-2026-11-17/README.md)).
- **Never written here:** account ids, request ids, emails, numbers or the export itself. This file and the incident log record counts only.

## 1. Why

A backup holds the database as it was when it was taken. Restoring it brings back every account deleted since then. The public promise is in [`docs/legal/delete-account.md`](../docs/legal/delete-account.md), "How long it takes, and how you know it's done": "If we ever have to restore a backup, we delete your account again before the service goes back online."

D-4 retired the independent deletion ledger that was meant to outlive a restore ([`qa/deletion-recovery-ledger.md`](deletion-recovery-ledger.md), "Retired"). This procedure keeps the promise instead. A fence keeps the app and the workers out from before the export until the replay is done. Behind it, the receipts are exported from the live database, and after the restore they are replayed with their original request ids and hashes. The person's saved receipt still resolves afterwards.

## 2. Before a planned or unplanned restore

Do these steps in this order. The export must come after the last moment the app can accept a deletion, so the fence goes up first. Someone who deletes after the export would be missing from it, and the restore would bring their account back.

1. **Record the decision** in the incident log: why the restore, which backup, who approved it. If data was lost, this is also a breach: follow [`docs/compliance/breach-response.md`](../docs/compliance/breach-response.md) and log it there (section 10).
2. **Put the fence up** (section 3). In the dashboard, turn the Data API off (Project Settings, Data API), and turn Realtime off too. These dashboard paths are UNVERIFIED: check them at the time. From here on the app can't accept a deletion, because `delete-account` reaches the database only through the Data API.
3. **Export the receipts from the live database**, behind the fence and while the database can still be read. From the repository root, with the project linked:

   ```
   supabase db query --linked -f supabase/ops/export-deletion-receipts.sql -o json > <private folder outside the repo>/receipts.json
   ```

   - The CLI's `db query --linked` and the SQL editor reach Postgres directly, not through the Data API, so they still work behind the fence. Check this at the time. If the export fails behind the fence, don't turn the Data API back on to take it: a deletion could then land after the export.
   - The script is read-only. The file holds account ids: keep it in a private folder outside the repository, never commit it, and never paste it into a ticket, a chat or a log.
   - Record only the number of rows in the incident log.
   - Receipts outlive backups: a complete receipt is purged 30 days after completion, and backups are kept for 7 days. So an export taken behind the fence covers every deletion made since any backup that can be restored.
4. **Turn the scheduled jobs off**, in the SQL editor. First record which jobs exist, names and schedules only, in the incident log:

   ```sql
   select jobname, schedule from cron.job;
   ```

   Then unschedule these:

   ```sql
   select cron.unschedule('cleanup-account'); select cron.unschedule('purge-deletion-receipts'); select cron.unschedule('retention-purge');
   ```

   Then nothing removes a file or a receipt, and nothing purges held records, while the restore is under way. If `roll-repeating-plans` is scheduled, unschedule it too (`select cron.unschedule('roll-repeating-plans');`). The fence doesn't stop it or `retention-purge` (section 3). Skip any job that the list doesn't show, because unscheduling a job that isn't there is an error. You can instead unschedule every job in the list and keep the list.

## 3. The fence

The fence went up in section 2, step 2, before the export. It stays up through the restore and the replay, and comes down only at reopening (section 6).

- With the Data API off, neither the app nor the workers can read or write: the app, the link site and the Edge Functions reach the database only through it (`delete-account` calls its database functions at `/rest/v1/rpc/...`). So no deletion is accepted after the export, and a restored account can't be used before the replay.
- The CLI and the SQL editor don't need the Data API (section 2, step 3), so the export, the checks and the replay still run behind the fence.
- Auth may still let a restored account sign in, but with the Data API off it can read and write nothing, and the replay ends it.
- The fence does not stop jobs that run SQL inside the database, which is why section 2, step 4 unschedules `roll-repeating-plans` and `retention-purge`. `roll-repeating-plans` could roll a deleted host's weekly group before the replay cancels it. `retention-purge` (`private.run_retention`) could purge records whose legal hold the restore removed, before section 5, step 1 puts the holds right. Schedule them again at reopening (section 6).

## 4. Restore

Restore from the dashboard (Database, Backups), with the fence still up. Point-in-time recovery is off (D-15), so the choice is one of the daily backups.

- The restored database has the schedule the backup had. Check `select jobname from cron.job where jobname in ('cleanup-account','purge-deletion-receipts','roll-repeating-plans','retention-purge')`, and unschedule any that came back, with the lines in section 2, step 4.
- Check that the Data API and Realtime are still off after the restore, and turn them off again if the restore turned them back on.
- If the backup predates `20261117110000_account_deletion_release.sql` (a restore in the first 7 days after it was applied), the replay function isn't there yet. Apply the migration again first, with the approved hash-guarded pattern of the runbook, and every later migration in its order.

## 5. Replay

1. **Put the legal holds right first.** The restore also undid every hold set or lifted since the backup. Compare the restored `private.legal_holds` with the hold register ([`docs/compliance/law-enforcement-requests.md`](../docs/compliance/law-enforcement-requests.md) section 11.6). Set again any hold that is missing, and lift again any that was lifted. A replay under a hold runs only the close step, so a missing hold would let the replay erase what it should keep.
2. **Run the replay.** Paste `supabase/ops/replay-deletions.sql` into the SQL editor, after checking its `sha256sum` against the runbook by eye. In the editor's copy only, put the contents of `receipts.json` in place of the empty array `[]` in its input line, between the quotes. The whole file as the CLI wrote it (`{"boundary": ..., "rows": [...], "warning": ...}`) and its rows array alone are both read. Run it, and never save the filled-in copy.
3. **Record the three counts** in the incident log:
   - `replayed`: queued again with the original request id and hash. The account's future resbites are cancelled and it is erased at once, or, under a hold, only the close step runs and the job waits for the hold;
   - `present`: the restored database already has a deletion job for the account, and the worker carries on with it;
   - `gone`: the restored database has no such Auth user, so there is nothing to delete (the account was made after the backup, or was already fully deleted when the backup was taken).

   The three add up to the export's row count. Running the replay twice is safe: the second run answers `present` for every row the first replayed.
4. **Schedule the workers again**: run `supabase/ops/schedule-account-deletion.sql` in the SQL editor, as the runbook's step 7 does (the Vault secrets came back with the backup; check they are there).

## 6. Reopen

- Turn the Data API and Realtime back on. This takes the fence down. Schedule `roll-repeating-plans` again if section 2 unscheduled it, with `supabase/ops/schedule-roll-repeating-plans.sql`.
- Schedule `retention-purge` again with `supabase/ops/schedule-retention.sql`, only after section 5, step 1 has put the holds right. That script also creates `cleanup-images` again, and is safe to run twice.
- Watch the jobs until every replayed job is `complete` (minutes):

  ```sql
  select status, count(*) from private.account_deletion_jobs group by status;
  ```

  A job under a hold stays `held`, as before the restore.
- The files of accounts deleted before the restore are already gone from Storage. Backups hold Storage metadata, not the files themselves, so the restored database lists objects whose bytes no longer exist. The worker's removal of that metadata is expected.
- Delete `receipts.json` once the counts are recorded and every replayed job is `complete`.

## 7. The limit

If the live database can't be read (it was lost, not just damaged), the receipts are lost with it. Deletions made after the backup can't be replayed, and those accounts come back with the restore.

- Those people's saved receipts read "can't find": the restored database has no record of their request.
- Record this in the breach log, with the period between the backup and the loss.
- Answer each such person through privacy@resbite.com, and delete the account again with `supabase/ops/delete-account.sql` once their identity is checked (`docs/compliance/data-requests.md` sections 4 and 8.2).
- This is the accepted cost of D-4: no independent ledger outside the database.

## 8. Rehearsal (F11)

Rehearse the whole procedure into a scratch project, never the live one, with disposable accounts only: before launch, then yearly. Record the date, the backup used and the three counts. A rehearsal proves the dashboard paths of sections 2 and 4, and that the export and the replay run with the Data API off, so mark them verified then.
