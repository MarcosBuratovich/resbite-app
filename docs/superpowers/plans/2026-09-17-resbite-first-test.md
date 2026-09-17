# Resbite First iPhone Test Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Work inline unless the owner explicitly selects delegation. This is a planning deliverable, not authorization to deploy or a claim that the proposed architecture has been approved.

**Goal:** Give the boss and another invited tester an installed iPhone app that completes a real activity-plan-invitation-RSVP loop.

**Architecture:** Recommended React Native/Expo app with Supabase Auth, PostgreSQL/RLS, Storage and Edge Functions. Shared plans and responses use authenticated server mutations and restricted reads; contact groups remain device-local in the proposed first-test design. Chat and wellness are visibly labelled bundled samples.

**Tech Stack:** TypeScript, React Native, Expo, Reanimated, native-stack navigation, Supabase Auth/PostgreSQL/RLS/Storage/Edge Functions, Expo notifications, HTTPS Universal Links; future Android App Links. SQL for migrations and transactional RPCs. Compatible dependency versions locked during baseline setup.

**Spec:** [First-test specification](../specs/2026-09-17-resbite-first-test.md). Read it with [owner decisions](../../../knowledge-base/08-decisions.md); the specification labels new recommendations separately from selected scope.

## Current execution status

Implementation was authorized by the owner after this plan. The initial mobile foundation and Supabase schema now exist; see [verified implementation status](../../implementation-status.md). The remaining unchecked device and integration acceptance criteria still apply. Original proposed interfaces below are planning references; deployed RPC contracts are documented in `supabase/README.md`.

## Motion requirement

Owner D19 requires a dynamic interface. Follow [motion and interface states](../../../knowledge-base/12-motion-and-interface-states.md). App and Edge Function code use **TypeScript**; database migrations, access policies and transactional RPCs use **SQL**. Each task includes relevant loading, empty, success, failure and reduced-motion states; a static screen alone is not an acceptable completion of a flow.

## Global constraints

- iPhone app, English, small invited tester group.
- Google sign-in and email/password registration with email confirmation. Accounts required for organizers and invitees; no guest RSVP.
- 8–12 documented activities with existing artwork; search and categories, activity detail.
- Clearly labelled sample conversation after RSVP, and sample wellness time/category overview. No live messaging or real wellness calculation.
- No marketplace, payments, subscriptions, child accounts, capacity limits/waitlist, extra discovery filters, similar-activity engine, suggestions form, special Household rules, QR connection flow or post-event extras. No in-app image generation.
- Preserve all original source files; import selected derivatives with provenance.
- No deadline set. Mac and Apple Developer membership confirmed available; signing access and project configuration still need verification.
- Commit coherent verified changes if implementation is in a writable Git repository; do not force commits through a read-only control directory.

## How to execute this plan

This plan covers one connected test product, organized into reviewable milestones. The build paths and interfaces below are proposed; none exists yet. Do not start UI implementation until the brand review and specification checkpoint pass. Do not open a new stack decision midway without recording the impact.

First review the specification's proposed rules: single-start schedule, first-claim invitations, device-local groups, data retention and registered-device distribution. Those choices narrow ambiguous source detail; the owner has not yet approved them individually. Complete reversible preparatory work first. Creating service accounts, spending or publishing requires the applicable authorization at execution time.

Detailed SDK integration should follow the linked current official documentation and the pinned versions, not copied legacy snippets. The test examples below describe the proposed pure-domain contracts, independently of SDKs. Tests are planned, not run during this planning task.

## Delivery milestones

