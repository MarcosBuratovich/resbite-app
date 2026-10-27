# Push notifications: build and rollout runbook (30 October 2026)

- **Spec:** [Contact invitations design](../../docs/superpowers/specs/2026-10-27-contact-invitations-design.md), decision CI-D11 and the "Notifications" section. Push notifications are plan 4 of 4 (plan 1 phone accounts, plan 2 contact invitations, plan 3 open-link approval).
- **Plan:** [Push notifications plan](../../docs/superpowers/plans/2026-10-29-push-notifications.md).
- **Code:** branch `push-notifications`, taken from `main` at `ffc876f`. **Nothing is applied to the hosted project, Apple, Expo, EAS, Vercel or TestFlight, and nothing is deployed.** Every hosted, Apple, Expo and EAS step below needs the owner's approval when it is done.
- The calls made during the build are in `knowledge-base/08-decisions.md` ("Push notifications, 29 October 2026").

## What is built

- **Database (one hosted-compatible migration):** `20261030120000_push_delivery.sql` carries every push piece of four local-only files (`20260918001308`, `20261014130000`, `20261015130000` and the delivery half of `20261022120001`) in one idempotent file, and leaves the deletion lifecycle alone.
  - The delivery ledger `private.notification_deliveries`, `notification_outbox.expanded_at`, and the service-only worker functions `claim_notification_deliveries`, `validate_notification_delivery` and `finish_notification_delivery`.
  - `unregister_device(p_token)` for the app, and a new `register_device` that takes any confirmed, non-banned, non-deleting account (a person waiting for the host's approval must get `join_approved`). Delivery is still gated at claim.
  - The send-time audience `private.notification_recipient_eligible` now includes phone-only accounts. Banned, deleting and disabled accounts get nothing. A `join_request` notice is dropped if the request was decided before the push goes out.
  - `fold_web_account` carries the web account's unsent notices.
- **Sender:** `supabase/functions/deliver-notifications` (hard-disabled in source by `DELIVERY_RELEASE_APPROVED = false`), with new wording for `invited`, `join_request` and `join_approved` in `supabase/functions/_shared/notification-copy.ts`. The title is the event title; bodies say what happened and who, never the place, notes, descriptions or phone numbers. A missing name gives the generic body.
- **Schedule:** `supabase/ops/schedule-deliver-notifications.sql`, run by the owner (pg_cron, pg_net, Vault). It is not a migration.
- **App:**
  - Registration of the device token on sign-in and on foreground, unregistering at sign-out, and a push journal that survives a switch of account on one phone. The switch is `EXPO_PUBLIC_PUSH_ENABLED` (`"true"` turns it on; unset means off).
  - One ask, "Get notified?", with its own device flag. Notification settings shows the real state: On, Off in Settings, Not asked yet, Checking…, Not set up yet (with Try again), Not active yet.
  - A tap on a push opens the event after an authorized refetch. A tap for an event the person can no longer see lands on My resbites with "That resbite isn’t available any more."

## Files and hashes

The merge fills the final values. The "current" values were taken on the branch while it was being built and may change before the merge.

| File | sha256 |
| --- | --- |
| `supabase/migrations/20261027120000_phone_accounts.sql` | `208f399152d394460941272ffdeffaa1189883ff251ed37d77a3ab69367f5ddc` |
| `supabase/migrations/20261028120000_contact_invitations.sql` | `78147f2beb73c28b01e19e1bb95fde17c4b96b9da4d4b0ae7b14d2c8514361b4` |
| `supabase/migrations/20261029120000_open_link_approval.sql` | `5cd7f723bdd7119d3133c225d1186031e2ec265a054a208e7fef40de9c7f50a0` |
| `supabase/migrations/20261030120000_push_delivery.sql` | `<sha256 — filled at merge>` (current: `b4d9f811fa5e9b0d18360841b2ca4d79393e80788ff0fc0b9d686021e3e0849e`) |
| `supabase/rollback/20261030120000_push_delivery.rollback.sql` | `<sha256 — filled at merge>` (current: `db7b157566229b9dd5e045a65f0513e49754201c37afb1c5d60a8b9b4f62a096`) |
| `supabase/rollback/20261029120000_open_link_approval.rollback.sql` | `<sha256 — filled at merge>` (current: `9d8e720d9c3bee60bc05cab9f922e6baca6cfc0a9a1deaca4b88cc1aadf5a867`; it changed with this plan, because it now refuses while push is installed) |

The first three rows are the earlier plans' migrations; their hashes are in their own runbooks and have not changed.

## Final local checks

`<filled at merge>`. The commands:

- `cd mobile && npm run check`.
- `./scripts/test-database-docker.sh` (full mode; includes `supabase/tests/push-delivery.sql`).
- `./scripts/test-database-docker.sh --hosted-baseline supabase/migrations/20261027120000_phone_accounts.sql supabase/migrations/20261028120000_contact_invitations.sql supabase/migrations/20261029120000_open_link_approval.sql supabase/migrations/20261030120000_push_delivery.sql` (all four candidates: see "Hosted-baseline commands" in `supabase/README.md`).
- Worker tests: `node --import ./mobile/node_modules/tsx/dist/loader.mjs --test supabase/functions/_shared/*.test.ts`.
- Browser checks on Expo web (Task 7), every `*.supabase.co` request intercepted.

## Rollout runbook

None of these steps has been run. Each is done later, with the owner's approval.

**Order.** Apple and Expo credentials first, then the four migrations, then the sender, then the app build. The new app calls `unregister_device`, which exists only after the migration; the sender sends nothing until its release switch is flipped, the secrets are set and the schedule exists.

1. **Apple.**
   - The owner creates an APNs key (`.p8`) in the Apple developer account.
   - The owner adds it to EAS credentials for `com.resbite.app` (`eas credentials`), following the Expo SDK 57 push setup guide.
   - `mobile/app.json` needs no change: the `expo-notifications` plugin adds `aps-environment` to the native build.
2. **Expo.** Create an Expo access token for the sender; it becomes the function secret `EXPO_ACCESS_TOKEN`.
3. **Migrations,** in this order, each with the owner's approval by file name and sha256 (the table above):
   1. `20261027120000_phone_accounts`
   2. `20261028120000_contact_invitations`
   3. `20261029120000_open_link_approval`
   4. `20261030120000_push_delivery`

   The first three have their own steps (Auth dashboard settings, snapshots, link site); finish those first, from [`qa/phone-accounts-2026-10-27/README.md`](../phone-accounts-2026-10-27/README.md), [`qa/contact-invites-2026-10-28/README.md`](../contact-invites-2026-10-28/README.md) and [`qa/open-link-approval-2026-10-29/README.md`](../open-link-approval-2026-10-29/README.md). For this one:
   - Take hosted before/after snapshots into this directory (the model is `supabase/tests/hosted-baseline/20261030120000_push_delivery.before.sql` and `.after.sql`).
   - Apply it, then run the advisors.
   - Append the line to `supabase/tests/hosted-baseline/migrations.txt` with its hosted version (and the three before it, if they were not already added).
   - **Never apply the local-only `20260918001308`, `20261014130000`, `20261015130000` or `20261022120001`.** This migration replaces their push parts.
   - **`20261022120001` must be split before the deletion milestone.** It redefines `notification_recipient_eligible` with the old email-only audience. Applying it after this migration would bring the email-only audience back, and phone-only accounts would stop getting notices. When the deletion milestone is built, its deletion half (`request_account_deletion`, `prepare_deletion_intent`, `deletion_pending` and the `eligible()` re-point) must be split out into its own file, without `notification_recipient_eligible`. The file's own header ("It goes live with the notification sender and the deletion milestone…") is now misleading: the sender goes live with this migration, not with that file.
   - **Backlog.** Hosted's old outbox backlog (unsent notices from before) is expanded 100 per claim once the sender runs. Every such row is older than 24 hours, and the send-time audience refuses anything older than a day, so nothing stale is sent. To take them out of the queue beforehand (optional, with owner approval, run once in the SQL editor after the migration and before the sender is scheduled):

     ```sql
     update private.notification_outbox set expanded_at = now(), delivered_at = now() where delivered_at is null and created_at <= now() - interval '24 hours';
     ```
4. **Sender.**
   1. Deploy `deliver-notifications` with `verify_jwt = false` (the handler checks the worker secret, not a user JWT).
   2. Set the function secrets: `NOTIFICATION_WORKER_SECRET` (random, 32+ characters), `EXPO_ACCESS_TOKEN` and `NOTIFICATION_DELIVERY_ENABLED`. Keep `NOTIFICATION_DELIVERY_ENABLED=false` for now.
   3. Flip `DELIVERY_RELEASE_APPROVED` to `true` in `supabase/functions/deliver-notifications/index.ts`, as a one-line commit with the owner's approval, and deploy again. Delivery needs the constant and the secret together.
   4. Create the two Vault secrets: `deliver_notifications_url` (`https://<project-ref>.supabase.co/functions/v1/deliver-notifications`) and `deliver_notifications_secret` (the same value as `NOTIFICATION_WORKER_SECRET`).
   5. Set `NOTIFICATION_DELIVERY_ENABLED=true`.
   6. Run `supabase/ops/schedule-deliver-notifications.sql` once in the hosted SQL editor. It calls the function every minute.
   - `pg_net` keeps the request, including the `Authorization` header with the secret, in `net.http_request_queue` while a request is pending. That is the documented pattern, but it means the secret sits in a table the dashboard can read for a moment; rotate it (new function secret and new Vault secret together) if that matters.
   - Named jobs need `pg_cron` 1.3 or later. Hosted has it; check `select extname, extversion from pg_extension where extname = 'pg_cron';` if the script fails.
5. **App.** Set `EXPO_PUBLIC_PUSH_ENABLED=true` in the EAS production environment, then build. This is the same build as plans 1 to 3 (it carries all four plans). The APNs key from step 1 must already be in EAS credentials. Without the variable the build neither registers a token nor claims updates are on.
6. **Two-phone checks** (physical iPhones, two testers; record the results in this directory):
   - An invitation, an answer, a request, an approval, a time change, a cancellation and a note each arrive, with the event title as the title and the right words.
   - A tap opens the event.
   - A tap after the person was removed from the event, or after the event is gone, lands on My resbites with "That resbite isn’t available any more."
   - Signing out stops pushes. Signing in on the same phone as another account sends that account's pushes there and stops the first's.
   - Turning notifications off in iOS Settings shows "Off in Settings".
   - A waiting person (open-link request not yet approved) gets the approval push on their phone.
7. **Known limits.**
   - Any confirmed account can add device endpoints, with no per-account cap. The sender deletes tokens the provider reports invalid.
   - An account whose session expired without a sign-out keeps its endpoint until another account rebinds it on that phone or the person signs in again. Until then, pushes for that account can reach the phone.
   - An offline sign-out is refused with "Couldn’t sign out. Connect to the internet and try again, so this phone stops getting your notifications."
   - A person with an account but no profile cannot register a device (`23503`); the app tries again on foreground and the settings chip shows "Not set up yet", never an alarm.
8. **Rollback.**
   1. Unschedule the cron: `select cron.unschedule('deliver-notifications');`.
   2. Set `NOTIFICATION_DELIVERY_ENABLED=false`.
   3. Run `supabase/rollback/20261030120000_push_delivery.rollback.sql` in one transaction with the owner's approval: `begin; \i supabase/rollback/20261030120000_push_delivery.rollback.sql; commit;`. sha256 `<sha256 — filled at merge>`.
      - **It runs before the open-link rollback.** `supabase/rollback/20261029120000_open_link_approval.rollback.sql` (sha256 `<sha256 — filled at merge>`) now refuses to run while push is installed ("Run the push delivery rollback (20261030120000) first"). The reason: the push audience check reads `private.join_requests`, which the open-link rollback drops, and the push rollback restores the open-link fold that the open-link rollback then replaces.
      - Registered devices stay. Undelivered notices stay in the outbox, unsent; if the migration is applied again, unsent notices under a day old are expanded again.
   4. Builds with `EXPO_PUBLIC_PUSH_ENABLED` keep calling `register_device`. After the rollback it works with the foundation body, so it still registers testers; accounts that are only waiting for approval are then refused, and the app handles that quietly (the chip reads "Not set up yet" and the app tries again later). `unregister_device` is dropped by the rollback, so serve a build without the variable if sign-out on those builds misbehaves.

## Open items for the owner

**New words to approve** (all from Task 5, in `mobile/src/domain/notifications.ts` unless noted; the ask's own copy, "Get notified?" with "Turn on notifications" and "Not now", came from the plan):
1. "Couldn’t turn on notifications on this phone. Try again." (turn-on failure).
2. The chip states "Not set up yet" and "Checking…", the action "Try again", and its VoiceOver label "Try setting up notifications again". "Turn on notifications" keeps its own text as the label.
3. The About sheet's lead lines: "Resbite sends updates for:" (updates on) and "Once updates are on, Resbite sends them for:" (off).
4. The six events listed on the About sheet:
   - "A new invitation, to the person invited."
   - "An answer, to the host: “Sam is going.”"
   - "A new request to join, to the host."
   - "Approved, to the person who asked. Declined isn’t sent."
   - "A change of time or place, and a cancellation, to the people invited."
   - "A Note to guests."
5. Renames: the card title "Updates from organizers" is now "Updates", and "Updates from organizers aren’t active yet" is now "Updates aren’t active yet". Once updates are on, the permission lines drop that sentence and read, for example, "Reminders can reach you."
6. Push bodies for the three new kinds (`supabase/functions/_shared/notification-copy.ts`): "Sam invited you.", "Sam asked to join." and "Sam approved your request." (the event title is the push title).

**Parked, not blocking**
7. `register_device` for an account without a profile fails `23503`; the app retries on foreground.
8. Sign-out edge cases: `SIGNED_OUT` drops the previous account's token before the account-switch cleanup can try it; the coalescing callback lacks a rejection handler (`.then(cb)` instead of `.then(cb, cb)`); with a damaged push record at sign-out the app forgets it without a best-effort unregister; the offline sign-out message is shown for every cleanup failure; a stale record is replaced before the rebind is confirmed.
9. The turn-on tap queued while the event page is busy has no cancel on unmount, account change or sign-out (a late iOS prompt, a stale reminder sync or an error note could follow).
10. A notification-tap routing detail: the account state's latest status is not reset on an account change or sign-out (its only consumer is safe today); the 10-second wait is not cleared once a refresh returns approved (a rare misroute to Account); the "gone" note stays until the person leaves My resbites.
11. The ask's flag-write failure is swallowed, and the ask sheet takes no focus on open (as before).
12. Tests: the removed-guest test covers `guest_note` only (`plan_changed` shares the path); the rollback rehearsal's check around the refused open-link rollback only proves the subtransaction rolled back, and could also assert the guard comes before the first destructive statement and that the file is non-empty.

## Not done here

No hosted change, no Apple, Expo, EAS or Vercel step, no deployment of the function, no schedule and no TestFlight upload.
