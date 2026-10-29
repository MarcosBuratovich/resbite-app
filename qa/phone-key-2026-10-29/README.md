# Phone key: build and rollout runbook (29 October 2026)

- **Spec:** [Phone key design](../../docs/superpowers/specs/2026-10-29-phone-key-design.md).
- **Plans:** [plan 1, the server](../../docs/superpowers/plans/2026-10-29-phone-key-1-server.md) (this one) and [plan 2, the clients](../../docs/superpowers/plans/2026-10-29-phone-key-2-clients.md).
- **Code:** branch `pk1-server`, taken from `main` at `5e70de7`. **The migration is live on the hosted project since 29 October 2026 (hosted version `20261030130000`, applied after the owner's approval by file name and sha256; see "Applied" below). Nothing is applied to Vercel, EAS or TestFlight; the fold function is redeployed (29 October 2026); the rewrite script has not run.** Every hosted, Vercel, EAS and TestFlight step below needs the owner's approval when it is done.

## What is built

- **The key.** `private.phone_key(text)` keeps the digits of a number and folds an Argentine mobile's `549` plus ten digits to `54` plus those ten, so both spellings of one number give one key. Null or no digits give an empty string.
- **The variants.** `private.phone_variants(key)` lists the spellings a key can be stored under: the key, plus its `549` form when it is `54` and ten digits. Both functions are for nobody (every grant revoked).
- **Seven redefinitions** (`create or replace`, same signatures and grants): `send_sms_hook` and `exchange_test_code` (test-mode codes stored and found by key), and `contacts_on_resbite`, `invite_contacts`, `revoke_phone_invitation`, `check_invited_number` and `answer_phone_invitation` (invitations compared by key; a person is found under either spelling of their number). What the app gets back is what it sent: `invite_contacts` returns each number's digits as sent, and `contacts_on_resbite` each matching number's digits as sent and its key, so the current TestFlight build keeps its personal links and its On Resbite badge (its one loss is under **The current build during the window** below). Of two accounts holding both spellings of one number, `invite_contacts` takes the caller first, then the `549` form.
- **Data changes in the migration.**
  - `private.phone_invitations`: where one plan holds the same number in two spellings, the live one (not revoked) is kept; among live ones the answered one; else the newest. Every invitation is then stored by key.
  - `private.test_codes` is emptied (the codes live ten minutes).
  - `private.phone_rewrites` is new and **empty** (`user_id` referencing `auth.users(id) on delete cascade`, `old_phone`, `new_phone`, `rewritten_at`; closed to clients). It is temporary: it stays until a later migration drops it (step 9); the rollback is meaningful only while it exists.
  - **No account is rewritten by the migration.** The current build signs in with the digits an account was made with, so rewriting before the new build is out would lock its Argentine testers out.
- **The rewrite script.** `supabase/ops/rewrite-older-argentine-accounts.sql`, owner-run, not a migration. In one transaction, every older Argentine account (`auth.users.phone` of `54` and ten digits) becomes its `549` form and is recorded in `private.phone_rewrites`, unless another account already holds that `549` form: those pairs stay as they are, for the owner to settle. A pending number change and the phone identity are rewritten too. It is idempotent and re-runnable: a second run changes nothing, and a later run covers older accounts made in between.
- **The fold function.** The Edge Function `fold-phone-account` (Task 6) folds the two accounts of one person; it is deployed after Task 6 merges (step 5).

## Files and hashes

The merge fills the final values. The values here were taken on the branch at the final-fix commit and change if any of the three files changes.

| File | sha256 |
| --- | --- |
| `supabase/migrations/20261030130000_phone_key.sql` | `d7cf188f6b63d14453a2b34d6c8c85838ed196d7a06e01e3bd94c66ae0a14667` |
| `supabase/rollback/20261030130000_phone_key.rollback.sql` | `a955455f81ce12e4c24f3c37adad1f5aa369eb0188e1d049cc0b388ed32ff2c9` |
| `supabase/ops/rewrite-older-argentine-accounts.sql` | `58d23febc7ae40e3eac50f55e2c391000a9fff9d7f4d9df0928a6e04bf0e73a9` |

## Local checks

- `./scripts/test-database-docker.sh --hosted-baseline supabase/migrations/20261030130000_phone_key.sql`: the rehearsal. It applies the migration to a hosted-shaped database (with a stand-in `auth.identities`) and checks the data changes (both duplicate pairs collapsed to the right row, including a live re-invite over a revoked, answered row; no account changed); checks that the migration added exactly the two functions and the rewrite record (with its reference to `auth.users`), redefined exactly the seven functions and changed nothing else in `private` or `public`. It then runs the rewrite script as text and checks the rewrites, the untouched collision pair, the pending change and the phone identities; runs it again and checks that no row changed; then, inside a savepoint, checks that the rollback stops at its pre-check while another account holds an older number, and that otherwise it puts every account number and phone identity back and every function definition as before.
- `./scripts/test-database-docker.sh`: full mode, with `supabase/tests/phone-key.sql`.

## Rollout runbook

**Order.** The migration first, any time after approval (the current build keeps working against it); then the fold function; then plan 2's TestFlight build, built and processed by Apple before the sitting but given to no tester; then, **in one sitting, minutes apart**, plan 2's link-site deploy, making that build available to the testers, and the rewrite script (in that order), then the counts again; and, when the rollback window is declared closed, a later migration that drops the record. Every step needs the owner's approval. Never `supabase db push`: it would also push the local-only migrations.

**The current build during the window.** Until the new build, the current TestFlight build keeps working against the new functions: it keeps personal links and the On Resbite badge. Its only loss covers every 9-form invitation (saved with the 9 or dialled as 011 15 …), because each is stored by key: the ones the migration re-keyed and the new ones the old build sends after the migration. For those, the invited list shows the number instead of the saved name, and "send again" mints a new code.

**Argentine testers.** A tester who signed up on the old build typing the local form (an account of `54` and ten digits) must use the new build once the script has run: the old build would say "no account". They must never sign up again, which would make a second account. The same holds on the web page: an invitation link opened before the script has run, on the new page, would make a second account too. Tell them at the release, naming the web page as well as the app.

1. **Approve by file name and sha256.** The owner approves `20261030130000_phone_key.sql`, its rollback and `supabase/ops/rewrite-older-argentine-accounts.sql` by the hashes in the table above.
2. **Snapshot and count beforehand** (read-only; record the counts only, never a number or an id). Run with `supabase db query --linked` or in the hosted SQL editor:
   - The house snapshots into this directory: `supabase db query --linked -f supabase/ops/hosted-fingerprint.sql -o json > qa/phone-key-2026-10-29/hosted-before.json` and `supabase db query --linked -f supabase/ops/hosted-counts.sql -o json > qa/phone-key-2026-10-29/hosted-counts-before.json`. The fingerprint must match a local replay of `supabase/tests/hosted-baseline/migrations.txt` (the same file with `psql --csv`), as in the earlier runbooks.
   - The accounts:

     ```sql
     select count(*) filter (where phone ~ '^54[0-9]{10}$') as ar_without_9,
       count(*) filter (where phone ~ '^549[0-9]{10}$') as ar_with_9,
       count(*) filter (where phone ~ '^54[0-9]{10}$' and exists (select 1 from auth.users v where v.phone = '549' || substr(u.phone, 3))) as collisions,
       count(*) filter (where phone is not null) as with_phone
     from auth.users u;
     ```

     The columns are the older Argentine accounts, the accounts already on the `549` form, the pairs where both forms exist, and the accounts with a phone. The script will rewrite `ar_without_9 - collisions` accounts; step 7 takes this query again just before the script, since accounts may be made in between.
   - The invitations, and the groups the migration collapses (`private.phone_key` does not exist before the apply, so the key is written inline):

     ```sql
     select count(*) from private.phone_invitations;
     select count(*) from (select plan_id, regexp_replace(regexp_replace(phone,'[^0-9]','','g'),'^549([0-9]{10})$','54\1')
       from private.phone_invitations group by 1,2 having count(*)>1) d;
     ```

     Each group holds exactly two rows (a number has at most two spellings), so the migration deletes one row per group: the losers are as many as the groups.
   - The pre-check for the script's identity update: `select has_table_privilege('auth.identities','UPDATE');` is `true`. If it is not, stop: the script could not rewrite the phone identities.
3. **Apply the migration.**
   - `supabase db query --linked -f <the migration wrapped in begin; and commit;>`, then `supabase migration repair --status applied 20261030130000 --linked --yes`, so the hosted version is the file's own.
   - Add the line for `20261030130000_phone_key.sql` (version `20261030130000`) to `supabase/tests/hosted-baseline/migrations.txt`.
4. **Snapshot and count afterwards.**
   - The house snapshots again: `hosted-after.json` and `hosted-counts-after.json` (the same two commands). The fingerprint matches a local replay of `migrations.txt` with this file. Against `hosted-counts-before.json`: `private.phone_invitations` is down by the duplicate groups from step 2, `private.test_codes` is 0, `private.phone_rewrites` is new with 0 rows, and every other table keeps its count.
   - `select count(*) from private.phone_invitations;` is step 2's count minus the duplicate groups' losers (one per group).
   - The step 2 accounts query again gives the same counts: the migration rewrites no account.
5. **Fold function** (after Task 6 merges): `supabase functions deploy fold-phone-account --no-verify-jwt`. There is no `supabase/config.toml`, so a deploy without the flag turns JWT verification on.
6. **Plan 2.** See **Plan 2: the app and the page** below. The TestFlight build is built and processed before the sitting and given to no tester; the link-site deploy, making the build available to the testers and step 7 are one sitting, minutes apart.
7. **The rewrite script, in the same sitting as the link-site deploy and the build's release, minutes after them.** Once the new page is live and the new build is available to the testers:
   - Just before it, `hosted-counts-before-rewrite.json` (the counts command) and the step 2 accounts query, whose `ar_without_9 - collisions` is N, the expected rewrites of this run.
   - Run `supabase/ops/rewrite-older-argentine-accounts.sql` in the hosted SQL editor (it holds its own `begin;` and `commit;`; it prints counts only).
   - If an older account is made on the old build before every tester has moved, run this step again: a second run over the same accounts changes nothing.
8. **Count again** (after every run of the script).
   - The house snapshots: `hosted-after-rewrite.json` and `hosted-counts-after-rewrite.json`. The fingerprint is unchanged from step 4. Against `hosted-counts-before-rewrite.json`, `private.phone_rewrites` has grown by N (0 rows at the apply, N after the first run) and every other table keeps its count, except the tables tester activity moves between the two snapshots (sessions, codes, logs, lookups), which are not compared.
   - `select count(*) from private.phone_rewrites;` is the sum of the N of every run so far.
   - The step 2 accounts query again: `collisions` is unchanged (those pairs are not rewritten), `ar_without_9` is now equal to `collisions`, and `ar_with_9` has grown by the rewrites.
   - Each collision pair, by account id only, for the owner to settle by hand (nothing is merged automatically):

     ```sql
     select u.id, v.id from auth.users u join auth.users v on v.phone = '549' || substr(u.phone, 3)
     where u.phone ~ '^54[0-9]{10}$';
     ```

     The owner reads the ids in the SQL editor; no number is pasted anywhere (chat, this runbook, a ticket), and the ids are not recorded here.
9. **The record stays until a later migration drops it.** `private.phone_rewrites` is never dropped by hand: a drop by hand would leave hosted unlike a local replay of `migrations.txt` and break the rollback's pre-check, which reads the table. When the owner declares the rollback window closed (plan 2's clients rely on the key and no rollback will be run), a later migration is written that drops the table, with its own approval, rehearsal and runbook. The rollback is meaningful only while the table exists; once that migration is applied, this rollback is retired.