| Milestone | Deliverable | Exit evidence |
|---|---|---|
| 0 — Content, brand and build prerequisites | Reviewed activity manifest, brand sheet, confirmed technical/distribution approach | Eight or more valid artwork/copy pairs; recorded decisions; blank signed shell runs on a test iPhone |
| 1 — Access and discovery | Both sign-in methods, verified-email gate, profile, catalogue/search/categories | Real account/confirmation/reset checks and isolated cross-user access tests |
| 2 — Real two-person loop | Create plan, claim invitation, accept/decline, edit/cancel | Same state observed on two phones; authorization and retry tests pass |
| 3 — Selected supporting features | Contact import/groups, permissions/push, optional photo, sample screens, deletion | Denied-permission paths and data lifecycle verified |
| 4 — Boss test package | Installable build, test notes and walkthrough | Entire acceptance script passes; remaining limitations disclosed |

No effort/date promises are attached. Re-estimate after milestone 0, when content gaps, build access and service setup are known. If time tightens, bring a concrete proposed scope cut to the owner; do not silently replace real RSVP with samples.

## Planned file layout

```text
app/                               Expo Router screens: auth, discover, plans, people, profile
src/domain/                        Shared TypeScript types, validation and pure state transitions
src/features/                      Feature components and hooks, including labelled sample screens
src/services/                      Supabase auth/RPC, secure session, links, place/permission adapters
src/design/                        Reviewed tokens, Reanimated motion and status components
assets/                            Reviewed artwork/fonts/licences and fictional sample fixtures
app.config.ts                      Identifiers, permissions, links and Expo config plugins
eas.json                           Optional development/preview build profiles; local builds allowed
supabase/config.toml               Local Supabase configuration
supabase/migrations/                SQL schema, RLS, storage policies, transactional RPCs and outbox
supabase/functions/                TypeScript push, cleanup and privileged service jobs
supabase/tests/database/            SQL policy and transaction tests
supabase/functions/tests/           Edge worker tests
src/__tests__/                     Domain, routing, component and permission-adapter tests
links/public/                      Private fallback plus iOS/Android domain-association files
content/activities.json            Reviewed 8–12-item catalogue
content/asset-provenance.json       Source and export mapping
content/brand-decisions.md          Reviewed tokens/fonts/icons
scripts/validate-content.mjs        Manifest/artwork checks
scripts/seed-test-content.mjs       Idempotent authenticated maintainer import
qa/                                Device results, install instructions and limitations
package.json                       Pinned dependencies and documented test/typecheck scripts
```

## Shared implementation contracts

Server RPCs require authenticated verified tester context; reject raw caller-supplied user IDs as authority. All mutation responses use server timestamps. Proposed typed payloads:

```ts
type RSVP = 'pending' | 'accepted' | 'declined' | 'withdrawn';
type Actor = { uid: string; verified: boolean; tester: boolean; verifiedEmail?: string };
type Plan = { id: string; ownerUid: string; startsAtMs: number;
  timeZone: string; status: 'active' | 'cancelled'; version: number };
type Invitation = { id: string; planId: string; tokenHash: string;
  intendedEmail?: string; claimedUid?: string; expiresAtMs: number; revoked: boolean };
// Pure functions throw domain errors with stable codes; SDK adapters map errors to UI.
// Tests consume these proposed signatures:
// requireTester(actor: Actor): void
// validateStart(startsAtMs: number, nowMs: number): void
// canReadPlan(actorUid: string, plan: Plan, participantUids: string[]): boolean
// claimInvitation(invite: Invitation, actor: Actor, nowMs: number): Invitation
// transitionRSVP(current: RSVP, next: RSVP, plan: Plan, nowMs: number): RSVP
// cancelPlan(plan: Plan, actor: Actor, expectedVersion: number): Plan
// notificationRecipients(actorUid: string, recipientUids: string[]): string[]
```

