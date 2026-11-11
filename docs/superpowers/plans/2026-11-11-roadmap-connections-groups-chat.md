# Roadmap: everything left of connections, circles of trust, groups and chat

**Date:** 11 November 2026. **Base:** `main` at `3e5d37f`, pushed.
**Designs (approved 10 November 2026):** `docs/superpowers/specs/2026-11-10-connections-and-circles-design.md` and `docs/superpowers/specs/2026-11-10-groups-and-chat-design.md`; mockups in `docs/superpowers/specs/2026-11-10-connections-groups-chat-mockups/`.

This document orders the remaining work. It holds no tasks of its own: each step below names the plan that carries the tasks, or the runbook that carries the owner's steps.

## Where things stand

| Piece | State |
|---|---|
| Connections (plan 1) | Built, merged, pushed. Migration `20261110120000` live on hosted since 11 Nov; sender redeployed (version 4). Waiting for a TestFlight build and the two-phone checks (`qa/connections-2026-11-10/README.md`). |
| Creating a resbite | Migration live since 5 Nov; sender redeployed. Still open from its runbook (`qa/creating-a-resbite-2026-10-31/README.md`): step 5 (link site to production, inside the sitting), step 6 (TestFlight build), step 7 (the roll job). |
| Phone key | Live since 29 Oct. Still open from its runbook (`qa/phone-key-2026-10-29/README.md`): step 7, the rewrite script for older Argentine accounts, in the same sitting as the link-site deploy and the build's release. |
| Circles of trust | Plan written 10 Nov, refreshed and revised after its challenge 11 Nov: `2026-11-10-connections-2-circles-of-trust.md` (7 tasks). |
| Groups and chat | Design approved; plans written 11 Nov (below). |
| Report and block | Part of the chat design (CH-P13); plan written 11 Nov (below). |

## The order

### Phase 0: ship what is built (owner, now)

1. **TestFlight build** from `main` `3e5d37f` on the Mac: `git pull`, start Expo once (the typed-route file), `npx eas build --platform ios --profile production`, `npx eas submit --platform ios --latest`. It carries creating-a-resbite and connections.
2. **The sitting** (creating-a-resbite step 5, phone-key step 7), minutes apart, with the owner's go:
   - link-site preview, then production;
   - release the build to the testers' group;
   - the rewrite script for older Argentine accounts in the SQL editor, with its before and after counts;
   - tell the Argentine testers to use the new build and page.
3. **Device checks** from the creating-a-resbite, push, phone-key and connections runbooks.
4. **Hold the roll job.** Today's roll drops a guest who changed from Going to Can't go (CH-P20). Phase 1 fixes it; create the job after Phase 1's migration is live.

### Phase 1: follow-ups and the roll fix

- **Plan:** `docs/superpowers/plans/2026-11-11-connections-3-follow-ups.md` (4 tasks, branch `co3-follow-ups`).
- **What it ships:**
  - the roll carries every guest;
  - the request push says "both going", "both invited" or "were both at", according to what is true;
  - a concurrency test for two people asking each other at once;
  - the connection polish the final review deferred.
- **Rollout:**
  - one migration (`20261111120000_connections_follow_ups.sql`), approved by name and sha256, with snapshots;
  - a sender redeploy;
  - then **the roll job** (creating-a-resbite step 7, owner-run);
  - the app polish rides the next TestFlight build.

### Phase 2: circles of trust

- **Plan:** `docs/superpowers/plans/2026-11-10-connections-2-circles-of-trust.md` (7 tasks, branch `co2-circles-of-trust`). Read its "Revised 11 November 2026" section first.
- **Rollout:**
  - one migration (`20261111130000_circles_of_trust.sql`); if Phase 1's is still pending, both go in one sitting, in order;
  - the migration goes live before the TestFlight build reaches testers (the build calls its functions);
  - a sender redeploy (the "· brought by" wording);
  - a link-site deploy (the inviter line);
  - a TestFlight build;
  - device checks: set the circle, bring a connection and a phone contact on two phones, the chain on the people list, remove the bringer.

### Phase 3: chat, groups and safety, one release

The three chat plans build on the circles migration, so Phase 2 is merged first:
- chat plan 1 copies `claim_notification_deliveries` and the guarded `request_account_deletion` from the circles migration, and its trigger on `public.plans` ignores updates that change only `bring_invites`, `bring_levels` and `version`;
- chat plan 2 copies the roll from the circles migration.

