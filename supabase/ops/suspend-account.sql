-- Suspend the person a report is about (chat plan 3: docs/superpowers/plans/2026-11-11-chat-3-safety.md, G-B4(b);
-- challenge N8, N14 (b)).
--
-- OWNER-RUN, NOT A MIGRATION. Paste into the hosted project's SQL editor, put the report's id below in the editor's
-- copy, and run. In one statement, so one transaction, for the reported person: their tester roster row, if any, is
-- disabled, and their live grant, if any, is revoked, so they may no longer use the app (user_eligible): no reads, no
-- writes, no pushes. It prints the two counts. The release runbook adds the owner's own step: ban the account in the
-- Auth dashboard. Close the report with close-report.sql (action 'account_suspended' or 'both').
-- Edit: the report's id from open-reports.sql.
with input(report_id) as (values (0)),
 target as (select r.target_user_id as id from input i join private.reports r on r.id = i.report_id where r.target_user_id is not null),
 roster as (update private.tester_roster t set enabled = false from target x join auth.users u on u.id = x.id
  where t.email = lower(u.email) and t.enabled returning 1),
 grants as (update private.beta_access b set revoked_at = now() from target x where b.user_id = x.id and b.revoked_at is null returning 1)
select (select count(*) from roster) as roster_rows_disabled, (select count(*) from grants) as grants_revoked;
-- A suspension made in error is undone with the same report's id in these two statements (each prints a count):
--   with x as (update private.tester_roster t set enabled = true from private.reports r join auth.users u on u.id = r.target_user_id
--    where r.id = 0 and t.email = lower(u.email) and not t.enabled returning 1) select count(*) as roster_rows_enabled from x;
--   with x as (update private.beta_access b set revoked_at = null from private.reports r
--    where r.id = 0 and b.user_id = r.target_user_id and b.revoked_at is not null returning 1) select count(*) as grants_restored from x;
