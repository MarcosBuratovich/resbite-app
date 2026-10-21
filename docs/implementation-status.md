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

## Custom events CE1 — 7 October 2026

**Shipped and owner-accepted on the iPhone.** Resbite events now have a required title, a description of up to 1,000 characters and one or two of the seven wellness categories. Discover became the Create tab, with a "New resbite" start card, the ideas as editable templates (each event remembers its source idea) and category filters. Published ideas carry categories from the approved mapping (`mobile/content/activity-categories.json`). The invite screen and draft cards show event pictures. Drafts and unconfirmed saves from the earlier app are upgraded with the idea's title and categories and an empty description, mirroring the migration backfill. Two `plans` triggers keep the legacy `create_plan` working and blank event text while the owner is being deleted. Invitations, RSVP and the two-person flow are unchanged.

**Hosted migration.** `custom_events` (local `supabase/migrations/20261007150000_custom_events.sql`) was applied to project `ewcsgvhuojxdpaspwsrx` as hosted version `20261007154825`, after explicit owner approval of that single migration. Advisors were unchanged (INFO only). `supabase/tests/hosted-baseline/migrations.txt` records it.

**Verification before rollout.** `npm run check`: 140 tests, 0 failures. Backend tests: 51/51. SQL suite: full and hosted-baseline modes pass. All 16 browser QA scripts pass. iOS JavaScript export passes. The update reached the installed development build as JavaScript only, with no native rebuild.

**Acceptance.** The owner ran the eight CE1 checks on 7 October 2026 and replied "all good, everything works on the iPhone". Full record, rollback SQL and approval wording: [CE1 rollout record](../qa/custom-events-2026-10-07/README.md).

**Known limitation.** Opening "New resbite" and leaving without typing leaves an empty draft card. A guard was reverted because it suppressed autosave after an undone edit.

**Remaining.** CE2 (organizer cover photo) gets its own plan next, followed by the remaining B0 work and B1. Tester access is still owner-only. Deletion is not enabled; its release sequence now includes the custom-event checks in the [recovery ledger](../qa/deletion-recovery-ledger.md).

## Custom events CE2 — 7 October 2026

**Shipped and owner-accepted on the iPhone.** Organizers can add, replace and remove a cover photo for an event they own while it is active and in the future. The picker normalizes the photo on the phone (JPEG, longest side 1600 px, metadata stripped, at most 2 MB). A new event saves first and its cover then uploads and attaches; if that step fails, the event still exists and Edit offers "Retry cover". Cancelling the picker changes nothing. Readers see covers through 5-minute signed links, and only the current cover. Attach, replace and remove go through `set_plan_cover_if_current`, a compare-and-swap on path and revision. Account deletion detaches the cover. Preview covers are never saved in drafts, and cover work blocks Save and leaving the editor until it finishes.

**Hosted migration.** `plan_covers` (local `supabase/migrations/20261007200000_plan_covers.sql`) was applied to project `ewcsgvhuojxdpaspwsrx` as hosted version `20261007175855`, after the owner's explicit approval ("Yes, apply it") of that single migration. Advisors were unchanged. `supabase/tests/hosted-baseline/migrations.txt` records it.

**Verification (Task 6, before the final review fixes F1 `9e1da8e` and F2 `49f2410`; their scoped re-review was clean).** 148 mobile tests, 51 backend tests, SQL suite in full and hosted-baseline modes, 17/17 browser QA scripts, iOS JavaScript export, `git diff --check` clean. The update reached the installed development build as JavaScript only, with no native rebuild.

**Acceptance.** The owner's first reply ("all good, everything works on the iPhone") was not recorded as acceptance: no bundle had been served and nothing had reached the database. After reloading, the owner replied "done, reloaded and ran all four checks" on 7 October 2026, corroborated by Metro and hosted data. Evidence, rollback SQL and approval wording: [CE2 rollout record](../qa/custom-events-ce2-2026-10-07/README.md).

**Rulings.**
- The storage UPDATE policy lets the owner rename or move objects within their own folders (needed for upsert retries), as for profile photos. An organizer can only break their own cover link.
- A signed cover link (300 s) a reader already holds keeps working after replace or remove until it expires. This is inherent to Supabase signed URLs and is the same for profile photos.
- Acceptance check 4 (offline) was narrowed with the owner's approval: cover actions on an existing event are disabled when its cover can't be loaded; a change after the connection drops fails safely and offers Retry cover; choosing a cover for a new event is local and uploads after save.

