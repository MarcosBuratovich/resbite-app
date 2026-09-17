# Resbite implementation status — 17 September 2026

This is the first mobile foundation and visual review milestone. It is **not yet an installable, accepted two-person test release**. The agreed product scope is unchanged.

## Created and verified

- `mobile/`: React Native/Expo 57 + TypeScript, with pinned dependencies and lockfile; future Android shares this code. Branch `feat/resbite-foundation` in the nested mobile repository.
- Original Resbite illustrations exported to eight high-resolution activity images, with original-file hashes/source IDs and font licence files. Descriptions, tips and combined category assignments are explicitly editorial drafts, not approved source quotations.
- Welcome, login/registration/reset, profile, catalogue/search/category, activity detail, planning, plans, invitation/RSVP and labelled sample wellness screens.
- Reanimated press feedback, fades, native screen transitions, haptics, splash configuration, loading/error/empty/success states. Reduced motion removes button scaling and changes navigation to fades. Physical-device motion, font scaling and VoiceOver remain unverified.
- Development-only design preview stores temporary plans in memory and disables real invitations. Browser layout checks are development QA only; the deliverable remains a mobile app.
- Supabase project **Resbite**, organization **Good add Ventures**, London `eu-west-2`, ref `ewcsgvhuojxdpaspwsrx`. Creation-time tool estimate: 10/month; actual billing remains in the Supabase account.
- Applied `resbite_private_tester_foundation`: verified tester roster, restricted profiles/plans/attendees, hashed first-claim invitations, transactional RSVP and cancellation, version checks, notification outbox, private photo bucket.
- Database security/lifecycle assertions passed with synthetic users inside a rollback transaction. No synthetic or real testers were retained. Owner chose **leave tester access for later**; roster remains empty.
- TypeScript and seven domain/secure-storage tests pass; eight draft content/artwork pairs pass the manifest check.
- iOS JavaScript/Hermes export passes. This is not an Xcode compile, signed build or device test.
- UI review at 390 × 844 verified welcome/discovery/detail, search, required-place error, preview save and cancellation. Fixed an empty-string rendering warning found during review. No real messages were sent.

## Implementation still required

1. Plan editing UI and retry/reconciliation across app restarts; attendee refresh on foreground and conflict recovery.
2. Contact import, reusable device-local groups, notification permission/dispatch/endpoint cleanup, optional photo normalization/upload.
3. Labelled sample chat after accepted RSVP; deletion/retention jobs and associated account controls.
4. Owned HTTPS invitation and confirmation links, install fallback and cold-start routing tests. Current `resbite://invite` is provisional and requires an installed app. Pending invitations are retained securely through profile setup.
5. Finish visual/content review, canonical category taxonomy and catalogue publication. Eight drafted pairs are ready for review; the live database catalogue remains unpublished/empty.
6. Device accessibility, keyboard, date/time/timezone, denied-permission, reduced-motion and offline-path checks. Performance tuning after device measurement.

## External setup before real testing

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
