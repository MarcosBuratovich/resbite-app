# fold-phone-account — prepared, not deployed

Source-gated off by `PHONE_FOLD_RELEASE_APPROVED` in `_shared/fold-release.ts` (stays `false`; no environment flag can activate it). It is flipped only in a reviewed commit, with the owner's approval, as a step of the [contact invitations runbook](../../../qa/contact-invites-2026-10-28/README.md). Until then the app shows its "not switched on" copy (`foldOff`).

When an existing account adds a phone number held by a web-only account, the app proves ownership through an isolated auth client and sends that account's access token (the foreign token). POST `{ foreign_token, phone }` with the caller's session token in `Authorization`.

Order: not approved 503 (no calls); invalid caller or foreign token 401; foreign phone unconfirmed or different from `phone` 403; same user 409; caller already has a confirmed phone 409; then `public.fold_web_account(from, into)` (service role only, refuses 22023 if the web account used the app or owns a plan), delete the web account (404 counts as gone), set the caller's phone with `phone_confirm: true`; 200 `{ok:true}`. Any failure after the fold is 500 with no detail.

Deploy with `verify_jwt = false` (the handler verifies both tokens against `/auth/v1/user`). Uses `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Never log tokens, phones or upstream bodies.

Retry: the fold is idempotent and a deleted user is absent. Once the web account is deleted its foreign token no longer verifies, so a retry after a later failure (setPhone) returns 401; the app should then re-add the number through the ordinary phone flow.

Database function: `public.fold_web_account(p_from, p_into)` is a single `SECURITY DEFINER` function executable only by `service_role`, with no schema grant. It deletes the folded account's live access and 18+ record after copying them, keeps its ban, and moves data but no live access to an account whose roster row is disabled.

Deploy command (after the migration `20261028120000_contact_invitations.sql` is applied and the constant is flipped): `supabase functions deploy fold-phone-account --no-verify-jwt`. The setting must be `verify_jwt = false`, because the foreign token is not the caller's session token; check it on the deployed function.

App behaviour: the app keeps the foreign session in memory while the screen is open, so Retry calls the function again without verifying the number again. After a failure that isn't a wrong code the app first refreshes the account; if it already holds the verified number, the fold counts as done. A 503 blocks Retry.
