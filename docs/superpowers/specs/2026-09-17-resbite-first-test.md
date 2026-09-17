# Resbite first iPhone test — development specification

Status: planning proposal, prepared from the owner's recorded choices. Selected product scope is fixed below; technical architecture and the explicitly proposed rules are recommendations for execution, not retrospective owner decisions. No app code, cloud resources or deployment has been created.

## Goal and evidence

The boss and another invited tester install Resbite on iPhones, register, discover a documented activity, arrange it, share an invitation and complete a real RSVP. Both see the same saved plan and response. The agency never implemented the app. A Mac and Apple Developer membership are available; no deadline is set.

Authority: [decision log](../../../knowledge-base/08-decisions.md), especially D16/Q01–Q17 and D17; [scope register](../../../knowledge-base/02-scope-register.md); [documented journeys](../../../knowledge-base/03-user-journeys-and-rules.md). New owner decisions override historical screens. This document specifies the first test, not the entire longer-term product.

## Fixed scope

- iPhone app, English, small invited tester group.
- Google sign-in and email/password registration with email confirmation. Accounts required for organizers and invitees; no guest RSVP.
- 8–12 documented activities with existing artwork; search and categories, activity detail.
- Date/time/place selection, saved plans, manually shared working invitation links, real accept/decline state.
- Contact import and reusable groups. Location, notifications and contact access requested in context.
- Notifications limited to invitations, RSVP and plan changes. Owner cancellation is a plan change. Owner cancels if unable to attend; no ownership transfer.
- Optional profile photo; no required photo step.
- Clearly labelled sample conversation after RSVP, and sample wellness time/category overview. No live messaging or real wellness calculation.
- Review brand inconsistencies before visual implementation; define tester data handling before real data enters the system.
- No marketplace, payments, subscriptions, child accounts, capacity limits/waitlist, extra discovery filters, similar-activity engine, suggestions form, special Household rules, QR connection flow or post-event extras. No in-app image generation. Missing illustration production belongs to later content work.

## Motion and complete UI states

Microanimations, launch/splash behaviour and loading feedback are required by owner D19. Follow the [motion specification](../../../knowledge-base/12-motion-and-interface-states.md) for native press/navigation feedback, context-aware loading, real-operation success/error transitions and Reduce Motion support. Motion is delivered alongside each flow, not after functional acceptance. The app and Edge Functions use TypeScript; PostgreSQL schema, RLS and transactional functions use SQL.

## Technical recommendation: React Native, Expo and Supabase

The owner now plans a future Android app and explicitly selected **Supabase instead of Firebase**. Recommend **React Native with Expo and TypeScript**, sharing screens, domain rules and data access across iOS/Android. Deliver iPhone first; Android packaging, permission behaviour and device QA form a later milestone. Shared code reduces duplication but does not eliminate platform-specific configuration or testing.

| Approach | Fit |
|---|---|
| React Native + Expo + Supabase — recommended | Shared TypeScript app, native device access and cross-platform motion; suits future Android |
| Swift/SwiftUI + Supabase | Excellent native iPhone integration, but Android requires a separate UI implementation |
| Flutter + Supabase | Also a valid shared mobile approach; historical Flutter mentions do not establish existing code |

Supabase provides Auth, PostgreSQL with Row Level Security (RLS), private Storage and TypeScript Edge Functions. Use transactional PostgreSQL functions for atomic plan/RSVP changes and an outbox for notifications. Use React Native Reanimated for microanimations and native-stack navigation; Expo modules for splash, location, contacts, image picking, sharing, haptics and notifications. No browser app or WebView shell is planned.

Use a pinned stable Expo SDK and compatible React Native/Reanimated versions; confirm the SDK's minimum iOS version against the boss's phone before setting the target. Development builds enable native integrations; a standalone release-like signed build validates launch and delivery. Mac and Apple membership are available. Local iOS builds run on that Mac; EAS cloud builds are optional, not a purchased dependency. The Linux planning workspace alone cannot sign/validate the iPhone app.

