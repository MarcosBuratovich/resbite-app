# Notification worker — live since 28 October 2026

Released by the owner on 28 October 2026 (`DELIVERY_RELEASE_APPROVED = true`, `8e29f14`), deployed with `verify_jwt = false` and called every minute by `pg_cron` (step 4 of the [push runbook](../../../qa/push-notifications-2026-10-30/README.md)). Delivery needs both the constant and `NOTIFICATION_DELIVERY_ENABLED=true`; set the secret to `false` to pause, or the constant back to `false` and redeploy to stop. Phones register only with a build that has `EXPO_PUBLIC_PUSH_ENABLED=true`.

The service-only SQL RPCs expand each event once into a unique event/endpoint ledger, lease jobs, validate current eligible participant and exact endpoint binding before provider access, and conditionally commit results. Tokens never go to a client or logs. A token rebound after validation and before the network call cannot be atomically fenced across Postgres and Expo; generic text contains no person, place, message, or invitation secret, and all plan reads still require server authorization. A lost provider reply or expired send lease becomes `unknown`, requiring investigation rather than risking an automatic duplicate. Definitively rejected transient requests use bounded backoff. Receipt polling preserves the ticket and never resends the notification. Provider acceptance is not proof of receipt or reading. Outbox `delivered_at` means all endpoint work is terminal, including suppression/failure.

Before activation: complete client register/unregister/rotation and account cleanup integration; configure APNs and the intended Expo project; enforce Expo access-token security; implement notification-tap account/plan validation; run two-device acceptance with explicitly authorized testers. Review the release gate only after those pass.

Deployment configuration, when separately authorized, must set `verify_jwt = false` for this function because the handler verifies its dedicated worker secret, not a user JWT. Set a random 32+ character `NOTIFICATION_WORKER_SECRET`; callers send it as `Authorization: Bearer …`. Service database credentials remain server-only (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`). `EXPO_ACCESS_TOKEN` is the server-side Expo credential. Do not send keys or tokens in request bodies or log them. Invocation accepts POST only and ignores caller-supplied job identifiers/payloads.

Run offline tests using Node 22:

```
node --experimental-transform-types --test supabase/functions/_shared/notification-engine.test.ts
```

Apply the migration and run `supabase/tests/notifications.sql` only in a disposable local Supabase-compatible database. Tests roll back synthetic fixtures and make no provider requests. Production requires the real Supabase Edge runtime and Storage/Auth integration checks separately.

## Deployment and schedule (owner steps)

- Deploy with `verify_jwt = false` (the handler checks the worker secret, not a user JWT).
- Function secrets: `NOTIFICATION_WORKER_SECRET` (random, 32+ characters), `EXPO_ACCESS_TOKEN`, and `NOTIFICATION_DELIVERY_ENABLED`. Delivery needs the enabled switch and the release constant together.
- The release constant `DELIVERY_RELEASE_APPROVED` in `index.ts` stays `false` until the owner flips it at release.
- Schedule: create the Vault secrets `deliver_notifications_url` and `deliver_notifications_secret` (same value as `NOTIFICATION_WORKER_SECRET`), then run `supabase/ops/schedule-deliver-notifications.sql` once in the hosted SQL editor. It calls the function every minute and can be undone with `select cron.unschedule('deliver-notifications');`. It is not a migration and is not run by the tests.
- Wording: `_shared/notification-copy.ts`. The title is the event title; bodies name what happened and who, never the place, notes, descriptions or phone numbers.

## Chat (chat core; built 11 November 2026, not deployed)

The chat release ([runbook](../../../qa/chat-release/README.md)) redeploys this function **after** the chat core migration. The hosted `finish_notification_delivery` refuses the outcome `deferred` until that migration is live.

- **What a chat push carries** (`_shared/notification-copy.ts:159-172`). The two chat kinds are the one place a person's own words appear (CH-P7).
  - `chat_message`: the title is the resbite's title, and the body is "<first name>: <words>".
  - `announcement`: the same title, and the body "Announcement from <first name>: <words>".
  - The words are the message's, made one clean line (lone surrogates, controls and bidi controls removed, white space collapsed) and cut at 120 graphemes with "…". The first name is the first word of the sender's name, cut at 30 graphemes.
  - With no name (a sender being deleted) or no visible words, the push is the generic text.
  - No other kind carries a message. No push carries the resbite's place, note or description. A chat push's words are the sender's own, as typed (made one line and cut), so they may hold anything the sender typed, a phone number or an address included.
- **Its data** (`_shared/notification-engine.ts:68-76`): `{type: "chat", seriesId, planId, notificationId}`. A chat job without a valid series id is never sent (`:86-95`). The message id and an announcement's audience stay on the server. Other kinds keep `plan_update` and `connection`.
- **A run** (`runNotifications`, `_shared/notification-engine.ts:131-174`).
  - The first claim takes 25 jobs, and later claims take 10.
  - No claim, send or receipt check starts once 5 seconds have passed, so most runs fit under the schedule's 10-second timeout. Each claimed job not yet started is finished as `deferred`: pending again at once, with the claim's attempt given back.
  - Each provider or journal call may take up to 10 seconds (`_shared/notification-adapters.ts:23`, `:78`). A job started just before 5 seconds makes up to three in turn (validate, the send or the receipt check, finish), so it can keep the run going 30 seconds past the budget. The runbook offers the owner raising the schedule's timeout and this budget together.
- **The answer** (`handler.ts:22-35`).
  - HTTP 200 `{"disabled":false,"processed":N,"deferred":M}` for a clean run.
  - HTTP 200 with `"error":"Notification claim failed"` added when a later claim failed: what the run did stands, and the rest waits for the next run.
  - HTTP 503 `{"error":"Notification processing incomplete"}` when a journal call failed (`handler.ts:30-35`): the first claim (`_shared/notification-engine.ts:152-154`), or any validate or finish at any point of the run (`:163`, `:181-182`, `:215`). Each throws on a non-OK answer or its 10-second timeout (`_shared/notification-adapters.ts:78-80`), a `deferred` hand-back refused by an old finish included. What the run did before the failure stands.
  - `{"disabled":true,"processed":0}` while delivery is off.
  - A check of the schedule's runs reads the status and the `error` field together.
