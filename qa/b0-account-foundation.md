# B0 account foundation — updated 29 September 2026

Status: account onboarding delivered; eleven approved catalogue entries published (the original eight accepted for loading on iPhone); photo concurrency/privacy fix deployed, with upload, persistence and profile removal accepted on 28 September. Leaked-password protection enabled on 29 September. Full B0 remains in progress. Dated sections below preserve historical evidence. See the [expanded beta plan](../docs/milestones/2026-09-23-expanded-private-beta.md).

## Current acceptance checklist — 29 September

Use this checklist for current work; older dated sections below retain the evidence available at that time.

| Check | Current result |
| --- | --- |
| Account details save/reopen/remove | Accepted on iPhone |
| Google sign-in, restart, cancellation and subsequent owner sign-in | Accepted on iPhone |
| Branded password reset, callback, password save and sign-in | Accepted on iPhone |
| Unapproved account pending-access screen | Accepted on iPhone after navigation fix; roster unchanged |
| Reopening used confirmation email | Expected recovery screen/actions accepted on iPhone |
| Fresh signup callback after navigation fix; never-used expired link | Not independently accepted |
| Profile photo upload, persistence, profile removal and picker cancellation | Accepted on iPhone |
| Photo controls offline and after reconnection | Accepted; does not prove an interrupted upload |
| Interrupted upload restart/retry | Automated fixture passes; native in-flight interruption pending |
| Cross-account Auth/Storage access | SQL/fixture evidence exists; real provider acceptance remains |
| Original eight activities: artwork/details | Accepted on iPhone |
| Three additions: artwork/details/plan-editor entry | Accepted on iPhone |
| Account details with Larger Text and keyboard | Accepted on iPhone |
| New-screen VoiceOver, Reduce Motion and remaining live offline/planning paths | Pending |
| Deletion, orphan cleanup and retention | Local implementation prepared; policy, independent recovery ledger, live disposable-account tests and operations remain before activation |

Next engineering work is the deletion/cleanup recovery mechanism and operational readiness. A retention decision alone does not complete that work. Do not use the owner's account for destructive testing; the unapproved signup-test address is not automatically authorized for deletion. B1 still needs B0 completion, a separately approved second tester/phone, owned HTTPS links, native push and a standalone build.

## Delivered

- Confirmation resend with durable destination/cooldown, server rate-limit handling, neutral delivery wording and duplicate suppression. Expired/reused/wrong-device links have a recovery path. Confirmation checks require the matching verified signed-in account.
- Own-account access check distinguishes approval, unconfirmed email, pending tester access and retryable network errors. Auth recovery remains mounted until a password is saved; the access check cannot route it away early.
- New Google accounts review optional details or explicitly skip, then complete their shared name/profile. Existing email-registration details are recognized. All accounts can edit/remove optional DOB, phone, city and interests in Profile → Account details. Preview stays local and does not expose these account writes.
- Details writes use a captured bearer token and a server row lock/CAS; stale concurrent edits cannot restore data removed on another device. Nulls/empty interests clear the known fields. Unrelated metadata is preserved. Lost replies are checked against server state before an identical retry; a conflicting remote edit requires a reload.
- Setup has a sign-out escape, keyboard avoidance, disabled controls while saving and an unsaved-change prompt. Form input is in memory; it is not a durable draft.
- Invitations are retained through access-pending, optional setup and profile completion, claimed only after approval/profile readiness, and restored before the final startup redirect. Failed local restoration exposes retry instead of treating failure as no invitation.

## Evidence

- `cd mobile && npm run check`: TypeScript, **105 tests** and eight draft artwork/content pairs pass.
- `scripts/test-database.sh`: foundation, account access, optional metadata, deletion, notifications and security SQL assertions pass. Concurrent upload/deletion and concurrent personal-details removal/stale-save checks pass in disposable PostgreSQL. Synthetic roster is empty after the assertions.
- Intercepted browser QA: `verify-account.mjs` (320/390px), `verify-confirmation.mjs` (320/390px), `verify-auth.mjs`, `verify-profile.mjs`, `verify-rsvp.mjs`, `verify-session.mjs`, `verify-planning.mjs`, `verify-invitations.mjs`, default-disabled `verify-deletion.mjs` and 320/390 `verify-registration.mjs`. No fixture backend requests reach the hosted service. Account QA includes Google-style metadata, optional skip, lost successful reply, explicit removal, restart with stale SDK metadata, pending approval/retry, invitation preservation and local invitation read failure/retry. Auth QA specifically requires the recovery password form before any app redirect.
- iOS Hermes export passes to `/private/tmp/resbite-b0-ios-final`. Existing signed development app launched on the connected iPhone 14; Metro recorded a fresh 4,104-module iOS bundle. No native dependency changed in this slice.
- Owner confirmed on the physical iPhone that city save/reopen and optional-details removal work and that the keyboard/date picker feel correct ("perfect"). This is native acceptance of those account-detail operations, not the complete B0 matrix.
- Owner also confirmed that the branded reset email arrived, opened the new-password screen on the iPhone, saved the password and allowed sign-in. No password was shared with the agent.
- Read-only hosted Auth settings: email and Google enabled, confirmation required, anonymous sign-in disabled. Owner then confirmed Google sign-in and app restart both work on the physical iPhone. Google cancellation remains a separate outstanding check.