Proposed service-adapter contracts (camelCase here; map explicitly to SQL RPC names): `createPlan({requestId,activityId,startsAtMs,timeZone,place,note}) -> {planId,version}`; `updatePlan({requestId,planId,expectedVersion,patch}) -> {version}`; `cancelPlan({requestId,planId,expectedVersion}) -> {version}`; `createInvitation({requestId,planId,intendedEmail?}) -> {invitationId,url}`; `claimInvitation({token}) -> {planId,invitationId}`; `respond({requestId,planId,response}) -> {response,version}`; `registerDevice({token}) -> {ok}`; `deleteAccount({requestId}) -> {jobId}`. Place contains `label`, optional `address/latitude/longitude`; note is plain text. Field lengths and validation limits must be explicit in shared schemas before UI submission is wired.

Transactions deduplicate by actor/request ID, enforce ownership/membership and write notification outbox records in the same commit. A retried request returns its original result. Do not expose bearer tokens in general database reads.

## Task 0 — Close preparation and prove the build path

**Files:** Create `content/brand-decisions.md`, `content/activities.json`, `content/asset-provenance.json`, `scripts/validate-content.mjs`; then `app.config.ts`, `app/_layout.tsx`, `eas.json`, `qa/device-test-results.md`.

**Consumes:** [brand/content review](../../../knowledge-base/10-brand-and-content-readiness.md), actual Mac/device access, specification review.
**Produces:** Approved content/tokens and a signed empty app with the Expo configuration and development/preview profiles, before feature implementation.

- [ ] Match six inspected scene candidates and at least two more documented activity/artwork pairs. Verify dimensions/licences and remove copied placeholder descriptions.
- [ ] Record each source ID, page/artboard, exported asset and reviewed English copy; reject unmatched entries instead of generating filler.
- [ ] Validate count 8–12, unique IDs, nonempty title/description/category and every referenced artwork file; show specific offending IDs on failure.
- [ ] Review the proposed brand sheet and detailed specification; record changes and chosen technical/distribution path.
- [ ] Verify Mac Xcode/device OS, Apple team, registered phones and entitlements. Set minimum OS only after checking test devices.
- [ ] Create/run the empty signed app on a physical iPhone; record exact toolchain/dependency locks. Do not claim this passed from Linux.

Content assertion to implement in `scripts/validate-content.mjs`:

```js
import assert from 'node:assert/strict';
import fs from 'node:fs';
const rows = JSON.parse(fs.readFileSync('content/activities.json', 'utf8'));
assert(rows.length >= 8 && rows.length <= 12);
assert.equal(new Set(rows.map(x => x.id)).size, rows.length);
for (const x of rows) {
  for (const key of ['id', 'title', 'description', 'category', 'sourceId', 'artworkPath'])
    assert.equal(typeof x[key] === 'string' && x[key].trim().length > 0, true, `${x.id}: ${key}`);
  assert(fs.existsSync(x.artworkPath), `${x.id}: missing artwork`);
}
```

Run `node scripts/validate-content.mjs` from project root. Acceptance: eight complete pairs and the on-phone baseline; current six candidates alone do not pass.

### Task 0M — Establish native motion and launch components

**Files:** Create `src/design/motionPolicy.ts`, `src/design/AsyncActionButton.tsx`, `src/design/LoadingPlaceholder.tsx`, `src/design/InlineStatus.tsx`, `src/app/LaunchCoordinator.ts`, `src/app/LaunchView.tsx`, `src/__tests__/launchRouting.test.ts`, `src/__tests__/motionPolicy.test.ts`.

**Consumes:** Reviewed mark/tokens, React Native/Reanimated Reduce Motion preference, session-restoration result and pending invitation destination.
**Produces:** Reusable state-driven feedback components and nonblocking launch → destination routing, consumed by tasks 1–7.

- [ ] Define idle/loading/success/error/retry action states; test that only confirmed success can produce success feedback and repeated taps do not start a second pending action.
- [ ] Implement shared motion policy with short fades/static placeholders under Reduce Motion; use native navigation transitions.
- [ ] Match launch background to the first app frame and add a brief in-app mark reveal. Route as soon as session state is ready; never await a decorative animation to enable access.
- [ ] Test signed-out, restored session and pending invitation destinations; stalled restoration has retry/sign-out, and foregrounding does not replay launch branding.
- [ ] Review device recordings of press/navigation, loading-success, loading-error-retry and both motion settings before reuse across all screens.

