# Phone key: build and rollout runbook (29 October 2026)

- **Spec:** [Phone key design](../../docs/superpowers/specs/2026-10-29-phone-key-design.md).
- **Plans:** [plan 1, the server](../../docs/superpowers/plans/2026-10-29-phone-key-1-server.md) (this one) and [plan 2, the clients](../../docs/superpowers/plans/2026-10-29-phone-key-2-clients.md).
- **Code:** branch `pk1-server`, taken from `main` at `5e70de7`. **Nothing is applied to the hosted project, Vercel, EAS or TestFlight.** Every hosted, Vercel, EAS and TestFlight step below needs the owner's approval when it is done.

## What is built

- **The key.** `private.phone_key(text)` keeps the digits of a number and folds an Argentine mobile's `549` plus ten digits to `54` plus those ten, so both spellings of one number give one key. Null or no digits give an empty string.
- **The variants.** `private.phone_variants(key)` lists the spellings a key can be stored under: the key, plus its `549` form when it is `54` and ten digits. Both functions are for nobody (every grant revoked).
- **Seven redefinitions** (`create or replace`, same signatures and grants): `send_sms_hook` and `exchange_test_code` (test-mode codes stored and found by key), and `contacts_on_resbite`, `invite_contacts`, `revoke_phone_invitation`, `check_invited_number` and `answer_phone_invitation` (invitations compared by key; a person is found under either spelling of their number).
- **Data changes.**
  - `private.phone_invitations`: where one plan holds the same number in two spellings, the answered one is kept, then the live one, then the newest; every invitation is then stored by key.
  - `private.test_codes` is emptied (the codes live ten minutes).
  - `private.phone_rewrites` is new (`user_id`, `old_phone`, `new_phone`, `rewritten_at`; closed to clients). Every older Argentine account (`auth.users.phone` of `54` and ten digits) becomes its `549` form and is logged there, unless another account already holds that `549` form: those pairs stay as they are, for the owner to settle. A pending number change and the phone identity are rewritten too.
- **The fold function.** The Edge Function `fold-phone-account` (Task 6) folds the two accounts of one person; it is deployed after Task 6 merges (step 5).

## Files and hashes

The merge fills the final values. The values here were taken on the branch at the commit that added this runbook and change if either file changes.

| File | sha256 |
| --- | --- |
| `supabase/migrations/20261030130000_phone_key.sql` | `600168b5095d28b7ff8b3d68a81191f84dad6e033b3343de280129665308a6c3` |
| `supabase/rollback/20261030130000_phone_key.rollback.sql` | `a9a4480b3812b1755234bbbb9ba7f3ac0ad4c8851549ef3a70b658a9567cbf4b` |

## Local checks

- `./scripts/test-database-docker.sh --hosted-baseline supabase/migrations/20261030130000_phone_key.sql`: the rehearsal. It applies the migration to a hosted-shaped database, checks the data changes, checks that the migration added exactly the two functions and the rewrite log, redefined exactly the seven functions and changed nothing else in `private` or `public`, then runs the rollback inside a savepoint and checks that every account number and every function definition is back as before.
- `./scripts/test-database-docker.sh`: full mode, with `supabase/tests/phone-key.sql`.

## Rollout runbook

**Order.** The migration first, then the fold function, then plan 2's link-site deploy, then the TestFlight build. Every step needs the owner's approval. Never `supabase db push`: it would also push the local-only migrations.

1. **Approve by file name and sha256.** The owner approves `20261030130000_phone_key.sql` and its rollback by the hashes in the table above.
2. **Count beforehand** (read-only; record the counts only, never a number or an id). Run in the hosted SQL editor or with `supabase db query --linked`:

   ```sql
   select count(*) filter (where phone ~ '^54[0-9]{10}$') as ar_without_9,
     count(*) filter (where phone ~ '^549[0-9]{10}$') as ar_with_9,
     count(*) filter (where phone ~ '^54[0-9]{10}$' and exists (select 1 from auth.users v where v.phone = '549' || substr(u.phone, 3))) as collisions,
     count(*) filter (where phone is not null) as with_phone
   from auth.users u;
   ```

   The columns are the older Argentine accounts, the accounts already on the `549` form, the pairs where both forms exist, and the accounts with a phone. The migration rewrites `ar_without_9 - collisions` accounts.
3. **Apply.**
   - `supabase db query --linked -f <the migration wrapped in begin; and commit;>`, then `supabase migration repair --status applied 20261030130000 --linked --yes`, so the hosted version is the file's own.
   - Add the line for `20261030130000_phone_key.sql` (version `20261030130000`) to `supabase/tests/hosted-baseline/migrations.txt`.
4. **Count afterwards:**
   - `select count(*) from private.phone_rewrites;` equals the expected rewrites from step 2.
   - The step 2 query again: `collisions` is unchanged (those pairs are not rewritten), `ar_without_9` is now equal to `collisions`, and `ar_with_9` has grown by the rewrites. A collision pair is listed by `user_id` only, for the owner to settle by hand; nothing is merged automatically.
   - `select count(*) from private.phone_invitations;` is the count from before minus the duplicates collapsed.
5. **Fold function** (after Task 6 merges): `supabase functions deploy fold-phone-account --no-verify-jwt`. There is no `supabase/config.toml`, so a deploy without the flag turns JWT verification on.
6. **Plan 2.** The link-site deploy and then the TestFlight build, in that order, from [plan 2](../../docs/superpowers/plans/2026-10-29-phone-key-2-clients.md).

## Rebase note

`cr1-database`'s `20261031120000_creating_a_resbite.sql` redefines `invite_contacts`. When that branch is rebased onto this one, its body must start from this migration's version (the comparison by key), not from `20261028120000_contact_invitations.sql`; otherwise the rebase would bring back the bare-digits comparison.

## Rollback

Run `supabase/rollback/20261030130000_phone_key.rollback.sql` in one transaction with the owner's approval: `begin; \i supabase/rollback/20261030130000_phone_key.rollback.sql; commit;`. sha256 `a9a4480b3812b1755234bbbb9ba7f3ac0ad4c8851549ef3a70b658a9567cbf4b`.

- It puts the rewritten accounts' numbers (and their phone identities) back from `private.phone_rewrites`, drops that table, restores the seven earlier bodies and drops `private.phone_variants` and `private.phone_key`.
- **It does not restore** the re-keyed invitations (a key is the old digits for every number except an Argentine mobile saved with the 9, and the collapsed duplicates are deleted), the emptied `private.test_codes`, or any `phone_change` value.
- Roll back before plan 2's clients rely on the key, or those clients and the old bodies disagree about Argentine numbers.
