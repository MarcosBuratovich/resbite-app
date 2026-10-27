# Push Notifications (Plan 4 of 4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resbite sends push notifications for the spec's six events. The phone asks once, behind a short card. Tapping a notification opens the event. Everything can go live on the hosted project without the account-deletion lifecycle.

**Architecture:** The delivery machinery already exists but was never applied to hosted. It is spread across four local-only migrations:
- `20260918001308_notification_delivery_preparation` and `20261014130000_ux2_notification_wording` (the ledger, claim, validate and finish functions, `register_device`/`unregister_device`, and `expanded_at`);
- `20261015130000_ux3_note_delivery`;
- `20261022120001_gi2_local_delivery_and_deletion`, which mixes eligibility with the deletion lifecycle.

The machinery itself is: the outbox → `claim_notification_deliveries` → the `deliver-notifications` Edge Function → the Expo push API.

This plan gathers every push piece into **one new hosted-compatible migration**, which also widens eligibility to phone-only accounts. It is written so it also applies cleanly on top of the old local files in full mode. The deletion lifecycle stays local-only and untouched.

The app does four things:
- wires the prepared `pushRegistration` helper to `expo-notifications`;
- turns the UX3 "Get reminders?" sheet into the single notification ask;
- shows the real state in Notification settings;
- routes taps to the event.

