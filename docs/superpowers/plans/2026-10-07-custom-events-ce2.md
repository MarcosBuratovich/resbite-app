# Custom Events CE2 (Cover Photo) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an organizer add, replace and remove a private cover photo on their own upcoming resbite. Invitees see only the current cover; it is built on the profile-photo pipeline that has already been accepted on the phone.

**Architecture:**
- **Database.** A hosted-compatible migration adds `plans.cover_path` and `plans.cover_revision`, plus a trigger the database owns that maintains the revision. It also adds a private `plan-covers` bucket with owner-upload, current-cover-read and no-delete policies, a compare-and-swap `set_plan_cover_if_current` RPC, and cover detachment in the existing deletion-redaction trigger.
- **App.** The proven profile-photo change journal and finish routine are generalized, without changing profile behaviour, so covers use the same retry-safe algorithm. A small hook drives the editor's cover picker. Pictures everywhere prefer the cover, shown through cached 5-minute signed links.

**Tech Stack:** Expo SDK 57 / React Native 0.86 / TypeScript 6 / expo-router 57, the existing `expo-image-picker`, `expo-image-manipulator` and `expo-file-system`, Supabase Postgres 17 and Storage, Node 22 `node:test` via `tsx`, Playwright browser QA against Expo web, and disposable local Postgres 17.

**Spec:** `docs/superpowers/specs/2026-10-07-custom-events-design.md`, sections "Cover photo storage (CE2)", "Cover photo flow (CE2)", "Deletion" and "CE2 acceptance". CE1 shipped on `main` at `08e52e2`, with hosted migration `custom_events` at version `20261007154825`.

## Global Constraints

- Before any mobile command, run `export PATH="/opt/homebrew/opt/node@22/bin:$PATH"`.
- Read https://docs.expo.dev/versions/v57.0.0/ before using an Expo API in a new way (`mobile/AGENTS.md`).
- No new npm dependencies and no native configuration changes. CE2 ships as a JavaScript-only update.
- Cover bytes: JPEG, longest side ≤ 1600 px, JPEG metadata stripped, ≤ 2 MB.
- Path: `<owner uid>/<plan id>/<random>.jpg` in bucket `plan-covers`. The bucket is private, 2 MB, `image/jpeg` only.
- Upload (insert and update): only into the caller's own folder for a plan they own that is active and in the future. **No client delete.**
- Read: the owner reads their own uploads. Anyone else who can read the plan reads only its current `cover_path`. The app uses 5-minute (300 s) signed URLs.
- Attach, replace and remove go through `set_plan_cover_if_current` with compare-and-swap on path and revision. An exact retry is acknowledged; a stale change fails with `40001`.
- A new event saves first, then its cover uploads and attaches. If the cover step fails, the event still exists, and Edit shows "Retry cover". Cancelling the picker does nothing.
- Replaced or removed covers stay private and unattached; nothing deletes them client-side.
- Profile-photo behaviour must not change. The existing `profilePhotoStore.test.ts` cases pass unmodified.
- Never `supabase db push`. The hosted migration is applied only in Task 7, after explicit owner approval. Tester access stays owner-only.
- Every new mobile test file is appended to the `test` chain in `mobile/package.json`.
- UI copy uses curly apostrophes (’).
- Browser QA:
  1. Start `cd mobile && CI=1 npx expo start --web --port 8081 --clear` in the background.
  2. Wait for HTTP 200, then run `node scripts/<name>.mjs`.
  3. Restart with `--clear` after source edits. Stop the server when done.
- Commit at the end of each task. The message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Stage only the task's files, and never `.agents/`, `.mcp.json`, `skills-lock.json` or `.superpowers/`. Work on branch `custom-events-ce2`.

## Review Focus

1. **The upload lands but the attach reply is lost, or the app is killed between upload and attach.** The retry must reuse the same path and never create a second attached file. Pinned by Task 2 (lost-link test) and Task 5 (browser retry from Edit uploads to the same path).
2. **The plan is cancelled or starts between choosing a cover and attaching it.** The server refuses with `22023`, the journal is kept, and "Keep saved cover" recovers. Pinned by Task 1 (cancelled-plan SQL) and Task 2 (closed-plan finish test).
3. **Very large or extreme-aspect images** (for example 4000×1200 or 900×3000) are uploaded as clean JPEGs within 1600 px and 2 MB. Pinned by Task 5 (browser QA validates the JPEG markers and dimensions).
4. **A signed link expires while a screen stays open.** It is re-signed after the cache window, and a failed signing falls back to the idea art or category placeholder. Pinned by Task 3 (cache tests) and Task 4 (fallback branch).
5. **A replaced cover, an outsider, or an invitee trying to write.** No access except to the current cover, read-only. Pinned by Task 1 (SQL storage-policy assertions).

---

### Task 1: Database — plan covers

**Files:**
- Create: `supabase/migrations/20261007200000_plan_covers.sql`
- Create: `supabase/tests/plan-covers.sql`
- Modify: `supabase/tests/hosted-baseline/tests.txt` (append `plan-covers.sql`)

**Interfaces:**
- Consumes: CE1 objects `public.plans`, `private.redact_deleting_owner_plan()`, `public.create_plan_v2`, `public.change_plan_v2`, `private.require_tester()` and `private.eligible()`.
- Produces:
  - columns `plans.cover_path text null` and `plans.cover_revision bigint not null default 0`;
  - bucket `plan-covers`;
  - `public.set_plan_cover_if_current(p_plan uuid, p_path text, p_expected_path text, p_expected_revision bigint) returns jsonb` → `{"cover_path": …, "cover_revision": …}`.

- [ ] **Step 1: Write the failing SQL test**

`supabase/tests/plan-covers.sql`:
```sql
-- CE2 cover photos. Synthetic identities only; every change rolls back.
begin;
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
 ('c1000000-0000-4000-8000-000000000001','cover-owner@resbite-test.invalid',now(),'{}'),
 ('c1000000-0000-4000-8000-000000000002','cover-invitee@resbite-test.invalid',now(),'{}'),
 ('c1000000-0000-4000-8000-000000000003','cover-outsider@resbite-test.invalid',now(),'{}');
insert into private.tester_roster(email) values
 ('cover-owner@resbite-test.invalid'),('cover-invitee@resbite-test.invalid'),('cover-outsider@resbite-test.invalid');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.save_profile('Cover owner');
select public.create_plan_v2('c2000000-0000-4000-8000-000000000001','Garden picnic','',array['natural'],null,now()+interval '1 day','UTC','Park','');
select public.create_plan_v2('c2000000-0000-4000-8000-000000000002','Cancelled picnic','',array['natural'],null,now()+interval '2 days','UTC','Park','');
select public.change_plan_v2('c2000000-0000-4000-8000-000000000002',1,null,null,null,null,null,null,null,true);
select public.create_invite('c3000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-000000000001',repeat('d',64));
-- The owner uploads only into their own active plan's folder.
insert into storage.objects(bucket_id,name,owner) values
 ('plan-covers','c1000000-0000-4000-8000-000000000001/c2000000-0000-4000-8000-000000000001/a.jpg','c1000000-0000-4000-8000-000000000001'),
 ('plan-covers','c1000000-0000-4000-8000-000000000001/c2000000-0000-4000-8000-000000000001/b.jpg','c1000000-0000-4000-8000-000000000001');
do $$ begin
 begin insert into storage.objects(bucket_id,name) values('plan-covers','c1000000-0000-4000-8000-000000000002/c2000000-0000-4000-8000-000000000001/x.jpg'); raise exception 'Upload into another user folder allowed'; exception when insufficient_privilege then null; end;
 begin insert into storage.objects(bucket_id,name) values('plan-covers','c1000000-0000-4000-8000-000000000001/c2000000-0000-4000-8000-000000000002/x.jpg'); raise exception 'Upload into a cancelled plan allowed'; exception when insufficient_privilege then null; end;
 begin insert into storage.objects(bucket_id,name) values('plan-covers','c1000000-0000-4000-8000-000000000001/c2000000-0000-4000-8000-000000000009/x.jpg'); raise exception 'Upload for a missing plan allowed'; exception when insufficient_privilege then null; end;
end $$;
-- Compare-and-swap attach, exact retry, stale rejection, replace, validation.
do $$ declare
 p uuid := 'c2000000-0000-4000-8000-000000000001';
 a text := 'c1000000-0000-4000-8000-000000000001/c2000000-0000-4000-8000-000000000001/a.jpg';
 b text := 'c1000000-0000-4000-8000-000000000001/c2000000-0000-4000-8000-000000000001/b.jpg';
 r jsonb;
begin
 r := public.set_plan_cover_if_current(p,a,null,0);
 if r<>jsonb_build_object('cover_path',a,'cover_revision',1) then raise exception 'Attach failed: %',r; end if;
 if public.set_plan_cover_if_current(p,a,null,0)<>r then raise exception 'Lost reply retry failed'; end if;
 begin perform public.set_plan_cover_if_current(p,b,null,0); raise exception 'Stale attach accepted'; exception when serialization_failure then null; end;
 r := public.set_plan_cover_if_current(p,b,a,1);
 if r<>jsonb_build_object('cover_path',b,'cover_revision',2) then raise exception 'Replace failed: %',r; end if;
 begin perform public.set_plan_cover_if_current(p,'c1000000-0000-4000-8000-000000000001/c2000000-0000-4000-8000-000000000001/missing.jpg',b,2); raise exception 'Missing object attached'; exception when insufficient_privilege then null; end;
 begin perform public.set_plan_cover_if_current(p,'c1000000-0000-4000-8000-000000000001/c2000000-0000-4000-8000-000000000002/a.jpg',b,2); raise exception 'Another plan folder attached'; exception when insufficient_privilege then null; end;
 begin perform public.set_plan_cover_if_current(p,b,b,-1); raise exception 'Negative revision accepted'; exception when invalid_parameter_value then null; end;
 begin perform public.set_plan_cover_if_current('c2000000-0000-4000-8000-000000000002',null,null,0); raise exception 'Cancelled plan cover changed'; exception when invalid_parameter_value then null; end;
 -- No client deletion, not even the owner's own files; the owner still reads both uploads.
 delete from storage.objects where bucket_id='plan-covers' and name=a;
 if not exists(select 1 from storage.objects where name=a) then raise exception 'Owner deleted a cover file'; end if;
 if (select count(*) from storage.objects where bucket_id='plan-covers')<>2 then raise exception 'Owner cannot read own uploads'; end if;
 begin update public.plans set cover_revision=0 where id=p; raise exception 'Direct revision write allowed'; exception when insufficient_privilege then null; end;
end $$;

-- An invitee reads only the current cover and cannot change or upload covers.
select set_config('request.jwt.claims','{"sub":"c1000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select public.save_profile('Cover invitee');
select public.claim_invite(repeat('d',64));
do $$ begin
 if (select count(*) from storage.objects where bucket_id='plan-covers')<>1
  or not exists(select 1 from storage.objects where name like '%/b.jpg') then raise exception 'Invitee sees a replaced cover or not the current one'; end if;
 if (select cover_path from public.plans where id='c2000000-0000-4000-8000-000000000001') not like '%/b.jpg' then raise exception 'Invitee cannot read the cover path'; end if;
 begin perform public.set_plan_cover_if_current('c2000000-0000-4000-8000-000000000001',null,'c1000000-0000-4000-8000-000000000001/c2000000-0000-4000-8000-000000000001/b.jpg',2); raise exception 'Invitee changed the cover'; exception when insufficient_privilege then null; end;
 begin insert into storage.objects(bucket_id,name) values('plan-covers','c1000000-0000-4000-8000-000000000001/c2000000-0000-4000-8000-000000000001/invitee.jpg'); raise exception 'Invitee uploaded a cover'; exception when insufficient_privilege then null; end;
end $$;
-- An outsider sees no covers at all.
select set_config('request.jwt.claims','{"sub":"c1000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select public.save_profile('Cover outsider');
do $$ begin
 if exists(select 1 from storage.objects where bucket_id='plan-covers') then raise exception 'Outsider sees covers'; end if;
end $$;
reset role;
-- Trusted maintenance cannot forge the counter; deletion detaches the cover and bumps it once.
update public.plans set cover_revision=900 where id='c2000000-0000-4000-8000-000000000001';
do $$ begin
 if (select cover_revision from public.plans where id='c2000000-0000-4000-8000-000000000001')<>2 then raise exception 'Revision forged'; end if;
end $$;
update public.profiles set deletion_requested_at=now() where id='c1000000-0000-4000-8000-000000000001';
update public.plans set place_label='Meeting place removed' where owner_id='c1000000-0000-4000-8000-000000000001';
do $$ begin
 if exists(select 1 from public.plans where owner_id='c1000000-0000-4000-8000-000000000001' and (cover_path is not null or title<>'Resbite')) then raise exception 'Deleting owner cover retained'; end if;
 if (select cover_revision from public.plans where id='c2000000-0000-4000-8000-000000000001')<>3 then raise exception 'Detach on deletion did not bump the revision'; end if;
end $$;
-- Grants: only signed-in users may call the attach function.
do $$ begin
 if has_function_privilege('anon','public.set_plan_cover_if_current(uuid,text,text,bigint)','EXECUTE')
  or has_function_privilege('service_role','public.set_plan_cover_if_current(uuid,text,text,bigint)','EXECUTE')
  or not has_function_privilege('authenticated','public.set_plan_cover_if_current(uuid,text,text,bigint)','EXECUTE') then
  raise exception 'set_plan_cover_if_current grants are wrong';
 end if;
end $$;
rollback;
```

