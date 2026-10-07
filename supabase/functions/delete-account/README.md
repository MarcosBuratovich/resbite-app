# Account deletion — prepared, not deployed

This feature is source-gated off by `ACCOUNT_DELETION_RELEASE_APPROVED` in `_shared/deletion-release.ts`, in addition to `ACCOUNT_DELETION_ENABLED` on the server and `EXPO_PUBLIC_ACCOUNT_DELETION_ENABLED` in the app. Environment flags alone cannot activate requests or cleanup. Receipt purge has an additional independent source gate. No hosted migration, worker schedule, real deletion or email was executed for this milestone.

## Request and recovery

`delete-account` accepts POST `{ action: "request", requestId, recoveryToken, proof }`. Authorization must be the current user access token. The proof is a separate, freshly authenticated session for the **same** user. Auth validates both tokens; the handler then checks a password/OTP AMR timestamp within five minutes. Token refresh/iat and editable metadata never authorize deletion. SQL additionally requires the proof session in `auth.sessions`, freshly created for that user, verified email and tester eligibility. The app offers password or email code and never persists those credentials/proofs.

A random 256-bit recovery secret and request UUID are saved in secure device storage before submission. Only its SHA-256 digest is stored server-side. `{ action: "status", requestId, recoveryToken }` returns only queued/processing/complete, even after the Auth account is removed. Invalid secrets receive an indistinguishable 404. This receipt stays on the originating device for recovery; losing it can require support. Never log request bodies, tokens, URLs or upstream error bodies.

On acceptance the database removes the roster entry, blocks all eligible reads/mutations (including old JWTs), redacts the profile and organizer notes/place/coordinates, cancels future owned plans once, revokes relevant links, removes the user's attendee memberships/endpoints/outbox, and journals cleanup atomically. Other participants retain cancelled plan records with a neutral organizer. The same request/secret retries safely. Mutation RPCs and Storage insert/update authorization serialize with deletion using a per-user advisory lock and recheck eligibility.

After acceptance the edge handler attempts global session revocation. Failure does not undo the database access block. Local cleanup removes account drafts as well as groups, selections, invitations and pending photo data, then signs out locally. Failed cleanup remains retryable and does not resume writes.

## Cleanup worker

`cleanup-account` accepts POST only with its separate 32+ character `ACCOUNT_CLEANUP_SECRET` as bearer authorization. It claims leased jobs, removes private photo objects **through the Storage HTTP API**, hard-deletes the Auth account through the Admin API (profile cascades; retained plan owner becomes null), then marks complete only after SQL verifies active Auth/profile/photo metadata is absent. Storage/Auth failures retain jobs with bounded-backoff retries. Expired lease results cannot finish another worker's claim. A batch processes two accounts and at most ten 100-object pages per account; more work is left queued.

Service credentials remain server-only. Neither edge function accepts caller-selected cleanup users or object paths. Keep `SUPABASE_SERVICE_ROLE_KEY` out of the app.

## Activation prerequisites

Before changing the checked-in release gates, complete the independent deletion-ledger and restore mechanism described in `qa/b0-retention-proposal.md`, its rehearsal, retention approval and isolated provider acceptance. These gates prevent accidental activation; they do not implement that recovery mechanism.

- Review and deploy the local migrations through the project migration workflow, then run hosted advisors and real Auth/Storage integration tests in an isolated test environment.
- Configure each function with `verify_jwt = false`: handlers perform their own authorization; status uses the recovery secret and cleanup uses its dedicated worker secret. A gateway-only JWT check would break recovery after account removal.
- Configure password/Google login and SMTP. The email OTP template must expose `{{ .Token }}`; an ordinary magic-link-only message cannot complete the code form.
- Configure the cleanup schedule and monitor queued/failed work before enabling the client flag. Apply request throttling at the gateway (especially status), use TLS, and restrict operator access to logs.
- Approve deletion-job/backup/log retention and support handling. The implementation intentionally does **not** claim backups or admin job receipts are immediately erased. Minimal job identifiers/hashes currently remain for recovery; their purge policy must be approved/configured before testers enter.
- Test late uploads against the actual Storage service, session revocation, partial retries, no-profile users, linked Google/email identities and receipt recovery after hard deletion. The PostgreSQL harness supplies minimal Auth/Storage tables; it is not this HTTP integration acceptance.

## Offline verification

`./scripts/test-database.sh` always creates its own disposable PostgreSQL cluster (no remote URL input). `node --experimental-transform-types --test supabase/functions/_shared/*.test.ts` runs Node 22 injected worker tests with no provider calls. Mobile `npm run check` includes deletion recovery/lifecycle tests. `node scripts/verify-deletion.mjs` checks the default-disabled UI; the script supports a separately enabled/intercepted QA bundle as documented in its source.

Signed photo URLs already issued can remain usable until their short expiry/file removal. Copies made outside Resbite cannot be recalled. Orphan-photo cleanup for active accounts is a separate outstanding retention task; account deletion enumerates **all** objects under that account's prefix.

## Ledger-backed admission preparation — 29 September

The unconfigured gateway now rejects deletion requests. `withLedger(project, recorder)` uses the prepared reservation and activation RPCs through the verified-ledger coordinator. The entry point is still source-disabled and has no ledger credentials/configuration. Local migration `20260929125858_deletion_intent_reservations.sql` is not deployed. See `qa/deletion-recovery-ledger.md` for exact evidence and remaining restore/reconciliation/provider work. Do not enable the old direct-request path.
