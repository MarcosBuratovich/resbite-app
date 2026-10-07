# Custom Events (CE1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make "start your own resbite" the main way to create a plan, with catalogue ideas as editable templates, using the seven approved categories.

**Architecture:** One hosted-compatible migration adds event fields (`title`, `description`, `categories`) to `plans`, makes the idea link optional, publishes the approved idea categories and adds `create_plan_v2`/`change_plan_v2`. Two triggers keep older callers working and keep deletion redaction complete. The app gains a categories module, event-field validation, draft upgrades, a blank/idea/edit editor, a Create tab, and title/picture display driven by the plan instead of the bundled catalogue.

**Tech Stack:** Expo SDK 57 / React Native 0.86 / TypeScript 6 / expo-router 57, Supabase Postgres 17 (hosted `ewcsgvhuojxdpaspwsrx`), Node 22 `node:test` via `tsx`, Playwright browser QA against Expo web, disposable local Postgres 17 for SQL tests.

**Spec:** `docs/superpowers/specs/2026-10-07-custom-events-design.md` (read it first). This plan covers **CE1 only**. CE2 (cover photo) gets its own plan after CE1 is accepted on the iPhone, so it can build on the shipped code.

## Global Constraints

- Before any mobile command: `export PATH="/opt/homebrew/opt/node@22/bin:$PATH"` (the shell defaults to Node 20).
- Read the versioned Expo docs (https://docs.expo.dev/versions/v57.0.0/) before changing Expo/router APIs (`mobile/AGENTS.md`).
- No new npm dependencies and no native configuration changes: CE1 must ship as a JavaScript-only update to the installed iPhone build.
- Never run `supabase db push` or touch hosted settings outside Task 11. Hosted changes happen only after the owner explicitly approves, by applying the single named migration.
- Tester access stays owner-only: no roster changes.
- Category keys, in this order: `creative`, `intellectual`, `mindful`, `natural`, `physical`, `community`, `uplifting`. Labels are the capitalized words.
- Title: trimmed, 1–80 characters. Description: at most 1,000 characters. Categories: one or two distinct keys, in the organizer's order.
- Do not edit the approved content snapshots or their approvals: `mobile/content/activities.json`, `activity-additions.json`, `catalogue-approval.json`, `activity-additions-approval.json`.
- Server functions follow the house pattern: `private` SECURITY DEFINER with `set search_path = ''`, `public` SECURITY INVOKER façade, `private.require_tester()` first, EXECUTE granted to `authenticated` only.
- Every new mobile test file is appended to the `test` script chain in `mobile/package.json`.
- UI copy uses the existing voice and curly apostrophes (’).
- Browser QA: start `cd mobile && npx expo start --web --port 8081` in a separate background shell, wait for "Waiting on http://localhost:8081", then run `node scripts/verify-<name>.mjs` from `mobile/` (needs Google Chrome). Stop the server afterwards.
- Commit at the end of each task with a message ending in `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Work on branch `custom-events`.

## Review Focus

1. **Drafts or unconfirmed saves made by the current app** (no title/categories, possibly a pending create after a lost reply) opened after the update must restore, fill their event fields from their idea and retry with a complete payload. Pinned in Task 5 (`completeEventFields` and legacy draft tests); wired in Task 6.
2. **The bundled category overlay drifting from the migration's mapping** would make preview and live data disagree. Pinned in Task 4 (consistency test that parses the migration).
3. **Names with spaces, non-breaking spaces or emoji near the 80-character limit:** the app trims before sending and never sends a name the server would reject. The client counts UTF-16 units, so it is stricter for emoji. Pinned in Task 5.
4. **The new app reaching a server without the migration** (missing `categories`) must show the catalogue error state, not crash or guess labels. Pinned in Task 4 (decoder test); rollout order in Task 11 (migration before the app update).
5. **Cancelling twice or losing the cancel reply** must end as "cancelled" without a scary error. Pinned in Task 6 (`cancelPlan` tests).

---

### Task 1: Category definitions

**Files:**
- Create: `mobile/src/domain/categories.ts`
- Create: `mobile/src/domain/categories.test.ts`
- Modify: `mobile/package.json` (`test` script)

**Interfaces:**
- Consumes: nothing.
- Produces: `categoryKeys` (readonly tuple), `type CategoryKey`, `categoryLabels: Record<CategoryKey, string>`, `isCategoryKey(value: unknown): value is CategoryKey`, `validCategories(value: unknown): value is CategoryKey[]`, `toggleCategory(selected: CategoryKey[], key: CategoryKey): CategoryKey[]`.

- [ ] **Step 1: Write the failing test**

`mobile/src/domain/categories.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  categoryKeys,
  categoryLabels,
  isCategoryKey,
  toggleCategory,
  validCategories,
} from "./categories.ts";

test("the seven approved categories keep their order and labels", () => {
  assert.deepEqual(
    [...categoryKeys],
    ["creative", "intellectual", "mindful", "natural", "physical", "community", "uplifting"],
  );
  assert.deepEqual(
    categoryKeys.map((key) => categoryLabels[key]),
    ["Creative", "Intellectual", "Mindful", "Natural", "Physical", "Community", "Uplifting"],
  );
  assert.equal(isCategoryKey("community"), true);
  assert.equal(isCategoryKey("Community"), false);
  assert.equal(isCategoryKey("wellness"), false);
});

test("an event or idea has one or two distinct approved categories", () => {
  assert.equal(validCategories(["creative"]), true);
  assert.equal(validCategories(["creative", "mindful"]), true);
  for (const bad of [
    [],
    ["creative", "mindful", "natural"],
    ["creative", "creative"],
    ["wellness"],
    ["creative", null],
    "creative",
    null,
    undefined,
  ])
    assert.equal(validCategories(bad), false, JSON.stringify(bad));
});

