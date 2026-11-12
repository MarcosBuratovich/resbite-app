-- Set the moderators (chat plan 3: docs/superpowers/plans/2026-11-11-chat-3-safety.md, G-B4(c), Decision 10; the
-- release-blocking owner question R-Q4).
--
-- OWNER-RUN, NOT A MIGRATION. Paste into the hosted project's SQL editor, put the moderators' emails in the list below
-- in the editor's copy, and run. In one statement, so one transaction, it makes private.moderators exactly the accounts
-- holding those emails (each with a profile). Each new report then pushes them "A new report is waiting." at most once
-- in 10 minutes each, never the person who reported or the person reported. It prints how many moderators there are
-- now, and each email in the list that no account holds (no_account). An empty list leaves no moderator: reports then
-- wait for the daily read alone.
-- Edit: the list, e.g. array['first@example.com', 'second@example.com']::text[]
with listed(email) as (select distinct lower(btrim(e)) from unnest(array[]::text[]) e where btrim(e) <> ''),
 accounts as (select u.id, l.email from listed l join auth.users u on lower(u.email) = l.email
  where exists (select 1 from public.profiles p where p.id = u.id)),
 gone as (delete from private.moderators m where m.user_id not in (select a.id from accounts a) returning 1),
 added as (insert into private.moderators(user_id) select distinct a.id from accounts a on conflict do nothing returning 1)
select (select count(distinct a.id) from accounts a) as moderators,
 array(select l.email from listed l where not exists (select 1 from accounts a where a.email = l.email) order by l.email) as no_account;