- [ ] **Step 2: Run the suite to verify it fails**

Run from the repository root: `./scripts/test-database.sh`
Expected: FAIL in `plan-covers.sql`, because the bucket and policies don't exist yet. The insert into `storage.objects` fails on the bucket foreign key or because RLS denies it.

- [ ] **Step 3: Write the migration**

`supabase/migrations/20261007200000_plan_covers.sql`:
```sql
-- Custom events CE2: organizer cover photos. Private bucket; owner-only uploads to an
-- active future plan; readers see only the current cover; compare-and-swap attach.
-- Hosted-compatible: depends only on the hosted foundation and custom_events migrations.

alter table public.plans
 add column cover_path text check (cover_path is null or length(cover_path) <= 300),
 add column cover_revision bigint not null default 0 check (cover_revision >= 0);

-- The database owns the counter, as for avatars: any cover_path change bumps it once;
-- unrelated or no-op updates (including trusted maintenance) cannot change it.
create function private.track_cover_revision() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='INSERT' then
  new.cover_revision := 0;
 elsif new.cover_path is distinct from old.cover_path then
  new.cover_revision := old.cover_revision + 1;
 else
  new.cover_revision := old.cover_revision;
 end if;
 return new;
end $$;
revoke all on function private.track_cover_revision() from public, anon, authenticated, service_role;
-- BEFORE triggers fire in name order: this runs after plans_redact_deleting_owner.
create trigger plans_track_cover_revision before insert or update on public.plans
 for each row execute function private.track_cover_revision();

-- Deletion redaction now also detaches the cover (create or replace keeps its privileges).
create or replace function private.redact_deleting_owner_plan() returns trigger
language plpgsql set search_path = '' as $$
begin
 if new.owner_id is not null and exists(
  select 1 from public.profiles as p where p.id = new.owner_id and p.deletion_requested_at is not null) then
  new.title := 'Resbite';
  new.description := '';
  new.cover_path := null;
 end if;
 return new;
end $$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('plan-covers','plan-covers',false,2097152,array['image/jpeg']);

-- Paths are <owner uid>/<plan id>/<name>.jpg. Uploads (insert, and update for upsert)
-- go only into the caller's own folder for their own active, future plan.
create policy resbite_cover_insert on storage.objects for insert to authenticated with check (
 bucket_id='plan-covers' and (select private.eligible())
 and (storage.foldername(name))[1]=(select auth.uid())::text
 and exists(select 1 from public.plans p where p.id::text=(storage.foldername(name))[2]
  and p.owner_id=(select auth.uid()) and p.status='active' and p.starts_at>now())
);
create policy resbite_cover_update on storage.objects for update to authenticated using (
 bucket_id='plan-covers' and (select private.eligible())
 and (storage.foldername(name))[1]=(select auth.uid())::text
 and exists(select 1 from public.plans p where p.id::text=(storage.foldername(name))[2]
  and p.owner_id=(select auth.uid()) and p.status='active' and p.starts_at>now())
) with check (
 bucket_id='plan-covers' and (select private.eligible())
 and (storage.foldername(name))[1]=(select auth.uid())::text
 and exists(select 1 from public.plans p where p.id::text=(storage.foldername(name))[2]
  and p.owner_id=(select auth.uid()) and p.status='active' and p.starts_at>now())
);
-- The owner reads their own uploads (interrupted-upload recovery). Anyone else who can
-- read the plan reads only its current cover. No delete policy: clients only detach.
create policy resbite_cover_read on storage.objects for select to authenticated using (
 bucket_id='plan-covers' and (select private.eligible()) and exists(
  select 1 from public.plans p where p.id::text=(storage.foldername(name))[2]
   and p.owner_id::text=(storage.foldername(name))[1]
   and (p.owner_id=(select auth.uid()) or p.cover_path=name))
);

create function private.set_plan_cover_if_current(p_plan uuid,p_path text,p_expected_path text,p_expected_revision bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_uid uuid := private.require_tester(); v_plan public.plans;
begin
 if p_expected_revision is null or p_expected_revision<0 then raise exception 'Invalid cover revision' using errcode='22023'; end if;
 select * into v_plan from public.plans where id=p_plan for update;
 if not found or v_plan.owner_id<>v_uid then raise exception 'Owner required' using errcode='42501'; end if;
 if v_plan.status<>'active' or v_plan.starts_at<=now() then raise exception 'Plan unavailable' using errcode='22023'; end if;
 if p_path is not null and (p_path !~ ('^'||v_uid::text||'/'||p_plan::text||'/[A-Za-z0-9-]+\.jpg$') or not exists(
   select 1 from storage.objects where bucket_id='plan-covers' and name=p_path)) then
  raise exception 'Own uploaded cover required' using errcode='42501';
 end if;
 if v_plan.cover_path is not distinct from p_expected_path and v_plan.cover_revision=p_expected_revision then
  if v_plan.cover_path is distinct from p_path then
   update public.plans set cover_path=p_path where id=p_plan returning * into v_plan;
  end if;
 elsif v_plan.cover_path is not distinct from p_path
   and v_plan.cover_revision>0 and v_plan.cover_revision-1=p_expected_revision then
  -- Only the exact next revision acknowledges a lost successful reply (no ABA replay).
  null;
 else
  raise exception 'The cover changed elsewhere; reload before saving' using errcode='40001';
 end if;
 return jsonb_build_object('cover_path',v_plan.cover_path,'cover_revision',v_plan.cover_revision);
end $$;
create function public.set_plan_cover_if_current(p_plan uuid,p_path text,p_expected_path text,p_expected_revision bigint)
returns jsonb language sql security invoker set search_path='' as $$
 select private.set_plan_cover_if_current(p_plan,p_path,p_expected_path,p_expected_revision)
$$;
revoke all on function private.set_plan_cover_if_current(uuid,text,text,bigint), public.set_plan_cover_if_current(uuid,text,text,bigint)
 from public, anon, authenticated, service_role;
grant execute on function private.set_plan_cover_if_current(uuid,text,text,bigint), public.set_plan_cover_if_current(uuid,text,text,bigint)
 to authenticated;
```

- [ ] **Step 4: Add to the hosted-baseline test list and run both modes**

Append the line `plan-covers.sql` to `supabase/tests/hosted-baseline/tests.txt`.

Run: `./scripts/test-database.sh && ./scripts/test-database.sh --hosted-baseline 20261007200000_plan_covers.sql`
Expected: every SQL file PASSes in full mode, including `plan-covers.sql`, along with the four concurrency checks. Baseline mode prints `PASS: 20261007200000_plan_covers applies on the hosted baseline`, then the six tests in `tests.txt`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261007200000_plan_covers.sql supabase/tests/plan-covers.sql supabase/tests/hosted-baseline/tests.txt
git commit -m "Add private plan covers with compare-and-swap attach

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Generalize the photo change journal for covers

