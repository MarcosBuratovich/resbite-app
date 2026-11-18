# send-sms — built 17 November 2026, not deployed

Supabase Auth's Send SMS hook as an HTTP hook, and the daily sweep of Twilio's message records (App Store readiness plan 1, AS-D5). Auth calls the function with each sign-in code; the function texts it through Twilio and answers Auth within Auth's 5 seconds. Once a day pg_cron calls the sweep route, which deletes Twilio's settled message records.

- `_shared/sms-hook.ts`: the signature check, who to text, the text, the hook handler, the Twilio sender and the router.
- `_shared/sms-records.ts`: the sweep.
- `index.ts`: reads the secrets and serves both routes.

There is no source-gate constant. The function acts only on calls signed with the hook secret, or carrying the sweep secret. The switch is the Auth hook in the dashboard.

## The hook: `POST /functions/v1/send-sms`

Auth signs each call (Standard Webhooks: `webhook-id`, `webhook-timestamp`, `webhook-signature`). The function checks the signature with each secret in `SEND_SMS_HOOK_SECRETS` and refuses a timestamp more than 5 minutes from now. Several signatures may be separated by spaces or by a comma and a space; any one that matches will do.

- **Who it texts.** The number being added (`user.new_phone`) when there is one, so the code proves the person holds it, else `user.phone`; an invalid new number is refused, never swapped for the old one. It texts the stored digits with a leading `+`, never folded to the phone key, so an Argentine `549…` number stays `549…`.
- **Whom it never texts.** An account with a confirmed number (`user.phone` with `phone_confirmed_at`, the app's `phoneVerified`) and a different, non-blank `user.new_phone` gets no text on either number: `200` with `http_code 400` "Invalid code request.", logged as `change-pending`. That shape is Auth changing a confirmed number (`PUT /auth/v1/user {phone}`, which only the raw API sends: the app's Add your number is for accounts with no confirmed number), or a pending change left behind (a fold confirms the number through the admin API, which, as far as is known, leaves Auth's `phone_change` in place: UNVERIFIED). Texting the old number would let the account take a number it never proved it holds; texting the new one could send a stranger sign-in codes. So a confirmed account can't change its number through Auth, and an account left with a pending number gets no code by text (sign-in, or the deletion proof) until its `phone_change` is cleared (`qa/phone-codes-2026-11-17/README.md`, Known gaps 11).
- **The text.** `Your Resbite code is 123456. It expires in 10 minutes. Do not share it.` One GSM-7 segment, so no apostrophe.
- **How.** A POST to Twilio's Messages API in the US region (`api.twilio.com`), through the Messaging Service, with an API key (Basic auth), and `ValidityPeriod=600`: a code Twilio can't deliver within 10 minutes is dropped, never delivered late. The function waits 3 seconds for Twilio, then gives up: that leaves a cold start and the signature check inside Auth's 5 seconds.

What it answers. Every reply is `Content-Type: application/json`.

| Case | HTTP | Body |
|---|---|---|
| Twilio accepted the text | 200 | `{}` |
| Twilio refuses the number: a 400 with code 21211, 21408, 21610, 21612 or 21614 (an invalid or unreachable number, a region outside Geo Permissions, a number that sent STOP, a landline) | 200 | `{"error":{"http_code":422,"message":"We can’t text this number. Check it, or use another number."}}` |
| Twilio busy or down (429 or 5xx), a network error, or the 3-second timeout | 200, with no `retry-after` | `{"error":{"http_code":503,"message":"Text messages aren’t available right now. Try again later."}}` |
| Anything else from Twilio (bad keys, a disabled service, another 4xx), or the Twilio secrets unset | 500 | `{"error":{"http_code":500,"message":"Text messages aren’t available right now. Try again later."}}` |
| `SEND_SMS_HOOK_SECRETS` unset or empty (checked before the signature) | 500 | the same as above |
| The event has no valid number or no 6-digit code, or isn't JSON | 200 | `{"error":{"http_code":400,"message":"Invalid code request."}}` |
| A confirmed number with a different pending `new_phone` (no text) | 200 | the same as above |
| No signature, a wrong or stale one, or a body changed after signing | 401 | `{"error":{"http_code":401,"message":"Invalid signature"}}` |
| Not a POST | 405, with `Allow: POST` | `{"error":{"http_code":405,"message":"Method not allowed"}}` |

**Auth never retries.** Supabase's Auth Hooks guide (supabase.com/docs/guides/auth/auth-hooks, "Error handling", HTTP; read 17 November 2026) says an HTTP hook is retried only on a `429` or `503` with a non-empty `retry-after`, and that 5 seconds cover the whole invocation, retries included. No reply here is either: a retry would arrive with under a second left, and after an abort it could text a second code that Auth never saves. With `http_code 503`, Auth answers the app or the site with a 503, which both show as "Check your connection and try again.".

**What the person reads.** The app and the site show a server message only when it is one of this hook's three lines (`SMS_COPY`; their tests compare their copies with it). Any other Auth message reads as "Check your connection and try again.", and so does every `hook_*` error code: Supabase's Auth error codes list `hook_timeout` ("Unable to reach hook within maximum time allocated"), `hook_timeout_after_retry`, `hook_payload_over_size_limit` and `hook_payload_invalid_content_type`, with no HTTP status given. The guide documents the `{"error":{"http_code","message"}}` object for Postgres hooks, and its HTTP Send SMS example returns the same object; that Auth applies a `200`'s `http_code` and `message` to an HTTP hook is still UNVERIFIED. If it doesn't, a refused number reads as a connection problem.

## The sweep: `POST /functions/v1/send-sms/sweep`

The router sends any path ending in `/sweep` here and everything else to the hook. pg_cron calls it every day at 03:17 UTC with `Authorization: Bearer <SMS_SWEEP_SECRET>` (`supabase/ops/schedule-sms-records-sweep.sql`).

It first lists the account's message records, at most 10 pages of 100. Then it deletes every record whose status is final and that is over 24 hours old. A record still in flight (`queued`, `sending`, `accepted`, `scheduled`, `receiving`), a day old or less, or with a date it can't read, is kept. So a record is deleted between 24 and 48 hours after it was sent, and Twilio says a deleted message's text can stay in its backups for up to 30 days.

| Case | HTTP | Body |
|---|---|---|
| No bearer, a wrong one, or `SMS_SWEEP_SECRET` unset or shorter than 32 characters | 401 | `{"error":"unauthorized"}` |
| Not a POST | 405, with `Allow: POST` | `{"error":"method not allowed"}` |
| A list page failed (not 200, a 10-second timeout, a page it can't read, or a next page off `api.twilio.com`) | 503 | `{"error":"unavailable"}`, and nothing is deleted |
| The run finished | 200 | `{"deleted":N,"kept":M,"failed":F}` |

A delete Twilio answers with 204 counts as deleted, and so does a 404 (already gone). Any other answer, an error or a timeout counts as failed, and the run goes on; the next day's run tries again.

It sweeps **every** message record on the Twilio account, replies such as STOP included. Keep the account (or a subaccount) for Resbite's codes only. One run handles at most 1,000 records, well over a day's codes under Auth's limit of 30 texts an hour. A lost run leaves the records until the next one.

## Secrets (names only)

Set as function secrets. Never in the repository, a log or a chat.

- `SEND_SMS_HOOK_SECRETS`: the secret the dashboard generates for the Send SMS hook. While it is being rotated, the old and the new, separated by `|`. The function must hold every secret Auth signs with: add the new one here before Auth starts using it, and remove the old one only after Auth has stopped.
- `TWILIO_ACCOUNT_SID`: the Twilio account.
- `TWILIO_API_KEY_SID` and `TWILIO_API_KEY_SECRET`: a Twilio API key, which can be revoked on its own (not the account's Auth Token).
- `TWILIO_MESSAGING_SERVICE_SID`: the Messaging Service with the "Resbite" sender.
- `SMS_SWEEP_SECRET`: random, 32 characters or more. The Vault secret `sms_sweep_secret` holds the same value.

An unset Twilio secret is an empty string, so Twilio refuses the call and the hook answers 500: no text goes out. The function holds no database credential and never uses the service-role key.

## Deploy (owner-run, with approval)

From the repository root:

```
supabase functions deploy send-sms --no-verify-jwt
```

Then check that `verify_jwt` reads false on the deployed function. Auth signs with the hook secret and pg_cron sends the sweep secret: neither is a user's JWT. The hash-checked deploy script, the order of the sitting and the checks are in the phone-codes runbook (`qa/phone-codes-2026-11-17/README.md`, plan 1 Task 6).

- **The hook.** Dashboard → Authentication → Hooks → Send SMS: type HTTPS, URL `https://<project-ref>.supabase.co/functions/v1/send-sms`. Generate the secret and set it as `SEND_SMS_HOOK_SECRETS`.
- **The schedule.** Two Vault secrets: `sms_sweep_url` (`https://<project-ref>.supabase.co/functions/v1/send-sms/sweep`) and `sms_sweep_secret` (the value of `SMS_SWEEP_SECRET`). Then run `supabase/ops/schedule-sms-records-sweep.sql` once in the SQL editor: the job `sms-records-sweep`, at `17 3 * * *`, with a 30-second timeout. Skip it if the owner fills the Privacy Policy's placeholder 5 another way; the route then does nothing.

## What it logs

One JSON line per call, for example `{"fn":"send-sms","route":"hook","outcome":"refused","status":400,"code":21614}` or `{"fn":"send-sms","route":"sweep","outcome":"swept","deleted":3,"kept":2,"failed":0}`.

- The hook's outcomes: `sent`, `refused`, `transient`, `config` (each failure with Twilio's HTTP status and numeric error code), `invalid`, `unsigned`, `unconfigured` and `method`.
- The sweep's outcomes: `swept` (with the three counts), `unavailable`, `unauthorized` and `method`.

It never logs a phone number, a code, the text, a token, a message sid or a body from Twilio.

## Rollback

- **The hook.** Dashboard → Authentication → Hooks → Send SMS: point it back to the Postgres function `public.send_sms_hook`. That is the whole rollback while test mode is still on; after the switch-off, see the runbook. The function can stay deployed: without Auth's signature it texts nothing.
- **The sweep.** `select cron.unschedule('sms-records-sweep');`

## Tests

From the repository root, with no network (Twilio is a fake `fetch`):

```
node --import ./mobile/node_modules/tsx/dist/loader.mjs --test supabase/functions/_shared/*.test.ts
```

`_shared/sms-hook.test.ts` covers the hook and the router; `_shared/sms-records.test.ts` covers the sweep, the schedule script and `index.ts`'s wiring.
