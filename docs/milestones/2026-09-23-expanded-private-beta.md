# Resbite MVP 2 — complete private beta

23 September 2026. **Feature direction agreed with the owner; detailed operating rules below are proposed implementation defaults.** This is the development plan, not a claim that the expanded features are implemented or ready for testers.

## Outcome and decisions

An invited group can discover something to do, choose people, agree a time, organize a real resbite, coordinate in its conversation, share photos afterward and see a private record of the time they actually spent together. They can repeat that experience without rebuilding their social circle or their plans each time.

The owner selected:

- A **complete private beta**, before a public launch.
- **iPhone first, Android immediately afterward** as a separate delivery milestone.
- Live event chat, real activity history and wellness, saved activities, better planning, calendar support, time polls, shared event photos, recurring plans and richer groups.
- **Shared groups:** members join/leave and see a group page and relevant upcoming plans; conversations stay attached to events.
- **Self-confirmed attendance and duration:** each person confirms their own participation and time. Scheduling or accepting a plan alone does not count toward wellness.

These choices supersede the old sample-only chat/wellness boundary and the deferral of saved activities, time polls and event photos. They do not approve every inherited wireframe feature. Payments, marketplace, child accounts, advertising and public social feeds remain outside this beta. Polls/photos are included without a premium subscription system.

Tester access stays limited to the already approved owner account until specific additional accounts are authorized. This planning task changes no hosted settings or access.

## Evidence reviewed and present position

Read with the [expanded scope mapping](../../knowledge-base/13-expanded-beta-scope.md), which accounts for all 58 items in the original register, and the [implementation history](../implementation-status.md). The original first-test specification remains a historical baseline; this document controls the selected expansion.

The review covers README, the twelve knowledge-base chapters, the first-test specification/plan, the current real-account milestone, implementation and readiness records, and relevant searchable wireflow extracts: discovery (S0677), invitations (S0678), event management/chat (S0679), settings (S0680), profile/places (S0682), groups (S0683), scheduling/places (S0684/S0685), completion (S0686), attendance limits (S0688), wellness (S0689), photos (S0691), and later weather/guru concepts (S0692/S0693). V3 annotations and the source-precedence register explain earlier cuts.

The original 3.6 GB archive is on the other machine. This review uses its local audit and text derivatives; it is not a fresh visual inspection of every original artboard. The encrypted deck, untranscribed recordings and native-layer limitations remain documented in the [audit report](../../knowledge-base/07-audit-report.md).

| Area | Current evidence | Work still needed |
| --- | --- | --- |
| App and interface | Signed development build runs on the owner's iPhone; compact cards, gluestack primitives, native tabs, motion and draft recovery exist | Standalone build, new-screen accessibility and full native acceptance |
| Accounts | Introduction, expanded email registration, sign-in/reset and optional photo client exist; owner account approved | Confirmation resend/recovery, editable optional fields, Google parity/configuration and real lifecycle testing |
| Email | Confirmation, recovery and email-code templates saved in Supabase; Resend SMTP configured | Actual inbox rendering, delivery and phone callback evidence |
| Discovery | Eight illustrated activity drafts and search/category UI | Editorial/taxonomy approval and live publication; saved activities are new work |
| Plans and invitations | Protected backend, plan edits/cancellation, invitation claim, RSVP and recovery clients | Owned HTTPS links and full two-phone acceptance; richer schedule/polls/series are new work |
| People | Device-local contact lists/groups and deliberate recipient selection | Shared membership model and group pages; existing lists are not shared groups |
| Chat and wellness | Labelled fictional samples only | Persisted chat, completion records and private calculations |
| Push and deletion | Local migrations/workers and injected tests prepared; activation disabled | Hosted deployment/verification, native adapters, credentials, cleanup schedule and retention decisions |
| Event photos/calendar | No completed implementation | New private album and native calendar integration |

Recorded test passes establish the earlier milestones only. No app tests were rerun and no live account flow was exercised while writing this plan.

## Product shape

Keep Discover, My resbites, Wellness and Profile. Add a prominent Groups entry in My resbites and Profile before deciding that a fifth tab is necessary.