Proposed policy fixture for `src/__tests__/motionPolicy.test.ts`:

```ts
import { expect, test } from 'vitest';
import { allowsSuccessFeedback } from '../design/motionPolicy';
test('only confirmed success produces success feedback', () => {
  expect(allowsSuccessFeedback('loading')).toBe(false);
  expect(allowsSuccessFeedback('failed')).toBe(false);
  expect(allowsSuccessFeedback('succeeded')).toBe(true);
});
```

`ActionPhase` is a TypeScript union in `src/design/motionPolicy.ts` with `idle`, `loading`, `succeeded`, `failed`; exported `allowsSuccessFeedback(phase: ActionPhase): boolean` is true only for `succeeded`. Progress state comes from the operation, not animation completion. Add routing tests with an injected session result and pending invitation ID; do not sleep to wait for animation timers in unit tests.

## SQL and server implementation boundary

Before task 1, define SQL migrations for profiles, private test roster, activities, plans, invitations, attendees, idempotency records, device endpoints and outbox. Use RLS for all exposed data and private Storage policies. RPCs such as `create_plan`, `update_plan`, `cancel_plan`, `claim_invitation` and `respond_to_invitation` check trusted `auth.uid()`, email confirmation, roster and ownership; transactionally mutate data and outbox. Edge workers handle push and cleanup outside request transactions. JWT verification and service secrets stay server-side. Do not trust caller-provided UID/role flags. Test SQL authorization itself, not only the pure TypeScript test doubles shown below.

## Task 1 — Trusted account boundary and both sign-in flows

**Files:** Create `src/domain/auth.ts`, `src/__tests__/auth.test.ts`, `supabase/migrations/202609170001_schema_rls.sql`, `supabase/tests/database/access.test.sql`, `src/services/authService.ts`, `src/features/auth/AccessView.tsx`, `src/features/auth/EmailRegistrationView.tsx`, `src/features/auth/ConfirmEmailView.tsx`, `src/features/auth/ResetPasswordView.tsx`, `src/__tests__/authRouting.test.ts`.

**Consumes:** Approved backend project/configuration and tester roster; `Actor` contract.
**Produces:** Verified session or explicit signed-out/unconfirmed state; private reads rejected for ineligible identities.

- [ ] Configure Supabase Auth confirmed-email/password and Google provider, SMTP sender and callback allowlist using official setup; keep secrets out of source files and chat.
- [ ] Write/run failing authorization tests for signed-out, unverified, non-roster and other-user data access.
- [ ] Implement registration → send confirmation → refresh verification → enter app; Google consent/cancellation; real password reset. Resume an invitation only after eligible access.
- [ ] Handle provider collisions through authenticated linking/recovery; do not merge by email string alone.
- [ ] Verify actual email delivery, expiry/resend and token refresh on device; run local RLS integration tests.

```ts
import { expect, test } from 'vitest';
import { requireTester } from '../domain/auth';
test('unverified account cannot enter shared data', () => {
  expect(() => requireTester({uid:'b',verified:false,tester:true})).toThrow('EMAIL_UNVERIFIED');
});
test('non-tester is denied', () => {
  expect(() => requireTester({uid:'b',verified:true,tester:false})).toThrow('NOT_A_TESTER');
});
```

## Task 2 — Reviewed catalogue and activity detail

**Files:** Create `src/domain/activity.ts`, `src/features/discover/DiscoverView.tsx`, `src/features/discover/ActivityDetailView.tsx`, `src/services/activityRepository.ts`, `src/__tests__/activitySearch.test.ts`, `scripts/seed-test-content.mjs`.

**Consumes:** Valid manifest; eligible session.
**Produces:** Stable activity IDs and selected activity used by planning flow.

