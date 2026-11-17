# Deletion receipt purge: purge-deletion-receipts

Built locally for the App Store release (plan 2, ASR2-10). Not deployed. Account deletion itself: [delete-account](../delete-account/README.md).

## The 30-day rule

Each run calls `purge_completed_deletion_receipts(100)` as `service_role` and removes at most 100 receipts. A receipt goes only when all of these hold:

- its job is `complete`, it was completed at least 30 days ago, and no worker holds a lease on it;
- the account has no Auth user and no profile left;
- no file is left in `profile-photos/<uid>/` or `plan-covers/<uid>/`.

A `queued`, `processing` or `held` job is never purged. A cover left after the Auth account has gone keeps the job open, so the receipt stays and the file is never left with no record.

Where the photo-cleanup tables exist, the purge also waits for their fences: no photo cleanup job and no retired photo path for the account. That is the local replay today, and hosted once C3 brings them. The SQL picks that branch with `to_regclass`, so it runs on hosted without them.

After the purge, a saved receipt answers 404, like an unknown one.

## The hold

While a legal hold names the account (`private.account_held`, UGC-15), its receipt stays, whatever its age. It can go 30 days after completion once the hold is lifted.

## Calling it

- POST with `Authorization: Bearer <ACCOUNT_RECEIPT_PURGE_SECRET>`, at least 32 characters (for example `openssl rand -hex 32`).
- It needs `ACCOUNT_DELETION_ENABLED=true` and `ACCOUNT_RECEIPT_PURGE_ENABLED=true`.
- It also needs both source gates in `_shared/deletion-release.ts`, `ACCOUNT_DELETION_RELEASE_APPROVED` and `DELETION_RECEIPT_PURGE_RELEASE_APPROVED`. Both are `false` until the rollout's step 5, with the owner's approval. Until then it answers 503 and calls nothing.
- The body can't choose accounts, receipts, ages or batch sizes.
- It answers `{"receiptsPurged": n}`.
- Deploy it with `verify_jwt = false` (`supabase functions deploy purge-deletion-receipts --no-verify-jwt`): it checks its own secret.
- The secret and the service key stay on the server, never in the app.

## The cron

`supabase/ops/schedule-account-deletion.sql` (owner-run) calls it daily at 03:32 UTC, with the Vault secrets `purge_deletion_receipts_url` and `purge_deletion_receipts_secret`. `select cron.unschedule('purge-deletion-receipts');` stops it.

## The ledger condition is retired (D-4)

The purge used to wait for an independent deletion ledger that would outlive a backup restore. D-4 retired that ledger. A restore is now covered by the written [restore procedure](../../../qa/deletion-restore-procedure.md): it exports the receipts from the live database before the restore and replays them afterwards, with their original request ids and hashes.

## Tests

From the repository root (Node 22 on Linux needs the tsx loader):

```bash
node --import ./mobile/node_modules/tsx/dist/loader.mjs --test supabase/functions/_shared/deletion-receipt-retention.test.ts
bash scripts/test-database-docker.sh
```

Neither uses hosted credentials or touches live data.
