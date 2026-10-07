# Resbite implementation status

**Current summary — 7 October 2026:** see the [development handoff](development-handoff-2026-10-07.md) for completed/live work, local-only preparations, fresh checks and remaining milestones. B0 remains in progress. The dated journal below begins on 17 September and preserves historical evidence.

This document records the mobile foundation and successive implementation milestones. It is **not yet an accepted standalone two-person test release**. The current development target is the [expanded private beta](milestones/2026-09-23-expanded-private-beta.md), selected on 23 September; older scope/access statements below are historical and superseded by dated updates.

## Created and verified

- `mobile/`: React Native/Expo 57 + TypeScript, with pinned dependencies and lockfile; future Android shares this code. The app lives under `mobile/` in the private `MarcosBuratovich/resbite-app` repository (one Git repository).
- Original Resbite illustrations exported to eight high-resolution activity images, with original-file hashes/source IDs and font licence files. Descriptions, tips and combined category assignments are explicitly editorial drafts, not approved source quotations.
- Welcome, login/registration/reset, profile, catalogue/search/category, activity detail, planning, plans, invitation/RSVP and labelled sample wellness screens.
- Reanimated press feedback, fades, native screen transitions, haptics, splash configuration, loading/error/empty/success states. Reduced motion removes button scaling and changes navigation to fades. Owner has verified Larger Text on the main tabs and plan editor; physical-device motion and VoiceOver remain unverified.
- Development-only design preview stores temporary plans in memory and disables real invitations. Browser layout checks are development QA only; the deliverable remains a mobile app.
- Supabase project **Resbite**, organization **Good add Ventures**, London `eu-west-2`, ref `ewcsgvhuojxdpaspwsrx`. Creation-time tool estimate: 10/month; actual billing remains in the Supabase account.
- Applied `resbite_private_tester_foundation`: verified tester roster, restricted profiles/plans/attendees, hashed first-claim invitations, transactional RSVP and cancellation, version checks, notification outbox, private photo bucket.
- Database security/lifecycle assertions passed with synthetic users inside a rollback transaction. No synthetic or real testers were retained. Owner chose **leave tester access for later**; roster remains empty.
- TypeScript and eighty-one domain/storage/permission/photo/lifecycle tests pass; eight draft content/artwork pairs pass the manifest check.
- iOS JavaScript/Hermes export passes. On the Mac, a signed Debug build now compiles, installs and launches on an iPhone 14 running iOS 27; Metro delivered the development bundle. Owner confirmed the welcome screen and design-preview activity catalogue both work. The full device test matrix remains pending.
- UI review at 390 × 844 verified welcome/discovery/detail, search, required-place error, preview save and cancellation. Fixed an empty-string rendering warning found during review. No real messages were sent.

## Implementation still required

1. Real-account device verification of draft recovery, interrupted saves and foreground plan/attendee refresh. Client restart recovery is implemented; tester access remains closed.
2. Device contact permission-path and real-account invitation verification. Local groups, independent plan selections and individual invitation preparation/recovery/revocation are implemented. Notification availability and permission-status UI are implemented; permission requests, dispatch and endpoint cleanup remain. Optional photo normalization/private upload is implemented and awaits native/API device verification.
3. Device verification of the labelled, read-only sample conversation after accepted RSVP; account deletion controls, queued cleanup and local tests are implemented but disabled pending deployment, real Auth/Storage acceptance and approved retention.
4. Owned HTTPS invitation and confirmation links, install fallback and cold-start routing tests. Strict scheme/owned-origin parsing, native incoming-link routing and a private HTTPS fallback generator are prepared. Current `resbite://invite` remains the default until an owned domain is configured; it requires an installed app. Pending invitations are retained securely through profile setup.
5. Finish visual/content review, canonical category taxonomy and catalogue publication. Eight drafted pairs are ready for review; the live database catalogue remains unpublished/empty.
6. Device accessibility, keyboard, date/time/timezone, denied-permission, reduced-motion and offline-path checks. Performance tuning after device measurement.

## Interface refinement — 17 September 2026

- Owner requested lighter button text and a more polished bottom navigation. Shared buttons now use regular Montserrat, retain their label while loading, and provide colour feedback plus a restrained spring release. Reduced Motion removes the scale response.
- Replaced per-screen navigation rows with Expo Router native tabs for Discover, My resbites, Wellness and Profile. iOS uses system glass and SF Symbols with Resbite aqua selection; tab labels remain regular weight. Native platform components handle tab selection and accessibility, with optional selection haptics. The browser-only review uses a floating JavaScript tab bar.
- Tab screens stay mounted, preserving search and profile drafts. Saving a plan dismisses back to the existing tabs, avoiding duplicate navigation stacks. Activity details and planning remain stack screens with back navigation.
- TypeScript, seven existing tests and content validation pass. Browser interaction checks verified tab state, detail/back, preview plan creation/cancellation, blocked invitations and leaving preview with no page errors. Updated JavaScript was delivered to the running iPhone; owner visual review of this refinement, VoiceOver, larger text and Reduce Motion device checks remain pending.
- No product capabilities, live catalogue, tester roster or backend access rules changed.

## Planning flow — 17 September 2026