### Verified integration constraints

- Follow the [Supabase React Native Auth guide](https://supabase.com/docs/guides/auth/quickstarts/react-native) and [Google sign-in documentation](https://supabase.com/docs/guides/auth/social-login/auth-google). Keep both Google and email/password with confirmation. Store sessions through a reviewed secure-storage adapter; never ship service-role secrets.
- Configure explicit auth callback URLs, confirmation and password-reset routing using [native mobile deep linking](https://supabase.com/docs/guides/auth/native-mobile-deep-linking). Auth callbacks and event invitation links are separate routes. Confirmation/password-reset email delivery needs configured [custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp) for real testers; do not assume default mail delivery is ready for arbitrary addresses.
- Use HTTPS Universal Links for invitations on iPhone; configure Android App Links when adding Android. A small fallback page only helps invited testers install/reopen; it is not browser-based RSVP. No automatic post-install destination recovery is promised.
- Use [Expo notifications](https://docs.expo.dev/push-notifications/push-notifications-setup/) dispatched by a Supabase Edge Function/outbox worker. Supabase documents this [push pattern](https://supabase.com/docs/guides/functions/examples/push-notifications). iPhone transport uses APNs. Android push ordinarily uses FCM transport behind Expo; that is not Firebase Auth/database/storage. No Firebase backend is selected, and Android transport credentials are a future setup task, not provisioned now.
- Use a [development build](https://docs.expo.dev/develop/development-builds/introduction/) for native integrations, not Expo Go as acceptance evidence. Validate splash behaviour in a standalone [release build](https://docs.expo.dev/versions/latest/sdk/splash-screen/).
- Recommend registered-device development/Ad Hoc installation for the small initial test. TestFlight remains a distribution choice with review requirements; Google plus ordinary email/password must not be assumed to satisfy Apple's private-email alternative under guideline 4.8. Do not add another provider silently. See [Apple review guidelines](https://developer.apple.com/app-store/review/guidelines/) and [TestFlight](https://developer.apple.com/testflight/).

Project organization/region, SMTP sender, link domain, service credentials and billing owner still need setup before provisioning. No cloud project, paid service or domain has been created.

## Screen flow

| Screen / flow | Required behaviour | Error or recovery state |
|---|---|---|
| Welcome / access | Google button, email sign-in, create email account, reset password | Cancelled Google consent; invalid credentials; network failure; neutral reset response |
| Confirm email | Show confirmation instruction, resend, check status, sign out | Expired action link; not yet confirmed; retry throttled by service; retain invitation destination |
| Profile | Display name; optional photo from system picker | Skip/remove photo; failed upload leaves previous photo intact |
| Discover | 8–12 cards, title search and categories | No matches with clear-search action; catalogue unavailable |
| Activity detail | Approved description, illustration, practical information; arrange action | No broken image or placeholder copy |
| Arrange | Date/time, place, people/group, optional note, review, create | Invalid date, missing place, permission declined, failed save; no false success |
| Contacts / groups | Explicit contact selection; create/edit/delete own reusable groups | Limited/denied contact access; duplicate selections; manual sharing still works |
| My resbites | Upcoming owned/invited plans, real RSVP state | Empty state; stale/offline indicator; refresh from server |
| Invitation | Recover original destination after sign-in; accept/decline | Unknown, expired, claimed-by-other-account, cancelled or withdrawn invitation |
| Plan detail | Date/place, participants/RSVP; owner edit/cancel; attendee withdraw | Changed plan refreshed before action; non-owner controls absent and denied server-side |
| Sample chat | Visible after accepted RSVP; label “Sample conversation”; no working send control | No implication messages are sent/stored |
| Sample wellness | Label “Sample wellness data”; activity time/category illustration | Never derived from contacts, screen-time tracking or actual test attendance |
| Settings/account | Sign out; permission guidance; privacy/support text; delete account | Recent reauthentication when required; deletion pending/retry state |

Proposed navigation: Discover, My resbites, Wellness, Profile; groups live under Profile and attendee selection. This adapts the documented screens to the selected subset rather than copying every old tab. Confirm in the screen review, before styling all screens.

## Proposed operating rules

These resolve detail missing from the sources for a small test. They must be reviewed with this plan; they are not sourced feature claims.

**Account eligibility.** Server permits shared data only for authenticated, verified-email testers on a private test roster; enforce using trusted Auth identity/confirmation records, not client-editable profile metadata. No collection of date of birth, work/home address or phone number merely because old onboarding collected it. Require display name and the selected provider's identity; photo optional. Refresh server-validated verification state after confirmation. Keep an incoming invitation pending through registration/confirmation. Existing-email collisions must ask the user to authenticate the existing account; never merge users merely because client-provided emails match.

**Schedule.** One start date/time plus a place are required; no end date, recurrence or multi-day editor in the first test. Store a UTC instant and the chosen IANA time zone; show local time with zone when it differs. Creation requires a future start. Owner can edit time/place/note before start and cancel; after start, keep a read-only past view for test history. Owner cannot transfer ownership. Attendees can change response or withdraw before start. Cancellation is terminal. Editing does not erase RSVP; notify invitees to review changes. Server version checks prevent one edit overwriting another silently.

**Place.** Search or manually enter a place label/address; optional coordinates from map selection. Request when-in-use location only on “Use my location”; no background tracking, no stored location history. Decline still allows search/manual entry. Use a place-service adapter with an iOS-native map provider initially; isolate place search/geocoding so Android can supply its compatible implementation. Confirm the chosen package and provider during baseline setup; do not assume Expo Location supplies full place autocomplete.

**Contacts/groups.** Use only contacts the user explicitly grants and selects; support limited contact access. Do not upload the whole address book or discover accounts through phone/email enumeration. Groups are private to their owner, named collections of selected recipient references; no shared group administration or mandatory Household. Proposed pilot implementation keeps contact names/channels and group membership on the device, not in cloud sync. Selected registered participants can be represented by UID; otherwise a contact reference is used to prepare manual sharing. Group edits do not mutate existing event invitations. Group sync is not implied.

**Invitation identity.** One opaque invitation token per selected recipient slot, represented on the server by its hash. The manually shared link grants an eligible signed-in tester permission to claim that slot and then RSVP. When an intended verified email is explicitly known, enforce that binding; phone-only contacts use first-claim binding to one eligible tester UID. The latter is a bearer link until claimed and cannot prove the intended person's identity: explain this limitation in the owner flow and keep the test roster small. Never infer an authenticated user ID from a phone contact. Forwarding a claimed link to a different account must fail. A different invitee requires an owner-created new invitation. Revoke removed/cancelled slots; expire unclaimed links at the event start. Keep tokens out of logs and public page metadata. This first-claim proposal is a decision checkpoint before invitation implementation, not an approved public invitation policy.

**Sending versus notification.** The user sends invitation links through the iOS share sheet; the app does not send SMS/email invitation campaigns. Sharing does not prove delivery. Unregistered/unbound recipients cannot receive app push: their manual link is the first invitation. Once bound to a UID, invitation availability can generate an in-app/push event. RSVP updates notify the owner, time/place/cancellation changes notify bound invitees, and actor receives no duplicate notification. A declined push permission does not affect in-app plan/RSVP refresh. Push is best effort, never the source of truth. Use generic lock-screen text and resolve details after authentication.

**Photo.** Select an image through the system picker; no camera feature or blanket photo-library access. Proposed normalized export strips metadata, limits longest dimension to 1024 px and upload to 2 MB. Use private storage; only the owner and authorized event participants see the approved profile projection. No public avatar URLs.

**Sample features.** Bundle fictional conversation and wellness fixtures separately from real data. Never write them into participant collections. No composer that appears to send real messages; no real-time tracking. Their labels remain visible in screenshots and test sessions.

## Proposed data and access contract

| Record | Minimum contents | Access |
|---|---|---|
| Auth identity | Provider UID, email, verification state | Auth service; no password in public tables or logs |
| User | UID, display name, private avatar reference, created timestamp, deletion state | Owner; participant-safe projection omits email and contact details |
| Activity | Stable ID, reviewed title/description/category/tips/artwork source | Read by eligible testers; changed only by maintainer seed process |
| Resbite | Activity ID, owner UID, start/time zone, place, note, active/cancelled status, version | Owner and claimed invited participants only |
| Invitation | Event ID, token hash, optional recipient-email binding, claimed UID, expiry/revocation | Authenticated RPC validation only; no token-list reads from client |
| Attendee | Event/UID, pending/accepted/declined/withdrawn, server timestamps | Own response write through server; participant display projection |
| Device endpoint | UID, push token, platform, refreshed timestamp | Own registration through authenticated endpoint; delivery service read |
| Notification outbox | Event/revision/recipient/type idempotency key and delivery state | Server only |
| Group/contact references | Selected local contacts, local group name/membership | Device owner only; clear on sign-out/delete for this test |
| Sample chat/wellness | Fictional fixtures | App bundle only |

Trusted mutations use authenticated PostgreSQL RPC functions. Edge Functions verify user JWTs for user-facing requests and use separate authenticated worker credentials for scheduled jobs. Enable RLS on exposed tables; deny direct writes to plans, invitation tokens and outbox. Implement participant-safe projections with policies rather than exposing email-bearing profiles. Atomic RPCs must explicitly enforce `auth.uid()`, confirmed email, tester eligibility, ownership/membership and idempotency. If SECURITY DEFINER is necessary, fix `search_path`, qualify objects, restrict execute grants and repeat all authorization inside the function. Elevated service credentials bypass RLS and belong only in trusted backend jobs. Test cross-user reads and writes. See [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).

**Retention proposal:** keep test accounts/plans while participating; delete on request and perform a test-wide purge 30 days after the owner declares the evaluation finished. No automatic end date is invented. Delete profile/photo/endpoints and local groups on account deletion. Cancel owned future plans first; remove identifying attendee fields from other plans while preserving a neutral “Deleted participant” state. Queue cleanup so partial failures retry; block access immediately. Minimal operational logs expire after 30 days, contain no passwords/tokens/contact exports, and have restricted access. Provider backup retention is a configuration checkpoint before real testers; do not claim immediate erasure from backups. This is an engineering data proposal, not finished legal text. It must match the deployed services and in-app notice.

## Preparation and review checkpoints

1. Review [brand/content readiness](../../../knowledge-base/10-brand-and-content-readiness.md), choose coherent tokens and actual activity pairs; owner selected this review before visual work.
2. Confirm implementation recommendation and proposed rules, especially first-claim invitations, device-local groups and retention. No need to reopen already answered product questions.
3. On the available Mac: verify Xcode, target phone OS, signing team, registered tester devices and capabilities.
4. Set up Supabase project owner/region/billing, Google OAuth, SMTP, APNs/Expo credentials and HTTPS link domain. Use secure account setup rather than copying secrets into the knowledge base.
5. Resolve test distribution path; if TestFlight chosen, resolve the documented review constraints before submission.

## Done means

Two real iPhones pass the [acceptance script](../../../knowledge-base/11-first-test-acceptance.md); real invitations/RSVP, denied permissions and account recovery/deletion are tested. Sample areas remain labelled. All 8–12 published activities have reviewed copy and artwork. There are no silent offline writes or unauthorized plan reads. A signed install and reproducible build instructions exist. This is completion of an internal test build, not public-launch readiness.