Three plans, built in this order, **released together** (one TestFlight build; their migrations applied in one sitting, in order). Chat must not reach testers without report and block (App Store guideline 1.2) or without the group rules (a repeating resbite's chat would otherwise follow one-off rules).

| Plan | Branch | Tasks | What it builds |
|---|---|---|---|
| `docs/superpowers/plans/2026-11-11-chat-1-core.md` | `ch1-core` | 9 | Messages, the chat per series, one-off membership and the 48-hour close, announcements, system lines, Realtime transport with the poll fallback, the two chat pushes with the one-per-minute rule, the two mutes, unread, the chat screen, the Chat row, the When-sheet line, the announcement on invitation cards. |
| `docs/superpowers/plans/2026-11-11-chat-2-groups.md` | `ch2-groups` | 4 | The sticky group flag, group membership whatever the reply, the group close, Leave group, group visibility of the people list (CH-P21) and the CO-P2 exception, the "ended" and "Next one" lines, group audiences and wording. |
| `docs/superpowers/plans/2026-11-11-chat-3-safety.md` | `ch3-safety` | 7 | Blocks and reports, hiding a blocked person's messages and pushes, block ending a connection (CO-P14), Report or block in the chat and the people list, the reports queue scripts, the support address on Data & privacy, the App Store review notes. |

**Rollout (owner, with approvals):**
- the three migrations;
- the Realtime setting "Allow public access" switched **off** in the dashboard (CH-P10), before the build reaches testers;
- the sender redeploy;
- the support address set in the EAS production environment (`EXPO_PUBLIC_SUPPORT_ADDRESS`);
- the TestFlight build;
- two-phone checks: a message arrives live and as a push; mute; a blocked person's messages hidden; a removed person's open chat stops; a one-off closes 48 hours after its end; a group carries its chat to the next Thursday; Leave group.

## Owner decisions, and when they are needed

| Decision | Needed before | Default if none |
|---|---|---|
| Create the roll job now, or after Phase 1 (recommended: after) | Phase 0, step 4 | Held until Phase 1 |
| A brought person who said Can't go is carried pending to the next occurrence, so a bringer's used invites may exceed what the host allows (circles C-R11) | The circles migration | Carried, as CH-P20 says; their remaining invites read 0 |
| The support address (`EXPO_PUBLIC_SUPPORT_ADDRESS`, shown on Data & privacy and in the App Store notes) | Phase 3 release | Release blocked; the app hides the line while unset |
| Who moderates (G-B4(c)): who is in `private.moderators`, gets the "A new report is waiting." push and reads the reports queue daily | Phase 3 release (`supabase/ops/moderators.sql` before the build reaches testers) | The owner alone, with one email in `moderators.sql` and a daily check of `open-reports.sql` |
| The blocked-terms list (G-B4(a)) | Phase 3 release (the runbook's gate checks the table is not empty) | Nothing is seeded. The gate fails while `private.blocked_terms` is empty, so the release waits |
| The chat-rules wording, and an update to the Terms document (G-B4(d)) | The wording: Phase 3 plan 3, Task 4. The Terms document: the App Store submission | The rulings' wording ("Be kind. No harassment, hate, threats or spam. …" with "I agree"). The Terms document and `TERMS_VERSION` stay as they are |
| Delete and Remove after a chat closes (K-S17) | Phase 3 release (plan 1 builds the default in Task 2) | Allowed: an author deletes their own message, and hosts remove others', after the close |
| Whether a blocked person can still invite or bring the blocker (G-S13) | Phase 3 plan 3, Task 1 | No. Their `invited` notice is not eligible, and the blocker's number reads to them as an unknown one. The inviter is never told |
| Chat pushes show the message text on the lock screen (CH-P7), or "Leo sent a message" | Phase 3 plan 1, Task 4 (the push copy) | The text, as designed |
| What to tell Stephen. Five departures: 48 hours not 7 days; connections wait at the open link; messages stored on the server; no linked chat for Do this again; a refusal looks like "Request sent". | Before testers see chat | Nothing sent |
| The Realtime dashboard setting | Phase 3 release | The release waits |

## Rules that hold across every phase

- Nothing touches the hosted project without the owner's approval:
  - migrations by file name and sha256, with before and after snapshots compared to a replay of `supabase/tests/hosted-baseline/migrations.txt`;
  - never `supabase db push`, never `migration repair --status reverted`, never `db pull`.
- The assistant's safety check refuses live reads and the apply itself, so the owner runs those from short `~/…sh` scripts. The function deploy has been allowed from the assistant's side.
- Each plan is executed on its own branch in `.worktrees/`, reviewed per task and as a whole branch, then merged by the owner's choice.

## Not on this roadmap

- **By the owner's decision:** unnamed plus-ones, people search or discovery, profile pages, Android.
- **Later items from the designs:** photos after a resbite, chat export, a conversation across different series, linking a "Do this again" chat, unpin, monthly repeats.
- **Outbox retention** (chat K-N11): chat writes one outbox row per recipient per message; a cleanup of delivered rows comes later, once the volume is known.
- **The account-deletion lifecycle on hosted** (the GI2 work) is its own project. Connections and chat add their delete steps to the local lifecycle; they run on hosted only once that project ships.
- **The SMS provider** (Twilio through the Send SMS hook) and the Auth settings left from the phone-accounts work. These are a separate track; see `reports/Phone messaging providers.md`.
