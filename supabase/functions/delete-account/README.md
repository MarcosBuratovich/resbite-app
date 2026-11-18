# Account deletion: delete-account and cleanup-account

Built locally for the App Store release (plan 2, spec C2: `docs/superpowers/plans/2026-11-17-asr-2-account-deletion.md`). Not deployed. The receipt purge has its own [README](../purge-deletion-receipts/README.md).

Every account that can sign in can delete itself in the app, suspended accounts too. Deletion finishes within 30 days, usually within minutes.

## The gates

- **Source gates.** `ACCOUNT_DELETION_RELEASE_APPROVED` in `_shared/deletion-release.ts` is `false`. Until it is flipped (the rollout's step 5, with the owner's approval) `delete-account`, `cleanup-account` and `purge-deletion-receipts` answer 503 and call nothing, whatever the environment says. `_shared/deletion-release.test.ts` checks that.
- **Server flag.** `ACCOUNT_DELETION_ENABLED=true` turns on all three functions once the gate is open.
- **App flag.** `EXPO_PUBLIC_ACCOUNT_DELETION_ENABLED=true` shows Delete account in the app.

## delete-account: the actions

POST with a JSON body of at most 16 KB. `OPTIONS` answers the CORS preflight.

- **Request**: `{"action":"request","requestId","recoveryToken","proof","appleAuthorizationCode"?}`.
  - `Authorization: Bearer <the current access token>`.
  - `proof` is the access token of a fresh sign-in of the same account (below).
  - `appleAuthorizationCode` comes only after an Apple re-authentication. When present it must match `[A-Za-z0-9._-]`, 1 to 1024 characters.
  - Answers:
    - 202 `{requestId, status}`: accepted;
    - 400 `Invalid request` (a malformed body or Apple code) or `Invalid recovery receipt`;
    - 401: no fresh proof of the same account;
    - 503 `Request unconfirmed`: the app keeps its receipt and asks for the status.
- **Status**: `{"action":"status","requestId","recoveryToken"}`.
  - No sign-in: the receipt is the secret, so it still works after the Auth account is gone.
  - 200 `{requestId, status}`, where the status is `queued`, `processing` or `complete`.
  - 404 for an unknown request or a wrong token, the same answer for both.
  - 503 when the database can't answer.

The receipt is a request id (a UUID) and a 256-bit recovery token. The app saves both in secure storage before it sends the request. The server keeps only the token's SHA-256.

Nothing logs a request body, a token, an Apple code, a URL or an upstream error body.

## The proof, per account (ASR2-2)

The app asks for the proof that fits how the account signs in:

1. Apple linked: Sign in with Apple. It is also the only way to get the code that revokes the account's Apple tokens.
2. Otherwise, an email or Google account: a code by email, with "Use my password instead" when the account has the `email` provider.
3. Otherwise, a verified phone: a code by SMS.
4. Otherwise: the person emails privacy@resbite.com.

The server checks it in `freshIdentity` (`_shared/account-deletion.ts`), after Auth has verified both tokens:

- The proof needs an `amr` entry from the last five minutes (at most 30 seconds ahead).
- `password` and `otp` count for every account. Supabase records an email or SMS code as `otp`.
- `oauth` counts when the proof's `app_metadata.providers` include `apple`.
- A token refresh never counts. The providers come from the verified token, never from `user_metadata`.

## The request path (D-4)

After the proof, `delete-account` makes one call, as `service_role`: `request_account_deletion(p_user, p_session, p_request, p_recovery)`, from `supabase/migrations/20261117110000_account_deletion_release.sql`.

- An existing request answers first, when the id and the token match. A retry after the proof has gone stale gets its receipt back. Another request for the same account is refused.
- Otherwise the SQL asks for the proof's session in `auth.sessions`, made for this user in the last five minutes, a confirmed email or phone, and an account that isn't anonymous. A suspended account may delete itself (D-19).
- Then, in one transaction, it closes the account (its future resbites are cancelled and their guests told) and erases the rest.
- Under a legal hold only the close step runs. The job is `held`, and every answer reads it as `queued`.

The gateway accepts only an answer with the same request id and a status of `queued`, `processing` or `complete`. Anything else answers 503.

There is no separate ledger. The September prepare-and-activate path and its independent encrypted ledger are retired (D-4), and their modules are gone. After a backup restore, deletions are replayed from a receipts export taken from the live database first: see the [restore procedure](../../../qa/deletion-restore-procedure.md).

Banned, web-only and under-18 accounts can't delete themselves in the app. The team deletes them with `supabase/ops/delete-account.sql` (AS-R3), which runs the same lifecycle.

