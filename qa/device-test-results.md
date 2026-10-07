# Resbite iPhone acceptance evidence

Updated 24 September 2026. This records observed results, not release approval. Tester access is limited to the explicitly approved owner; broader access remains closed. The full acceptance script is [First iPhone test](../knowledge-base/11-first-test-acceptance.md).

## Environment

- Apple Silicon Mac, macOS 26.6.2, Xcode 27.0, Node 22.22.1.
- Signed Debug development app `com.resbite.preview`, iPhone 14, iOS 27.
- Expo 57 development bundle over local Metro. This is not a standalone release or a two-phone acceptance build.
- Working tree includes uncommitted changes; no immutable release/build identifier has been assigned.

## Confirmed on the physical iPhone

| Scenario | Evidence |
| --- | --- |
| Launch and discovery | Owner confirmed welcome and activity catalogue work. |
| Plan date/time and keyboard | Owner confirmed native date/time sheets and meeting-place keyboard work comfortably. |
| Larger Text, editor | Clipping reported, fixed, then owner confirmed resolved. |
| Larger Text, four tabs | Owner confirmed Discover, My resbites, Wellness and Profile all look good after fixes. |
| Draft recovery | Owner entered plan details, force-closed/reopened, resumed draft and confirmed all details restored. |

The confirmations above cover development preview. They do not prove real-account backend operation, all font sizes, VoiceOver or performance.

## Confirmed with the live owner account — 23 September

| Scenario | Owner evidence |
| --- | --- |
| Optional account details | City saved and restored after reopening; Clear optional details → Save removed them; keyboard and date picker comfortable (“perfect”). |
| Google sign-in | Google sign-in and session restoration after closing/reopening the app both work. |
| Password recovery | Branded email arrived, opened the native new-password screen, saved the password and allowed sign-in. |

No password or Google credential was shared. These results do not certify signup confirmation, Google cancellation, private photo operations or destructive account deletion.

## Next device checks

| Area | Check | Status |
| --- | --- | --- |
| Contacts | Deny access; manual entry stays usable. Allow limited contacts; only allowed rows appear. Expand selection; revoke in Settings; stale rows disappear. | Pending owner/device verification |
| New screens | Larger Text and VoiceOver on People, Invitations, RSVP, sample conversation and Notification settings. | Pending |
| Sample conversation | Preview → Profile → Explore sample conversation; persistent fictional/sample labels, scrollable content, no send action. | Pending |
| Notification settings | Shows delivery unavailable in this build; preview does not request permission. Authenticated native permission status refreshes on returning from Settings. | Pending |
| Motion | Reduce Motion, rapid taps, interrupted requests and foreground return. | Pending |
| Real invitation/RSVP loop | Two eligible accounts and phones; accept/decline/withdraw, lost reply, concurrent changes, cancellation and revocation. | Pending B0/B1 prerequisites and explicit approval of a second tester |
| Native sharing | Explicit sharing, cancel sheet, correct installed-app route, cold start/auth continuation. | Pending real-account setup |
| Push delivery | Device binding, sign-out removal, token rotation, receipt/retry handling and notification tap routing. | Not operational; credentials and backend lifecycle/worker remain |
| Optional profile photo | System picker cancellation, HEIC/rotated image normalization, metadata removal, private upload/retry/removal and background/account changes. New signed native build compiled, signature verified, installed and launched on the iPhone 14; fresh Metro bundle delivered. | Pending |
| Auth/data lifecycle | Signup confirmation, expired/reused links, Google cancellation, account switching, photos and deletion/retention. | Google success/restart and password reset accepted above; remaining checks pending |

## Automated evidence

Automated domain tests, intercepted browser fixtures and iOS Hermes exports are recorded per milestone in [implementation status](../docs/implementation-status.md). Browser fixtures use synthetic accounts, block/intercept backend requests and mock sharing. They do not replace the physical checks above.

## B0 catalogue/cleanup continuation — 23 September

Signed-in discovery/detail now read published server content; Preview keeps the bundled drafts. The additive catalogue fields are deployed, but the live catalogue still has zero published activities pending owner review. Native acceptance of this new live catalogue remains pending; current 320/390 browser fixture checks are not iPhone evidence.

Profile-photo upload/persist/remove feedback and an owner-designated unapproved email for signup acceptance have been requested. Neither result is assumed. Local orphan-photo cleanup and deletion-receipt retention tests pass, but those migrations/workers remain undeployed and disabled. See [B0 evidence](b0-account-foundation.md) and [retention/restore proposal](b0-retention-proposal.md).


## Published catalogue accepted for loading — 24 September

The eight approved activities were published, with exact hosted after-image and owner-only access checks recorded in the [publication journal](catalogue-publication-2026-09-24/journal.json). After refreshing signed-in Discover and opening artwork/details on the iPhone, the owner replied: **“All eight load correctly.”**

