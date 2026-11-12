-- Close a report (chat plan 3: docs/superpowers/plans/2026-11-11-chat-3-safety.md, G-B4(b), G-S12; challenge I11).
--
-- OWNER-RUN, NOT A MIGRATION. Paste into the hosted project's SQL editor, edit the one row below in the editor's copy,
-- and run. In one statement, so one transaction, it records what was done with the report: its status ('reviewed' when
-- nothing was done, 'actioned' when something was), its action ('none', 'message_removed', 'account_suspended' or
-- 'both'), the note and the time. When the reported person's profile has gone, or their account is being deleted, it
-- also forgets who the report was about (target_user_id and frozen_author): the reported id is kept only until the
-- report is closed (I11). It prints the updated row. A closed report is deleted 180 days after closing
-- (purge-closed-reports.sql; open-reports.sql says when one is due). It closes only a report still open, and only to
-- 'reviewed' or 'actioned': run again on a closed report, or with another status, it changes nothing and prints no row,
-- so a closed report's 180 days never start again.
-- Edit: (the report's id from open-reports.sql, status, action, note).
with input(report_id, status, action, note) as (values
 (0, 'reviewed', 'none', 'No action needed')
)
update private.reports r set status = i.status, action = i.action, review_note = i.note, reviewed_at = now(),
 target_user_id = case when exists (select 1 from public.profiles x where x.id = r.target_user_id)
  and not private.deletion_pending(r.target_user_id) then r.target_user_id end,
 frozen_author = case when exists (select 1 from public.profiles x where x.id = r.target_user_id)
  and not private.deletion_pending(r.target_user_id) then r.frozen_author end
from input i
where r.id = i.report_id and r.status = 'open' and i.status in ('reviewed', 'actioned')
returning r.*;
