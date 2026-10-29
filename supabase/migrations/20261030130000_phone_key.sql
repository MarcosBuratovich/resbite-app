-- Phone key (docs/superpowers/specs/2026-10-29-phone-key-design.md, plan docs/superpowers/plans/2026-10-29-phone-key-1-server.md).
-- Matching people to phone invitations compares a "key" instead of the bare digits: an Argentine mobile has two
-- international spellings (+54 9 11 ... and +54 11 ...), and the key folds them into one.
-- Hosted-compatible: depends only on the migrations listed in supabase/tests/hosted-baseline/migrations.txt.
-- Rollback: supabase/rollback/20261030130000_phone_key.rollback.sql.

-- 1. The key and its variants

-- The digits of a number; 549 followed by exactly ten digits becomes 54 followed by those ten. Null or no digits give ''.
create function private.phone_key(p text) returns text language sql immutable set search_path = '' as $$
 select regexp_replace(coalesce(regexp_replace(p, '[^0-9]', '', 'g'), ''), '^549([0-9]{10})$', '54\1')
$$;
revoke all on function private.phone_key(text) from public, anon, authenticated, service_role;

-- The spellings a key can be stored under: the key itself, plus its 549 form when it is 54 and ten digits.
create function private.phone_variants(p_key text) returns text[] language sql immutable set search_path = '' as $$
 select case when p_key ~ '^54[0-9]{10}$' then array[p_key, '549' || substr(p_key, 3)] else array[p_key] end
$$;
revoke all on function private.phone_variants(text) from public, anon, authenticated, service_role;