## Hosted deployment

`20260923150059_account_access_status.sql`, `20260923150902_atomic_registration_details.sql` and the additive `20260923152900_activity_catalogue_details.sql` are deployed. Their hosted ledger names are respectively `account_access_status` (20260923151512), `atomic_registration_details` (20260923151515) and `activity_catalogue_details` (20260923154040). The catalogue migration adds nullable duration and tips without publishing rows. The prepared notification/deletion migrations and disabled workers remain undeployed. Use named, reviewed migrations; do not run a blanket push against the differently timestamped hosted foundation ledger.

Verified after deployment: exactly one enabled roster entry, anonymous EXECUTE denied on both new public functions, authenticated EXECUTE present on the details function, and the owner’s access status is `approved` under the authenticated role. No additional tester was added. The owner’s subsequent native save/removal test exercised the live details path.

Hosted advisors found no new RPC/security-definer issue. Four informational “RLS enabled, no policy” entries cover intentionally closed private tables. The existing Auth warning is [leaked-password protection disabled](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection); review its provider/plan availability before broader release. SQL tests do not replace live Storage/deletion/provider acceptance.

## Still required before B0 closes

1. Explicit branded signup-confirmation delivery/fresh same-device callback acceptance and expired/reused-link handling. The unapproved account reaches pending approval without the native navigation error. Branded password reset, Google sign-in/session restoration, Google cancellation and subsequent owner sign-in are owner-accepted.
2. Remaining photo picker cancellation, interrupted retry and cross-account Auth/Storage authorization checks. Basic native upload, persistence and profile removal are accepted. Unapproved-account device acceptance requires a specifically designated identity, without adding it to the roster.
3. Approve retention/cleanup behavior, deploy and verify the prepared deletion lifecycle and orphan-photo cleanup before activation.
4. Complete the remaining live catalogue plan-entry, offline and accessibility checks. The exact eight entries are approved and published; iPhone refresh/artwork/detail loading is owner-accepted on 24 September.
5. Larger Text, VoiceOver, Reduce Motion and offline checks for new account screens; distribution review and broader B1 link/push prerequisites remain separate.

No emails were sent by automated QA, no real account was created/deleted by it, and no live invitation was sent. Native owner actions are recorded separately above.

## Catalogue and cleanup continuation

- Live Discover, detail and new-plan entry now use published Supabase content, including server text, tips, duration and a validated local artwork key. Empty/offline/error/retry are explicit. Account/focus changes invalidate responses; foreground return reloads publication. Unpublished activity deep links cannot start a new plan. Preview retains drafts; historical editing and pending-write reconciliation remain available.
- At the 23 September additive migration check, the catalogue was empty. On 24 September the approved eight entries were published with exact hosted read-back, one enabled owner and unchanged `eligible() AND published` RLS/grants. The earlier advisor result remains the existing four intentionally closed private-table notices and leaked-password-protection warning; publication does not imply a new advisor run.
- [Archived eight-card review](catalogue-review.html) preserves the exact approved artwork/copy/tips/duration/category evidence. The [executed publication record](catalogue-publication-2026-09-24/README.md) includes the fixed scope, initial empty before-image, commit receipt, exact hosted after-image and tested rollback. The owner approved the existing labels as temporary discovery filters; the separate wellness taxonomy remains undecided.
- Active-account orphan-photo cleanup is prepared locally: seven continuous days observed unattached, current-reference recheck under the account lock, irreversible path retirement before Storage HTTP deletion, leases/retries and a source-code release gate. Participant reads narrow to the attached avatar; owners retain interrupted-upload reads. These policy/trigger changes are **not deployed**. [Protocol, evidence and activation gates](photo-cleanup-readiness.md).
- Completed deletion-receipt purge is prepared locally with a 30-day window, bounded service-only execution and checks that Auth/profile/Storage plus photo cleanup dependencies are absent. The [retention/restore proposal](b0-retention-proposal.md) records actual Pro backup/log settings and the missing independent deletion ledger/restore work. Neither this proposal nor local tests authorize activation.
- Latest integration: **112 mobile tests**, TypeScript, eight content/artwork pairs, **29 backend worker tests**, full disposable SQL and real overlapping SQL transactions pass. Catalogue fixtures cover 320/390 widths, server-owned copy, offline/retry, unpublish, detail/plan deep links and stale focus replies. Planning, account and auth browser regressions pass. iOS Hermes export passes at `/private/tmp/resbite-b0-catalogue-ios`. No native dependencies changed.
- The owner accepted the live catalogue on iPhone on 24 September: “All eight load correctly” after signed-in Discover refresh and opening artwork/details. This does not extend to new-plan creation, offline behavior or fresh Larger Text/VoiceOver checks. Await the separate photo upload/persist/remove result and designated unapproved signup-test address; browser tests/export alone do not supply those results.