## Applied (29 October 2026)

- The owner approved `20261030130000_phone_key.sql` by file name and sha256 `d7cf188f…14667` in chat, after checking the three hashes with `sha256sum`.
- Step 2 (before): `hosted-before.json`, `hosted-counts-before.json`; accounts `ar_without_9` 2, `ar_with_9` 2, `collisions` 0, `with_phone` 4; invitations 5, duplicate groups 0, test codes 5; `has_table_privilege('auth.identities','UPDATE')` true. Hosted migration list: last applied `20261030120000`.
- Step 3: applied with `supabase db query --linked -f` (the file wrapped in `begin;`/`commit;`), then `supabase migration repair --status applied 20261030130000 --linked --yes`; the line added to `supabase/tests/hosted-baseline/migrations.txt`.
- Step 4 (after): `hosted-after.json`, `hosted-counts-after.json`. Fingerprint against before: six entries added (`private.phone_key(text)`, `private.phone_variants(text)`, `private.phone_rewrites` with its primary key, its index and its `user_id` foreign key), the seven redefinitions changed (`send_sms_hook`, `exchange_test_code`, `contacts_on_resbite`, `invite_contacts`, `revoke_phone_invitation`, `check_invited_number`, `answer_phone_invitation`), nothing removed. Counts: `private.test_codes` 5 → 0, `private.phone_rewrites` new with 0 rows, every other table unchanged; invitations 5 with 0 un-keyed rows; the accounts query unchanged (2, 2, 0, 4).
- Step 5 done on 29 October 2026: `fold-phone-account` redeployed by the owner from the repository root with `--no-verify-jwt` (version 5, 14:26 UTC; an unauthenticated call answers 401). The owner confirms in the dashboard that JWT verification is off. A first attempt from `mobile/` failed with "Entrypoint path does not exist": the deploy must run from the repository root.
- Not done yet: plan 2's build and sitting (step 6), the rewrite script (step 7), the counts (step 8).