- [ ] Implement local title search plus category intersection, clear filters and no-results state; do not add other filters.
- [ ] Implement reviewed detail copy/artwork and Arrange action.
- [ ] Seed server catalogue idempotently through maintainer tooling; clients cannot change activity definitions.
- [ ] Verify 8–12 records, category/search intersection, no-results reset, readable large text and image sizing.

Test fixture: two records with titles “Painting together”/“Cycling together” and distinct categories; query `PAINT` returns only painting, adding cycling's category returns none, clearing both returns two. Only use these examples in the test manifest if their final reviewed titles match task 0.

## Task 3 — Create, read, edit and cancel plans

**Files:** Create `src/domain/plans.ts`, `supabase/migrations/202609170003_plan_rpcs.sql`, `src/__tests__/plans.test.ts`, `supabase/tests/database/plans.test.sql`, `src/features/plans/ArrangeView.tsx`, `src/features/plans/PlanDetailView.tsx`, `src/features/plans/MyResbitesView.tsx`, `src/services/planRepository.ts`, `src/services/placeService.ts`.

**Consumes:** Activity ID, verified session; `createPlan/updatePlan/cancelPlan` contracts.
**Produces:** Server-backed owner plan and versioned edit/cancel state.

- [ ] Write failing past-date, missing-place, non-owner mutation, duplicate request and stale-version tests.
- [ ] Implement SQL transaction RPCs plus single-start/time-zone/place/note review and create; present failure rather than optimistic saved state.
- [ ] Integrate the native place adapter/manual place entry; request current location only on explicit action; test permission decline.
- [ ] Implement My resbites, detail, versioned owner edits and terminal cancellation; deny attendee edits server-side.
- [ ] Run two-session access tests before invitation access is added.

```ts
import { expect, test } from 'vitest';
import { validateStart, cancelPlan } from '../domain/plans';
test('past start is rejected', () => expect(() => validateStart(1000,2000)).toThrow('START_IN_PAST'));
test('attendee cannot cancel', () => expect(() => cancelPlan(
 {id:'p',ownerUid:'a',startsAtMs:4000,timeZone:'UTC',status:'active',version:1},
 {uid:'b',verified:true,tester:true},1)).toThrow('NOT_OWNER'));
```

## Task 4 — Real invitations and RSVP: first vertical slice

**Files:** Create `src/domain/invitations.ts`, `supabase/migrations/202609170004_invitation_rpcs.sql`, `src/__tests__/invitations.test.ts`, `supabase/tests/database/invitations.test.sql`, `src/app/invitationRouter.ts`, `src/features/plans/InvitationView.tsx`, `src/services/invitationService.ts`, `links/public/index.html`, `links/public/.well-known/apple-app-site-association`.

**Consumes:** Plan contract, eligible sessions, approved HTTPS link domain and claim/binding policy.
**Produces:** Working per-recipient link, claimed participant and accepted/declined/withdrawn state on both devices.

- [ ] Review the specification's bearer-link limitation and intended-email binding before implementing claim rules.
- [ ] Write failing claim-by-other-user, expiry, cancelled plan, direct token read and duplicate-RSVP tests.
- [ ] Implement hashed tokens, authenticated claim transaction and RSVP transitions with cancellation/version checks.
- [ ] Configure Universal Links and private fallback; preserve pending URL through sign-in/email confirmation. Use direct Universal Links; no deprecated dynamic-link service.
- [ ] Share using the system share sheet; distinguish link preparation from actual delivery.
- [ ] Run the two-phone create → share → sign-in → accept → organizer refresh loop before proceeding to polish.

```ts
import { expect, test } from 'vitest';
import { claimInvitation } from '../domain/invitations';
test('claimed invitation cannot change identity', () => {
 const invite={id:'i',planId:'p',tokenHash:'hash',claimedUid:'a',expiresAtMs:9000,revoked:false};
 expect(() => claimInvitation(invite,{uid:'b',verified:true,tester:true},1000)).toThrow('ALREADY_CLAIMED');
});
```