- Activity details have a persistent planning action, clearer category/duration treatment and numbered tips using existing artwork and copy.
- One editor creates and edits plans: grouped schedule/place/note sections, native iOS date/time sheets with explicit Done/cancel, optional location, keyboard avoidance and a persistent save action. All displayed times are local to the device, with its time zone shown and saved. Invalid dates are rejected rather than silently normalized.
- My resbites offers Edit only for the organizer's future, active plans. Edits use the existing `change_plan` RPC and expected version; preview edits update the same in-memory plan ID. Existing RSVPs are not rewritten. Cancelled plans cannot be edited.
- Validation/save errors preserve the draft and scroll into view. Leaving unsaved changes asks first. An unconfirmed save holds the attempted payload for an identical in-session retry; a version conflict shows current saved details without silently replacing the draft. A lost edit reply is acknowledged only after matching saved details and the expected next version. At this milestone drafts were in-session only; persistent recovery is implemented in the follow-up below.
- Verified: twelve tests, TypeScript, content manifest and iOS Hermes export. Browser checks at 320/390 widths covered create/edit/cancel, invalid date/place, draft retention, leave confirmation and blocked preview invitations. Intercepted API fixtures covered an unconfirmed edit save and a competing edit/version conflict. No fixture requests reached Supabase. Read-only live query confirmed anonymous plan reads still fail with `42501`.
- Repeatable browser QA: start Expo in `mobile`, then run `node scripts/verify-planning.mjs` (Google Chrome; override `RESBITE_QA_BROWSER` / `RESBITE_QA_URL` if needed). This is developer QA, not the mobile deliverable.
- Native simulator Debug build passed on Xcode 27 with `-jobs 2`; installed on the iOS 27 iPhone 17 simulator and launched, with its process still running after 15 seconds. This is a compilation/process-start check, not visual acceptance: simulator UI automation was unavailable pending macOS permissions.
- Owner subsequently reconnected the iPhone and confirmed the native date/time sheets and meeting-place keyboard work comfortably in the preview planning/editing flow. Owner reported clipping with Larger Text. The editor now places the preview notice and Save action within the form scroll at font scales of 1.4 and above; the date sheet uses native wheels at that size and gives the picker full sheet width. TypeScript and browser flow checks pass; the owner confirmed clipping in the plan editor is resolved. VoiceOver review remains pending. Tester access and backend configuration remain unchanged.

## Larger Text follow-up — 17 September 2026

- Owner confirmed the plan editor fix, then identified clipping across Discover activity cards, My resbites, Wellness and Profile.
- At font scales of 1.4 and above, Discover uses full-width activity cards and stacks featured text/artwork; plan card headers and Wellness label/value rows stack. Avatars grow with their contents, preview notices scroll with each screen, and Profile adjusts its scroll inset for the keyboard.
- Shared text uses natural font line metrics at larger sizes, and shared information cards no longer clip their children. Text scaling remains enabled. Normal-size layouts retain their existing structure.
- TypeScript passes. Owner confirmed all four screens now look good with the same Larger Text setting on the physical iPhone. The plan editor was also confirmed fixed. VoiceOver and the broader accessibility matrix remain unverified.

## Foreground refresh — 17 September 2026

- My resbites refreshes plans and attendee responses when the focused screen returns to the foreground, as well as on tab focus and pull-to-refresh. The listener is removed when the screen loses focus.
- New reads cancel superseded reads; only the current request and account can publish results. Queries have a 15-second deadline. Account changes clear cached screen state, and rendered plans are scoped to the account that loaded them.
- Failed refreshes retain previously loaded details, explain they may be stale and offer a retry. An error no longer displays the first-plan empty state.
- Intercepted browser API checks passed for foreground plan/RSVP updates, failed refresh retention/retry, a late stale response and cleanup when the tab is hidden. These are synthetic fixtures; no live plans, invitations or tester accounts were created. Native real-account foreground behavior remains unverified while tester access is closed.

## Persistent draft recovery — 17 September 2026

- Editors retain date, place, note, time zone, original edit version and stable creation ID on this device. My resbites lists Continue draft cards; drafts are separated by account and by create-activity/edit-plan route. Preview uses a separate bucket. Native storage uses the existing chunked Keychain/Keystore adapter; browser developer QA uses sessionStorage (reload recovery, not browser-session persistence).
- Autosave runs after 350 ms without changes and on background; the UI only reports saved after storage succeeds. Leaving keeps the draft; explicit discard confirms deletion. The very latest keystrokes cannot be guaranteed if the process is killed before storage finishes. Drafts are device-local and not synced to other devices.
- Before any plan mutation, the exact request is durably stored. An unconfirmed request locks its fields and survives restart. Retry reads the saved plan first: matching committed data/version is acknowledged without another mutation; an absent create or unchanged edit retries the same ID/payload; changed or cancelled plans require review. Failed local journaling prevents the network write. Successful saves remove their draft.
- Preview completed plans still remain in memory; an unfinished preview edit stores its baseline with the draft so it can be resumed after restart. Account drafts remain isolated when signed out and are available when that same account returns.
- Verified: TypeScript, eighteen domain/storage tests, content manifest, iOS Hermes export and browser scenarios for reload/restoration, lost replies, identical retries, conflicts, draft cleanup, foreground refresh, Profile and Wellness. No live account or plan was created. Owner confirmed date, meeting place and note all restored on the physical iPhone after force-close/reopen via Preview → My resbites → Continue draft. Real-account recovery remains pending closed tester access.

## People and local groups — 17 September 2026

- Profile → People & groups supports create, rename, membership editing and confirmed deletion. My resbites → Choose people copies groups into an independent per-plan selection; later group changes do not change that selection or any server invitation.
- Uses the installed Expo 57 Contacts API. Permission is requested only on Choose phone contacts, supports limited access and Allow more contacts, and loads 50 contacts per page. Only names and usable email/phone options are loaded; address-book data is never uploaded. Contacts without usable details are counted and skipped. Manual entry and existing manual link sharing remain available without contact permission.
- Explicit checkboxes select contact details. Exact normalized email/phone duplicates are merged across groups; phone country codes are not guessed. A person with multiple different contact details may appear more than once, so the screen asks the organizer to choose one detail per person.
- Groups and per-plan selections use chunked native secure storage, scoped by account; preview has its own bucket. Explicit sign-out/exit-preview clears this data before leaving. Returning from Settings invalidates the loaded address-book cache, including limited-access changes; saved user selections remain visible and removable.
- This is a local people checklist, not automated delivery: Save people never sends an invitation or changes RSVP. Preview invitations stay disabled. Selected-person invitation preparation is implemented in the follow-up below; real-account verification remains pending.
- Verified: TypeScript, twenty-two domain/storage tests, iOS Hermes export, browser create/edit/delete, duplicate selection, independent plan selections, unsupported-contact fallback and exit cleanup. Browser checks intercepted all backend requests; no messages were sent. Native limited/denied/revoked permission and Larger Text checks for this new screen remain pending.
- Repeatable developer QA: `node scripts/verify-people.mjs` with Expo running locally and Chrome installed.

