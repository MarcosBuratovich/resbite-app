# First iPhone test — acceptance script

Use two registered physical iPhones and distinct tester accounts. At least one uses Google; another uses email/password and real email confirmation. Use fictional contact fixtures except where a tester explicitly consents to selecting a real contact. Proposed detailed rules follow the [development specification](../docs/superpowers/specs/2026-09-17-resbite-first-test.md).

## Main demonstration

1. Install the signed app on both phones. Confirm English UI and selected activity artwork.
2. Organizer signs in with Google; invitee creates an email/password account. Before email confirmation, protected plan access fails on the server, not just in the UI. Confirm email and retry successfully.
3. Organizer searches and filters by category, opens one of 8–12 reviewed activities, and arranges a future time/place.
4. Select contacts intentionally, save a reusable group, use that group for attendee selection. No unselected contact is uploaded or invited.
5. Review and save the plan, manually share the working invitation link. Organizer sees that sharing is separate from delivery.
6. Open the link on the second phone. Sign-in/confirmation round trips preserve the destination. Accept; both devices display the same attendee state after refresh, without rebuilding the app.
7. Change to decline, then accept again before start. Repeated taps/retries do not create duplicate attendees or duplicate notifications.
8. Owner changes time/place. Invitee sees the new version and an essential update if push permission is granted. Owner cancellation makes both views cancelled and prevents subsequent RSVP.
9. After an accepted RSVP on another active plan, open chat: it is explicitly a sample, with no working send action. Wellness also remains explicitly sample data.

## Recovery and permission checks

| Scenario | Pass condition |
|---|---|
| Google consent cancelled | Return to sign-in without creating a partial profile |
| Email confirmation expired/not yet used | Safe instruction/resend route; no protected access until refreshed verification succeeds |
| Password reset | Real reset path; neutral response does not disclose whether an email has an account |
| Existing email/provider collision | No second identity silently created or merged; authenticate existing account first |
| Invitation opened while signed out | Resume correct invitation after authentication |
| App not installed | Minimal fallback exposes no event/person details; after install, reopening link works |
| Revoked, expired, cancelled or already claimed invitation | Clear unavailable state; no unauthorized event data |
| Forwarded claimed link | A different account cannot read or modify the invitation |
| Forwarded unclaimed first-claim link | Documented bearer-link behaviour and test-roster restriction match reviewed specification; no unsupported recipient-identity promise |
| Location denied/restricted | Manual place entry/search works; no repeated permission loop |
| Contacts limited/denied/revoked | Only granted contacts shown; manual share still works; stale local access handled |
| Notifications denied | All plan/RSVP state remains correct on app open/refresh |
| Optional photo skipped/removed | Registration and invitations still work |
| Offline create/RSVP | Failure/retry shown; no claim of saved/accepted until server confirms |
| Concurrent edit versus RSVP/cancel | Consistent server version; cancellation wins; no lost edit silently accepted |
| Sign-out and another tester sign-in | Previous user's pending invite, local groups, cached private data and push binding do not leak |
| Account deletion | Reauthentication as needed; account blocked immediately; owned future plans cancelled; cleanup retried; no orphan access |

## Security and content checks

- A third authenticated tester outside a plan cannot read it by guessing IDs, list invitations, edit another person's RSVP or obtain private avatar links.
- A signed-in unverified email user and a user outside the test roster fail server authorization.
- RLS blocks unauthorized reads and direct writes to trusted plan/invitation/outbox rows; transactional RPCs also reject unauthorized calls.
- Passwords, raw tokens and contact lists never appear in logs or sample fixtures.
- Push text has no private place/email/contact details; retries use one logical notification identity.
- Every published activity has its matching artwork, reviewed copy and source provenance; no copied painting description on camping.
- Larger text, keyboard avoidance, VoiceOver names and tappable controls work on the smallest supported test phone.

## Evidence to retain

Record build identifier, dependency lockfiles, Xcode/device OS, distribution method, test accounts by non-sensitive labels, automated-test results and pass/fail for each scenario. Capture a short consented walkthrough of the main loop without private emails/contact details. Keep failures with reproduction steps. “Ready for the boss” means the real main loop and recovery checks pass; a screenshot walkthrough alone is not sufficient.

## Motion and full-state acceptance (D19)

Apply [the motion specification](12-motion-and-interface-states.md). Verify cold launch and returning foreground, incoming invite through launch/sign-in, responsive presses, navigation/sheets, and actual loading → success/error → retry. A ready app must not wait for a logo animation; a slow request must not loop forever without recovery. Repeated taps cannot duplicate writes. Sample chat/wellness remain labelled during motion. Verify normal and Reduce Motion, VoiceOver status/focus, large text, interrupted requests and slow network on physical devices. Record videos and performance observations; static screenshots are insufficient evidence.

## Build environment

Use installed Expo development builds for native integration tests and a standalone signed preview/release build for boss acceptance. Expo Go is not evidence of working remote push or final splash behaviour. Test Supabase email confirmation/reset with configured SMTP and real callback routing. Android APK packaging and Android-specific permissions, App Links and motion tests follow in a later milestone.
