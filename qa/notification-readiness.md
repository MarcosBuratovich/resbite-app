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