## Individual invitations and contact reliability — 17 September 2026

- Implemented as two bounded subagent workstreams from tasks 4 and 5 of the first-test plan, then integrated and reviewed together. The MVP and closed tester gate are unchanged.
- Saved plan selections now lead to Review invitations. Organizers prepare a separate link per selected person or a separate manual link, then explicitly open the share sheet. Contact details remain local; the existing first-eligible-account claim rule is explained. Preparation never sends a message, and closing/completing Share never claims delivery or RSVP.
- Invitation IDs and secrets are durably journaled before the existing create RPC. Interrupted preparation survives restart and retries the same ID/token. Revocation persists its pending state before the RPC, disables sharing until confirmed, and cannot be undone by a late preparation result. Pending preparations must first be confirmed by retry before revocation. Focus/account guards stop delayed work from opening Share after leaving the screen.
- Removing a person from a selection does not hide their prepared link or revoke it. Sign-out clears local group/selection/link records but does not revoke previously shared links; the screen explains this limitation. Link management is device-local, and native real-account sign-out/concurrent-operation testing remains pending.
- Contact enumeration rechecks permission and discards results if access is revoked or narrowed while loading. Returning from Settings clears all loaded contact rows, paging and search state; account/plan changes also invalidate screen state. Five injected-adapter tests cover denial, limited access, pagination, mid-read permission changes and expansion without reading a real address book.
- Verification: TypeScript, thirty-one tests, content manifest, all three intercepted browser QA scripts and iOS Hermes export pass. Invitation fixtures cover lost create/revoke replies, reload recovery, identical retries, replacement links, selection refresh and navigation away during pending sharing. Sharing is mocked; no real invitations, contact uploads or backend writes occurred.
- Native contact permission paths, the new invitation screen's Larger Text/VoiceOver behavior, native Share and the two-person real-account RSVP loop remain unverified. Owned HTTPS links and install fallback remain outstanding; the existing installed-app scheme is provisional.
- Repeatable invitation QA: `node scripts/verify-invitations.mjs` with Expo running locally and Chrome installed.

## RSVP recovery, sample conversation and notification settings — 17 September 2026

- Two subagents implemented bounded parts of tasks 4, 6 and 7. This completes the client RSVP recovery/sample milestone and notification-status surface, not live push delivery or the two-phone acceptance milestone.
- RSVP now reads current plan/attendee state before a write and again after its result. Lost replies are acknowledged only when the saved response/version matches; unchanged state offers an identical retry, while competing response/plan changes require review. Cancelled or started plans close responses. Focus/account guards stop delayed reads from issuing stale writes after navigation, and foreground/focus refresh replaces outdated details.
- An accepted RSVP for a future active plan exposes Sample conversation. The route verifies access on entry/foreground, hides content while backgrounded, and shows permanent fictional/read-only labels with bundled invented names and messages. No composer, live messaging or sample database writes exist. Development preview also exposes the sample through Profile for design review without fabricating an RSVP.
- Profile → Notification settings distinguishes current native permission from delivery availability, including iOS provisional/temporary access. Status refreshes on focus/foreground, and device Settings opens only after a user action. Preview/web never inspect native permission or prompt. Delivery is explicitly disabled; no permission request, token acquisition, endpoint registration or notification sending was added.
- Verified: TypeScript, thirty-eight tests, content validation, all five intercepted browser QA scripts and iOS Hermes export. Three RSVP domain tests and four notification adapter tests were added. A narrow-layout browser warning from icon accessibility props was fixed; notification QA now checks console errors as well as page errors. Real-account/native RSVP, native permission/Settings transitions, new-screen Larger Text and VoiceOver still need device verification. In-session uncertain RSVP choices are retained; reopening reads server state again rather than replaying an unconfirmed choice automatically.
- Push activation prerequisites are recorded in [notification readiness](../qa/notification-readiness.md). Physical evidence and remaining checks are recorded in [device test results](../qa/device-test-results.md). Tester access remains closed; no live backend mutation or message was used for this milestone.
- Repeatable developer QA: `node scripts/verify-rsvp.mjs` and `node scripts/verify-notifications.mjs`, with Expo running and Chrome installed. These supplement the existing planning, people and invitation scripts.

## Optional profile photos and account cleanup — 17 September 2026

- Task 7 progressed through two subagents: optional profile photos/profile loading and account/session cleanup. The profile reads the saved name, preserves typed changes on refresh failure and keeps photo setup optional. Your data & privacy describes current local/shared data, draft retention, link revocation and the unavailable deletion workflow without promising completed cleanup or backup erasure.
- System image selection is re-encoded as JPEG, resized to at most 1024 pixels on the longest side, stripped of JPEG application/comment metadata and checked against the 2 MB storage cap. Uploads use the existing private bucket and checked `set_avatar` RPC; previews use short-lived signed URLs. Development preview keeps its selected photo in memory and makes no upload.
- Photo operations journal their intended reference and normalized bytes before upload. Restart/retry checks the saved avatar first, reuses the same object path and never deletes a candidate whose link result is uncertain. Removal clears the profile reference before deleting the old file; failed cleanup stays retryable. Abandoning a pending operation can leave an unused private object; an automatic cleanup worker remains outstanding. Concurrent changes are checked before applying an operation, but the existing avatar RPC has no atomic version comparison.
- Pending invitation storage is serialized at provider scope. New links supersede stale restore results; malformed links are rejected; an older claim cannot clear a newer invitation. Sign-out is single-flight and immediately invalidates captured async work and local people writes, then clears local people/link/photo-operation data and pending invitations before auth sign-out. Per-account plan drafts remain retained as previously agreed.
- Leaving preview clears preview data without signing out an existing real session. Failed sign-out releases the interaction block for recovery. A global notice survives navigation if the auth SDK removes the local session while reporting a server sign-out failure; the UI does not claim every server session was revoked.
- Pinned `expo-image-manipulator` 57.0.18 and direct `expo-file-system` 57.0.7. CocoaPods updated; signed Debug device build and deep signature verification pass. This is a new native-module build and must be installed before testing image selection. The iPhone was unavailable during implementation, then reconnected: the latest signed build was installed and launched on the owner’s iPhone 14. Metro was restarted with `--clear` and delivered the rebuilt iOS bundle; the app process remained running. Restart cleared the in-memory contact cache without deleting saved groups/drafts. iOS contact permission must be corrected separately in Settings. Native picker, metadata output, private Storage API authorization and Large Text/VoiceOver remain unverified.
- Verified: TypeScript, fifty-three tests, content validation, Expo dependency alignment, all seven intercepted browser QA scripts and the iOS Hermes export. Photo browser QA exercised real picker/normalization with a generated 1600 × 1200 image and checked output type, dimensions, metadata removal and size; no personal image was read. Session QA covered the auth SDK’s local-sign-out/server-error case.
- Repeatable QA: `node scripts/verify-profile.mjs` and `node scripts/verify-session.mjs`, alongside the existing five browser scripts.
- No live account, photo upload, message, backend deployment or roster change was used. Account deletion, orphan-file cleanup and approved retention/backup configuration remain prerequisites for opening tester access.

