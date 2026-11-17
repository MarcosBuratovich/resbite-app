-- Lift a suspension after an appeal (App Store readiness plan 6:
-- docs/superpowers/plans/2026-11-17-asr-6-retention-and-team-scripts.md, Task 7; C6, D-8).
--
-- OWNER-RUN, NOT A MIGRATION. For a suspension lifted after a successful appeal, or after the person confirms they are
-- 18 or over (docs/compliance/moderation-standard.md sections 8.1 and 17). For a suspension made in error (wrong
-- account, wrong report), use the undo at the end of suspend-account.sql instead: it leaves no record. Paste it into
-- the hosted project's SQL editor, put the suspended account's id below in the editor's copy only, and run. Never save
-- the edited copy.
-- In one statement, so one transaction, it deletes the account's private.suspensions row and keeps it in
-- private.suspension_history (when it was made, when it was lifted, how 'lifted', the report it came from), which the
-- daily retention run deletes 12 months after the lift (docs/compliance/retention-schedule.md). It puts back only what
-- the suspension changed, exactly as the undo does: a grant it revoked is live again, a grant it made for an account
-- that had none is deleted, and an earlier ban stays. It puts back no tester roster row: run it only once
-- 20261117130000 is applied, which emptied the roster and rewrote each roster suspension as a revoked grant. A later
-- suspension starts a fresh record. It prints lifted (1, or 0 when the account has no suspension: check the id) and
-- grants_restored.
-- Then lift any Auth ban in the Auth dashboard too (Users), reply to the person (template N8), and note the lift in
-- the moderation log by its case number.
-- Edit: the suspended account's id, as suspend-account.sql or suspend-account-by-id.sql printed it.
with input(user_id) as (values ('00000000-0000-0000-0000-000000000000'::uuid)),
 rec as (delete from private.suspensions s using input i where s.user_id = i.user_id
  returning s.user_id, s.report_id, s.at, s.grant_at, s.grant_made),
 history as (insert into private.suspension_history(user_id, report_id, suspended_at, ended_at, how)
  select x.user_id, x.report_id, x.at, now(), 'lifted' from rec x returning 1),
 grants as (update private.beta_access b set revoked_at = null from rec x
  where b.user_id = x.user_id and b.revoked_at = x.grant_at and not x.grant_made returning 1),
 made as (delete from private.beta_access b using rec x
  where b.user_id = x.user_id and b.revoked_at = x.grant_at and x.grant_made returning 1)
select (select count(*) from history) as lifted, (select count(*) from grants) + (select count(*) from made) as grants_restored;
