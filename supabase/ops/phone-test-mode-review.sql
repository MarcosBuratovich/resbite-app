-- Phone-code test-mode review: the evidence for breach log entry BR-2026-001 (App Store readiness plan 1:
-- docs/superpowers/plans/2026-11-17-asr-1-phone-codes.md, Task 5 and Decision 10; gap analysis F5;
-- qa/phone-accounts-2026-10-27/README.md steps 7.3 and 7.4).
--
-- OWNER-RUN, NOT A MIGRATION. Read-only: it writes nothing and there is nothing to edit. For the hosted project's SQL
-- editor only: paste it and run it after supabase/ops/phone-test-mode-off.sql, in the same sitting. Its output names
-- accounts (their phone numbers and emails), so it stays in the SQL editor: never save it to a file, the repository or
-- a chat. The repository records counts and the decision only; the list of known testers (the owner and
-- the coworkers) is kept outside it.
--
-- One result (the SQL editor shows one), in three parts, told apart by the first column, part:
--   'log'        the test-mode log by kind ('sent', 'exchanged'): rows, first_at and last_at. How much test mode did,
--                and when; 'sent' counts codes stored, 'exchanged' counts 000000 swaps that worked.
--   'exchanged'  every 000000 swap that worked: at, phone_suffix (the number's last two digits), and the account it
--                named (user_id) with that account's phone and email. user_id is empty when nobody, or more than one
--                account, was adding the number. Check each row against the known testers and the team's test accounts.
--   'identity'   every Auth identity created since 28 October 2026 00:00 UTC, the day the phone-accounts migration went
--                live (so a superset of the test-mode period): at, provider, and the account (user_id) with its phone
--                and email. Phone sign-ups, and Apple or Google linked at About you. Check each against the same list.
-- Columns, in this order: part, kind, rows, first_at, last_at, at, phone_suffix, provider, user_id, phone, email (empty
-- where a part has no value).
--
-- Decision rule (docs/compliance/breach-response.md section 11): if every row and identity belongs to a known tester or
-- a team test account, there was no unauthorised access: record "no breach found", with the counts. If any does not,
-- treat it as a possible breach: the owner became aware at that moment, the 72-hour clock starts, and sections 4 to 7
-- apply.
-- Record in BR-2026-001: rows reviewed, matched, unmatched; identities reviewed, matched, unmatched; the decision and
-- its reasoning.
select part, kind, rows, first_at, last_at, at, phone_suffix, provider, user_id, phone, email from (
 select 1 as ord, 'log' as part, l.kind, count(*) as rows, min(l.at) as first_at, max(l.at) as last_at,
  null::timestamptz as at, null::text as phone_suffix, null::text as provider, null::uuid as user_id, null::text as phone,
  null::text as email
 from private.test_mode_log l group by l.kind
 union all
 select 2, 'exchanged', l.kind, null, null, null, l.at, l.phone_suffix, null, l.user_id, u.phone, u.email
 from private.test_mode_log l left join auth.users u on u.id = l.user_id
 where l.kind = 'exchanged'
 union all
 select 3, 'identity', null, null, null, null, i.created_at, null, i.provider, i.user_id, u.phone, u.email
 from auth.identities i join auth.users u on u.id = i.user_id
 where i.created_at >= timestamptz '2026-10-28 00:00:00+00'
) r order by ord, at, kind;
