# Before real sign-in acceptance — 17 September 2026

This milestone prepared three independent areas while tester access remained closed. No hosted migration, Edge deployment, real email, push send, account deletion or roster change was performed.

| Area | Implemented and locally verified | Still requires setup/acceptance |
| --- | --- | --- |
| Account deletion | Explicit confirmation; password/email OTP proof; same-account/fresh-session enforcement; atomic access block/cancellation/redaction; durable recovery receipt; local draft/group/photo/invite cleanup; leased Storage/Auth cleanup worker | Deploy reviewed migrations/functions; real Auth/Storage/SMTP testing; scheduled cleanup; approved administrative-job, backup and log retention |
| Invitation links | Strict scheme/owned-origin parsing; native incoming-link hook; secret in HTTPS fragment; private fallback and AASA generator | Choose owned domain; host generated files with required headers; add associated domain and rebuild; two-iPhone Universal Link/auth-continuation checks |
| Notifications | Private delivery ledger; endpoint-binding checks; ticket/receipt/retry handling; scoped unregister; injected mobile registration/rotation/revocation and tap-validation coordinator | Wire native adapters, foreground/token/tap listeners and sign-out continuation; Expo project/APNs credentials; real device acceptance; release gate currently hard-disabled |

## Evidence

- 81 mobile tests and TypeScript pass, including deletion, draft cleanup, links and push lifecycle. Existing eight activity pairs still pass manifest validation; copy/category approval remains outstanding.
- 18 injected backend handler/worker/gateway tests pass without any provider requests.
- Disposable PostgreSQL tests cover original access rules, deletion, notifications and privileged-function/RLS checks. Concurrent upload-first/deletion-first transactions also pass. The harness supplies minimal Auth/Storage contracts and does not certify their hosted HTTP behavior.
- Default-disabled browser deletion flow sends no Supabase requests. A separate enabled bundle with all Auth/API calls intercepted verified password and email-code proof, lost reply, local cleanup failure/retry and receipt recovery after restart.
- Session and invitation browser regressions pass after integration; iOS Hermes export passes. The iPhone was unavailable to CoreDevice for relaunch, so native acceptance of this milestone remains pending.

## Recommended next milestone

Move to real sign-in and service setup rather than adding more preview-only surfaces. First configure Google, confirmation/reset/OTP email delivery and approved callbacks, and decide the owned link domain. Review the two local migrations/functions and retention decisions before enabling them. Review/publish the eight-activity catalogue. Keep the roster empty until these boundaries and cleanup are accepted, then explicitly approve the two tester accounts and execute the two-phone loop.

The product is not yet a standalone accepted MVP. A signed build that runs without Metro, full native accessibility/permission checks, photo HTTP authorization, cleanup and push acceptance remain. Orphan-photo cleanup for still-active accounts and an approved purge policy for deletion receipts remain data-retention work; account deletion already enumerates all objects under the deleting account's prefix.