## Task 5 — Contacts and reusable groups

**Files:** Create `src/features/people/ContactPickerView.tsx`, `src/features/people/GroupEditorView.tsx`, `src/services/contactsService.ts`, `src/services/localGroupStore.ts`, `src/__tests__/groupSelection.test.ts`.

**Consumes:** Approved device-local group proposal; invitation slot creation from task 4.
**Produces:** Intentional recipient selection reusable across plans; no bulk account discovery.

- [ ] Implement contextual contact access, limited-selection support and explicit recipient checkboxes; no automatic invitations.
- [ ] Create/rename/edit/delete private groups and expand them into a plan's independent recipient selection.
- [ ] Deduplicate overlapping selections; handle contacts missing usable email/phone without fabricating identity.
- [ ] Keep groups/contacts local and separate per signed-in user; clear on sign-out/delete. If cloud group sync is desired, stop and amend the reviewed design.
- [ ] Test denied/revoked contacts, overlapping groups and editing a group without changing an already-created plan.

Acceptance fixture: groups `[A,B]` and `[B,C]` select `[A,B,C]` once; deleting the second group leaves existing event invitations unchanged. Permission denial still allows manual link sharing.

## Task 6 — Essential notifications

**Files:** Create `src/domain/notifications.ts`, `supabase/functions/deliver-notifications/index.ts`, `supabase/functions/tests/notifications.test.ts`, `src/__tests__/notifications.test.ts`, `src/services/pushService.ts`, `src/app/NotificationRouter.tsx`, `src/__tests__/pushRouting.test.ts`.

**Consumes:** Transactional outbox from plan/RSVP changes; APNs credentials configured securely; claimed participant UIDs.
**Produces:** Invitation/RSVP/change notifications with one logical identity per recipient/version/type.

- [ ] Add outbox writes to existing transactions; deduplicate delivery attempts and tolerate retry/failure.
- [ ] Register device endpoint after permission; remove binding on sign-out and prune invalid endpoints.
- [ ] Deliver via Supabase Edge worker → Expo Push → APNs; poll receipts, retry transient errors and remove invalid device tokens with generic private text; open authenticated plan detail on tap.
- [ ] Do not push to unbound contacts or claim successful delivery to a person who has not installed the app.
- [ ] Test denied push, foreground/background, offline recipient then reopen, and repeated server delivery attempts on physical devices.

```ts
import { expect, test } from 'vitest';
import { notificationRecipients } from '../domain/notifications';
test('deduplicates and excludes the actor', () => {
 expect(notificationRecipients('a',['a','b','b','c'])).toEqual(['b','c']);
});
```

## Task 7 — Profile photo, sample views and data lifecycle

**Files:** Create `src/features/profile/ProfileView.tsx`, `src/features/profile/DeleteAccountView.tsx`, `src/features/samples/SampleChatView.tsx`, `src/features/samples/SampleWellnessView.tsx`, `assets/samples/chat.json`, `assets/samples/wellness.json`, `supabase/migrations/202609170002_storage.sql`, `supabase/functions/delete-account/index.ts`, `supabase/functions/cleanup-account/index.ts`, `supabase/functions/tests/deletion.test.ts`, `supabase/tests/database/storage.test.sql`.

**Consumes:** Approved retention/privacy proposal and participant-safe profile access.
**Produces:** Optional private avatar, visibly sampled screens, reliable sign-out/deletion and matching data notice.

