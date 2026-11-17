-- The legal holds not lifted (App Store readiness plan 6:
-- docs/superpowers/plans/2026-11-17-asr-6-retention-and-team-scripts.md, Task 7; C6;
-- docs/compliance/law-enforcement-requests.md sections 11.5 and 11.6).
--
-- OWNER-RUN, NOT A MIGRATION. READ-ONLY: it changes nothing. Paste it into the hosted project's SQL editor and run, on
-- each hold's review date (docs/compliance/moderation-standard.md section 4) and before running purge-closed-reports.sql
-- by hand. Nothing to edit.
-- One row per hold not lifted: id; scope, 'account' or 'series'; held_id, the account's or the series' id; reason;
-- case_ref; set_at; review_on; review_due, true from its review date on. Ordered by review date, the earliest first.
-- Check it against the hold register in the log tool (section 11.6). Set a hold with set-legal-hold.sql; lift one with
-- lift-legal-hold.sql.
select h.id, case when h.user_id is not null then 'account' else 'series' end as scope,
 coalesce(h.user_id, h.series_id) as held_id, h.reason, h.case_ref, h.set_at, h.review_on,
 h.review_on <= current_date as review_due
from private.legal_holds h
where h.lifted_at is null
order by h.review_on, h.id;
