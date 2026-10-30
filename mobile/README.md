# Resbite mobile foundation

React Native + Expo 57 + TypeScript, with Supabase. This is an initial implementation, not a tester-ready release. iPhone first; Android uses the same app code. No Firebase service is used.

## Run locally

Use Node 22.13+ and `npm ci`. Copy `.env.example` to `.env.local` and use the project's public URL/publishable key. Never put a service-role key in this app.

- `npm start`: Expo development server.
- `npm run ios`: open the iOS target (requires the Mac/iOS environment).
- `npm run web`: developer-only layout review. This is not the deliverable mobile app.
- `npm run check`: TypeScript, domain/session-storage tests and content-manifest validation.
- `npx expo export --platform ios --output-dir dist-ios`: checks the iOS JavaScript bundle; does not compile/sign an iPhone app.
- `node --import tsx ../links/verify-personal.mjs` and `node --import tsx ../links/verify-open-link.mjs`: the link site's personal invitation (`/i/<code>`) and open event link (`/r/<code>`) pages in headless Chrome, with every request intercepted.

The development-only “Preview the design” entry uses memory-only plans, has a persistent preview label and cannot send invitations. It disappears in production. Sample wellness data is labelled in every build. Authenticated paths call Supabase; an empty roster grants no data access.

### Mac build notes

On this Mac, select the installed Node 22 before running mobile commands:

```sh
export PATH="/opt/homebrew/opt/node@22/bin:$PATH"
```

Open Xcode once to accept its license and install required iOS components. Connect and unlock the iPhone, trust the Mac, and enable Developer Mode. Use `npx expo run:ios --device` from this directory. Keep the Mac and iPhone on the same network for the development bundle, and allow local network access if iOS asks.