test("tapping a third category is refused instead of replacing a choice", () => {
  assert.deepEqual(toggleCategory([], "natural"), ["natural"]);
  assert.deepEqual(toggleCategory(["natural"], "community"), ["natural", "community"]);
  assert.deepEqual(toggleCategory(["natural", "community"], "creative"), ["natural", "community"]);
  assert.deepEqual(toggleCategory(["natural", "community"], "natural"), ["community"]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd mobile && node --import tsx src/domain/categories.test.ts`
Expected: FAIL with `Cannot find module` for `./categories.ts`.

- [ ] **Step 3: Write the implementation**

`mobile/src/domain/categories.ts`:

```ts
// The seven approved categories (owner decision CE-D5). Keys are stored on the
// server; labels are display copy. Each event or idea has one or two (CE-D6).
export const categoryKeys = [
  "creative",
  "intellectual",
  "mindful",
  "natural",
  "physical",
  "community",
  "uplifting",
] as const;
export type CategoryKey = (typeof categoryKeys)[number];

export const categoryLabels: Record<CategoryKey, string> = {
  creative: "Creative",
  intellectual: "Intellectual",
  mindful: "Mindful",
  natural: "Natural",
  physical: "Physical",
  community: "Community",
  uplifting: "Uplifting",
};

export function isCategoryKey(value: unknown): value is CategoryKey {
  return (
    typeof value === "string" &&
    (categoryKeys as readonly string[]).includes(value)
  );
}

/** One or two distinct approved keys, matching `private.valid_categories`. */
export function validCategories(value: unknown): value is CategoryKey[] {
  return (
    Array.isArray(value) &&
    value.length >= 1 &&
    value.length <= 2 &&
    value.every(isCategoryKey) &&
    new Set(value).size === value.length
  );
}

/** Tile toggle: removes a chosen key, adds a new one, refuses a third. */
export function toggleCategory(
  selected: CategoryKey[],
  key: CategoryKey,
): CategoryKey[] {
  if (selected.includes(key)) return selected.filter((k) => k !== key);
  return selected.length >= 2 ? selected : [...selected, key];
}
```

- [ ] **Step 4: Add the test to the chain and run the full check**

In `mobile/package.json`, append ` && node --import tsx src/domain/categories.test.ts` to the end of the `"test"` script string (after `src/services/liveCatalogue.test.ts`).

Run: `cd mobile && npm run check`
Expected: PASS. Typecheck clean, 122 tests passing (119 + 3), content validation line printed.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/domain/categories.ts mobile/src/domain/categories.test.ts mobile/package.json
git commit -m "Add the seven approved event categories

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Database migration and SQL tests

**Files:**
- Create: `supabase/migrations/20261007150000_custom_events.sql`
- Create: `supabase/tests/custom-events.sql`
- Modify: `supabase/tests/foundation.sql:10`, `supabase/tests/deletion.sql:8-9,27`, `supabase/tests/photo-cleanup.sql:12`, `supabase/tests/notifications.sql:8`, `supabase/tests/avatar-revision.sql:24`, `supabase/tests/catalogue.sql:7-9`

**Interfaces:**
- Consumes: nothing from earlier tasks (the keys match Task 1).
- Produces:
  - `public.create_plan_v2(p_id uuid, p_title text, p_description text, p_categories text[], p_activity text, p_start timestamptz, p_zone text, p_place text, p_note text default '', p_lat double precision default null, p_lon double precision default null) returns uuid`
  - `public.change_plan_v2(p_plan uuid, p_version integer, p_title text, p_description text, p_categories text[], p_start timestamptz, p_zone text, p_place text, p_note text, p_cancel boolean default false) returns integer`
  - columns `plans.title`, `plans.description`, `plans.categories`; nullable `plans.activity_id`; `activities.categories`

- [ ] **Step 1: Write the failing SQL test**

`supabase/tests/custom-events.sql`:

```sql
-- Custom events (CE1). Synthetic identities only; every change rolls back.
begin;
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
 ('a1000000-0000-4000-8000-000000000001','ce-owner@resbite-test.invalid',now(),'{}'),
 ('a1000000-0000-4000-8000-000000000002','ce-invitee@resbite-test.invalid',now(),'{}'),
 ('a1000000-0000-4000-8000-000000000003','ce-outsider@resbite-test.invalid',now(),'{}');
insert into private.tester_roster(email) values
 ('ce-owner@resbite-test.invalid'),('ce-invitee@resbite-test.invalid'),('ce-outsider@resbite-test.invalid');
insert into public.activities(id,title,description,category,artwork_key,source_ids,published,categories) values
 ('ce-idea','Idea fixture','Synthetic','Creative','painting',array['fixture'],true,array['creative','mindful']),
 ('ce-draft','Draft idea','Synthetic','Creative','painting',array['fixture'],false,null);
-- A published idea always has valid categories; an unpublished draft may not yet.
do $$ begin
 begin
  insert into public.activities(id,title,description,category,artwork_key,source_ids,published) values('ce-bad','Bad','Bad','Creative','painting',array['fixture'],true);
  raise exception 'Published idea without categories accepted';
 exception when check_violation then null; end;
 begin
  update public.activities set categories=array['creative','creative'] where id='ce-idea';
  raise exception 'Duplicate idea category accepted';
 exception when check_violation then null; end;
end $$;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.save_profile('Owner');
-- From scratch: no idea, title trimmed, categories kept in the organizer's order.
select public.create_plan_v2('a2000000-0000-4000-8000-000000000001','  Dinner at Mario''s  ','Pasta night',array['community','uplifting'],null,now()+interval '1 day','Europe/London','Mario''s','Bring wine');
-- An identical retry returns the same event.
select public.create_plan_v2('a2000000-0000-4000-8000-000000000001','  Dinner at Mario''s  ','Pasta night',array['community','uplifting'],null,now()+interval '1 day','Europe/London','Mario''s','Bring wine');
do $$ begin
 if (select title from public.plans where id='a2000000-0000-4000-8000-000000000001')<>'Dinner at Mario''s' then raise exception 'Title not trimmed'; end if;
 if (select categories from public.plans where id='a2000000-0000-4000-8000-000000000001')<>array['community','uplifting'] then raise exception 'Category order lost'; end if;
 if (select activity_id from public.plans where id='a2000000-0000-4000-8000-000000000001') is not null then raise exception 'Scratch event linked to an idea'; end if;
 if (select count(*) from public.plans)<>1 then raise exception 'Retry duplicated the event'; end if;
 begin
  perform public.create_plan_v2('a2000000-0000-4000-8000-000000000001','Something else','Pasta night',array['community','uplifting'],null,now()+interval '1 day','Europe/London','Mario''s','Bring wine');
  raise exception 'Changed retry accepted';
 exception when invalid_parameter_value then null; end;
end $$;
-- From an idea: only published ideas can be used.
select public.create_plan_v2('a2000000-0000-4000-8000-000000000002','Idea fixture','Synthetic',array['creative','mindful'],'ce-idea',now()+interval '2 days','UTC','Studio','');
-- Exactly 80 characters is allowed.
select public.create_plan_v2('a2000000-0000-4000-8000-000000000005',repeat('x',80),'',array['creative'],null,now()+interval '2 days','UTC','Studio','');
do $$ begin
 if (select activity_id from public.plans where id='a2000000-0000-4000-8000-000000000002')<>'ce-idea' then raise exception 'Idea link lost'; end if;
 begin perform public.create_plan_v2('a2000000-0000-4000-8000-000000000003','Draft','',array['creative'],'ce-draft',now()+interval '2 days','UTC','Studio',''); raise exception 'Unpublished idea used'; exception when invalid_parameter_value then null; end;
 -- Field rules match the app (CE-D2, CE-D6).
 begin perform public.create_plan_v2('a2000000-0000-4000-8000-000000000004','   ','',array['creative'],null,now()+interval '1 day','UTC','Park',''); raise exception 'Blank title accepted'; exception when check_violation then null; end;
 begin perform public.create_plan_v2('a2000000-0000-4000-8000-000000000004',repeat('x',81),'',array['creative'],null,now()+interval '1 day','UTC','Park',''); raise exception 'Long title accepted'; exception when check_violation then null; end;
 begin perform public.create_plan_v2('a2000000-0000-4000-8000-000000000004',null,'',array['creative'],null,now()+interval '1 day','UTC','Park',''); raise exception 'Missing title accepted'; exception when not_null_violation then null; end;
 begin perform public.create_plan_v2('a2000000-0000-4000-8000-000000000004','Walk','x'||repeat('y',1000),array['creative'],null,now()+interval '1 day','UTC','Park',''); raise exception 'Long description accepted'; exception when check_violation then null; end;
 begin perform public.create_plan_v2('a2000000-0000-4000-8000-000000000004','Walk','',array[]::text[],null,now()+interval '1 day','UTC','Park',''); raise exception 'No category accepted'; exception when check_violation then null; end;
 begin perform public.create_plan_v2('a2000000-0000-4000-8000-000000000004','Walk','',array['creative','creative'],null,now()+interval '1 day','UTC','Park',''); raise exception 'Repeated category accepted'; exception when check_violation then null; end;
 begin perform public.create_plan_v2('a2000000-0000-4000-8000-000000000004','Walk','',array['creative','mindful','natural'],null,now()+interval '1 day','UTC','Park',''); raise exception 'Three categories accepted'; exception when check_violation then null; end;
 begin perform public.create_plan_v2('a2000000-0000-4000-8000-000000000004','Walk','',array['wellness'],null,now()+interval '1 day','UTC','Park',''); raise exception 'Unknown category accepted'; exception when check_violation then null; end;
 begin perform public.create_plan_v2('a2000000-0000-4000-8000-000000000004','Walk','',array['creative',null],null,now()+interval '1 day','UTC','Park',''); raise exception 'Null category accepted'; exception when check_violation then null; end;
 begin perform public.create_plan_v2('a2000000-0000-4000-8000-000000000004','Walk','',null,null,now()+interval '1 day','UTC','Park',''); raise exception 'Missing categories accepted'; exception when not_null_violation then null; end;
 begin perform public.create_plan_v2('a2000000-0000-4000-8000-000000000004','Walk','',array['creative'],null,now()-interval '1 hour','UTC','Park',''); raise exception 'Past start accepted'; exception when invalid_parameter_value then null; end;
end $$;
-- The legacy create_plan keeps working: title and categories come from its idea.
select public.create_plan('a2000000-0000-4000-8000-000000000006','ce-idea',now()+interval '3 days','UTC','Legacy place');
do $$ begin
 if (select title from public.plans where id='a2000000-0000-4000-8000-000000000006')<>'Idea fixture'
 or (select categories from public.plans where id='a2000000-0000-4000-8000-000000000006')<>array['creative','mindful'] then
  raise exception 'Legacy create not filled from its idea';
 end if;
end $$;

-- Visibility is unchanged: the invitee reads event text, outsiders and anonymous users read nothing.
select public.create_invite('a3000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000001',repeat('c',64));
select set_config('request.jwt.claims','{"sub":"a1000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select public.save_profile('Invitee');
select public.claim_invite(repeat('c',64));
do $$ begin
 if (select title||'|'||description from public.plans where id='a2000000-0000-4000-8000-000000000001')<>'Dinner at Mario''s|Pasta night' then raise exception 'Invitee cannot read event text'; end if;
 if (select count(*) from public.plans)<>1 then raise exception 'Invitee sees other events'; end if;
 begin perform public.change_plan_v2('a2000000-0000-4000-8000-000000000001',1,'Hijacked','',array['creative'],now()+interval '1 day','UTC','Elsewhere','',false); raise exception 'Invitee edited the event'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claims','{"sub":"a1000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select public.save_profile('Outsider');
do $$ begin
 if exists(select 1 from public.plans) then raise exception 'Outsider read an event'; end if;
end $$;
reset role;
set local role anon;
do $$ begin
 begin perform 1 from public.plans; raise exception 'Anonymous user read events'; exception when insufficient_privilege then null; end;
end $$;
reset role;

-- Owner edits event text with the version check; RSVPs are not rewritten.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.change_plan_v2('a2000000-0000-4000-8000-000000000001',1,' Dinner & games ','Pasta then cards',array['community'],now()+interval '1 day','Europe/London','Mario''s','Bring wine',false);
do $$ begin
 if (select title||'|'||description||'|'||categories::text||'|'||version from public.plans where id='a2000000-0000-4000-8000-000000000001')<>'Dinner & games|Pasta then cards|{community}|2' then raise exception 'Edit not saved'; end if;
 if (select response from public.attendees where plan_id='a2000000-0000-4000-8000-000000000001')<>'pending' then raise exception 'Edit rewrote the RSVP'; end if;
 begin perform public.change_plan_v2('a2000000-0000-4000-8000-000000000001',1,'Stale','',array['community'],now()+interval '1 day','UTC','X','',false); raise exception 'Stale edit accepted'; exception when serialization_failure then null; end;
 begin perform public.change_plan_v2('a2000000-0000-4000-8000-000000000001',2,'Fine',repeat('d',1001),array['community'],now()+interval '1 day','UTC','X','',false); raise exception 'Invalid edit accepted'; exception when check_violation then null; end;
end $$;
reset role;
do $$ begin
 if not exists(select 1 from private.notification_outbox where plan_id='a2000000-0000-4000-8000-000000000001' and recipient_id='a1000000-0000-4000-8000-000000000002' and kind='plan_changed') then raise exception 'Invitee not told about the edit'; end if;
end $$;

-- The legacy change_plan leaves event text alone; cancelling ignores the other arguments.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.change_plan('a2000000-0000-4000-8000-000000000001',2,now()+interval '1 day','Europe/London','New place','Bring wine',false);
do $$ begin
 if (select title from public.plans where id='a2000000-0000-4000-8000-000000000001')<>'Dinner & games' then raise exception 'Legacy edit lost the title'; end if;
end $$;
select public.change_plan_v2('a2000000-0000-4000-8000-000000000001',3,null,null,null,null,null,null,null,true);
do $$ begin
 if (select status||'|'||title from public.plans where id='a2000000-0000-4000-8000-000000000001')<>'cancelled|Dinner & games' then raise exception 'Cancel failed or changed the title'; end if;
 begin perform public.change_plan_v2('a2000000-0000-4000-8000-000000000001',4,null,null,null,null,null,null,null,true); raise exception 'Cancelled twice'; exception when invalid_parameter_value then null; end;
end $$;
reset role;
do $$ begin
 if exists(select 1 from private.invitations where plan_id='a2000000-0000-4000-8000-000000000001' and revoked_at is null) then raise exception 'Cancel left an open invitation'; end if;
end $$;

-- While an owner's profile is marked for deletion, no update keeps their event text.
update public.profiles set deletion_requested_at=now() where id='a1000000-0000-4000-8000-000000000001';
update public.plans set place_label='Meeting place removed', note='' where owner_id='a1000000-0000-4000-8000-000000000001';
do $$ begin
 if exists(select 1 from public.plans where owner_id='a1000000-0000-4000-8000-000000000001' and (title<>'Resbite' or description<>'')) then raise exception 'Deleting owner event text retained'; end if;
end $$;
rollback;
```

- [ ] **Step 2: Run the suite to verify it fails**

Run: `./scripts/test-database.sh` (from the repository root)
Expected: `PASS: account-access.sql`, `PASS: avatar-revision.sql`, `PASS: catalogue.sql`, then FAIL in `custom-events.sql` with `function public.create_plan_v2(...) does not exist`.

- [ ] **Step 3: Write the migration**

`supabase/migrations/20261007150000_custom_events.sql`:

```sql
-- Custom events (CE1): a plan carries its own title, description and categories.
-- Catalogue ideas become optional, editable templates (owner decisions CE-D1..D8).
-- Hosted-compatible: depends only on the five deployed migrations.

-- One or two distinct keys from the seven approved categories (CE-D5, CE-D6).
-- Always true or false, never null, so a CHECK constraint cannot pass on null.
create function private.valid_categories(p text[]) returns boolean
language sql immutable set search_path = '' as $$
 select coalesce(
  array_ndims(p) = 1
  and cardinality(p) between 1 and 2
  and array_position(p, null) is null
  and p <@ array['creative','intellectual','mindful','natural','physical','community','uplifting']::text[]
  and cardinality(p) = (select count(distinct x) from unnest(p) as x),
  false)
$$;

alter table public.activities
 add column categories text[],
 add constraint activities_categories_valid check (categories is null or private.valid_categories(categories));

-- Approved mapping for the eleven published ideas (CE-D7).
-- Mirrors mobile/content/activity-categories.json; a mobile test keeps them identical.
update public.activities as a set categories = m.categories
from (values
 ('coffee-together', array['community','uplifting']),
 ('painting', array['creative','mindful']),
 ('get-out-with-bikes', array['physical','natural']),
 ('building-a-snowman', array['creative','natural']),
 ('bbq', array['community','natural']),
 ('wine-tasting', array['community','intellectual']),
 ('spa-day', array['mindful','uplifting']),
 ('book-club', array['intellectual','community']),
 ('picnic-in-the-park', array['natural','community']),
 ('walk-and-talk', array['physical','community']),
 ('board-game-night', array['intellectual','community'])
) as m(id, categories)
where a.id = m.id;

-- Published ideas must always offer categories to the events they prefill.
alter table public.activities
 add constraint activities_published_categories check (not published or categories is not null);

alter table public.plans
 add column title text,
 add column description text not null default '',
 add column categories text[],
 alter column activity_id drop not null;
comment on column public.plans.activity_id is 'Idea this event started from, if any (an editable template, CE-D3).';

-- Existing plans take their idea's title and categories. A plan whose idea has no
-- categories fails the not-null step below loudly instead of inventing one.
update public.plans as p
 set title = btrim(left(btrim(a.title), 80)), categories = a.categories
 from public.activities as a where a.id = p.activity_id;

alter table public.plans
 alter column title set not null,
 alter column categories set not null,
 add constraint plans_title_valid check (title = btrim(title) and length(title) between 1 and 80),
 add constraint plans_description_valid check (length(description) <= 1000),
 add constraint plans_categories_valid check (private.valid_categories(categories));

-- Older callers (the legacy create_plan, maintainer and fixture inserts) omit the
-- event fields; fill them from the idea so every row meets the rules above.
create function private.fill_plan_from_activity() returns trigger
language plpgsql set search_path = '' as $$
declare v_title text; v_categories text[];
begin
 if (new.title is null or new.categories is null) and new.activity_id is not null then
  select a.title, a.categories into v_title, v_categories from public.activities as a where a.id = new.activity_id;
  new.title := coalesce(new.title, btrim(left(btrim(v_title), 80)));
  new.categories := coalesce(new.categories, v_categories);
 end if;
 return new;
end $$;
create trigger plans_fill_from_activity before insert on public.plans
 for each row execute function private.fill_plan_from_activity();

-- Account deletion marks the profile before it updates each owned plan. While that
-- mark is present, no update can leave organizer-written event text behind.
create function private.redact_deleting_owner_plan() returns trigger
language plpgsql set search_path = '' as $$
begin
 if new.owner_id is not null and exists(
  select 1 from public.profiles as p where p.id = new.owner_id and p.deletion_requested_at is not null) then
  new.title := 'Resbite';
  new.description := '';
 end if;
 return new;
end $$;
create trigger plans_redact_deleting_owner before update on public.plans
 for each row execute function private.redact_deleting_owner_plan();

create function private.create_plan_v2(p_id uuid,p_title text,p_description text,p_categories text[],p_activity text,p_start timestamptz,p_zone text,p_place text,p_note text default '',p_lat double precision default null,p_lon double precision default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_tester(); v_existing public.plans;
begin
 -- Serialize repeated creation IDs; a retry must match the original payload exactly.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_id::text,0));
 select * into v_existing from public.plans where id=p_id;
 if found then
  if v_existing.owner_id<>v_uid or v_existing.title is distinct from btrim(p_title)
  or v_existing.description is distinct from coalesce(p_description,'') or v_existing.categories is distinct from p_categories
  or v_existing.activity_id is distinct from p_activity or v_existing.starts_at is distinct from p_start
  or v_existing.time_zone is distinct from p_zone or v_existing.place_label is distinct from btrim(p_place)
  or v_existing.note is distinct from coalesce(p_note,'') or v_existing.latitude is distinct from p_lat
  or v_existing.longitude is distinct from p_lon then
   raise exception 'Creation identifier already used' using errcode='22023';
  end if;
  return p_id;
 end if;
 if p_start is null or p_start<=now() or not exists(select 1 from pg_catalog.pg_timezone_names where name=p_zone) then raise exception 'Invalid future schedule' using errcode='22023'; end if;
 if p_activity is not null and not exists(select 1 from public.activities where id=p_activity and published) then raise exception 'Activity unavailable' using errcode='22023'; end if;
 insert into public.plans(id,owner_id,activity_id,title,description,categories,starts_at,time_zone,place_label,note,latitude,longitude)
 values(p_id,v_uid,p_activity,btrim(p_title),coalesce(p_description,''),p_categories,p_start,p_zone,btrim(p_place),coalesce(p_note,''),p_lat,p_lon);
 return p_id;
end $$;

create function private.change_plan_v2(p_plan uuid,p_version integer,p_title text,p_description text,p_categories text[],p_start timestamptz,p_zone text,p_place text,p_note text,p_cancel boolean default false)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_tester(); v_plan public.plans; v_next integer; v_cancel boolean := coalesce(p_cancel,false);
begin
 select * into v_plan from public.plans where id=p_plan for update;
 if not found or v_plan.owner_id<>v_uid then raise exception 'Owner required' using errcode='42501'; end if;
 if v_plan.status<>'active' or v_plan.starts_at<=now() then raise exception 'Plan unavailable' using errcode='22023'; end if;
 if p_version is distinct from v_plan.version then raise exception 'Plan changed; refresh' using errcode='40001'; end if;
 if not v_cancel and (p_start is null or p_start<=now() or not exists(select 1 from pg_catalog.pg_timezone_names where name=p_zone)) then raise exception 'Invalid future schedule' using errcode='22023'; end if;
 v_next := v_plan.version+1;
 if v_cancel then
  -- Terminal; the other arguments are ignored.
  update public.plans set status='cancelled',version=v_next where id=p_plan;
  update private.invitations set revoked_at=now() where plan_id=p_plan and revoked_at is null;
 else
  update public.plans set title=btrim(p_title),description=coalesce(p_description,''),categories=p_categories,
   starts_at=p_start,time_zone=p_zone,place_label=btrim(p_place),note=coalesce(p_note,''),latitude=null,longitude=null,version=v_next
  where id=p_plan;
 end if;
 insert into private.notification_outbox(plan_id,recipient_id,kind,dedupe_key)
 select p_plan,a.user_id,case when v_cancel then 'plan_cancelled' else 'plan_changed' end,'plan:'||p_plan||':'||v_next||':'||a.user_id
 from public.attendees a where a.plan_id=p_plan and a.user_id<>v_uid on conflict do nothing;
 return v_next;
end $$;

create function public.create_plan_v2(p_id uuid,p_title text,p_description text,p_categories text[],p_activity text,p_start timestamptz,p_zone text,p_place text,p_note text default '',p_lat double precision default null,p_lon double precision default null)
returns uuid language sql security invoker set search_path='' as $$ select private.create_plan_v2(p_id,p_title,p_description,p_categories,p_activity,p_start,p_zone,p_place,p_note,p_lat,p_lon) $$;
create function public.change_plan_v2(p_plan uuid,p_version integer,p_title text,p_description text,p_categories text[],p_start timestamptz,p_zone text,p_place text,p_note text,p_cancel boolean default false)
returns integer language sql security invoker set search_path='' as $$ select private.change_plan_v2(p_plan,p_version,p_title,p_description,p_categories,p_start,p_zone,p_place,p_note,p_cancel) $$;

revoke all on function private.valid_categories(text[]), private.fill_plan_from_activity(), private.redact_deleting_owner_plan()
 from public, anon, authenticated;
revoke all on function
 private.create_plan_v2(uuid,text,text,text[],text,timestamptz,text,text,text,double precision,double precision),
 public.create_plan_v2(uuid,text,text,text[],text,timestamptz,text,text,text,double precision,double precision),
 private.change_plan_v2(uuid,integer,text,text,text[],timestamptz,text,text,text,boolean),
 public.change_plan_v2(uuid,integer,text,text,text[],timestamptz,text,text,text,boolean)
 from public, anon, authenticated;
grant execute on function
 private.create_plan_v2(uuid,text,text,text[],text,timestamptz,text,text,text,double precision,double precision),
 public.create_plan_v2(uuid,text,text,text[],text,timestamptz,text,text,text,double precision,double precision),
 private.change_plan_v2(uuid,integer,text,text,text[],timestamptz,text,text,text,boolean),
 public.change_plan_v2(uuid,integer,text,text,text[],timestamptz,text,text,text,boolean)
 to authenticated;
```

- [ ] **Step 4: Update fixtures that insert published ideas or plans without the new fields**

Published ideas now need categories. Replace each line exactly:

`supabase/tests/foundation.sql` line 10:
```sql
insert into public.activities(id,title,description,category,artwork_key,source_ids,published,categories) values('test-only','Test activity','Synthetic fixture','Creative','test-only',array['test'],true,array['creative']);
```

`supabase/tests/deletion.sql` lines 8–9:
```sql
insert into public.activities(id,title,description,category,artwork_key,source_ids,published,categories) values('delete-test','Test','Test','Creative','test',array['test'],true,array['creative']);
insert into public.plans(id,owner_id,activity_id,title,description,starts_at,time_zone,place_label,note) values('43000000-0000-4000-8000-000000000001','41000000-0000-4000-8000-000000000001','delete-test','Private title','Private description',now()+interval '1 day','UTC','Private place','Private note');
```
and in the same file, directly after the line containing `'Place not redacted'`, add:
```sql
 if (select title||'|'||description from public.plans where id='43000000-0000-4000-8000-000000000001')<>'Resbite|' then raise exception 'Event text not redacted'; end if;
```

`supabase/tests/photo-cleanup.sql` line 12:
```sql
insert into public.activities(id,title,description,category,artwork_key,source_ids,published,categories) values('photo-test','Test','Test','Creative','test',array['test'],true,array['creative']);
```

`supabase/tests/notifications.sql` line 8:
```sql
insert into public.activities(id,title,description,category,artwork_key,source_ids,published,categories) values('push-fixture','Synthetic','Synthetic','Creative','synthetic',array['test'],true,array['creative']);
```

`supabase/tests/avatar-revision.sql` line 24 (unpublished, but its plan needs categories from the insert trigger):
```sql
insert into public.activities(id,title,description,category,artwork_key,source_ids,categories) values('avatar-fixture','Fixture','Fixture','Creative','fixture',array['fixture'],array['creative']);
```

`supabase/tests/catalogue.sql` lines 7–9:
```sql
insert into public.activities(id,title,description,category,artwork_key,source_ids,published,tips,duration_minutes,categories) values
 ('catalogue-live','Live fixture','Server wording','Creative','painting',array['fixture'],true,array['Reviewed suggestion'],30,array['creative']),
 ('catalogue-draft','Draft fixture','Unapproved wording','Creative','painting',array['fixture'],false,array['Draft suggestion'],null,null);
```

- [ ] **Step 5: Run the full suite to verify it passes**

Run: `./scripts/test-database.sh`
Expected: `PASS:` for all twelve SQL files including `custom-events.sql`, the four concurrency PASS lines, and the final `PASS: disposable SQL assertions; synthetic roster empty…`. The `initdb … text search configuration` warning is harmless.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20261007150000_custom_events.sql supabase/tests/
git commit -m "Add custom event fields, v2 plan functions and category rules

Plans carry title, description and one or two approved categories;
the idea link becomes optional. Insert trigger keeps legacy callers
working; update trigger keeps deletion redaction complete.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Hosted-baseline test mode

**Files:**
- Modify: `scripts/test-database.sh` (full rewrite below)
- Create: `supabase/tests/hosted-baseline/migrations.txt`
- Create: `supabase/tests/hosted-baseline/tests.txt`
- Create: `supabase/tests/hosted-baseline/20261007150000_custom_events.before.sql`
- Create: `supabase/tests/hosted-baseline/20261007150000_custom_events.after.sql`

**Interfaces:**
- Consumes: the migration and `custom-events.sql` from Task 2.
- Produces: `./scripts/test-database.sh --hosted-baseline [CANDIDATE.sql ...]`, used in Task 11.

- [ ] **Step 1: Write the baseline data files**

`supabase/tests/hosted-baseline/migrations.txt`:
```
# Local migration files applied on hosted project ewcsgvhuojxdpaspwsrx, in order.
# Hosted versions differ from the filenames; the hosted version follows each name.
20260917190517_resbite_private_tester_foundation.sql   20260917191323
20260923150059_account_access_status.sql               20260923151512
20260923150902_atomic_registration_details.sql         20260923151515
20260923152900_activity_catalogue_details.sql          20260923154040
20260924150135_avatar_revision_compare_and_swap.sql    20260924150824
```

`supabase/tests/hosted-baseline/tests.txt`:
```
# SQL tests that only use objects present on the hosted baseline.
foundation.sql
catalogue.sql
avatar-revision.sql
security-review.sql
custom-events.sql
```

`supabase/tests/hosted-baseline/20261007150000_custom_events.before.sql`:
```sql
-- A plan in the pre-custom-events shape, so the migration's backfill can be checked.
insert into auth.users(id,email,email_confirmed_at) values('b1000000-0000-4000-8000-000000000001','legacy-owner@resbite-test.invalid',now());
insert into public.profiles(id,display_name) values('b1000000-0000-4000-8000-000000000001','Legacy owner');
insert into public.activities(id,title,description,category,artwork_key,source_ids,published) values('painting','Painting','Legacy fixture','Creative','painting',array['fixture'],true);
insert into public.plans(id,owner_id,activity_id,starts_at,time_zone,place_label) values('b2000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001','painting',now()+interval '1 day','UTC','Legacy place');
```

`supabase/tests/hosted-baseline/20261007150000_custom_events.after.sql`:
```sql
do $$ begin
 if (select categories from public.activities where id='painting')<>array['creative','mindful'] then raise exception 'Approved idea mapping not applied'; end if;
 if (select title||'|'||description||'|'||categories::text from public.plans where id='b2000000-0000-4000-8000-000000000001')<>'Painting||{creative,mindful}' then raise exception 'Legacy plan not backfilled'; end if;
end $$;
-- Remove the seed so later tests start clean.
delete from public.plans where id='b2000000-0000-4000-8000-000000000001';
delete from public.activities where id='painting';
delete from public.profiles where id='b1000000-0000-4000-8000-000000000001';
delete from auth.users where id='b1000000-0000-4000-8000-000000000001';
```

- [ ] **Step 2: Run baseline mode to verify it fails**

Run: `./scripts/test-database.sh --hosted-baseline 20261007150000_custom_events.sql`
Expected: the current script ignores the flag and runs full mode (all PASS). That shows the mode does not exist yet. Proceed.

- [ ] **Step 3: Rewrite the script**

`scripts/test-database.sh`:
```bash
#!/bin/bash
# No hosted URL accepted: this always creates and destroys its own local cluster.
# Default: every local migration, every SQL test and the concurrency scripts.
# --hosted-baseline [CANDIDATE.sql ...]: only the migrations in
#   supabase/tests/hosted-baseline/migrations.txt (what the hosted project runs), then each
#   candidate with its optional <name>.before.sql / <name>.after.sql checks, then the tests in
#   supabase/tests/hosted-baseline/tests.txt. Run it before applying a migration to hosted.
set -euo pipefail
repo="$(cd "$(dirname "$0")/.." && pwd)"
pg_bin="${RESBITE_PG_BIN:-/opt/homebrew/opt/postgresql@17/bin}"
mode=full
candidates=()
if [ "${1:-}" = "--hosted-baseline" ]; then
  mode=hosted
  shift
  candidates=("$@")
fi
work="$(mktemp -d /private/tmp/resbite-pg.XXXXXX)"
cleanup() { "$pg_bin/pg_ctl" -D "$work/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$work"; }
trap cleanup EXIT
"$pg_bin/initdb" -D "$work/data" -A trust -U postgres >/dev/null
"$pg_bin/pg_ctl" -D "$work/data" -l "$work/postgres.log" -o "-k $work -h '' -p 55437" -w start >/dev/null
psql_args=(-X -v ON_ERROR_STOP=1 -h "$work" -p 55437 -U postgres -d postgres)
run_sql() { "$pg_bin/psql" "${psql_args[@]}" -f "$1" >>"$work/tests.log"; }
run_sql "$repo/supabase/tests/local/bootstrap.sql"
if [ "$mode" = full ]; then
  for sql in "$repo"/supabase/migrations/*.sql; do run_sql "$sql"; done
  for sql in "$repo"/supabase/tests/*.sql; do
    run_sql "$sql"
    echo "PASS: $(basename "$sql")"
  done
  "$repo/supabase/tests/local/concurrency.sh" "$pg_bin" "$work" 55437
  "$repo/supabase/tests/local/registration-details-concurrency.sh" "$pg_bin" "$work" 55437
  "$repo/supabase/tests/local/photo-cleanup-concurrency.sh" "$pg_bin" "$work" 55437
  "$repo/supabase/tests/local/avatar-revision-concurrency.sh" "$pg_bin" "$work" 55437
else
  baseline="$repo/supabase/tests/hosted-baseline"
  while read -r name _; do
    case "$name" in '' | '#'*) continue ;; esac
    run_sql "$repo/supabase/migrations/$name"
  done <"$baseline/migrations.txt"
  for candidate in ${candidates[@]+"${candidates[@]}"}; do
    name="$(basename "$candidate" .sql)"
    if [ -f "$baseline/$name.before.sql" ]; then run_sql "$baseline/$name.before.sql"; fi
    run_sql "$repo/supabase/migrations/$name.sql"
    if [ -f "$baseline/$name.after.sql" ]; then run_sql "$baseline/$name.after.sql"; fi
    echo "PASS: $name applies on the hosted baseline"
  done
  while read -r name _; do
    case "$name" in '' | '#'*) continue ;; esac
    run_sql "$repo/supabase/tests/$name"
    echo "PASS: $name (hosted baseline)"
  done <"$baseline/tests.txt"
fi
"$pg_bin/psql" "${psql_args[@]}" -Atc 'select count(*) from private.tester_roster' | while read -r count; do
  test "$count" = 0 || { echo 'Synthetic roster data leaked'; exit 1; }
done
echo "PASS: disposable SQL assertions ($mode); synthetic roster empty. Auth/Storage HTTP integration is separate."
```

- [ ] **Step 4: Run both modes to verify they pass**

Run: `./scripts/test-database.sh --hosted-baseline 20261007150000_custom_events.sql`
Expected: `PASS: 20261007150000_custom_events applies on the hosted baseline`, five `PASS: … (hosted baseline)` lines, and the final line with `(hosted)`.

Run: `./scripts/test-database.sh`
Expected: unchanged full-mode results from Task 2, with `(full)` in the final line.

- [ ] **Step 5: Commit**

```bash
git add scripts/test-database.sh supabase/tests/hosted-baseline/
git commit -m "Add hosted-baseline SQL test mode

Applies only the migrations the hosted project runs, then a candidate
migration with backfill checks, then the hosted-compatible tests.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Ideas use the seven categories

**Files:**
- Create: `mobile/content/activity-categories.json`
- Create: `mobile/content/activity-categories-approval.json` (generated in Step 3)
- Create: `mobile/src/design/categories.tsx`
- Modify: `mobile/src/design/tokens.ts`, `mobile/src/domain/rules.ts`, `mobile/src/domain/catalogue.ts`, `mobile/src/services/catalogue.ts`, `mobile/src/services/liveCatalogue.ts:20`, `mobile/app/(tabs)/discover.tsx`, `mobile/app/activity/[id].tsx:120`, `mobile/scripts/validate-content.mjs`, `mobile/scripts/verify-catalogue.mjs:51`
- Test: `mobile/src/domain/categories.test.ts`, `mobile/src/domain/rules.test.ts`, `mobile/src/services/liveCatalogue.test.ts`

**Interfaces:**
- Consumes: Task 1 `CategoryKey`, `validCategories`, `categoryKeys`, `categoryLabels`. Task 2 migration file (read by a test).
- Produces:
  - `Activity.categories: CategoryKey[]`. The `category` field is removed from `Activity`.
  - `filterActivities(items: Activity[], query: string, category: CategoryKey | "all"): Activity[]`
  - `categoryPalette` (tokens), `categoryIcons: Record<CategoryKey, Icon>`, `categoryText(keys): string`, `CategoryFilterTile` (design)

- [ ] **Step 1: Write the failing tests**

Append to `mobile/src/domain/categories.test.ts`:
```ts
import { readFile } from "node:fs/promises";
import { categoryPalette } from "../design/tokens.ts";

const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

test("each category ink stays readable on its tint and on white", () => {
  for (const key of categoryKeys) {
    const { tint, ink } = categoryPalette[key];
    assert.ok(contrast(tint, ink) >= 4.5, `${key} on tint`);
    assert.ok(contrast("#FFFFFF", ink) >= 4.5, `${key} on white`);
  }
});

test("the bundled category overlay matches the migration that publishes it", async () => {
  const overlay = JSON.parse(
    await readFile(new URL("../../content/activity-categories.json", import.meta.url), "utf8"),
  );
  const sql = await readFile(
    new URL("../../../supabase/migrations/20261007150000_custom_events.sql", import.meta.url),
    "utf8",
  );
  const published = [...sql.matchAll(/\('([a-z-]+)', array\[([^\]]+)\]\)/g)].map(
    ([, id, keys]) => ({
      id,
      categories: [...keys.matchAll(/'([a-z]+)'/g)].map((m) => m[1]),
    }),
  );
  assert.equal(published.length, 11);
  assert.deepEqual(published, overlay.activities);
  for (const entry of overlay.activities) assert.ok(validCategories(entry.categories), entry.id);
});
```

In `mobile/src/domain/rules.test.ts`:
- Add `type Activity,` to the import from `./rules.ts`.
- Replace the `entries` declaration with:
```ts
const entries: Activity[] = [
  {
    id: "paint",
    title: "Painting together",
    categories: ["creative", "mindful"],
    description: "",
    tips: [],
    durationMinutes: null,
    artwork: "",
    sourceIds: [],
  },
  {
    id: "cycle",
    title: "Cycling together",
    categories: ["physical", "natural"],
    description: "",
    tips: [],
    durationMinutes: null,
    artwork: "",
    sourceIds: [],
  },
];
```
- Replace the test `"search is case-insensitive and intersects category"` with:
```ts
test("search is case-insensitive and intersects either category", () => {
  assert.deepEqual(filterActivities(entries, " PAINT ", "all").map((x) => x.id), ["paint"]);
  assert.equal(filterActivities(entries, "paint", "physical").length, 0);
  assert.deepEqual(filterActivities(entries, "", "mindful").map((x) => x.id), ["paint"]);
  assert.deepEqual(filterActivities(entries, "", "natural").map((x) => x.id), ["cycle"]);
  assert.equal(filterActivities(entries, "", "all").length, 2);
});
```

In `mobile/src/services/liveCatalogue.test.ts`:
- In the first test, after reading `additions`, read the overlay:
```ts
  const overlay = JSON.parse(
    await readFile(new URL("../../content/activity-categories.json", import.meta.url), "utf8"),
  );
```
- In the row mapper's parameter type, delete `category: string;`. In the returned row, replace `category: item.category,` with:
```ts
      categories: overlay.activities.find((entry: { id: string }) => entry.id === item.id).categories,
```
- Replace the three `filterActivities` assertions with:
```ts
  assert.deepEqual(
    filterActivities(decoded, " PICNIC ", "natural").map((item) => item.id),
    ["picnic-in-the-park"],
  );
  assert.deepEqual(filterActivities(decoded, "picnic", "physical"), []);
  assert.deepEqual(
    filterActivities(decoded, "", "community").map((item) => item.id),
    ["picnic-in-the-park", "walk-and-talk", "board-game-night"],
  );
```
- Rename that test to `"three owner-approved additions decode with reviewed content and intersect search with approved categories"`.
- In `const published = {…}`, replace `category: "Meals & Drinks",` with `categories: ["community", "uplifting"],`. Replace every `category: published.category` in the file with `categories: published.categories`.
- Add at the end of the file:
```ts
test("a server without approved categories is reported, not shown with guessed labels", () => {
  const legacy: Record<string, unknown> = { ...published, category: "Meals & Drinks" };
  delete legacy.categories;
  assert.throws(() => decodePublishedActivities([legacy]), /could not be read/);
  assert.throws(
    () => decodePublishedActivities([{ ...published, categories: ["community", "community"] }]),
    /could not be read/,
  );
  assert.deepEqual(decodePublishedActivities([published])[0].categories, ["community", "uplifting"]);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd mobile && node --import tsx src/domain/categories.test.ts`
Expected: FAIL (`categoryPalette` is not exported, and the overlay file is missing).

- [ ] **Step 3: Create the overlay and its approval record**

`mobile/content/activity-categories.json`:
```json
{
  "schemaVersion": 1,
  "decision": "CE-D7",
  "note": "Approved categories for the bundled ideas. The approved content snapshots keep their temporary discovery labels as history.",
  "activities": [
    { "id": "coffee-together", "categories": ["community", "uplifting"] },
    { "id": "painting", "categories": ["creative", "mindful"] },
    { "id": "get-out-with-bikes", "categories": ["physical", "natural"] },
    { "id": "building-a-snowman", "categories": ["creative", "natural"] },
    { "id": "bbq", "categories": ["community", "natural"] },
    { "id": "wine-tasting", "categories": ["community", "intellectual"] },
    { "id": "spa-day", "categories": ["mindful", "uplifting"] },
    { "id": "book-club", "categories": ["intellectual", "community"] },
    { "id": "picnic-in-the-park", "categories": ["natural", "community"] },
    { "id": "walk-and-talk", "categories": ["physical", "community"] },
    { "id": "board-game-night", "categories": ["intellectual", "community"] }
  ]
}
```

Generate the approval (binds the overlay's exact bytes). Run from the repository root:
```bash
node -e '
const fs = require("fs"), crypto = require("crypto");
const bytes = fs.readFileSync("mobile/content/activity-categories.json");
const overlay = JSON.parse(bytes);
fs.writeFileSync("mobile/content/activity-categories-approval.json", JSON.stringify({
  schemaVersion: 1,
  status: "approved-for-owner-only-beta",
  approvedOn: "2026-10-07",
  approvedBy: "owner",
  decision: "CE-D7",
  spec: "docs/superpowers/specs/2026-10-07-custom-events-design.md",
  taxonomy: ["creative","intellectual","mindful","natural","physical","community","uplifting"],
  approvedActivityIds: overlay.activities.map((e) => e.id),
  mappingSha256: crypto.createHash("sha256").update(bytes).digest("hex"),
  replacesTemporaryDiscoveryFilters: true,
  wellnessFormulaApproved: false,
  policyExtensionApproved: false,
  additionalTesterAccessApproved: false
}, null, 2) + "\n");'
```

- [ ] **Step 4: Implement**

`mobile/src/design/tokens.ts`, append:
```ts

// Category tints and inks (CE-D5). Each ink meets 4.5:1 on its tint and on white.
export const categoryPalette = {
  creative: { tint: "#FCEAEC", ink: "#963F58" },
  intellectual: { tint: "#F0EDF4", ink: "#665381" },
  mindful: { tint: "#E8F6F3", ink: "#245F60" },
  natural: { tint: "#EAF4E4", ink: "#3D6B35" },
  physical: { tint: "#FDF1E3", ink: "#8A5A1C" },
  community: { tint: "#FAF5F0", ink: "#7A4E2D" },
  uplifting: { tint: "#FFF7DC", ink: "#7A6012" },
} as const;
```

`mobile/src/domain/rules.ts`, replace the `Activity` type and `filterActivities` (lines 1–22):
```ts
import type { CategoryKey } from "./categories";
export type Activity = {
  id: string;
  title: string;
  categories: CategoryKey[];
  description: string;
  tips: string[];
  durationMinutes: number | null;
  artwork: string;
  sourceIds: string[];
};
export function filterActivities(
  items: Activity[],
  query: string,
  category: CategoryKey | "all",
): Activity[] {
  const term = query.trim().toLocaleLowerCase();
  return items.filter(
    (x) =>
      (category === "all" || x.categories.includes(category)) &&
      x.title.toLocaleLowerCase().includes(term),
  );
}
```

`mobile/src/domain/catalogue.ts`:
- Add `import { validCategories } from "./categories";` under the existing import.
- Before `return {`, add:
```ts
    const categories = row.categories;
    if (!validCategories(categories))
      throw Error("An activity could not be read.");
```
- In the returned object, replace `category: text("category", 100),` with `categories: [...categories],`.

`mobile/src/services/liveCatalogue.ts` line 20: change the select string to
`"id,title,categories,description,artwork_key,source_ids,published,duration_minutes,tips"`.

`mobile/src/services/catalogue.ts`, replace lines 1–6 and delete the `categories` export (lines 20–23):
```ts
import entries from "../../content/activities.json";
import additions from "../../content/activity-additions.json";
import overlay from "../../content/activity-categories.json";
import type { Activity } from "../domain/rules";
import { validCategories } from "../domain/categories";
// Bundled approved snapshots serve Preview and historical plan labels only.
// Signed-in discovery and new plans still require current server publication.
// Categories come from their own approved overlay (CE-D7); the snapshots stay unchanged.
const approvedCategories = new Map<string, unknown>(
  overlay.activities.map((entry) => [entry.id, entry.categories]),
);
export const activities: Activity[] = [...entries, ...additions].map(
  ({ id, title, description, tips, durationMinutes, artwork, sourceIds }) => {
    const categories = approvedCategories.get(id);
    if (!validCategories(categories))
      throw Error(`Approved categories missing for ${id}.`);
    return { id, title, description, tips, durationMinutes, artwork, sourceIds, categories };
  },
);
```

`mobile/src/design/categories.tsx` (new):
```tsx
import React from "react";
import { Pressable, StyleSheet } from "react-native";
import { Bike, Flower2, Lightbulb, Palette, Sun, Trees, Users } from "lucide-react-native";
import { categoryLabels, type CategoryKey } from "../domain/categories";
import { colors as c, fonts } from "./tokens";
import { Copy } from "./ui";

export type CategoryIcon = typeof Sun;
export const categoryIcons: Record<CategoryKey, CategoryIcon> = {
  creative: Palette,
  intellectual: Lightbulb,
  mindful: Flower2,
  natural: Trees,
  physical: Bike,
  community: Users,
  uplifting: Sun,
};

export function categoryText(keys: readonly CategoryKey[]) {
  return keys.map((key) => categoryLabels[key]).join(" · ");
}

/** A single-choice filter tile for browsing ideas. */
export function CategoryFilterTile({
  label,
  icon: Icon,
  selected,
  onPress,
}: {
  label: string;
  icon: CategoryIcon;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[
        styles.filter,
        {
          borderColor: selected ? c.aquaDark : c.line,
          backgroundColor: selected ? c.aquaSoft : c.paper,
        },
      ]}
    >
      <Icon size={20} strokeWidth={1.7} color={selected ? c.aquaDark : "#665381"} />
      <Copy
        style={{
          fontSize: 12,
          fontFamily: fonts.body,
          color: selected ? c.aquaDark : c.ink,
        }}
      >
        {label}
      </Copy>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  filter: {
    minHeight: 64,
    minWidth: 76,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1,
  },
});
```

`mobile/app/(tabs)/discover.tsx`:
- Imports: remove `Sun`, `Palette`, `Mountain`, `Coffee` and `Leaf` from the lucide import. Add:
```ts
import { categoryKeys, categoryLabels, type CategoryKey } from "../../src/domain/categories";
import { CategoryFilterTile, categoryIcons, categoryText } from "../../src/design/categories";
```
- Replace `[category, setCategory] = useState("All");` with `[category, setCategory] = useState<CategoryKey | "all">("all");`.
- Delete the `categories` array and `selectedCategory` (lines 46–50). Replace every remaining `selectedCategory` with `category`, and `selectedCategory === "All"` with `category === "all"`.
- Replace the whole `{categories.map((cat) => ( <Pressable …>…</Pressable> ))}` block (lines 148–197) with:
```tsx
          <CategoryFilterTile
            label="All"
            icon={LayoutGrid}
            selected={category === "all"}
            onPress={() => setCategory("all")}
          />
          {categoryKeys.map((key) => (
            <CategoryFilterTile
              key={key}
              label={categoryLabels[key]}
              icon={categoryIcons[key]}
              selected={category === key}
              onPress={() => setCategory(key)}
            />
          ))}
```
- In "Clear search", replace `setCategory("All")` with `setCategory("all")`.
- In the idea card, replace `{a.category}` with `{categoryText(a.categories)}`.

`mobile/app/activity/[id].tsx` line 120: replace `{a.category}` with `{categoryText(a.categories)}` and add `import { categoryText } from "../../src/design/categories";`.

`mobile/scripts/validate-content.mjs`: insert before the final `console.log(`:
```js
// Categories (CE-D5/D7) live in their own approved overlay; the snapshots above stay untouched.
const taxonomy = ["creative", "intellectual", "mindful", "natural", "physical", "community", "uplifting"];
const overlayBytes = await readFile(new URL("../content/activity-categories.json", import.meta.url));
const overlay = JSON.parse(overlayBytes.toString("utf8"));
const overlayApproval = JSON.parse(
  await readFile(new URL("../content/activity-categories-approval.json", import.meta.url), "utf8"),
);
assert.equal(overlay.schemaVersion, 1);
assert.deepEqual(
  overlay.activities.map((entry) => entry.id),
  [...items, ...additions].map((item) => item.id),
  "Every bundled idea needs exactly one approved category entry.",
);
for (const entry of overlay.activities) {
  assert.ok(
    Array.isArray(entry.categories) && entry.categories.length >= 1 && entry.categories.length <= 2,
    `${entry.id} needs one or two categories.`,
  );
  assert.equal(new Set(entry.categories).size, entry.categories.length, `${entry.id} repeats a category.`);
  assert.ok(entry.categories.every((key) => taxonomy.includes(key)), `${entry.id} uses an unapproved category.`);
}
assert.equal(overlayApproval.schemaVersion, 1);
assert.equal(overlayApproval.status, "approved-for-owner-only-beta");
assert.equal(overlayApproval.approvedBy, "owner");
assert.equal(overlayApproval.decision, "CE-D7");
assert.deepEqual(overlayApproval.taxonomy, taxonomy);
assert.deepEqual(overlayApproval.approvedActivityIds, overlay.activities.map((entry) => entry.id));
assert.equal(overlayApproval.mappingSha256, sha256(overlayBytes), "Category mapping changed; approval needs review.");
assert.equal(overlayApproval.wellnessFormulaApproved, false);
assert.equal(overlayApproval.additionalTesterAccessApproved, false);
```
and change the final message to:
```js
console.log(
  `${items.length} original and ${additions.length} separately approved owner-only beta activity/artwork pairs validated against their complete review scopes; ${overlay.activities.length} approved category assignments validated. Original snapshots preserved; live publication is tracked separately.`,
);
```

`mobile/scripts/verify-catalogue.mjs` line 51: replace `category: "Meals & Drinks",` with `categories: ["community", "uplifting"],`.

- [ ] **Step 5: Run checks to verify they pass**

Run: `cd mobile && npm run check`
Expected: PASS. Typecheck clean, 125 tests (122 + 2 in `categories.test.ts` + 1 in `liveCatalogue.test.ts`; the rules search test is replaced, not added), and the validation line ending in `11 approved category assignments validated…`.

Run browser QA (see Global Constraints): `node scripts/verify-catalogue.mjs`
Expected: all of its PASS lines and no `Unexpected` requests or page errors.

- [ ] **Step 6: Commit**

```bash
git add mobile/content/activity-categories.json mobile/content/activity-categories-approval.json mobile/src mobile/app mobile/scripts
git commit -m "Give ideas the seven approved categories

Bundled overlay with its own approval (CE-D7); the live catalogue reads
the categories column; Discover filters by the seven categories.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Event fields and drafts

**Files:**
- Create: `mobile/src/domain/events.ts`
- Create: `mobile/src/domain/events.test.ts`
- Modify: `mobile/src/services/draftStore.ts`, `mobile/src/services/draftStore.test.ts`, `mobile/app/(tabs)/plans.tsx:246-263`, `mobile/package.json`

**Interfaces:**
- Consumes: Task 1 `CategoryKey`, `validCategories`. Task 4 `Activity` (with `categories`), `artworkKeys` (from `src/domain/catalogue.ts`).
- Produces:
  - `TITLE_MAX = 80`, `DESCRIPTION_MAX = 1000`
  - `type EventFields = { title: string; description: string; categories: CategoryKey[] }`
  - `validateEventFields(fields: EventFields): string | null`
  - `fieldsFromActivity(activity: Activity): EventFields`
  - `completeEventFields(saved: Partial<EventFields>, fallback: EventFields | null): EventFields`
  - `type EventPicture = { kind: "artwork"; key: string } | { kind: "placeholder"; category: CategoryKey }`
  - `eventPicture(plan: { activity_id: string | null; categories: readonly CategoryKey[] }): EventPicture`
  - `PlanDraft` gains `activityId: string | null`, optional `title`, `description`, `categories`

- [ ] **Step 1: Write the failing tests**

`mobile/src/domain/events.test.ts`:
```ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  completeEventFields,
  eventPicture,
  fieldsFromActivity,
  validateEventFields,
} from "./events.ts";
import type { Activity } from "./rules.ts";

const fields = { title: "Garden picnic", description: "", categories: ["natural" as const] };

test("event fields follow the server's rules and the app trims first", () => {
  assert.equal(validateEventFields(fields), null);
  assert.equal(validateEventFields({ ...fields, title: "  Garden picnic  " }), null);
  assert.equal(validateEventFields({ ...fields, title: "   " }), "Give your resbite a name.");
  assert.equal(validateEventFields({ ...fields, title: "x".repeat(80) }), null);
  assert.ok(validateEventFields({ ...fields, title: "x".repeat(81) }));
  // Emoji count as two UTF-16 units: the app is stricter than the server, never looser.
  assert.ok(validateEventFields({ ...fields, title: "🎉".repeat(41) }));
  assert.equal(validateEventFields({ ...fields, description: "d".repeat(1000) }), null);
  assert.ok(validateEventFields({ ...fields, description: "d".repeat(1001) }));
  assert.equal(validateEventFields({ ...fields, categories: [] }), "Choose one or two categories.");
  assert.equal(
    validateEventFields({ ...fields, categories: ["natural", "community", "creative"] }),
    "Choose one or two categories.",
  );
});

const idea: Activity = {
  id: "painting",
  title: "Painting",
  categories: ["creative", "mindful"],
  description: "Paint together.",
  tips: [],
  durationMinutes: 30,
  artwork: "painting.png",
  sourceIds: [],
};

test("an idea prefills editable fields without sharing its arrays", () => {
  const prefilled = fieldsFromActivity(idea);
  assert.deepEqual(prefilled, {
    title: "Painting",
    description: "Paint together.",
    categories: ["creative", "mindful"],
  });
  prefilled.categories.pop();
  assert.deepEqual(idea.categories, ["creative", "mindful"]);
});

test("drafts saved before custom events take their missing fields from their idea", () => {
  const fallback = fieldsFromActivity(idea);
  assert.deepEqual(completeEventFields({}, fallback), fallback);
  assert.deepEqual(
    completeEventFields({ title: "Painting night", description: "" }, fallback),
    { title: "Painting night", description: "", categories: ["creative", "mindful"] },
  );
  assert.deepEqual(completeEventFields({}, null), { title: "", description: "", categories: [] });
});

test("pictures use bundled idea artwork, otherwise the primary category", () => {
  assert.deepEqual(eventPicture({ activity_id: "painting", categories: ["creative"] }), {
    kind: "artwork",
    key: "painting",
  });
  assert.deepEqual(eventPicture({ activity_id: "server-only-idea", categories: ["natural", "community"] }), {
    kind: "placeholder",
    category: "natural",
  });
  assert.deepEqual(eventPicture({ activity_id: null, categories: ["uplifting"] }), {
    kind: "placeholder",
    category: "uplifting",
  });
});
```

Append to `mobile/src/services/draftStore.test.ts`:
```ts
test("drafts saved before custom events still load without event fields", async () => {
  const { storage } = memory();
  const drafts = createDraftStore(storage);
  await drafts.put(fixture());
  const [legacy] = await drafts.list("account-a");
  assert.equal(legacy.title, undefined);
  assert.equal(legacy.activityId, "coffee");
});

test("a blank event draft has no idea and keeps its event fields", async () => {
  const { storage } = memory();
  const drafts = createDraftStore(storage);
  await drafts.put({
    ...fixture(),
    key: "new",
    activityId: null,
    title: "Garden picnic",
    description: "Bring a blanket",
    categories: ["natural", "community"],
  });
  const [blank] = await createDraftStore(storage).list("account-a");
  assert.equal(blank.activityId, null);
  assert.equal(blank.title, "Garden picnic");
  assert.deepEqual(blank.categories, ["natural", "community"]);
});

test("corrupt event fields are rejected rather than half-restored", async () => {
  for (const corrupt of [{ activityId: 5 }, { categories: "natural" }, { title: 3 }]) {
    const { storage, values } = memory();
    values.set("resbite.drafts.v1.account-a", JSON.stringify([{ ...fixture(), ...corrupt }]));
    await assert.rejects(createDraftStore(storage).list("account-a"), /Could not read saved drafts/);
  }
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd mobile && node --import tsx src/domain/events.test.ts`
Expected: FAIL with `Cannot find module` for `./events.ts`.

- [ ] **Step 3: Implement**

`mobile/src/domain/events.ts`:
```ts
import { validCategories, type CategoryKey } from "./categories";
import { artworkKeys } from "./catalogue";
import type { Activity } from "./rules";

export const TITLE_MAX = 80;
export const DESCRIPTION_MAX = 1000;

export type EventFields = {
  title: string;
  description: string;
  categories: CategoryKey[];
};

/** First problem in the organizer's own wording, matching the server rules; null when valid. */
export function validateEventFields(fields: EventFields): string | null {
  const title = fields.title.trim();
  if (!title) return "Give your resbite a name.";
  if (title.length > TITLE_MAX)
    return `Keep the name to ${TITLE_MAX} characters.`;
  if (fields.description.length > DESCRIPTION_MAX)
    return `Keep the description to ${DESCRIPTION_MAX} characters.`;
  if (!validCategories(fields.categories))
    return "Choose one or two categories.";
  return null;
}

/** An idea is an editable template (CE-D3): it prefills, everything stays changeable. */
export function fieldsFromActivity(activity: Activity): EventFields {
  return {
    title: activity.title.slice(0, TITLE_MAX).trim(),
    description: activity.description.slice(0, DESCRIPTION_MAX),
    categories: [...activity.categories],
  };
}

/** Drafts from before custom events lack event fields; saved values always win. */
export function completeEventFields(
  saved: Partial<EventFields>,
  fallback: EventFields | null,
): EventFields {
  return {
    title: saved.title ?? fallback?.title ?? "",
    description: saved.description ?? fallback?.description ?? "",
    categories: saved.categories ?? fallback?.categories ?? [],
  };
}

export type EventPicture =
  | { kind: "artwork"; key: string }
  | { kind: "placeholder"; category: CategoryKey };

/** Cover photos arrive in CE2. Until then: the idea's bundled artwork, else the primary category. */
export function eventPicture(plan: {
  activity_id: string | null;
  categories: readonly CategoryKey[];
}): EventPicture {
  if (plan.activity_id && (artworkKeys as readonly string[]).includes(plan.activity_id))
    return { kind: "artwork", key: plan.activity_id };
  return { kind: "placeholder", category: plan.categories[0] ?? "community" };
}
```

`mobile/src/services/draftStore.ts`:
- Add `import type { CategoryKey } from "../domain/categories";` with the other imports.
- In `PlanDraft`, change `activityId: string;` to `activityId: string | null;`, and after `initial: string;` add:
```ts
  // Absent in drafts saved before custom events; the editor fills them from the idea.
  title?: string;
  description?: string;
  categories?: CategoryKey[];
```
- In `read()`, remove `"activityId",` from the list of string keys, and add these conditions to the `items.some((d) => …)` disjunction, directly before `(d.pending &&`:
```ts
          !(typeof d.activityId === "string" || d.activityId === null) ||
          (d.title !== undefined && typeof d.title !== "string") ||
          (d.description !== undefined && typeof d.description !== "string") ||
          (d.categories !== undefined && !Array.isArray(d.categories)) ||
```

`mobile/app/(tabs)/plans.tsx`, in the draft card:
- Replace `{activities.find((a) => a.id === d.activityId)?.title ?? "Your plan"}` with:
```tsx
                {d.title?.trim() ||
                  activities.find((a) => a.id === d.activityId)?.title ||
                  "Your resbite"}
```
- Replace the `params:` expression of "Continue draft" with:
```tsx
                    params: d.planId
                      ? { plan: d.planId }
                      : d.activityId
                        ? { activity: d.activityId }
                        : {},
```

`mobile/package.json`: append ` && node --import tsx src/domain/events.test.ts` to the `test` script.

- [ ] **Step 4: Run checks to verify they pass**

Run: `cd mobile && npm run check`
Expected: PASS, typecheck clean, 132 tests (125 + 4 in `events.test.ts` + 3 in `draftStore.test.ts`). A pending save from scratch is tested in Task 6, once `PlanWrite` carries event fields.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/domain/events.ts mobile/src/domain/events.test.ts mobile/src/services/draftStore.ts mobile/src/services/draftStore.test.ts "mobile/app/(tabs)/plans.tsx" mobile/package.json
git commit -m "Add event field rules, idea prefill and draft upgrades

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Plan model, v2 server calls and safe cancel

**Files:**
- Modify: `mobile/src/domain/plans.ts` (full replacement below), `mobile/src/state/AppState.tsx:16-26`, `mobile/src/domain/rsvp.ts:1`, `mobile/src/services/draftStore.ts:2`, `mobile/src/services/plans.ts:17-63`, `mobile/app/arrange.tsx` (bridge edits), `mobile/app/(tabs)/plans.tsx` (cancel, card title)
- Create: `mobile/src/domain/plans.test.ts`
- Modify tests/QA: `mobile/src/domain/rules.test.ts` (plan fixtures, gateways), `mobile/src/services/draftStore.test.ts:75-160` (typed fixtures, gateways, new test), `mobile/src/domain/rsvp.test.ts:9-20` (plan fixture), `mobile/scripts/verify-planning.mjs`, `mobile/scripts/verify-rsvp.mjs:36-46`, `mobile/scripts/verify-invitations.mjs:38`, `mobile/scripts/verify-account.mjs:118`, `mobile/package.json`

**Interfaces:**
- Consumes: Task 5 `EventFields`, `fieldsFromActivity`, `completeEventFields`; Task 1 `CategoryKey`.
- Produces:
  - `type Plan` (exported from `src/domain/plans.ts`; `LocalPlan` remains an alias exported from `AppState`)
  - `PlanDetails` = `EventFields` + `starts_at`, `time_zone`, `place_label`, `note`
  - `PlanWrite.activityId: string | null`
  - `PlanGateway.cancel(plan: { id: string; version: number }): Promise<void>`
  - `cancelPlan(gateway: PlanGateway, plan: { id: string; version: number }): Promise<void>`

- [ ] **Step 1: Write the failing tests**

`mobile/src/domain/plans.test.ts`:
```ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  cancelPlan,
  PlanSaveError,
  reconcilePlan,
  samePlanDetails,
  type Plan,
  type PlanGateway,
  type PlanWrite,
} from "./plans.ts";

const plan: Plan = {
  id: "plan-1",
  activity_id: null,
  title: "Garden picnic",
  description: "Bring a blanket",
  categories: ["natural", "community"],
  owner_id: "owner",
  status: "active",
  version: 3,
  starts_at: "2099-01-01T15:00:00Z",
  time_zone: "UTC",
  place_label: "Riverside park",
  note: "",
};
const details = {
  title: plan.title,
  description: plan.description,
  categories: plan.categories,
  starts_at: plan.starts_at,
  time_zone: "UTC",
  place_label: plan.place_label,
  note: plan.note,
};
const gateway = (overrides: Partial<PlanGateway>): PlanGateway => ({
  read: async () => plan,
  create: async () => {},
  update: async () => {},
  cancel: async () => {},
  ...overrides,
});

test("event text and category order are part of the saved details", () => {
  assert.equal(samePlanDetails(plan, details), true);
  assert.equal(samePlanDetails(plan, { ...details, title: "  Garden picnic " }), true);
  assert.equal(samePlanDetails(plan, { ...details, title: "Park picnic" }), false);
  assert.equal(samePlanDetails(plan, { ...details, description: "" }), false);
  assert.equal(samePlanDetails(plan, { ...details, categories: ["community", "natural"] }), false);
});

test("a lost create from scratch is confirmed by reading it, not created twice", async () => {
  let creates = 0;
  const write: PlanWrite = { id: plan.id, activityId: null, details };
  await reconcilePlan(
    gateway({
      read: async () => ({ ...plan, version: 1 }),
      create: async () => {
        creates++;
      },
    }),
    write,
  );
  assert.equal(creates, 0);
});

test("cancelling confirms a lost or repeated reply by reading the cancelled plan", async () => {
  for (const failure of [new Error("Network lost"), { code: "22023" }]) {
    await cancelPlan(
      gateway({
        cancel: async () => {
          throw failure;
        },
        read: async () => ({ ...plan, status: "cancelled", version: 4 }),
      }),
      plan,
    );
  }
});

test("cancel conflicts and denials are definite; an unreadable outcome is uncertain", async () => {
  await assert.rejects(
    cancelPlan(
      gateway({
        cancel: async () => {
          throw { code: "40001" };
        },
        read: async () => ({ ...plan, version: 4 }),
      }),
      plan,
    ),
    (e: unknown) => e instanceof PlanSaveError && !e.uncertain && e.latest?.version === 4,
  );
  await assert.rejects(
    cancelPlan(
      gateway({
        cancel: async () => {
          throw { code: "42501" };
        },
        read: async () => null,
      }),
      plan,
    ),
    (e: unknown) => e instanceof PlanSaveError && !e.uncertain,
  );
  await assert.rejects(
    cancelPlan(
      gateway({
        cancel: async () => {
          throw new Error("Network lost");
        },
        read: async () => {
          throw new Error("Still offline");
        },
      }),
      plan,
    ),
    (e: unknown) => e instanceof PlanSaveError && e.uncertain,
  );
});
```

In `mobile/src/domain/rules.test.ts`:
- Add `type Plan,` to the import from `./plans.ts`.
- Replace `const plan = {` with `const plan: Plan = {` and add these lines inside it after `activity_id: "coffee-together",`:
```ts
  title: "Coffee together",
  description: "",
  categories: ["community", "uplifting"],
```
- In `change.details`, add before `starts_at`:
```ts
    title: "Coffee together",
    description: "",
    categories: ["community", "uplifting"],
```
- `PlanGateway` gains `cancel`. In each of the three `PlanGateway` object literals in this file, add `cancel: async () => {},` after the `update` entry. The third one is the inline object passed to `writePlan` in the "unknown save failures" test.

In `mobile/src/domain/rsvp.test.ts`, inside `snapshot.plan`, add after `activity_id: "walk",`:
```ts
    title: "Walk and talk",
    description: "",
    categories: ["physical", "community"],
```

In `mobile/src/services/draftStore.test.ts`:
- Change the plans import to `import { reconcilePlan, PlanSaveError, type Plan, type PlanWrite } from "../domain/plans";`.
- Replace `const write = {` with `const write: PlanWrite = {`, and inside its `details` add before `starts_at`:
```ts
    title: "Coffee together",
    description: "",
    categories: ["community", "uplifting"],
```
- Replace `const plan = {` with `const plan: Plan = {`.
- Every gateway object passed to `reconcilePlan` in this file needs a `cancel` entry: add `cancel: unexpected,` where the object uses `unexpected`, `cancel: mutate,` where it uses `mutate`, and `cancel: async () => { throw Error("wrong operation"); },` in the "absent create" test.
- Append:
```ts
test("an unconfirmed save from scratch survives restart with its event fields", async () => {
  const { storage } = memory();
  const pending: PlanWrite = {
    id: "request-1",
    activityId: null,
    details: {
      title: "Garden picnic",
      description: "Bring a blanket",
      categories: ["natural", "community"],
      starts_at: "2099-01-01T12:00:00.000Z",
      time_zone: "UTC",
      place_label: "Park",
      note: "",
    },
  };
  await createDraftStore(storage).put({ ...fixture(), key: "new", activityId: null, pending });
  const [restored] = await createDraftStore(storage).list("account-a");
  assert.deepEqual(restored.pending, pending);
});
```

`mobile/package.json`: append ` && node --import tsx src/domain/plans.test.ts` to the `test` script.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd mobile && node --import tsx src/domain/plans.test.ts`
Expected: FAIL (`cancelPlan` is not exported; `Plan` type missing).

- [ ] **Step 3: Implement the domain module**

Replace `mobile/src/domain/plans.ts` entirely:
```ts
import type { CategoryKey } from "./categories";
import type { EventFields } from "./events";

/** A resbite as stored on the server (CE1: it carries its own event text). */
export type Plan = {
  id: string;
  activity_id: string | null;
  title: string;
  description: string;
  categories: CategoryKey[];
  starts_at: string;
  place_label: string;
  note: string;
  status: string;
  version: number;
  owner_id?: string;
  time_zone?: string;
};

export type PlanDetails = EventFields &
  Pick<Plan, "starts_at" | "place_label" | "note"> & { time_zone: string };

export function canEditPlan(
  plan: Plan,
  userId?: string,
  preview = false,
  now = Date.now(),
) {
  return (
    plan.status === "active" &&
    Date.parse(plan.starts_at) > now &&
    (preview || Boolean(userId && plan.owner_id === userId))
  );
}

export function localDateTime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// Reject invalid/partial input and calendar rollovers instead of silently moving a plan.
export function parseLocalDateTime(text: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(text)) return null;
  const date = new Date(text.replace(" ", "T"));
  return Number.isFinite(date.getTime()) && localDateTime(date) === text
    ? date
    : null;
}

const sameCategories = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((key, i) => key === b[i]);

export function samePlanDetails(plan: Plan, details: PlanDetails): boolean {
  return (
    plan.title === details.title.trim() &&
    plan.description === details.description &&
    sameCategories(plan.categories, details.categories) &&
    Date.parse(plan.starts_at) === Date.parse(details.starts_at) &&
    plan.time_zone === details.time_zone &&
    plan.place_label.trim() === details.place_label.trim() &&
    plan.note === details.note
  );
}

export type PlanWrite = {
  id: string;
  /** The idea this event started from, or null when it was started from scratch. */
  activityId: string | null;
  details: PlanDetails;
  version?: number;
};

export type PlanGateway = {
  read: (id: string) => Promise<Plan | null>;
  create: (write: PlanWrite) => Promise<void>;
  update: (write: PlanWrite) => Promise<void>;
  cancel: (plan: { id: string; version: number }) => Promise<void>;
};

export class PlanSaveError extends Error {
  constructor(
    message: string,
    public uncertain = false,
    public latest?: Plan | null,
  ) {
    super(message);
  }
}

const errorCode = (error: unknown) =>
  typeof error === "object" && error !== null && "code" in error
    ? String(error.code)
    : "";

// A conflict never silently overwrites somebody else's newer plan. A lost reply
// can be acknowledged only when a read confirms precisely the attempted edit.
export async function writePlan(
  gateway: PlanGateway,
  write: PlanWrite,
): Promise<void> {
  try {
    if (write.version === undefined) await gateway.create(write);
    else await gateway.update(write);
  } catch (error) {
    const code = errorCode(error);
    if (code === "40001") {
      let latest: Plan | null;
      try {
        latest = await gateway.read(write.id);
      } catch {
        throw new PlanSaveError(
          "We couldn’t check the latest plan. Your draft is here. Retry when you’re connected.",
          true,
        );
      }
      if (
        latest?.status === "active" &&
        latest.version === (write.version ?? 0) + 1 &&
        samePlanDetails(latest, write.details)
      )
        return;
      throw new PlanSaveError(
        "This plan changed since you opened it. Your draft is still here. Review the saved details before trying again.",
        false,
        latest,
      );
    }
    if (code === "42501" || code === "PGRST301") {
      throw new PlanSaveError(
        "Your account can’t save this plan. Private tester access may still be closed. Your draft is unchanged.",
      );
    }
    if (code === "22023") {
      throw new PlanSaveError(
        "This plan or idea is no longer available for these changes. Your draft is unchanged; check My resbites before trying again.",
      );
    }
    if (/^(22|23)/.test(code)) {
      throw new PlanSaveError(
        "Check the name, categories, date, meeting place and note, then try again. Your draft is unchanged.",
      );
    }
    throw new PlanSaveError(
      "We couldn’t confirm the save. Your draft is kept here. Retry the same save when you’re connected; don’t create another plan yet.",
      true,
    );
  }
}

// Recovery is read-before-retry, never a blind new create after a lost reply.
export async function reconcilePlan(
  gateway: PlanGateway,
  write: PlanWrite,
): Promise<void> {
  let current: Plan | null;
  try {
    current = await gateway.read(write.id);
  } catch {
    throw new PlanSaveError(
      "We couldn’t check the saved plan. Your draft and original save are kept. Try again when connected.",
      true,
    );
  }
  if (
    current &&
    current.activity_id === write.activityId &&
    current.status === "active" &&
    current.version === (write.version ?? 0) + 1 &&
    samePlanDetails(current, write.details)
  )
    return;
  if (
    (!current && write.version === undefined) ||
    (current?.status === "active" && current.version === write.version)
  ) {
    await writePlan(gateway, write);
    return;
  }
  throw new PlanSaveError(
    "The saved plan has changed. Review its current details before making another change.",
    false,
    current,
  );
}

// Cancelling is terminal. Any failure is followed by a read: an already cancelled
// plan is success, so a lost or repeated reply never shows a false error.
export async function cancelPlan(
  gateway: PlanGateway,
  plan: { id: string; version: number },
): Promise<void> {
  let failure: unknown;
  try {
    await gateway.cancel(plan);
    return;
  } catch (error) {
    failure = error;
  }
  let latest: Plan | null;
  try {
    latest = await gateway.read(plan.id);
  } catch {
    throw new PlanSaveError(
      "We couldn’t confirm the cancellation. Check your connection and refresh before trying again.",
      true,
    );
  }
  if (latest?.status === "cancelled") return;
  const code = errorCode(failure);
  if (code === "42501" || code === "PGRST301")
    throw new PlanSaveError("Your account can’t cancel this plan.", false, latest);
  if (code === "40001")
    throw new PlanSaveError(
      "This plan changed since it loaded. Refresh and review it before cancelling.",
      false,
      latest,
    );
  if (code === "22023")
    throw new PlanSaveError(
      "This plan has already started or is no longer available.",
      false,
      latest,
    );
  throw new PlanSaveError(
    "We couldn’t confirm the cancellation. Check your connection and try again.",
    true,
    latest,
  );
}
```

`mobile/src/state/AppState.tsx`: replace the `export type LocalPlan = { … };` block (lines 16–26) with:
```ts
import type { Plan } from "../domain/plans";
/** Kept as an alias for existing screens; the type lives in the domain layer. */
export type LocalPlan = Plan;
```
If the file's import ordering requires it, move the new `import type` line up to the other imports.

`mobile/src/domain/rsvp.ts` line 1 → `import type { Plan as LocalPlan } from "./plans";`
`mobile/src/services/draftStore.ts` line 2 → `import type { Plan as LocalPlan } from "../domain/plans";`

`mobile/src/services/plans.ts`, replace from line 17 (`export const planGateway`) to the end:
```ts
const planColumns =
  "id,activity_id,title,description,categories,starts_at,time_zone,place_label,note,status,version,owner_id";

export const planGateway: PlanGateway = {
  async read(id) {
    const { data, error } = await withDeadline((signal) =>
      supabase
        .from("plans")
        .select(planColumns)
        .eq("id", id)
        .abortSignal(signal)
        .maybeSingle(),
    );
    if (error) throw error;
    return data as Plan | null;
  },
  async create({ id, activityId, details }) {
    const { error } = await withDeadline((signal) =>
      supabase
        .rpc("create_plan_v2", {
          p_id: id,
          p_title: details.title,
          p_description: details.description,
          p_categories: details.categories,
          p_activity: activityId,
          p_start: details.starts_at,
          p_zone: details.time_zone,
          p_place: details.place_label,
          p_note: details.note,
        })
        .abortSignal(signal),
    );
    if (error) throw error;
  },
  async update({ id, version, details }) {
    const { error } = await withDeadline((signal) =>
      supabase
        .rpc("change_plan_v2", {
          p_plan: id,
          p_version: version,
          p_title: details.title,
          p_description: details.description,
          p_categories: details.categories,
          p_start: details.starts_at,
          p_zone: details.time_zone,
          p_place: details.place_label,
          p_note: details.note,
          p_cancel: false,
        })
        .abortSignal(signal),
    );
    if (error) throw error;
  },
  async cancel({ id, version }) {
    const { error } = await withDeadline((signal) =>
      supabase
        .rpc("change_plan_v2", {
          p_plan: id,
          p_version: version,
          p_title: null,
          p_description: null,
          p_categories: null,
          p_start: null,
          p_zone: null,
          p_place: null,
          p_note: null,
          p_cancel: true,
        })
        .abortSignal(signal),
    );
    if (error) throw error;
  },
};
```
and change line 2 to `import type { Plan } from "../domain/plans";`. Keep `PlanGateway` in the type import from `../domain/plans`.

- [ ] **Step 4: Bridge the editor and fix cancel in My resbites**

`mobile/app/arrange.tsx` (temporary bridge; Task 7 replaces it with editable fields):
- Add `import { completeEventFields, fieldsFromActivity } from "../src/domain/events";`.
- In the draft-restore branch, replace `setPending(stored.pending);` with:
```ts
          // Saves recorded before custom events lack event fields; fill them from the idea.
          const legacy = stored.activityId
            ? activities.find((x) => x.id === stored.activityId)
            : undefined;
          const fallback = legacy ? fieldsFromActivity(legacy) : null;
          setPending(
            stored.pending && {
              ...stored.pending,
              details: {
                ...stored.pending.details,
                ...completeEventFields(stored.pending.details, fallback),
              },
            },
          );
```
- In `save()`, replace the `write = { … };` assignment with:
```ts
      const fields = original
        ? {
            title: original.title,
            description: original.description,
            categories: original.categories,
          }
        : fieldsFromActivity(a);
      write = {
        id: original?.id ?? requestId.current,
        activityId: original ? original.activity_id : a.id,
        version: original?.version,
        details: {
          ...fields,
          starts_at: date!.toISOString(),
          time_zone: zone,
          place_label: place.trim(),
          note,
        },
      };
```
- In the preview create branch, replace `activity_id: a.id,` with `activity_id: write.activityId,`.
- Wherever TypeScript now reports `original?.activity_id ?? activity` as `string | null | undefined` (the `draftSnapshot` condition and its `activityId:`), use `(original ? original.activity_id : activity) ?? null` for `activityId`, and keep the condition `scope && (original ? original.activity_id : activity) && initial !== null`.

`mobile/app/(tabs)/plans.tsx`:
- Add imports: `import { planGateway } from "../../src/services/plans";` and extend the domain import to `import { canEditPlan, cancelPlan, PlanSaveError } from "../../src/domain/plans";`.
- Replace the `else { const { error } = await supabase.rpc("change_plan", …); if (error) throw error; await refresh(); }` branch in `cancel()` with:
```ts
      else {
        await cancelPlan(planGateway, { id: p.id, version: p.version });
        await refresh();
      }
```
- Replace the `catch (e) { setError(…) }` in `cancel()` with:
```ts
    } catch (e) {
      setError(
        e instanceof PlanSaveError
          ? e.message
          : "Could not cancel. Refresh and try again.",
      );
      if (e instanceof PlanSaveError && !e.uncertain) void refresh();
    }
```
- In the plan card, replace `{a?.title || "Your plan"}` with `{p.title}`, and replace `source={artwork[p.activity_id]}` with `source={artwork[p.activity_id ?? ""]}` (Task 9 replaces this image).

- [ ] **Step 5: Update browser QA fixtures for v2 and plan text**

`mobile/scripts/verify-planning.mjs`:
- In `let savedPlan = {…}`, add after `activity_id: "coffee-together",`:
```js
      title: "Coffee evening",
      description: "",
      categories: ["community", "uplifting"],
```
- Replace `if (url.pathname === "/rest/v1/rpc/change_plan") {` with `if (url.pathname === "/rest/v1/rpc/change_plan_v2") {`.
- In both places that rebuild `savedPlan` from `write` (the `lost_reply` branch and the success branch), add:
```js
              title: write.p_title,
              description: write.p_description,
              categories: write.p_categories,
```
- Directly after the existing `fixture.getByText("Original café", { exact: true })` expectation, add:
```js
      await expect(fixture.getByText("Coffee evening", { exact: true })).toBeVisible();
```

In `mobile/scripts/verify-rsvp.mjs` (the `plan` object at lines 36–46), `mobile/scripts/verify-invitations.mjs` (object containing line 38) and `mobile/scripts/verify-account.mjs` (object containing line 118), add after `activity_id: "coffee-together",`:
```js
  title: "Coffee evening",
  description: "Bring a book",
  categories: ["community", "uplifting"],
```

- [ ] **Step 6: Run checks to verify they pass**

Run: `cd mobile && npm run check`
Expected: PASS, typecheck clean, 137 tests (132 + 4 in `plans.test.ts` + 1 in `draftStore.test.ts`).

Browser QA: `node scripts/verify-planning.mjs && node scripts/verify-rsvp.mjs && node scripts/verify-invitations.mjs && node scripts/verify-account.mjs`
Expected: every script prints its PASS lines with no page errors.

- [ ] **Step 7: Commit**

```bash
git add mobile/src mobile/app mobile/scripts mobile/package.json
git commit -m "Save plans through v2 functions and cancel safely

Plan type moves to the domain layer and carries event text. Cancel
goes through the gateway with read-back confirmation instead of a raw
RPC; plan cards show the plan's own title.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Editor for custom events

**Files:**
- Create: `mobile/src/design/EventDetailsFields.tsx`
- Modify: `mobile/src/design/categories.tsx` (add `CategoryChoices`, `EventPictureView`), `mobile/app/arrange.tsx`, `mobile/app/(tabs)/plans.tsx` (New resbite button)
- QA: `mobile/scripts/verify-planning.mjs`

**Interfaces:**
- Consumes: Task 5 `EventFields`, `validateEventFields`, `fieldsFromActivity`, `completeEventFields`, `eventPicture`, `EventPicture`, `TITLE_MAX`, `DESCRIPTION_MAX`; Task 1 `toggleCategory`, `categoryKeys`, `categoryLabels`; Task 4 `categoryPalette`, `categoryIcons`.
- Produces: `CategoryChoices({ value, onChange, disabled })`, `EventPictureView({ picture, size })`, `EventDetailsFields({ value, onChange, disabled, sourceTitle })`. Editor routes: `/arrange` (blank), `/arrange?activity=<id>` (idea), `/arrange?plan=<id>` (edit).

- [ ] **Step 1: Write the failing browser check**

In `mobile/scripts/verify-planning.mjs`, insert directly before the line `const user = {`:
```js
  // Blank custom event (CE1): a name and one or two categories are required.
  const blank = await newPage();
  await blank.route("**/*.supabase.co/**", (route) => route.abort());
  await blank.goto(baseURL);
  await blank.getByText("Preview the design", { exact: true }).click();
  await blank.getByRole("tab", { name: "My resbites", exact: true }).click();
  await blank.getByRole("button", { name: "New resbite", exact: true }).click();
  await blank.getByRole("button", { name: "Save preview plan", exact: true }).click();
  await expect(blank.getByText("Give your resbite a name.", { exact: true })).toBeVisible();
  await blank.getByLabel("Name", { exact: true }).fill("Garden picnic");
  await blank.getByRole("button", { name: "Save preview plan", exact: true }).click();
  await expect(blank.getByText("Choose one or two categories.", { exact: true })).toBeVisible();
  await blank.getByRole("checkbox", { name: "Natural", exact: true }).click();
  await blank.getByRole("checkbox", { name: "Community", exact: true }).click();
  await expect(blank.getByRole("checkbox", { name: "Creative", exact: true })).toBeDisabled();
  await blank.getByLabel("Meeting place", { exact: true }).fill("Riverside park");
  await blank.getByRole("button", { name: "Save preview plan", exact: true }).click();
  await expect(blank.getByText("Garden picnic", { exact: true })).toBeVisible();
  await blank.context().close();
  console.log("PASS: preview blank custom event needs a name and one or two categories.");
```

- [ ] **Step 2: Run it to verify it fails**

Run (Expo web running): `cd mobile && node scripts/verify-planning.mjs`
Expected: FAIL waiting for the button named "New resbite".

- [ ] **Step 3: Add the shared visuals**

Append to `mobile/src/design/categories.tsx` (and extend its imports: `Image, View` from `react-native`; `categoryKeys, toggleCategory` from `../domain/categories`; `categoryPalette` from `./tokens`; `artwork` from `../services/catalogue`; `type EventPicture` from `../domain/events`):
```tsx
/** Multi-select category chips for the editor: one or two, a third is refused. */
export function CategoryChoices({
  value,
  onChange,
  disabled,
}: {
  value: CategoryKey[];
  onChange: (next: CategoryKey[]) => void;
  disabled?: boolean;
}) {
  return (
    <View style={styles.choices}>
      {categoryKeys.map((key) => {
        const selected = value.includes(key);
        const full = !selected && value.length >= 2;
        const Icon = categoryIcons[key];
        const { tint, ink } = categoryPalette[key];
        return (
          <Pressable
            key={key}
            accessibilityRole="checkbox"
            accessibilityLabel={categoryLabels[key]}
            accessibilityState={{ checked: selected, disabled: disabled || full }}
            accessibilityHint={full ? "Two categories are already chosen" : undefined}
            disabled={disabled || full}
            onPress={() => onChange(toggleCategory(value, key))}
            style={[
              styles.choice,
              {
                backgroundColor: selected ? tint : c.paper,
                borderColor: selected ? ink : c.line,
                opacity: full ? 0.5 : 1,
              },
            ]}
          >
            <Icon size={16} strokeWidth={1.8} color={selected ? ink : c.muted} />
            <Copy style={{ fontSize: 13, color: selected ? ink : c.ink }}>
              {categoryLabels[key]}
            </Copy>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Idea artwork when available, otherwise the primary category's tile. */
export function EventPictureView({
  picture,
  size = 66,
}: {
  picture: EventPicture;
  size?: number;
}) {
  if (picture.kind === "artwork")
    return (
      <Image
        source={artwork[picture.key]}
        style={{ width: size, height: size }}
        resizeMode="contain"
        accessibilityIgnoresInvertColors
      />
    );
  const Icon = categoryIcons[picture.category];
  const { tint, ink } = categoryPalette[picture.category];
  return (
    <View
      accessible={false}
      style={{
        width: size,
        height: size,
        borderRadius: size / 4,
        backgroundColor: tint,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Icon size={Math.round(size * 0.45)} strokeWidth={1.6} color={ink} />
    </View>
  );
}
```
and add to its `StyleSheet.create({…})`:
```ts
  choices: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  choice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: 1,
  },
```

`mobile/src/design/EventDetailsFields.tsx`:
```tsx
import React from "react";
import { StyleSheet, View } from "react-native";
import { Sparkles } from "lucide-react-native";
import { Copy, Field, Title } from "./ui";
import { CategoryChoices } from "./categories";
import { colors as c, fonts } from "./tokens";
import { DESCRIPTION_MAX, TITLE_MAX, type EventFields } from "../domain/events";

/** "What are we doing?" — name, description and one or two categories. */
export function EventDetailsFields({
  value,
  onChange,
  disabled,
  sourceTitle,
}: {
  value: EventFields;
  onChange: (next: EventFields) => void;
  disabled?: boolean;
  sourceTitle?: string;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.heading}>
        <Sparkles size={19} color={c.aquaDark} />
        <Title style={styles.title}>What are we doing?</Title>
      </View>
      {sourceTitle ? (
        <Copy style={styles.tag}>From the idea: {sourceTitle}</Copy>
      ) : null}
      <Field
        label="Name"
        placeholder="Dinner at Mario’s, a birthday walk…"
        value={value.title}
        onChangeText={(title) => onChange({ ...value, title })}
        maxLength={TITLE_MAX}
        editable={!disabled}
        returnKeyType="next"
      />
      <Field
        label="Description (optional)"
        placeholder="What you’ll do together"
        value={value.description}
        onChangeText={(description) => onChange({ ...value, description })}
        multiline
        textAlignVertical="top"
        style={{ minHeight: 90 }}
        maxLength={DESCRIPTION_MAX}
        editable={!disabled}
      />
      <View style={{ gap: 8 }}>
        <Copy style={{ fontFamily: fonts.medium, fontSize: 13 }}>Categories</Copy>
        <CategoryChoices
          value={value.categories}
          onChange={(categories) => onChange({ ...value, categories })}
          disabled={disabled}
        />
        <Copy style={styles.hint}>Choose one or two.</Copy>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: 14,
    padding: 18,
    borderWidth: 1,
    borderColor: c.line,
    borderRadius: 24,
    backgroundColor: c.paper,
  },
  heading: { flexDirection: "row", gap: 10, alignItems: "center" },
  title: { fontSize: 23, lineHeight: 30, flexShrink: 1 },
  tag: {
    alignSelf: "flex-start",
    fontSize: 12,
    color: c.aquaDark,
    backgroundColor: c.aquaSoft,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    overflow: "hidden",
  },
  hint: { fontSize: 12, color: c.muted },
});
```

- [ ] **Step 4: Rework the editor**

`mobile/app/arrange.tsx`:

1. Imports: remove `Image` from the react-native import and `activityArtwork` from the catalogue import (keep `activities`). Add:
```ts
import { EventDetailsFields } from "../src/design/EventDetailsFields";
import { EventPictureView } from "../src/design/categories";
```
and extend the events import to `completeEventFields, eventPicture, fieldsFromActivity, validateEventFields, type EventFields`.

2. After `const [note, setNote] = useState("");` add:
```ts
  const [fields, setFields] = useState<EventFields>({
    title: "",
    description: "",
    categories: [],
  });
  const needsPrefill = useRef(false);
```

3. Replace `const draftKey = planId ? \`edit-${planId}\` : \`new-${activity}\`;` with:
```ts
  const draftKey = planId
    ? `edit-${planId}`
    : activity
      ? `new-${activity}`
      : "new";
```

4. Replace everything from `const catalogue = useCatalogue(activity ?? "", !planId);` through `const locked = busy || pending !== null;` with:
```ts
  const mode: "edit" | "idea" | "blank" = planId
    ? "edit"
    : activity
      ? "idea"
      : "blank";
  const catalogue = useCatalogue(activity ?? "", mode === "idea");
  const sourceId = original ? original.activity_id : (activity ?? null);
  const historicalActivity = sourceId
    ? activities.find((x) => x.id === sourceId)
    : undefined;
  // A new event from an idea needs its current publication; edits and unconfirmed saves do not.
  const idea =
    mode === "idea" && !preview && !pending
      ? catalogue.items[0]
      : (catalogue.items[0] ?? historicalActivity);
  const snapshotOf = (f: EventFields, s: string, p: string, n: string) =>
    JSON.stringify([f.title, f.description, f.categories, s, p, n]);
  const dirty =
    initial !== null && initial !== snapshotOf(fields, start, place, note);
  const locked = busy || pending !== null;
```

5. Replace the body of `applyPlan` with:
```ts
    const text = localDateTime(new Date(plan.starts_at));
    const planFields = {
      title: plan.title,
      description: plan.description,
      categories: plan.categories,
    };
    setOriginal(plan);
    setFields(planFields);
    setStart(text);
    setPlace(plan.place_label);
    setNote(plan.note);
    setInitial(snapshotOf(planFields, text, plan.place_label, plan.note));
    setLatest(undefined);
    setError(null);
    setPending(null);
```

6. In the load effect's `if (stored)` branch, replace the Task 6 bridge (from `// Saves recorded before custom events…` through the `setPending(…)` call) with:
```ts
          // Drafts and saves recorded before custom events lack event fields; fill them from the idea.
          const legacy = stored.activityId
            ? activities.find((x) => x.id === stored.activityId)
            : undefined;
          const fallback = legacy ? fieldsFromActivity(legacy) : null;
          setFields(completeEventFields(stored, fallback));
          setPending(
            stored.pending && {
              ...stored.pending,
              details: {
                ...stored.pending.details,
                ...completeEventFields(stored.pending.details, fallback),
              },
            },
          );
```
and replace the final `} else { setInitial(JSON.stringify([start, place, note])); }` with:
```ts
        } else if (mode === "blank") {
          setInitial(snapshotOf(fields, start, place, note));
        } else {
          // An idea prefills once it is available (effect below).
          needsPrefill.current = true;
        }
```

7. After the load effect, add:
```ts
  useEffect(() => {
    if (!needsPrefill.current || !draftReady || !idea) return;
    needsPrefill.current = false;
    const prefilled = fieldsFromActivity(idea);
    setFields(prefilled);
    setInitial(snapshotOf(prefilled, start, place, note));
  }, [draftReady, idea]);
```

8. Replace the `draftSnapshot.current = …` assignment with:
```ts
  draftSnapshot.current =
    scope && initial !== null
      ? {
          schema: 1,
          scope,
          key: draftKey,
          activityId: sourceId,
          planId,
          requestId: requestId.current,
          original,
          initial,
          title: fields.title,
          description: fields.description,
          categories: fields.categories,
          start,
          place,
          note,
          zone,
          startInstant: parseLocalDateTime(start)?.toISOString(),
          pending,
          updatedAt: new Date().toISOString(),
        }
      : null;
```

9. In the autosave effect, replace `if (!a || !draftReady || saved || busy || stopped.current) return;` with `if (initial === null || !draftReady || saved || busy || stopped.current) return;`. In its dependency array, replace `Boolean(a),` with `initial,` and add `fields,`.

10. In `save()`:
- Replace `if (saving.current || !a || locating) return;` with `if (saving.current || locating) return;`.
- Replace the following `if (!preview && !planId && !pending && (catalogue.loading || catalogue.error || !catalogue.items.length)) return;` with:
```ts
    if (
      !preview &&
      mode === "idea" &&
      !pending &&
      (catalogue.loading || catalogue.error || !idea)
    )
      return;
```
- Inside `if (!write) {`, before `const date = parseLocalDateTime(start);`, add:
```ts
      const invalidEvent = validateEventFields(fields);
      if (invalidEvent) {
        setError(invalidEvent);
        return;
      }
```
- Replace the Task 6 bridge (`const fields = original ? … : fieldsFromActivity(a);` and the `write = {…}`) with:
```ts
      write = {
        id: original?.id ?? requestId.current,
        activityId: sourceId,
        version: original?.version,
        details: {
          title: fields.title.trim(),
          description: fields.description,
          categories: fields.categories,
          starts_at: date!.toISOString(),
          time_zone: zone,
          place_label: place.trim(),
          note,
        },
      };
```

11. Replace the first early-return condition `if (!preview && !planId && !pending && (catalogue.loading || catalogue.error || !a))` with `if (mode === "idea" && !preview && !pending && (catalogue.loading || catalogue.error || !idea))`.

12. Replace the second early-return condition `if (loading || !draftReady || !a || (planId && !original))` with `if (loading || !draftReady || initial === null || (planId && !original))`, and in it replace `error ?? "Choose an activity first."` with `error ?? "We couldn’t open this plan. Try again."`.

13. Replace the header (`<Back label={planId ? "My resbites" : "Activity"} />` and the following `<View style={styles.activity}>…</View>`) with:
```tsx
          <Back
            label={planId ? "My resbites" : mode === "idea" ? "Idea" : "Back"}
          />
          <View style={styles.activity}>
            <EventPictureView
              picture={eventPicture({
                activity_id: sourceId,
                categories: fields.categories,
              })}
              size={66}
            />
            <View style={{ flex: 1, gap: 3 }}>
              <Copy style={s.muted}>
                {planId ? "YOUR PLAN" : "LET’S GET TOGETHER"}
              </Copy>
              <Title style={{ fontSize: 22, lineHeight: 28 }}>
                {fields.title.trim() || "Your resbite"}
              </Title>
            </View>
          </View>
```

14. Directly before the "When works?" section (`<View style={styles.section}>` containing `CalendarDays`), insert:
```tsx
          <EventDetailsFields
            value={fields}
            onChange={setFields}
            disabled={locked}
            sourceTitle={
              sourceId ? (idea?.title ?? historicalActivity?.title) : undefined
            }
          />
```

15. In the "Latest saved plan" panel, add `<Copy>{latest.title}</Copy>` as the first child inside `{latest ? (<>`.

16. Run `npx tsc --noEmit` and remove any remaining reference to the old `a` variable. Every former use is replaced above.

`mobile/app/(tabs)/plans.tsx`: directly after `<Copy style={s.muted}>Your plans, all in one place.</Copy>`, add:
```tsx
        <Button title="New resbite" onPress={() => router.push("/arrange")} />
```

- [ ] **Step 5: Run checks to verify they pass**

Run: `cd mobile && npm run check`
Expected: PASS.

Browser QA: `node scripts/verify-planning.mjs`
Expected: the new `PASS: preview blank custom event…` line, plus all existing PASS lines (idea flow, drafts, conflicts, lost replies).

- [ ] **Step 6: Commit**

```bash
git add mobile/src/design mobile/app mobile/scripts/verify-planning.mjs
git commit -m "Create and edit custom events in the plan editor

Blank, from-idea and edit modes; name, description and one or two
categories; ideas prefill an editable template; drafts keep event fields.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Create tab

**Files:**
- Rename: `mobile/app/(tabs)/discover.tsx` → `mobile/app/(tabs)/create.tsx` (`git mv`)
- Modify: `mobile/app/(tabs)/create.tsx`, `mobile/app/(tabs)/_layout.tsx`, `mobile/app/(tabs)/_layout.web.tsx`, `mobile/app/index.tsx:109`, `mobile/app/account.tsx:31,63`, `mobile/app/(tabs)/profile.tsx:487-489`, `mobile/app/(tabs)/plans.tsx:292`, `mobile/app/activity/[id].tsx`
- QA: `mobile/scripts/verify-auth.mjs:175`, `verify-people.mjs:53-58`, `verify-planning.mjs:25-28,356`, `verify-catalogue.mjs`, `review-ui.mjs:17`

**Interfaces:**
- Consumes: Task 7 editor routes (`/arrange` blank).
- Produces: route `/create` (tab "Create"); no `/discover` route.

- [ ] **Step 1: Update browser checks first (they fail until the tab exists)**

Apply these exact replacements:
- `mobile/scripts/verify-auth.mjs:175`: `/\/discover$/` → `/\/create$/`
- `mobile/scripts/verify-people.mjs`: `{ name: "Discover", exact: true }` → `{ name: "Create", exact: true }`; `"Explore coffee together"` → `"Coffee together"`; `"Let’s make a plan"` → `"Use this idea"`
- `mobile/scripts/verify-planning.mjs`: `"Explore coffee together"` → `"Coffee together"`; `"Let’s make a plan"` → `"Use this idea"`; `{ name: "Discover", exact: true }` → `{ name: "Create", exact: true }`
- `mobile/scripts/verify-catalogue.mjs`: `` `${baseURL}/discover` `` → `` `${baseURL}/create` `` (both occurrences); every `"Let’s make a plan"` → `"Use this idea"`; `"Explore coffee together"` → `"Coffee together"`
- `mobile/scripts/review-ui.mjs:17`: `discover-${width}.png` → `create-${width}.png`

Then run `grep -n "Find your next resbite\|Better together\|A catch-up\|Explore activities\|/discover" mobile/scripts/*.mjs` and update any remaining hit to the new copy below ("Or start from an idea", "Browse ideas", `/create`).

Add to `verify-catalogue.mjs`, right after the first successful `goto` of `/create` in the 390-width loop:
```js
    await expect(
      f.page.getByRole("button", { name: "Start your own resbite", exact: true }),
    ).toBeVisible();
```

Run (Expo web running): `node scripts/verify-auth.mjs`
Expected: FAIL (URL is still `/discover`).

- [ ] **Step 2: Rename and rebuild the tab screen**

Run: `git mv "mobile/app/(tabs)/discover.tsx" "mobile/app/(tabs)/create.tsx"`

In `create.tsx`:
- Rename `export default function Discover()` → `export default function Create()`.
- Lucide import: add `Plus`; remove `Sun` if still present.
- Delete the `featured` constant and the whole `{!query && category === "all" && featured && ( <Pressable …style={styles.feature}>…</Pressable> )}` block, and delete `feature` and `smallArrow` from `styles`.
- Replace the heading `<View style={{ gap: 8 }}><Title>Make room for{"\n"}a good time.</Title>…</View>` and the search `<View style={styles.search}>…</View>` (still inside the top `padding: 24` view) with:
```tsx
          <View style={{ gap: 8 }}>
            <Title>What shall we{"\n"}do together?</Title>
            <Copy style={{ color: c.muted }}>
              Plan anything with your people, or borrow an idea.
            </Copy>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Start your own resbite"
            accessibilityHint="Opens a new plan you name yourself"
            onPress={() => router.push("/arrange")}
            style={[
              styles.start,
              largeText && { flexDirection: "column", alignItems: "flex-start" },
            ]}
          >
            <View style={styles.startIcon}>
              <Plus size={24} strokeWidth={2} color="#963F58" />
            </View>
            <View style={{ flex: largeText ? undefined : 1, gap: 4 }}>
              <Title style={{ fontSize: 23, lineHeight: 28 }}>
                Start your own resbite
              </Title>
              <Copy style={{ color: c.ink }}>
                Dinner, a walk, a birthday — anything you’d enjoy together.
              </Copy>
            </View>
          </Pressable>
          <View style={{ gap: 4 }}>
            <Title style={{ fontSize: 23 }}>Or start from an idea</Title>
            <Copy style={{ fontSize: 11, color: c.muted }}>
              {catalogue.loading
                ? "Loading…"
                : catalogue.error
                  ? ""
                  : `${results.length} ideas`}
            </Copy>
          </View>
          <View style={styles.search}>
            <Search size={20} color={c.muted} />
            <TextInput
              accessibilityLabel="Search ideas"
              value={query}
              onChangeText={setQuery}
              placeholder="Search ideas"
              placeholderTextColor={c.muted}
              style={{
                flex: 1,
                fontFamily: fonts.body,
                fontSize: 14,
                color: c.ink,
                paddingVertical: 15,
              }}
            />
          </View>
```
- In the lower `paddingHorizontal: 24` view, delete the header row containing `Find your next resbite` and its count (now above), and change that view's `paddingTop: 23` to `paddingTop: 4`.
- Empty catalogue copy: replace `No activities are available yet. Check again soon.` with `No ideas are available yet. You can still start your own.`; replace `Check for activities` with `Check for ideas`; replace `Try activities again` with `Try ideas again`; replace `No activities match that search.` with `No ideas match that search.`
- Add to `styles`:
```ts
  start: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 18,
    borderRadius: 24,
    backgroundColor: c.pink,
    boxShadow: depth.button,
  },
  startIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: c.paper,
    alignItems: "center",
    justifyContent: "center",
  },
```

- [ ] **Step 3: Tabs and navigation references**

`mobile/app/(tabs)/_layout.tsx`: `initialRouteName: "discover"` → `"create"`; replace the discover trigger with:
```tsx
      <NativeTabs.Trigger name="create">
        <NativeTabs.Trigger.Label>Create</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: "plus.circle", selected: "plus.circle.fill" }}
          md="add_circle"
        />
      </NativeTabs.Trigger>
```

`mobile/app/(tabs)/_layout.web.tsx`: import `CirclePlus` instead of `Compass`; `initialRouteName="create"`; replace the discover screen with:
```tsx
      <Tabs.Screen name="create" options={{ title: "Create", tabBarIcon: ({ color }) => <CirclePlus size={22} strokeWidth={1.7} color={color} /> }} />
```

Replace `"/discover"` with `"/create"` in `mobile/app/index.tsx:109`, `mobile/app/account.tsx:31` and `:63`, and `mobile/app/(tabs)/plans.tsx:292`. In `mobile/app/(tabs)/profile.tsx`, change the `ActionRow` `title="Explore activities"` to `title="Browse ideas"` and its route to `"/create"`.

`mobile/app/activity/[id].tsx`: `<Back label="Discover" />` → `<Back label="Create" />`. In the unavailable state, `title="Explore activities"` → `title="Browse ideas"` and `router.replace("/discover")` → `router.replace("/create")`. Copy `Explore the catalogue for another idea.` → `Browse the other ideas, or start your own.` In `planAction`, `title="Let’s make a plan"` → `title="Use this idea"` and `Choose a time and place next` → `You can change anything next`.

Run: `grep -rn "discover" mobile/app mobile/src mobile/scripts`
Expected: no matches except comments or the `validate-content.mjs` "temporary-discovery-filters" strings.

- [ ] **Step 4: Run checks to verify they pass**

Run: `cd mobile && npm run check`
Expected: PASS.

Restart Expo web, so typed routes regenerate after the rename, then run:
`node scripts/verify-auth.mjs && node scripts/verify-catalogue.mjs && node scripts/verify-people.mjs && node scripts/verify-planning.mjs && node scripts/review-ui.mjs`
Expected: all PASS lines; review screenshots written as `create-320.png`/`create-390.png`.

- [ ] **Step 5: Commit**

```bash
git add -A mobile/app mobile/scripts
git commit -m "Turn Discover into the Create tab

Start your own resbite is the primary card; ideas follow as editable
templates with Use this idea.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: My resbites pictures, empty state and invitation text

**Files:**
- Modify: `mobile/app/(tabs)/plans.tsx`, `mobile/app/invite.tsx:318-326`
- QA: `mobile/scripts/verify-rsvp.mjs` (after line 170), `mobile/scripts/verify-planning.mjs`

**Interfaces:**
- Consumes: Task 7 `EventPictureView`; Task 5 `eventPicture`; Task 4 `categoryText`.
- Produces: no new interfaces.

- [ ] **Step 1: Write the failing browser checks**

In `mobile/scripts/verify-rsvp.mjs`, directly after the expectation for `"Your response: declined"`, add:
```js
  // The invitation shows the plan's own text, not the bundled idea title.
  await expect(page.getByText("Coffee evening", { exact: true })).toBeVisible();
  await expect(page.getByText("Bring a book", { exact: true })).toBeVisible();
```

In `mobile/scripts/verify-planning.mjs`, in the blank-event block from Task 7, before `await blank.context().close();`, add:
```js
  await expect(blank.getByText("Natural · Community", { exact: true })).toBeVisible();
```

Run: `node scripts/verify-rsvp.mjs`
Expected: FAIL: "Coffee evening" is not visible (the invite still shows the bundled "Coffee together").

- [ ] **Step 2: Implement**

`mobile/app/invite.tsx`: replace
```tsx
            <Title style={{ fontSize: 24 }}>
              {activities.find((a) => a.id === snapshot.plan.activity_id)
                ?.title ?? "Your resbite"}
            </Title>
```
with
```tsx
            <Title style={{ fontSize: 24 }}>{snapshot.plan.title}</Title>
            {!!snapshot.plan.description && (
              <Copy>{snapshot.plan.description}</Copy>
            )}
```
and delete the now-unused `import { activities } from "../src/services/catalogue";`.

`mobile/app/(tabs)/plans.tsx`:
- Add imports: `import { EventPictureView, categoryText } from "../../src/design/categories";` and `import { eventPicture } from "../../src/domain/events";`.
- In the plan card, replace the `<Image source={artwork[p.activity_id ?? ""]} … />` element with `<EventPictureView picture={eventPicture(p)} size={70} />`, and below the card `<Title>` add:
```tsx
                    <Copy style={{ ...s.muted, fontSize: 12 }}>
                      {categoryText(p.categories)}
                    </Copy>
```
- Delete the line `const a = activities.find((x) => x.id === p.activity_id),` and keep `owner` as its own `const`.
- Replace the empty-state block's copy and button (`<Copy>Pick something you’d enjoy doing together.</Copy>` and the following `<Button title="Explore activities" …/>`) with:
```tsx
            <Copy>Start your own resbite, or borrow an idea.</Copy>
            <Button
              title="Start your own resbite"
              onPress={() => router.push("/arrange")}
            />
            <Button
              title="Browse ideas"
              secondary
              onPress={() => router.navigate("/create")}
            />
```
- Remove `Image`/`artwork` imports only if TypeScript reports them unused. The empty-state illustration still uses `artwork["get-out-with-bikes"]`.

- [ ] **Step 3: Run checks to verify they pass**

Run: `cd mobile && npm run check`
Expected: PASS.

Browser QA: `node scripts/verify-rsvp.mjs && node scripts/verify-planning.mjs && node scripts/verify-invitations.mjs`
Expected: all PASS lines, no page errors.

- [ ] **Step 4: Commit**

```bash
git add mobile/app mobile/scripts
git commit -m "Show event pictures, categories and own text in plans and invites

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Full local verification

**Files:** none expected; fix only what the checks reveal, inside the task that owns the code.

- [ ] **Step 1: Mobile check**

Run: `cd mobile && npm run check`
Expected: PASS; record the test count.

- [ ] **Step 2: Backend unit tests**

Run (repository root): `node --experimental-transform-types --test supabase/functions/_shared/*.test.ts`
Expected: `# pass 51`, `# fail 0` (unchanged by CE1).

- [ ] **Step 3: SQL, both modes**

Run: `./scripts/test-database.sh && ./scripts/test-database.sh --hosted-baseline 20261007150000_custom_events.sql`
Expected: all PASS in both.

- [ ] **Step 4: Every browser QA script**

With Expo web running, from `mobile/`:
```bash
for s in verify-planning verify-catalogue verify-people verify-invitations verify-rsvp verify-auth verify-account verify-profile verify-session verify-notifications verify-registration verify-signup-callback verify-confirmation verify-deletion verify-emails review-ui; do
  echo "== $s"; node scripts/$s.mjs || { echo "FAILED: $s"; break; }
done
```
Expected: every script completes with its PASS lines; no `FAILED:`.

- [ ] **Step 5: iOS JavaScript export**

Run: `cd mobile && npx expo export --platform ios --output-dir dist-ios`
Expected: export completes (`dist-ios/` is gitignored). This checks the iOS bundle; it does not sign a build.

- [ ] **Step 6: Diff hygiene**

Run: `git diff --check main...HEAD && git status --short`
Expected: no whitespace errors; clean tree (commit any fixes made in Steps 1–5 with a message naming the fix).

---

### Task 11: Hosted rollout and iPhone acceptance (owner gate)

**Files:**
- Create: `qa/custom-events-2026-10-07/README.md`, `qa/custom-events-2026-10-07/hosted-before.json`, `qa/custom-events-2026-10-07/hosted-after.json`
- Modify: `supabase/tests/hosted-baseline/migrations.txt`

- [ ] **Step 1: Record the hosted before-state (read-only)**

With the Supabase MCP connected to `ewcsgvhuojxdpaspwsrx`, run `list_migrations` and this `execute_sql`:
```sql
select json_build_object(
 'captured_at', now(),
 'plans', (select count(*) from public.plans),
 'activities', (select json_agg(json_build_object('id',id,'published',published,'category',category) order by id) from public.activities),
 'roster_enabled', (select count(*) from private.tester_roster where enabled),
 'plan_columns', (select json_agg(column_name order by ordinal_position) from information_schema.columns where table_schema='public' and table_name='plans')
) as before;
```
Run `get_advisors` for `security` and `performance`. Save all four results to `qa/custom-events-2026-10-07/hosted-before.json`.
Expected: 5 migrations, 11 published activities, 1 enabled roster entry, no `title` column.

- [ ] **Step 2: STOP — ask the owner for explicit approval**

Ask: "CE1 passes all local checks. May I apply the single migration `20261007150000_custom_events` to the live Resbite database (`ewcsgvhuojxdpaspwsrx`)? It adds event fields and v2 plan functions, publishes the approved categories on the 11 ideas, and keeps the current app working." Do not continue without a clear yes. A yes here approves only this migration.

- [ ] **Step 3: Apply the migration**

Use MCP `apply_migration` with name `custom_events` and the exact contents of `supabase/migrations/20261007150000_custom_events.sql`. Do not use `db push`.

- [ ] **Step 4: Verify the hosted after-state**

Run `list_migrations`, then:
```sql
select json_build_object(
 'activities', (select json_agg(json_build_object('id',id,'categories',categories) order by id) from public.activities),
 'plan_columns', (select json_agg(column_name||':'||is_nullable order by ordinal_position) from information_schema.columns where table_schema='public' and table_name='plans'),
 'functions', (select json_agg(p.oid::regprocedure::text||' anon='||has_function_privilege('anon',p.oid,'EXECUTE')||' authenticated='||has_function_privilege('authenticated',p.oid,'EXECUTE') order by 1) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('create_plan_v2','change_plan_v2','create_plan','change_plan')),
 'triggers', (select json_agg(tgname order by tgname) from pg_trigger where tgrelid='public.plans'::regclass and not tgisinternal),
 'roster_enabled', (select count(*) from private.tester_roster where enabled),
 'plans', (select count(*) from public.plans)
) as after;
```
Run `get_advisors` for `security` and `performance` again. Save everything to `hosted-after.json`.
Expected:
- a sixth migration `custom_events`, with its hosted version noted
- every activity's `categories` equals `mobile/content/activity-categories.json`
- `plan_columns` includes `title:NO`, `description:NO`, `categories:NO`, `activity_id:YES`
- all four functions report `anon=false authenticated=true`
- triggers `plans_fill_from_activity`, `plans_redact_deleting_owner`
- `roster_enabled` 1; advisors show no new WARN or ERROR compared with before

- [ ] **Step 5: Record the hosted baseline and rollback**

Append to `supabase/tests/hosted-baseline/migrations.txt`: `20261007150000_custom_events.sql   <hosted version from Step 4>`. Run `./scripts/test-database.sh --hosted-baseline` (no candidates). Expected: all PASS.

Write `qa/custom-events-2026-10-07/README.md` with: the approval quote and time, the applied migration and hosted version, the before/after summary, the advisor comparison, the baseline-mode result, and this rollback. Rollback is valid only while no plan has a null `activity_id`; afterwards, disable through an app update instead:
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

- [ ] **Step 6: Deliver to the iPhone and run acceptance with the owner**

Start Metro for the installed development build: `cd mobile && npx expo start --lan --port 8081` (Mac and iPhone on the same network). Ask the owner to relaunch Resbite. No native rebuild is needed. Then ask them to run the spec's **CE1 acceptance** list:
1. The Create tab shows the start card, ideas and seven category filters; filtering and search work.
2. A blank event with a title, description, two categories, a time and a place saves and appears in My resbites with its title and placeholder.
3. "Use this idea" prefills; changing the title saves; the card shows the idea's illustration.
4. Editing the title or categories of an existing event works; the update appears after refresh.
5. Force-close during a new event, reopen, and Continue draft restores title, description and categories.
6. Cancel an event from My resbites.
7. The Create tab and editor remain usable with Larger Text.
8. Plans created before the update still show correctly.

Record each answer verbatim, with its date, in `qa/custom-events-2026-10-07/README.md`. Fix any failure in its owning task's code, re-run Task 10, and repeat the affected steps.

- [ ] **Step 7: Commit**

```bash
git add qa/custom-events-2026-10-07 supabase/tests/hosted-baseline/migrations.txt
git commit -m "Record CE1 hosted rollout and iPhone acceptance

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Documentation and decision records

**Files:**
- Modify: `knowledge-base/08-decisions.md`, `knowledge-base/13-expanded-beta-scope.md`, `docs/milestones/2026-09-23-expanded-private-beta.md`, `docs/implementation-status.md`, `docs/development-handoff-2026-10-07.md`, `supabase/README.md`

- [ ] **Step 1: Decision log**

Append to `knowledge-base/08-decisions.md`:
```markdown
## Custom events — 7 October 2026

Owner decisions from the custom-events design session ([spec](../docs/superpowers/specs/2026-10-07-custom-events-design.md)):

| # | Decision |
| --- | --- |
| CE-D1 | Custom events are the primary creation flow; catalogue ideas are optional templates. |
| CE-D2 | An event has a required title, date/time and place, plus a description, an uploaded cover photo (CE2) and categories. |
| CE-D3 | Choosing an idea is an editable template that remembers which idea it came from. |
| CE-D4 | Discover becomes the Create tab; My resbites gains "New resbite". |
| CE-D5 | Categories are the seven wellness categories: Creative, Intellectual, Mindful, Natural, Physical, Community, Uplifting. The wellness formula remains a B5 decision. |
| CE-D6 | Each event and idea has one or two categories. |
| CE-D7 | Approved category mapping for the 11 published ideas (see `mobile/content/activity-categories.json`). |
| CE-D8 | CE comes before the remaining B0 work and B1, in two parts: CE1 events, CE2 cover photo. |
```

- [ ] **Step 2: Scope overlay and milestone plan**

At the top of `knowledge-base/13-expanded-beta-scope.md`, below the first paragraph, add:
```markdown
**7 October 2026 update:** the owner made custom events the primary creation flow (CE milestone, decisions CE-D1–D8 in the [decision log](08-decisions.md)). M01–M04 now mean "create your own resbite, optionally from an idea"; the seven wellness categories are approved as the shared taxonomy, while the wellness formula remains B5.
```

Append to `docs/milestones/2026-09-23-expanded-private-beta.md`:
```markdown
## CE — Custom events (7 October 2026)

The owner re-prioritized: custom events come before the remaining B0 work and B1 ([design](../superpowers/specs/2026-10-07-custom-events-design.md), [CE1 plan](../superpowers/plans/2026-10-07-custom-events-ce1.md)). CE1 delivers event title/description/categories, the Create tab and idea templates; CE2 delivers organizer cover photos. B1's two-person acceptance now exercises custom events. B2–B8 scope is unchanged.
```

- [ ] **Step 3: Status, handoff and backend README**

Append to `docs/implementation-status.md` a dated `## Custom events CE1 — <date of Task 11 acceptance>` entry summarizing:
- what shipped
- the hosted migration and version
- the verification counts from Task 10
- the owner's acceptance replies (link `qa/custom-events-2026-10-07/README.md`)
- what remains (CE2; then B0 remainder)

In `docs/development-handoff-2026-10-07.md`, add a line under the title: `**Update:** custom events (CE) now precede the remaining B0 work — see the [CE1 record](../qa/custom-events-2026-10-07/README.md).`

In `supabase/README.md`, document:
- `create_plan_v2` / `change_plan_v2`, with their arguments and error codes (22023 validation/availability, 23514/23502 field rules, 40001 version, 42501 access)
- the two `plans` triggers and why they exist
- `activities.categories` and the published-categories rule
- `./scripts/test-database.sh --hosted-baseline` and `supabase/tests/hosted-baseline/migrations.txt` as the record of hosted migrations

In `qa/deletion-recovery-ledger.md`, add to the end of "## Remaining integration sequence" (spec, Deletion section):
```markdown
8. Custom events (CE1, 7 October 2026): before enabling deletion, verify on the deployed database that activation leaves a deleted organizer's events titled `Resbite` with an empty description (`plans_redact_deleting_owner` trigger), and, once CE2 ships, that the worker removes their `plan-covers` objects.
```

- [ ] **Step 4: Commit**

```bash
git add knowledge-base docs supabase/README.md qa/deletion-recovery-ledger.md
git commit -m "Record custom events decisions, rollout and backend contracts

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## After CE1

Write the CE2 (cover photo) plan from the same spec once CE1 is accepted. It covers:
- the `plan-covers` bucket and policies
- `set_plan_cover_if_current`, with the revision trigger
- cover redaction in `redact_deleting_owner_plan`
- the cover journal and picker in the editor
- `EventPictureView` gaining the cover as the first choice
- cleanup and deletion release-checklist items
