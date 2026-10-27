# fold-phone-account — prepared, not deployed

Source-gated off by `PHONE_FOLD_RELEASE_APPROVED` in `_shared/fold-release.ts` (stays `false`; no environment flag can activate it).

When an existing account adds a phone number held by a web-only account, the app proves ownership through an isolated auth client and sends that account's access token (the foreign token). POST `{ foreign_token, phone }` with the caller's session token in `Authorization`.

Order: not approved 503 (no calls); invalid caller or foreign token 401; foreign phone unconfirmed or different from `phone` 403; same user 409; caller already has a confirmed phone 409; then `public.fold_web_account(from, into)` (service role only, refuses 22023 if the web account used the app or owns a plan), delete the web account (404 counts as gone), set the caller's phone with `phone_confirm: true`; 200 `{ok:true}`. Any failure after the fold is 500 with no detail.

Deploy with `verify_jwt = false` (the handler verifies both tokens against `/auth/v1/user`). Uses `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Never log tokens, phones or upstream bodies.

Retry: the fold is idempotent and a deleted user is absent. Once the web account is deleted its foreign token no longer verifies, so a retry after a later failure (setPhone) returns 401; the app should then re-add the number through the ordinary phone flow.