**Files:**
- Create: `mobile/src/domain/covers.ts`
- Create: `mobile/src/services/coverChange.test.ts`
- Modify: `mobile/src/services/profilePhotoStore.ts` (full replacement below), `mobile/package.json`

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `PhotoChangeCopy`, `PhotoLayout`, `profilePhotoLayout`
  - `createPhotoChangeStore(storage, files, layout)`. `createProfilePhotoStore(storage, files)` is unchanged.
  - `VersionedPhoto { path; revision }`, `VersionedPhotoGateway`
  - `finishVersionedPhotoChange(change, gateway, readBytes, assertCurrent, copy) → { cleanupPending, path, revision }`. `finishPhotoChange` is unchanged.
  - From `domain/covers.ts`: `COVER_BUCKET`, `COVER_MAX_DIMENSION`, `coverScope(ownerId, planId)`, `coverTarget(scope, fileId)` and `coverPhotoLayout`.

- [ ] **Step 1: Write the failing tests**

`mobile/src/services/coverChange.test.ts`:
```ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  createPhotoChangeStore,
  finishVersionedPhotoChange,
  type PhotoChange,
  type VersionedPhoto,
} from "./profilePhotoStore.ts";
import { coverPhotoLayout, coverScope, coverTarget } from "../domain/covers.ts";

const owner = "11111111-1111-4111-8111-111111111111";
const plan = "22222222-2222-4222-8222-222222222222";
const other = "33333333-3333-4333-8333-333333333333";
const noop = () => {};
const copy = coverPhotoLayout.copy;

function memory() {
  const values = new Map<string, string>();
  const blobs = new Map<string, Uint8Array>();
  return {
    storage: {
      getItem: async (k: string) => values.get(k) ?? null,
      setItem: async (k: string, v: string) => {
        values.set(k, v);
      },
      removeItem: async (k: string) => {
        values.delete(k);
      },
    },
    files: {
      write: async (scope: string, bytes: Uint8Array) => {
        blobs.set(scope, bytes);
      },
      read: async (scope: string) => {
        const bytes = blobs.get(scope);
        if (!bytes) throw Error("missing bytes");
        return bytes;
      },
      clear: async (scope: string) => {
        blobs.delete(scope);
      },
    },
  };
}

function server(initial: VersionedPhoto) {
  const state = { ...initial };
  const uploads: string[] = [];
  let loseLink = false;
  return {
    state,
    uploads,
    loseNextLink() {
      loseLink = true;
    },
    gateway: {
      read: async (): Promise<VersionedPhoto | null> => ({ ...state }),
      upload: async (path: string) => {
        uploads.push(path);
      },
      link: async (path: string | null, expectedPath: string | null, expectedRevision: number) => {
        if (state.path !== expectedPath || state.revision !== expectedRevision)
          throw { code: "40001" };
        if (state.path !== path) {
          state.path = path;
          state.revision++;
        }
        if (loseLink) {
          loseLink = false;
          throw Error("Lost reply");
        }
      },
    },
  };
}

test("cover journals are scoped to one owner and plan and accept only that plan's folder", async () => {
  const { storage, files } = memory();
  const store = createPhotoChangeStore(storage, files, coverPhotoLayout);
  const scope = coverScope(owner, plan);
  const change: PhotoChange = { previous: null, target: coverTarget(scope, "abc-123"), expectedRevision: 0 };
  await store.begin(scope, change, new Uint8Array([1]), noop);
  assert.deepEqual(await store.read(scope), change);
  assert.equal(await store.read(coverScope(owner, other)), null);
  await assert.rejects(store.begin(scope, { ...change, target: `${owner}/${other}/x.jpg` }, null, noop), /invalid/);
  await assert.rejects(store.begin(scope, { ...change, target: `${scope}/../x.jpg` }, null, noop), /invalid/);
  await assert.rejects(store.read("preview"), /Invalid photo owner/);
  assert.throws(() => coverScope(owner, "not-a-plan"), /Invalid cover owner/);
});

test("a lost attach reply is confirmed by reading back; a later retry does nothing more", async () => {
  const scope = coverScope(owner, plan);
  const remote = server({ path: null, revision: 0 });
  remote.loseNextLink();
  const change: PhotoChange = { previous: null, target: coverTarget(scope, "a1"), expectedRevision: 0 };
  const bytes = async () => new Uint8Array([1]);
  assert.deepEqual(await finishVersionedPhotoChange(change, remote.gateway, bytes, noop, copy), {
    cleanupPending: false,
    path: change.target,
    revision: 1,
  });
  assert.equal(remote.uploads.length, 1);
  const again = await finishVersionedPhotoChange(change, remote.gateway, bytes, noop, copy);
  assert.equal(again.path, change.target);
  assert.equal(remote.uploads.length, 1);
});

test("a cover changed elsewhere, or a plan that stopped accepting changes, keeps the journal", async () => {
  const scope = coverScope(owner, plan);
  const change: PhotoChange = { previous: null, target: coverTarget(scope, "a1"), expectedRevision: 0 };
  const bytes = async () => new Uint8Array([1]);
  const moved = server({ path: `${scope}/other.jpg`, revision: 1 });
  await assert.rejects(finishVersionedPhotoChange(change, moved.gateway, bytes, noop, copy), /Keep saved cover/);
  const closed = server({ path: null, revision: 0 });
  closed.gateway.link = async () => {
    throw { code: "22023", message: "Plan unavailable" };
  };
  await assert.rejects(
    finishVersionedPhotoChange(change, closed.gateway, bytes, noop, copy),
    (e: unknown) => (e as { code?: string }).code === "22023",
  );
});

test("removing a cover detaches it without bytes and reports the previous file for cleanup", async () => {
  const scope = coverScope(owner, plan);
  const previous = `${scope}/old.jpg`;
  const remote = server({ path: previous, revision: 2 });
  const result = await finishVersionedPhotoChange(
    { previous, target: null, expectedRevision: 2 },
    remote.gateway,
    async () => {
      throw Error("no bytes needed");
    },
    noop,
    copy,
  );
  assert.deepEqual(result, { cleanupPending: true, path: null, revision: 3 });
  assert.equal(remote.uploads.length, 0);
});
```

Append ` && node --import tsx src/services/coverChange.test.ts` to the `test` script in `mobile/package.json`.

- [ ] **Step 2: Run to verify it fails**

Run: `cd mobile && node --import tsx src/services/coverChange.test.ts`
Expected: FAIL with `Cannot find module` for `../domain/covers.ts`.

- [ ] **Step 3: Implement**

`mobile/src/domain/covers.ts`:
```ts
// Event cover photos (CE2): a private bucket with one folder per owner and plan.
export const COVER_BUCKET = "plan-covers";
export const COVER_MAX_DIMENSION = 1600;
const id = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const scopePattern = new RegExp(`^${id}/${id}$`, "i");

/** Journal scope and storage folder for one plan's cover: `<owner id>/<plan id>`. */
export function coverScope(ownerId: string, planId: string): string {
  const scope = `${ownerId}/${planId}`;
  if (!scopePattern.test(scope)) throw Error("Invalid cover owner.");
  return scope;
}

export function coverTarget(scope: string, fileId: string): string {
  return `${scope}/${fileId}.jpg`;
}

export const coverPhotoLayout = {
  validScope: (scope: string) => scopePattern.test(scope),
  key: (scope: string) => `resbite.cover.v1.${scope.replace("/", ".")}`,
  prefix: (scope: string) => `${scope}/`,
  copy: {
    unretryable:
      "This saved cover change cannot be safely retried. Choose Keep saved cover, then choose the cover again.",
    missing: "This resbite is no longer available to your account.",
    unverified:
      "The saved cover could not be verified. Reopen the plan before trying again.",
    changedElsewhere:
      "The cover changed elsewhere. Choose Keep saved cover before making another change.",
    unconfirmed: "Cover update is unconfirmed. Retry to check the saved cover.",
  },
};
```