| Surface | Main job | Main action |
| --- | --- | --- |
| Introduction/account | Explain the app, create/restore identity, manage private details | Continue / confirm / sign in |
| Discover | Browse reviewed ideas, search, save and select an activity | Plan this activity |
| My resbites | Separate invitations/polls, upcoming plans, drafts and past events | Respond or open a plan |
| Shared group | See members and plans the current person can access | Plan with this group |
| Plan overview | One place for schedule, location, RSVP, people and updates | Role-appropriate next step |
| Conversation | Coordinate with accepted attendees | Send a message |
| Photos | Add/view a private event album | Add photos |
| Wellness | Confirm participation and review personal time/category history | Confirm a past resbite |
| Profile/settings | Edit details, permissions, notification preferences, support and deletion | Contextual settings rows |

Use the owner's accepted visual direction: warm cards, restrained depth, meaningful coloured icons, regular-weight button labels, pink primary actions and white/lilac secondary controls. Pills are for short filters/statuses; settings and multiple actions use rows or menus. Keep one clear primary action per screen, usable native sheets and expanding text layouts. Continue the existing components and motion system; adding UI libraries is not itself a product milestone.

## Feature contracts

The capabilities are selected. Numeric limits, visibility details, closure periods and similar rules in this section are **proposed defaults**, to be checked at the relevant milestone before their migrations or UI contracts are finalized.

### F1 — Complete account lifecycle

- Keep Google and confirmed email/password. Introduction is skippable. Name is required; date of birth, phone, city, interests and photo remain optional unless the owner changes that decision.
- Add confirmation resend with server-aware cooldown, check-status, expired/reused/wrong-device guidance and a clear access-pending state.
- Offer the same optional-details completion and editing to Google users. View, edit and remove private details after registration; changes cannot grant authorization.
- Keep email/password recovery, account-switch isolation, photo replacement/removal, sign-out and deletion complete and retryable. Do not silently link identities by an email string.
- Finish fresh-auth deletion and active-account orphan-photo cleanup before inviting a wider cohort. Extend deletion for every new data type introduced below.
- Decide distribution before submission. If TestFlight is chosen, review the Google sign-in alternative against Apple's guideline 4.8; Sign in with Apple is a recommended resolution to assess, not an already approved provider. Ordinary email/password must not simply be assumed sufficient. [Apple review guidelines](https://developer.apple.com/app-store/review/guidelines/#login-services)

**Acceptance:** real confirmation/reset/Google cancellation and restoration on an iPhone; all optional details removable; an unapproved verified account cannot enter shared data; an incoming invitation survives the full account flow.

### F2 — Discovery people can return to

- Publish the eight reviewed existing pairs first. Propose expanding to around 24 varied activities for the full beta, subject to copy/artwork approval; the number is a content target, not a reason to publish filler.
- Keep title/category search; propose adding reviewed tags, duration and indoor/outdoor filtering as the bounded discovery improvement. Do not inherit every historical filter.
- Save/unsave activities to the account, with a Saved view and clear unavailable states when an activity is retired. Account switching never shows another user's saves.
- Approve separate discovery categories and wellness benefits; the existing mixed draft labels cannot define the wellness formula by accident.
- Detail includes practical preparation, suggested duration, source-backed artwork and useful tips. No unsupported therapeutic promises or paid featured placements.
- Content remains maintainer-reviewed. A suggestion form, automated recommendations and user-published catalogue entries are later candidates.

**Acceptance:** search plus filters compose correctly, saved items survive reinstall/sign-in, unpublished content is inaccessible, and each published item has approved copy, categories and artwork provenance.

### F3 — Shared groups

- Create/name a group, choose an icon, invite approved users deliberately, accept/decline membership, view members, leave, and let its owner remove members or archive the group.
- Keep one group owner initially. Ownership transfer/additional admins remain a separate decision. An owner who leaves must archive; deletion archives their groups without transferring control silently.
- Any current member can propose a plan to selected current members. That person owns the plan. Group ownership does not grant control of other people's plans.
- Group membership and event participation are different records. Invitations use a snapshot of selected members; joining later does not expose past events/photos/chat. A group page only lists plans the viewer is authorized to see.
- Leaving/removal blocks future group access and invitations. Existing event participation is shown separately and does not change silently; provide explicit leave/remove controls for those plans. Explain this before confirming the group action.
- Existing local contact lists remain private and separately labelled. Never upload them or turn people into shared members during an automatic migration. Group membership requires an authenticated acceptance.
- The server stores joined user IDs and group details, not an address-book export. No public group directory or persistent group-wide chat in this beta.