This is native acceptance of the live catalogue refresh and activity artwork/details. It does not establish new-plan creation from the live catalogue, offline recovery, a new Larger Text check, VoiceOver or Reduce Motion. The zero-published/pending statements in the 23 September snapshot above are superseded by this result. Other pending device checks remain unchanged.

## Three new activities delivered — 24 September

Owner approved keeping Picnic in the park, Walk and talk, and Board game night from the separate visual review. The app registers their exact reviewed PNGs and artwork keys. TypeScript, 113 tests, content validation, extended catalogue browser fixtures and an iOS Hermes export pass.

The paired iPhone 14 successfully relaunched `com.resbite.preview`; Metro then served fresh iOS entry and Supabase bundles before the new three-row publication. Hosted read-back verifies eleven activities with the original eight unchanged and one enabled owner. Bundle delivery/process launch is not visual acceptance: the owner has been asked to refresh signed-in Discover and open all three new artwork/detail screens. That result is pending.

## Photo consistency update prepared — 24 September

The new profile bundle and hosted avatar revision RPC address account-switch and cross-device photo races. Photo removal now clears the profile reference and accurately explains retained private bytes; client file deletion is disabled. Automated checks and iOS Hermes export pass; [full evidence](avatar-consistency-2026-09-24/README.md).

The iPhone reports unavailable after this change. Reconnection was requested; no fresh installation, launch, bundle delivery or photo acceptance is inferred. Once connected, verify choose/save/reopen/remove, cancelled picker and interrupted retry. Earlier profile/account-details acceptance does not establish these new photo behaviors.

## Photo consistency update delivered — 28 September

The owner reconnected the iPhone 14. CoreDevice reports available/paired; Resbite relaunched successfully and Metro served fresh iOS entry and Supabase bundles. No reinstall or cache/data reset was performed. [Delivery record](avatar-consistency-2026-09-24/device-delivery-2026-09-28.json).

The owner confirmed “It works perfectly” after the signed-in choose/save/reopen/remove check. Photo upload, persistence after reopening and removal from the profile are accepted on the physical iPhone. This does not claim deletion of retained Storage bytes. Picker cancellation, interrupted retry and cross-account authorization remain separate pending checks.

## Pending-access native acceptance — 29 September 2026

After delivery of the confirmation navigation fix, the owner confirmed “I see that screen without error” in response to checking the “You’re on your way” pending-approval screen for the designated unapproved signup identity. This accepts recovery from the reported native navigation crash and display of the pending-access screen. The tester roster was not changed.

This reply does not distinguish session restoration from a new sign-in or a fresh confirmation callback. A fresh same-device callback, expired/reused-link behavior, Google cancellation and direct protected-route/Storage checks remain separate evidence; B0 is not closed by this result.

## Google cancellation native acceptance — 29 September 2026

The owner replied “All perfect” after the requested physical-iPhone sequence: sign out of the unapproved test account, start Continue with Google, cancel before choosing an account, return to usable sign-in, and sign back in with the approved owner account. Google cancellation and subsequent owner sign-in are accepted. The preceding pending-approval screen acceptance remains recorded separately. No tester roster, code or backend setting changed in this acceptance update.

Remaining B0 evidence includes fresh confirmation callback and expired/reused links, photo interruption/cross-account checks, remaining accessibility/offline checks and the separately approved deletion/retention lifecycle. This result does not close B0.

### Native picker cancellation accepted — 29 September 2026

Owner confirmed “Photo unchanged, no error” after opening Add optional photo/Change photo and cancelling the iPhone picker. Picker cancellation is accepted; interrupted offline retry remains pending.

## Native offline photo availability — 29 September 2026

The owner reported that Change photo could not be selected without connectivity, and became usable again after reconnecting: “This is working.” Accepted evidence is offline action unavailability and recovery after reconnecting. No upload was started while offline, so this does not establish native interrupted-upload journal restoration or Retry photo change acceptance. Those recovery paths remain covered by intercepted browser/domain tests, with physical-device interruption acceptance pending. The earlier manual instructions did not reach an in-flight upload and should not be reused as evidence of one.

## Native reused confirmation link accepted — 29 September 2026

After being asked to sign out and reopen the original confirmation email for the designated unapproved test account, the owner reported the “Let’s try again” screen, guidance that the link may have expired or already been used, and both Request confirmation email and Back to sign in actions. Reopening the used confirmation link now reaches the expected recovery UI without a reported crash. This accepts reused-link handling and visible recovery actions; it does not independently verify a never-used link expiring or completion of a fresh callback. No code, backend or tester-access changes were made.

## Native catalogue additions and account accessibility accepted — 29 September 2026

The owner replied “All perfect continue” to the two requested checks: all three additions (Picnic in the park, Walk and talk, Board game night) show artwork/details and open the plan editor; Account details fields and Save remain readable/reachable with Larger Text and the keyboard open. Those specific iPhone checks are accepted. This does not establish saved live plans, VoiceOver or Reduce Motion.
