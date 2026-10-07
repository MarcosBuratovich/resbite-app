# Custom events CE1 — hosted rollout and iPhone acceptance (7 October 2026)

Design: [custom events spec](../../docs/superpowers/specs/2026-10-07-custom-events-design.md). Plan: [CE1 plan](../../docs/superpowers/plans/2026-10-07-custom-events-ce1.md). Branch `custom-events`.

## Approval

The owner was asked: "May I apply the single migration 20261007150000_custom_events to the live Resbite database and then deliver the app update to your iPhone?" They answered **"Yes, apply it"** on 7 October 2026, before 15:48 UTC. That approval covered this one migration only.

## Hosted change

- **Applied:** `supabase/migrations/20261007150000_custom_events.sql` (sha256 `c96540a6f4ab2ed5225f4b6b1d8b23cd58959559d2c330aa8acd1a79dd9750b8`). It went to project `ewcsgvhuojxdpaspwsrx` through the Supabase MCP `apply_migration` tool, under the name `custom_events`. The hosted version is **`20261007154825`**. No `db push` was used.
- **Pre-checks (read-only, 13:53 UTC):**
  - all 11 published ideas are inside the approved mapping;
  - 0 plans;
  - 1 enabled roster entry;
  - tables and the legacy plan functions are owned by `postgres`, the role the migration ran as;
  - hosted idea titles equal the bundled titles.

  Record: [hosted-before.json](hosted-before.json).
- **After-state (15:48 UTC):**
  - every idea's `categories` equals `mobile/content/activity-categories.json`;
  - `plans.title`, `description` and `categories` are NOT NULL, and `activity_id` is nullable;
  - the v2 public functions are executable by `authenticated` only (not `anon` or `service_role`);
  - both triggers and all five constraints are present;
  - private definers have `search_path=''`;
  - roster and plan counts are unchanged.

  Record: [hosted-after.json](hosted-after.json).
- **Advisors:** unchanged before and after. Security has the 4 intentional INFO notices on private default-deny tables. Performance has INFO unused indexes and the Auth connection strategy. There is no new WARN or ERROR.
- **Baseline record:** `supabase/tests/hosted-baseline/migrations.txt` now lists `custom_events` with its hosted version. `./scripts/test-database.sh --hosted-baseline` passes.

## Local verification before rollout

- `npm run check`: 140 tests, 0 failures.
- Backend tests: 51/51.
- SQL suite: passes in full mode and hosted-baseline mode.
- All 16 intercepted browser QA scripts pass.
- iOS JavaScript export passes.
- Whole-branch review: findings fixed, and a fix that introduced a regression was reverted. See the branch history for details.

## iPhone acceptance

The JavaScript update was delivered to the installed development build through Metro (`--lan`, `192.168.1.23:8081`). No native rebuild was needed. The owner ran the spec's eight CE1 acceptance checks:

1. The Create tab shows the start card, the ideas and the seven category filters; filtering and search work.
2. A blank event with a title, description, two categories, a time and a place saves and appears in My resbites.
3. "Use this idea" prefills the fields; a changed title saves; the card shows the idea's illustration.
4. Editing an event's title or categories works.
5. Draft recovery after a force-close restores the event fields.
6. Cancelling from My resbites works.
7. The Create tab and editor stay usable with Larger Text.
8. Earlier plans still show correctly.

Owner reply, 7 October 2026: **"all good, everything works on the iPhone"**.

## Known limitations

- Opening "New resbite" and leaving without typing leaves an empty draft card. A guard against this was reverted because it suppressed autosave after an edit was undone. A future fix will track whether a draft was written in the current session.
- Invitations, RSVP and the two-person flow are unchanged. They are tested in B1 once a second tester is approved.

## Rollback

Disable the feature with an app update rather than dropping data. The schema rollback below is valid **only while no plan has a null `activity_id`**. Apply it **only after the phone is back on pre-CE JavaScript**: the new app requires `categories` on plans and ideas.

If the JavaScript is rolled back after a blank-event draft exists, the old app cannot read that draft list. Clear drafts or roll forward instead.

```sql
drop function public.change_plan_v2(uuid,integer,text,text,text[],timestamptz,text,text,text,boolean), private.change_plan_v2(uuid,integer,text,text,text[],timestamptz,text,text,text,boolean),
 public.create_plan_v2(uuid,text,text,text[],text,timestamptz,text,text,text,double precision,double precision), private.create_plan_v2(uuid,text,text,text[],text,timestamptz,text,text,text,double precision,double precision);
drop trigger plans_redact_deleting_owner on public.plans; drop trigger plans_fill_from_activity on public.plans;
drop function private.redact_deleting_owner_plan(), private.fill_plan_from_activity();
alter table public.plans drop constraint plans_categories_valid, drop constraint plans_description_valid, drop constraint plans_title_valid,
 drop column categories, drop column description, drop column title, alter column activity_id set not null;
alter table public.activities drop constraint activities_published_categories, drop constraint activities_categories_valid, drop column categories;
drop function private.valid_categories(text[]);
```
