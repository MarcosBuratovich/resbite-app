# Phone key, plan 1 of 2: the database and the fold function

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One rule for "which digits identify the same phone" in every database function that stores or compares a number, the one-time rewrite of older Argentine accounts, and the fold function comparing by the same rule.

**Architecture:** A new hosted-compatible migration `20261030130000_phone_key.sql` adds `private.phone_key(text)` and `private.phone_variants(text)`, redefines the seven functions that compare numbers (test-mode hook and exchange, lookup, invite, revoke, check, answer) so that stored and compared values are keys and lookups against `auth.users.phone` use variants, re-keys the stored invitations, and rewrites Argentine accounts that lack the mobile 9. The fold function gets the same key rule in Deno. Everything is proven by the Docker harness: the plain run, the hosted-baseline rehearsal with its before/after pair, and the rollback rehearsal.

**Tech Stack:** PostgreSQL 17 (Supabase hosted), plpgsql/SQL functions in the house pattern (private definer bodies, public façades, `set search_path = ''`), the Docker SQL harness `scripts/test-database-docker.sh`, Deno (Supabase Edge Functions) with `node --test` under the tsx loader for the shared code.

**Spec:** `docs/superpowers/specs/2026-10-29-phone-key-design.md` (sections "The phone key", "Looking up accounts", "The database", "The fold function", "Rollout").

## Global Constraints