- [ ] Implement system photo picker, metadata-stripped export and private upload; skip/remove/failure leaves access usable.
- [ ] Render fictional sample conversation after accepted RSVP and wellness fixtures with permanent sample labels; omit live send action.
- [ ] Implement deletion request after reauthentication, immediate access block, owner-plan cancellation and retryable cleanup. Remove profile/photo/endpoints and identifying attendee projection; clear local data.
- [ ] Write actual tester data notice from deployed fields/services and approved retention; verify backup/log retention configuration matches it.
- [ ] Test photo authorization, sign-out account switch, partial deletion retry and prohibition on sample data entering real collections.

Deletion integration case: owner A with future plan P, invitee B and photo X requests deletion twice. P is cancelled once; A cannot authenticate to protected data; X and endpoint records disappear; B sees a neutral removed identity; retry does not create extra notifications or fail permanently on already-deleted records.

## Task 8 — Device acceptance and delivery

**Files:** Update `qa/device-test-results.md`; create `qa/build-and-install.md` and `qa/known-limitations.md`.

**Consumes:** Completed previous tasks, signed distribution configuration.
**Produces:** Installable first-test build and documented evidence.

- [ ] Run content validator, backend domain/local Supabase tests and iOS tests with pinned dependencies.
- [ ] Execute every scenario in [the acceptance script](../../../knowledge-base/11-first-test-acceptance.md) on two physical phones; record failures and fix before completion.
- [ ] Check permissions on first-run and after denial/revocation, actual email delivery, Universal Links and APNs; simulator-only results do not substitute.
- [ ] Run motion acceptance in normal and Reduce Motion modes: cold/warm launch, rapid taps, interrupted requests, slow/error/retry states, large text and VoiceOver. Profile scrolling/transitions on the oldest test device and record short videos.
- [ ] Package the selected signed distribution, install on boss's registered device and a second tester device. If switching to TestFlight, first resolve guideline/distribution constraints from the specification.
- [ ] Record commit/build identifier, exact Xcode/device OS, setup steps, sample-screen limitation and support contact; demonstrate the real RSVP loop.

## Verification commands to establish during task 0/1

Create root scripts `typecheck`, `test:domain` (Vitest), `test:mobile` (Jest/React Native Testing Library), and `test:integration` (local Auth/RPC/API tests). Use a local Supabase CLI stack for destructive tests, never live tester data. Keep Edge tests in Deno's test runner and RLS/transaction tests in pgTAP.

```sh
node scripts/validate-content.mjs
npm run typecheck
npm run test:domain
npm run test:mobile
supabase start
supabase test db
npm run test:integration
deno test supabase/functions/tests
npx expo-doctor
```

Run native development builds on Mac with `npx expo run:ios --device`; package an independently launchable signed preview/release build for the boss using local tooling or approved EAS configuration. Expo Go is not push/splash acceptance evidence. Scripts and app files are planned, not created; do not report them as executed now. On the later Android milestone add an installable test APK and Android device verification rather than assuming a successful iPhone build proves parity.

## Coverage review

| Owner decision | Implementing tasks |
|---|---|
| iPhone / English / real tester goal | 0, 4, 8 |
| Google plus confirmed email/password; no guests | 1, 4 |
| 8–12 existing-art activities, search/categories | 0, 2 |
| Arrange real plans, invitations/RSVP, owner cancellation | 3, 4 |
| Location / contacts / groups / notifications | 3, 5, 6 |
| Optional profile photo | 7 |
| Sample chat and wellness | 7 |
| Data/visibility/deletion rules before testing | Specification review, 1, 7, 8 |
| Brand inconsistencies before visuals | 0; brand/content readiness document |
| Proceed despite old unavailable files | No task depends on encrypted deck or old recording |
| No fixed date | Milestone exits instead of calendar commitments |
| Future Android; Supabase backend | Shared TypeScript architecture now; separate later Android build/QA milestone |
| Microanimations, splash, loading and accessible motion | 0M, integrated through 1–7, device verification in 8 |

Plan self-review: selected scope has a task; externally required setup is separated from completed work; domain signatures are defined; content shortfall and distribution constraints remain visible; no app implementation or remote provisioning occurred during planning.
