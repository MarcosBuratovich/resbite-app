# MVP objective: real-account readiness

Created 23 September 2026. Status: in progress; all three branded Auth templates and the B0 account RPCs are deployed. Confirmation recovery and optional-detail/Google-parity UI are implemented. Owner accepted optional-detail save/removal, the keyboard/date picker, Google sign-in, app restart and branded password-reset delivery/callback/save/sign-in on iPhone; remaining confirmation/cancellation/lifecycle acceptance is pending. This milestone now supplies B0 of the [expanded private-beta plan](2026-09-23-expanded-private-beta.md). Scope expansion is recorded there; the sample views remain until their live replacements are implemented and verified.

## Outcome

Move Resbite from a polished development preview to verified real-account onboarding on an iPhone. Registration, confirmation, sign-in, recovery and restart restoration must work, while an unapproved account cannot access shared Resbite data. The owner account is now explicitly approved; broader tester access remains closed. It is not the complete two-person MVP acceptance milestone.

Within this account milestone, retain the existing brand/components and the owner's expanded registration fields. Chat/wellness stay labelled samples until their later live milestones in the expanded plan. Do not add marketplace, SMS login, child accounts or a recommendation engine.

## Work in order

| Order | Work | Completion evidence | Dependencies |
| --- | --- | --- | --- |
| 1 | Finish branded reset and email-code templates; retain hosted confirmation template | Source-controlled HTML, correct Supabase variables, narrow/wide preview checks; hosted save verified separately | Dashboard session for deployment; no test email without an agreed recipient |
| 2 | Finish onboarding recovery and account-data controls | Resend-confirmation cooldown/error handling; expired/wrong-device link guidance; view/edit/remove optional birth date, phone, city and interests; equivalent details flow for new Google accounts; profile/photo remains optional | Implemented and tested; extras remain optional/private. Owner accepted native save/removal; larger-text/VoiceOver acceptance remains |
| 3 | Configure Google and verify real email/password lifecycle | Physical iPhone registration → email → callback → session; login/reset/reused-link/Google-cancel cases; restart and sign-out; screenshot/result log without secrets | Google is enabled in hosted settings; sign-in/restart are owner-accepted; cancellation and inbox delivery still need device acceptance |
| 4 | Verify the closed-access experience | Unapproved verified account sees a clear access-pending state; no plan/profile mutation bypass; invitation stays pending through auth; no repeated generic errors masquerading as onboarding | Keep server roster enforcement unchanged; opening access is not authorized by this milestone |

## Parallel release preparation, after the account path is stable

1. **Links:** host invitation fallback/AASA on resbite.com, configure native associated domain and rebuild; test installed/uninstalled and cold/warm paths. The current native Auth callback remains until an HTTPS Auth handler actually exists. Domain ownership alone is not deployment.
2. **Data lifecycle:** review/deploy the two prepared migrations and disabled workers, agree deletion-receipt/log/backup retention and scheduler; finish active-account orphan-photo cleanup. Verify actual Auth/Storage authorization, fresh proof, retry and cleanup before enabling deletion.
3. **Notifications:** wire native permission/token/foreground/tap adapters and sign-out cleanup; configure Expo/APNs; test on devices before removing the hard-disabled dispatch gate. Local helpers are already implemented; delivery is not.
4. **Content:** owner reviews the eight draft activity/copy/category pairs; publish only the approved catalogue. Keep existing artwork provenance.
5. **Distribution:** create a signed build that launches without Metro; review dependency findings; test new onboarding with Larger Text, VoiceOver, Reduced Motion, denied permissions, offline and keyboard states.

These are release prerequisites, not already completed work. External writes must have concrete reviewed inputs; do not create a replacement Supabase project or reapply the foundation migration.

## Exit criteria for this objective

- [x] Branded reset email is saved, received and completes password reset/sign-in on the owner's iPhone.
- [ ] Branded signup-confirmation email is received and completes confirmation on the iPhone.
- [ ] Email-code template matches the deletion proof flow; deployment does not activate deletion.
- [ ] Email/password and Google onboarding reach the correct next step, with optional details editable/removable.
- [ ] Confirmation, reset, expired/reused links, cancellation, sign-out and restart restoration have recorded physical-device results.
- [ ] Unapproved account stays blocked, with a usable explanation and preserved pending invitation.
- [x] README/status/QA evidence distinguish live verification from intercepted fixtures.

## Following objective: two-person MVP acceptance

Only after release prerequisites and explicit tester-email approval: install standalone builds on two phones; discover an approved activity, create/edit a plan, share a real invitation, accept/decline, observe refresh/notifications, cancel, then verify account cleanup. Record failures and retest fixes. This remains the product's acceptance target; no percentage or launch date is inferred.

## Immediate deliverables

- Confirmation: already hosted; live inbox acceptance pending.
- Reset and email-code templates: deployed to Supabase on 23 September after preview checks; real delivery acceptance remains pending.
- Confirmation recovery and self-service optional details/Google parity are implemented; owner accepted native optional-detail operations. See [B0 implementation evidence](../../qa/b0-account-foundation.md).
- Next acceptance: signup confirmation/expired links and Google cancellation on iPhone, then remaining lifecycle/content prerequisites. Full B0 is not yet complete.
