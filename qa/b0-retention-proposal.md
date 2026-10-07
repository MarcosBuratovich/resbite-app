# B0 retention and recovery proposal

Prepared 23 September 2026. **Proposed operational rules, not activated.** This document is for owner review; it does not authorize deletion of an account, enable workers or approve a wider tester cohort.

## Proposed rules for the current account/profile slice

| Data | Proposed handling | Implemented preparation |
|---|---|---|
| Account, private optional details and current profile photo | Keep while the account is active; allow the user to edit/remove individual fields and photos | Account-details and profile removal are live; account-wide deletion remains gated |
| Accepted account-deletion request | Block app access immediately, cancel/redact the existing shared plan records and queue Storage/Auth removal | Existing local lifecycle migration/worker; not hosted or enabled |
| Deletion processing | Run a bounded batch every five minutes; retry partial/provider failures and investigate jobs older than 24 hours | Existing leases/backoff; schedule and operational alerting still to configure |
| Unattached profile uploads | Eligible for cleanup only after **seven continuous days observed unattached**, rechecked under the account lock | New local cleanup worker; currently source-hard-disabled |
| Completed photo-cleanup receipts | Keep detailed operational records for 30 days; then keep only user ID + retired-path hash while that Auth namespace exists | Preserves the fence against delayed upload retries reusing a removed path; no image or original path remains after receipt pruning |
| Retired-path hashes after account deletion | Remove only after completed account deletion and a fresh check that Auth, profile and all profile objects are absent | Local photo cleanup purge uses the same account lock |
| Completed account-deletion receipts | Remove request/user IDs and recovery hash after at least **30 days from completed cleanup**, only after photo cleanup records/fences and all Auth/profile/photo data are gone | New service-only bounded purge; no active or failed job is expired |
| Recovery after receipt expiration | The old receipt no longer resolves; show the same unavailable result as an invalid receipt | Never turn missing proof into a false deletion-success claim |

These windows do not approve retention rules for future chat, wellness/history, group media or report evidence. Those remain part of their feature milestones. No automatic 30-day expiry applies to an active person's useful beta plans/history.

## Verified provider state

- The existing organization is on Supabase **Pro**. Its dashboard shows seven physical daily backups, dated 17–23 September. Point-in-time recovery is **not enabled**. No subscription/add-on was changed.
- Supabase documents seven days of daily backup history for Pro. Database backups include Storage metadata, **not the stored image files**; a database restore cannot recover an image already deleted through Storage. [Database backups](https://supabase.com/docs/guides/platform/backups)
- Pro's published API/database log history is seven days. This is the customer-accessible provider window, not a promise that Resbite can erase every provider billing/security record immediately. [Current plan limits](https://supabase.com/pricing)
- The project’s Auth audit setting currently shows database audit writing off, and `auth.audit_log_entries` contains zero rows. Auth logs remain in the provider logging service. No audit/security setting was changed. [Auth audit storage](https://supabase.com/docs/guides/auth/audit-logs)
- Additional log drains, independent exports and other external copies must be inventoried before wider beta. The above does not prove their absence or their retention.

## Restore gate

Never restore a backup into a reachable production app and assume deletion remains honored. A snapshot predates later deletions. Before a planned restore, preserve the latest minimal deletion ledger in an approved protected location outside the database being restored; after restoration, keep all app access blocked while reapplying those deletions and reconciling Storage metadata. Validate with a specifically designated disposable account before release.

A catastrophic-loss recovery also needs a separately durable deletion ledger. That independent recovery mechanism is **not implemented by these database-only receipt tables**. If a complete post-backup deletion ledger cannot be established, production reopening remains blocked. Receipt purging must remain disabled if recovery copies can exceed the approved retention window or deletion replay cannot be guaranteed. Do not create unencrypted ad hoc exports of user data to work around this requirement.

## Activation sequence after policy approval

1. Review the local deletion, profile-photo cleanup and receipt-retention migrations together. Deploy only the reviewed dependency set; do not blindly push the differently timestamped hosted ledger.
2. Use designated disposable identities for live Auth/Storage testing. Never use the owner's real account for destructive acceptance. Prove old-session denial, fresh proof, partial removal, lease takeover and Storage upload races.
3. Verify backup/log/export inventory and the protected deletion-ledger/restore gate above. Keep deletion/receipt purge off until these checks are satisfied.
4. Configure separate server-only worker secrets and bounded schedules; establish queue-age/failure alerts and runbook ownership. Clients receive no worker credentials or purge parameters.
5. Enable the deletion surface only after its end-to-end test. Enable photo cleanup only after its source release gate is reviewed. Receipt purge requires both deletion and its independent release flag; schedule photo-fence purge before receipt purge, with the SQL dependency checks as a fallback.
6. Record deployed versions, native acceptance and exact policy approval. Broader tester access stays closed until separately authorized.

Local code can be reviewed and tested now. Approval of these rules alone does not satisfy the remaining destructive-test, restore and operations gates.
