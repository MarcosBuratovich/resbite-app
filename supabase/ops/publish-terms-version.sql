-- Publish a Terms of Use version (App Store readiness plan 4: docs/superpowers/plans/2026-11-17-asr-4-terms-safety-details.md,
-- Task 1, Decisions 1 and 5; spec C8; migration 20261117120000_terms_acceptance.sql).
--
-- OWNER-RUN, NOT A MIGRATION. Paste into the hosted project's SQL editor, check the one version below in the editor's
-- copy, and run: on the day the Terms of Use go live at /terms and the app build with the Accept your Terms screen is
-- out (docs/legal/README.md, rule 5). The version is YYYY-MM, the same as the app's and the link site's TERMS_VERSION.
-- In one statement, so one transaction, it adds the version to private.terms_versions, only when it is later than every
-- version already there. From then on account_access_status() reports it as terms_version, and the app asks each
-- account that hasn't accepted it, once (terms_needed). Run again, it prints published 0 and changes nothing. A version
-- that isn't YYYY-MM fails on the table's check and changes nothing. It prints one row, numbers only: published (1 when
-- it added the version, else 0), current_version (the version it added, else the one already current) and
-- accounts_to_ask (confirmed, non-anonymous accounts with no acceptance of current_version).
-- Edit: the version.
with input(version) as (values ('2026-12')),
 added as (insert into private.terms_versions(version)
  select i.version from input i
  -- A malformed version always reaches the table's check, so it fails rather than being skipped as not later.
  where i.version !~ '^[0-9]{4}-[0-9]{2}$' or not exists (select 1 from private.terms_versions t where t.version >= i.version)
  returning version),
 live(version) as (select coalesce((select a.version from added a), private.terms_version()))
select (select count(*) from added) as published, l.version as current_version,
 (select count(*) from auth.users u
  where (u.email_confirmed_at is not null or u.phone_confirmed_at is not null) and not coalesce(u.is_anonymous, false)
   and not exists (select 1 from private.terms_acceptances a where a.user_id = u.id and a.terms_version = l.version)) as accounts_to_ask
from live l;
