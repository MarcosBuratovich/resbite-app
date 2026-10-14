# B0 pre-B1 fixes: hosted rollout and acceptance (7–14 October 2026)

**Branch:** `b0-pre-b1-fixes`, now included in `ux-refresh`.
**Design:** the bounded design the owner approved in chat on 7 October ("yes, include the empty draft card fix too").

## What changed

1. **C1: an invitation claim notifies the organizer, not the person claiming.**
   - Migration `supabase/migrations/20261007210000_claim_notifies_owner.sql` (sha256 `0abc430fd5c26ce946a51fbfb455b800deca84f816e1f2a48c0c21ab4a6a3e50`).
   - The function body is identical to the foundation's except for the recipient.
   - Tested by `supabase/tests/claim-notification.sql`, which also pins the private function's grants, definer rights and search path.
2. **C2 and C3: cover leftovers.**
   - A per-account list of pending cover changes means sign-out and account deletion clear every pending change and its photo bytes.
   - Pending changes for events that are cancelled, already started or no longer the user's are discarded when My resbites loads.
3. **The empty draft card (a known CE1 limitation).**
   - An untouched editor no longer leaves a draft.
   - If you edit and then undo back to the starting state, the draft is removed.
   - In UX1 this logic moved into `usePlanEditor` unchanged.

## Hosted change

- **Approval.** The owner answered **"Yes, apply it"** (7 October 2026, 19:32 UTC). That covered this one migration only.
- **Applied** with the Supabase MCP `apply_migration` tool as `claim_notifies_owner` on project `ewcsgvhuojxdpaspwsrx`. The hosted version is **`20261007193235`**. No `db push` was used.
- **Before** (19:12 UTC; [hosted-before.json](hosted-before.json)):
  - the function notified the claimer;
  - definition md5 `fc0d8663f7286ca9c935a90baaff86be`;
  - 0 invitations;
  - an empty notification queue;
  - 1 enabled tester.
- **After** (19:32 UTC; [hosted-after.json](hosted-after.json)):
  - the function notifies the organizer;
  - definition md5 `e76c015ad54ce574d375fb19957d9d57`, the same as the local rehearsal;
  - owner, grants, definer rights and search path unchanged;
  - nothing else changed.
  - The advisors show no new warnings or errors.
- **Baseline map:** `supabase/tests/hosted-baseline/migrations.txt` lists the new hosted version, and `./scripts/test-database.sh --hosted-baseline` passes.

## Local verification before rollout

The final review found the branch ready to ship. Two small fixes and one re-review fix followed, giving commits `b44d726` and `d599b80`.

At those commits:
- 167 unit tests and 51 backend tests pass;
- the database tests pass in full mode and in hosted-baseline mode;
- 17 of 17 browser checks pass;
- the iOS export and the diff check pass.

UX1 later re-ran all of these on top of these fixes.

## iPhone acceptance

The owner's iPhone checks for these fixes were folded into the UX1 acceptance session (see [UX1 QA](../ux1-2026-10-07/README.md)). The checks were:
- an untouched editor leaves no draft;
- editing then undoing leaves no draft;
- a real draft is kept;
- signing out and back in works.

The owner replied **"all good, everything works on the iPhone"** (9 October) and chose **"Accept as-is"** (14 October). These behaviours stay on the phone and aren't stored on the server, so the live data can't confirm them separately. Automated browser and unit tests cover all of them.

## Rollback

- **Database.** Re-apply the foundation definition of `private.claim_invite` with `create or replace`: the body in `20260917190517_resbite_private_tester_foundation.sql`, lines 170–186, where the notification recipient is `v_uid`. This restores md5 `fc0d8663…`. It was rehearsed locally in the final review. Any queue rows already addressed to organizers are harmless while delivery is switched off.
- **App.** The changes are JavaScript only, so serving the earlier build undoes them.
