# Resbite development handoff — 7 October 2026

## Release position

Resbite is in **B0: account and data foundation for the expanded private beta**. The owner can use the signed iPhone development app and approved live catalogue. This is not yet an accepted standalone two-person beta, TestFlight release or public launch. A screen, local test or prepared worker is not evidence of live deployment.

The governing scope is the [expanded private-beta plan](milestones/2026-09-23-expanded-private-beta.md), with the [58-item scope mapping](../knowledge-base/13-expanded-beta-scope.md). It includes shared groups, live event chat, saved activities, time polls, recurring plans, calendar support, shared event photos and private wellness/history based on confirmed attendance and duration. iPhone comes first; Android follows. Payments, a public social feed, child accounts, advertising and premium products remain outside this release. Proposed numerical limits and retention rules still require their recorded decisions.

Only the approved owner account has tester access. The additional account used to inspect pending approval is not approved for access or destructive testing. Do not broaden the roster as part of ordinary development, Git publication or deployment preparation.

## Implemented, deployed and accepted

| Area | What exists | Evidence and remaining boundary |
| --- | --- | --- |
| App foundation | Expo 57, React Native, TypeScript, native tabs/stacks, shared branded cards/buttons, icons, haptics, loading/error states and reduced-motion handling | Signed iPhone development build previously installed and used. No new native build or device session was performed for this handoff. |
| Discovery | Search, temporary discovery filters, activity details, artwork, tips and duration treatment | Eleven approved entries published to the owner-only catalogue; original eight and three additions accepted on the phone. Painting suggests 30 minutes; the other originals and new additions have no default duration. Wine tasting remains an adult activity. Wellness taxonomy and general age policy are separate decisions. |
| Introduction and accounts | Introduction screens, email/password registration and confirmation, Google sign-in, password recovery, session restoration, access-status screen | Owner accepted Google sign-in/restart, Google cancellation recovery and branded password reset through sign-in. Pending-approval screen no longer crashes. Fresh confirmation after the native fix and a never-used expired link still need explicit acceptance. |
| Account details | Optional date of birth, phone, city and interests, atomic conflict-aware save/removal | Owner accepted save, reopen, removal, keyboard and date picker. Required core registration remains display name, email and password. |
| Profile photo | Native picker, normalization/private upload, account-bound requests, durable pending state and avatar revision compare-and-swap | Upload/persistence/removal and picker cancellation accepted. Offline action disabling/re-enabling accepted; this does not prove an interrupted upload or cross-account Storage races. Old private file cleanup remains disabled. |
| Planning | Create/edit/cancel, native scheduling, required meeting place, optional note/location, version conflicts, read-before-retry, persistent draft recovery | Preview planning, picker/keyboard and draft recovery accepted. Real-account interruption, concurrency and two-person acceptance remain pending. |
| People and invitations | Contacts integration, local reusable people/groups, independent selections, invitation preparation/recovery/revocation, claim/RSVP handling and pending-link retention | Client and backend foundation exist with fixture/SQL coverage. Local groups are not the planned shared groups. Complete real two-person flow remains unaccepted. |
| Accessibility and design | Lighter button text, branded depth/colour, larger-text responsive cards/rows and scrolling forms | Owner accepted Discover, My resbites, Wellness, Profile and editor at Larger Text. VoiceOver, Reduce Motion and remaining permission/offline paths still need device review. |
| Email | Resend SMTP and branded confirmation, recovery and email-code templates | Configured with Resbite sender at noreply@resbite.com; domain verification reported by owner. Password-reset delivery accepted. Secrets belong in provider settings, never the repository. |
| Notifications | Permission/status UI, endpoint preparation, transactional outbox and worker source | Dispatch, production credentials, deployment, operational handling and device delivery acceptance remain unfinished. |
| Deletion and cleanup | Client flow, local database lifecycle/retention/reservation migrations, encrypted independent-ledger adapter, coordinator and workers | Prepared and tested locally only. Source release switches remain false. No independent ledger project/bucket/credentials, complete restore replay or approved destructive acceptance exists. |
| Chat and wellness | Clearly labelled sample experiences | Live event chat and real history/wellness are not implemented release features. |

