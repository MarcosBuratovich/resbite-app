-- Lift a legal hold (App Store readiness plan 6:
-- docs/superpowers/plans/2026-11-17-asr-6-retention-and-team-scripts.md, Task 7; C6;
-- docs/compliance/law-enforcement-requests.md section 11.5).
--
-- OWNER-RUN, NOT A MIGRATION. When the hold's reason has ended (section 11.5). Paste it into the hosted project's SQL
-- editor, put the hold's id below in the editor's copy only (from legal-holds.sql or the hold register), and run.
-- In one statement it sets lifted_at on that hold, when it is not lifted yet, and prints the hold: id, user_id,
-- series_id, reason, case_ref, review_on, set_at, lifted_at. It prints nothing when no hold has that id or the hold was
-- lifted already. The normal periods then apply again to what it kept: anything already past its period goes at the
-- next daily retention run, the photo and cover clean-up takes what it kept, and an account deletion that was waiting
-- completes. Another hold not lifted still keeps what it names.
-- Then record the date lifted in the hold register (section 11.6), and delete any exported copies in the case folder.
-- Edit: the hold's id.
with input(id) as (values (0::bigint))
update private.legal_holds h set lifted_at = now() from input i where h.id = i.id and h.lifted_at is null
returning h.id, h.user_id, h.series_id, h.reason, h.case_ref, h.review_on, h.set_at, h.lifted_at;