`package.json` builds `expo-contacts` from source on iOS. The pinned 57.0.5 precompiled device framework crashed at launch because it linked `Testing.framework`, which is not embedded in the app. This uses [Expo's supported per-module source-build setting](https://docs.expo.dev/guides/prebuilt-expo-modules/). After changing this setting in an existing native project, run `pod install` in `ios` before rebuilding.

`app.json` also enables `expo-build-properties` → `ios.enableSceneSupport`. Xcode 27/iOS 27 requires the scene lifecycle; the default SDK 57 AppDelegate otherwise traps at launch. Keep this option when regenerating the native project.

## Before installing on a phone

1. Configure the Expo owner/project and add the development-client package if using that build profile. `eas.json` is a draft and no EAS account is linked.
2. Confirm the provisional identifier `com.resbite.preview`, connect the Apple team and build/sign on the available Mac or EAS. Expo 57's native prerequisites need checking against that Mac before the first build.
3. Configure Supabase Google OAuth, email confirmation, SMTP and allowed native redirect URLs. Both `resbite://auth/callback` and the recovery query variant must be allowed. Password/email confirmation cannot be called operational until exercised on-device.
4. Review the eight draft activity descriptions/categories before publishing them to the database. No published catalogue has been seeded yet.
5. Add approved testers later, per the user's decision. Never disable the roster requirement to work around setup.
6. Replace provisional `resbite://invite` links with owned HTTPS universal/app links before distribution. Current links require the app to be installed; installation fallback is not implemented.

## Current limits

Profile save, plan creation/editing/cancellation, invitation claim and RSVP have client integration and protected database operations. Editing is restricted to future active plans owned by the organizer. The plan screen keeps what was typed after an error, asks before discarding unsaved changes, and journals a create on the device so a lost reply is finished by reading first, never by creating twice; an edit that conflicts shows the newer details and asks for the change again, and the next Save goes against them. My resbites refreshes plans and RSVP responses on foreground/tab focus, preserves loaded details on a failed refresh, and offers retry. Superseded reads are cancelled and account changes clear cached results. Nothing unfinished is kept as a draft; the create journal holds one pending create per account and My resbites reconciles it on load. Completed preview plans remain memory-only and no invitations are sent.

Real end-to-end auth/share/RSVP remains untested. Date/time, keyboard, location and accessibility require device validation. Push dispatch, deletion/retention workflows and real-account recovery verification remain outstanding. SecureStore sessions are chunked and native device storage still needs validation. Draft content is bundled for design review only.

With Expo running, `node scripts/verify-planning.mjs` walks the plan screen (create from an idea and from scratch, the When and Where sheets, the discard sheet, video-call links, edit, the create journal after a lost reply and a failed journal write, focus and `aria-live` on a refused Create), preview cancel and foreground plan/RSVP refresh in Google Chrome. It intercepts all Supabase requests and never writes test accounts or plans to the live project. Set `RESBITE_QA_URL` or `RESBITE_QA_BROWSER` to override the local server/browser channel. The browser check does not certify native picker or keyboard behavior. In a git worktree whose `mobile/node_modules` is a symlink, Metro cannot resolve the lazily imported `expo-image-picker` and the cover buttons open no file chooser; add a temporary `mobile/mobile -> .` symlink (never commit it) or install in the worktree.

Profile → People & groups manages private device-local groups; Inviting is on the resbite page’s Invite screen (personal links and the event link); the people list is opened from the people row. Native contacts are read only after a button tap, with limited access support and manual-entry fallback. Sign-out removes groups and local link records but does not revoke previously shared links. `node scripts/verify-people.mjs` checks the browser group flow (create, edit, delete, de-duplication, no Choose people on the resbite page) with backend requests intercepted.

`node scripts/verify-invitations.mjs` checks the Invite screen with intercepted API fixtures: the contacts step, the event link under it (Share link, Copy link, Turn off this link, read once, no second title), someone else’s resbite, and 320 px with Larger Text. `node scripts/verify-contact-invites.mjs` walks inviting by personal link and the people list’s Invited group (Send again by the app used, Remove). Neither sends messages. Native Share and the real-account RSVP loop still require device verification.

`node scripts/verify-event.mjs` walks the resbite page with every Supabase request intercepted: the owner’s page (Invite, Edit, More; You’re hosting; the people row), More (the four rows, Mute this resbite and Unmute, the cancel question and `change_plan_v4`, a refused cancel kept in the sheet), a repeating resbite (Every Thursday, the two cancel choices), an ended one (· Ended, Do this again alone, no More, the people list without actions), one that is running, an admin (You’re an admin; Invite with the contacts and the event link; the invitations and requests, Approve; Edit’s new photo into the owner’s folder; Change my reply, Can’t go), a guest (Hosted by, You’re going and Change, an unanswered guest with the server’s counts from `plan_people_counts`), the people list (the groups, Make admin and its refusal, Remove as admin on a Maybe admin, Approve, Send again only for a code this phone holds, an app invitation’s Remove), the list’s edges (no plan, a failed read with Try again, Back with no history) and the idea page (Back over the image, Use idea). It asserts the names and arguments of the requests the app makes, and the selects of the plan, guest-list and mute reads. The admin’s photo step needs the cover chooser (the worktree note above). An admin who was Going and picks Can’t go (`withdrawn`) lands on the guest page.

RSVP checks current saved state before writes and after interrupted replies; competing changes require review. Accepted RSVPs for active plans that haven’t ended open a permanently labelled, fictional read-only sample conversation. Preview → Profile → Explore sample conversation is a separate design-review entry; it never creates a real RSVP. `node scripts/verify-rsvp.mjs` uses intercepted fixtures for recovery (the answer sheet’s Change, Retry my response), a cancelled resbite and sample access.

Profile → Notification settings reports delivery availability and native permission. This build does not request permission, register push endpoints or send notifications. Preview/browser review never reads native permission. `node scripts/verify-notifications.mjs` checks the preview flow; real push remains gated by the prerequisites in `../qa/notification-readiness.md`.

Profile supports optional system-selected photos, normalized/metadata-stripped JPEGs and private uploads with restart/retry recovery. Photo operation bytes are temporarily stored in the app’s private documents directory (browser QA uses sessionStorage); sign-out clears the pending operation and local bytes. Preview photos stay in memory. Remote orphan-file cleanup is still pending. Native selection requires rebuilding/installing after the new image-manipulator dependency: `cd ios && pod install`, then use the normal signed iOS build workflow.

`node scripts/verify-profile.mjs` checks profile/photo recovery and normalization with synthetic images and intercepted uploads. `node scripts/verify-session.mjs` checks successful and failed server sign-out without real accounts.

Sign-out blocks new local mutations and clears pending invitation/photo records. Nothing unfinished is kept as a draft; the create journal (one pending create per account) stays on sign-out and is cleared when the account is deleted. If server sign-out fails after the SDK clears the local session, a persistent notice reports that uncertainty. Profile → Your data & privacy explains the current behavior and unavailable account deletion.

See `../docs/implementation-status.md` for evidence and remaining milestones.


Account milestone developer QA: with Metro serving web, run `node scripts/verify-account.mjs`, `node scripts/verify-confirmation.mjs` and `node scripts/verify-auth.mjs`. Each intercepts backend requests; it must not use real account credentials. The first includes optional detail removal/lost replies, Google-style onboarding, approval gating and invitation restore failure/retry. Native owner acceptance and remaining work are recorded in [B0 evidence](../qa/b0-account-foundation.md).

Profile-photo updates now require the deployed avatar revision/RPC migration. Pending changes retain their original revision; conflicts offer Keep saved photo rather than overwriting another device. Photo/name writes stay bound to the initiating account. Removing a photo clears its profile reference; old bytes remain private until safe server cleanup is enabled, and the client sends no Storage DELETE. Old pending journals require discard/reselection. This update adds no native dependency. [24 September verification and device status](../qa/avatar-consistency-2026-09-24/README.md).
