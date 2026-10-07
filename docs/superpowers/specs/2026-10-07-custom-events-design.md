# Custom events — design

7 October 2026. **Owner-approved design** produced through a brainstorming session; this governs the new CE milestone. It does not change tester access, the B1–B8 feature scope or any hosted setting by itself.

## Intent

The 11-idea catalogue is too limiting: people want to arrange anything — a dinner, a birthday, a hike — not only what Resbite has published. **Creating your own resbite becomes the main path**, and the catalogue becomes optional inspiration: picking an idea prefills an editable event.

Success: on the owner's iPhone, an event can be created from scratch (with a cover photo) and from an idea (then changed), edited, seen in My resbites and shared through the existing invitation flow; an invitee who claims it sees its title, description and cover.

## Owner decisions (7 October 2026)

| # | Decision |
| --- | --- |
| CE-D1 | Custom events are the primary creation flow; catalogue ideas are optional templates. |
| CE-D2 | An event has a required title, date/time and place, plus a description, an uploaded cover photo and categories. |
| CE-D3 | Choosing an idea is an **editable template**: it prefills fields, everything can be changed, and the event records which idea it came from. |
| CE-D4 | The Discover tab becomes **Create**: "Start your own resbite" on top, "Or start from an idea" below. My resbites also gets "New resbite". |
| CE-D5 | Categories are the seven wellness categories — Creative, Intellectual, Mindful, Natural, Physical, Community, Uplifting — for custom events and the catalogue. This approves the taxonomy (its wellness formula remains a B5 decision). |
| CE-D6 | Each event and idea has one or two categories (source S0689: "one or two key benefits"). |
| CE-D7 | The category mapping for the 11 published ideas in [Catalogue categories](#catalogue-categories) is approved. |
| CE-D8 | CE is the next milestone, before remaining B0 work and B1. Delivered in two parts: CE1 events, CE2 cover photo. |

Unchanged: one organizer per event; events visible only to the organizer and claimed invitees; invitations, RSVP and draft recovery semantics; owner-only tester access; sample chat and sample wellness.

## Scope

**In:** event fields and server functions; Create tab; editor "What are we doing?" section; title/picture display across My resbites, invite and editor; seven-category definition; catalogue recategorization; cover photo upload (CE2); deletion redaction of the new fields (prepared, still disabled); tests and hosted-baseline test mode; documentation updates.

**Fixed along the way (touched files):** cancellation goes through the guarded plan gateway instead of a raw RPC; titles/artwork no longer come from the bundled catalogue; Discover's category icon map is replaced.

**Out:** changes to invitations/RSVP/people/groups; reporting/moderation of user content (B3 safety tooling); orphan-cover cleanup worker; wellness calculations; Android; repeating or recurring events.

## Data model (migration `custom_events`)

Additive, applied on top of the five hosted migrations; it must not reference objects that exist only in local-only migrations, except through the guarded deletion update below.

### `public.activities`

- Add `categories text[]` — null or 1–2 distinct keys from the seven; check constraint `published = false or categories is not null`.
- Set the approved mapping for the 11 ids; the migration raises if any published row is left without categories.
- Keep `category` (deprecated, unused by the new app) so the currently installed bundle keeps working between the database change and the app update.

### `public.plans`

| Column | Rule |
| --- | --- |
| `title text not null` | trimmed, 1–80 characters |
| `description text not null default ''` | ≤ 1,000 characters (the existing `note` stays as practical details, ≤ 2,000) |
| `categories text[] not null` | 1–2 distinct keys from the seven; first is primary (placeholder colour) |
| `activity_id` | becomes **nullable**: "started from this idea"; FK unchanged |
| `cover_path text`, `cover_revision bigint not null default 0` | CE2 only; revision maintained by trigger as for avatars |

Existing rows are backfilled from their activity (`title`, `categories`) before `not null` is applied. A `BEFORE INSERT` trigger fills `title` and `categories` from the activity whenever a caller omits them (the legacy `create_plan`, maintainer and fixture inserts), so older callers keep working without copying their function bodies.

### Category keys

`creative`, `intellectual`, `mindful`, `natural`, `physical`, `community`, `uplifting`. Labels are the capitalized words. The app holds one definition module (key, label, icon, colour); the server only validates keys.

## Server functions

All follow the house pattern: `private` SECURITY DEFINER implementation with `search_path=''`, `public` SECURITY INVOKER façade, `require_tester()` first, explicit grants to `authenticated` only.

- **`create_plan_v2(p_id, p_title, p_description, p_categories, p_activity, p_start, p_zone, p_place, p_note, p_lat, p_lon)`** — `p_activity` may be null; if present it must be a published activity. Same advisory lock and exact-retry rule as `create_plan`: an identical payload for an existing ID returns it, any difference raises `22023 Creation identifier already used`. Future start and valid zone as today.
- **`change_plan_v2(p_plan, p_version, p_title, p_description, p_categories, p_start, p_zone, p_place, p_note, p_cancel default false)`** — owner only; active future plan; version CAS (`40001`); edits all event fields; with `p_cancel` true the other field arguments are ignored, cancellation is terminal and revokes invitations; queues `plan_changed`/`plan_cancelled` exactly as `change_plan`.
- **Compatibility:** `create_plan` is unchanged; the insert trigger supplies title/categories from its activity. `change_plan` already leaves the new columns untouched. Both are retired after the new app is accepted.
- **CE2 — `set_plan_cover_if_current(p_plan, p_path, p_expected_path, p_expected_revision)`** — owner only; active future plan; `p_path` null removes; otherwise it must be `<owner uid>/<plan id>/<name>.jpg` and the object must exist. Compare-and-swap on path and revision, exact retry acknowledged, stale change `40001`. Returns the new revision.

Validation failures use `22023` or check-constraint `23514`, which the app already maps to a validation message.

## Cover photo storage (CE2)

- Bucket `plan-covers`: private, 2 MB, `image/jpeg` only. Path `<owner uid>/<plan id>/<random>.jpg`.
- Insert/update: eligible user, first folder is their uid, second folder is a plan they own that is active and in the future. **No client delete.**
- Read: eligible user who can read the plan, and only the plan's current `cover_path`; the app uses 5-minute signed URLs.
- Replaced/removed covers stay private and unattached until the cleanup worker supports covers (same rule as profile photos today).

## Deletion (prepared, still disabled)

A deleted organizer's events must lose title and description (set to `Resbite` / `''`) and, in CE2, cover, alongside the existing place/note redaction. Both prepared deletion functions set `profiles.deletion_requested_at` before updating every owned plan, so a `BEFORE UPDATE` trigger on `plans` enforces the invariant: while the owner's profile is marked for deletion, any update leaves the title as `Resbite` and the description empty. It depends only on the deployed `profiles` table, ships in the hosted-compatible migration, needs no copy of the local-only deletion functions and also covers any future code path. SQL tests enforce it, including through the real deletion functions in the full local suite. The deletion release checklist gains: verify the deployed redaction and that the worker removes `plan-covers` objects. Account deletion stays gated until its existing prerequisites pass.

## App

### Navigation

- `(tabs)/discover` becomes `(tabs)/create`, tab label **Create**. Every `/discover` reference moves to `/create`.
- Top: pink primary card "Start your own resbite" → blank editor. It replaces the featured-idea hero.
- Below: "Or start from an idea" — search, seven category tiles (plus All), idea cards.
- Idea detail keeps its content; its button becomes **"Use this idea"** with "You can change anything next".
- My resbites: "New resbite" button at the top → blank editor.

### Editor (`arrange`)

- Routes: blank `/arrange`; from idea `/arrange?activity=<id>`; edit `/arrange?plan=<id>`.
- New first section **"What are we doing?"** as its own component: title, description, category tiles (select 1–2). CE2 adds the cover picker at its top.
- From an idea: fields prefilled from the idea and a "From the idea: <title>" tag. Editing keeps the link. As today, a new event cannot be saved from an idea that is no longer published: the server refuses it, the editor explains, and the draft stays on the device. Editing an existing event is unaffected by its idea's publication state.
- Validation lives in `src/domain` (`validateEventDetails`) with unit tests; errors keep the draft and scroll to the field as today.
- Saves use `create_plan_v2`/`change_plan_v2` through the plan gateway; reconciliation compares the new fields as part of the saved details.

### Drafts

- Keys: `new` (one blank draft), `new-<activity>` (per idea, unchanged), `edit-<plan>` (unchanged).
- Drafts store title, description and categories. Loading an older draft without them fills them from its idea; nothing is discarded.

### Display

Everywhere an event appears (My resbites cards, drafts, invite screen, editor header): the event's own `title`, and a picture chosen in this order:

1. the cover (CE2, signed URL);
2. the idea's bundled illustration when `activity_id` has artwork;
3. a placeholder in the primary category's colour with its icon.

The bundled catalogue is used only for preview mode and artwork lookup, never for titles.

### Other touched behaviour

- Cancel in My resbites goes through the plan gateway with deadline and `writePlan` error mapping (`change_plan_v2` with cancel).
- The live catalogue decoder requires valid `categories`. Bundled ideas get categories from a separate overlay file (see below).
- Preview mode creates, edits and cancels custom events in memory; CE2 keeps a preview cover in memory without upload.

### Cover photo flow (CE2)

- Reuse `photo.ts` normalization: JPEG, longest side 1600 px, metadata stripped, ≤ 2 MB.
- New event: save the event first, then upload and attach the cover. If the cover step fails, the event exists and shows "Retry cover".
- The pending cover change is journaled per account (intended path, normalized bytes, baseline revision) like profile photos; a retry after restart reuses the same path and never deletes files.
- Replace and remove use the compare-and-swap function. Picker cancellation does nothing; offline disables cover actions without blocking event saves.

## Catalogue categories

Approved mapping (CE-D7):

| Idea | Categories |
| --- | --- |
| Coffee together | Community, Uplifting |
| Painting | Creative, Mindful |
| Get out with bikes | Physical, Natural |
| Building a snowman | Creative, Natural |
| BBQ | Community, Natural |
| Wine tasting | Community, Intellectual |
| Spa day | Mindful, Uplifting |
| Book club | Intellectual, Community |
| Picnic in the park | Natural, Community |
| Walk and talk | Physical, Community |
| Board game night | Intellectual, Community |

- The approved content files (`activities.json`, `activity-additions.json`) and their approval records are **not edited**; their old labels were approved as temporary discovery filters and remain as history.
- New `mobile/content/activity-categories.json` holds the mapping, with `activity-categories-approval.json` recording this approval and its hash. `validate-content.mjs` checks it covers exactly the 11 ids with 1–2 valid keys and matches its approval.
- The hosted change is the migration's mapping; its application gets a before/after/rollback record under `qa/`, like the 24 September publications.
- Wine tasting remains an adult activity; the age policy is still an open decision.

## Testing

**SQL** (`scripts/test-database.sh`):

- New `custom-events.sql`: blank and from-idea creation; unpublished idea refused; title/description/category limits; duplicate or unknown keys; exact retry versus conflicting retry; edit CAS and notification queueing; cancel; invitee reads title/description, outsider and anonymous cannot; existing-plan backfill; old `create_plan`/`change_plan` still work; published activity without categories refused.
- New `plan-covers.sql` (CE2): owner-only upload paths, wrong plan or user folder refused, current-cover-only reads for invitees, no client delete, compare-and-swap, stale and exact retries.
- Extended deletion tests: a deleted organizer's events lose title, description and cover.
- New **hosted-baseline mode**: apply bootstrap and the five hosted migrations, seed a legacy plan, apply `custom_events` only, verify the backfill, then run the hosted-compatible tests (`foundation`, `catalogue`, `avatar-revision`, `security-review`, `custom-events`). This proves the migration does not depend on local-only objects.

**Mobile unit tests:** event validation and category rules; draft upgrade of old drafts; live-catalogue decoding of `categories`; `writePlan` reconciliation including new fields; cancel through the gateway; cover journal and compare-and-swap (CE2). New test files are appended to the `npm test` chain.

**Browser QA** (intercepted, no live calls): update planning, catalogue and RSVP fixtures for the Create tab, blank and from-idea events, edit, cancel and drafts; CE2 cover fixtures in the profile-photo style.

All of `npm run check`, backend tests and the SQL suite pass before any hosted step.

## Rollout

Per part (CE1, then CE2):

1. Implement locally; all automated checks pass.
2. **Ask the owner before applying the migration to the hosted project.** Apply only that named migration (never `db push`), with before/after read-back and rollback notes in `qa/`.
3. Deliver the JavaScript update to the iPhone over Metro. No native rebuild is expected: the picker and image tools are already in the installed build.
4. Owner runs the acceptance checklist below.
5. Update `docs/development-handoff-…`, `docs/implementation-status.md`, the expanded plan (CE milestone), `knowledge-base/08-decisions.md` (CE-D1…D8), `knowledge-base/13-expanded-beta-scope.md` and `supabase/README.md`.

### CE1 acceptance (owner iPhone)

1. Create tab shows the start card, ideas and seven category filters; filtering and search work.
2. A blank event with title, description, two categories, time and place saves and appears in My resbites with its title and placeholder.
3. "Use this idea" prefills; changing the title saves; the card shows the idea's illustration.
4. Editing title or categories of an existing event works; the update appears after refresh.
5. Force-close during a new event, reopen, and Continue draft restores title, description and categories.
6. Cancel an event from My resbites.
7. Create tab and editor remain usable with Larger Text.
8. Plans created before the update still show correctly.

### CE2 acceptance (owner iPhone)

1. Add a cover while creating an event; it shows in My resbites and the editor.
2. Replace and remove a cover.
3. Cancelling the picker changes nothing.
4. Offline, cover actions are unavailable and event saving still behaves as before.

## Risks and follow-ups

- **User-generated content:** titles, descriptions and covers are visible only to invitees, but a wider beta still needs the report/operator path planned for B3 (Apple's guidance for user-generated content).
- **Orphan covers** accumulate privately until cover cleanup is added to the disabled cleanup worker.
- **Deletion migrations** remain local-only; their eventual hosted reconciliation must keep this redaction.
- **Age policy** for adult ideas (Wine tasting) remains open.
- **Wellness** stays a labelled sample. B5 decides how category minutes are counted.
