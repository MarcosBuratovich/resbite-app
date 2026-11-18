-- Suspend the person a report is about (chat plan 3: docs/superpowers/plans/2026-11-11-chat-3-safety.md, G-B4(b);
-- challenge N8, N14 (b)).
--
-- OWNER-RUN, NOT A MIGRATION. Paste into the hosted project's SQL editor, put the report's id below in the editor's
-- copy, and run. In one statement, so one transaction, for the reported person: their tester roster row, if any, is
-- disabled, and their grant is revoked (one is recorded, already revoked, if they have none: since the open beta,
-- 20261116120000, any confirmed account may use the app, so the revoked grant is what keeps them out). They may no
-- longer use the app (user_eligible): no reads, no writes, no pushes. private.suspensions records what this changed, by
-- the suspended account, for the undo at the end: the record outlives the report, which goes when it is purged or with
-- its reporter's account. It prints the suspended account's id (keep it for the undo) and the two counts. Ban the
-- account in the Auth dashboard only where docs/compliance/moderation-standard.md says so: a banned account can't sign
-- in, so it can't delete itself in the app and is deleted with supabase/ops/delete-account.sql (D-19, AS-R3). Close
-- the report with close-report.sql (action 'account_suspended' or 'both').
-- Edit: the report's id from open-reports.sql.
with input(report_id) as (values (0)),
 target as (select r.id, r.target_user_id as user_id from input i join private.reports r on r.id = i.report_id where r.target_user_id is not null),
 had as (select exists (select 1 from private.beta_access b join target x on b.user_id = x.user_id) as grant_row),
 roster as (update private.tester_roster t set enabled = false from target x join auth.users u on u.id = x.user_id
  where t.email = lower(u.email) and t.enabled returning 1),
 grants as (insert into private.beta_access(user_id, source, revoked_at) select x.user_id, 'maintainer', now() from target x
  on conflict (user_id) do update set revoked_at = now() where private.beta_access.revoked_at is null
  returning private.beta_access.revoked_at),
 recorded as (insert into private.suspensions(user_id, report_id, roster, grant_at, grant_made)
  select x.user_id, x.id, exists (select 1 from roster), (select max(g.revoked_at) from grants g),
   exists (select 1 from grants) and not (select h.grant_row from had h) from target x
  where exists (select 1 from roster) or exists (select 1 from grants)
  on conflict (user_id) do update set roster = private.suspensions.roster or excluded.roster,
   grant_at = coalesce(private.suspensions.grant_at, excluded.grant_at),
   grant_made = private.suspensions.grant_made or excluded.grant_made
  returning 1)
select (select x.user_id from target x) as account, (select count(*) from roster) as roster_rows_disabled,
 (select count(*) from grants) as grants_revoked;
-- To undo it, for a suspension made in error, run the statement below with the suspended account's id (as this
-- printed it, or from select user_id, report_id, at from private.suspensions). It puts back only what the recorded
-- suspension changed (the roster row it disabled; the grant it revoked, by the time it revoked it), so an earlier ban or
-- revocation stays, and it deletes the record. A grant the suspension recorded for an account that had none
-- (suspensions.grant_made) is deleted again, so a mistaken suspension leaves no grant behind. It prints the two counts.
--   with input(user_id) as (values ('00000000-0000-0000-0000-000000000000'::uuid)),
--    rec as (delete from private.suspensions s using input i where s.user_id = i.user_id returning s.user_id, s.roster, s.grant_at, s.grant_made),
--    roster as (update private.tester_roster t set enabled = true from rec x join auth.users u on u.id = x.user_id
--     where x.roster and t.email = lower(u.email) and not t.enabled returning 1),
--    grants as (update private.beta_access b set revoked_at = null from rec x
--     where b.user_id = x.user_id and b.revoked_at = x.grant_at and not x.grant_made returning 1),
--    made as (delete from private.beta_access b using rec x
--     where b.user_id = x.user_id and b.revoked_at = x.grant_at and x.grant_made returning 1)
--   select (select count(*) from roster) as roster_rows_enabled, (select count(*) from grants) + (select count(*) from made) as grants_restored;
