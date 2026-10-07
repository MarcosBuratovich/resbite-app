# Resbite backend foundation

The migration creates the private invited-tester foundation. Apply through the project migration workflow, then run `tests/foundation.sql` as postgres; the script rolls all synthetic test data back. It contains assertions rather than a pgTAP harness. It must fail on the first SQL error. Run Supabase security/performance advisors after migration.

## Tester access

Only a maintainer may add a user-approved email to `private.tester_roster`. No real address is assumed or seeded. Use a parameterized administrative query equivalent to:

```sql
insert into private.tester_roster(email) values(lower(trim(:approved_email)))
on conflict(email) do update set enabled=true;
```

Auth must separately confirm that email. An authenticated session alone grants nothing. Client-editable metadata is never used for eligibility. Disabling the roster entry or marking `profiles.deletion_requested_at` blocks shared-data access immediately, including existing tokens.

Call `save_profile` once eligible, then read published `activities`. A maintainer seeds only approved activity copy/artwork/source IDs. Read `plans`, `attendees`, and participant-safe `profiles` through RLS. Clients cannot directly mutate these tables. Every mutation uses an RPC with repeated server authorization.

## RPC contract

- `account_access_status()` returns only the caller's `{account_id,status}` with `approved`, `unconfirmed` or `access_pending`; it reads trusted Auth/roster state and never changes access.
- `save_registration_details(p_expected,p_details)` atomically replaces the caller's optional `birth_date`, `phone`, `city` and `interests` keys within Auth metadata. Confirmed non-anonymous/non-banned/non-deleting accounts may use it even while awaiting tester approval. Exactly those four keys are required; null/empty interests remove values. Send raw previously read `registration_details` (or JSON null) as `p_expected`; stale writes fail with `40001`, identical already-applied writes succeed. Unrelated metadata is preserved; credentials, profile, email and authorization metadata cannot be changed through this RPC. Returns `{account_id,registration_details}`. Read with the caller's Auth token; never send an admin key from the app.
- `save_profile(p_name)` returns own UUID.
- `create_plan(p_id, p_activity, p_start, p_zone, p_place, p_note='', p_lat=null, p_lon=null)` returns plan UUID. Client supplies a fresh random UUID as retry key. The same ID/payload retries safely; different payload requires a new ID.
- `create_invite(p_id, p_plan, p_token, p_email=null)` returns invitation UUID. Generate `p_token` with a cryptographically secure random source: 32 bytes encoded as 64 lowercase hexadecimal characters. Store/share the raw link only on the client; the server retains SHA-256 only. Retrying requires the same invitation ID/token/email. Never log raw tokens or whole invitation URLs.
- `claim_invite(p_token)` returns plan UUID. Requires profile and verified roster access. Repeated claim by the same user is safe. Optional intended email is bound to the verified Auth email; otherwise the first eligible claimant gets the slot.
- `respond(p_plan, p_response, p_version)` returns attendee version. Response is accepted, declined or withdrawn; fetch current attendee version first.
- `change_plan(p_plan, p_version, p_start, p_zone, p_place, p_note, p_cancel=false)` returns plan version. Owner only, future active plans only; cancellation is terminal. Refresh on version conflict. Edits preserve responses. Editing the place clears old coordinates until coordinate-edit support is added.
- `revoke_invite(p_id)` withdraws the invitation. If no other active invitation belongs to that attendee, removes their plan access.
- `register_device(p_token, p_platform)` registers an Expo endpoint for the current account. Registration can rebind a shared physical endpoint at login. Sign-out endpoint cleanup remains required before push is enabled.
- `set_avatar_if_current(p_path,p_expected_path,p_expected_revision)` updates the caller's photo atomically against the saved path/revision and returns `{avatar_path,avatar_revision}`. Existing uploaded objects must belong to the caller; null detaches the photo. Stale changes fail with `40001`; an exact next-revision retry succeeds. Read the baseline from `profiles.avatar_revision` and persist it before uploading. Normalize/strip image metadata before upload; 2 MB bucket cap, JPEG/PNG/WebP. Use signed URLs, never public URLs.
- `set_avatar(p_path)` remains for older clients, with every distinct path change now tracked by the revision trigger. Current clients use the guarded RPC above. Client Storage DELETE is denied; removal detaches the profile reference and leaves bytes for the separately gated service cleanup. Owners can read interrupted uploads; other authorized participants can read only the current attached image.

## Not yet operational

Outbox records are atomic with mutations. Local follow-up migrations and a hard-disabled notification worker are now implemented/tested; none of those changes have been deployed. Push credentials/delivery, account deletion/photo cleanup and owned link domain/routing remain outstanding. SMTP and three branded templates are configured. The owner accepted Google sign-in/restart and branded password-reset delivery/callback/save/sign-in; signup confirmation and the remaining lifecycle checks are still pending. Mobile contacts/local groups, invitation/RSVP recovery and private photo client integration now exist; see `../docs/implementation-status.md` for synthetic verification and pending native/real-account acceptance. This migration alone does not make a complete app. Photo policies need Storage API/device integration tests; SQL lifecycle tests do not certify file uploads. Do not enable real testers until access/deletion/retention and provider setup are complete.

No realtime publication is configured: refresh plans/attendees after mutations and on foreground for the initial service integration. No notifications are treated as source of truth. No private schema should be exposed in Data API settings.

The photo consistency migration is deployed: local `20260924150135_avatar_revision_compare_and_swap.sql`, hosted `20260924150824`. It does not activate the local deletion/cleanup migrations below. [Deployment, tests and remaining native/Storage acceptance](../qa/avatar-consistency-2026-09-24/README.md).


