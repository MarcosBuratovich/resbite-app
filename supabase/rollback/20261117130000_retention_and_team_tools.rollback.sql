-- Rollback for 20261117130000_retention_and_team_tools.sql (App Store readiness plan 6, spec C3, C4 and C6). For the
-- hosted project only: the local replay never runs it. Run as one transaction, only with the owner's approval, before
-- plan 2's rollback (20261117110000_account_deletion_release.rollback.sql) if that is undone too:
--   begin; \i supabase/rollback/20261117130000_retention_and_team_tools.rollback.sql; commit;
-- It undoes the migration's sections in reverse: section 5 first, at the top, section 1 last, at the bottom. Each later
-- section's undo goes above the one before it.
-- An object shared with plan 2 (private.legal_holds, private.account_held(uuid), private.suspension_history) or
-- private.series_held(uuid) is dropped only when its comment reads 'resbite 20261117130000': made by this file, not by
-- plan 2's, which runs first and so normally owns all but series_held.

-- Section 3: the series purges and the account purges. It restores no row: not what any purge deleted, and not the
-- tester roster rows and legacy invitations (private.tester_roster, private.invitations) that section 3 emptied once.
-- Each disabled roster row stays the revoked grant it became, and a suspension that disabled one keeps the grant in
-- its record, so supabase/ops/suspend-account.sql's undo still works.
drop function if exists private.purge_unconfirmed_accounts(integer);
drop function if exists private.purge_web_accounts(integer);
drop function if exists private.dormant_web_accounts(integer);
drop function if exists private.purge_plans(integer);
drop function if exists private.purge_chats(integer);

-- Section 2: the daily run and the row purges.
drop function if exists private.run_retention();
drop function if exists private.purge_suspension_history(integer);
drop function if exists private.purge_closed_reports(integer);
drop function if exists private.purge_link_opens(integer);
drop function if exists private.purge_notifications(integer);
drop function if exists private.purge_connection_requests(integer);
drop function if exists private.purge_connection_refusals(integer);
drop function if exists private.purge_plan_removals(integer);
drop function if exists private.purge_phone_invitations(integer);

-- Section 1: the retention helpers, then the shared objects this file made.
drop function if exists private.series_end(uuid);
drop function if exists private.series_under_hold(uuid);
do $rollback$ begin
 if pg_catalog.obj_description(pg_catalog.to_regprocedure('private.series_held(uuid)'),'pg_proc')='resbite 20261117130000' then
  drop function private.series_held(uuid);
 end if;
 if pg_catalog.obj_description(pg_catalog.to_regprocedure('private.account_held(uuid)'),'pg_proc')='resbite 20261117130000' then
  drop function private.account_held(uuid);
 end if;
 if pg_catalog.obj_description(pg_catalog.to_regclass('private.legal_holds'),'pg_class')='resbite 20261117130000' then
  drop table private.legal_holds;
 end if;
 if pg_catalog.obj_description(pg_catalog.to_regclass('private.suspension_history'),'pg_class')='resbite 20261117130000' then
  drop table private.suspension_history;
 end if;
end $rollback$;