The cleanup/lifecycle/notification migrations remain local, workers unscheduled/disabled and broader tester access closed. B0 remains open for the specific evidence above and the earlier acceptance list.


## Publication and access evidence — 24 September

- Hosted publication committed at 12:58:29 UTC: eight inserted, no previous candidate records overwritten. At 12:59:30 UTC, all full rows matched the approved payload; all eight were published, with unchanged RLS/grants and exactly one enabled owner. [Commit receipt](catalogue-publication-2026-09-24/publication-receipt.json), [independent verification](catalogue-publication-2026-09-24/post-commit-verification.json), [journal](catalogue-publication-2026-09-24/journal.json).
- Coordinator-reported hosted SQL role checks: approved owner sees eight; an unapproved nonexistent principal sees zero; anonymous read denied by privileges. No Auth identity was created for these checks. This is database access evidence, not a completed real unapproved-user signup/device test.
- Owner confirmation “All eight load correctly” covers signed-in catalogue refresh and artwork/details on iPhone. The accepted scope includes Painting's suggested 30 minutes, null suggested duration for the other seven and current labels as temporary discovery filters. It does not approve additional activity drafts, a wider age/access policy or wellness allocation.

- After adding the local approval-status overlay, the coordinator reran `verify-catalogue.mjs`; all 320/390 browser fixtures passed. The three [new activity concepts](new-activities-review.html) remain separate review drafts, with no publication approval inferred from the first eight.

## Approved additions published — 24 September

The subsequent owner reply “love it, keep them” approved all three separately reviewed concepts: Picnic in the park, Walk and talk, and Board game night. Exact copy/tips/v2 artwork and unspecified durations are retained. Their separate [approval overlay](../mobile/content/activity-additions-approval.json) preserves the original eight-entry scope and original review bytes.

The three-row publication committed at 13:17:41 UTC, after compatible mobile registry/decoder checks and fresh bundle delivery to the connected iPhone. At 13:17:56 UTC an independent read-back matched all three records, preserved the original eight exactly and confirmed eleven total activities, unchanged RLS/grants and one enabled owner. [Publication record](catalogue-additions-2026-09-24/README.md). Local transaction checks cover replay, conflicting/partial batches, original-row drift and rollback preserving real plan references.

TypeScript, 113 mobile tests, exact content/artwork validation, extended 320/390 catalogue fixtures and iOS Hermes export pass. New activities are searchable and usable in Preview creation, saved-plan labels and editing. Physical iPhone artwork/detail loading for the new three has been requested and remains pending; the earlier eight-entry acceptance is not reused. B0's remaining account/photo/lifecycle and accessibility gates are unchanged; broader tester access remains closed.

## Profile consistency and privacy — 24 September

Continued B0 with separate mobile and backend agents. Fixed session-switching profile/photo writes, added durable revision-based photo updates and exact lost-response reconciliation, blocked stale cross-device changes and handled old pending journals explicitly. Photo removal detaches the reference; unsafe immediate client file deletion is disabled. Authorized participants can request only the current profile image; previous files remain private pending the separately gated cleanup implementation. The app explains that limitation, and picker failure releases native resources.

Deployed only `avatar_revision_compare_and_swap` (local `20260924150135`, hosted `20260924150824`). Hosted read-back confirms the revision column/trigger, guarded RPC privileges, tightened Storage policies, eleven activities and one enabled owner. No cleanup/deletion migrations or workers were activated. [Detailed evidence, deployment and limits](avatar-consistency-2026-09-24/README.md).

