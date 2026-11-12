-- Set the blocked terms (chat plan 3: docs/superpowers/plans/2026-11-11-chat-3-safety.md, G-B4(a), Decision 9;
-- challenge N4).
--
-- OWNER-RUN, NOT A MIGRATION. Paste into the hosted project's SQL editor, put the terms in the list below in the
-- editor's copy only, and run. Never save the terms in this file: the repository's list stays empty. In one statement,
-- so one transaction, it makes private.blocked_terms exactly the list, lowercased and trimmed, without duplicates, every
-- run of blanks inside a term (a no-break space among them) made one plain space. A
-- message or an announcement holding a term as a whole word (in any case; a space in a term matches any run of blanks
-- or a line break) is refused before it is stored, and the app says the message can't be sent. Each term: 1 to 80
-- characters, a letter, digit or underscore first and last, its words one space apart, and none of [ ] \ . ^ $ * + ? (
-- ) { } |. One that breaks these stops the whole run, and nothing changes. It prints how many terms there are now, never
-- the terms.
-- Edit: the list, e.g. array['first term', 'second']::text[]
with listed(term) as (select distinct lower(btrim(regexp_replace(t, '[\s\u0085\u00a0\u115f\u1680\u2000-\u200c\u2028\u2029\u202f\u205f\u2060\u2800\u3000\u3164\ufeff\uffa0]+', ' ', 'g'))) from unnest(array[]::text[]) t
  where btrim(regexp_replace(t, '[\s\u0085\u00a0\u115f\u1680\u2000-\u200c\u2028\u2029\u202f\u205f\u2060\u2800\u3000\u3164\ufeff\uffa0]+', ' ', 'g')) <> ''),
 gone as (delete from private.blocked_terms b where b.term not in (select l.term from listed l) returning 1),
 added as (insert into private.blocked_terms(term) select l.term from listed l on conflict do nothing returning 1)
select (select count(*) from listed) as terms;