The [implementation journal](implementation-status.md), [B0 checklist](../qa/b0-account-foundation.md) and [device evidence](../qa/device-test-results.md) contain dated detail. Their older statements describe earlier snapshots; they should not override this current release position.

## Hosted backend versus source files

Last recorded hosted evidence is from September 2026; this Git handoff does not claim a new October production audit. The existing application project is `ewcsgvhuojxdpaspwsrx` in London. Reuse it. Do not create a replacement app project or run an indiscriminate `supabase db push`.

| Source migration | Recorded hosted migration/version |
| --- | --- |
| Private tester foundation | `20260917191323 resbite_private_tester_foundation` |
| `20260923150059_account_access_status.sql` | `20260923151512` |
| `20260923150902_atomic_registration_details.sql` | `20260923151515` |
| `20260923152900_activity_catalogue_details.sql` | `20260923154040` |
| `20260924150135_avatar_revision_compare_and_swap.sql` | `20260924150824` |

The notification delivery, account deletion, orphan photo cleanup, deletion receipt retention and deletion intent reservation migrations are **local preparation**. Hosted timestamps differ from source filenames, so migration history needs deliberate reconciliation before further application. Catalogue publication is separately recorded in QA evidence.

Email confirmation is required, Google is configured, anonymous sign-in is disabled, and leaked-password protection was enabled in the last recorded security review. App callbacks currently use `resbite://auth/callback` with recovery routing. The chosen owned domain is `resbite.com`; owned HTTPS invitations, association files and installation fallback are not yet a deployed, accepted link system.

## Immediate unfinished work: close B0

1. **Complete independent deletion recovery before enabling deletion.** Existing modules in `supabase/functions/_shared/` encrypt minimal intents with AES-256-GCM, write immutable records to a distinct Supabase project and require exact read-back before database activation. Prepared database reservations keep retries stable and allow activation after original proof expiry. This is useful groundwork, not a complete disaster-recovery system.
   - Implement inventory/checkpoint evidence proving recovery has every required intent.
   - Implement background reconciliation of independently recorded intents, including lost activation replies and expired original proof.
   - Implement and test fenced restore replay: app access and workers stay closed until replay completes.
   - Define recoverable encryption-key custody and rotation/restore procedures.
   - Provision and verify an independently protected private project/bucket only after provider/cost decisions. No such resource has been created.
   - Review or retire the historical raw service request RPC before activation; do not bypass ledger admission.
   - Test real Auth and Storage races using explicitly approved disposable identities, without deleting either existing user.
2. **Approve and operationalize retention.** Seven continuous days for orphan observation and thirty days for completed deletion receipts are proposals. Finalize policy, monitoring, schedules, alerting and restoration responsibilities. See [retention proposal](../qa/b0-retention-proposal.md), [recovery ledger](../qa/deletion-recovery-ledger.md) and [photo cleanup readiness](../qa/photo-cleanup-readiness.md).
3. **Finish account/device acceptance.** Fresh email confirmation following the navigation fix; genuinely unused expired link; interrupted photo request/retry; account switching; real Storage authorization/races; VoiceOver and Reduce Motion. Reused-link error handling and offline-disabled photo actions are narrower checks already accepted.
4. **Perform a final B0 deployment and evidence review.** Apply only explicitly selected migrations/functions after prerequisites are met. Keep account deletion, receipt purge and photo cleanup source gates closed until their acceptance requirements pass. Do not mark B0 complete based on unit tests alone.

## Remaining roadmap and completion criteria

