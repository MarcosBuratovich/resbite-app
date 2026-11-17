-- Optional details removal (App Store readiness plan 4, docs/superpowers/plans/2026-11-17-asr-4-terms-safety-details.md,
-- Task 3, Decision 11; spec docs/superpowers/specs/2026-11-17-app-store-readiness-design.md, C9 and decision D-9).
-- Resbite no longer collects the optional date of birth, second phone number, city and interests: nothing uses them,
-- and collecting only what each purpose needs (SI-8) means not keeping them. Two changes:
--  - Every account's Auth metadata loses the registration_details key (those four values) and the
--    registration_details_version key (the marker that the details screen was reviewed). Every other key is kept, and
--    metadata that is not a JSON object (null, an array) is left alone.
--  - The write path goes: public.save_registration_details(jsonb,jsonb), the RPC the app's Account details screen
--    called, and private.save_registration_details(jsonb,jsonb) behind it.
--
-- Nothing restores the erased values: the rollback brings the RPC back, not the details (the platform's daily backups
-- roll off in 7 days, docs/compliance/retention-schedule.md rule 4). A build from before this plan still shows Account
-- details; saving there now fails (the RPC no longer exists: 42883 in SQL, a not-found reply from the API) and the
-- screen shows its existing "Account details could not be saved." line. Nothing else changes for the account: since
-- the phone gate became the only way in, the app's gate reads the verified phone, not registration_details_version.
--
-- Re-runnable: a second run finds nothing to erase and nothing to drop. Rollback:
-- supabase/rollback/20261117122000_optional_details_removal.rollback.sql (it recreates the RPC, empty).

-- 1. Erase the optional details from Auth metadata.
update auth.users set raw_user_meta_data = raw_user_meta_data - 'registration_details' - 'registration_details_version'
where jsonb_typeof(raw_user_meta_data) = 'object'
 and raw_user_meta_data ?| array['registration_details','registration_details_version'];

-- 2. Retire the write path: the public façade first, then the definer behind it.
drop function if exists public.save_registration_details(jsonb,jsonb);
drop function if exists private.save_registration_details(jsonb,jsonb);