Replace `mobile/src/services/profilePhotoStore.ts` entirely. Profile behaviour and messages are preserved exactly:
```ts
import type { KeyStore } from "./secureChunks";
export type PhotoChange = {
  previous: string | null;
  target: string | null;
  // Optional only so old journals can be opened and explicitly discarded.
  expectedRevision?: number;
};
/** User-facing copy for one kind of photo (profile photo, event cover). */
export type PhotoChangeCopy = {
  unretryable: string;
  missing: string;
  unverified: string;
  changedElsewhere: string;
  unconfirmed: string;
};
/** Where one kind of photo is journaled on the device and stored in its bucket. */
export type PhotoLayout = {
  validScope(scope: string): boolean;
  key(scope: string): string;
  prefix(scope: string): string;
  copy: PhotoChangeCopy;
};
export const profilePhotoLayout: PhotoLayout = {
  validScope: (scope) => /^[a-zA-Z0-9-]+$/.test(scope) && scope !== "preview",
  key: (scope) => `resbite.photo.v1.${scope}`,
  prefix: (scope) => `${scope}/`,
  copy: {
    unretryable:
      "This saved photo change cannot be safely retried. Choose Keep saved photo, then choose your photo again.",
    missing: "Save your name before adding a photo.",
    unverified:
      "Your saved photo could not be verified. Reload your profile before trying again.",
    changedElsewhere:
      "Your photo changed elsewhere. Choose Keep saved photo before making another change.",
    unconfirmed: "Photo update is unconfirmed. Retry to check the saved photo.",
  },
};
const validRevision = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
function requireRevision(change: PhotoChange, copy: PhotoChangeCopy): number {
  if (!validRevision(change.expectedRevision)) throw Error(copy.unretryable);
  return change.expectedRevision;
}
export type PhotoFiles = {
  write(scope: string, bytes: Uint8Array): Promise<void>;
  read(scope: string): Promise<Uint8Array>;
  clear(scope: string): Promise<void>;
};
export function createPhotoChangeStore(
  storage: KeyStore,
  files: PhotoFiles,
  layout: PhotoLayout,
) {
  const epochs = new Map<string, number>();
  const queues = new Map<string, Promise<unknown>>();
  function run<T>(scope: string, action: () => Promise<T>): Promise<T> {
    if (!layout.validScope(scope))
      return Promise.reject(Error("Invalid photo owner."));
    const next = (queues.get(scope) ?? Promise.resolve())
      .catch(() => {})
      .then(action);
    queues.set(
      scope,
      next.catch(() => {}),
    );
    return next;
  }
  function validate(scope: string, change: PhotoChange) {
    const prefix = layout.prefix(scope);
    const path = (value: unknown) =>
      value === null ||
      (typeof value === "string" &&
        value.startsWith(prefix) &&
        /^[a-zA-Z0-9-]+\.jpg$/.test(value.slice(prefix.length)));
    const previous = (value: unknown) =>
      value === null ||
      (typeof value === "string" &&
        value.startsWith(prefix) &&
        !value
          .split("/")
          .some((part) => !part || part === "." || part === "..") &&
        !/[\\\u0000-\u001f]/.test(value));
    if (!change || !previous(change.previous) || !path(change.target))
      throw Error("Saved photo change is invalid.");
    if (change.expectedRevision !== undefined && !validRevision(change.expectedRevision))
      throw Error("Saved photo revision is invalid.");
    return change;
  }
  return {
    read(scope: string): Promise<PhotoChange | null> {
      return run(scope, async () => {
        const value = await storage.getItem(layout.key(scope));
        return value ? validate(scope, JSON.parse(value)) : null;
      });
    },
    begin(
      scope: string,
      change: PhotoChange,
      bytes: Uint8Array | null,
      assertCurrent: () => void,
    ) {
      const epoch = epochs.get(scope) ?? 0;
      return run(scope, async () => {
        const check = () => {
          assertCurrent();
          if ((epochs.get(scope) ?? 0) !== epoch)
            throw Error("Photo operation cancelled.");
        };
        check();
        validate(scope, change);
        requireRevision(change, layout.copy);
        try {
          if (bytes) await files.write(scope, bytes);
          check();
          await storage.setItem(layout.key(scope), JSON.stringify(change));
          check();
        } catch (error) {
          await storage.removeItem(layout.key(scope));
          await files.clear(scope);
          throw error;
        }
      });
    },
    bytes: (scope: string) => run(scope, () => files.read(scope)),
    clear(scope: string) {
      epochs.set(scope, (epochs.get(scope) ?? 0) + 1);
      return run(scope, async () => {
        await storage.removeItem(layout.key(scope));
        await files.clear(scope);
      });
    },
  };
}
export function createProfilePhotoStore(storage: KeyStore, files: PhotoFiles) {
  return createPhotoChangeStore(storage, files, profilePhotoLayout);
}

export type VersionedPhoto = { path: string | null; revision: number };
export type VersionedPhotoGateway = {
  read(): Promise<VersionedPhoto | null>;
  upload(path: string, bytes: Uint8Array): Promise<void>;
  link(path: string | null, expectedPath: string | null, expectedRevision: number): Promise<void>;
};
// A pending operation is preserved on every uncertain result. Never delete the
// candidate: its link may have committed even if a reply was lost.
export async function finishVersionedPhotoChange(
  change: PhotoChange,
  gateway: VersionedPhotoGateway,
  readBytes: () => Promise<Uint8Array>,
  assertCurrent: () => void,
  copy: PhotoChangeCopy,
) {
  assertCurrent();
  const expected = requireRevision(change, copy);
  let current = await gateway.read();
  assertCurrent();
  if (!current) throw Error(copy.missing);
  if (!validRevision(current.revision)) throw Error(copy.unverified);
  const matches = (value: VersionedPhoto | null) =>
    value?.path === change.target &&
    (value.revision === expected + 1 ||
      (change.previous === change.target && value.revision === expected));
  if (!matches(current)) {
    if (current.path !== change.previous || current.revision !== expected)
      throw Error(copy.changedElsewhere);
    if (change.target) {
      const bytes = await readBytes();
      assertCurrent();
      await gateway.upload(change.target, bytes);
      assertCurrent();
    }
    let failure: unknown;
    try {
      await gateway.link(change.target, change.previous, expected);
    } catch (error) {
      failure = error;
    }
    assertCurrent();
    current = await gateway.read();
    assertCurrent();
    if (!matches(current)) {
      if (current && (current.path !== change.previous || current.revision !== expected))
        throw Error(copy.changedElsewhere);
      throw failure ?? Error(copy.unconfirmed);
    }
  }
  // A client read cannot fence a concurrent reattachment on another device.
  // Only the prepared server retirement protocol may remove detached bytes.
  return {
    cleanupPending: change.previous !== null && change.previous !== change.target,
    path: current!.path,
    revision: current!.revision,
  };
}

export type PhotoGateway = {
  read(): Promise<{ avatar_path: string | null; avatar_revision: number } | null>;
  upload(path: string, bytes: Uint8Array): Promise<void>;
  link(path: string | null, expectedPath: string | null, expectedRevision: number): Promise<void>;
};
export async function finishPhotoChange(
  change: PhotoChange,
  gateway: PhotoGateway,
  readBytes: () => Promise<Uint8Array>,
  assertCurrent: () => void,
) {
  const result = await finishVersionedPhotoChange(
    change,
    {
      read: async () => {
        const value = await gateway.read();
        return value && { path: value.avatar_path, revision: value.avatar_revision };
      },
      upload: (path, bytes) => gateway.upload(path, bytes),
      link: (path, expectedPath, expectedRevision) =>
        gateway.link(path, expectedPath, expectedRevision),
    },
    readBytes,
    assertCurrent,
    profilePhotoLayout.copy,
  );
  return {
    cleanupPending: result.cleanupPending,
    avatarPath: result.path,
    avatarRevision: result.revision,
  };
}
```

- [ ] **Step 4: Run the checks**

Run: `cd mobile && npm run check`
Expected: PASS. All existing `profilePhotoStore.test.ts` cases pass unmodified, plus the 4 new cover tests: 144 tests in total.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/domain/covers.ts mobile/src/services/coverChange.test.ts mobile/src/services/profilePhotoStore.ts mobile/package.json
git commit -m "Generalize the photo change journal so covers reuse it

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Cover services, signed-link cache and plan fields

**Files:**
- Create: `mobile/src/services/signedUrlCache.ts`, `mobile/src/services/signedUrlCache.test.ts`, `mobile/src/services/planCovers.ts`
- Modify:
  - `mobile/src/services/photo.ts`: give `chooseNormalizedPhoto` a `maxDimension` parameter.
  - `mobile/src/services/profile.ts`: export `bounded` and `capturedProfileClient`.
  - `mobile/src/domain/plans.ts`: add optional cover fields to `Plan`.
  - `mobile/src/services/plans.ts`: add the cover columns to `planColumns`.
  - `mobile/package.json`.

**Interfaces:**
- Consumes: Task 2 `createPhotoChangeStore`, `VersionedPhotoGateway`, `coverPhotoLayout` and `COVER_BUCKET`.
- Produces:
  - `createSignedUrlCache(sign, { ttlMs?, now? }) → { get(path): Promise<string>; peek(path): string | null; clear(): void }`
  - `planCoverStore`
  - `signedCovers` (a cache with a 240 s TTL over 300 s links)
  - `coverGateway(ownerId, planId): VersionedPhotoGateway`
  - `chooseNormalizedPhoto(maxDimension = 1024)`
  - `Plan.cover_path?: string | null` and `Plan.cover_revision?: number`

- [ ] **Step 1: Write the failing tests**

`mobile/src/services/signedUrlCache.test.ts`:
```ts
import test from "node:test";
import assert from "node:assert/strict";
import { createSignedUrlCache } from "./signedUrlCache.ts";

test("signed links are reused until the cache window ends, then signed again", async () => {
  let now = 0;
  let calls = 0;
  const cache = createSignedUrlCache(async (path) => `${path}?v=${++calls}`, {
    ttlMs: 1000,
    now: () => now,
  });
  assert.equal(await cache.get("a"), "a?v=1");
  assert.equal(await cache.get("a"), "a?v=1");
  assert.equal(cache.peek("a"), "a?v=1");
  now = 1001;
  assert.equal(cache.peek("a"), null);
  assert.equal(await cache.get("a"), "a?v=2");
});

test("concurrent requests for the same cover share one signing call", async () => {
  let calls = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const cache = createSignedUrlCache(async (path) => {
    calls++;
    await gate;
    return `${path}?signed`;
  });
  const both = Promise.all([cache.get("a"), cache.get("a")]);
  release();
  assert.deepEqual(await both, ["a?signed", "a?signed"]);
  assert.equal(calls, 1);
});

test("a failed signing is not cached and can be retried", async () => {
  let fail = true;
  const cache = createSignedUrlCache(async (path) => {
    if (fail) throw Error("offline");
    return `${path}?ok`;
  });
  await assert.rejects(cache.get("a"), /offline/);
  fail = false;
  assert.equal(await cache.get("a"), "a?ok");
});
```
Append ` && node --import tsx src/services/signedUrlCache.test.ts` to the `test` script.

- [ ] **Step 2: Run to verify it fails**

Run: `cd mobile && node --import tsx src/services/signedUrlCache.test.ts`
Expected: FAIL with `Cannot find module`.

- [ ] **Step 3: Implement**

`mobile/src/services/signedUrlCache.ts`:
```ts
/** Short-lived signed links, reused until shortly before they expire. Failures are never cached. */
export function createSignedUrlCache(
  sign: (path: string) => Promise<string>,
  options: { ttlMs?: number; now?: () => number } = {},
) {
  const ttl = options.ttlMs ?? 240_000;
  const now = options.now ?? Date.now;
  const entries = new Map<string, { url: string; expires: number }>();
  const inflight = new Map<string, Promise<string>>();
  return {
    get(path: string): Promise<string> {
      const hit = entries.get(path);
      if (hit && hit.expires > now()) return Promise.resolve(hit.url);
      const running = inflight.get(path);
      if (running) return running;
      const request = sign(path)
        .then((url) => {
          entries.set(path, { url, expires: now() + ttl });
          return url;
        })
        .finally(() => inflight.delete(path));
      inflight.set(path, request);
      return request;
    },
    peek(path: string): string | null {
      const hit = entries.get(path);
      return hit && hit.expires > now() ? hit.url : null;
    },
    clear() {
      entries.clear();
    },
  };
}
```