Verification passes: TypeScript, 119 mobile tests, content validation, profile/confirmation/auth browser fixtures, all 10 local SQL assertion files and 4 concurrency scripts, separate compatibility with the actual hosted baseline, and iOS Hermes export. The physical iPhone is currently unavailable; reconnection and fresh photo acceptance were requested. The separate controlled email for signup/closed-access acceptance is still needed. B0 remains open.

## Native continuation — 28 September

The reconnected owner iPhone 14 successfully relaunched Resbite and received fresh iOS entry/Supabase bundles containing the deployed photo fix. No reinstall or data reset was needed. [Delivery evidence](avatar-consistency-2026-09-24/device-delivery-2026-09-28.json). The owner then confirmed “It works perfectly”: signed-in photo upload, persistence after reopening and removal from the profile are accepted. Physical file cleanup, interrupted retry and cross-account Storage authorization remain separate. B0's other acceptance and policy gates remain open; access and backend configuration were not changed in this continuation.

## Password protection — 29 September 2026

Enabled only **Prevent use of leaked passwords** in the existing project's Email provider settings. The pre-change security advisor reported `auth_leaked_password_protection`; the post-save advisor at 12:28 UTC no longer reports it. The remaining four informational RLS notices concern intentionally closed private tables. No plan upgrade, credential change, roster change or lifecycle worker activation was made. See [Supabase password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

This is configuration verification, not a live rejected-password signup test. Google cancellation and a separate owner-controlled email for signup confirmation/closed-access acceptance have been requested; neither is assumed complete. B0 remains open.

## Native confirmation navigation fix — 29 September 2026

The designated closed-access signup identity is `mburatovich.dev@gmail.com`; it has not been added to the tester roster. The owner reported “maximum update depth exceeded” after opening confirmation. Metro captured a native Expo Router navigation-state update loop. Removed the repeated pathname-dependent navigator teardown during account checks: the initial cold-start access wait is retained to preserve protected deep links, but after navigation mounts, access refreshes no longer unmount it. Protected-screen guards remain unchanged.

TypeScript, a new intercepted successful-signup callback fixture (delayed pending-access response, retry and restart), auth/recovery fixtures and account fixtures at 320/390 pass. The new browser fixture also passed before the change: it is coverage of the flow, not a reproduction of the native crash. The connected iPhone was relaunched with the updated code; owner acceptance of confirmation/pending access remains required. No backend, roster or credential change was made.

## Pending-access native acceptance — 29 September 2026

After delivery of the confirmation navigation fix, the owner confirmed “I see that screen without error” in response to checking the “You’re on your way” pending-approval screen for the designated unapproved signup identity. This accepts recovery from the reported native navigation crash and display of the pending-access screen. The tester roster was not changed.

This reply does not distinguish session restoration from a new sign-in or a fresh confirmation callback. A fresh same-device callback, expired/reused-link behavior, Google cancellation and direct protected-route/Storage checks remain separate evidence; B0 is not closed by this result.

## Google cancellation native acceptance — 29 September 2026

The owner replied “All perfect” after the requested physical-iPhone sequence: sign out of the unapproved test account, start Continue with Google, cancel before choosing an account, return to usable sign-in, and sign back in with the approved owner account. Google cancellation and subsequent owner sign-in are accepted. The preceding pending-approval screen acceptance remains recorded separately. No tester roster, code or backend setting changed in this acceptance update.

Remaining B0 evidence includes fresh confirmation callback and expired/reused links, photo interruption/cross-account checks, remaining accessibility/offline checks and the separately approved deletion/retention lifecycle. This result does not close B0.

## Confirmation edge cases and photo recovery — 29 September 2026

Extended `mobile/scripts/verify-confirmation.mjs` with provider-side `otp_expired` redirects for confirmation and password recovery. Both show recovery guidance and return to usable sign-in without issuing a token exchange. The expanded confirmation suite passes at 320/390 widths. Profile fixtures also pass after the native-navigation change, including lost-link reply reconciliation, interrupted-upload restart with identical path, concurrent removal protection, legacy pending recovery and zero client file deletions. All backend calls are intercepted; no live email or upload was generated by these checks.

Physical-iPhone picker cancellation has been requested. Native offline photo retry and real expired/reused email behavior remain pending. No app code or backend configuration changed in this slice.

### Native picker cancellation accepted — 29 September 2026

Owner confirmed “Photo unchanged, no error” after opening Add optional photo/Change photo and cancelling the iPhone picker. Picker cancellation is accepted; interrupted offline retry remains pending.

## Native offline photo availability — 29 September 2026