**Acceptance:** two accounts see consistent membership; a third non-member cannot enumerate the group; late joiners cannot see old event contents; group edits do not rewrite existing RSVPs.

### F4 — Stronger planning and a single event overview

- Keep the existing durable draft and uncertain-save recovery. Add a planned duration/end time, initially prefilled from the activity and editable. Preserve UTC instants and the event's IANA time zone.
- Duration is planned time, not proof of participation. Overnight plans can have a valid end date; elaborate multi-day itineraries remain outside this beta.
- Offer manual place entry, optional current location, a reviewed place-search adapter, saved places and an explicit action to open directions. Saved places belong to their owner; no mandatory home/work addresses or background location.
- Show plan details, RSVP totals, change notices, chat and photos together. Keep invitation preparation separate from actual sharing/delivery.
- Preserve current owner edit/cancel rules and server version checks. Changes to time/place flag the revision for attendees to review; do not fabricate new RSVPs. Cancellation is terminal for that occurrence.
- Show pending, accepted, declined and withdrawn clearly. Include duplicate/expired/revoked/forwarded links and removal from a plan in the actual flow.

**Acceptance:** an edit during another device's RSVP does not overwrite state; interrupted saves recover; invalid/DST-ambiguous times are explained; denied location never prevents manual planning.

### F5 — Time polls

- Organizer proposes 2–5 possible start times with a common planned duration and a voting deadline. These numbers are defaults to validate in UI review.
- Invited signed-in members can mark each option available, maybe or unavailable and revise their choices while open. Named votes are visible to those invitees; disclose this on the poll.
- Organizer finalizes one option explicitly, even if the most popular option is tied. No automatic choice or assumption that everyone can attend.
- Finalization creates/confirms one scheduled occurrence exactly once. Poll responses are availability, **not RSVP**: invitees then accept/decline the final plan.
- Adding/removing options uses a new version; votes on unchanged options remain, while changed options require a new response. A closed/cancelled poll rejects late votes.
- Group members added after poll creation receive no access until explicitly invited. No guest voting or import of personal calendars.

**Acceptance:** simultaneous votes/finalization agree on both phones, retry cannot create two plans, and voting yes never silently marks someone attending.

### F6 — Repeat and recurring plans

- Repeat a past plan into a new draft, reusing the activity/place and a reviewable people selection. Require a new date and fresh invitations/RSVPs.
- Support bounded weekly, fortnightly and monthly series. Propose a required end date/count and at most 12 occurrences per series; preview all occurrences before publishing.
- Each occurrence has its own identity, RSVP, chat, photos and completion record. No infinite generation or automatic attendance across the series.
- Keep wall-clock time in the chosen zone across daylight-saving changes. For monthly dates absent in a month, propose the last valid day and make the preview explicit.
- Edit/cancel either one occurrence or future unstarted occurrences with a visible summary of affected dates. Past history is immutable except a user's own completion corrections.
- Participant selection is deliberate; new group members are not automatically added to an existing series. A poll can establish the first date, then the organizer reviews the recurrence separately.

**Acceptance:** retries cannot duplicate occurrences; skipping/changing one leaves others correct; DST/month-end cases pass; every occurrence needs its own attendance confirmation.

### F7 — Calendar support