`mobile/src/services/photo.ts`: change the signature to `export async function chooseNormalizedPhoto(maxDimension = 1024): Promise<{ … } | null>`, keeping the existing return type text. Inside, replace every `1024` literal in the function with `maxDimension`: the two `Math.min(…, 1024)` calls in the resize, and both sides of the `image.width > 1024 || image.height > 1024` check. The thrown message text stays the same.

`mobile/src/services/profile.ts`: change `async function capturedProfileClient` to `export async function capturedProfileClient`, and `async function bounded` to `export async function bounded`. There are no other changes.

`mobile/src/domain/plans.ts`: in the `Plan` type, after `time_zone?: string;`, add:
```ts
  /** CE2 cover photo; absent on preview plans and on plans loaded before CE2. */
  cover_path?: string | null;
  cover_revision?: number;
```

`mobile/src/services/plans.ts`: set `planColumns` to
`"id,activity_id,title,description,categories,starts_at,time_zone,place_label,note,status,version,owner_id,cover_path,cover_revision"`.

`mobile/src/services/planCovers.ts`:
```ts
import { Platform } from "react-native";
import { storage, supabase } from "./supabase";
import { withDeadline } from "./plans";
import { bounded, capturedProfileClient } from "./profile";
import {
  createPhotoChangeStore,
  type VersionedPhotoGateway,
} from "./profilePhotoStore";
import { fromBase64, toBase64, MAX_PHOTO_BYTES } from "./photo";
import { createSignedUrlCache } from "./signedUrlCache";
import { COVER_BUCKET, coverPhotoLayout } from "../domain/covers";

async function coverFile(scope: string) {
  if (!coverPhotoLayout.validScope(scope)) throw Error("Invalid cover owner.");
  const { File, Paths } = await import("expo-file-system");
  return new File(Paths.document, `resbite-cover-${scope.replace("/", "-")}.jpg`);
}
const webKey = (scope: string) => `resbite.cover-bytes.${scope.replace("/", ".")}`;

/** Device journal for unconfirmed cover changes, one per owner and plan. */
export const planCoverStore = createPhotoChangeStore(
  storage,
  {
    async write(scope, bytes) {
      if (bytes.byteLength > MAX_PHOTO_BYTES) throw Error("Cover photo is too large.");
      if (Platform.OS === "web") sessionStorage.setItem(webKey(scope), toBase64(bytes));
      else (await coverFile(scope)).write(bytes);
    },
    async read(scope) {
      if (Platform.OS === "web") {
        const raw = sessionStorage.getItem(webKey(scope));
        if (!raw) throw Error("Prepared cover is unavailable. Keep the saved cover and choose again.");
        return fromBase64(raw);
      }
      return (await coverFile(scope)).bytes();
    },
    async clear(scope) {
      if (Platform.OS === "web") sessionStorage.removeItem(webKey(scope));
      else {
        const file = await coverFile(scope);
        if (file.exists) file.delete();
      }
    },
  },
  coverPhotoLayout,
);

/** 300-second signed links, reused for 240 seconds. */
export const signedCovers = createSignedUrlCache(async (path) => {
  const { data, error } = await bounded(
    supabase.storage.from(COVER_BUCKET).createSignedUrl(path, 300),
  );
  if (error) throw error;
  return data.signedUrl;
});

/** Cover reads and writes bound to the organizer's captured session. */
export function coverGateway(ownerId: string, planId: string): VersionedPhotoGateway {
  let captured: ReturnType<typeof capturedProfileClient> | undefined;
  const client = () => (captured ??= capturedProfileClient(ownerId));
  return {
    async read() {
      const bound = await client();
      const { data, error } = await withDeadline((signal) =>
        bound
          .from("plans")
          .select("cover_path,cover_revision")
          .eq("id", planId)
          .abortSignal(signal)
          .maybeSingle(),
      );
      if (error) throw error;
      return data ? { path: data.cover_path, revision: data.cover_revision } : null;
    },
    async upload(path, bytes) {
      if (!path.startsWith(`${ownerId}/${planId}/`) || bytes.byteLength > MAX_PHOTO_BYTES)
        throw Error("Invalid prepared cover.");
      const bound = await client();
      const { error } = await bounded(
        bound.storage.from(COVER_BUCKET).upload(
          path,
          bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
          { contentType: "image/jpeg", upsert: true, cacheControl: "60" },
        ),
      );
      if (error) throw error;
    },
    async link(path, expectedPath, expectedRevision) {
      const bound = await client();
      const { error } = await withDeadline((signal) =>
        bound
          .rpc("set_plan_cover_if_current", {
            p_plan: planId,
            p_path: path,
            p_expected_path: expectedPath,
            p_expected_revision: expectedRevision,
          })
          .abortSignal(signal),
      );
      if (error) throw error;
    },
  };
}
```

- [ ] **Step 4: Run the checks**

Run: `cd mobile && npm run check`
Expected: PASS with 147 tests and a clean typecheck. The existing profile tests for `chooseNormalizedPhoto` still use the 1024 default.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/services mobile/src/domain/plans.ts mobile/package.json
git commit -m "Add cover storage services and a signed-link cache

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Covers in event pictures everywhere

**Files:**
- Create: `mobile/src/state/useCoverUri.ts`
- Modify: `mobile/src/domain/events.ts` (`EventPicture`, `eventPicture`), `mobile/src/domain/events.test.ts`, `mobile/src/design/categories.tsx` (`EventPictureView`)

**Interfaces:**
- Consumes: Task 3 `signedCovers`, and the optional `Plan.cover_path`.
- Produces:
  - `EventPicture` gains `{ kind: "cover"; path: string; fallback: EventPicture without "cover" }`.
  - `eventPicture(plan: { activity_id: string | null; categories?: readonly CategoryKey[]; cover_path?: string | null })`.
  - `useCoverUri(path: string | null): string | null`.

- [ ] **Step 1: Write the failing test**

Append to `mobile/src/domain/events.test.ts`:
```ts
test("a cover is the first choice, with the idea art or category placeholder as its fallback", () => {
  assert.deepEqual(
    eventPicture({ activity_id: "painting", categories: ["creative"], cover_path: "o/p/c.jpg" }),
    { kind: "cover", path: "o/p/c.jpg", fallback: { kind: "artwork", key: "painting" } },
  );
  assert.deepEqual(
    eventPicture({ activity_id: null, categories: ["natural"], cover_path: null }),
    { kind: "placeholder", category: "natural" },
  );
  // Plans loaded without categories (e.g. a database rollback) still get a picture.
  assert.deepEqual(eventPicture({ activity_id: null }), { kind: "placeholder", category: "community" });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd mobile && node --import tsx src/domain/events.test.ts`
Expected: FAIL. The result has no `cover` kind, and the call without `categories` fails typecheck or throws.

- [ ] **Step 3: Implement**

In `mobile/src/domain/events.ts`, replace the `EventPicture` type and `eventPicture` with:
```ts
type BasicPicture =
  | { kind: "artwork"; key: string }
  | { kind: "placeholder"; category: CategoryKey };
export type EventPicture =
  | BasicPicture
  | { kind: "cover"; path: string; fallback: BasicPicture };

/** Cover photo first (CE2), then the idea's bundled artwork, else the primary category. */
export function eventPicture(plan: {
  activity_id: string | null;
  categories?: readonly CategoryKey[];
  cover_path?: string | null;
}): EventPicture {
  const basic: BasicPicture =
    plan.activity_id && (artworkKeys as readonly string[]).includes(plan.activity_id)
      ? { kind: "artwork", key: plan.activity_id }
      : { kind: "placeholder", category: plan.categories?.[0] ?? "community" };
  return plan.cover_path ? { kind: "cover", path: plan.cover_path, fallback: basic } : basic;
}
```

`mobile/src/state/useCoverUri.ts`:
```ts
import { useEffect, useState } from "react";
import { signedCovers } from "../services/planCovers";

/** Preview covers are in-memory data URIs; stored covers use cached short-lived signed links. */
export function useCoverUri(path: string | null): string | null {
  const inline = path?.startsWith("data:image/") ? path : null;
  const [signed, setSigned] = useState<{ path: string; uri: string } | null>(() => {
    const cached = path && !inline ? signedCovers.peek(path) : null;
    return cached && path ? { path, uri: cached } : null;
  });
  useEffect(() => {
    if (!path || inline) return;
    let active = true;
    signedCovers.get(path).then(
      (uri) => {
        if (active) setSigned({ path, uri });
      },
      () => {
        if (active) setSigned(null);
      },
    );
    return () => {
      active = false;
    };
  }, [path, inline]);
  return inline ?? (signed && signed.path === path ? signed.uri : null);
}
```

In `mobile/src/design/categories.tsx`:
- Import `useCoverUri` from `"../state/useCoverUri"`.
- At the start of `EventPictureView`'s body, add:
```tsx
  if (picture.kind === "cover") return <CoverThumb picture={picture} size={size} />;
```
- Add this component below `EventPictureView`:
```tsx
/** A cover thumbnail; until its signed link loads, or if it fails, the fallback picture shows. */
function CoverThumb({
  picture,
  size,
}: {
  picture: Extract<EventPicture, { kind: "cover" }>;
  size: number;
}) {
  const uri = useCoverUri(picture.path);
  if (!uri) return <EventPictureView picture={picture.fallback} size={size} />;
  return (
    <Image
      source={{ uri }}
      style={{ width: size, height: size, borderRadius: size / 4 }}
      resizeMode="cover"
      accessibilityIgnoresInvertColors
    />
  );
}
```

- [ ] **Step 4: Run the checks**

Run: `cd mobile && npm run check`
Expected: PASS with 148 tests. My resbites, the invite screen and draft cards need no edits: they already call `eventPicture(plan)`, so covers appear automatically.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/domain/events.ts mobile/src/domain/events.test.ts mobile/src/state/useCoverUri.ts mobile/src/design/categories.tsx
git commit -m "Show event covers first wherever an event appears

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Cover controls in the editor

**Files:**
- Create: `mobile/src/state/useCoverPhoto.ts`, `mobile/src/design/CoverPicker.tsx`, `mobile/scripts/verify-covers.mjs`
- Modify: `mobile/src/design/EventDetailsFields.tsx` (`cover` slot), `mobile/app/arrange.tsx`, `mobile/app/(tabs)/plans.tsx` (cover notice)

