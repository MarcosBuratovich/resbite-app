# B0 profile-photo consistency — 24 September 2026

The account-foundation review found a delayed write could resolve the SDK's newly signed-in account, and a photo upload could overwrite a change made on another device. Immediate client deletion of the previous file also lacked the server retirement fence needed to prevent concurrent reattachment.

## Implemented and deployed

- Photo operations and name saves capture and validate the intended account, then use its fixed bearer token for that operation. No later SDK session lookup can adopt another account. Leaving/signing out still invalidates UI completion; an already-issued server request is not claimed to be cancelled.
- Profiles have a database-managed `avatar_revision`, starting at zero. Every distinct path change increments it, including the legacy setter and trusted maintenance. New writes compare the original path and revision under the account/profile locks. A stale or changed-then-restored baseline fails; an exact next-revision retry acknowledges a lost response.
- The client persists the original revision with the pending photo change. Old journals remain readable but require Keep saved photo and a fresh choice; they cannot silently acquire a new baseline. Confirmed operations clear their journal using the authoritative saved path/revision.
- Clients no longer delete Storage objects. Removing a photo clears its profile reference; old bytes remain in private storage until safe server cleanup is enabled. The UI and privacy page explain this. The owner retains interrupted-upload reads; other authorized participants may read only the currently attached photo. Previously issued five-minute signed URLs can remain valid until expiry.
- Native image-manipulation resources are released even when rendering fails. Cancelling the picker makes no upload or profile change.

Only [avatar_revision_compare_and_swap](../../supabase/migrations/20260924150135_avatar_revision_compare_and_swap.sql) was deployed, with hosted migration version `20260924150824`. Its SHA-256 is `460f939f386edfc602121634ca7bb966f5772b5f1c9f6f70007e41d09c9913eb`. No Auth identity, profile photo, invitation or plan was created/deleted for hosted QA. No cleanup/deletion worker, retention schedule or additional tester was enabled.

[Before-state](hosted-before.json) and [after-state](hosted-after.json) show the additive column/trigger/RPC, authenticated-only RPC permission, denied direct client photo DELETE and narrowed participant read policy. The 15:08:44 UTC read-back confirms one enabled owner and eleven published activities. Prepared account-deletion and photo-cleanup tables remain absent from hosted schema.

## Verification

- `mobile/npm run check`: TypeScript, **119 tests**, original-eight and separate-three content/artwork validation pass. The **13 photo tests** include real SDK HTTP token-binding assertions, concurrent update during upload, changed-then-restored paths, exact lost-response reconciliation, legacy journal handling and native picker-resource cleanup.
- `verify-profile.mjs`: intercepted browser fixtures pass for normalization/upload, restart with the same pending path/revision, lost successful link response, conflicting removal, legacy-journal discard and zero client Storage DELETE requests. All backend requests were intercepted.
- `verify-confirmation.mjs` at 320/390 and `verify-auth.mjs` pass; these send no real email and do not establish actual inbox/callback acceptance.
- Backend agent: **9 local migrations, 10 SQL assertion files and 4 real concurrency scripts** pass in a disposable database. A separate hosted-baseline-only installation (foundation, access, details, catalogue and the new avatar migration) passes avatar assertions/concurrency too. Fixtures end with no retained users, roster entries or objects.
- iOS Hermes export passes at `/private/tmp/resbite-b0-photo-consistency-ios`. No native dependency changed. Metro is running on port 8081. The iPhone currently reports unavailable, so fresh native delivery and visual acceptance are not claimed.
- [Hosted security advisors](security-advisors.json) report the existing four intentionally closed private-table notices and existing [leaked-password-protection warning](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection); no new photo/RPC advisory appeared. The private-table informational notice is described in [Supabase's advisor reference](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).

## Remaining acceptance and recovery

Reconnect the owner iPhone, reload the update, then verify choose/save/reopen/remove, picker cancellation and interrupted-upload retry. Removal accepts absence from the profile, not deletion of retained Storage bytes. Actual Storage HTTP authorization/races and destructive cleanup acceptance still require designated disposable identities; SQL fixtures alone do not prove provider blob behavior.

Keep the revision column/trigger and privacy restrictions during recovery: this app reads the new column. Prefer a compatible forward fix or temporarily suspend photo writes rather than dropping collected state or restoring the unsafe deletion path. The previous generation of clients may leave failed cleanup pending and should be updated. Full account deletion, orphan cleanup and receipt purge remain disabled pending their separate policy/provider/recovery gates.

## Device delivery — 28 September 2026

The owner reconnected the iPhone 14. CoreDevice reported available/paired and successfully relaunched `com.resbite.preview`. Metro then served a fresh iOS entry bundle (3,866 modules) and Supabase bundle (543 modules). No native rebuild, reinstall or data reset was needed. [Delivery evidence](device-delivery-2026-09-28.json).

The owner confirmed “It works perfectly” after the signed-in choose/save/reopen/remove check. Upload, persistence after reopening and removal from the profile are accepted on the iPhone. Physical Storage deletion, picker cancellation, offline recovery and cross-account authorization remain separate acceptance items. This supersedes the earlier device-unavailable observation with owner-reported feature acceptance.
