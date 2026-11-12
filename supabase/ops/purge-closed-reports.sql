-- Delete the closed reports that are due (chat plan 3: docs/superpowers/plans/2026-11-11-chat-3-safety.md, CH-P18; the
-- ruling on challenge I11, owner question R-Q3).
--
-- OWNER-RUN, NOT A MIGRATION. Nothing to edit: run it in the hosted project's SQL editor when open-reports.sql shows a
-- 'due' row. In one statement, so one transaction: it deletes every report that is closed (not open) and was closed
-- more than private.report_keep_days() days ago (180); and on the other closed reports it forgets who they were about
-- (target_user_id and frozen_author) when that account has no profile any more or is being deleted, which covers a
-- profile removed by hand after the report was closed. Open reports are never touched. It prints the two counts.
with due as (select r.id from private.reports r
  where r.status <> 'open' and r.reviewed_at < now() - pg_catalog.make_interval(days => private.report_keep_days())),
 deleted as (delete from private.reports r where r.id in (select d.id from due d) returning 1),
 cleared as (update private.reports r set target_user_id = null, frozen_author = null
  where r.status <> 'open' and r.id not in (select d.id from due d)
   and ((r.target_user_id is not null
     and (not exists (select 1 from public.profiles x where x.id = r.target_user_id) or private.deletion_pending(r.target_user_id)))
    or (r.frozen_author is not null
     and (not exists (select 1 from public.profiles x where x.id = r.frozen_author) or private.deletion_pending(r.frozen_author))))
  returning 1)
select (select count(*) from deleted) as deleted, (select count(*) from cleared) as cleared;
