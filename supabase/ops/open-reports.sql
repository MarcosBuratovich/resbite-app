-- The daily read of reports and blocks (chat plan 3: docs/superpowers/plans/2026-11-11-chat-3-safety.md, G-S12, G-S14;
-- challenges I10 and I11; Decisions 15 and 16).
--
-- OWNER-RUN, NOT A MIGRATION. Read-only: paste into the hosted project's SQL editor and run, once a day (the release
-- runbook says who reads it, and who stands in). Nothing to edit, and it writes nothing. One result, these columns in
-- this order:
--   item           'report', 'block' or 'due'
--   id             the report's id, for close-report.sql, remove-reported-message.sql and suspend-account.sql
--   created_at     when the report, or the block, was made
--   reason         harassment, spam, inappropriate or other
--   details        the reporter's own words, if any ('due': how many, and what to run)
--   frozen_body    the reported message's words as they were when it was reported (none for a report about a person)
--   reporter_name  who reported ('block': who blocked)
--   target_name    who was reported ('block': who was blocked); empty once the report forgot who it was about
--   resbite_title  the resbite the report came from
--   resbite_date   that resbite's date, in its own time zone
-- The rows:
--   'report'  every open report, oldest first;
--   'block'   every block made in the last 7 days, newest first: who blocked whom and when, and nothing else (no message
--             text; a block pushes nobody). Seven days covers a missed daily read;
--   'due'     one row while closed reports are due: closed more than private.report_keep_days() days ago (180), or
--             closed and naming an account that has no profile any more or is being deleted. Run
--             purge-closed-reports.sql.
-- No phone number and no email is shown. A name is the profile's display name: 'Deleted member' for an account being
-- deleted, empty when the profile has gone.
select item, id, created_at, reason, details, frozen_body, reporter_name, target_name, resbite_title, resbite_date
from (
 select 1 as part, 'report'::text as item, r.id, r.created_at, r.reason, r.details, r.frozen_body,
  reporter.display_name as reporter_name, target.display_name as target_name, p.title as resbite_title,
  (p.starts_at at time zone p.time_zone)::date as resbite_date
 from private.reports r
 left join public.profiles reporter on reporter.id = r.reporter_id
 left join public.profiles target on target.id = r.target_user_id
 left join public.plans p on p.id = r.plan_id
 where r.status = 'open'
 union all
 select 2, 'block', null, b.created_at, null, null, null, blocker.display_name, blocked.display_name, null, null
 from private.blocks b
 left join public.profiles blocker on blocker.id = b.blocker_id
 left join public.profiles blocked on blocked.id = b.blocked_id
 where b.created_at > now() - interval '7 days'
 union all
 select 3, 'due', null, null, null, d.n || ' closed report(s) due: run purge-closed-reports.sql', null, null, null, null, null
 from (select count(*) as n from private.reports r
  where r.status <> 'open'
   and (r.reviewed_at < now() - pg_catalog.make_interval(days => private.report_keep_days())
    or (r.target_user_id is not null
     and (not exists (select 1 from public.profiles x where x.id = r.target_user_id) or private.deletion_pending(r.target_user_id)))
    or (r.frozen_author is not null
     and (not exists (select 1 from public.profiles x where x.id = r.frozen_author) or private.deletion_pending(r.frozen_author))))) d
 where d.n > 0
) x
order by part, case when part = 1 then created_at end, case when part = 2 then created_at end desc, id;