**Tech Stack:** Supabase Postgres, Deno Edge Function (`supabase/functions/deliver-notifications`, `_shared/notification-*`), Expo SDK 57 (`expo-notifications` 57.0.19, already installed), expo-router, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-27-contact-invitations-design.md`, CI-D11, CI-P13, and the "Notifications" section. UX2-D4 governs wording. Plans 1–3 are merged on `main`. Plan 3's runbook (`qa/open-link-approval-2026-10-29/README.md`, "Open items" 8–10) lists this plan's inputs.

## Global Constraints

- **Branch:** `push-notifications`, taken from `main` (`ffc876f`).
- **No external side effects.** Nothing touches hosted, the dashboard, Vercel, EAS, TestFlight, Apple, or Expo's push service. Owner steps go in Task 8's runbook, which is not run.
- **The new migration:** `supabase/migrations/20261030120000_push_delivery.sql`. It must apply in two modes:
  - **Hosted-baseline:** after `migrations.txt` plus `20261027120000_phone_accounts.sql`, `20261028120000_contact_invitations.sql` and `20261029120000_open_link_approval.sql`, where none of the push objects exist.
  - **Full mode:** after every local file, where they already exist. Use `create table if not exists`, `add column if not exists`, `create or replace function`, guarded constraint and index creation, and explicit revoke-then-grant on every function.
  - Both modes must end with the same definitions. Task 1's test checks the table structure, the part that can differ.
  - **Deletion objects are out of scope.** The migration must not create or redefine any of them: `request_account_deletion`, `prepare_deletion_intent`, `account_deletion_jobs`, or `eligible()`.
- **SQL house pattern:** as in plans 2–3:
  - `private` SECURITY DEFINER functions with `set search_path=''`;
  - `public` SECURITY INVOKER façades;
  - revoke before grant;
  - service-role-only functions for the worker;
  - errors `42501` and `22023`.
- **Wording (UX2-D4):** the event title is the push title. The body says what happened and who. It never includes the place, notes, descriptions or phone numbers. Bodies are in `supabase/functions/_shared/notification-copy.ts`.
- **App switch:** `EXPO_PUBLIC_PUSH_ENABLED` (`"true"` turns it on; unset means off). It gates token registration and the "on" claims in Notification settings. Tests and Expo web QA run with it unset, except where a test sets it explicitly. Never create `mobile/.env.local`.
- **Expo docs:** read the versioned docs before writing app code: https://docs.expo.dev/versions/v57.0.0/sdk/notifications/ and the push setup guide (`mobile/AGENTS.md`).
- **The sender's release switch** (`DELIVERY_RELEASE_APPROVED = false` in `supabase/functions/deliver-notifications/index.ts`) stays false. The owner flips it at release (runbook).
- **Commands:**
  - SQL, both modes: `./scripts/test-database-docker.sh [--hosted-baseline supabase/migrations/20261027120000_phone_accounts.sql supabase/migrations/20261028120000_contact_invitations.sql supabase/migrations/20261029120000_open_link_approval.sql supabase/migrations/20261030120000_push_delivery.sql]`
  - Worker tests: `node --import ./mobile/node_modules/tsx/dist/loader.mjs --test supabase/functions/_shared/*.test.ts`
  - App: `cd mobile && npm run check`
  - Browser: Expo web on 8081 with the QA env (see plan 3), every `*.supabase.co` request intercepted, server stopped by exact PID (child too). Use `fillSettled` (`mobile/scripts/qa-helpers.mjs`) for typing right after a step change.

## Review Focus

1. **Two accounts on one phone.** After one person signs out and another signs in, pushes for the first account must stop and the second must get theirs:
   - `beforeSignOut` unregisters;
   - `register_device` rebinds the token;
   - claims suppress ledger rows whose endpoint was rebound.

   Pinned in Task 1 (SQL rebinding) and Task 4 (sign-out, then sign-in, gives unregister then register for the right accounts).
2. **A request decided before the push goes out.** The host must not get "Sam asked to join" for a request they've already approved or declined. A guest who changed their answer is still notified once. Pinned in Task 1.
3. **Phone-only accounts get their notices.** That covers `join_approved` to a phone-only guest and `invited` to a phone-only member. Banned, deleting and disabled accounts get nothing. Pinned in Task 1.
4. **A tap on a notification for an event the person can no longer see** (removed, declined, cancelled and gone) lands on My resbites with "That resbite isn’t available any more.", never a blank event page. Pinned in Task 6.
5. **Notifications never reveal a place, a note or a phone number,** including the three new kinds and a missing actor name (the fold case). Pinned in Task 3.

---

### Task 1: One hosted-compatible push migration

**Files:**
- Create: `supabase/migrations/20261030120000_push_delivery.sql` and `supabase/tests/push-delivery.sql`.
- Modify: `supabase/tests/hosted-baseline/tests.txt`.

**Interfaces (Produces):**
- **Final state in both modes**, matching the latest local definitions unless this list changes them:
  - `private.notification_deliveries` (the ledger);
  - `private.notification_outbox.expanded_at`;
  - `private.register_device` (the token regex body) and `public.register_device`;
  - `public.unregister_device`;
  - `private.claim_notification_deliveries` (the `20261014130000` body), `validate_notification_delivery` and `finish_notification_delivery`, with their public service-role façades and grants as in `20260918001308`.
- **`private.notification_recipient_eligible(o private.notification_outbox, recipient uuid) returns boolean`.** Keep the existing signature (check `20261022120001` for it). It's true when all of these hold:
  - `private.user_eligible(recipient)`, which already covers phone-confirmed accounts, a live grant or roster, not banned and not anonymous;
  - `not private.deletion_pending(recipient)`;
  - the recipient is the plan's owner, or an attendee whose response fits the kind (as today: `plan_changed` and `guest_note` only for `accepted`, `maybe` and `pending`);
  - `o.created_at > now() - interval '24 hours'`;
  - for `kind='join_request'`, a `private.join_requests` row for `(o.plan_id, o.actor_id)` with status `waiting`.
- **Redefined `private.fold_web_account`** (latest body in `20261029120000_open_link_approval.sql`). It adds one step: undelivered outbox rows (`delivered_at is null`) whose `actor_id = p_from` move to `p_into`, before `p_from`'s profile is deleted. Grants are unchanged.
- **Kinds:** the outbox kind check stays plan 3's. No new kinds.

- [ ] **Step 1: Write failing tests** in `push-delivery.sql`, modelled on `supabase/tests/notifications.sql` and `open-link-approval.sql`. Add it to `tests.txt`.
  - **Eligibility:**
    - A phone-only guest with a live `approval` grant gets a ledger row for `join_approved`.
    - A phone-only member gets one for `invited`.
    - Banned, deleting and roster-disabled recipients don't, and neither does a notice older than 24 hours.
    - `plan_changed` skips a `declined` attendee.
  - **`join_request`:**
    - A waiting request's notice expands to the host's endpoint.
    - After `decide_join_request` (either way), the claim marks the leased or pending ledger row `suppressed`, and a new claim sends nothing (Review Focus 2).
  - **Devices:**
    - `register_device` by user A, then by user B with the same token, rebinds it. A's pending ledger row for that endpoint becomes `suppressed` (Review Focus 1).
    - `unregister_device` removes only the caller's token.
    - anon has no execute on either function.
  - **Fold:** a web account's undelivered `join_request` notice has `actor_id = p_into` after the fold, and the claim returns the app account's name as `actor_name`.
  - **Worker functions:** `claim`, `validate` and `finish` are executable by `service_role` only.
  - **Same structure in both modes:** functions are replaced from this file in both modes, but the ledger table, its indexes and constraints, and `expanded_at` come from the old local file in full mode. The test compares their columns (name, type, nullability, default), constraint definitions and index definitions with constants, so a mismatch fails one mode.
- [ ] **Step 2: Run** both modes. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** both modes. Expected: `PASS: push-delivery.sql` in each. Existing `notifications.sql` and `gi2.sql` still pass in full mode.
- [ ] **Step 5: Commit:** "Gather push delivery into one hosted-ready migration and widen it to phone accounts".

### Task 2: Rollback and hosted rehearsal

**Files:**
- Create: `supabase/rollback/20261030120000_push_delivery.rollback.sql`.
- Create: `supabase/tests/hosted-baseline/20261030120000_push_delivery.before.sql` and `.after.sql`.

**Interfaces:** the rollback is for hosted, where this migration created the push objects. It must:
- drop the ledger and every push function the migration created, by exact signature;
- drop `expanded_at`;
- restore `register_device`'s foundation body and its grants verbatim;
- restore `fold_web_account`'s plan 3 body verbatim.

Its header says:
- registered devices stay;
- undelivered notices stay in the outbox;
- it runs before the open-link rollback.

It starts with a guard that refuses to run unless `private.join_requests` exists, as plan 3's does.

The rehearsal is the plan 3 model: a whole-schema fingerprint before, the exact added/changed sets after, and an exact restore after the rollback. A data check confirms a registered device survives the rollback.

- [ ] **Step 1:** Write the rehearsal, then the rollback. Run hosted-baseline mode with all four candidates. Expected: it applies, and the rehearsal passes.
- [ ] **Step 2: Commit:** "Add the push delivery rollback and its rehearsal".

### Task 3: The sender's wording and schedule

**Files:**
- Modify: `supabase/functions/_shared/notification-copy.ts` and `notification-copy.test.ts`, `supabase/functions/deliver-notifications/README.md`.
- Create: `supabase/ops/schedule-deliver-notifications.sql`. This is an owner-run script, not a migration.

**Interfaces:**
- Copy, with the title always the event title:
  - `invited` → "{name} invited you."
  - `join_request` → "{name} asked to join."
  - `join_approved` → "{name} approved your request."
- A missing name uses the copy's existing fallback for other kinds. If there is none, add `"Someone"` for every kind and test it.
- The schedule script runs once, with the owner's approval, in the hosted SQL editor. It:
  - enables `pg_cron` and `pg_net` if absent;
  - reads the function URL and `NOTIFICATION_WORKER_SECRET` from Vault secrets named `deliver_notifications_url` and `deliver_notifications_secret`, which the owner creates first;
  - schedules `deliver-notifications` every minute as a `net.http_post` with `Authorization: Bearer <secret>` and a 10s timeout;
  - can be unscheduled with `cron.unschedule('deliver-notifications')`, which the script shows.
- README: deploy with `verify_jwt = false`; the secrets `NOTIFICATION_WORKER_SECRET`, `EXPO_ACCESS_TOKEN` and `NOTIFICATION_DELIVERY_ENABLED`; the release constant; and the schedule script.

- [ ] **Step 1:** Write failing copy tests:
  - each new kind's exact body and title;
  - none of the bodies contains `place`, `note`, `description` or a digit run of 4 or more, using fixtures that carry those fields (Review Focus 5);
  - the missing-name case.
- [ ] **Step 2:** Implement. Run the worker tests.
- [ ] **Step 3: Commit:** "Word the invitation and request notifications, and add the sender's schedule script".

### Task 4: Registering the device

**Files:**
- Create: `mobile/src/services/pushDevice.ts` and `pushDevice.test.ts`. Add the test to the test chain.
- Modify:
  - `mobile/src/services/pushRegistration.ts`: drop "Preparation only".
  - `mobile/src/state/AppState.tsx`, or a small `mobile/src/state/usePushRegistration.ts` used by it.
  - `mobile/app.json`: only what the v57 docs require for remote push on iOS.
  - `mobile/.env.example`: `EXPO_PUBLIC_PUSH_ENABLED`.

**Interfaces:**
- **`createPushDeviceAdapter(deps): PushRegistrationAdapter`** in `pushDevice.ts`:
  - The journal lives in `expo-secure-store`, through the existing secure storage helper.
  - `readPermission` maps `getPermissionsAsync`.
  - `readToken` is `getExpoPushTokenAsync({ projectId })`, with the project id from `expo-constants` (`expoConfig.extra.eas.projectId`).
  - `register` calls `register_device(p_token, p_platform)`, bound to the captured session as the type demands.
  - `unregister` calls `unregister_device(p_token)`.
  - Check the exact RPC argument names in the migration.
- **`pushEnabled(): boolean`:** `process.env.EXPO_PUBLIC_PUSH_ENABLED === "true"`.
- **Wiring:**
  - A single `createPushRegistration(adapter, pushEnabled())` instance.
  - `update({account, preview})` runs on every session change, and `reconcile()` after sign-in, on app foreground and after the permission changes.
  - `signOut` awaits `beforeSignOut()` before `auth.signOut()`.
  - Account switching follows the same order.
  - Web and preview never register.

- [ ] **Step 1:** Write failing tests with a fake `expo-notifications`, fake secure storage and a fake RPC:
  - permission granted gives `register(account, token, "ios")`;
  - denied registers nothing;
  - sign-out gives `unregister` before the sign-out call;
  - signing out A then in as B gives unregister A, then register B (Review Focus 1);
  - an offline unregister keeps the journal and retries on the next reconcile;
  - `pushEnabled()` false registers nothing.
- [ ] **Step 2:** Implement. Run `npm run check`. Run `npx expo config --type introspect` (or the docs' equivalent) and confirm the iOS entitlement the docs require appears.
- [ ] **Step 3: Commit:** "Register this phone for push when notifications are allowed".

### Task 5: The ask, and Notification settings

**Files:**
- Modify:
  - `mobile/src/design/EventDeviceChips.tsx`: the sheet becomes `NotificationAsk`, in its own file `mobile/src/design/NotificationAsk.tsx` if that's cleaner.
  - `mobile/src/state/useEventDevice.ts`.
  - `mobile/src/domain/eventDevice.ts`.
  - `mobile/app/(tabs)/plans.tsx`: after `created=1`, and after an answer from an Invitations row.
  - `mobile/app/notifications.tsx`.
  - `mobile/src/domain/notifications.ts` and its tests.
  - `mobile/src/services/reminderPrefsStore.ts`, if the asked flag needs a rename.

**Interfaces:**
- **One ask.** The device-local `asked` flag the reminders sheet already uses is the single flag. The ask shows when all of these hold: permission is `undetermined`, the flag isn't set, and the moment has come. Any of these is the moment:
  - the organizer on an event page, or after creating an event (My resbites with `created=1`);
  - a person who just answered Going or Maybe, on the event page or from an Invitations row.

  Showing the ask sets the flag. "Not now" never blocks anything.
- **Copy** (`mobile/src/domain/notifications.ts`), replacing the reminders sheet's:
  - title "Get notified?";
  - body "Resbite can tell you when people answer or ask to join, when a resbite changes or gets a note, and before it starts.";
  - buttons "Turn on notifications" and "Not now".

  "Turn on notifications" requests the permission (the existing `askForReminders` path), then calls `reconcile()`.
- **Notification settings:**
  - The "Updates from organizers" card becomes "Updates", with a chip that shows the real state:
    - `pushEnabled()` false → "Not active yet" (unchanged);
    - permission granted and registered → "On";
    - permission denied → "Off in Settings", with the Settings button;
    - undetermined → "Not asked yet", with "Turn on notifications".
  - The info sheet lists the six events in the spec's words.
  - `notificationDelivery.enabled` follows `pushEnabled()`.

- [ ] **Step 1:** Write failing domain tests:
  - the ask moment for each case (owner, created, Going, Maybe, not Can't go, flag set, permission decided);
  - the chip for each state.
- [ ] **Step 2:** Implement. Run `npm run check`.
- [ ] **Step 3: Commit:** "Ask once for notifications and show their real state in settings".

### Task 6: Opening the event from a notification

**Files:**
- Create: `mobile/src/state/usePushRouting.ts` and `mobile/src/domain/pushRoute.ts`, with a test. Wire them into `mobile/app/_layout.tsx` next to `useDeviceReminders`.
- Modify: `mobile/src/services/deviceReminders.ts`: the foreground handler also shows `data.type === "plan_update"` pushes. Reminders are unchanged.

**Interfaces:**
- **`pushDestination(result: string | null): { pathname: "/event"; params: { plan: string } } | { pathname: "/plans"; params: { notice: "gone" } }`** in `pushRoute.ts`.
- **`usePushRouting()`** handles both taps while running (`addNotificationResponseReceivedListener`) and the cold-start tap (`getLastNotificationResponseAsync`, handled once). It:
  - waits until the session and account have settled;
  - calls `resolveNotificationTarget` with a `readAuthorizedPlan` that reads `plans` by id as the signed-in user;
  - routes with `pushDestination`.
- **Ignored taps:** a tap while signed out, or in preview, is ignored. Reminder taps keep their own path.
- **"Gone" notice:** My resbites shows `notice=gone` as the note "That resbite isn’t available any more." Use the existing notice mechanism, if any, and put the copy in `inviteCopy.ts` or `notifications.ts`.

- [ ] **Step 1:** Write failing tests:
  - a readable plan goes to `/event`;
  - an unreadable one (null), a malformed payload and a reminder payload: unreadable and malformed go to `/plans` with `notice=gone`, and a reminder is not a push (Review Focus 4);
  - a cold-start response is handled once.
- [ ] **Step 2:** Implement. Run `npm run check`.
- [ ] **Step 3: Commit:** "Open the event when a notification is tapped".

### Task 7: Browser checks and captures

**Files:**
- Modify: `mobile/scripts/verify-notifications.mjs`, `verify-event.mjs` (the ask on the event page), `verify-planning.mjs` or `verify-people.mjs` (the ask after create, whichever covers create), `review-ui.mjs` (captures of the ask and settings at 390, 320 and Larger Text 320).

Expo web has no push. To reach the "On" and registered states, the checks set the permission and push state through the same seams the app reads, for example an injected notifications adapter on web or a QA hook already used by `verify-notifications`. They then assert the copy, the chips, the buttons and the 44 pt targets. Read how `verify-notifications.mjs` fakes permission today and extend that.

- [ ] **Step 1:** Write the cases:
  1. The organizer sees the ask once after creating, and not again after "Not now".
  2. A guest answering Going sees it; a guest answering Can't go doesn't.
  3. The settings chips for not active, not asked, on and off, each with the right button.
  4. The ask's and settings' copy match the spec words, and there's no 000000.
- [ ] **Step 2:** Run every `verify-*.mjs`, `review-ui.mjs`, the two link checks, the iOS export (then remove `dist-ios`) and `npm run check`. Expected: every one exits 0.
- [ ] **Step 3: Commit:** "Check the notification ask and settings in the browser".

### Task 8: Records and rollout runbook

**Files:**
- Create: `qa/push-notifications-2026-10-30/README.md`.
- Modify:
  - `docs/implementation-status.md`;
  - `knowledge-base/08-decisions.md`;
  - `supabase/README.md`;
  - `qa/notification-readiness.md`: mark the prerequisites done or owner-pending.

**Runbook steps** (none run here):
1. **Apple:** the owner creates an APNs key (`.p8`) in the Apple developer account and adds it to EAS credentials for `com.resbite.app` (`eas credentials`), following the v57 push setup guide.
2. **Expo:** create an Expo access token for the sender (`EXPO_ACCESS_TOKEN`).
3. **Migrations,** with owner approval by name and sha256, in this order:
   1. `20261027120000_phone_accounts`
   2. `20261028120000_contact_invitations`
   3. `20261029120000_open_link_approval`
   4. `20261030120000_push_delivery`

   Take snapshots, then run the advisors. **Never** apply the local-only `20260918001308`, `20261014130000`, `20261015130000` or `20261022120001`; this migration replaces their push parts.
4. **Sender:**
   1. Deploy `deliver-notifications` with `verify_jwt = false`.
   2. Set its secrets.
   3. Flip `DELIVERY_RELEASE_APPROVED` with the owner's approval, as a one-line commit, and deploy again.
   4. Set `NOTIFICATION_DELIVERY_ENABLED=true`.
   5. Create the two Vault secrets and run `supabase/ops/schedule-deliver-notifications.sql`.
5. **App:** `EXPO_PUBLIC_PUSH_ENABLED=true` in EAS production, then build. This is the same build as plans 1–3.
6. **Two-phone checks:**
   - an invitation, an answer, a request, an approval, a time change, a cancellation and a note each arrive with the right words;
   - a tap opens the event;
   - a tap after removal lands on My resbites with the note;
   - signing out stops pushes;
   - turning off notifications in iOS Settings shows "Off in Settings".
7. **Rollback:**
   1. Unschedule the cron.
   2. Set `NOTIFICATION_DELIVERY_ENABLED=false`.
   3. Run the rollback, before plan 3's.
   4. Builds with `EXPO_PUBLIC_PUSH_ENABLED` keep registering, and `register_device` keeps working, because it's restored to the foundation body.

- [ ] **Step 1:** Write the runbook and the records, including this plan's rulings and parked items. Fill in the sha256s and the final check results at merge.
- [ ] **Step 2: Commit:** "Record push notifications: decisions, status and the rollout runbook".
