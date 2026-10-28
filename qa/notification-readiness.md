# Notification activation prerequisites

Notification settings is a read-only permission/status surface in this build. Delivery is disabled. It does not request permission, obtain a push token, register an endpoint, schedule a local alert or send a message. This is partial progress on task 6, not notification acceptance.

## Existing foundation

The database foundation has private device endpoints, a checked `register_device` RPC and transactional notification outbox rows for invitation claim, RSVP and plan changes. Client settings use the installed Expo Notifications package to read native permission without prompting. Preview and browser checks do not touch native permissions.

## Before enabling delivery

1. Link the intended Expo project and configure APNs for the signed app; verify a physical development/standalone build.
2. Implement and test endpoint removal for sign-out, permission revocation and account deletion, plus token rotation/account reassignment. Registration alone is insufficient. Keep endpoint tokens private.
3. Implement an authenticated worker consuming the existing outbox. Use generic text without names, places, contact details or invitation secrets. Restrict recipients to eligible, bound participants and preserve one logical notification identity across retries.
4. Store Expo tickets and check receipts; retry transient failures with bounded backoff, and remove invalid endpoints. A push ticket is not proof that a person received or read a notification.
5. Route notification taps through the account boundary, validate the plan identifier and refetch authorized state. Cover cold start, signed-out continuation, cancellation and account changes. Do not trust a payload as authorization.
6. After delivery and cleanup work together, wire an explicit permission action and durable registration retry. Keep plan/RSVP refresh usable when permission is denied or the device is offline.
7. Run the physical two-phone checks in [device results](device-test-results.md), including denial, foreground/background, repeated delivery, offline return and sign-out. Record results before changing the delivery capability flag.

Tester access remains closed. Enabling push does not authorize opening the roster, sending test messages or deploying unrelated backend changes.

## Local implementation follow-up

A service-only delivery ledger/migration and hard-disabled Edge worker now implement leases, endpoint-binding checks, provider tickets/receipts and retry outcomes. Injected mobile registration/rotation/revocation/sign-out and tap-validation helpers are implemented/tested but not wired to native token APIs. See `supabase/functions/deliver-notifications/README.md` and [pre-sign-in readiness](pre-signin-readiness.md). None of these files enables delivery; credentials, native wiring, deployment and device acceptance remain.

## Status of the prerequisites (30 October 2026)

Push is built on the `push-notifications` branch and nothing is deployed. "Done in code" means built and tested locally; nothing here has run against the hosted project, Apple or Expo. The rollout steps are in [the push runbook](push-notifications-2026-10-30/README.md).

1. **Expo project and APNs, signed build.** Pending with the owner: the APNs key into EAS credentials for `com.resbite.app`, the Expo access token, and a physical build with `EXPO_PUBLIC_PUSH_ENABLED=true`. Done in code: the `expo-notifications` plugin gives the build its `aps-environment`.
2. **Endpoint removal and rebinding.** Done in code: `unregister_device`, unregistering at sign-out (refused only when the request never reaches the server; any server answer lets sign-out go ahead), dismissing the pushes still shown at sign-out, rebinding when another account registers the same token, and claims that suppress deliveries to a rebound endpoint. Account deletion's cleanup stays with the deletion milestone (local-only). Known limit: an account whose session expired without a sign-out keeps its endpoint until it is rebound or the person signs in again.
3. **Authenticated worker, generic text, bound recipients.** Done in code: the worker secret check, the eligible and bound audience at expansion, claim and send time, and one identity per notice and device across retries. Wording follows UX2-D4 (the event title; what happened and who; never the place, notes, descriptions or phone numbers), with new bodies for invitations, requests and approvals. The new words are with the owner for approval. Pending with the owner: deployment, secrets, the release switch and the schedule.
4. **Tickets, receipts, retries, invalid endpoints.** Done in code: tickets and receipts in the ledger, bounded backoff, invalid tokens removed. Not proof of receipt or reading.
5. **Notification taps.** Done in code: a tap is routed through the account boundary, the plan is refetched with authorization, a cold-start tap is held until the session and account settle, a signed-out tap is dropped (not held), and an event the person can no longer see lands on My resbites with a note; a tap whose refetch fails opens the event page, which retries. Waiting accounts refresh once before routing.
6. **Permission action and durable registration retry.** Done in code: the one ask ("Get notified?"), Turn on notifications and Try again in Notification settings, registration retried on foreground and once the account's profile exists; plan and RSVP refresh work when permission is denied or the device is offline.
7. **Physical two-phone checks.** Pending with the owner: run the list in the runbook, and record the results in [device results](device-test-results.md) before the delivery switch is turned on.

The text above this section describes the state before push was built (read-only settings, a hard-disabled worker); this section supersedes it. Tester access remains closed: enabling push does not authorize opening the roster.