## Local lifecycle follow-up (not deployed)

`20260918001308_notification_delivery_preparation.sql` adds the delivery ledger and service-only worker RPCs plus authenticated scoped `unregister_device`. `20260918001316_account_deletion_lifecycle.sql` adds service-only deletion request/status/claim/photo-enumeration/completion RPCs, immediate access blocking and mutation/Storage concurrency fencing. Do not expose private schema tables or grant these worker APIs to app users.

The `delete-account` endpoint requires a fresh same-account password/OTP session; status recovery uses a separate 256-bit receipt. `cleanup-account` performs Storage API removal and Auth admin deletion. Both default off. See [deletion setup and limits](functions/delete-account/README.md), [notification setup](functions/deliver-notifications/README.md) and [remaining setup](../qa/pre-signin-readiness.md).

Run `../scripts/test-database.sh` from any directory for isolated PostgreSQL assertions; it accepts no hosted connection URL. It does not replace actual Supabase Auth/Storage HTTP tests or hosted advisors. No roster is seeded outside rolled-back/disposable fixtures.


## Hosted B0 additions — 23 September 2026

The access-status and atomic-registration-detail migrations above are deployed independently of the two still-local lifecycle migrations. Hosted ledger timestamps differ from source filenames, including the earlier foundation; reconcile intentionally and do not blindly push every pending local file. The enabled tester roster still contains only the explicitly approved owner. Native optional-details save/removal is owner-accepted; see [B0 verification](../qa/b0-account-foundation.md) for the distinction between hosted checks, intercepted fixtures and remaining native acceptance.


The additive `activity_catalogue_details` migration is also deployed (hosted version 20260923154040): nullable `duration_minutes` and bounded non-null `tips` extend approved live detail. Existing published/eligible RLS is unchanged. The owner approved and published eight original entries plus three additions in September; the live app does not substitute bundled drafts. See the [current handoff](../docs/development-handoff-2026-10-07.md) for deployment boundaries and outstanding acceptance.

## Local photo cleanup and receipt retention (not deployed)

`20260923152816_orphan_profile_photo_cleanup.sql` depends on the account-deletion lock migration. It adds service-only observation/retirement/lease/prune APIs, fences Storage writes and profile references, and narrows participant reads to the current avatar. `20260923152943_deletion_receipt_retention.sql` depends on both lifecycle and photo cleanup; it removes old completed receipts only after all referenced data and cleanup proof dependencies are gone. The photo worker is source-hard-disabled; receipt purge requires separate server flags/secret. Neither has a schedule.

Review [photo cleanup readiness](../qa/photo-cleanup-readiness.md), [retention and restore proposal](../qa/b0-retention-proposal.md) and [receipt worker setup](functions/purge-deletion-receipts/README.md) before deployment. Owner policy approval, isolated real Auth/Storage race tests, protected deletion-ledger recovery and operational monitoring remain prerequisites. Do not deploy all local migrations implicitly when applying another additive change.

## Custom events (CE1) — deployed 7 October 2026

`20261007150000_custom_events.sql` is deployed (hosted version `20261007154825`) and owner-accepted on the iPhone. See the [rollout record](../qa/custom-events-2026-10-07/README.md) for approval, after-state and rollback SQL.

- `create_plan_v2(p_id, p_title, p_description, p_categories, p_activity, p_start, p_zone, p_place, p_note='', p_lat=null, p_lon=null)` returns the plan UUID. `p_id` is the retry key; a changed retry fails. `p_activity` is optional and records the idea used as a template. Title and categories are always required, even when an idea is given.
- `change_plan_v2(p_plan, p_version, p_title, p_description, p_categories, p_start, p_zone, p_place, p_note, p_cancel=false)` returns the plan version. Owner only; future active plans only; cancellation is terminal.
- Both are `private` SECURITY DEFINER with a `public` SECURITY INVOKER façade, executable by `authenticated` only (revoked from `anon` and `service_role`).
- Field rules: title trimmed, 1–80 characters; description at most 1,000 characters; categories one or two distinct keys from `creative`, `intellectual`, `mindful`, `natural`, `physical`, `community`, `uplifting`, in the organizer's order. `private.valid_categories` keeps public EXECUTE because CHECK constraints call it.
- Error codes: `22023` validation or availability (past start, invalid zone, unpublished idea, plan unavailable, changed retry); `23502` missing title or categories; `23514` check constraint (title length or blank, description over 1,000 characters, invalid categories); `40001` version conflict; `42501` not the owner, or not eligible.
- `plans.title`, `description` and `categories` are NOT NULL; `plans.activity_id` is nullable.

Two triggers on `plans` replace copying function bodies:

- `plans_fill_from_activity` fills the title and categories from the idea and leaves the description empty (the column default), so the legacy `create_plan` keeps working.
- `plans_redact_deleting_owner` blanks event text (title `Resbite`, empty description) while the owner is being deleted.

`activities.categories` holds one or two keys for each idea. A published idea must have valid categories (`activities_published_categories`), so published rows cannot be inserted without them. The historical scripts `qa/catalogue-*/verify-local.py` and `publish.sql` replay migrations and then publish; they now fail against the full migration set for that reason.

Run `../scripts/test-database.sh --hosted-baseline` before applying a migration to the hosted project. It applies only the migrations listed in `tests/hosted-baseline/migrations.txt`, which is the record of which local files are on the hosted project and their hosted versions.