**Remaining.** Cover cleanup in the cleanup and deletion workers (item 8 of the [recovery ledger](../qa/deletion-recovery-ledger.md)); invitee viewing, verified in B1 with a second tester; then the remaining B0 work and B1. Deferred known limitations (header and draft cards without the cover, no thumbnail re-signing, stranded pending changes and the like) are listed in the [CE2 record](../qa/custom-events-ce2-2026-10-07/README.md#known-limitations-deferred). Tester access is still owner-only. Deletion is not enabled.

## B0 pre-B1 fixes — 7 October 2026

**Shipped and owner-accepted on the iPhone (acceptance folded into the UX1 session).** An invitation claim now notifies the organizer instead of the person claiming. Cover leftovers are cleared: a per-account list of pending cover changes means sign-out and account deletion clear every pending change and its photo bytes, and pending changes for events that are cancelled, already started or no longer the user’s are discarded when My resbites loads. An untouched editor no longer leaves an empty draft card (the known CE1 limitation); editing and then undoing back to the starting state removes the draft.

**Hosted migration.** `claim_notifies_owner` (local `supabase/migrations/20261007210000_claim_notifies_owner.sql`) was applied to project `ewcsgvhuojxdpaspwsrx` as hosted version `20261007193235`, after the owner’s explicit approval ("Yes, apply it") of that single migration. The function body differs from the foundation’s only in the recipient; advisors showed no new warnings. `supabase/tests/hosted-baseline/migrations.txt` records it.

**Verification.** At the fix commits: 167 unit tests, 51 backend tests, SQL suite in full and hosted-baseline modes, 17/17 browser scripts, iOS export and diff check. UX1 re-ran all of these on top of the fixes. The cover-cleanup and draft behaviours stay on the phone, so live data cannot confirm them separately; automated tests cover them. Rollback SQL and approval wording: [B0 pre-B1 fixes record](../qa/b0-pre-b1-fixes-2026-10-07/README.md).

## UX refresh UX1 — 14 October 2026

**Shipped and owner-accepted on the iPhone.** UX1 is the first phase of the [UX refresh](superpowers/specs/2026-10-07-ux-refresh-design.md) ([UX1 plan](superpowers/plans/2026-10-07-ux-refresh-ux1.md)), informed by the [event creation app benchmark](../reports/Event%20creation%20app%20benchmark.md). It adds a shared component kit; creation as step cards (What, When, Where, Vibe, Review, then "It’s on!" with Invite), where ideas and edits open on Review; My resbites as cover cards with Upcoming and Past (cancelled events stay visible), a row of removable drafts and a floating +; and one event page for organizers and invitees (Going / Can’t make it, Open in Maps, Do this again, organizer icon actions). Invitation links now land straight on the answer. The Create tab, idea page, Invitations and People are simpler, with explanations behind ⓘ. Recent places stay on the device and are cleared at sign-out, and the Preview bar became a small chip. Benchmark rows 1, 2, 4, 5, 6, 7, 9, 14 and 15 are covered.

**No hosted change.** UX1 is JavaScript only: no database change, no new dependencies, no native configuration change. It reached the installed development build as a JavaScript update.

**Verification (at `c01897c`, 23 commits from `9436c01`).** `npm run check`: 200 unit tests, including a guard that fails if layout animations return. All 20 browser scripts pass, including the new verify-kit, verify-steps and verify-event and review-ui (every redesigned screen at 320 and 390 px, plus Larger Text). SQL suite in full and hosted-baseline modes, iOS export and diff check pass.

**iPhone rounds.**
- First delivery (8 October): the owner found the steps too small and empty and asked for the date picker first. A revised mockup ("steps v2") was approved and built: bigger buttons, tiles and icons, the photo first on What, the calendar and time wheel first on When with suggestions below, and fuller Where and Vibe steps. One owner-approved refinement: the optional description moved onto the What step.
- Second delivery: the owner reported that the last calendar rows could not be selected and the time wheel scrolled the page. Root cause, found with temporary touch logging on the iPhone: Reanimated layout (`entering`) animations froze the native frame of each step’s content at its first-layout size on the new architecture, so content that appeared later was not tappable. Step screens and `Reveal` now use shared-value animations (`8b93031`, refined in `c01897c`); the owner confirmed the calendar and time wheel work, and a unit test guards against layout animations.
- Draft trap: "+" reopens the saved blank draft, but Discard sat only on the review card. Discard draft is now offered when leaving from any step, and draft tiles in My resbites have a remove button (`313bec3`).

**Acceptance.** The owner replied "all good, everything works on the iPhone" (9 October) and, on 14 October, "Accept as-is".
- Confirmed in the live data (read-only queries on 9 and 14 October): 4 events were created on the owner’s account since 8 October, 2 with cover photos, the latest at 12:48 UTC on 9 October, after the final fix. So creating from scratch with a cover works on the real account with the new steps. The When fix was also confirmed by on-device touch logs.
- Not confirmed in the live data: no event created from an idea, no edited event and no newly cancelled event exist since 8 October, so checks 2 (from an idea), 3 (edit) and 5 (cancel shows under Past) left no trace; the owner may have done them in preview mode, which saves nothing. The final dev server logged no bundle download to the phone, so which build the phone ran for the last checks is not recorded. The owner accepted as-is, and these checks are recorded as unverified rather than repeated.

**Open owner choices** (resolved by UX2-D1 to UX2-D3 on 14 October). Saving an edit returns to My resbites rather than the event page. Organizer actions on the event page are icons only, which the owner should judge for recognisability. "Upcoming" is both the heading and the first tab. Invitees still see every guest’s name and answer, as before UX1; UX2 limits this. Native-only behaviours (the three-option leave alert, VoiceOver focus timing, picker seeding) were checked only on the phone or by unit tests. Other small points are deferred. Full record and rollback (serve the CE2 build `7103aba`; no database involved): [UX1 record](../qa/ux1-2026-10-07/README.md).

**Next** (superseded: UX2 is live, see below). UX2 comes before the second tester: Maybe and the "withdrawn" wording, narrower notifications and their wording, the guest list after answering, and the cover description. Each is a database migration applied only with the owner’s explicit approval. Then B1. Account deletion is its own track, required before any wider beta (owner decision of 7 October: "Split deletion out"); B1 may start with one explicitly approved tester. Tester access is still owner-only and deletion is not enabled.

## UX2 build — 14 October 2026

**Live on the hosted project since 14 October (version `20261014163459`); organizer side accepted on the owner’s iPhone on 15 October; invitee side (TestFlight) pending.** Merged into `main` and pushed on 15 October. UX2 is the second phase of the [UX refresh](superpowers/specs/2026-10-07-ux-refresh-design.md) ([spec](superpowers/specs/2026-10-14-ux2-design.md), [plan](superpowers/plans/2026-10-14-ux2.md); decisions UX2-D1 to UX2-D7 in `knowledge-base/08-decisions.md`). It adds Maybe to the answer choices and "Can’t make it now" for the stored withdrawn state; a guest list that invitees see (names and photos) only after they answer, with the organizer always seeing everyone and guests grouped by answer; notifications only for a new time or place, only to people who may come (cancellation still goes to everyone), with wording that says what happened and who did it and never shows the place or note; a cover photo description read by VoiceOver, cleared by the database on any photo change; saving an edit returning to the event page with "Changes saved"; the "My resbites" heading; and bottom sheets that stay above the keyboard.

**Migrations.**
- `supabase/migrations/20261014120000_ux2_rules.sql` was applied to the hosted project on 14 October after the owner’s explicit approval ("Yes, apply it"), as version `20261014163459`. All nine function fingerprints match the tested file, and the advisors show no new security warnings. A rollback file proves its reversal in the hosted rehearsal.
- `supabase/migrations/20261014130000_ux2_notification_wording.sql` is local-only and ships with the notification sender.
- Notification sending stays switched off (`DELIVERY_RELEASE_APPROVED = false`).

**Verification (branch `ux2` at the time of this entry, before this commit).** Database suite in full mode and in hosted-baseline mode with the rules candidate (`PASS: 20261014120000_ux2_rules applies on the hosted baseline`), 56 worker tests, `npm run check` (205 mobile unit tests, content validation), all 20 browser scripts with no failures, iOS JavaScript export and `git diff --check main...HEAD` clean. Nothing here was run on a device or the live project.

**Acceptance.** Stage 1 accepted ("all good, everything works on the iPhone", then "Accept as-is"). Live data confirms an edit landing and a description save; changing/removing a description and a photo replacement left no trace and are recorded as unconfirmed. Full record: [UX2 record](../qa/ux2-2026-10-14/README.md).
1. The owner’s iPhone checks the organizer side: the "My resbites" heading, saving an edit landing on the event page, adding, changing and removing a photo description, a replaced photo clearing it, the grouped guest sheet, and that the "Describe photo" sheet stays above the keyboard.
2. After that, one coworker on TestFlight checks the invitee side (UX2-D6, UX2-D7): the organizer-only view before answering, Maybe, and the guest list after answering. Adding the coworker to the tester list is a separate live data change that needs its own approval.

**Next.** Push `main` when the owner says so, then the TestFlight stage with one coworker (each tester-list addition is approved separately). Then B1. Tester access is still owner-only and account deletion is not enabled.

## UX4 build — 15 October 2026

**Accepted on the owner’s iPhone on 15 October (“all good, everything works on the iPhone”, then “Accept as-is” for the checks that leave no trace). Merged into `main` and pushed on 15 October; not on TestFlight yet.** UX4 is the third part of the UX work: it brings the 13 screens outside the event flow to the same minimal, widget-like standard as UX1 ([spec](superpowers/specs/2026-10-15-ux4-design.md), [plan](superpowers/plans/2026-10-15-ux4.md); decisions UX4-D1 to UX4-D5, P1 to P14 and the changes made during the build in `knowledge-base/08-decisions.md`).

**What changed.**
- App only. There is no database, service, native, build or dependency change, so nothing touches the hosted project.
- 13 screens (the sign-in screen and its Confirm your email mode count once) are redrawn with the kit: landing, introduction, sign-in, sign-up, confirm your email, reset password, the email-link page, account access check, Profile, Account details, Notifications, Data & privacy, Wellness and Delete account. Each has one short heading and chips, rows and cards in place of paragraphs and long button labels.
- Sign-in and Profile logic moved into `useAuthFlow` and `useProfile` unchanged; the screens now only draw.
- Delete account gets a short warning card, a "What happens" sheet and a red `destructive` button. Account deletion stays switched off (`EXPO_PUBLIC_ACCOUNT_DELETION_ENABLED`).
- Browser scripts are updated for the new wording, and new captures cover each screen at 390 and 320 px and with Larger Text, with a check that no button, heading or field is clipped.

**Verification.** `npm run check`, every browser script, the deletion script with deletion switched on (intercepted fixtures only), the iOS JavaScript export and `git diff --check main...HEAD` pass. The diff against `main` has no change under `supabase`, `app.json`, `eas.json`, `package-lock.json` or `ios`. Nothing here was run on a device.

**Deferred to the owner’s iPhone check.**
1. Sign out and back in; the landing page and introduction (Close on the first slide, Skip, Next, "Create account"); starting a sign-up and backing out; requesting a password reset email.
2. Editing the Profile name (the sheet over the keyboard) and photo; Account details (the birth date sheet), Privacy, Notifications, Wellness and Delete account (deletion stays off).
3. Accessibility and layout on the phone: signing in with an unconfirmed account (the chips sit below the notice); tapping Remove photo; Larger Text on Account details (both modes), the account access check and "Check your inbox"; Voice Control "Tap Check again"; VoiceOver focus on Sign in, then Forgot password?, then Back to sign in; the resend countdown hint.
4. The tab bar labels and single-line placeholders at the largest text sizes, which truncate in the browser proxy.

**Next.** UX4 reaches TestFlight in a later build, after the coworker’s UX2 invitee check on the current build (record: [UX4 QA](../qa/ux4-2026-10-15/README.md)).

## UX3 build — 15 October 2026

**Live on 16 October 2026: the migration is applied, build 8 is on TestFlight and the link site is up. The `ux3` branch is not merged yet; it waits for the owner’s iPhone check.** UX3 is the fourth part of the UX work: invite links on `link.resbite.com`, an optional end time, private Meeting details, the Note to guests, Add to calendar and two reminders ([spec](superpowers/specs/2026-10-15-ux3-design.md), [plan](superpowers/plans/2026-10-15-ux3.md); decisions UX3-D1 to UX3-D8, P1 to P12 and the changes made during the build in `knowledge-base/08-decisions.md`).

**What changed.**
- Invite links use `link.resbite.com`, with a small static site in `links/` (the Apple link file, a private preview and a fallback page).
- The creation steps and event page take an optional end time and show time ranges.
- "A note for everyone" becomes private Meeting details, seen only by the organizer and Going or Maybe guests; the database enforces it. A new Note to guests is a short announcement for everyone invited.
- Add to calendar and Update calendar open iPhone’s own form, with no permission request and no alert from Resbite.
- Two local reminders (1 day and 1 hour before), with a switch per event and an "Event reminders" switch in Notifications.
- "Can’t go" replaces "Can’t make it".
- One new dependency, `expo-calendar`, and the Associated Domains entry `applinks:link.resbite.com`.

**Migrations.**
- `supabase/migrations/20261015120000_ux3_event_details.sql` is live (hosted version `20261016125958`, applied 16 October 2026 after the owner’s approval, sha256 `7d9cffbe…54d00a`). The live functions, checks and policy match the reviewed file exactly, the one existing note moved into Meeting details, and the advisors show nothing new. Snapshots: `qa/ux3-2026-10-16/hosted-before.json` and `hosted-after.json`. A rollback script restores the exact pre-UX3 definitions and the note text; rolling back shows every Meeting details text to every invitee on older builds, so weigh that first.
- Rollout: an empty note from an older build now keeps the Meeting details, so applying the migration before the new build only costs older builds the display of Meeting details. Still keep apply → build → submit back to back.
- `supabase/migrations/20261015130000_ux3_note_delivery.sql` is local-only and goes live only with the notification sender, after that has its own approval.
- Notification sending stays switched off (`DELIVERY_RELEASE_APPROVED = false`).

**TestFlight build 8 (16 October 2026).** Built by EAS from commit `277fbcf` with `EXPO_PUBLIC_INVITATION_ORIGIN=https://link.resbite.com`, so new invitations use the HTTPS link. Builds 6 and 7 failed because the App Store provisioning profile predated the Associated Domains capability; the owner’s signed-in EAS run enabled it on `com.resbite.app` and made a new profile.

**Link site (live 16 October 2026).** Generated from `links/` for Team ID `QY833VTUWL` and `com.resbite.app`, and deployed as the Vercel project `resbite-link` in the Good Unicorn Ltd team, next to the marketing site. Cloudflare has a DNS-only CNAME `link`. Checked live: `/.well-known/apple-app-site-association` returns 200 as `application/json` with no redirect, lists only `/invite`, and Apple’s CDN already serves it; `/invite` returns 200 with `no-store`, `no-referrer`, the strict CSP and `nosniff`; `/` redirects to `www.resbite.com`; nothing else is served. Invites keep using `resbite://` links until the new TestFlight build sets `EXPO_PUBLIC_INVITATION_ORIGIN=https://link.resbite.com`.

**Known limits, for the owner.**
- The "Get reminders?" sheet appears on the event page (the organizer’s own event, or after answering Going or Maybe), not right after creating an event as the spec says. An organizer isn’t asked until they open the event’s page.
- A niche case: an edit draft saved by an older build after the migration, then restored in the new build, carries an empty note. Saving it in the new build would remove the Meeting details.

**Verification (15 October 2026).** The database suite passes in full mode and in hosted-baseline mode with the UX3 candidate. The worker tests pass (56 of 56). `npm run check` passes (44 test files, 282 tests, content validation). All 19 `verify-*` browser scripts and `review-ui` exit 0. The iOS JavaScript export succeeds. The native configuration shows `applinks:link.resbite.com` and the four calendar and reminders purpose strings. `git diff --check main...HEAD` is clean outside the plan file, whose embedded patches carry blank context lines.

**Final-review fixes (15 October 2026).** Older builds’ empty note keeps Meeting details; the owner checks in `create_plan_v3` and `change_plan_v3` are NULL-safe; Meeting details are sent trimmed; "Get reminders?" never opens once the chips are gone (after Can’t go); the When step’s 1-hour line shows only without an end. Re-run afterwards: the database suite passes in full mode and in hosted-baseline mode with the UX3 candidate (rollback rehearsal included), with the new checks in `supabase/tests/ux3.sql`. The worker tests pass (56 of 56). `npm run check` passes (44 test files, 282 tests, content validation). `verify-steps`, `verify-planning` and `verify-event` exit 0 (`verify-planning`’s known flaky draft line failed once and passed on the re-run); the other browser scripts weren’t re-run, as the fixes don’t touch what they cover. `git diff --check` stays clean outside the plan file. Nothing here was run on a device or the live project.

**Deferred to the owner’s iPhone check (on the new TestFlight build).**
1. A `link.resbite.com` invite sent in Messages opens the app; without the app, the fallback page shows.
2. The end time; Meeting details locked, then unlocked; the Note to guests (post, edit, remove).
3. Add to calendar (the form opens, with no alert from Resbite) and Update calendar. iPhone’s own default alert setting may still add an alert.
4. The reminder sheet and permission; a real reminder (set an event about 1 hour and a few minutes ahead); tap a reminder while the app is closed; the switches.
5. Larger Text and VoiceOver on the event page.
6. Larger Text on the When step with an end time and on the Where step: the web preview clips long values in single-line fields at 320 px (start and end date, place); confirm the iPhone pickers and fields read in full.
7. Under Larger Text, "Remove end time" and the note card’s ✎ ("Edit note to guests") are reachable by scrolling.
8. Where the Note to guests card sits on the event page (today below the calendar and reminder chips); the owner may want it above them.
9. Add to calendar with the phone set to another time zone: the entry sits at the event’s real time.

**Next.** After the coworker’s UX2 invitee check on the current build: the link site setup, then the migration (with the owner’s approval) and the new TestFlight build together.

## GI1 build — 21 October 2026

**Built on the `gi1` branch and fast-forwarded into `ux3` (unmerged into `main`) on 21 October 2026; the migration is live, the page is not deployed, the build is not on TestFlight.** GI1 is the first of three parts of the guest invitation flow: one link per event, `link.resbite.com/r/<code>`, and a web page that shows the basics and one RSVP button ([spec](superpowers/specs/2026-10-21-gi1-event-links-design.md), [plan](superpowers/plans/2026-10-21-gi1.md); decisions GI-D1 to GI-D7, P1 to P12 and the changes made during the build in `knowledge-base/08-decisions.md`). `gi1` is rebased onto `main` at rollout, after the final review, once `ux3` is accepted and merged.

**What changed.**
- One link per event, made and kept by the database, with "Turn off this link" (which makes a new one). Per-person links stop being made.
- The web page at `link.resbite.com/r/<code>`, rendered by a Vercel function in `links/`, with four states (open, cancelled, happened, inactive), a chat preview (title, start, host and image; never the area or the place) and a "Join Resbite to reply" sheet.
- An optional Area field on the Where step, shown on the page before people reply.
- Invite people replaces the Invitations screen: Share, Copy link, Turn off this link. The guest list gets Remove; the question and the ⓘ sheet say a removed guest can join again with the link unless it is turned off.
- The app opens `/r/<code>` links (also with a trailing slash, a query such as `?fbclid=…` or a fragment) and joins the event for a signed-in, approved tester. The host, and anyone already on the event, opening any of its links (even a turned-off one, or after the start) lands on the event.
- A link refused for good (turned off, started, cancelled or malformed) is not kept on the phone, so the next start opens the app as usual; the error offers "Go to My resbites". Only a lost connection keeps it for a retry.
- On the event page, an invitee who hasn’t answered sees the area (if any) and "Exact address after you reply", with no Open in Maps; their My resbites card shows the area or no place. The Note to guests stays visible to everyone on the event. Choose people has no entry on the event page (GI-D3); People stays on Profile.
- Old per-person links and the `/invite#token=` page keep working.

**Migration.** `supabase/migrations/20261021120000_gi1_event_links.sql` is live (hosted version `20261021165314`, applied 21 October 2026 after the owner’s approval by sha256 `74faf731…42b77`). All fourteen live function bodies match a local replay of the file, the old save signatures are gone, every plan’s area is empty, and no link exists yet; the advisors add only the intended warnings on `public.invitation_page` (anon-callable definer, P2) and the usual no-policy note on `private.plan_links`. Snapshots: `qa/gi1-2026-10-21/hosted-before.json` and `hosted-after.json`. Build 8 keeps working (it never sends `p_area`); the new screens wait for the page and the new build, because build 8 can’t open `/r/` links. A rollback script restores the exact pre-GI1 definitions. After a rollback, builds that send `p_area` (the GI1 builds) can no longer create or edit events, because PostgREST finds no matching function, until those phones are back on an older build or a fix-forward migration restores the signature.

**Rollout still to do (controller and owner).**
- Deploy the page before building the app, then confirm that `https://app-site-association.cdn-apple.com/a/v1/link.resbite.com` lists `/r/*` before the build.
- Ask testers to update to the new build before they open `/r/` links. A build 8 phone whose association file has refreshed opens them into an error.
- The `resbite-link` Vercel project needs environment variables: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` (the owner sets it as a sensitive variable), `LINK_ORIGIN`, `APP_STORE_URL` (the TestFlight invitation link; if it is unset, "Get the app" opens the App Store home) and `APP_STORE_ID` (left unset until the app is public). It also needs a firewall rate limit on `/r/*`.
- Smoke-test the page with a real open code, one with a cover and one with an illustration. A misconfigured environment renders every link as "no longer active" (P3).
- Vercel request logs record `/r/<code>` paths. Check the log retention.

**Still owed by GI2 and GI3.** GI2: the guest’s account created from a link, the 18+ tick, Sign in with Apple, and the link granting beta access. GI3: capacity ("spaces left", the full state) and host approval.

**Verification (21 October 2026, after the final review’s fixes, on the final commit before this one).** Nothing here was run on a device or the live project.
- `./scripts/test-database.sh` passes in full mode (`PASS: gi1.sql` and the disposable SQL assertions line; exit 0).
- `./scripts/test-database.sh --hosted-baseline supabase/migrations/20261021120000_gi1_event_links.sql` passes (`PASS: gi1.sql (hosted baseline)`; exit 0).
- The worker tests pass (56 of 56, unchanged).
- `npm run check` passes: typecheck, the test chain and content validation. The chain runs 46 files: 44 app test files with 291 tests, then `links/generate.test.mjs` (5 tests) and `links/page.test.mjs` (17 tests) as their own steps; 313 tests in all.
- All 20 `verify-*` browser scripts and `review-ui` exit 0, with Expo web started on `--clear` and stopped afterwards. `verify-planning`’s known flaky draft line passed on the first run.
- `npx expo export --platform ios` succeeds.
- The generated Apple link file lists `/r/*` once.
- `git diff --check main...HEAD` is clean outside the plan file, whose embedded patches carry blank context lines.

**Deferred to the owner’s iPhone check (on the new TestFlight build).**
1. Make an event with an area and a cover, then open Invite people.
2. Share the link into WhatsApp. The preview shows the title, date, host and image, with no area and no place. Try one event with a heavy illustration (walk-and-talk, picnic-in-the-park or board-game-night) and one with a large cover; if WhatsApp drops the image, plan pre-sized preview copies.
3. Open the link on a phone without Resbite (the page, RSVP, the sheet, "Get the app") and on one with it (it lands on the invitation and joins).
4. Tap the host’s own link: it opens the event page.
5. Turn off this link: the old link says it is no longer active, and the new link works.
6. Remove a guest. They can rejoin by the event link (by design) but not by an old per-person link.
7. Cancel an event and open its link.
8. Larger Text and VoiceOver on Invite people. The ⓘ sheet scrolls fully under Larger Text.
9. The native Keep/Remove alert presents above the open Guests sheet.
10. The Review step’s "Area · …" row reads as pressable, and a long Area value reads in the field.
11. As a guest who hasn’t answered, the event page shows the area and "Exact address after you reply", with no Open in Maps; after Going, the place and Open in Maps show.
12. Open a turned-off link as someone not on the event: the error shows with "Go to My resbites", and the next cold start opens the app as usual.

**Next.** After the final whole-branch review: the `ux3` iPhone check and merge, the page deploy, the migration (with the owner’s approval) and the new TestFlight build, back to back.
