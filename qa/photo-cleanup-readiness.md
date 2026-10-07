# Orphan profile-photo cleanup — 23 September 2026

Status: implemented and verified locally; **not deployed, scheduled or enabled**. This closes the missing implementation for active-account orphan photos, not B0's live Storage/retention acceptance. No account, object, tester roster or hosted configuration was changed.

## Protocol

The service-only scanner observes up to 100 unattached profile-photo objects per run. A photo becomes eligible only after seven continuous days of observation, not merely seven days since upload. Existing bucket contents receive a full observation window. Upload/update, attachment and detachment invalidate the observation; claim rechecks object identity and the current profile after taking the same account advisory lock as `set_avatar` and account deletion. Recently changed, currently attached and deleting-account candidates are discarded or skipped.

Before a worker can receive a path, SQL records an irreversible retirement fence for that exact path. The existing Storage insert/update guard and a profile-reference guard reject retired paths. A five-minute worker lease controls retries; **lease expiry never makes the path reusable**. Thus an HTTP request paused after validation cannot later remove a newly attached/reused photo. The mobile app already creates random paths; an interrupted operation older than the grace period may require choosing the photo again with a new path.

The worker revalidates the lease before removing one exact path through Storage HTTP. It never deletes `storage.objects` rows with SQL. A successful response only completes after SQL verifies metadata absence under the current lease. A failed or unknown HTTP response stays retryable; if the object was actually removed, the next attempt observes absence. Retries use 60-second initial backoff, doubling to a one-hour maximum. Each run claims five objects, with a hard SQL limit of twenty, and each HTTP request has a ten-second deadline.

When account deletion wins after retirement, the photo worker defers remaining files to account cleanup. Both workers may have already-issued deletion requests, but they can only target the retired, non-reusable namespace. Account cleanup removes all account-prefix files before deleting Auth. A deleting or absent Auth namespace cannot receive new profile-photo metadata, including service-authenticated writes through the guarded Storage transaction.

The migration also tightens private read access: eligible owners can read their own upload paths for interrupted-save recovery; eligible participants can read only a readable profile's **currently attached** avatar. Knowing an abandoned or replaced path no longer grants participant access. Existing signed URLs can remain valid until their short expiry or object deletion.

## Retention proposal requiring owner review

| Record | Proposed period / removal condition |
| --- | --- |
| Unattached photo bytes | At least seven continuous days observed unattached; longer while workers are disabled/failing or processing a backlog |
| Detailed successful cleanup receipt (account ID, path, object ID, timing, lease history counter) | Thirty days after confirmed completion; batches of 100 |
| Incomplete cleanup receipt | Until cleanup succeeds; monitor retries instead of discarding evidence and silently abandoning bytes |
| Minimal retired-path fence (account ID + SHA-256 path hash; no raw path/photo) | While that Auth namespace exists, even after the detailed receipt expires |
| Retired fence / remaining photo receipts after account deletion | Purge only with a completed account-deletion receipt and fresh checks that Auth, profile and **all** profile-photo objects under the prefix are absent; recheck under the account lock |

The minimal fence preserves protection against delayed workers and clients reusing a former path. An arbitrary TTL would reopen that race. Account deletion supplies a bounded lifecycle exit because new accounts receive different UUID namespaces. Admin recreation of a deleted UUID is not supported. Deletion-receipt pruning must retain the positive deletion proof while any photo cleanup job/fence remains; root's separate retention migration coordinates this dependency. A photo worker that is never activated must not cause deletion receipts to lose that proof prematurely.

These periods are proposals embedded in prepared code, not approved or active policy. Backups and infrastructure/provider logs have separate retention, still requiring the broader deletion review. No claim is made that remote backups disappear when a Storage API response succeeds.

## Evidence

- Eight injected Node tests cover disabled/unauthorized workers, exact path handling, stale leases, lost removal replies, retryable failure, account-deletion deferral, caller-body isolation, timeout and no upstream-data disclosure.
- `supabase/tests/photo-cleanup.sql` passes in disposable PostgreSQL: role grants, owner/participant read separation, grace period, upload/attachment age resets, stale candidates, immutable retired paths after lease/receipt expiry, incomplete removal, lease takeover, account deletion and verified identifier purge.
- `supabase/tests/local/photo-cleanup-concurrency.sh` exercises real overlapping SQL transactions: attachment-first and upload-first make claiming skip the busy account; retirement-first makes delayed attachment and overwrite wait, then fail. The currently attached photo remains unchanged.
- The full existing disposable foundation/account/registration/deletion/notification security suite also passes. The harness uses synthetic Auth/Storage contracts; SQL fixture deletes only simulate HTTP results and never run against hosted Storage.

Run worker tests with Node 22: `node --experimental-transform-types --test supabase/functions/_shared/profile-photo-cleanup.test.ts`. Run SQL and concurrency from `scripts/test-database.sh` (includes the new concurrency harness). There are no native dependencies in this change.

## Exact activation prerequisites

1. Approve the above grace period, receipt/fence lifecycle and broader deletion/backup/log retention. Decide support handling for an unfinished photo upload resumed after the seven-day window.
2. Review and deploy the existing deletion-lock migration, `20260923152816_orphan_profile_photo_cleanup.sql`, and the coordinated deletion-receipt retention migration by name. Do not run a blanket migration push against the differently timestamped hosted foundation ledger. This migration modifies the existing custom Storage trigger; current Supabase guidance treats Storage schema changes as sensitive, so verify compatibility in an isolated environment first.
3. Run hosted security advisors and inspect exact Storage/RLS grants. Verify anonymous and unapproved access denial, owner upload/recovery, participant access to only the attached avatar, and signed-URL expiry behavior. The bucket remains private.
4. In an isolated real Supabase environment, exercise upload-body/metadata overlap, upsert, concurrent `set_avatar`, late Storage responses, lost delete replies, lease takeover, and account deletion. Prove rejected uploads cannot publish a blob after cleanup, or that provider reconciliation removes it. The local PostgreSQL lock tests cannot establish Storage/S3 transaction behavior.
5. Confirm failed cleanup monitoring and operator recovery, including a queue stuck behind a disabled account-deletion worker. Verify photo proof pruning runs before deletion-receipt removal, or the latter safely skips unresolved dependencies. Do not manually drop retirement fences to unblock a retry.
6. Only after those checks, change `PHOTO_CLEANUP_RELEASE_APPROVED` from its checked-in `false`, set `PROFILE_PHOTO_CLEANUP_ENABLED=true`, configure a separate random 32+ character `PROFILE_PHOTO_CLEANUP_SECRET`, and deploy `cleanup-profile-photos` with gateway JWT verification disabled. Its handler validates that dedicated worker bearer secret; service credentials remain server-only. No request body selects users or paths.
7. Configure a bounded schedule and aggregate monitoring once approved. No schedule is created by this implementation. Stop scheduling or set the enable variable false to pause; keep fences and private state so in-flight operations stay safe.

Sources checked before implementation: [Supabase changelog](https://supabase.com/changelog), [Storage schema](https://supabase.com/docs/guides/storage/schema/design), and [Storage object deletion](https://supabase.com/docs/guides/storage/management/delete-objects). Storage files are deleted exclusively through its API; database metadata is only observed and fenced by the prepared protocol.
