# Link site legal pages: rollout record (17 November 2026)

An operational record for the owner. Plan: `docs/superpowers/plans/2026-11-17-asr-5-link-site-legal-pages.md`. Runbook step: `qa/app-store-release/README.md`, step 16.

**Nothing in this record has been applied.** Every step marked **[approval: Vercel]** or **[approval: Resend]** needs the owner's explicit yes at the time it is done.

## Branch and commit

- Branch: `asr-5-link-site-legal`, merged into `app-store-readiness` in the roadmap's order.
- Task 8 (`links/verify-legal.mjs` and `links/check-live.mjs`): commit `5f959cb`.

## What ships

- **D1.** The Privacy Policy, Terms of Use, Support (with a contact form) and Delete your account pages at `/privacy`, `/terms`, `/support` and `/delete-account`, rendered at build time from `docs/legal/`. The form posts to `/api/contact` and ends on `/support/sent`.
- **D2.** The footer, with the company's particulars, on `/r/`, `/i/`, `/invite` and the legal pages.
- **D3.** The invitee notice and the right to object beside the number field on `/r/` and `/i/`; the tick links the Terms of Use and the Privacy Policy.
- **D7.** Functions run in London (`lhr1`).
- **D9.** `/invite` no longer says "Resbite is in private testing."

## Build modes

`links/generate.mjs ... --legal=final|draft|off`

| Mode | What it does | Where it may go |
|---|---|---|
| `final` (default) | Refuses a placeholder, the draft status or a "before publishing" note, naming each file, before writing anything | Production and previews |
| `draft` | Adds a banner and `noindex` | A protected preview only, never `--prod` |
| `off` | Builds the site without the pages, footer, notices or form | Any deploy made before the documents are final |

Only `final` goes to production.

## Variables (Vercel project `resbite-link`)

Record names and state only; never a value that is a secret.

| Variable | Set / unset | Note |
|---|---|---|
| `RESEND_API_KEY` | unset | Sensitive; Production and Preview; sending-only key `resbite-link-contact` |
| `TERMS_URL` | unset | `https://link.resbite.com/terms` |
| `PRIVACY_URL` | unset | `https://link.resbite.com/privacy` |
| `TERMS_VERSION` | unset | The R0 value, `YYYY-MM`; the app sends the same |
| `APP_STORE_URL` | not recorded | Current value to be recorded at R2 (D4); the code's default is `https://apps.apple.com/` |

## Rollout

Until this rollout, any other deploy of the link site uses `--legal=off`.

- [ ] **R0. Ready to publish** (no approval). The solicitor has reviewed the four documents and the notice (AS-D7); every placeholder in `docs/legal/` is filled and committed; the inboxes exist and are read every working day; what the notice promises is live (30-day number purge, the do-not-invite list, real text-message codes); the Terms version is final in the app's `TERMS_VERSION` and in `TERMS_VERSION_FALLBACK`. Optional: a `--legal=draft` build on a protected preview for the solicitor, never `--prod`.
- [ ] **R1. [approval: Resend]** Create a sending-only API key `resbite-link-contact`, limited to the `resbite.com` domain. It goes straight into R2 and is never written down.
- [ ] **R2. [approval: Vercel]** Set `RESEND_API_KEY`, `TERMS_URL`, `PRIVACY_URL` and `TERMS_VERSION` as in the table. Record each as set, and record `APP_STORE_URL`'s current value.
- [ ] **R3. Build** at the pushed head: `node --import ./mobile/node_modules/tsx/dist/loader.mjs links/generate.mjs https://link.resbite.com QY833VTUWL com.resbite.app /tmp/resbite-link --legal=final`. It must print the success line; a refusal names the unfinished files (back to R0).
- [ ] **R4. [approval: Vercel] Preview.** From `/tmp/resbite-link`: `npx vercel link --yes --project resbite-link --scope creamos`, delete the `.env.local` it writes, note the newest Production row of `npx vercel ls --scope creamos` (the rollback target), then `npx vercel deploy --yes --scope creamos`. Check `/privacy`, `/support`, `/personal.js` and `/site.css` with `npx vercel curl <path> --deployment <preview> -- -sI` (200, the right type, the CSP).
- [ ] **R5. [approval: Vercel] Production.** `npx vercel deploy --prod --yes --scope creamos`.
- [ ] **R6. Live check.** `node links/check-live.mjs https://link.resbite.com` prints `PASS`. Record the `x-vercel-id`; its region should be `lhr1`.
- [ ] **R7. The form, live.** Send one message with "Help with the app" and one with "Data protection request or complaint", each from an address the owner reads. The first arrives at support@, the second at privacy@, and Reply goes to the sender. Delete both after.
- [ ] **R8. [approval: Vercel] Firewall.** A rate limit on `/i/*` with the same values as the existing `/r/*` rule (skip if the SMS sitting added it), and one on POST `/api/contact` (proposed: 10 requests per 10 minutes per IP, then deny). Record the values.
- [ ] **R9. [approval: Vercel] Region and plan (D7).** Confirm in the deployment summary that the functions run in London (`lhr1`). Record the Vercel plan and its log period for the placeholders in `docs/legal/privacy-notice.md` and `docs/compliance/vendors.md`.
- [ ] **R10. Records.** In `docs/legal/README.md`'s change log, the published commit for each document. Tick step 16 in `qa/app-store-release/README.md`. Fill "Applied" below.

After R6, `/terms` carries Terms of Use 1.0, which plan 4's rollout step 7 waits for. The literal it publishes equals R2's `TERMS_VERSION`.

## Rollback

`npx vercel rollback <the R4 deployment id> --scope creamos`. The variables can stay: the earlier build ignores `RESEND_API_KEY`, and the earlier pages read `TERMS_URL`, `PRIVACY_URL` and `TERMS_VERSION` as before.

## Applied

(Empty. Fill in at R10.)
