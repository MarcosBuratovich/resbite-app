-- Rollback for 20261030130000_phone_key.sql (the phone key). Run as one transaction, only with the owner's approval:
--   begin; \i supabase/rollback/20261030130000_phone_key.rollback.sql; commit;
-- It restores what the migration replaced (nothing yet) and drops every function the migration created.
-- The drops stay at the end: restores come above them.

drop function private.phone_variants(text);
drop function private.phone_key(text);