## Physical-device contact import fixes — 17 September 2026

- Owner reported `new NativeEventEmitter()` when tapping Choose phone contacts. The lazy namespace import of `react-native` evaluated unrelated legacy getters, including PushNotificationIOS with an unavailable native emitter. Contacts and notification settings now access only the required React Native exports, retaining lazy native boundaries for tests.
- The next device attempt reached Expo Contacts but failed converting `ContactQueryOptions`. Installed Expo Contacts 57.0.5 declares `UserDefault = userDefault` in JavaScript, while its iOS enum accepts `useDefault`. Omitting the optional sort value uses the native user-default order and avoids the mismatch; paging stays at 50 raw records.
- A subsequent hot update reported an unknown module (`3777`). The contacts and notification wrappers now use lazy synchronous native-module requires so those modules belong to the main bundle. Metro was stopped and restarted with its cache cleared, and the installed app was cold-launched; a fresh complete iOS bundle was delivered. Owner subsequently confirmed the retry was done and moved on to UI feedback. Broader permission-path acceptance remains pending.
- Two regression tests exercise the public native service wrappers with lazy React Native getters and validate contact query sorting against the installed Swift enum. The fixture reproduces the original namespace-import error. TypeScript, the full 55-test suite, contacts/notification browser checks and the iOS Hermes export pass. Changes are JavaScript-only and were sent through Metro to the installed app. No address-book contents were logged or uploaded; owner subsequently moved on to UI review after retrying. Denied/limited/revoked permission checks remain pending.

## Compact card UI and gluestack — 17 September 2026

- Owner requested fewer pill buttons, a more compact card layout, meaningful icons and more colour, then explicitly chose gluestack UI (Paper optional). The audit and component decisions are recorded in [UI audit](../qa/ui-audit.md).
- Added pinned gluestack core 5.0.15/utils 5.0.6. Shared button actions and contact checkboxes use gluestack primitives, themed with Resbite styles. No new native module or styling engine was added.
- Profile settings, plan actions, contact access and RSVP now use compact icon rows; save/invite actions retain primary emphasis. Destructive actions remain labelled and preserve existing confirmations. Discover categories use icon tiles; Wellness uses coloured category cards and keeps its sample disclosure.
- Warm surfaces, smaller corner radii and tighter spacing establish clearer card boundaries. Font scaling and expanding layouts are preserved; physical Larger Text/VoiceOver review of this pass remains pending.
- TypeScript, 55 tests, all seven intercepted browser flows, 320/390 visual/keyboard checks and iOS Hermes export pass. The connected iPhone app was relaunched for a fresh bundle. No tester roster, backend behavior or MVP capability changed.

## External setup before real testing

### Mac setup verification — 17 September 2026

- Apple Silicon Mac, macOS 26.6.2, Xcode 27.0 selected. Existing Apple Development signing identity successfully provisioned and signed `com.resbite.preview` for the connected iPhone 14.
- Shell defaults to Node 20.20.2. Installed Homebrew Node 22.22.1 works: use `export PATH="/opt/homebrew/opt/node@22/bin:$PATH"` before mobile commands. The ignored local `mobile/ios/.xcode.env.local` points native builds to that Node 22 binary.
- On this Mac, `npm run check`, online `expo install --check`, and an iOS JavaScript/Hermes export pass with Node 22. Xcode license/setup and CocoaPods installation are complete; signed native compilation, installation and launch now pass.
- Fixed two device-only launch failures: the pinned Expo Contacts prebuilt framework linked an unavailable `Testing.framework` (use iOS autolinking `buildFromSource: ["expo-contacts"]`), and iOS 27 requires scene lifecycle adoption (pinned `expo-build-properties` 57.0.20 with `ios.enableSceneSupport: true`). Both fixes are in versioned configuration.
- Built the generated `ios/Resbite.xcworkspace`, scheme `Resbite`, Debug configuration with the existing Apple team. Installed and launched using `xcrun devicectl`; the process stayed running and evaluated the development bundle served by `npx expo start --lan --port 8081`. Keep Mac and phone on the same network. Full auth, invitations, accessibility and offline device checks remain outstanding.
- Owner confirmed on the physical iPhone that the welcome screen and “Preview the design” catalogue both work.
- First device review should use the existing development-only design preview. Tester access remains closed; no backend configuration or roster changes were made during this verification.

### Remaining prerequisites

- Link the Expo project/owner, confirm the provisional app identifier, configure Apple signing on the available Mac, and install on two iPhones.
- Configure Google OAuth, confirmation/reset redirects and email delivery. Client screens exist; successful provider/SMTP flows have not been tested.
- Provide APNs/push credentials and an owned link domain.
- Add the approved tester emails later, as requested. Do not weaken the roster gate to make a demo work.

## Review findings and limitations

