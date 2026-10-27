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

## Custom events (CE2) — deployed 7 October 2026

`20261007200000_plan_covers.sql` is deployed (hosted version `20261007175855`) and owner-accepted on the iPhone. See the [rollout record](../qa/custom-events-ce2-2026-10-07/README.md) for approval, after-state and rollback SQL.

- `plans.cover_path` is nullable text of at most 300 characters; `plans.cover_revision` is a non-null bigint, default 0, never negative.
- Bucket `plan-covers`: private, 2,097,152 bytes, `image/jpeg` only. Paths are `<owner uid>/<plan id>/<name>.jpg`. The app sends JPEGs with the longest side at most 1600 px.
- Three policies on `storage.objects`, all for `authenticated` and all requiring `private.eligible()`, and no delete policy (clients only detach; replaced and removed objects stay in storage):
  - `resbite_cover_insert` and `resbite_cover_update` (update allows upsert retries, and also renames or moves within the owner's own folders, as for profile photos): only into the caller's own folder, for a plan they own that is active and starts in the future.
  - `resbite_cover_read`: the owner reads their own uploads; anyone else who can read the plan (plans row-level security applies) reads only the object that is its current `cover_path`.
- `set_plan_cover_if_current(p_plan, p_path, p_expected_path, p_expected_revision)` returns jsonb `{cover_path, cover_revision}`. `p_path` null removes the cover. It is `private` SECURITY DEFINER with a `public` SECURITY INVOKER façade, executable by `authenticated` only. It compares path and revision with the current plan (compare-and-swap) and attaches. An exact retry of the same path at the exact next revision is acknowledged (a lost reply); any other mismatch is stale. Error codes: `22023` invalid revision (null or negative) or plan not active or not in the future; `42501` not the owner, or the path is not the caller's own uploaded `<uid>/<plan>/<name>.jpg` object that exists in the bucket; `40001` stale change.
- `plans_track_cover_revision` (BEFORE INSERT OR UPDATE, `private.track_cover_revision`) owns the counter: it is 0 on insert, increases by one whenever `cover_path` changes, and otherwise stays as it was.
- `redact_deleting_owner_plan` (the `plans_redact_deleting_owner` trigger) now also sets `cover_path` to null while the owner is being deleted. Removing the owner's `plan-covers` objects is still the deletion worker's job; see the [recovery ledger](../qa/deletion-recovery-ledger.md).

## Phone accounts — local, not deployed (27 October 2026)

`20261027120000_phone_accounts.sql` is hosted-compatible but **not applied**; rollout steps (owner approval by file name and sha256, Auth dashboard settings, the maintainer grant, rollback) are in the [runbook](../qa/phone-accounts-2026-10-27/README.md). Rollback: `supabase/rollback/20261027120000_phone_accounts.rollback.sql`.

- **Test mode.** `private.phone_mode` holds one row; `test_mode` is true until set false, and a missing row counts as live mode. `private.test_codes` holds the latest code per number (digits only) and `private.test_mode_log` records what test mode did without the full number (`user_id` is a plain uuid, no foreign key; for an exchange it is the number's holder, else the one account adding it through `phone_change`). All three are closed to clients. Switching test mode off also empties `test_codes`, revokes every session and reviews the log and new identities (runbook step 7).
- `public.send_sms_hook(event jsonb)` is Auth's Send SMS hook (`SECURITY DEFINER`, `search_path = ''`, executable by `supabase_auth_admin` only). In test mode it stores the code Auth generated instead of sending it; with test mode off it refuses until a real sender replaces its body.
- `public.exchange_test_code(p_phone, p_code)` is executable by `anon` and `authenticated`. While test mode is on and a code was stored in the last 10 minutes, `000000` returns the stored code; anything else, and live mode, returns null.
- **Access.** `private.user_eligible` treats a confirmed email or phone as a confirmed account. A roster match needs a confirmed email; a live link grant needs only the account's confirmation. `account_access_status`, `save_registration_details` and `join_by_link` (GI2's body, only its confirmed check widened) follow the same rule.
- **Maintainer grant.** `private.beta_access` accepts `source = 'maintainer'` for phone test accounts.
- `public.note_app_session()` records that the account has opened the app (`private.app_sessions`, `private.used_app`). `public.attest_age(p_terms_version)` records the 18+ and terms tick on its own, for `authenticated`.
- **Local-only companion.** `20261022120001_gi2_local_delivery_and_deletion.sql` has the same `user_eligible` rule; its rollback changed in the header only. Roll the companion back before this migration, never the companion alone (that leaves `eligible()` roster-only).
- **Still reading `email_confirmed_at`:** notification recipients, deletion requests and intents (local-only).

## Contact invitations: local, not deployed (28 October 2026)

`20261028120000_contact_invitations.sql` is hosted-compatible but **not applied**. It must be applied straight after `20261027120000_phone_accounts.sql`, which is not applied either. Owner approval by file name and sha256; the steps and the rollback are in the [runbook](../qa/contact-invites-2026-10-28/README.md). Rollback: `supabase/rollback/20261028120000_contact_invitations.rollback.sql`.

- **Tables.** `private.phone_invitations` (one row per plan and number; `code_hash` is the sha256 of a code made on the host's phone, never the code), `private.lookup_usage` (the daily budget). Both closed to clients. Deleting an account clears `phone_invitations.user_id` and `invited_by` (the invitation stays) and removes its `lookup_usage` row. The outbox gains an `invited` kind and `beta_access` a source `invitation`.
- **Host side, `authenticated`.** `contacts_on_resbite(p_phones)` returns the numbers that belong to people on Resbite (eligible, used the app, with a profile). `invite_contacts(p_plan, p_invites)` invites in the app (people on Resbite, whose live personal link on that event then stops working) or records a personal link (everyone else; a revoked one comes back with no answer). Both are charged to one budget of 500 numbers per person per UTC day under a per-user lock; over it is `22023` "Try again tomorrow." `plan_phone_invitations(p_plan)` lists them for the host; `revoke_phone_invitation(p_plan, p_phone)` withdraws one.
- **Invitee side.** `personal_invitation_page(p_code)` and `check_invited_number(p_code, p_phone)` for `anon` and `authenticated` (the page shows only the number's last two digits; ten wrong checks per hour per invitation). `answer_phone_invitation(p_code, p_name, p_response, p_terms_version)` and `my_phone_invitation(p_code)` for `authenticated` after the phone is verified. An answer gives access only through a host who may still use the app; a repeated identical answer changes nothing.
- **Fold.** `public.fold_web_account(p_from, p_into)` is a single `SECURITY DEFINER` function executable only by `service_role` (no `private` front, no schema grant). It refuses (`22023`) when the web account used the app or owns a plan; it moves attendee rows, invitation rows and the access record, and keeps only a ban on the folded account. The Edge Function `fold-phone-account` calls it (a `22023` refusal becomes 409) and is switched off in source ([README](functions/fold-phone-account/README.md)).
- `remove_guest` is redefined to also withdraw the guest's personal invitation; the rollback restores GI1's body verbatim and removes the grants made by invitations (`invitation` grants and `invited` outbox rows).