**Interfaces:**
- Consumes:
  - Task 2: `finishVersionedPhotoChange`, `PhotoChange`, `coverScope`, `coverTarget`, `coverPhotoLayout`, `COVER_MAX_DIMENSION`.
  - Task 3: `planCoverStore`, `coverGateway`, `signedCovers`, `chooseNormalizedPhoto(maxDimension)`.
  - Task 4: `eventPicture`, `EventPictureView`.
  - `useApp().captureSession` and `session`.
- Produces:
  - `useCoverPhoto({ planId, preview, previewUri?, onPreviewChange? }): CoverControls`
  - `CoverOutcome = "none" | "saved" | "pending" | "failed"`
  - `<CoverPicker cover fallback disabled? />`
  - route param `cover` on `/plans`

- [ ] **Step 1: Write the failing browser check**

`mobile/scripts/verify-covers.mjs`:
```js
// Browser QA for CE2 cover photos. Every Supabase request is intercepted; nothing is uploaded.
import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
const baseURL = process.env.RESBITE_QA_URL || "http://localhost:8081";
const browser = await chromium.launch({
  channel: process.env.RESBITE_QA_BROWSER || "chrome",
  headless: true,
});
const errors = [];
const user = {
  id: "11111111-1111-4111-8111-111111111111",
  aud: "authenticated",
  role: "authenticated",
  email: "fixture@example.invalid",
  email_confirmed_at: "2026-01-01T00:00:00Z",
  app_metadata: {},
  user_metadata: { registration_details_version: 1 },
  created_at: "2026-01-01T00:00:00Z",
};
const expiry = Math.floor(Date.now() / 1000) + 3600;
const token = [
  Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url"),
  Buffer.from(JSON.stringify({ sub: user.id, exp: expiry, role: "authenticated" })).toString("base64url"),
  "local-fixture-only",
].join(".");
const session = {
  access_token: token,
  refresh_token: "local-fixture",
  token_type: "bearer",
  expires_at: expiry,
  expires_in: 3600,
  user,
};
async function syntheticPng(page, width, height) {
  const base64 = await page.evaluate(
    ([w, h]) => {
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#e07a5f";
      ctx.fillRect(0, 0, w, h);
      return canvas.toDataURL("image/png").split(",")[1];
    },
    [width, height],
  );
  return Buffer.from(base64, "base64");
}
// Clean JPEG: no APPn/COM metadata, longest side <= 1600, at most 2 MB.
function assertCleanJpeg(bytes) {
  assert.ok(bytes.length <= 2097152);
  assert.equal(bytes[0], 255);
  assert.equal(bytes[1], 216);
  let i = 2;
  while (i < bytes.length) {
    if (bytes[i++] !== 255) continue;
    while (bytes[i] === 255) i++;
    const marker = bytes[i++];
    if (marker === 0 || (marker >= 208 && marker <= 215)) continue;
    if (marker === 217) break;
    assert.ok(!(marker >= 224 && marker <= 239) && marker !== 254, "No metadata segments uploaded");
    const length = bytes.readUInt16BE(i);
    if ([192, 193, 194].includes(marker)) {
      assert.ok(bytes.readUInt16BE(i + 3) <= 1600, "Cover height within 1600 px");
      assert.ok(bytes.readUInt16BE(i + 5) <= 1600, "Cover width within 1600 px");
    }
    i += length;
  }
}
try {
  // 1. Preview: a chosen cover stays in memory and shows on the plan card.
  const preview = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  preview.on("pageerror", (e) => errors.push(e.message));
  await preview.route("**/*.supabase.co/**", (route) => route.abort());
  await preview.goto(baseURL);
  await preview.getByText("Preview the design", { exact: true }).click();
  await preview.getByRole("tab", { name: "My resbites", exact: true }).click();
  await preview.getByRole("button", { name: "New resbite", exact: true }).click();
  await preview.getByLabel("Name", { exact: true }).fill("Cover picnic");
  await preview.getByRole("checkbox", { name: "Natural", exact: true }).click();
  await preview.getByLabel("Meeting place", { exact: true }).fill("Riverside park");
  const previewChooser = preview.waitForEvent("filechooser");
  await preview.getByRole("button", { name: "Add cover photo", exact: true }).click();
  await (await previewChooser).setFiles({
    name: "cover.png",
    mimeType: "image/png",
    buffer: await syntheticPng(preview, 3000, 1000),
  });
  await expect(preview.getByText("Preview cover stays in memory. Nothing is uploaded.", { exact: true })).toBeVisible();
  await preview.getByRole("button", { name: "Save preview plan", exact: true }).click();
  await expect(preview.getByText("Cover picnic", { exact: true })).toBeVisible();
  await expect(preview.locator('img[src^="data:image/jpeg"]').first()).toBeAttached();
  await preview.context().close();
  console.log("PASS: preview cover stays in memory and shows on the plan card.");

  // 2. Signed in: the plan saves first, the cover uploads after it, a failed attach
  // leaves a journal that Edit retries with the same path; then replace and remove.
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript((s) => {
    if (!sessionStorage.getItem("covers-seeded")) {
      sessionStorage.setItem("sb-ewcsgvhuojxdpaspwsrx-auth-token", JSON.stringify(s));
      sessionStorage.setItem("covers-seeded", "1");
    }
  }, session);
  const plans = new Map();
  const uploads = [];
  let failNextLink = true;
  let coverBytes = Buffer.alloc(0);
  await page.route("**/*.supabase.co/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    const reply = (body, status = 200) =>
      route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (path === "/auth/v1/user") return reply(user);
    if (path === "/rest/v1/rpc/account_access_status") return reply({ account_id: user.id, status: "approved" });
    if (path === "/rest/v1/profiles")
      return reply({ id: user.id, display_name: "Fixture", avatar_path: null, avatar_revision: 0 });
    if (path === "/rest/v1/activities") return reply([]);
    if (path === "/rest/v1/attendees") return reply([]);
    if (path === "/rest/v1/plans") {
      const id = url.searchParams.get("id")?.replace(/^eq\./, "");
      const rows = [...plans.values()].filter((p) => !id || p.id === id);
      return reply(req.headers().accept?.includes("object") ? (rows[0] ?? null) : rows);
    }
    if (path === "/rest/v1/rpc/create_plan_v2") {
      const b = req.postDataJSON();
      plans.set(b.p_id, {
        id: b.p_id,
        owner_id: user.id,
        activity_id: b.p_activity,
        title: b.p_title.trim(),
        description: b.p_description,
        categories: b.p_categories,
        starts_at: b.p_start,
        time_zone: b.p_zone,
        place_label: b.p_place,
        note: b.p_note,
        status: "active",
        version: 1,
        cover_path: null,
        cover_revision: 0,
      });
      return reply(b.p_id);
    }
    if (path.startsWith("/storage/v1/object/sign/plan-covers/") && req.method() === "POST")
      return reply({ signedURL: "/object/sign/plan-covers/fixture.jpg?token=fixture" });
    if (path === "/storage/v1/object/sign/plan-covers/fixture.jpg")
      return route.fulfill({ contentType: "image/jpeg", body: coverBytes });
    if (path.startsWith("/storage/v1/object/plan-covers/")) {
      const objectPath = decodeURIComponent(path.slice("/storage/v1/object/plan-covers/".length));
      const bytes = req.postDataBuffer();
      assertCleanJpeg(bytes);
      coverBytes = bytes;
      uploads.push(objectPath);
      return reply({ Key: `plan-covers/${objectPath}`, Id: "fixture" });
    }
    if (path === "/rest/v1/rpc/set_plan_cover_if_current") {
      assert.equal(req.headers().authorization, `Bearer ${token}`);
      const { p_plan, p_path, p_expected_path, p_expected_revision } = req.postDataJSON();
      const plan = plans.get(p_plan);
      if (failNextLink) {
        failNextLink = false;
        return reply({ message: "Temporary failure" }, 503);
      }
      if (plan.cover_path !== p_expected_path || plan.cover_revision !== p_expected_revision) {
        if (plan.cover_path === p_path && plan.cover_revision === p_expected_revision + 1)
          return reply({ cover_path: plan.cover_path, cover_revision: plan.cover_revision });
        return reply({ code: "40001", message: "The cover changed elsewhere" }, 409);
      }
      if (plan.cover_path !== p_path) {
        plan.cover_path = p_path;
        plan.cover_revision++;
      }
      return reply({ cover_path: plan.cover_path, cover_revision: plan.cover_revision });
    }
    return reply({ message: `Unexpected ${req.method()} ${path}` }, 400);
  });
  await page.goto(`${baseURL}/plans`);
  await page.getByRole("button", { name: "New resbite", exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill("Garden picnic");
  await page.getByRole("checkbox", { name: "Natural", exact: true }).click();
  await page.getByLabel("Meeting place", { exact: true }).fill("Riverside park");
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Add cover photo", exact: true }).click();
  await (await chooser).setFiles({ name: "wide.png", mimeType: "image/png", buffer: await syntheticPng(page, 4000, 1200) });
  await expect(page.getByText("Your cover uploads after the resbite is saved.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Save plan", exact: true }).click();
  await expect(
    page.getByText("Your resbite is saved, but its cover photo hasn’t uploaded yet. Open Edit plan to retry.", { exact: true }),
  ).toBeVisible();
  assert.equal(plans.size, 1);
  const [plan] = plans.values();
  assert.equal(uploads.length, 1);
  assert.match(uploads[0], new RegExp(`^${user.id}/${plan.id}/[0-9a-f-]+\\.jpg$`));
  assert.equal(plan.cover_path, null);
  await page.getByRole("button", { name: "Edit plan", exact: true }).click();
  await page.getByRole("button", { name: "Retry cover", exact: true }).click();
  await expect(page.getByText("Cover photo saved.", { exact: true })).toBeVisible();
  assert.equal(plan.cover_path, uploads[0]);
  assert.equal(plan.cover_revision, 1);
  assert.equal(uploads.at(-1), uploads[0], "Retry uploads to the same path");
  await page.getByRole("button", { name: "Remove cover photo", exact: true }).click();
  await expect(
    page.getByText("Cover photo removed. The previous file stays in private storage until cleanup is available.", { exact: true }),
  ).toBeVisible();
  assert.equal(plan.cover_path, null);
  assert.equal(plan.cover_revision, 2);
  const again = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Add cover photo", exact: true }).click();
  await (await again).setFiles({ name: "tall.png", mimeType: "image/png", buffer: await syntheticPng(page, 900, 3000) });
  await expect(page.getByText("Cover photo saved.", { exact: true })).toBeVisible();
  assert.equal(plan.cover_revision, 3);
  await page.getByRole("button", { name: "My resbites", exact: true }).click();
  await expect(page.locator('img[src*="/object/sign/plan-covers/fixture.jpg"]').first()).toBeAttached();
  await page.context().close();
  console.log("PASS: signed-in cover uploads after save, retries from Edit, removes and re-adds.");
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
```