Supabase security advisors returned only INFO for four internal RLS tables with no policies: intentional default-deny tables accessed through checked functions. See [RLS advisory explanation](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy). Performance INFO covers unused indexes on the new database and the default Auth connection allocation; revisit before scaling ([connection guidance](https://supabase.com/docs/guides/deployment/going-into-prod)). No advisor WARN/ERROR was returned.

Dependency audit reports 15 moderate affected dependency nodes, from two underlying advisories: [uuid buffer bounds](https://github.com/advisories/GHSA-w5hq-g745-h8pq) and [decode-uri-component malformed input](https://github.com/advisories/GHSA-vcc3-ghjq-m6fr). No high/critical findings. The automatic suggested “fix” downgrades Expo/router across major versions, so it was not applied blindly. Resolve compatible upstream fixes before external distribution, especially the routing decoder.

A code review found and corrected ignored sign-out errors, competing OAuth exchanges, lost pending invitations, missing organiser RSVP display and stale per-account screen caches. Those fixes pass TypeScript; on-device auth lifecycle verification remains required.

## Where to continue

Run instructions: [mobile README](../mobile/README.md). Backend contracts: [Supabase README](../supabase/README.md). Original detailed plan: [first-test plan](superpowers/plans/2026-09-17-resbite-first-test.md). Existing source archive remains intact.

## Depth and brand-colour refinement — 17 September 2026

Owner confirmed the compact gluestack UI is much better, then requested more depth and better button pills. Primary actions now use the existing Resbite pink, pale edges and soft rose shadows; secondary actions use white/lilac. Shared card and icon shadows add depth while preserving the compact layout and regular-weight labels. Primary text contrast is 6.91:1 (6.20:1 pressed). TypeScript, 320/390 visual/keyboard checks and planning flows pass; owner review of the new native appearance remains pending. Scope and tester access are unchanged.

## Pre-sign-in lifecycle, notification and link milestone — 17 September 2026

- Owner authorized multiple agents to advance independent work before real sign-in acceptance. Three agents covered deletion UI/recovery, notification preparation and invitation links; root implemented deletion SQL/workers, local database verification and integration. The MVP and empty tester roster remain unchanged.
- Account deletion now has an explicit confirmation screen, same-account password/email-code proof, durable recovery receipt and lost-reply reconciliation. It is disabled by default. The proposed Edge endpoint verifies both Auth tokens and fresh authentication method/time; SQL requires a real freshly created proof session. A refresh token's issue time is not accepted as reauthentication.
- The new local deletion migration atomically blocks access, removes the roster entry, redacts the profile/organizer place/note, cancels future owned plans once, revokes invitations and removes the deleting user's attendee/endpoints/outbox records. Other participants retain cancelled records with a neutral organizer. A leased worker removes all private photo objects through Storage API before hard-deleting Auth; failure remains retryable. Minimal private job receipts remain pending approved retention.
- Local deletion cleanup invalidates operations and removes drafts, people/group/invitation/photo-operation data before local sign-out. Failed cleanup remains suspended and retryable; a later failed ordinary sign-out cannot resume writes. Storage metadata insert/update transactions now share the deletion lock and recheck eligibility, closing an in-flight upload race identified in independent review.
- Notification preparation includes a service-only per-endpoint ledger, eligibility/binding checks, lease fencing, ticket/receipt polling, bounded retries and scoped unregister. Unknown send results are retained without blind resending. The actual worker remains hard-disabled. Injected mobile lifecycle/tap helpers cover rotation, revocation, sign-out sequencing and authorized plan refetch; native wiring and credentials remain prerequisites.
- Invitation URLs use a strict trusted-origin parser and the native incoming-link hook. Optional owned HTTPS links keep the secret in the fragment; local AASA/fallback generation is ready, but no domain/hosting or associated-domain entitlement was activated.
- Verified: 81 mobile tests, TypeScript, 18 backend unit tests, disposable PostgreSQL access/deletion/notification/security assertions, default-disabled browser checks and isolated enabled fixtures covering password/OTP proof, lost replies, local cleanup failure and restart recovery. No real auth message, provider push, deletion, hosted migration or deployment occurred. See [pre-sign-in readiness](../qa/pre-signin-readiness.md), [link readiness](../qa/link-readiness.md) and the worker READMEs.
- Next: actual Auth/provider/SMTP/domain setup, reviewed backend activation and retention, approved catalogue publication, native endpoint/tap wiring and two-phone acceptance. This is substantial pre-sign-in preparation, not proof that real sign-in or the complete MVP already works.

- Final integration checks: iOS Hermes export passes; session/invitation/default-disabled deletion browser regressions pass. Disposable SQL concurrency tests prove upload-first makes deletion wait, and deletion-first makes a delayed upload wait then fail after the access block commits. Hosted Auth/Storage semantics and hosted advisors remain unverified. Relaunch on the owner's iPhone was attempted, but CoreDevice reported the device unavailable; this milestone has not been freshly accepted on that phone.

## Sign-in preparation — 18 September 2026

- Owner selected resbite.com and is setting up Google/email providers. Read-only public Auth settings confirm email enabled with confirmation required, Google disabled and anonymous sign-in disabled. SMTP and redirect allow-list are not visible in that check; they remain unverified. [Exact setup instructions](../qa/auth-readiness.md) distinguish Google's Supabase callback from the app callback and the future owned HTTPS domain.
- Welcome's primary action now opens registration. Sign-in validates email/password, prevents duplicate requests, locks fields/mode changes while waiting and ignores stale navigation/error results after leaving. Password reset has a direct return to sign-in.
- Confirmation/recovery rejects ambiguous parameters, handles newly received callbacks and ignores outdated completions. Password saves are single-flight and check the current account against the account returned by the PKCE exchange. Recovery uses a scrollable keyboard-aware layout. The SDK still completes an already-issued authentication request; UI cancellation does not promise cancellation of server authentication.
- Verified: TypeScript, 83 tests, content validation, intercepted browser auth/session checks and iOS Hermes export. Auth fixtures cover registration entry, validation, duplicate taps, failed login, signup/reset notices, leaving during a request, malformed callbacks and recovery password save. All fixture network requests were intercepted; no real email, Google login, account creation or password change occurred.
- Provider setup and actual iPhone sign-in/email acceptance remain next. No domain activation, native rebuild, hosted migration, tester-roster change or live delivery occurred. Tester access remains closed.

## Registration and information screens — 18 September 2026

- Owner explicitly expanded registration to include date of birth, phone, city and interests. Read the archived S0671 slideshow and S0672 registration text derivatives; original design files remain in the separate archive. Three new illustrated information screens explain discovery, invitations and planning using existing Resbite artwork, colour, card depth and reduced-motion-aware transitions. Back, skip and existing-account routes are available; no automatic advance or permission prompt.
- Welcome → Let’s get together opens the introduction, then a three-step email registration: name/birth date, phone/city/interests, email/password. Name/email/password are required. Additional fields are optional pending a specific required-field decision. Birth date uses a native date picker on iPhone; phone requires an explicit country code if provided. Interests use gluestack checkboxes with distinct icons. Fields survive back/next within the form, validation retains inputs, passwords can be shown/hidden and are cleared after success. Unsubmitted forms are in memory only.
- Submitting sends the display name and optional details as Supabase Auth user metadata, never as authorization claims. Details are not copied to shared plans; the account/privacy screen describes this storage. Profile setup prefills the name after confirmation and retains its existing optional photo flow. A dedicated inbox state explains same-device confirmation and separate tester approval. Google remains available from sign-in; this new detailed form is the email registration path.
- No historical SMS/phone-call verification, precise home/work address, child account, automatic location collection or personalized recommendation behavior was added. Tester access remains closed. Metadata collection is owner-authorized scope; live provider/email acceptance remains pending.
- Verified: 86 tests, TypeScript/content validation, browser registration at 320/390 widths, auth and profile regressions, and iOS Hermes export. Registration fixtures check all three introduction screens, back navigation, invalid name/phone, retained fields, interest selection, password visibility, confirmation and exact metadata payload. All backend calls were intercepted; no real registrations or emails were sent. Physical iPhone date picker, keyboard, Larger Text and VoiceOver acceptance for these new screens remains pending.

## Resend and Auth URL setup — 18 September 2026

Owner saved Resend SMTP and confirmed resbite.com is verified, with sender Resbite <noreply@resbite.com>. Dashboard verification shows custom SMTP enabled, smtp.resend.com on port 465, a 60-second per-user interval and no unsaved changes. App callback and recovery redirects are saved, with resbite://auth/callback as the mobile fallback Site URL. No secret was stored in the repository. Live email delivery and same-device confirmation remain to be tested; Google and tester access were not changed.

## Branded confirmation email — 23 September 2026

Verified that the hosted signup-confirmation email was still Supabase's plain default. Created and saved a branded replacement with cream/aqua surfaces, a pink regular-weight CTA, text wordmark, same-iPhone guidance, fallback link and separate tester-approval notice. Subject: “Confirm your email — a little time together starts here”. Source and previous markup are kept in `supabase/templates/`. The unchanged ConfirmationURL placeholder preserves the existing Auth flow. Supabase reported a successful save and rendered the branded preview without the old default content. Local 320/600 px previews passed; no real email was sent. Actual inbox rendering/delivery remains pending. Other Auth templates and tester access were unchanged.

## Next MVP objective — 23 September 2026

The [real-account readiness milestone](milestones/2026-09-23-real-account-readiness.md) defines ordered implementation, external dependencies and physical-device exit criteria. Tester access remains closed throughout it; two-person acceptance follows only after explicit tester approval and release prerequisites. Immediate next implementation covers confirmation resend/recovery, optional registration-detail controls and Google onboarding parity, followed by live owner-account iPhone verification.

Branded reset and email-code templates are prepared locally in `supabase/templates/`; confirmation remains the only newly branded template verified as saved in Supabase. All three passed placeholder/link and 320/600 px browser-layout checks, with long fixture URLs and an eight-digit fixture code. No live emails or backend changes occurred in this planning/preparation step. Real-account readiness itself is not yet complete.

## Owner-only tester access — 23 September 2026

The owner explicitly authorized their supplied account email for testing. Added that exact address to the existing private tester roster; the account already existed with confirmed email. Verified one enabled roster entry and no other enabled entries. Email confirmation and all existing RLS/eligibility checks remain required. No Auth user, message, catalogue publication or release activation was created by this change. Earlier statements that the roster is empty are historical; broader tester access remains closed.

## Remaining branded email deployment — 23 September 2026

Deployed the prepared password-reset and email-code templates at the owner's request. Hosted previews preserve ConfirmationURL for recovery and Token for code entry; verified saved state for both. Signup confirmation, recovery and email-code are now branded in Supabase. Previous template bodies/subjects are recorded for rollback. No test email was sent and the deletion gate remains disabled. Owner-only tester access is unchanged. This supersedes earlier notes that recovery and email-code were local-only.

## Expanded private-beta planning — 23 September 2026

Reviewed the available product requirements, all 58 audited capabilities, detailed source text for the principal flows, current implementation and readiness evidence. The owner selected a complete private beta, iPhone first and Android immediately afterward, including live event chat, real history/wellness, saved activities, better planning/calendar, time polls, event photos, recurring plans and richer groups. Follow-up answers chose shared groups and each person's own confirmation of attendance/duration.

The [new development plan](milestones/2026-09-23-expanded-private-beta.md) defines feature contracts, dependencies, B0–B8 delivery milestones, acceptance and remaining operating decisions. The [scope overlay](../knowledge-base/13-expanded-beta-scope.md) maps every original capability and distinguishes selected features from proposed details. Historical sample-only chat/wellness limits no longer define the target beta, but those implemented screens remain samples until their live replacements pass acceptance. Polls/photos enter this beta without payments; marketplace, child accounts, public feeds and ads remain outside it.

Planning/documentation only: no feature code, new migrations, hosted configuration, messages, deployments or tester access changes. No app checks rerun. Existing provider/content/link/push/deletion/native acceptance gaps remain; the immediate implementation objective is B0 real-account onboarding and lifecycle readiness. Additional tester accounts still require explicit selection.


## B0 account onboarding implementation — 23 September 2026

Started the owner-approved expanded-beta plan using independent confirmation and backend agents, with root integrating account UI/routing and regression checks. Implemented persistent confirmation resend/cooldown and recovery guidance, server-confirmed account access with a usable pending screen, Google optional-detail completion/skip, and Profile → Account details for editing/removing birth date, phone, city and interests. These optional private metadata values never grant authorization.

Deployed two narrowly scoped RPC migrations: own account access status and atomic own-registration-detail updates. The latter locks the Auth row, validates inputs, preserves unrelated metadata, rejects conflicting stale saves and accepts an identical already-applied retry. A concurrent edit cannot restore details another device removed. Unconfirmed/anonymous/banned/deleting users cannot write; confirmed users awaiting tester approval may manage their own details. Broader feature tables remain roster-protected. Exactly one enabled owner roster entry remains; no additional tester or prepared deletion/notification activation was applied.

The app preserves incoming invitations through approval/setup/profile, waits for local invitation restoration before the startup destination, and offers retry on storage failure. Initial protected routes survive account checking, and the password recovery callback remains mounted until Save. New forms support keyboard avoidance, native date input, explicit optional skip, sign-out escape, locked controls during requests and unsaved-change handling.

Verified: TypeScript, **105 mobile tests**, content manifest, full disposable SQL/security/concurrency suite, intercepted 320/390 account/confirmation flows, auth/profile/RSVP/sign-out regressions and iOS Hermes export. Hosted privileges and owner approved status were checked; security advisors retain the existing leaked-password-protection warning and intentional closed-private-table informational entries. See [B0 evidence and remaining acceptance](../qa/b0-account-foundation.md).

The connected iPhone 14 received the updated development bundle. Owner confirmed account-detail save/reopen/removal and native keyboard/date-picker comfort. Read-only provider settings now show **Google enabled** (superseding the earlier disabled observation), and owner subsequently confirmed Google sign-in and app restart both work. Owner also confirmed branded reset-email delivery, the iPhone new-password screen, successful password save and sign-in. Google cancellation, signup-confirmation delivery and expired/reused-link acceptance remain pending. Full B0 is still open for those results, private photo/Auth/Storage verification, deletion/retention activation and catalogue approval/publication. The expanded beta features remain in their agreed later milestones.


## B0 published catalogue and cleanup preparation — 23 September 2026

Signed-in Discover/activity detail now read the published server catalogue instead of bundled editorial drafts. New-plan routes check availability; unpublished/deep-linked activities are blocked, while Preview and historical-plan editing/reconciliation remain usable. Added server tips/nullable duration, account/focus cancellation, foreground refresh and explicit loading/empty/error/retry states. The additive catalogue migration is deployed (hosted `activity_catalogue_details`, 20260923154040); no activity was published. One enabled owner remains, with unchanged published-and-eligible RLS.

Created an [eight-card visual review](../qa/catalogue-review.html) with exact copy, artwork, tips, duration and category provenance, fixed snapshot hashes and a publication/rollback record. Owner approval is pending; the signed-in catalogue intentionally shows an empty state until publication. Preview retains the eight drafts.

Prepared active-account orphan-photo cleanup and completed account-deletion receipt retention with separate agents and independent review. SQL retirement fences and account locks prevent delayed cleanup from deleting a newly attached/reused path; leased workers remove files through Storage HTTP and retry uncertain results. Receipt purge waits for confirmed absence and photo cleanup proof dependencies. Proposed periods are seven days continuously observed unattached and 30 days for detailed successful receipts. These migrations/workers remain undeployed, unscheduled and disabled. The [retention/restore proposal](../qa/b0-retention-proposal.md) records provider backup/log evidence and the still-missing independent deletion ledger/recovery gates; local checks do not replace real Auth/Storage race acceptance.

Verified 112 mobile tests, TypeScript/content validation, 29 worker tests, disposable SQL/security/cross-worker assertions and concurrent upload/attachment/deletion checks. Live-catalogue browser fixtures pass at 320/390, alongside planning/account/auth regressions; iOS Hermes export passes. No native dependency changed and no new iPhone acceptance is inferred. Await the owner’s photo result, a designated unapproved signup identity and catalogue approval. [Current B0 evidence](../qa/b0-account-foundation.md) records the remaining gates; B0 remains incomplete and broader tester access stays closed.


## First catalogue published and accepted for loading — 24 September 2026

The owner approved the exact eight-entry review scope `148bebe1a58c48abe12a2fcd763c73c0f51e6067b7d095a328f4d5377c1c2df9`: the existing artwork/copy/tips, displayed labels as temporary discovery filters, Painting's suggested 30 minutes and unspecified durations for the other seven, with Wine tasting retained as an adult activity. This does not approve the separate wellness taxonomy, a general age policy, additional content or broader tester access.

Published all eight in one guarded maintainer transaction at 12:58:29 UTC. The [publication record](../qa/catalogue-publication-2026-09-24/README.md) retains the initial empty before-image, exact payload, SQL, commit receipt and rollback. Independent hosted read-back at 12:59:30 UTC matched every approved field and confirmed eight published rows, enabled RLS, unchanged grants/read policy and one enabled owner. Hosted SQL role simulations returned eight rows for the owner, zero for an unapproved nonexistent principal and privilege denial for anonymous reads; no Auth user was created. Those simulations do not replace the remaining designated unapproved-account device test.

Owner then confirmed on the physical iPhone: “All eight load correctly” after signed-in Discover refresh and opening their artwork/details. This accepts live catalogue loading. It does not establish live new-plan creation, offline behavior or fresh Larger Text/VoiceOver/Reduce Motion results. The original [review page](../qa/catalogue-review.html) is now visibly archived with its exact embedded snapshot preserved; any [new activity proposals](../qa/new-activities-review.html) require their own review and are not covered by this approval.

B0 remains open for the outstanding confirmation/provider edge cases, private photo/Auth/Storage evidence and reviewed deletion/retention activation recorded in [B0 acceptance](../qa/b0-account-foundation.md). Catalogue approval/publication is no longer pending; broader tester access remains closed.

## Three approved catalogue additions — 24 September 2026

The owner selected all three new concepts with “love it, keep them”: Picnic in the park, Walk and talk, and Board game night. Preserved their exact reviewed copy, tips and v2 PNG bytes, with existing temporary discovery labels and null suggested durations. The separate [mobile approval](../mobile/content/activity-additions-approval.json) binds the unchanged review manifest/provenance and copied artwork. Original-eight manifests, artwork and approval remain unchanged. The illustrations were generated with the built-in OpenAI image tool after the announced ElevenLabs fallback.

Registered the three artwork keys and bundled additions for Preview/search/historical labels, then verified TypeScript, 113 mobile tests, content/image hashes, extended 320/390 catalogue browser fixtures and an iOS Hermes export. Fixtures exercise each addition's search, detail/artwork, preview plan creation and saved-plan editing. The connected iPhone 14 was relaunched and received fresh compatible Metro bundles before publication; no native dependency changed.

Published exactly three new rows at 13:17:41 UTC. Independent hosted read-back at 13:17:56 UTC matched every new field, all eight original rows and unchanged RLS/grants, with eleven activities and exactly one enabled owner. The [separate publication record](../qa/catalogue-additions-2026-09-24/README.md) includes the commit receipt, full before/after images and locally rehearsed replay/conflict/rollback guards. The owner has been asked to refresh Discover and check all three new entries; their physical-device acceptance remains pending. Broader tester access, wellness taxonomy, general age policy and disabled lifecycle workers remain separate from this content approval.

## B0 profile-photo consistency — 24 September 2026

The remaining photo review found delayed SDK requests could resolve a newly signed-in account and an upload could overwrite another device's photo change. Photo/name writes now capture the intended account token. A database-managed avatar revision and guarded update RPC reject stale changes, including paths changed and later restored, and acknowledge exact lost-response retries. Pending changes persist their baseline revision; legacy records require explicit discard/reselection. Picker cancellation stays inert, and render failure releases native resources.

Client Storage deletion is disabled because it cannot guarantee that an old path was not concurrently reattached. Removing a photo clears the profile reference, with accurate UI/privacy wording that previous files remain private until cleanup is enabled. Other authorized participants may read only the currently attached image; previously issued signed links can remain valid for five minutes. No cleanup worker or retention policy was activated.

Deployed only the additive `avatar_revision_compare_and_swap` migration (local `20260924150135`, hosted `20260924150824`). Hosted verification confirms the new trigger/RPC and restrictive Storage policies, one enabled owner, eleven activities and undeployed cleanup/deletion tables. Existing security-advisor notices are unchanged. [Evidence and remaining provider/device checks](../qa/avatar-consistency-2026-09-24/README.md).

Passed: TypeScript, 119 mobile tests, content validation, intercepted profile/confirmation/auth browser checks, all 10 SQL assertion files and 4 concurrency scripts, separate hosted-baseline compatibility, and iOS Hermes export. The iPhone is currently disconnected, so fresh delivery and photo acceptance are pending. A separate owner-controlled email is still needed for signup-confirmation and unapproved-account acceptance. B0 remains open; B1–B8 and wider tester access have not been activated.

## B0 photo update delivered to iPhone — 28 September 2026

The owner reconnected the iPhone 14. CoreDevice reported available/paired, Resbite relaunched successfully, and Metro served fresh entry and Supabase iOS bundles. The existing native build supports this JavaScript update; no reinstall or data reset was needed. [Delivery record](../qa/avatar-consistency-2026-09-24/device-delivery-2026-09-28.json).

The owner confirmed “It works perfectly” after testing signed-in photo upload, persistence after closing/reopening, and removal from the profile. Those three native behaviors are accepted; physical Storage deletion, interrupted retry and cross-account authorization remain separate. No new code, migration, worker activation or access change was made; previous automated passes remain dated 24 September. B0 still requires the remaining account/photo/provider and lifecycle acceptance.

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

The owner has no separate recovery storage and asked about Supabase Storage. A private bucket in a separate Supabase project is proposed, not created or selected by authorization. The [recovery design](../qa/deletion-recovery-ledger.md) describes provider/key custody, write-ahead admission, inventory completeness, restore replay and retention still required. This core is not wired to live deletion and does not establish completeness of a restored ledger. All release gates remain false.

## Recovery Storage adapter — 29 September 2026

Added the server-only Supabase Storage adapter for the encrypted ledger. It requires a distinct recovery project and private bucket, checks service-role credential configuration, uses non-overwriting uploads and authenticated bounded reads, rejects redirects and sanitizes failures. Six injected HTTP tests cover private access, configuration/path rejection, public-bucket rejection, ambiguous provider errors, response limits and encrypted lost-acknowledgement reconciliation. All 13 ledger/adapter/release-gate tests and focused TypeScript checks pass.

No recovery project/bucket was created, no real record was exported and no deletion worker was deployed or enabled. Provider verification, prepared-request admission, complete inventory/checkpoint proof and fenced restore replay remain unfinished. See the [recovery ledger design](../qa/deletion-recovery-ledger.md).

## Ledger-backed deletion admission prepared — 29 September 2026

Implemented the prepare → verified independent ledger → activate coordinator, a private reservation/activation migration and its server RPC adapter. The unconfigured deletion gateway now refuses requests instead of calling the legacy raw deletion RPC. Reservation creation preserves current access/profile data; verified-intent activation uses the prior redaction/cancellation/job behavior and supports stable retries after proof expiry at the service layer.

All 51 backend tests, focused TypeScript checks, 11 disposable SQL assertion files and four existing concurrency scripts pass. Nine admission tests cover failure ordering, mismatches and lost replies; the SQL checks cover service-only permissions, stable reservations, no premature mutation and matching activation. No hosted migration or worker was enabled. Full inventory/checkpoint verification, background reconciliation, restore replay and provider setup remain outstanding; this is local preparation, not live deletion readiness. [Detailed recovery status](../qa/deletion-recovery-ledger.md).

## Git handoff — 7 October 2026

The accumulated app, backend, artwork, QA and planning work is packaged with a [detailed development handoff](development-handoff-2026-10-07.md). GitHub’s earlier `8577e61` planning commit is integrated without replacing the newer planning editor, tabs, draft recovery or request cancellation guards. Its SQL assertions for successful edits, unchanged RSVPs, stale-version rejection and queued change notifications are retained. The obsolete helper test file is superseded by current `rules.test.ts` planning/reconciliation tests and planning/RSVP browser QA; obsolete helper exports and the old non-tab route are not restored. No hosted deployment or roster change is included.
