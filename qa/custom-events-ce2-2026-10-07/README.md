# Custom events CE2 — hosted rollout and iPhone acceptance (7 October 2026)

Design: [custom events spec](../../docs/superpowers/specs/2026-10-07-custom-events-design.md). Plan: [CE2 plan](../../docs/superpowers/plans/2026-10-07-custom-events-ce2.md). Branch `custom-events-ce2`.

## Approval

The owner was asked whether the single migration 20261007200000_plan_covers could be applied to the live Resbite database, and the app update then delivered to their iPhone. The question summarized what the migration adds:

- cover columns and a revision trigger;
- a private `plan-covers` bucket with upload and read policies;
- the `set_plan_cover_if_current` function;
- cover detachment on account deletion.

The same question asked the owner to accept a narrower wording of acceptance check 4 (see below).

They answered **"Yes, apply it"** on 7 October 2026, before 17:58 UTC. That approval covered this one migration only.

## Hosted change

- **Applied:** `supabase/migrations/20261007200000_plan_covers.sql` (sha256 `4d0bc9e2d4ddabf70b31bc6e87bd795b755399e72b81ada338643a21a2ba8086`).
  - It went to project `ewcsgvhuojxdpaspwsrx` through the Supabase MCP `apply_migration` tool, under the name `plan_covers`.
  - The hosted version is **`20261007175855`**.
  - No `db push` was used.
- **Pre-checks (read-only, 17:30 UTC):**
  - 6 migrations, the last one `custom_events`;
  - 2 plans, 1 of them started from scratch;
  - no cover columns, bucket or policies;
  - every existing `storage.objects` policy is scoped to `profile-photos`;
  - `plans` is owned by `postgres`, the role the migration ran as;
  - 1 enabled roster entry.

  Record: [hosted-before.json](hosted-before.json).
- **After-state (17:59 UTC):**
  - the `plan-covers` bucket exists: private, 2 MB limit, JPEG only;
  - there are exactly three cover policies (insert, read and update, all for `authenticated`), and no delete policy;
  - `cover_path` is a nullable text column of at most 300 characters;
  - `cover_revision` is a non-null bigint, defaulting to 0 and never negative;
  - only `authenticated` can execute `set_plan_cover_if_current` (public and private), not `anon` or `service_role`;
  - the private function is a security definer, and every new function has `search_path=''`;
  - trigger `plans_track_cover_revision` is present;
  - `redact_deleting_owner_plan` now detaches the cover;
  - roster and plan counts are unchanged.

  Record: [hosted-after.json](hosted-after.json).
- **Advisors:** unchanged before and after.
  - Security has the 4 intentional INFO notices on private default-deny tables.
  - Performance has INFO unused indexes and the Auth connection strategy.
  - There is no new WARN or ERROR.
  - The `multiple_permissive_policies` WARN on `storage.objects`, which was allowed for, did not appear.
- **Baseline record:** `supabase/tests/hosted-baseline/migrations.txt` now lists `plan_covers` with its hosted version. `./scripts/test-database.sh --hosted-baseline` passes all six files, including `plan-covers.sql`.

## Local verification before rollout

These are the Task 6 results, run before the final review fixes:

- 148 mobile tests and 51 backend tests pass.
- The SQL suite passes in full mode and in hosted-baseline mode.
- All 17 intercepted browser QA scripts pass, including `verify-covers.mjs`.
- The iOS JavaScript export passes.
- `git diff --check` is clean.

The whole-branch review returned "With fixes". Both fixes were applied: F1 (`9e1da8e`, rollback safety) and F2 (`49f2410`, malformed plan id). A scoped re-review of them was clean.

## iPhone acceptance

The JavaScript update was delivered to the installed development build through Metro (`--lan`, `192.168.1.23:8081`, `--clear`). No native rebuild was needed, because `expo-image-picker`, `expo-image-manipulator` and `expo-file-system` were already in the build for profile photos.

The owner ran four acceptance checks. Check 4 uses the narrower wording the owner approved:

1. Add a cover while creating an event; it shows in My resbites and in the editor.
2. Replace and remove a cover.
3. Cancelling the picker changes nothing.
4. Offline:
   - Cover actions on an existing event are disabled when its cover can't be loaded.
   - A change made after the connection drops fails safely and offers Retry cover.
   - Choosing a cover for a new event works offline, because nothing uploads until the event is saved.