Run it against Expo web: `cd mobile && node scripts/verify-covers.mjs`
Expected: FAIL waiting for the button named "Add cover photo".

- [ ] **Step 2: Implement the hook**

`mobile/src/state/useCoverPhoto.ts`:
```ts
import { useCallback, useEffect, useRef, useState } from "react";
import * as Crypto from "expo-crypto";
import { useApp } from "./AppState";
import { chooseNormalizedPhoto } from "../services/photo";
import { coverGateway, planCoverStore, signedCovers } from "../services/planCovers";
import { finishVersionedPhotoChange, type PhotoChange } from "../services/profilePhotoStore";
import { COVER_MAX_DIMENSION, coverPhotoLayout, coverScope, coverTarget } from "../domain/covers";

export type CoverOutcome = "none" | "saved" | "pending" | "failed";
export type CoverControls = {
  uri: string | null;
  pending: PhotoChange | null;
  busy: boolean;
  ready: boolean;
  message: string | null;
  choose(): Promise<void>;
  remove(): Promise<void>;
  retry(): Promise<void>;
  keep(): Promise<void>;
  commitAfterCreate(planId: string): Promise<CoverOutcome>;
};

/**
 * Cover photo for the plan editor (CE2).
 * - New resbite: a chosen cover stays on the device and uploads after the plan is created.
 * - Existing resbite: changes apply at once through the versioned cover pointer.
 * - Preview: covers stay in memory as data URIs.
 */
export function useCoverPhoto(options: {
  planId: string | null;
  preview: boolean;
  previewUri?: string | null;
  onPreviewChange?: (uri: string | null) => void;
}): CoverControls {
  const { planId, preview, onPreviewChange } = options;
  const { session, captureSession } = useApp();
  const ownerId = session?.user.id ?? null;
  const scope = !preview && ownerId && planId ? coverScope(ownerId, planId) : null;
  const [uri, setUri] = useState<string | null>(preview ? (options.previewUri ?? null) : null);
  const [pending, setPending] = useState<PhotoChange | null>(null);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(preview || !planId);
  const [message, setMessage] = useState<string | null>(null);
  const saved = useRef<{ path: string | null; revision: number }>({ path: null, revision: 0 });
  const chosen = useRef<{ bytes: Uint8Array; uri: string } | null>(null);
  const working = useRef(false);
  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );
  const guard = useCallback(() => {
    const assertSession = captureSession();
    return () => {
      assertSession();
      if (!mounted.current) throw Error("Cover change cancelled.");
    };
  }, [captureSession]);

  // Existing resbite: the server is the truth for the saved cover; a journal means a change needs confirmation.
  useEffect(() => {
    if (!scope || !ownerId || !planId) return;
    let active = true;
    setReady(false);
    setMessage(null);
    void (async () => {
      try {
        const journal = await planCoverStore.read(scope);
        const current = await coverGateway(ownerId, planId).read();
        if (!current) throw Error(coverPhotoLayout.copy.missing);
        const next = current.path ? await signedCovers.get(current.path) : null;
        if (!active) return;
        saved.current = current;
        setPending(journal);
        setUri(next);
        setReady(true);
      } catch {
        if (active) setMessage("The cover photo needs a connection. Reopen this plan to try again.");
      }
    })();
    return () => {
      active = false;
    };
  }, [scope, ownerId, planId]);

  async function run(action: (check: () => void) => Promise<void>) {
    if (working.current) return;
    let check: () => void;
    try {
      check = guard();
    } catch {
      return;
    }
    working.current = true;
    setBusy(true);
    setMessage(null);
    try {
      await action(check);
    } catch (e) {
      if (mounted.current)
        setMessage(e instanceof Error ? e.message : coverPhotoLayout.copy.unconfirmed);
    } finally {
      working.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  async function finish(change: PhotoChange, check: () => void) {
    const result = await finishVersionedPhotoChange(
      change,
      coverGateway(ownerId!, planId!),
      () => planCoverStore.bytes(scope!),
      check,
      coverPhotoLayout.copy,
    );
    check();
    saved.current = { path: result.path, revision: result.revision };
    const next = result.path ? await signedCovers.get(result.path) : null;
    check();
    await planCoverStore.clear(scope!);
    setUri(next);
    setPending(null);
    setMessage(
      (result.path ? "Cover photo saved." : "Cover photo removed.") +
        (result.cleanupPending
          ? " The previous file stays in private storage until cleanup is available."
          : ""),
    );
  }
  async function apply(target: string | null, bytes: Uint8Array | null, check: () => void) {
    const change: PhotoChange = {
      previous: saved.current.path,
      target,
      expectedRevision: saved.current.revision,
    };
    await planCoverStore.begin(scope!, change, bytes, check);
    check();
    setPending(change);
    await finish(change, check);
  }
  const choose = () =>
    run(async (check) => {
      const photo = await chooseNormalizedPhoto(COVER_MAX_DIMENSION);
      check();
      if (!photo) return;
      if (preview) {
        setUri(photo.uri);
        onPreviewChange?.(photo.uri);
        setMessage("Preview cover stays in memory. Nothing is uploaded.");
        return;
      }
      if (!planId) {
        chosen.current = photo;
        setUri(photo.uri);
        setMessage("Your cover uploads after the resbite is saved.");
        return;
      }
      await apply(coverTarget(scope!, Crypto.randomUUID()), photo.bytes, check);
    });
  const remove = () =>
    run(async (check) => {
      if (preview) {
        setUri(null);
        onPreviewChange?.(null);
        return;
      }
      if (!planId) {
        chosen.current = null;
        setUri(null);
        return;
      }
      await apply(null, null, check);
    });
  const retry = () =>
    run(async (check) => {
      if (pending) await finish(pending, check);
    });
  const keep = () =>
    run(async (check) => {
      const current = await coverGateway(ownerId!, planId!).read();
      check();
      if (!current) throw Error(coverPhotoLayout.copy.missing);
      saved.current = current;
      const next = current.path ? await signedCovers.get(current.path) : null;
      check();
      await planCoverStore.clear(scope!);
      setUri(next);
      setPending(null);
      setMessage("Keeping the saved cover. An unused uploaded file may remain until cleanup is available.");
    });
  async function commitAfterCreate(newPlanId: string): Promise<CoverOutcome> {
    const photo = chosen.current;
    if (preview || !photo || !ownerId) return "none";
    let check: () => void;
    let newScope: string;
    try {
      check = guard();
      newScope = coverScope(ownerId, newPlanId);
    } catch {
      return "failed";
    }
    const change: PhotoChange = {
      previous: null,
      target: coverTarget(newScope, Crypto.randomUUID()),
      expectedRevision: 0,
    };
    try {
      await planCoverStore.begin(newScope, change, photo.bytes, check);
    } catch {
      return "failed";
    }
    try {
      await finishVersionedPhotoChange(
        change,
        coverGateway(ownerId, newPlanId),
        () => planCoverStore.bytes(newScope),
        check,
        coverPhotoLayout.copy,
      );
      await planCoverStore.clear(newScope);
      chosen.current = null;
      return "saved";
    } catch {
      return "pending";
    }
  }
  return { uri, pending, busy, ready, message, choose, remove, retry, keep, commitAfterCreate };
}
```

- [ ] **Step 3: Implement the picker and wire the editor**

`mobile/src/design/CoverPicker.tsx`:
```tsx
import React from "react";
import { Image, StyleSheet, View } from "react-native";
import { Camera, Trash2 } from "lucide-react-native";
import { ActionGroup, ActionRow, Button, Copy, TextAction } from "./ui";
import { EventPictureView } from "./categories";
import { colors as c } from "./tokens";
import type { EventPicture } from "../domain/events";
import type { CoverControls } from "../state/useCoverPhoto";

/** Cover photo controls at the top of "What are we doing?" (CE2). */
export function CoverPicker({
  cover,
  fallback,
  disabled,
}: {
  cover: CoverControls;
  fallback: EventPicture;
  disabled?: boolean;
}) {
  const blocked = Boolean(disabled) || cover.busy || !cover.ready;
  return (
    <View style={styles.wrap}>
      {cover.uri ? (
        <Image
          source={{ uri: cover.uri }}
          style={styles.cover}
          resizeMode="cover"
          accessibilityLabel="Cover photo"
          accessibilityIgnoresInvertColors
        />
      ) : (
        <EventPictureView picture={fallback} size={96} />
      )}
      {cover.pending ? (
        <>
          <Copy>A cover change needs confirmation. Retry checks the saved cover before changing anything.</Copy>
          <Button title="Keep saved cover" secondary onPress={() => void cover.keep()} disabled={blocked} />
          <Button title="Retry cover" onPress={() => void cover.retry()} disabled={blocked} loading={cover.busy} />
        </>
      ) : (
        <>
          <ActionGroup>
            <ActionRow
              icon={Camera}
              tone="rose"
              title={cover.uri ? "Change cover photo" : "Add cover photo"}
              onPress={() => void cover.choose()}
              disabled={blocked}
              loading={cover.busy}
            />
          </ActionGroup>
          {!!cover.uri && (
            <TextAction
              icon={Trash2}
              destructive
              title="Remove cover photo"
              onPress={() => void cover.remove()}
              disabled={blocked}
            />
          )}
        </>
      )}
      <Copy style={styles.hint}>Only add photos you’re comfortable sharing with the people you invite.</Copy>
      {!!cover.message && (
        <Copy style={styles.hint} accessibilityLiveRegion="polite">
          {cover.message}
        </Copy>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  cover: { width: "100%", height: 160, borderRadius: 18 },
  hint: { fontSize: 12, color: c.muted },
});
```

