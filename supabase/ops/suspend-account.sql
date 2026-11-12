-- Suspend the person a report is about (chat plan 3: docs/superpowers/plans/2026-11-11-chat-3-safety.md, G-B4(b);
-- challenge N8, N14 (b)).
--
-- OWNER-RUN, NOT A MIGRATION. Paste into the hosted project's SQL editor, put the report's id below in the editor's
-- copy, and run. In one statement, so one transaction, for the reported person: their tester roster row, if any, is
-- disabled, and their live grant, if any, is revoked, so they may no longer use the app (user_eligible): no reads, no
-- writes, no pushes. private.suspensions records what this changed, by the suspended account, for the undo at the end:
-- the record outlives the report, which goes when it is purged or with its reporter's account. It prints the
-- suspended account's id (keep it for the undo) and the two counts. The release runbook adds the owner's own step: ban
-- the account in the Auth dashboard. Close the report with close-report.sql (action 'account_suspended' or 'both').
-- Edit: the report's id from open-reports.sql.
with input(report_id) as (values (0)),
 target as (select r.id, r.target_user_id as user_id from input i join private.reports r on r.id = i.report_id where r.target_user_id is not null),
 roster as (update private.tester_roster t set enabled = false from target x join auth.users u on u.id = x.user_id
  where t.email = lower(u.email) and t.enabled returning 1),
 grants as (update private.beta_access b set revoked_at = now() from target x where b.user_id = x.user_id and b.revoked_at is null
  returning b.revoked_at),
 recorded as (insert into private.suspensions(user_id, report_id, roster, grant_at)
  select x.user_id, x.id, exists (select 1 from roster), (select max(g.revoked_at) from grants g) from target x
  where exists (select 1 from roster) or exists (select 1 from grants)
  on conflict (user_id) do update set roster = private.suspensions.roster or excluded.roster,
   grant_at = coalesce(private.suspensions.grant_at, excluded.grant_at)
  returning 1)
select (select x.user_id from target x) as account, (select count(*) from roster) as roster_rows_disabled,
 (select count(*) from grants) as grants_revoked;
-- To undo it, for a suspension made in error, run the statement below with the suspended account's id (as this
-- printed it, or from select user_id, report_id, at from private.suspensions). It puts back only what the recorded
-- suspension changed (the roster row it disabled; the grant it revoked, by the time it revoked it), so an earlier ban or
-- revocation stays, and it deletes the record. It prints the two counts.
--   with input(user_id) as (values ('00000000-0000-0000-0000-000000000000'::uuid)),
--    rec as (delete from private.suspensions s using input i where s.user_id = i.user_id returning s.user_id, s.roster, s.grant_at),
--    roster as (update private.tester_roster t set enabled = true from rec x join auth.users u on u.id = x.user_id
--     where x.roster and t.email = lower(u.email) and not t.enabled returning 1),
--    grants as (update private.beta_access b set revoked_at = null from rec x
--     where b.user_id = x.user_id and b.revoked_at = x.grant_at returning 1)
--   select (select count(*) from roster) as roster_rows_enabled, (select count(*) from grants) as grants_restored;