## After acceptance: the logout, then Apple

The order is the deletion, then the Supabase logout, then Apple. Neither step can undo or hide an accepted deletion: a failure is ignored and the answer is still 202.

1. `POST /auth/v1/logout?scope=global` with the proof token ends every session of the account.
2. Apple (ASR2-8, DEL-4), only when the request carried `appleAuthorizationCode` and the verified proof's providers include `apple`. `_shared/apple-revocation.ts`:
   - exchanges the code at `https://appleid.apple.com/auth/token`;
   - then revokes the refresh token, or else the access token, at `https://appleid.apple.com/auth/revoke`;
   - gives each call a 5-second timeout, logs nothing and reads no error body.

Its client secret is an ES256 JWT signed with a Sign in with Apple key. Four function secrets:

| Secret | Value |
| --- | --- |
| `APPLE_TEAM_ID` | the Apple Developer team id (10 characters) |
| `APPLE_KEY_ID` | the Sign in with Apple key's id (10 characters) |
| `APPLE_CLIENT_ID` | the app's bundle id, `com.resbite.app` |
| `APPLE_PRIVATE_KEY` | the `.p8` key on one line, with `\n` for each line break |

Until all four are set and well formed, the Apple step is skipped and the deletion still runs. Keep the `.p8` file outside the repository.

## cleanup-account: the worker

POST with `Authorization: Bearer <ACCOUNT_CLEANUP_SECRET>`. The cron calls it every five minutes.

- Each run claims at most two jobs (`claim_account_deletions`), each on a five-minute lease. It skips an account under a legal hold. Once a hold is lifted, the claim first runs the erase step the hold parked.
- For each job, up to 10 pages of at most 100 files:
  - `deletion_storage_objects` lists the account's files in both buckets, `profile-photos/<uid>/` and `plan-covers/<uid>/` (ASR2-9). It refuses once the lease has passed and while a legal hold names the account.
  - The whole page is checked first. Each bucket must be one of the two, and each name must start with `<uid>/` and hold no `..`. One bad entry stops the job before anything is removed.
  - Then one Storage API call per bucket on the page: `DELETE /storage/v1/object/<bucket>` with the names.
- An empty page means nothing is left. The worker hard-deletes the Auth user through the Admin API, and the profile goes with it. Then `finish_account_deletion` completes the job, but only when the Auth user, the profile and both folders are gone.
- Any failure keeps the job open. It is tried again after a wait that starts at a minute and doubles, up to an hour.

Replaced covers of live accounts are not this worker's job (C3).

## Configuration

- `ACCOUNT_DELETION_ENABLED=true` for all three functions.
- `ACCOUNT_CLEANUP_SECRET` for `cleanup-account`: at least 32 characters, for example `openssl rand -hex 32`. The receipt purge has its own secret and flag.
- The four Apple secrets above, for `delete-account`.
- `verify_jwt = false` for all three functions: `supabase functions deploy <name> --no-verify-jwt`. Each handler checks its own caller. The request verifies both tokens with Auth, the status uses the receipt and must work after the account is gone, and the workers use their secrets.
- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` come from the platform. The service key stays on the server, never in the app.

## The schedule

`supabase/ops/schedule-account-deletion.sql` is owner-run in the SQL editor. It schedules `cleanup-account` every five minutes and `purge-deletion-receipts` daily at 03:32 UTC, with pg_cron, pg_net and four Vault secrets: `cleanup_account_url`, `cleanup_account_secret`, `purge_deletion_receipts_url` and `purge_deletion_receipts_secret`. `select cron.unschedule('cleanup-account');` stops the worker.

## Limits

- A signed photo URL already handed out can work until it expires or its file is removed.
- Copies made outside Resbite can't be recalled.

## Offline tests

From the repository root. Node 22 on Linux can't strip TypeScript, so use the tsx loader:

```bash
node --import ./mobile/node_modules/tsx/dist/loader.mjs --test supabase/functions/_shared/*.test.ts
bash scripts/test-database-docker.sh
```

- `_shared/account-deletion.test.ts`: the proof rule, the handler's order and answers, the cleanup and the gateway.
- `_shared/apple-revocation.test.ts`: the Apple client secret and revocation.
- `_shared/deletion-release.test.ts`: each entry point stays inert while its source gate is false.
- `supabase/tests/account-deletion-release.sql` (both modes) and `supabase/tests/local/account-deletion-concurrency.sh` (full mode): the SQL lifecycle.

No test calls Supabase, Apple or any other live service.
