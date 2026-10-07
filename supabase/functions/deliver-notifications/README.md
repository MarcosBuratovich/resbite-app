# Disabled notification worker preparation

This worker is **hard disabled** by `DELIVERY_RELEASE_APPROVED = false`. No environment change alone enables delivery. No deployment or schedule is created by these files. The mobile capability remains disabled.

The service-only SQL RPCs expand each event once into a unique event/endpoint ledger, lease jobs, validate current eligible participant and exact endpoint binding before provider access, and conditionally commit results. Tokens never go to a client or logs. A token rebound after validation and before the network call cannot be atomically fenced across Postgres and Expo; generic text contains no person, place, message, or invitation secret, and all plan reads still require server authorization. A lost provider reply or expired send lease becomes `unknown`, requiring investigation rather than risking an automatic duplicate. Definitively rejected transient requests use bounded backoff. Receipt polling preserves the ticket and never resends the notification. Provider acceptance is not proof of receipt or reading. Outbox `delivered_at` means all endpoint work is terminal, including suppression/failure.

Before activation: complete client register/unregister/rotation and account cleanup integration; configure APNs and the intended Expo project; enforce Expo access-token security; implement notification-tap account/plan validation; run two-device acceptance with explicitly authorized testers. Review the release gate only after those pass.

Deployment configuration, when separately authorized, must set `verify_jwt = false` for this function because the handler verifies its dedicated worker secret, not a user JWT. Set a random 32+ character `NOTIFICATION_WORKER_SECRET`; callers send it as `Authorization: Bearer …`. Service database credentials remain server-only (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`). `EXPO_ACCESS_TOKEN` is the server-side Expo credential. Do not send keys or tokens in request bodies or log them. Invocation accepts POST only and ignores caller-supplied job identifiers/payloads.

Run offline tests using Node 22:

```
node --experimental-transform-types --test supabase/functions/_shared/notification-engine.test.ts
```

Apply the migration and run `supabase/tests/notifications.sql` only in a disposable local Supabase-compatible database. Tests roll back synthetic fixtures and make no provider requests. Production requires the real Supabase Edge runtime and Storage/Auth integration checks separately.