## Plan 2: the app and the page

What the clients now do (branch `pk2-clients`, from plan 1's head):

- **The chooser.** Sign-up, sign-in and Add your number have a country button (the country sheet). The default is the device region, else United Kingdom; a number typed with `+` switches it. Phone numbers are parsed with the phone library and sent in the send form (an Argentine mobile with the 9), so both spellings of one number reach the server as one key.
- **Contacts.** Deduplicated by key. The picker shows "Numbers without a country code are read as {country}. Change" and a country button on a typed number, which a number typed with `+` switches; changing the assumed country keeps the typed numbers and their picks. Invitations go by send form, one per key.
- **The link page.** A country dropdown: the default is the invitation's calling code, or on an open link the browser's region, else United Kingdom; a `+` number switches it. The name field is "Your name" with the helper "This is how {host} and the other guests will see you." The invitation note reads "This invitation is for a +{code} number ending ••{ending}."
- **The site generator** copies the phone library's bundle (`/libphonenumber-min.js`) and writes `/countries.mjs`.

**Owner's steps, after the migration and the fold function (each needs approval).** The build is made and processed first: Apple's processing takes 30 to 60 minutes or more, and inside the sitting it would leave the new page live that long before the script, the window in which an older Argentine account meets the new page and makes a second account (the window PK-D4's sitting exists to close). The sitting itself is the link site, the build's release and the script, minutes apart.

1. **TestFlight build, before the sitting, given to no tester.** Before the upload, check in App Store Connect that automatic distribution is off for the testers' group, so the build reaches no tester when its processing ends. Then build from plan 2's head and upload through EAS as in the earlier runbook (`npx eas build --platform ios --profile production`, then `npx eas submit --platform ios --latest`), and wait until App Store Connect has finished processing the build. Nothing else changes yet: the testers keep the current build.
2. **The sitting, minutes apart, in this order.**
   1. **Link site.** Generate, from the repository root, with `node --import ./mobile/node_modules/tsx/dist/loader.mjs links/generate.mjs https://link.resbite.com QY833VTUWL com.resbite.app <dir>`, link with `npx vercel link --yes --project resbite-link --scope creamos` (delete the `.env.local` it writes), and deploy a preview. Check the preview serves both files as JavaScript, as the earlier runbook checked `/personal-flow.mjs`: `curl -sI <preview>/libphonenumber-min.js` and `curl -sI <preview>/countries.mjs` must each show a JavaScript `content-type` (the SPA fallback can answer 200 with HTML, which is a failure). Then `npx vercel deploy --prod --yes --scope creamos`. Note the previous production deployment id first, for a rollback: `npx vercel ls --scope creamos`, the newest Production row.
   2. **Release the build.** In App Store Connect, add the processed build to the testers' group, so it is available to them.
   3. **The rewrite script** (step 7 above).

   The web deploy, the release and the script are minutes apart, so no tester meets the new page or build before the script, or the old build after it.
3. **Count again** (step 8 above), after every run of the script.
4. **Tell the testers**, naming the app and the web page: Argentine testers who signed up typing the local form use the new build (and the new page) from now on, and never sign up again.

**The current build until the new build.** Its loss is the one under **The current build during the window**: for every 9-form invitation the invited list shows the number instead of the saved name, and "send again" mints a new code. (The On Resbite badge itself is kept.)

**iPhone checks** (test mode: the code is 000000; synthetic numbers only):

- An Argentine number typed four ways, on the page and in the app: with `+54 9`, with `+54` and no 9, local with the area code only (`11 1234 1234`, Argentina chosen), and the old local spelling `011 15 1234 1234` (the trunk 0 and the mobile 15, Argentina chosen). All four reach the same account and the same invitation (no second account).
- A US number with Argentina chosen: typed with `+1`, the country switches to the United States and the number is read as US.
- An invitation to a `+54` number: its page opens with **Argentina +54** preselected in the dropdown.
- A `+1` invitation (Kate, saved as `+1 305 555 0123`): its page opens with **United States +1** preselected, and `305 555 0123` typed as it is matches.
- A contact saved without a country code: the picker shows "Numbers without a country code are read as {country}. Change"; Change switches the country, and the contact is read under it.
- In the app, with the keyboard up in a number field (sign-up, and the picker's typed number), tap the country button: the country sheet and its search field sit above the keyboard, nothing hidden behind it.

## Rebase note

`cr1-database`'s `20261031120000_creating_a_resbite.sql` redefines `invite_contacts`. When that branch is rebased onto this one, its body must start from this migration's version (the comparison by key), not from `20261028120000_contact_invitations.sql`; otherwise the rebase would bring back the bare-digits comparison.

## Rollback

Run `supabase/rollback/20261030130000_phone_key.rollback.sql` in one transaction with the owner's approval: `begin; \i supabase/rollback/20261030130000_phone_key.rollback.sql; commit;`. sha256 `a955455f81ce12e4c24f3c37adad1f5aa369eb0188e1d049cc0b388ed32ff2c9`.

- **Pre-check first.** It counts the recorded older numbers that another account now holds. If there is any, it stops before any change with "N older numbers are now held by other accounts; settle them first" (the count only, never a number); the owner settles those accounts and runs it again.
- It puts the accounts rewritten by the script back (their numbers and phone identities) from `private.phone_rewrites`, drops that table, restores the seven earlier bodies (the two test-mode functions and the five invitation functions) and drops `private.phone_variants` and `private.phone_key`. Before the script has run, the record is empty and the rollback changes no account.
- **It does not restore** the re-keyed invitations (a key is the old digits for every number except an Argentine mobile saved with the 9, so after a rollback a 9-form invitation (saved with the 9 or dialled as 011 15 …) matches only the spelling without it; the collapsed duplicates are deleted), the emptied `private.test_codes`, or any `phone_change` value.
- Roll back before plan 2's clients rely on the key, or those clients and the old bodies disagree about Argentine numbers: once the script has run and the numbers are put back, the new build's Argentine testers would get "no account".
