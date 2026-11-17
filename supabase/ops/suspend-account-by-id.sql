-- Suspend an account by its id (App Store readiness plan 6:
-- docs/superpowers/plans/2026-11-17-asr-6-retention-and-team-scripts.md, Task 7; C6, AS-R6).
--
-- OWNER-RUN, NOT A MIGRATION. For an account found any way other than a report in open-reports.sql: a case that came
-- by email or the support form, or the uploader of an intimate image, who is suspended at once
-- (docs/compliance/moderation-standard.md sections 7, 8 and 10; ruling AS-R6). For a report in the queue, use
-- suspend-account.sql. Paste it into the hosted project's SQL editor, put the account's id below in the editor's copy
-- only, and the report's id too where there is one (else leave it null), and run. Never save the edited copy.
-- In one statement, so one transaction, it does what suspend-account.sql does, with no roster step (20261117130000
-- emptied the tester roster): the account's grant is revoked, or one is recorded, already revoked, if it has none.
-- The account may no longer use the app (user_eligible): no reads, no writes, no pushes. private.suspensions records
-- what this changed (when it revoked the grant, and whether it made the grant) and the report given, so that
-- lift-suspension.sql, or the undo at the end of suspend-account.sql, puts back only that. An earlier ban (a grant
-- already revoked) is left as it is, and nothing is recorded. It prints the account's id (empty when no account has
-- that id: check it) and grants_revoked. Run again, it changes nothing and prints grants_revoked 0.
-- Then ban the account in the Auth dashboard (Users, ban) only where the case needs it: moderation-standard.md section
-- 8.2 (level 3). A banned account can't sign in, so it can't delete itself in the app and is deleted with
-- supabase/ops/delete-account.sql (D-19, AS-R3). Record the case in the moderation log by its case number, and close
-- any report with close-report.sql (action 'account_suspended' or 'both').
-- Edit: the account's id; the report's id from open-reports.sql, or null.
with input(user_id, report_id) as (values ('00000000-0000-0000-0000-000000000000'::uuid, null::bigint)),
 target as (select u.id as user_id, i.report_id from input i join auth.users u on u.id = i.user_id),
 had as (select exists (select 1 from private.beta_access b join target x on b.user_id = x.user_id) as grant_row),
 grants as (insert into private.beta_access(user_id, source, revoked_at) select x.user_id, 'maintainer', now() from target x
  on conflict (user_id) do update set revoked_at = now() where private.beta_access.revoked_at is null
  returning private.beta_access.revoked_at),
 recorded as (insert into private.suspensions(user_id, report_id, grant_at, grant_made)
  select x.user_id, x.report_id, (select max(g.revoked_at) from grants g), not (select h.grant_row from had h) from target x
  where exists (select 1 from grants)
  on conflict (user_id) do update set grant_at = coalesce(private.suspensions.grant_at, excluded.grant_at),
   grant_made = private.suspensions.grant_made or excluded.grant_made
  returning 1)
select (select x.user_id from target x) as account, (select count(*) from grants) as grants_revoked;