`mobile/src/design/EventDetailsFields.tsx`:
- Add the prop `cover?: React.ReactNode` to the component's props and destructure it.
- Render `{cover}` directly after the heading `View` (the one containing `Sparkles` and "What are we doing?"), before the `sourceTitle` tag.

`mobile/app/arrange.tsx`:
1. Add imports:
```ts
import { CoverPicker } from "../src/design/CoverPicker";
import { useCoverPhoto, type CoverOutcome } from "../src/state/useCoverPhoto";
```
Also add `eventPicture` to the existing `../src/domain/events` import if it is not already there.
2. After the `const needsPrefill = useRef(false);` line, add:
```ts
  const coverOutcome = useRef<CoverOutcome>("none");
  const cover = useCoverPhoto({
    planId: planId ?? null,
    preview,
    previewUri: preview && planId ? (localPlans.find((p) => p.id === planId)?.cover_path ?? null) : null,
    onPreviewChange: (uri) => {
      if (planId)
        setLocalPlans((all) => all.map((p) => (p.id === planId ? { ...p, cover_path: uri } : p)));
    },
  });
```
3. In the effect that calls `router.dismissTo({ pathname: "/plans", params: { … } })`, add `cover: coverOutcome.current,` to `params`.
4. In `save()`:
   - In the preview create branch, add `cover_path: cover.uri,` to the `newPlan` object.
   - Directly after the line `else await writePlan(planGateway, write);`, add:
```ts
      if (!preview && !original) coverOutcome.current = await cover.commitAfterCreate(write.id);
```
5. In the JSX, pass a `cover` prop to `<EventDetailsFields … />`:
```tsx
            cover={
              <CoverPicker
                cover={cover}
                disabled={locked}
                fallback={eventPicture({ activity_id: sourceId, categories: fields.categories })}
              />
            }
```

`mobile/app/(tabs)/plans.tsx`:
- Change `const { created, updated } = useLocalSearchParams(),` to `const { created, updated, cover } = useLocalSearchParams(),`.
- Directly after the saved-banner block (`{(created === "1" || updated === "1") && ( … )}`), add:
```tsx
        {(cover === "pending" || cover === "failed") && (
          <Copy style={{ color: c.error }}>
            {cover === "pending"
              ? "Your resbite is saved, but its cover photo hasn’t uploaded yet. Open Edit plan to retry."
              : "Your resbite is saved, but its cover photo couldn’t be prepared. Open Edit plan to add it again."}
          </Copy>
        )}
```
- In `cancel()`, change `router.setParams({ created: "0", updated: "0" })` to `router.setParams({ created: "0", updated: "0", cover: "none" })`.

- [ ] **Step 4: Run the checks**

Run: `cd mobile && npm run check`
Expected: PASS with 148 tests and a clean typecheck.

Restart Expo web with `--clear`, then run `node scripts/verify-covers.mjs && node scripts/verify-planning.mjs && node scripts/verify-profile.mjs`.
Expected:
- both `verify-covers` PASS lines;
- every `verify-planning` PASS line;
- `verify-profile` still passes, proving profile photos are unchanged.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/state/useCoverPhoto.ts mobile/src/design/CoverPicker.tsx mobile/src/design/EventDetailsFields.tsx mobile/app/arrange.tsx "mobile/app/(tabs)/plans.tsx" mobile/scripts/verify-covers.mjs
git commit -m "Add, replace and remove event covers from the editor

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Full local verification

**Files:** none expected. Report failures; do not fix them in this task.

- [ ] **Step 1:** Run `cd mobile && npm run check`. Expected: 148 tests passing, 0 failing.
- [ ] **Step 2:** From the repository root, run `node --experimental-transform-types --test supabase/functions/_shared/*.test.ts`. Expected: 51/51.
- [ ] **Step 3:** Run `./scripts/test-database.sh && ./scripts/test-database.sh --hosted-baseline 20261007200000_plan_covers.sql`. Expected: all PASS in both modes.
- [ ] **Step 4:** With Expo web running (`--clear`), run every browser script from `mobile/`:
```bash
for s in verify-covers verify-planning verify-catalogue verify-people verify-invitations verify-rsvp verify-auth verify-account verify-profile verify-session verify-notifications verify-registration verify-signup-callback verify-confirmation verify-deletion verify-emails review-ui; do
  echo "== $s"; node scripts/$s.mjs || echo "FAILED: $s"
done
```
Expected: every script prints its PASS lines and there are no `FAILED:` lines.
- [ ] **Step 5:** Run `cd mobile && npx expo export --platform ios --output-dir dist-ios`. Expected: the export succeeds.
- [ ] **Step 6:** Run `git diff --check main...HEAD && git status --short`. Expected: clean, apart from the user's untracked `.agents/`, `.mcp.json` and `skills-lock.json`.

---

### Task 7: Hosted rollout and iPhone acceptance (controller with owner gate)

**Files:**
- Create: `qa/custom-events-ce2-2026-10-07/README.md`, `hosted-before.json`, `hosted-after.json`
- Modify: `supabase/tests/hosted-baseline/migrations.txt`

- [ ] **Step 1: Read-only pre-checks.** Run `list_migrations`, then:
```sql
select json_build_object(
 'captured_at', now(), 'current_user', current_user,
 'plans', (select count(*) from public.plans),
 'plan_cover_columns', (select json_agg(column_name) from information_schema.columns where table_schema='public' and table_name='plans' and column_name like 'cover%'),
 'bucket', (select json_agg(id) from storage.buckets where id='plan-covers'),
 'cover_policies', (select json_agg(policyname) from pg_policies where schemaname='storage' and tablename='objects' and policyname like 'resbite_cover%'),
 'plans_owner', (select pg_get_userbyid(relowner) from pg_class where oid='public.plans'::regclass),
 'roster_enabled', (select count(*) from private.tester_roster where enabled)
) as before;
```
Also run `get_advisors` for security and performance. Save the results to `hosted-before.json`.
Expected:
- six migrations, the last one `custom_events`;
- no cover columns, bucket or policies;
- `plans` owned by `postgres`;
- one enabled roster entry.

- [ ] **Step 2: STOP and ask the owner** for explicit approval to apply only `20261007200000_plan_covers`. Summarize what it adds:
  - cover columns and a revision trigger;
  - a private `plan-covers` bucket with upload and read policies;
  - the `set_plan_cover_if_current` function;
  - cover detachment on deletion.
- [ ] **Step 3:** Apply it with `apply_migration`, named `plan_covers`, using the exact file contents.
- [ ] **Step 4: Verify the after-state.** Run `list_migrations`. Then query and record:
  - the bucket row (`public=false`, `file_size_limit=2097152`, `allowed_mime_types={image/jpeg}`);
  - the three `resbite_cover_*` policies;
  - `cover_path`/`cover_revision` columns;
  - `has_function_privilege` for anon, authenticated and service_role on `public.set_plan_cover_if_current(uuid,text,text,bigint)`. Expect false, true, false.
  - trigger `plans_track_cover_revision`;
  - `pg_get_functiondef('private.redact_deleting_owner_plan()'::regprocedure)` containing `cover_path := null`.

  Run the advisors again and expect no new WARN or ERROR. Save everything to `hosted-after.json`.
- [ ] **Step 5:** Append `20261007200000_plan_covers.sql   <hosted version>` to `supabase/tests/hosted-baseline/migrations.txt`. Run `./scripts/test-database.sh --hosted-baseline`; expect all PASS.
- [ ] **Step 6: Deliver and accept.** Start Metro with `cd mobile && npx expo start --lan --port 8081 --clear`. Ask the owner to reopen the app and run the spec's **CE2 acceptance** checks:
  1. Add a cover while creating an event; it shows in My resbites and in the editor.
  2. Replace and remove a cover.
  3. Cancelling the picker changes nothing.
  4. Offline, cover actions are unavailable and saving the event still behaves as before.

  Record the replies verbatim in `README.md`. That README also carries the approval, before/after summary and rollback notes. The rollback, valid only while no cover is attached:
  - drop the three policies;
  - delete the bucket row, if it is empty;
  - drop the function, the trigger and the columns;
  - restore `redact_deleting_owner_plan` without the cover line.
- [ ] **Step 7:** Commit `qa/custom-events-ce2-2026-10-07` and `migrations.txt` with the message "Record CE2 hosted rollout and iPhone acceptance".

---

### Task 8: Documentation

**Files:** `docs/implementation-status.md`, `docs/development-handoff-2026-10-07.md`, `supabase/README.md`, `docs/milestones/2026-09-23-expanded-private-beta.md`

- [ ] **Step 1:** Append a dated `## Custom events CE2 — <acceptance date>` entry to `docs/implementation-status.md` covering:
  - what shipped: covers, the picker, retry, signed links and deletion detach;
  - the hosted migration and version;
  - the verification counts from Task 6;
  - the owner's acceptance replies, with a link to the QA record;
  - what remains:
    - cover cleanup in the cleanup and deletion workers (on the deletion checklist);
    - invitee viewing, verified in B1 with a second tester;
    - then the remaining B0 work and B1.
- [ ] **Step 2:** In `docs/development-handoff-2026-10-07.md`, extend the existing **Update** line under the title so it also links `qa/custom-events-ce2-2026-10-07/README.md`.
- [ ] **Step 3:** In `supabase/README.md`'s custom events section, document:
  - the `plan-covers` bucket and its three policies (owner upload to an active future plan, current-cover read, no client delete);
  - `set_plan_cover_if_current`, with its arguments, return value and error codes (22023 for an invalid revision or an unavailable plan, 42501 for a non-owner or an invalid or missing path, 40001 for a stale change);
  - the `plans_track_cover_revision` trigger;
  - cover detachment in `redact_deleting_owner_plan`.
- [ ] **Step 4:** Append to the CE section of `docs/milestones/2026-09-23-expanded-private-beta.md`: "CE2 (organizer cover photos) shipped on <date>; see the implementation status."
- [ ] **Step 5:** Commit with the message "Record CE2 cover photo rollout and backend contracts".