| Milestone | Work still needed | Completion evidence |
| --- | --- | --- |
| B1 — reliable two-person use | Real invitations and RSVP across two approved accounts, owned HTTPS links, cold/warm start and install fallback, real notification delivery, interruption/retry and standalone distribution | Two-person acceptance script on physical devices, successful delivery and restart/offline checks, release independent of Metro |
| B2 — personal discovery and shared groups | Saved activities, join/leave shared groups, group page/upcoming plans and unified personal overview | Membership/visibility enforcement and multi-account create/join/leave/plan tests |
| B3 — live event chat | Persistent realtime event conversations, pagination/reconnection, report/block and moderation rules/tools | Participant authorization, removal/block behavior and delivery/recovery tests |
| B4 — richer planning | Time polls, recurring plans and calendar support with explicit edit/time-zone/permission rules | Multi-user voting and finalization, recurrence exceptions, calendar permission and time-zone acceptance |
| B5 — real history and wellness | Confirm attendance and actual duration; private time/category summaries | Scheduled-only plans never count automatically; correction and privacy tests; agreed wellness taxonomy |
| B6 — event albums | Shared event photo upload, access, removal/reporting, storage limits and lifecycle integration | Participant-only access, upload recovery and cleanup acceptance |
| B7 — complete iPhone private beta | Full regression, accessibility, performance, privacy/support materials, operational readiness and controlled invited-user rollout | Release checklist accepted; all critical gaps closed and access explicitly approved |
| B8 — Android | Native permissions, contacts, links, notifications, layouts and release testing | Equivalent Android acceptance after iPhone milestone |

Use the governing plan for detailed dependencies. Shared groups and real chat are new implementation work; existing local groups and sample chat must not be relabelled as complete. Broader tester access remains a separate decision.

## Verification on 7 October 2026

Before Git integration, these checks passed on this Mac:

- `cd mobile && npm run check`: TypeScript, 119 tests and the full artwork/content approval checks for eight originals plus three additions.
- `node --experimental-transform-types --test supabase/functions/_shared/*.test.ts`: 51 backend tests, including ledger/admission and disabled-release behavior.
- `./scripts/test-database.sh`: eleven SQL assertion files and four real concurrency scripts; no synthetic tester roster entries retained.

These checks cover local logic and isolated database behavior. HTTP mocks are not live provider verification. No new iPhone acceptance, standalone build, push delivery or destructive hosted test was performed for this handoff. Final Git integration checks are recorded below when complete.

## Running and continuing development

This is one repository; `mobile/` is not a nested Git repository. Work from the repository root, with app commands inside `mobile/`. Read `mobile/AGENTS.md` and the exact versioned Expo documentation before code changes.

```sh
# Homebrew Node 22 on this Mac, if needed:
export PATH="/opt/homebrew/opt/node@22/bin:$PATH"
cd mobile
npm ci
npm run check
npx expo run:ios --device
```

Install Xcode and its matching iOS components, configure Apple signing, and connect/unlock/trust the iPhone. A JavaScript-only update can use the running development server; native dependency/configuration changes require rebuilding. Follow [mobile setup](../mobile/README.md) for detailed commands and QA scripts. The root `scripts/test-database.sh` supplies isolated SQL validation; read it before substituting any database target.

Copy `mobile/.env.example` to a locally ignored environment file and obtain the existing project's public app configuration. Never put server, SMTP, encryption or signing keys in the app or commit them. Dependencies, generated native folders, local environments and original agency source archives remain outside version control. Selected artwork, approval manifests, QA evidence, scripts and font notices belong in the repository.

Useful entry points:

- `mobile/app/`: screens and navigation; `(tabs)` contains the main tabs.
- `mobile/src/state/`: session/account and app state; `services/` contains provider/client boundaries; `domain/` contains rules and recovery logic.
- `supabase/migrations/`, `supabase/functions/`, `supabase/tests/`: schema, workers and backend checks.
- `supabase/templates/`: branded email sources.
- `links/`: owned-link preparation.
- `qa/`: approval snapshots, review pages, device results and operational readiness evidence.

## Git integration

GitHub had an earlier owner-plan-editing/guarded-refresh commit not yet present in this working copy. Preserve its history and useful SQL assertions while retaining the newer local planning/recovery implementation. The remote's old planning helper tests need reconciliation with the current interfaces; do not restore obsolete helpers simply to satisfy an old test. No hosted deployment or access change is part of this commit-and-push task.