- Add a confirmed plan to the device calendar through an explicit native action, with title, start/end, zone, place and a non-secret link back to Resbite.
- Record the device-local event reference when the platform supplies it. Offer user-initiated update/removal for that exported event after a plan change/cancellation; explain unavailable/deleted calendar items and permission limits.
- Resbite remains the source of truth. No importing unrelated calendar contents, Google Calendar account integration, availability scraping or two-way background sync.
- Prefer system calendar UI and the least access supported by the selected adapter. Validate create/update/delete behavior on the pinned SDK before choosing exact APIs: current Expo documentation has changed calendar APIs and separate write-only permission behavior. [Expo Calendar](https://docs.expo.dev/versions/latest/sdk/calendar/)

**Acceptance:** correct time zone/duration, cancellation of the native sheet is not success, retries avoid duplicate additions where reconciliation is possible, and declined permissions leave the plan usable. Do not promise silent synchronization.

### F8 — Live event conversation

- Text messages between the organizer and accepted attendees, with pagination, unread markers, visible sending/failed states, retry and deletion of one's own messages. No direct-message inbox, voice/video calls, attachments or typing/presence surveillance in this version; photos have their own album.
- Persist messages through authenticated server operations with stable client IDs. A lost reply must not duplicate a message. Reconnect loads missed messages from persisted history.
- System notices summarize plan changes/cancellation without posting private account fields. Unread state is per user; individual read receipts are not required.
- Pending/declined/withdrawn/removed participants cannot read or send. Existing recipients cannot be made to forget already seen content, but new server reads/writes and media access must stop.
- Propose read-only chat 72 hours after planned end, and immediately after cancellation. Show the closure state; closing chat is separate from deleting retained history.
- Include mute, report, block and an operator response path. Blocking prevents new invitations from that person and hides their authored content for the blocker; it does not secretly remove either person from an existing shared event. Show shared-event implications and offer leaving. No claim of end-to-end encryption.

**Acceptance:** real messages arrive on two phones, reconnect catches up once, removed members fail server access even with an existing session, and mute/report/block behave as described.

### F9 — Real completion, history and wellness

- After the planned end, each person is asked whether they attended and how many minutes they spent. Allow skip, later confirmation, edit and removal; an organizer cannot confirm for everyone.
- Separate past scheduled events from confirmed completed records. Count only the current user's explicit attendance records, once per occurrence. Cancelled, declined, withdrawn and unconfirmed plans do not contribute automatically.
- Personal summaries show completed count, reported time, monthly/weekly trends and category breakdowns. Provide a clear empty state and a way to see the records behind each total.
- Proposed allocation: assign one or two reviewed wellness categories per activity and divide minutes equally between them. A 60-minute Natural/Mindful activity contributes 30 minutes to each and 60 minutes overall. Version the category snapshot on completion so later editorial changes do not silently rewrite history.
- Define the reporting time zone; propose the user's chosen display zone for period boundaries. Duration is self-reported. Flag apparent overlapping records for review; do not imply objectively measured time.
- History and wellness are private to the person. No relationship-quality scores, comparisons with friends/households, inferred attendance, phone screen-time collection, health scoring or streak rewards.

**Acceptance:** real zero-data state, known fixture totals including dual categories, edits/deletes update aggregates, another member cannot read the record, and repeated confirmation cannot inflate time.

### F10 — Private event photos

- Accepted attendees can deliberately select images, see upload progress/retry, view an album/full image and save an image through an explicit device action. Display attribution by the participant-safe name.
- Re-encode selected images, strip location/other metadata, create thumbnails and enforce MIME/size/count limits on the server. Propose 20 images per person per event, 100 per event, 2 MB per normalized image; validate quality and service costs before enabling these defaults.
- Use private storage and membership-checked access. A public URL must not become the sharing mechanism. Short-lived signed URLs have an expiry window; previously downloaded files cannot be remotely recalled. [Supabase Storage access models](https://supabase.com/docs/guides/storage/buckets/fundamentals)
- Uploaders can delete their images, including through a narrowly scoped own-content control after losing event membership. Organizers can hide/report inappropriate images; authorized operators can remove them with an audit record.
- Proposed upload window: during the event and seven days afterward. Retained viewing follows the separately approved beta retention policy. Cancelled events reject new uploads.
- Include explicit consent-oriented copy: only share photos you are comfortable sharing with these participants. No face tagging, likes, public albums, automatic library upload, video or photobooks.

**Acceptance:** retry-safe uploads, permission denial, private thumbnail/full-image checks, metadata stripping, leave/removal/account deletion, quota races and orphan cleanup on real Storage APIs.

### F11 — Useful notifications and support

- Finish actual invitation/RSVP/time/place/cancellation delivery first. Add grouped chat updates, poll-finalized/deadline notices and optional event reminders as proposed extensions supporting the selected features.
- Per-event conversation mute and category preferences; no repeated reminder campaign. Propose one reminder 24 hours before and no catch-up notification when a plan is created inside that window.
- Generic lock-screen copy, authenticated detail refetch on tap, per-account device binding and cleanup on sign-out. Denial never blocks the app.
- A compact updates list within My resbites is sufficient; avoid another feed. No SMS campaign, marketing automation or mandatory email copy of every event update.
- Provide clear help/feedback and an operated report queue. Record owner/support contact and response responsibility before chat/photos reach the wider beta.

**Acceptance:** foreground/background/terminated delivery paths, invalid-token cleanup, no cross-account notification content, no send storm on a recurring-series edit, and usable in-app updates when push is disabled.

## Data, access and operations

Keep React Native/Expo/TypeScript, Supabase and the existing design system. Evolve the existing project through versioned, reversible migrations; do not replace it or reapply its initial schema. Preserve existing plan IDs, drafts and accounts.

| Data area | Proposed change | Boundary |
| --- | --- | --- |
| Private account details | Editable details and onboarding-completion version | Owner only; never authorization metadata |
| Activities and saves | Reviewed taxonomy/tags/durations, user activity saves | Published catalogue; private saves |
| Shared groups | Groups, memberships, membership invitations | Joined users; owner manages membership |
| Plans | Planned end/duration, optional group/series association | Explicit event members; group visibility alone grants no access |
| Polls | Options, votes, deadline, finalization version | Invited users; own votes; organizer finalizes |
| Series | Bounded recurrence rule and occurrence IDs | Organizer mutations; independent occurrence participation |
| Messages | Persisted messages, tombstones, per-user read cursor | Owner/accepted participants; authorization on every read/write |
| Completion | Unique user/occurrence record, minutes, category snapshot | Only the reporting user |
| Media | Upload journal, image/thumbnail references, cleanup queue | Member access plus restricted own-delete path |
| Safety/operations | Blocks, reports, operator actions, delivery preferences | Own controls; separate operator authorization and audit |
| Calendar links | Exported native event reference and plan revision | Device-local, account-scoped |

Use RLS and transactional mutations for every new record. Explicitly test outsiders, removed members, unapproved/disabled users and account deletion. Separate proposed/polling plans from scheduled plans; never use fake dates to satisfy the existing start constraint. Keep lifecycle status separate from personal completion.

For live refresh, prefer private per-user change signals followed by authorized reads; do not send message bodies or photos through a shared channel whose access may be stale. Supabase caches Broadcast authorization during a connection, so removing a membership is not by itself proof that an existing channel stops receiving. Verify revocation with an already-open connection. Store app tables outside the managed `realtime` schema; its RLS policy exception does not permit arbitrary app objects. [Realtime authorization](https://supabase.com/docs/guides/realtime/authorization), [July 2026 schema restriction](https://supabase.com/changelog/realtime-schema-locked-down-against-modification)

Expand the existing deletion worker to remove personal completions/saves, owned media and message content, remove memberships and archive owned groups, while preserving only neutral plan records needed by other participants. Restrict report evidence separately. Retry cleanup failures; prevent new operations immediately. Existing downloaded photos and provider backups need accurate explanations.

Before a wider cohort, agree the beta retention schedule, backup/log retention, report-evidence lifetime, moderation process and service budget. Proposed approach: keep useful plan/history/media while the beta account is active; honor individual deletion controls; review the whole beta dataset at a declared evaluation end, then purge on an agreed schedule. Do not carry the earlier provisional test-wide 30-day rule into this longer beta silently.

Maintain release identifiers, sanitized error reporting, queue failure visibility, cost/usage checks, restore procedures and an idempotent reviewed catalogue publication path. A small protected maintainer tool is sufficient; a provider portal or full editorial CMS is not required. Collect product-success evidence from consented tests and minimal aggregate events, never message/photo contents or contact exports.

### Migration and rollout sequence

1. Record the deployed migration/configuration baseline and a tested recovery path. Reconcile the existing local notification/deletion migrations before building new ones on top of them.
2. Add new structures and compatible nullable fields first. Existing past plans have no verified attendance/duration: do not manufacture completion records or retroactive wellness totals. Keep stable activity/plan IDs and draft recovery working.
3. Implement server contracts and negative-access tests before wiring real writes. Keep samples isolated until the live feature is usable; restrict incomplete features through server-checked gates as well as UI visibility.
4. Test against disposable databases and actual Auth/Storage APIs with designated test identities. Synthetic local SQL contracts alone cannot certify hosted service behavior. Recheck advisors after hosted migrations.
5. Install a compatible native build before enabling integrations that require new modules/entitlements. Old clients must safely ignore new poll/series states or be told to update; do not feed them fake scheduled dates.
6. Enable one verified feature slice for the approved cohort, record build/schema versions and check errors/cleanup. A rollback disables the new surface or deploys a compatible fix; it must not drop already collected member content as a shortcut.

Work primarily in the existing `mobile/app`, `mobile/src/domain`, `mobile/src/services`, `mobile/src/design`, `supabase/migrations`, `supabase/functions`, `supabase/tests` and `qa` areas. Separate feature-specific code as it grows instead of expanding `AppState.tsx` into the implementation of every new subsystem. New schema and access contracts get integration/concurrency tests; small visual changes get proportionate visual/device verification.

## Delivery milestones

Each milestone ends with working software, automated checks appropriate to its risk, native-device evidence and a status update. A completed mock screen does not complete the milestone. Relative size is a planning signal, not a calendar estimate.

| Milestone | Deliverable and ordered work | Exit evidence | Dependencies / relative size |
| --- | --- | --- | --- |
| B0 — Real account foundation | Finish F1 resend/details/Google parity; verify providers and emails; review/deploy deletion/cleanup and retention; approve/publish first eight activities | Owner iPhone account lifecycle and real Auth/Storage checks; unapproved access denied; deletion/cleanup proven with designated test identities | Google setup, content/retention choices and device; **L** |
| B1 — Reliable two-person app | Host resbite.com links/AASA and fallback; rebuild; activate/test native push; prove create/share/claim/RSVP/edit/cancel; produce standalone signed build | Two phones show the same real state; denied permissions and interruption cases pass without Metro | B0, second explicitly approved account/phone, hosting/APNs; **L** |
| B2 — Everyday discovery and groups | Freeze F2–F4 screen contracts; saved activities; reviewed discovery improvements; shared groups; unified plan overview; planned duration and saved-place flow | Group privacy/snapshot tests; usable real group plan; cross-device saves; new layouts accepted | B1; **L** |
| B3 — Live coordination | Implement F8 persisted chat, authorization, unread/retry, change notices and mute; add block/report and operated response path | Real two-phone messaging and open-connection revocation; operator can handle a reported item | B2 membership/end-time contracts and support owner; **L** |
| B4 — Flexible planning | F5 time polls → final RSVP; F6 repeat/bounded series; F7 native calendar; supporting notifications | A group votes, confirms a time, schedules recurring occurrences and exports a plan; concurrency/DST/calendar cases pass | B2 and B3 integration; **XL** |
| B5 — Real history and wellness | F9 personal completion, private history, category allocation, corrections and period summaries | Known totals match confirmed entries; no inferred attendance or cross-user access; sample labels/data removed only from the completed live flow | B2 planned duration and approved taxonomy; integrate B4 occurrences; **M–L** |
| B6 — Shared memories | F10 private albums, upload/retry/quotas, attribution, reporting and deletion lifecycle | Real Storage/device cases and removed-member checks pass; cleanup survives interruption | B3 safety tooling, B5 completion context and media budget; **L** |
| B7 — Complete iPhone private beta | Full content review; notification preferences/help; all-flow accessibility/performance/offline checks; distribution review; restore/rollback rehearsal; cohort acceptance | Entire beta acceptance matrix passes in a standalone build; known limitations, support, retention and build notes delivered | B0–B6; cohort/distribution decisions; **L** |
| B8 — Android immediately afterward | Android native build/signing, App Links, contacts/location/photos/calendar, push transport, TalkBack/font scaling, release APK/AAB and mixed-platform tests | One iPhone and one Android complete the same group/poll/chat/photo/history loop; denied/background paths pass | B7 behavior baseline and Android device/credentials; **L** |

The existing [real-account milestone](2026-09-23-real-account-readiness.md) supplies B0's detailed starting work. B0/B1 close existing gaps; B2–B6 deliver the expansion. No feature selected above is quietly deferred past the complete iPhone beta. Android follows the accepted iPhone behavior rather than reopening product scope.

Within a milestone, independent backend contracts/tests, mobile components and content/QA can be separate workstreams under the previously requested agent workflow. Integrate against agreed contracts; keep shared state-provider, migration ordering and hosted deployment under one coordinator. Do not run agents against the same core files or accept their summaries as device evidence.

Re-estimate calendar time after B1 and again after the B3/B4 technical checks. No launch date, staffing capacity or budget was supplied, so a fixed delivery date would be speculative. The largest uncertainty is the combination of shared membership, chat/media revocation and recurring schedule changes.

## Beta acceptance and learning

Expand the [original acceptance script](../../knowledge-base/11-first-test-acceptance.md); its sample-only expectations apply only to the earlier build.

1. Fresh install → introduction → real registration/confirmation → optional details → eligible access, plus Google and recovery variants.
2. Find/save an activity → create a shared group → a second user joins → arrange a real plan → RSVP appears on both phones.
3. Invitees vote on a time poll → organizer finalizes once → each person explicitly RSVPs → changed time/place and cancellation refresh correctly.
4. Accepted attendees exchange messages, reconnect after losing network, mute and report; an unauthorized or removed account cannot read new content.
5. Repeat/create a bounded series, change one occurrence and future occurrences, verify DST/month-end behavior and native calendar export/update guidance.
6. After an event, each person confirms their own attendance/duration; only their own history and correct private wellness totals change.
7. Add/view/delete photos; deny picker permission, interrupt upload, revoke membership and verify cleanup and expired URLs.
8. Switch accounts and delete a designated account; previous account data/endpoints disappear and retryable backend cleanup completes across new entities.
9. Repeat the critical flows with Larger Text, VoiceOver, Reduce Motion, denied permissions, slow/offline networks and cold starts on the oldest selected beta iPhone.
10. Install the standalone build with Metro unavailable; validate notification taps, HTTPS links, support/report handling and restore/rollback documentation.

Use an unrelated test identity for negative access checks, with no access to the target group/event. If real additional identities are needed, get their specific approval rather than opening the roster generally.

Proposed learning target: at least three independent invited groups complete an actual activity and at least one organizes a second resbite without developer guidance. Review invitation drop-off, successful coordination, completion-entry usefulness and organizer effort. This is a proposed beta study target, not claimed traction or a hard-coded telemetry requirement. Time inside the app, likes and streaks are not success measures.

Release gates: no known unauthorized data exposure, duplicate irreversible actions or data-loss defects; all selected features integrated; native critical paths pass; support and cleanup are operational. Nonblocking visual issues can remain only if documented and accepted. Every feature report separates code-complete, local-tested, deployed and device-accepted states.

## Decisions to resolve at the relevant milestone

These do not undo the selected feature scope or prevent starting B0's reversible implementation work.

| Decision | Proposed starting point | Resolve before |
| --- | --- | --- |
| Cohort and account age | Small invited adult cohort, initially UK/Europe and English; no child accounts | Wider tester invitation; no minimum age is yet approved |
| Distribution and additional login | Registered-device installs for B1; consider TestFlight for B7 and review Sign in with Apple if needed | TestFlight submission / final Auth contract |
| Registration requirements | Keep extra fields optional and private; explain purpose | B0 profile editing acceptance |
| Content and taxonomy | Publish eight approved entries first; propose ~24 for full beta, approved discovery tags and seven wellness categories | Publication and F9 aggregation |
| Group exit/access details | Snapshot invitations; no historical access on join; explicit separate event exit | B2 schema/UI contract |
| Chat closure and safety operations | 72-hour read-only closure; mute/report/block; named support operator and filtering/removal process | B3 activation; Apple's UGC guidance includes filtering, reporting, blocking and contact information [source](https://developer.apple.com/app-store/review/guidelines/#user-generated-content) |
| Recurrence/poll/calendar bounds | 2–5 poll options, bounded series up to 12 occurrences, user-initiated one-way calendar export | B4 implementation contract |
| Wellness formula | Self-confirmed minutes, equal allocation across up to two benefits, versioned snapshots | B5 data contract |
| Media and data retention | Proposed media limits/window; explicit deletion/report/backup retention and operational budget | B6 activation and wider beta |
| Expansion beyond the selected set | Weather, guru content, capacities/waitlists, public launch and commercial features remain separate choices | Only if the owner adds them later |

## Immediate next objective

**B0: complete and verify real-account onboarding.** Implement confirmation resend/recovery and view/edit/remove for optional registration details; bring Google onboarding to parity; then verify the actual owner-account lifecycle on the iPhone. In parallel preparation, settle catalogue approval, cleanup/retention and service dependencies required for B1. Keep the owner-only gate until a second specific tester is authorized. This yields the trusted foundation the expanded features depend on.


## B0 progress — 23 September 2026

The first implementation slice is delivered: confirmation resend/recovery, access-pending guidance, Google optional-details parity, and editable/removable account details with atomic conflict protection. Two scoped account RPCs are deployed; owner-only roster access is unchanged. Owner accepted account-detail save/reopen/removal, native keyboard/date controls, Google sign-in, signed-in restoration after restart, and branded password-reset delivery/callback/save/sign-in on iPhone. Automated app/browser/database checks and iOS export pass. [Detailed evidence and remaining B0 acceptance](../../qa/b0-account-foundation.md).

Continue B0 with signup-confirmation/expired-link and Google cancellation results, then private photo/Auth/Storage verification, reviewed deletion/retention activation and catalogue approval/publication. This progress does not complete B0 or advance the later beta features ahead of their prerequisites.


The next B0 slice connects live discovery/detail/new-plan availability to published server content, with the additive catalogue schema deployed and exact eight-card content review ready. Publication approval is pending. Active-account orphan-photo cleanup and bounded receipt retention are implemented/tested locally, with no activation; the retention/restore proposal identifies remaining real Storage and recovery gates. Latest integration passes 112 mobile tests, 29 worker tests, SQL/concurrency, targeted browser regressions and iOS export. This advances B0 without changing B1–B8 scope or approving another tester.

## B0 progress — 24 September 2026

The owner approved and published the original eight activities, accepted their iPhone artwork/detail loading, then separately approved three new illustrated activities. All eleven are published for the same single owner; the new three's native acceptance remains pending. Content publication is no longer a B0 blocker.

The photo consistency slice is deployed: account-bound writes, database-managed revisions and atomic conflict/retry handling, narrowed participant photo reads, and disabled unsafe client file deletion. Profile removal detaches the image and explains retained private bytes; cleanup/deletion workers remain disabled. TypeScript, 119 mobile tests, targeted browser checks, SQL/concurrency and iOS export pass. [Photo evidence and deployment](../../qa/avatar-consistency-2026-09-24/README.md).

Continue with the reconnected iPhone's photo acceptance and a separately designated owner-controlled email for real signup confirmation and closed-access testing, then the existing policy/provider/restore gates for deletion and cleanup. Those inputs are pending. B0 is still open; B1–B8 ordering and selected scope are unchanged.


## B0 native photo acceptance — 28 September 2026

The reconnected iPhone received the photo consistency update. The owner confirmed “It works perfectly” after signed-in upload, closing/reopening and profile-photo removal. These behaviors are accepted; file cleanup, interrupted retry and cross-account Storage authorization remain separate. Next: the remaining signup-confirmation/closed-access and provider edge-case checks, followed by the existing deletion/retention/restore gates. B0 remains open.
