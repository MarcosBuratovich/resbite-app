-- Suspend the person a report is about (chat plan 3: docs/superpowers/plans/2026-11-11-chat-3-safety.md, G-B4(b);
-- challenge N8, N14 (b)).
--
-- OWNER-RUN, NOT A MIGRATION. Paste into the hosted project's SQL editor, put the report's id below in the editor's
-- copy, and run. In one statement, so one transaction, for the reported person: their tester roster row, if any, is
-- disabled, and their live grant, if any, is revoked, so they may no longer use the app (user_eligible): no reads, no
-- writes, no pushes. The report records what this changed, for the undo at the end. It prints the two counts. The
-- release runbook adds the owner's own step: ban the account in the Auth dashboard. Close the report with
-- close-report.sql (action 'account_suspended' or 'both').
-- Edit: the report's id from open-reports.sql.
with input(report_id) as (values (0)),
 target as (select r.id, r.target_user_id as user_id from input i join private.reports r on r.id = i.report_id where r.target_user_id is not null),
 roster as (update private.tester_roster t set enabled = false from target x join auth.users u on u.id = x.user_id
  where t.email = lower(u.email) and t.enabled returning 1),
 grants as (update private.beta_access b set revoked_at = now() from target x where b.user_id = x.user_id and b.revoked_at is null
  returning b.revoked_at),
 recorded as (update private.reports r set suspended_roster = r.suspended_roster or exists (select 1 from roster),
   suspended_grant_at = coalesce((select max(g.revoked_at) from grants g), r.suspended_grant_at)
  from target x where r.id = x.id returning 1)
select (select count(*) from roster) as roster_rows_disabled, (select count(*) from grants) as grants_revoked;
-- To undo it, for a suspension made in error, run the statement below with the same report's id. It puts back only what
-- that suspension changed, as the report recorded it (the roster row it disabled; the grant it revoked, by the time it
-- revoked it), so an earlier ban or revocation stays, and it clears the record. It prints the two counts.
--   with input(report_id) as (values (0)),
--    target as (select r.id, r.target_user_id as user_id, r.suspended_roster, r.suspended_grant_at
--     from input i join private.reports r on r.id = i.report_id),
--    roster as (update private.tester_roster t set enabled = true from target x join auth.users u on u.id = x.user_id
--     where x.suspended_roster and t.email = lower(u.email) and not t.enabled returning 1),
--    grants as (update private.beta_access b set revoked_at = null from target x
--     where b.user_id = x.user_id and b.revoked_at = x.suspended_grant_at returning 1),
--    cleared as (update private.reports r set suspended_roster = false, suspended_grant_at = null from target x where r.id = x.id returning 1)
--   select (select count(*) from roster) as roster_rows_enabled, (select count(*) from grants) as grants_restored;
