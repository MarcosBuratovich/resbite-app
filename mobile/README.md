# Resbite mobile foundation

React Native + Expo 57 + TypeScript, with Supabase. This is an initial implementation, not a tester-ready release. iPhone first; Android uses the same app code. No Firebase service is used.

## Run locally

Use Node 22.13+ and `npm ci`. Copy `.env.example` to `.env.local` and use the project's public URL/publishable key. Never put a service-role key in this app.

- `npm start`: Expo development server.
- `npm run ios`: open the iOS target (requires the Mac/iOS environment).
- `npm run web`: developer-only layout review. This is not the deliverable mobile app.
- `npm run check`: TypeScript, domain/session-storage tests and content-manifest validation.
- `npx expo export --platform ios --output-dir dist-ios`: checks the iOS JavaScript bundle; does not compile/sign an iPhone app.

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

Profile save, plan creation/editing/cancellation, invitation claim and RSVP have client integration and protected database operations. Editing is restricted to future active plans owned by the organizer. The editor preserves drafts after errors, protects unsaved navigation, retries unconfirmed saves with the same payload and requires review on version conflicts. My resbites refreshes plans and RSVP responses on foreground/tab focus, preserves loaded details on a failed refresh, and offers retry. Superseded reads are cancelled and account changes clear cached results. Drafts are stored securely on-device per account, appear in My resbites, and retain unconfirmed requests for read-before-retry recovery. Preview drafts have a separate bucket; completed preview plans remain memory-only and no invitations are sent.

Real end-to-end auth/share/RSVP remains untested. Date/time, keyboard, location and accessibility require device validation. Push dispatch, deletion/retention workflows and real-account recovery verification remain outstanding. SecureStore sessions are chunked and native device storage still needs validation. Draft content is bundled for design review only.

With Expo running, `node scripts/verify-planning.mjs` exercises preview create/edit/cancel and reload/draft recovery, mocked lost replies/network/conflict recovery and foreground plan/RSVP refresh in Google Chrome. It intercepts all Supabase requests and never writes test accounts or plans to the live project. Set `RESBITE_QA_URL` or `RESBITE_QA_BROWSER` to override the local server/browser channel. The browser check does not certify native picker or keyboard behavior.

Profile → People & groups manages private device-local groups; My resbites → Choose people saves independent plan selections. Native contacts are read only after a button tap, with limited access support and manual-entry fallback. These selections are local checklists and do not send invitations. Review invitations prepares separate per-person or manual links with durable retry and revocation; sharing requires an explicit action. Sign-out removes groups, selections and local link records but does not revoke previously shared links. `node scripts/verify-people.mjs` checks the browser group/selection flow with backend requests intercepted.

`node scripts/verify-invitations.mjs` checks invitation journaling, interrupted preparation/revocation, reload recovery and navigation guards using intercepted API fixtures and mocked sharing. It sends no messages. Native Share and the real-account RSVP loop still require device verification.

RSVP checks current saved state before writes and after interrupted replies; competing changes require review. Accepted RSVPs for future active plans open a permanently labelled, fictional read-only sample conversation. Preview → Profile → Explore sample conversation is a separate design-review entry; it never creates a real RSVP. `node scripts/verify-rsvp.mjs` uses intercepted fixtures for recovery and sample access.

Profile → Notification settings reports delivery availability and native permission. This build does not request permission, register push endpoints or send notifications. Preview/browser review never reads native permission. `node scripts/verify-notifications.mjs` checks the preview flow; real push remains gated by the prerequisites in `../qa/notification-readiness.md`.

Profile supports optional system-selected photos, normalized/metadata-stripped JPEGs and private uploads with restart/retry recovery. Photo operation bytes are temporarily stored in the app’s private documents directory (browser QA uses sessionStorage); sign-out clears the pending operation and local bytes. Preview photos stay in memory. Remote orphan-file cleanup is still pending. Native selection requires rebuilding/installing after the new image-manipulator dependency: `cd ios && pod install`, then use the normal signed iOS build workflow.

`node scripts/verify-profile.mjs` checks profile/photo recovery and normalization with synthetic images and intercepted uploads. `node scripts/verify-session.mjs` checks successful and failed server sign-out without real accounts.

Sign-out blocks new local mutations and clears pending invitation/photo records. Plan drafts remain account-local for later recovery. If server sign-out fails after the SDK clears the local session, a persistent notice reports that uncertainty. Profile → Your data & privacy explains the current behavior and unavailable account deletion.

See `../docs/implementation-status.md` for evidence and remaining milestones.


Account milestone developer QA: with Metro serving web, run `node scripts/verify-account.mjs`, `node scripts/verify-confirmation.mjs` and `node scripts/verify-auth.mjs`. Each intercepts backend requests; it must not use real account credentials. The first includes optional detail removal/lost replies, Google-style onboarding, approval gating and invitation restore failure/retry. Native owner acceptance and remaining work are recorded in [B0 evidence](../qa/b0-account-foundation.md).

Profile-photo updates now require the deployed avatar revision/RPC migration. Pending changes retain their original revision; conflicts offer Keep saved photo rather than overwriting another device. Photo/name writes stay bound to the initiating account. Removing a photo clears its profile reference; old bytes remain private until safe server cleanup is enabled, and the client sends no Storage DELETE. Old pending journals require discard/reselection. This update adds no native dependency. [24 September verification and device status](../qa/avatar-consistency-2026-09-24/README.md).
