-- Set a legal hold (App Store readiness plan 6:
-- docs/superpowers/plans/2026-11-17-asr-6-retention-and-team-scripts.md, Task 7; C6;
-- docs/compliance/law-enforcement-requests.md section 11).
--
-- OWNER-RUN, NOT A MIGRATION. When law-enforcement-requests.md section 11.1 says to set one: every CSEA case; an
-- intimate image case where the person shown wants to go to the police, or the police ask; a threat; a police, NCA,
-- Ofcom, coroner or court request, or a request to preserve; a claim. The owner sets holds. The backup moderator may
-- set one only in a CSEA or intimate image case (docs/compliance/team-access.md). Paste it into the hosted project's
-- SQL editor, edit the editor's copy only, and run. Never save the edited copy.
-- A hold names exactly one account (user_id) or one resbite series (series_id: a plan's series_id), never both and
-- never neither (refused: 23514). Run it once for each account and each series the case needs. An account's hold keeps
-- that account's records and every series it hosted, joined or wrote in; a series' hold keeps the series' occurrences,
-- guests, chat and covers. Until it is lifted, the account deletion's erasure, every retention purge, the photo and
-- cover clean-up and the two removal scripts leave what it keeps (removal hides and preserves: section 11.3). It does
-- not stop purge-closed-reports.sql run by hand, a person deleting their own message, or the logs and backups outside
-- the database (section 11.4).
-- The reason is one of 'csea', 'intimate_image', 'threat', 'police', 'nca', 'ofcom', 'coroner', 'court' or 'claim'.
-- The case reference is the case number from the moderation or request log (letters, digits and hyphens, at most 40).
-- The review date is three months ahead (section 11.5).
-- In one statement it prints the hold: id, user_id, series_id, reason, case_ref, review_on, set_at. Record it in the
-- hold register in the log tool (section 11.6). List the holds with legal-holds.sql; lift one with
-- lift-legal-hold.sql.
-- Edit: one of the two ids (leave the other null), the reason, the case reference and, if needed, the review date.
with input(user_id, series_id, reason, case_ref, review_on) as (values (null::uuid, null::uuid, 'police', 'LE-2026-000', current_date + 90))
insert into private.legal_holds(user_id, series_id, reason, case_ref, review_on)
select i.user_id, i.series_id, i.reason, i.case_ref, i.review_on from input i
returning id, user_id, series_id, reason, case_ref, review_on, set_at;
