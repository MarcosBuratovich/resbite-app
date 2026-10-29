-- Rewrite the older Argentine accounts to the 9 form (the phone key, PK-D4:
-- docs/superpowers/specs/2026-10-29-phone-key-design.md, "Older Argentine accounts").
--
-- OWNER-RUN, NOT A MIGRATION. Paste into the hosted project's SQL editor and run, with approval, after
-- 20261030130000_phone_key.sql is applied and in the same sitting as the release of the build that sends the 9 form
-- (the runbook, qa/phone-key-2026-10-29/README.md, gives the order and the counts to take before and after).
-- Do not add it to a migration or test list; the hosted-baseline rehearsal runs it as text, twice.
--
-- What it does, in one transaction
--   1. Records in private.phone_rewrites (user_id, old_phone, new_phone) every account whose auth.users.phone is an
--      older Argentine number (54 and ten digits) whose 549 form no other account holds. An account already recorded
--      keeps its first record.
--   2. Sets each recorded account's auth.users.phone to the 549 form, where it still holds the recorded old number and
--      no other account holds the 549 form.
--   3. Rewrites a pending auth.users.phone_change of 54 and ten digits to its 549 form, unless an account holds that
--      form. These are not recorded, and the rollback does not restore them.
--   4. Rewrites the number in the matching phone identity (auth.identities, where that table exists) of each account
--      step 2 rewrote.
--   Where another account already holds the 549 form, nothing is rewritten: those pairs stay as they are, for the owner
--   to settle by hand. It prints counts only, never a number.
--
-- Re-runnable: a second run changes nothing, and a later run covers older accounts made in between (by the old build).
--
-- To undo: the migration's rollback, supabase/rollback/20261030130000_phone_key.rollback.sql, puts the recorded
-- numbers (and their phone identities) back from private.phone_rewrites.

begin;

do $$ begin
 if to_regclass('private.phone_rewrites') is null then
  raise exception 'private.phone_rewrites is missing: 20261030130000_phone_key.sql is not applied, or the record was dropped';
 end if;
end $$;

insert into private.phone_rewrites(user_id, old_phone, new_phone)
 select u.id, u.phone, '549' || substr(u.phone, 3) from auth.users u
 where u.phone ~ '^54[0-9]{10}$'
  and not exists(select 1 from auth.users v where v.phone = '549' || substr(u.phone, 3))
 on conflict (user_id) do nothing;

update auth.users u set phone = r.new_phone from private.phone_rewrites r
 where r.user_id = u.id and u.phone = r.old_phone
  and not exists(select 1 from auth.users v where v.phone = r.new_phone);

update auth.users set phone_change = '549' || substr(phone_change, 3)
 where phone_change ~ '^54[0-9]{10}$'
  and not exists(select 1 from auth.users v where v.phone = '549' || substr(auth.users.phone_change, 3));

-- The hosted project also keeps the number in the phone identity; the local harness has no identities table.
do $$ begin
 if to_regclass('auth.identities') is not null then
  execute $x$ update auth.identities i set identity_data = jsonb_set(i.identity_data, '{phone}', to_jsonb(r.new_phone))
   from private.phone_rewrites r
   where i.user_id = r.user_id and i.provider = 'phone' and i.identity_data->>'phone' = r.old_phone
    and exists(select 1 from auth.users u where u.id = r.user_id and u.phone = r.new_phone) $x$;
 end if;
end $$;

commit;
