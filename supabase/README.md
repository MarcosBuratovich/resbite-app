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

- `save_profile(p_name)` returns own UUID.
- `create_plan(p_id, p_activity, p_start, p_zone, p_place, p_note='', p_lat=null, p_lon=null)` returns plan UUID. Client supplies a fresh random UUID as retry key. The same ID/payload retries safely; different payload requires a new ID.
- `create_invite(p_id, p_plan, p_token, p_email=null)` returns invitation UUID. Generate `p_token` with a cryptographically secure random source: 32 bytes encoded as 64 lowercase hexadecimal characters. Store/share the raw link only on the client; the server retains SHA-256 only. Retrying requires the same invitation ID/token/email. Never log raw tokens or whole invitation URLs.
- `claim_invite(p_token)` returns plan UUID. Requires profile and verified roster access. Repeated claim by the same user is safe. Optional intended email is bound to the verified Auth email; otherwise the first eligible claimant gets the slot.
- `respond(p_plan, p_response, p_version)` returns attendee version. Response is accepted, declined or withdrawn; fetch current attendee version first.
- `change_plan(p_plan, p_version, p_start, p_zone, p_place, p_note, p_cancel=false)` returns plan version. Owner only, future active plans only; cancellation is terminal. Refresh on version conflict. Edits preserve responses. Editing the place clears old coordinates until coordinate-edit support is added.
- `revoke_invite(p_id)` withdraws the invitation. If no other active invitation belongs to that attendee, removes their plan access.
- `register_device(p_token, p_platform)` registers an Expo endpoint for the current account. Registration can rebind a shared physical endpoint at login. Sign-out endpoint cleanup remains required before push is enabled.
- `set_avatar(p_path)` accepts an existing object under `<own-user-uuid>/...` in private bucket `profile-photos`, or null to clear the reference. Normalize/strip image metadata before upload; 2 MB bucket cap, JPEG/PNG/WebP. Use signed URLs, never public URLs.

## Not yet operational

Outbox records are atomic with mutations, but no worker dispatches them yet. Push credentials/delivery, account deletion and photo cleanup worker, SMTP, Google OAuth, link domain/routing, contact import/local groups and mobile clients are separate implementation steps. This migration alone does not make a complete app. Photo policies need Storage API/device integration tests; SQL lifecycle tests do not certify file uploads. Do not enable real testers until access/deletion/retention and provider setup are complete.

No realtime publication is configured: refresh plans/attendees after mutations and on foreground for the initial service integration. No notifications are treated as source of truth. No private schema should be exposed in Data API settings.