- Branch `pk1-server` from `main` at `526e1ae`. Nothing in this plan touches the hosted project, the Auth dashboard, Vercel, EAS or TestFlight; the runbook tells the owner how.
- **The key:** digits only; `549` followed by exactly ten digits becomes `54` followed by those ten digits; everything else is the digits as they are; null or no digits gives `''`.
- **The variants** of a key: the key, plus `549` + the ten digits when the key is `54` + ten digits.
- `private.phone_digits` stays as it is (the hook's shape check still uses it through the key: a key has the same shape).
- Every redefined function keeps its signature, its grants and its errors; use `create or replace function` with the exact existing signature so grants survive. New functions: `revoke all ... from public, anon, authenticated, service_role`, as `private.phone_digits` has.
- The migration is **hosted-compatible**: it depends only on the migrations in `supabase/tests/hosted-baseline/migrations.txt`. It is **not** added to that list (the owner adds it after applying). Its tests go in `supabase/tests/phone-key.sql`, listed in `supabase/tests/hosted-baseline/tests.txt`.
- The local harness's `auth.users` (`supabase/tests/local/bootstrap.sql`) has only `id, email, phone, phone_change, phone_confirmed_at, email_confirmed_at, raw_user_meta_data, is_anonymous, banned_until`; there is no `auth.identities` and no `updated_at`. Migration SQL that touches other auth columns or tables must guard on `to_regclass(...)` / `information_schema.columns` and run through `execute`, so the same file runs locally and on hosted.
- Harness commands, from the repository root: `./scripts/test-database-docker.sh` (every migration, every test, exit 0 with `PASS:` lines) and `./scripts/test-database-docker.sh --hosted-baseline supabase/migrations/20261030130000_phone_key.sql` (the hosted list, then the candidate with its before/after pair, then the baseline tests). Both must pass at the end of every task that changes SQL.
- Fold tests, from the repository root: `node --import ./mobile/node_modules/tsx/dist/loader.mjs --test supabase/functions/_shared/phone-key.test.ts supabase/functions/_shared/phone-fold.test.ts`.
- Synthetic identities only in tests (`d2…`/`e2…` uuids, `resbite-test.invalid` emails, the UK fiction range `447700900xxx` and Argentine numbers of the form `54 9 11 1234 xxxx`). No real numbers anywhere, including comments and the runbook.
- Commit messages end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

## Review Focus

1. **A key that is not a key.** `phone_variants('5491112341234')` (the 9 form handed in by mistake) must return just that value, never a 13-digit key with another 9 glued on. Pinned in Task 1.
2. **Two accounts, one person.** An Argentine account without the 9 and another with it: the rewrite must leave both alone and count the pair; the lookup by variants must then find the 9 form first for an invite (one holder, not two). Pinned in Task 4 (rehearsal) and Task 3 (lookup returns one holder).
3. **Re-keying collides with the unique index.** Two invitations of one plan, `541112341234` and `5491112341234`, collapse to one key: the losing row must be deleted before the update, else the migration fails on hosted. Pinned in Task 4's rehearsal.
4. **The hook's shape check on the key.** A number Auth sends with the 9 is stored by key (`5411…`), and `exchange_test_code` for the no-9 form must find it, and the 9 form too. Pinned in Task 2.
5. **The fold sets the dialable number.** The app account must end with the number that received the code (the web account's digits), not the app's typed form. Pinned in Task 6.

---

### Task 1: The key and its variants

**Files:**
- Create: `supabase/migrations/20261030130000_phone_key.sql` (header and section 1)
- Create: `supabase/rollback/20261030130000_phone_key.rollback.sql` (header and the drops of section 1's functions)
- Create: `supabase/tests/phone-key.sql` (section 1)
- Modify: `supabase/tests/hosted-baseline/tests.txt` (append `phone-key.sql`)

**Interfaces:**
- Produces: `private.phone_key(p text) returns text` (sql, immutable, `set search_path = ''`); `private.phone_variants(p_key text) returns text[]` (sql, immutable, `set search_path = ''`). Both revoked from `public, anon, authenticated, service_role`.

- [ ] **Step 1: Write the failing test**

`supabase/tests/phone-key.sql` starts with the house header (one comment line naming the spec; synthetic identities only) and `begin;`, and ends with `rollback;`, as `supabase/tests/phone-accounts.sql` does. Section 1:

```sql
-- 1. the key and its variants
do $$ begin
 if private.phone_key('+5491112341234')<>'541112341234' then raise exception 'AR mobile 9 not dropped'; end if;
 if private.phone_key('+541112341234')<>'541112341234' then raise exception 'AR without 9 changed'; end if;
 if private.phone_key('5491112341234')<>'541112341234' then raise exception 'Digits-only AR mobile not keyed'; end if;
 if private.phone_key('+54 9 11 1234 1234')<>'541112341234' then raise exception 'Spaces not removed'; end if;
 if private.phone_key('+5493511234567')<>'543511234567' then raise exception 'Cordoba mobile not keyed'; end if;
 if private.phone_key('+13055550123')<>'13055550123' then raise exception 'US number changed'; end if;
 if private.phone_key('+447700900834')<>'447700900834' then raise exception 'UK number changed'; end if;
 if private.phone_key('549123456789')<>'549123456789' then raise exception '549 with nine digits must stay'; end if;
 if private.phone_key(null)<>'' or private.phone_key('abc')<>'' then raise exception 'Null and letters must give the empty string'; end if;
 if private.phone_variants('541112341234')<>array['541112341234','5491112341234'] then raise exception 'AR variants wrong'; end if;
 if private.phone_variants('447700900834')<>array['447700900834'] then raise exception 'UK variants wrong'; end if;
 if private.phone_variants('5491112341234')<>array['5491112341234'] then raise exception 'A 9 form is not a key: itself only'; end if;
end $$;
-- closed to clients
set local role authenticated;
do $$ begin
 begin perform private.phone_key('1'); raise exception 'authenticated ran phone_key';
 exception when insufficient_privilege or undefined_function then null; end;
end $$;
reset role;
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `./scripts/test-database-docker.sh`
Expected: FAIL at `phone-key.sql` with `function private.phone_key(unknown) does not exist` (the harness stops at the first failing file).

- [ ] **Step 3: Write the migration header and section 1**

`supabase/migrations/20261030130000_phone_key.sql` opens with the house header (spec path, plan path and task, what it does in two lines, "Hosted-compatible: depends only on the migrations listed in supabase/tests/hosted-baseline/migrations.txt", "Rollback: supabase/rollback/20261030130000_phone_key.rollback.sql"), then section 1 with the two functions. `phone_key`: `regexp_replace(coalesce(p,''), '[^0-9]', '', 'g')`, then the `549` rule with `regexp_replace(d, '^549([0-9]{10})$', '54\1')`. `phone_variants`: `case when p_key ~ '^54[0-9]{10}$' then array[p_key, '549'||substr(p_key,3)] else array[p_key] end`.

`supabase/rollback/20261030130000_phone_key.rollback.sql` opens with the house header (what it restores, what it deletes, how to run: `begin; \i supabase/rollback/20261030130000_phone_key.rollback.sql; commit;`, "only with the owner's approval") and for now drops the two functions. Later tasks prepend their restores above the drops.

- [ ] **Step 4: Run the test to verify it passes**

Run: `./scripts/test-database-docker.sh`
Expected: `PASS: phone-key.sql`, every other `PASS:` line as before, exit 0.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261030130000_phone_key.sql supabase/rollback/20261030130000_phone_key.rollback.sql supabase/tests/phone-key.sql supabase/tests/hosted-baseline/tests.txt
git commit -m "Phone key: private.phone_key and phone_variants"
```

---

### Task 2: Test mode stores and finds codes by key

**Files:**
- Modify: `supabase/migrations/20261030130000_phone_key.sql` (section 2)
- Modify: `supabase/rollback/20261030130000_phone_key.rollback.sql` (restore the two bodies verbatim from `supabase/migrations/20261027120000_phone_accounts.sql:49-95`)
- Modify: `supabase/tests/phone-key.sql` (section 2)

**Interfaces:**
- Consumes: `private.phone_key`, `private.phone_variants` (Task 1).
- Produces: `public.send_sms_hook(event jsonb)` stores `private.test_codes.phone` as the key of the number Auth texts; `public.exchange_test_code(p_phone text, p_code text)` looks the code up by key and the account by variants. Signatures, grants and the three error replies unchanged.

- [ ] **Step 1: Write the failing test**

Section 2 of `supabase/tests/phone-key.sql`. Set-up: `update private.phone_mode set test_mode=true;` (the harness's bootstrap row), an account `d2000000-0000-4000-8000-000000000001` with `phone='541112345678'` (an older Argentine account, no 9) confirmed, and a second `…0002` with `phone='5491112349999'` confirmed. As `supabase_auth_admin` (`set local role supabase_auth_admin;`):

```sql
do $$ begin
 if public.send_sms_hook('{"user":{"id":"d2000000-0000-4000-8000-000000000001","phone":"5491112345678"},"sms":{"otp":"123456"}}') <> '{}'::jsonb then raise exception 'Hook refused an AR mobile'; end if;
end $$;
reset role;
do $$ begin
 if (select phone from private.test_codes where otp='123456')<>'541112345678' then raise exception 'Code must be stored by key'; end if;
end $$;
set local role anon;
do $$ begin
 if public.exchange_test_code('+54 11 1234 5678','000000') is distinct from '123456' then raise exception 'No-9 form must find the code'; end if;
 if public.exchange_test_code('+54 9 11 1234 5678','000000') is distinct from '123456' then raise exception '9 form must find the code'; end if;
end $$;
reset role;
do $$ begin
 if (select count(*) from private.test_mode_log where kind='exchanged' and user_id='d2000000-0000-4000-8000-000000000001')<>2 then raise exception 'The older account must be named as the holder through variants'; end if;
end $$;
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `./scripts/test-database-docker.sh`
Expected: FAIL at `phone-key.sql` with `Code must be stored by key`.

- [ ] **Step 3: Redefine the two functions in section 2**

Copy both bodies from `20261027120000_phone_accounts.sql` and change only: `v_phone text := private.phone_key(...)` in both; in `exchange_test_code`, `where phone = any(private.phone_variants(v_phone))` for the `auth.users.phone` lookup and `where phone_change = any(private.phone_variants(v_phone))` for the pending-change lookup. Keep `create or replace function` with the exact signatures so the existing grants (`supabase_auth_admin`; `anon, authenticated`) stay. In the rollback, prepend the two original bodies (verbatim) above the drops.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `./scripts/test-database-docker.sh`
Expected: `PASS: phone-accounts.sql` (unchanged UK cases) and `PASS: phone-key.sql`, exit 0.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261030130000_phone_key.sql supabase/rollback/20261030130000_phone_key.rollback.sql supabase/tests/phone-key.sql
git commit -m "Phone key: test-mode codes by key"
```

---

### Task 3: The invitation functions compare by key

**Files:**
- Modify: `supabase/migrations/20261030130000_phone_key.sql` (section 3)
- Modify: `supabase/rollback/20261030130000_phone_key.rollback.sql` (restore the five bodies verbatim from `supabase/migrations/20261028120000_contact_invitations.sql`: `contacts_on_resbite` 67-81, `invite_contacts` 88-134, `revoke_phone_invitation` 147-155, `check_invited_number` 222-237, `answer_phone_invitation` 245-316)
- Modify: `supabase/tests/phone-key.sql` (section 3)

**Interfaces:**
- Consumes: Task 1's functions.
- Produces (signatures unchanged): `private.contacts_on_resbite(p_phones text[]) returns text[]` now returns **the keys of the sent numbers** that belong to people On Resbite (sorted, distinct), not the accounts' raw digits; `private.invite_contacts(p_plan uuid, p_invites jsonb)` keys each item's phone, finds the holder by variants, tests "self" by `phone_key` of the caller's phone, stores keys and returns `{phone: <key>, kind}`; `private.revoke_phone_invitation(p_plan, p_phone)` matches by key; `private.check_invited_number(p_code, p_phone)` compares `phone_key(p_phone)`; `private.answer_phone_invitation(...)` compares `phone_key(u.phone)` with the stored key.

- [ ] **Step 1: Write the failing test**

Section 3 of `supabase/tests/phone-key.sql`. Set-up in the test's own transaction: a host `d2…0011` (phone `5491112340011`, confirmed, profile, maintainer grant, app session), a contact `d2…0012` On Resbite with the **older** form `541112340012` (confirmed, profile, maintainer grant, app session), a plan `d2100000-0000-4000-8000-000000000001` owned by the host, starting `2099-06-01`. Then, as the host (`set local role authenticated; select set_config('request.jwt.claims', '{"sub":"d2000000-0000-4000-8000-000000000011","role":"authenticated"}', true);` as the other test files do):

```sql
do $$ declare r text[]; j jsonb; begin
 r := public.contacts_on_resbite(array['+54 9 11 1234 0012','+54 11 1234 0012','+54 9 11 9999 8888']);
 if r<>array['541112340012'] then raise exception 'Lookup must return the key once, found through variants'; end if;
 j := public.invite_contacts('d2100000-0000-4000-8000-000000000001', jsonb_build_array(
  jsonb_build_object('phone','+5491112340012','country','54','code',repeat('K',22)),
  jsonb_build_object('phone','+54 11 1234 0011','country','54','code',repeat('L',22)),
  jsonb_build_object('phone','+541199998888','country','54','code',repeat('M',22))));
 if j->0->>'kind'<>'app' or j->0->>'phone'<>'541112340012' then raise exception 'Holder not found by variants, or key not returned'; end if;
 if j->1->>'kind'<>'self' then raise exception 'The host''s own number in the other form is self'; end if;
 if j->2->>'kind'<>'link' or j->2->>'phone'<>'541199998888' then raise exception 'Link invitation not keyed'; end if;
 j := public.invite_contacts('d2100000-0000-4000-8000-000000000001', jsonb_build_array(
  jsonb_build_object('phone','+54 9 11 9999 8888','country','54','code',repeat('N',22))));
 if j->0->>'kind'<>'link' then raise exception 'Inviting the 9 form again is the same link'; end if;
end $$;
reset role;
do $$ begin
 if (select count(*) from private.phone_invitations where plan_id='d2100000-0000-4000-8000-000000000001' and phone='541199998888')<>1 then raise exception 'One row per key'; end if;
 if (select count(*) from private.phone_invitations where plan_id='d2100000-0000-4000-8000-000000000001')<>1 then raise exception 'Only the link invitation is a row'; end if;
end $$;
set local role anon;
do $$ begin
 if not public.check_invited_number(repeat('N',22),'+5491199998888') then raise exception '9 form must match'; end if;
 if not public.check_invited_number(repeat('N',22),'+541199998888') then raise exception 'No-9 form must match'; end if;
 if public.check_invited_number(repeat('N',22),'+541199998889') then raise exception 'Another number matched'; end if;
end $$;
reset role;
```

Then an invitee `d2…0013` whose `auth.users.phone` is `5491199998888` (with the 9; confirmed, not anonymous) answers code `N` as themselves: `answer_phone_invitation(repeat('N',22),'Juan','accepted','2026-10')` must succeed, and `private.phone_invitations.user_id` for that row must be `d2…0013`. Finally the host revokes with the 9 form, `revoke_phone_invitation(plan,'+54 9 11 9999 8888')`, and the row's `revoked_at` is not null.

- [ ] **Step 2: Run the test to verify it fails**

Run: `./scripts/test-database-docker.sh`
Expected: FAIL at `phone-key.sql` with `Lookup must return the key once, found through variants`.

- [ ] **Step 3: Redefine the five functions in section 3**

Copy each body from `20261028120000_contact_invitations.sql` and change only the comparisons:
- `contacts_on_resbite`: build the result from the inputs: `select distinct k from (select private.phone_key(x) k from unnest(p_phones) x) s where k<>'' and exists(select 1 from auth.users u where u.phone = any(private.phone_variants(s.k)) and <the four existing conditions on u>)`, aggregated `order by k`.
- `invite_contacts`: `v_phone := private.phone_key(v_item->>'phone')`; the holder: `where phone = any(private.phone_variants(v_phone)) and phone_confirmed_at is not null` (take one row: `limit 1`, preferring the one whose phone equals `v_phone`, then the 9 form; `order by phone=v_phone desc`); the self test: `v_phone = private.phone_key((select phone from auth.users where id=v_uid))`; the revoke-on-app-invite `where ... and phone=v_phone`; the insert stores `v_phone`.
- `revoke_phone_invitation`: `phone=private.phone_key(p_phone)`.
- `check_invited_number`: `return private.phone_key(p_phone)=v_inv.phone;`
- `answer_phone_invitation`: `private.phone_key(u.phone)=v_inv.phone`.

Then grep the two live migrations for any other comparison with `auth.users.phone` or `phone_invitations.phone` (`grep -n "phone_digits(\|\.phone *=\|phone *= *v_" supabase/migrations/20261027120000_phone_accounts.sql supabase/migrations/20261028120000_contact_invitations.sql supabase/migrations/20261029120000_open_link_approval.sql supabase/migrations/20261030120000_push_delivery.sql`) and list the hits in the migration's section 3 comment: each is either redefined here or named as not a comparison (`personal_invitation_page`'s `right(phone,2)`, `plan_phone_invitations`'s read, `my_phone_invitation`'s read by `user_id`, `fold_web_account`'s `user_id` moves). In the rollback, prepend the five original bodies verbatim.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `./scripts/test-database-docker.sh`
Expected: `PASS: contact-invitations.sql` (its UK cases unchanged), `PASS: phone-key.sql`, exit 0.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261030130000_phone_key.sql supabase/rollback/20261030130000_phone_key.rollback.sql supabase/tests/phone-key.sql
git commit -m "Phone key: invitations looked up, stored and checked by key"
```

---

### Task 4: Existing rows: re-keyed invitations and older Argentine accounts

**Files:**
- Modify: `supabase/migrations/20261030130000_phone_key.sql` (section 4)
- Modify: `supabase/rollback/20261030130000_phone_key.rollback.sql` (restore accounts from `private.phone_rewrites`, then drop it)
- Create: `supabase/tests/hosted-baseline/20261030130000_phone_key.before.sql`
- Create: `supabase/tests/hosted-baseline/20261030130000_phone_key.after.sql` (sections 1–2; Task 5 adds 3–4)

**Interfaces:**
- Produces: table `private.phone_rewrites(user_id uuid primary key, old_phone text not null, new_phone text not null, rewritten_at timestamptz not null default now())`, RLS enabled, revoked from `public, anon, authenticated`; one row per rewritten account.

- [ ] **Step 1: Write the failing rehearsal**

`…phone_key.before.sql` (hosted-baseline mode only; the header says so and that `.after.sql` removes everything here) inserts pre-migration data with `e2…` uuids:
- accounts: `e2…01` phone `541112340001` (older, to rewrite); `e2…02` phone `5491112340002` (already right); `e2…03` phone `541112340003` and `e2…04` phone `5491112340003` (a colliding pair: both stay); `e2…05` phone `447700900805` (UK, untouched); `e2…06` phone `541112340006` with `phone_change='541112340066'` (both rewritten);
- a plan `e2100000-0000-4000-8000-000000000001` owned by `e2…05`, with invitations: `541112347777` (created first, `user_id` null) and `5491112347777` (created later, `user_id = e2…02`, answered) on that plan, plus `5491112348888` alone;
- a test code: `private.test_codes(phone, otp, sent_at)` `('5491112340001','111111',now())`.

`…phone_key.after.sql` section 1 asserts: `e2…01` phone is `5491112340001`; `e2…02` unchanged; `e2…03` and `e2…04` unchanged; `e2…05` unchanged; `e2…06` phone `5491112340006` and phone_change `5491112340066`; `private.phone_rewrites` has exactly the rows for `e2…01` and `e2…06` with their old and new values; the plan has exactly two invitation rows, phones `541112347777` (with `user_id = e2…02`, the answered row won) and `541112348888`; `private.test_codes` has no `e2` row (deleted). Section 2 asserts the collision count the runbook names: `select count(*) from auth.users u where u.phone ~ '^54[0-9]{10}$' and exists(select 1 from auth.users v where v.phone='549'||substr(u.phone,3))` is 1 (the pair). The file ends by deleting every `e2` row it created (the harness checks the roster is empty, and the baseline tests run after it).

- [ ] **Step 2: Run the rehearsal to verify it fails**

Run: `./scripts/test-database-docker.sh --hosted-baseline supabase/migrations/20261030130000_phone_key.sql`
Expected: FAIL in `20261030130000_phone_key.after.sql` on the first assertion (`e2…01` not rewritten).

- [ ] **Step 3: Write section 4 of the migration and the rollback's restore**

Section 4, in this order:
1. **Invitations.** Delete the losing duplicates: for every `(plan_id, private.phone_key(phone))` with more than one row, keep the first by `user_id is not null desc, revoked_at is null desc, created_at desc, id` and delete the rest (`delete ... where id in (select id from (select id, row_number() over (partition by plan_id, private.phone_key(phone) order by ...) rn from private.phone_invitations) d where rn>1)`). Then `update private.phone_invitations set phone=private.phone_key(phone) where phone<>private.phone_key(phone)`.
2. **Test codes.** `delete from private.test_codes;` (they live ten minutes).
3. **Accounts.** Create `private.phone_rewrites`. Insert one row per `auth.users` row with `phone ~ '^54[0-9]{10}$'` and no other account whose `phone = '549'||substr(phone,3)`; then `update auth.users u set phone='549'||substr(u.phone,3) from private.phone_rewrites r where r.user_id=u.id`. Then `update auth.users set phone_change='549'||substr(phone_change,3) where phone_change ~ '^54[0-9]{10}$' and not exists(select 1 from auth.users v where v.phone='549'||substr(auth.users.phone_change,3))`. Then, in a `do` block guarded by `if to_regclass('auth.identities') is not null then execute $x$ update auth.identities i set identity_data = jsonb_set(i.identity_data,'{phone}',to_jsonb(r.new_phone)) from private.phone_rewrites r where i.user_id=r.user_id and i.provider='phone' and i.identity_data->>'phone'=r.old_phone $x$; end if;` (the local harness has no identities table; hosted does).

The rollback, above the function restores: `update auth.users u set phone=r.old_phone from private.phone_rewrites r where r.user_id=u.id and u.phone=r.new_phone;` the same guarded identities update back to `old_phone`; then `drop table private.phone_rewrites;`. Its header says the re-keyed invitations are **not** put back (keys are the old digits for every number but Argentine mobiles saved with the 9; the collapsed duplicates are gone) and `phone_change` values are not restored.

- [ ] **Step 4: Run the rehearsal and the plain harness to verify they pass**

Run: `./scripts/test-database-docker.sh --hosted-baseline supabase/migrations/20261030130000_phone_key.sql` then `./scripts/test-database-docker.sh`
Expected: `PASS: 20261030130000_phone_key applies on the hosted baseline`, every baseline test `PASS … (hosted baseline)`, and the plain run exit 0.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261030130000_phone_key.sql supabase/rollback/20261030130000_phone_key.rollback.sql supabase/tests/hosted-baseline/20261030130000_phone_key.before.sql supabase/tests/hosted-baseline/20261030130000_phone_key.after.sql
git commit -m "Phone key: re-key invitations, rewrite older Argentine accounts"
```

---

### Task 5: The rehearsal's shape checks, the rollback rehearsal and the runbook

**Files:**
- Modify: `supabase/tests/hosted-baseline/20261030130000_phone_key.after.sql` (sections 3–4)
- Create: `qa/phone-key-2026-10-29/README.md`
- Modify: `supabase/README.md` (a section after "Push delivery: migration live")
- Modify: `docs/implementation-status.md` (one entry in the file's own style)

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: Write the failing shape checks**

Section 3 of the after file, in the pattern of `20261030120000_push_delivery.after.sql` ("the migration added …, redefined exactly …, changed nothing else"): a snapshot of `pg_get_functiondef` for the seven redefined functions plus the two new ones, their `proacl`, and `information_schema.role_table_grants` for `private.phone_rewrites`, compared with a baseline taken in the before file for everything else in the `private` and `public` schemas (as that pair does with `private.*_rehearsal_baseline`/`_snapshot()`); it raises if any object outside the named set changed. Section 4, the rollback rehearsal: `savepoint before_rollback;` then run the rollback file as text (`\set phone_key_rollback \`cat :'resbite_repo'/supabase/rollback/20261030130000_phone_key.rollback.sql\`` and `:phone_key_rollback`, as the push pair reads a rollback), assert `e2…01` is `541112340001` again, `e2…06` is `541112340006`, `private.phone_rewrites` is gone, the seven functions' definitions equal the baseline's and the two new functions are gone; then `rollback to savepoint before_rollback;` and the final clean-up from Task 4.

- [ ] **Step 2: Run the rehearsal to verify it fails**

Run: `./scripts/test-database-docker.sh --hosted-baseline supabase/migrations/20261030130000_phone_key.sql`
Expected: FAIL in section 3 (the baseline snapshot is not taken yet) or section 4.

- [ ] **Step 3: Complete the pair; write the runbook and the records**

Add the baseline snapshot to the before file (its own `private.phone_key_rehearsal_baseline` table, dropped by the after file). Then the runbook `qa/phone-key-2026-10-29/README.md`, in the layout of `qa/push-notifications-2026-10-30/README.md`:
- Spec, plans (this one and `2026-10-29-phone-key-2-clients.md`), branch and base, "nothing applied to hosted, Vercel, EAS or TestFlight".
- What is built (the key, the variants, the seven functions, the data changes, the fold function).
- Files and hashes: `sha256sum` of the migration and the rollback ("the merge fills the final values").
- Hosted steps, each needing the owner's approval: (1) approve by file name and sha256; (2) the count beforehand: `~/resbite-phone-check.sh`'s query (older Argentine accounts, with-9 accounts, collisions, accounts with a phone), recorded as counts only; (3) apply with `supabase db query --linked -f <the migration wrapped in begin/commit>` then `supabase migration repair --status applied 20261030130000 --linked --yes`, and add the file to `supabase/tests/hosted-baseline/migrations.txt`; (4) after: `select count(*) from private.phone_rewrites`, the collision count again (expected 0; any pair is listed by `user_id` only for the owner to settle), `select count(*) from private.phone_invitations`; (5) `supabase functions deploy fold-phone-account --no-verify-jwt` (after Task 6 merges); (6) Plan 2's link-site deploy and TestFlight build, in that order. Rollback: the file, run as one transaction, and what it does not restore. Never `supabase db push`.
- A "Rebase note": `cr1-database`'s `20261031120000_creating_a_resbite.sql` redefines `invite_contacts`; when rebased, its body must start from this migration's version.

`supabase/README.md`: a section "Phone key — not yet applied" naming the two functions, the seven redefinitions, `private.phone_rewrites`, the runbook and the rollback. `docs/implementation-status.md`: one entry in the file's style ("Phone key (29 October 2026): … Next: the owner's approvals in the runbook's order; plan 2 (clients)").

- [ ] **Step 4: Run both harness modes and check the hashes**

Run: `./scripts/test-database-docker.sh --hosted-baseline supabase/migrations/20261030130000_phone_key.sql && ./scripts/test-database-docker.sh && sha256sum supabase/migrations/20261030130000_phone_key.sql supabase/rollback/20261030130000_phone_key.rollback.sql`
Expected: both exit 0; the two hashes match the runbook's table.

- [ ] **Step 5: Commit**

```bash
git add supabase/tests/hosted-baseline/20261030130000_phone_key.before.sql supabase/tests/hosted-baseline/20261030130000_phone_key.after.sql qa/phone-key-2026-10-29/README.md supabase/README.md docs/implementation-status.md
git commit -m "Phone key: rehearsal shape checks, rollback rehearsal and runbook"
```

---

### Task 6: The fold function compares by key

**Files:**
- Create: `supabase/functions/_shared/phone-key.ts`
- Create: `supabase/functions/_shared/phone-key.test.ts`
- Modify: `supabase/functions/_shared/phone-fold.ts:36-46`
- Modify: `supabase/functions/_shared/phone-fold.test.ts`
- Modify: `supabase/functions/fold-phone-account/README.md` (one line: compares by the phone key; redeploy after `20261030130000_phone_key.sql`)

**Interfaces:**
- Produces: `export function phoneKey(input: string | null | undefined): string` in `phone-key.ts` (the same rule as `private.phone_key`; Plan 2's `mobile/src/domain/phone.ts` carries an identical function).

- [ ] **Step 1: Write the failing tests**

`phone-key.test.ts` (node:test, as the fold test): one `test("the key table")` with the nine `phone_key` cases of Task 1's section 1 as `assert.equal(phoneKey(input), key)` rows (`"+5491112341234"`, `"+541112341234"`, `"5491112341234"`, `"+54 9 11 1234 1234"`, `"+5493511234567"`, `"+13055550123"`, `"+447700900834"`, `"549123456789"`, `null`/`"abc"`). In `phone-fold.test.ts` add:

```ts
test("an older Argentine web account folds into an app that typed the 9 form, and keeps the web account's digits", async () => {
  const older: U = { id: "web", phone: "541112341234", phone_confirmed_at: "2026-10-01T00:00:00Z" };
  const { deps, calls } = setup({}, { mine: caller, theirs: older });
  assert.equal((await handleFold(req({ foreign_token: "theirs", phone: "+54 9 11 1234 1234" }), deps)).status, 200);
  assert.ok(calls.includes("phone:me:541112341234"));
});
test("a 9-form web account folds into an app that typed the no-9 form", async () => {
  const newer: U = { id: "web", phone: "5491112341234", phone_confirmed_at: "2026-10-01T00:00:00Z" };
  const { deps, calls } = setup({}, { mine: caller, theirs: newer });
  assert.equal((await handleFold(req({ foreign_token: "theirs", phone: "+54 11 1234 1234" }), deps)).status, 200);
  assert.ok(calls.includes("phone:me:5491112341234"));
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --import ./mobile/node_modules/tsx/dist/loader.mjs --test supabase/functions/_shared/phone-key.test.ts supabase/functions/_shared/phone-fold.test.ts`
Expected: FAIL (`phone-key.ts` missing; the first new fold test gets 403).

- [ ] **Step 3: Implement `phoneKey` and use it in the fold**

`phone-key.ts`: digits of the input, then `^549(\d{10})$` → `54$1`. In `phone-fold.ts`: `const key = phoneKey(body.phone)`; forbidden (403) unless `key` is non-empty, `foreign.phone_confirmed_at` is set and `phoneKey(foreign.phone) === key`; then `deps.setPhone(caller.id, (foreign.phone ?? "").replace(/\D/g, ""))`. Keep the file's "never echo numbers" rule.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --import ./mobile/node_modules/tsx/dist/loader.mjs --test supabase/functions/_shared/phone-key.test.ts supabase/functions/_shared/phone-fold.test.ts`
Expected: all pass, including the existing UK cases.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/phone-key.ts supabase/functions/_shared/phone-key.test.ts supabase/functions/_shared/phone-fold.ts supabase/functions/_shared/phone-fold.test.ts supabase/functions/fold-phone-account/README.md
git commit -m "Phone key: the fold compares by key and keeps the web account's digits"
```
