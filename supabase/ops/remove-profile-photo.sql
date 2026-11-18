-- Take down a profile photo (App Store readiness plan 6:
-- docs/superpowers/plans/2026-11-17-asr-6-retention-and-team-scripts.md, Task 7; C6, D-21).
--
-- OWNER-RUN, NOT A MIGRATION. For a photo that breaks the rules, an intimate image within the 48 hours among them
-- (docs/compliance/moderation-standard.md sections 7, 10 and 14). In a CSEA case, or where the person shown wants to
-- go to the police or the police ask, set the hold first (set-legal-hold.sql, on the account): the photo then comes
-- down and the file is kept ("hide and preserve", docs/compliance/law-enforcement-requests.md section 11.3). Paste it
-- into the hosted project's SQL editor, put the account's id below in the editor's copy only, and run. Never save the
-- edited copy.
-- In one statement, under the account's lock (private.remove_profile_photo), it takes the photo off the profile at
-- once, so nobody sees it from then on, and, unless a hold names the account, retires the file's path (it can't be
-- uploaded or attached again) and queues the file for the photo clean-up's next run (cleanup-profile-photos, every 10
-- minutes), which deletes it. It prints result: {"detached": true when a photo came off, "queued": true when the file
-- is queued for deletion, "held": true when a hold keeps the file}. Run again, it prints detached false.
-- Then suspend the uploader where the case needs it (suspend-account-by-id.sql; at once for an intimate image, AS-R6),
-- close any report with close-report.sql (the nearest action, and what was done in the note), and record the time the
-- photo went down in the moderation log.
-- Edit: the account's id.
with input(user_id) as (values ('00000000-0000-0000-0000-000000000000'::uuid))
select private.remove_profile_photo(i.user_id) as result from input i;
