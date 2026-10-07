# Completed account-deletion receipt purge

Prepared locally; not deployed or enabled. Policy proposal: [B0 retention](../../../qa/b0-retention-proposal.md).

The handler accepts POST only with `ACCOUNT_RECEIPT_PURGE_SECRET` (at least 32 characters). Both `ACCOUNT_DELETION_ENABLED=true` and `ACCOUNT_RECEIPT_PURGE_ENABLED=true` are required. Configure `verify_jwt=false` when deploying because the handler validates its separate worker secret. Never expose this secret or the service key in the app. Bodies cannot select users, ages or batch sizes.

`purge_completed_deletion_receipts(100)` removes at most 100 completed receipts older than 30 days after checking absent Auth/profile/Storage data and absent photo cleanup jobs/retired-path fences. It never expires queued, processing, incomplete or leased jobs. The RPC is service-role only. Run the photo worker's fence purge first; SQL also keeps the proof if the ordering is reversed. Old valid receipts become indistinguishable from unavailable receipts after pruning.

Do not enable until approved retention and external deletion-ledger/restore handling are verified. Database backup retention does not itself provide a durable record of deletions after a backup. The scheduling and secret setup are operational prerequisites, not completed by creating this function.

Tests: `node --experimental-transform-types --test supabase/functions/_shared/deletion-receipt-retention.test.ts` and `scripts/test-database.sh`. Neither uses hosted credentials or deletes live user data.

The entry point additionally requires both checked-in release gates in `_shared/deletion-release.ts`. Both remain false. Environment flags alone cannot activate receipt purging; independent recovery coverage must be proven before changing the purge gate.
