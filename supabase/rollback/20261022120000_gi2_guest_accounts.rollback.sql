-- Rollback for 20261022120000_gi2_guest_accounts.sql. Run as one transaction, only with the owner's approval:
--   begin; \i supabase/rollback/20261022120000_gi2_guest_accounts.rollback.sql; commit;
-- It removes joining by link, the link-open count, the link grants and the stored 18+ ticks, and restores the
-- 20260917190517_resbite_private_tester_foundation eligible() verbatim (its grants were never changed).
-- After a rollback every link-made account loses access until the migration is re-applied. The grants and the
-- ticks are deleted with their tables, so after a re-apply each of those accounts joins through a live link (and
-- ticks) again. Their profiles and places on events stay. The tester roster is unchanged.
-- On a local database, where 20261022120001_gi2_local_delivery_and_deletion.sql has also run, run
-- supabase/rollback/20261022120001_gi2_local_delivery_and_deletion.rollback.sql after this file, in the same
-- transaction: until then the functions that file redefined still call the private.has_live_grant() dropped here.

drop function public.note_link_open(text);
drop function public.join_by_link(text,text,text);
drop function private.join_by_link(text,text,text);
drop table private.link_opens;

-- The 20260917190517_resbite_private_tester_foundation body, verbatim.
create or replace function private.eligible() returns boolean language sql stable security definer set search_path = '' as $$
 select auth.uid() is not null and exists (
  select 1 from auth.users u join private.tester_roster r on r.email = lower(u.email)
  where u.id = auth.uid() and u.email_confirmed_at is not null
    and not coalesce(u.is_anonymous,false) and r.enabled
    and (u.banned_until is null or u.banned_until <= now())
 ) and not exists (select 1 from public.profiles p where p.id=auth.uid() and p.deletion_requested_at is not null)
$$;

drop function private.deletion_pending(uuid);
drop function private.user_eligible(uuid);
drop function private.has_live_grant(uuid);
drop table private.age_attestations;
drop table private.beta_access;
