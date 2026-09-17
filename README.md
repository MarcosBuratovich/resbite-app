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

## Before installing on a phone

1. Configure the Expo owner/project and add the development-client package if using that build profile. `eas.json` is a draft and no EAS account is linked.
2. Confirm the provisional identifier `com.resbite.preview`, connect the Apple team and build/sign on the available Mac or EAS. Expo 57's native prerequisites need checking against that Mac before the first build.
3. Configure Supabase Google OAuth, email confirmation, SMTP and allowed native redirect URLs. Both `resbite://auth/callback` and the recovery query variant must be allowed. Password/email confirmation cannot be called operational until exercised on-device.
4. Review the eight draft activity descriptions/categories before publishing them to the database. No published catalogue has been seeded yet.
5. Add approved testers later, per the user's decision. Never disable the roster requirement to work around setup.
6. Replace provisional `resbite://invite` links with owned HTTPS universal/app links before distribution. Current links require the app to be installed; installation fallback is not implemented.

## Current limits

Profile save, plan creation, cancellation, invitation claim and RSVP have client integration and protected database operations. Real end-to-end auth/share/RSVP remains untested. Date/time and location require device validation. Editing, contacts/groups, push dispatch, photo upload, sample chat, deletion/retention workflows and offline retry UX remain to implement. SecureStore sessions are chunked and native device storage still needs validation. Draft content is bundled for design review only.

See `../docs/implementation-status.md` for evidence and remaining milestones.
