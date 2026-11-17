-- Export what is held about a number that is not a user's, for an access request (App Store readiness plan 6:
-- docs/superpowers/plans/2026-11-17-asr-6-retention-and-team-scripts.md, Task 8; C6, A16;
-- docs/compliance/data-requests.md section 5.9).
--
-- OWNER-RUN, NOT A MIGRATION. READ-ONLY: it changes nothing. For a person who is not a user and asks what we hold
-- about the number they say was invited, and only after the phone check in data-requests.md section 4.3 has passed
-- for that number. For an account, use export-account.sql. Copy this file to a private folder outside the repo, put
-- the number below in the copy only (its international digits; a plus or spaces are ignored), and run:
--   supabase db query --linked -o json -f <the copy> > <a private folder outside the repo>/export.json
-- Never save the output, or the edited copy, in the repo, and never write the number there. Delete our copy 30 days
-- after sending (section 7).
-- It prints one row, export, the JSON to send. Matching is by the number's key (private.phone_key), so both spellings
-- of an Argentine mobile are one number. Each list is [] when empty:
--  - invitations: each invitation by number to it: the resbite's title and start, the host's display name (as the
--    invitation page shows it), and when it was sent, answered and revoked. An invitation an account answered is that
--    account's (answering needs one signed in with the number), so it is left out: a number changes hands, and a new
--    holder never gets the old account's data (data-requests.md section 4.4). One with an answer but no account was
--    answered by an account since deleted, perhaps an earlier holder of the number: apply section 4.4 before sending
--    it;
--  - removals: each series that keeps the number so a guest can't bring it back: the resbite's title and start, and
--    since when;
--  - on_do_not_invite_list: whether the number is on the do-not-invite list (object-number.sql).
-- No id, no code, and nothing about who else was invited. It needs 20261117130000 applied (the list); before that it
-- fails and changes nothing. Send it as section 7 says (template R5).
-- Edit: the number.
with input(phone) as (values ('447700900000')),
 number as (select private.phone_key(i.phone) as key from input i)
select jsonb_build_object(
 'invitations', coalesce((select jsonb_agg(jsonb_build_object('title', x.title, 'starts_at', x.starts_at,
   'host', h.display_name, 'sent_at', v.created_at, 'answered_at', v.answered_at, 'revoked_at', v.revoked_at)
   order by v.created_at, x.starts_at)
  from private.phone_invitations v join public.plans x on x.id = v.plan_id left join public.profiles h on h.id = x.owner_id
  where v.phone = n.key and v.user_id is null), '[]'::jsonb),
 'removals', coalesce((select jsonb_agg(jsonb_build_object('title', o.title, 'starts_at', o.starts_at,
   'since', r.removed_at) order by r.removed_at, o.starts_at)
  from private.plan_removals r
   left join lateral (select p.title, p.starts_at from public.plans p where p.series_id = r.series_id
    order by p.starts_at desc, p.id desc limit 1) o on true
  where r.phone = n.key), '[]'::jsonb),
 'on_do_not_invite_list', private.number_objected(n.key)
) as export
from number n;