The owner reported that Change photo could not be selected without connectivity, and became usable again after reconnecting: “This is working.” Accepted evidence is offline action unavailability and recovery after reconnecting. No upload was started while offline, so this does not establish native interrupted-upload journal restoration or Retry photo change acceptance. Those recovery paths remain covered by intercepted browser/domain tests, with physical-device interruption acceptance pending. The earlier manual instructions did not reach an in-flight upload and should not be reused as evidence of one.

## Native reused confirmation link accepted — 29 September 2026

After being asked to sign out and reopen the original confirmation email for the designated unapproved test account, the owner reported the “Let’s try again” screen, guidance that the link may have expired or already been used, and both Request confirmation email and Back to sign in actions. Reopening the used confirmation link now reaches the expected recovery UI without a reported crash. This accepts reused-link handling and visible recovery actions; it does not independently verify a never-used link expiring or completion of a fresh callback. No code, backend or tester-access changes were made.

## Native catalogue additions and account accessibility accepted — 29 September 2026

The owner replied “All perfect continue” to the two requested checks: all three additions (Picnic in the park, Walk and talk, Board game night) show artwork/details and open the plan editor; Account details fields and Save remain readable/reachable with Larger Text and the keyboard open. Those specific iPhone checks are accepted. This does not establish saved live plans, VoiceOver or Reduce Motion.

## Destructive-operation release guards — 29 September 2026

Added checked-in, default-false release gates for account deletion requests, account cleanup and deletion-receipt purging. Previously those entry points depended only on environment flags; photo cleanup already had its own source gate. Enabling all environment flags now leaves all four destructive entry points disabled without Auth, database or Storage network calls. Purging requires a separate release approval in addition to account deletion readiness.

Verified with the actual Edge Function entry modules under an injected runtime: all four return 503 with every enable variable set and a valid-length worker secret, making zero network calls. All 22 targeted deletion, receipt-retention, photo-cleanup and entry-point gate tests pass. No schema, hosted deployment, account, roster or schedule changed.

These are activation safeguards, not the independently durable deletion ledger. Its protected destination, write/acknowledgement protocol, restore replay and rehearsal still need implementation before changing the gates. Retention approval and designated disposable-provider acceptance also remain required.

## Independent deletion ledger core — 29 September 2026

Implemented the server-only encrypted immutable-record primitive and six synthetic tests. It verifies exact authenticated read-back before confirming persistence, reconciles lost write acknowledgements, rejects conflicts/tampering and accepts only minimal request identifiers/time. Focused TypeScript checking and all six ledger tests plus the destructive-entry-point gate test pass.

The owner has no separate recovery storage and asked about Supabase Storage. A private bucket in a separate Supabase project is proposed, not created or selected by authorization. The [recovery design](deletion-recovery-ledger.md) describes provider/key custody, write-ahead admission, inventory completeness, restore replay and retention still required. This core is not wired to live deletion and does not establish completeness of a restored ledger. All release gates remain false.

## Recovery Storage adapter — 29 September 2026

Added the server-only Supabase Storage adapter for the encrypted ledger. It requires a distinct recovery project and private bucket, checks service-role credential configuration, uses non-overwriting uploads and authenticated bounded reads, rejects redirects and sanitizes failures. Six injected HTTP tests cover private access, configuration/path rejection, public-bucket rejection, ambiguous provider errors, response limits and encrypted lost-acknowledgement reconciliation. All 13 ledger/adapter/release-gate tests and focused TypeScript checks pass.

No recovery project/bucket was created, no real record was exported and no deletion worker was deployed or enabled. Provider verification, prepared-request admission, complete inventory/checkpoint proof and fenced restore replay remain unfinished. See the [recovery ledger design](deletion-recovery-ledger.md).

## Ledger-backed deletion admission prepared — 29 September 2026

Implemented the prepare → verified independent ledger → activate coordinator, a private reservation/activation migration and its server RPC adapter. The unconfigured deletion gateway now refuses requests instead of calling the legacy raw deletion RPC. Reservation creation preserves current access/profile data; verified-intent activation uses the prior redaction/cancellation/job behavior and supports stable retries after proof expiry at the service layer.

All 51 backend tests, focused TypeScript checks, 11 disposable SQL assertion files and four existing concurrency scripts pass. Nine admission tests cover failure ordering, mismatches and lost replies; the SQL checks cover service-only permissions, stable reservations, no premature mutation and matching activation. No hosted migration or worker was enabled. Full inventory/checkpoint verification, background reconciliation, restore replay and provider setup remain outstanding; this is local preparation, not live deletion readiness. [Detailed recovery status](deletion-recovery-ledger.md).
