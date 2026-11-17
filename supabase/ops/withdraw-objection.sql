-- Take a number off the do-not-invite list (App Store readiness plan 6:
-- docs/superpowers/plans/2026-11-17-asr-6-retention-and-team-scripts.md, Task 4; D-23).
--
-- OWNER-RUN, NOT A MIGRATION. When the person who objected asks to come off the list (template R9 tells them to write
-- to privacy@resbite.com), and only after the phone check in docs/compliance/data-requests.md section 4.3 has passed
-- for that number. Paste it into the hosted project's SQL editor, put the number below in the editor's copy only (its
-- international digits, no plus or spaces), and run. Never save the edited copy, and never write the number in the
-- repo.
-- In one statement (private.withdraw_objection), it deletes the number's entry. From then on hosts can invite it by
-- link again. It prints removed: true when the number was listed and is now off the list, false when it was not
-- listed (check the digits). The list's key stays in Vault.
-- Edit: the number.
with input(phone) as (values ('447700900000'))
select private.withdraw_objection(i.phone) as removed from input i;