**First reply** (7 October 2026): "all good, everything works on the iPhone". It was **not recorded as acceptance**. Metro had served no bundle since its restart. At 18:05 UTC the hosted project still had 2 plans and no cover objects. The phone was most likely still on the CE1 JavaScript, which has no cover controls. The owner was asked to reload on the CE2 bundle and run the checks again.

**Second reply** (7 October 2026): **"done, reloaded and ran all four checks"**.

Corroboration (read-only):
- Metro served the iOS bundle to `192.168.1.22`, including the image picker, image manipulator and file-system chunks.
- Hosted state at 18:14 UTC:
  - 4 plans, 2 of them new; the 2 earlier plans are unchanged (no cover, revision 0);
  - new event A: revision 3, no current cover, 2 objects in its folder. This matches add → replace → remove.
  - new event B: revision 1, cover attached, 1 object in its folder. This matches a cover chosen while creating the event.
  - all 3 objects are JPEGs (largest 590,493 bytes) under `<owner uid>/<plan id>/`;
  - 1 enabled roster entry.

## Rulings recorded during CE2

- **The update policy allows renames and moves within the owner's own folders.** Uploads are upserts, so they are safe to retry. This is the same behaviour as profile photos today. An organizer can break their own cover link this way, but cannot expose anything to anyone else.
- **Signed links outlive changes.** A signed cover link (300 seconds) that a reader already holds keeps working after the cover is replaced or removed, until it expires. This is inherent to Supabase signed URLs and is the same for profile photos.
- **Offline (narrowed check 4):** see check 4 above. Detecting reachability was out of scope.
- **Cover fields are never saved in draft snapshots.** A preview cover stays in memory only.
- **Cover work blocks Save and leaving the editor** until it finishes.

## Known limitations (deferred)

These are deferred until before a wider beta:

- The editor header and draft cards don't show the cover.
- Thumbnails never re-sign their links, and an image load error shows an empty box.
- Any failure while loading the cover disables every cover action.
- A new event's cover uploads after save behind a silent spinner.
- A retry re-uploads the whole file.
- Unfinished cover changes can stay stranded on past or cancelled plans.
- Offline taps still create a pending change.
- Error text sometimes uses profile-photo wording.
- Sign-out and deletion don't yet clear pending cover changes or cached bytes.
- Replaced and removed covers stay in storage, because clients only detach them. The account-deletion worker must remove `plan-covers` objects. This is recorded in the deletion ledger.

## Rollback

Disable the feature with an app update rather than dropping data. Covers now exist on the hosted project, so a schema rollback needs every step, in this order:

1. **Serve the CE1 JavaScript to the phone first** (`main` at `08e52e2`). The CE2 editor no longer selects the cover columns (F1), so dropping them would only degrade covers. Still, the CE1 bundle is the safe baseline.
2. Detach every cover: `update public.plans set cover_path = null where cover_path is not null;`
3. Empty and delete the `plan-covers` bucket through the Storage API or the dashboard. Direct SQL deletes on storage tables may be refused.
4. Run:

```sql
drop policy resbite_cover_insert on storage.objects;
drop policy resbite_cover_update on storage.objects;
drop policy resbite_cover_read on storage.objects;
drop function public.set_plan_cover_if_current(uuid,text,text,bigint), private.set_plan_cover_if_current(uuid,text,text,bigint);
drop trigger plans_track_cover_revision on public.plans;
drop function private.track_cover_revision();
create or replace function private.redact_deleting_owner_plan() returns trigger
language plpgsql set search_path = '' as $$
begin
 if new.owner_id is not null and exists(
  select 1 from public.profiles as p where p.id = new.owner_id and p.deletion_requested_at is not null) then
  new.title := 'Resbite';
  new.description := '';
 end if;
 return new;
end $$;
alter table public.plans drop column cover_path, drop column cover_revision;
```

Restore `redact_deleting_owner_plan` before dropping the columns, because it refers to `cover_path`. Afterwards, remove the `plan_covers` line from `supabase/tests/hosted-baseline/migrations.txt`.
