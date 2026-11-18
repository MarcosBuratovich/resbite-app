-- Export one account's data, for an access or portability request (App Store readiness plan 6:
-- docs/superpowers/plans/2026-11-17-asr-6-retention-and-team-scripts.md, Task 8; C6, A16;
-- docs/compliance/data-requests.md sections 5 to 7).
--
-- OWNER-RUN, NOT A MIGRATION. READ-ONLY: it changes nothing. Run it only after the identity check in data-requests.md
-- section 4 has passed, and after legal-holds.sql: where a hold or a police request concerns the person, ask before
-- replying (section 6.3). Copy this file to a private folder outside the repo, put the account id below in the copy
-- only, and run:
--   supabase db query --linked -o json -f <the copy> > <a private folder outside the repo>/export.json
-- Never save the output, or the edited copy, in the repo: the output is the person's own data (their number, a number
-- they gave and have not confirmed yet, their email, their words). Delete our copy 30 days after sending (section 7).
-- It prints one row of two columns:
--  - export: the JSON to send, one key per source in section 5. Each list is [] when empty, never null. Each resbite
--    is named by its title and start, never by an id, and other people by their display name only. It holds no id but
--    the person's own, other people's numbers only as their last two digits (number_ending), the person's own messages
--    only (no words for a message deleted or removed), and no reporter, no reporter's words, no review note, and no
--    block or "Not now" of the person by anyone (section 6). refusals_made is the person's own "Not now" answers and
--    removals: the private.connection_refusals rows where they are to_user, the one who refused (from_user is the one
--    who asked and was refused). It includes the refusal their block makes of a request the blocked person sends
--    later, which the app never showed them. Left out with them: passwords, tokens (a push token shows only its first
--    and last four characters), link codes and ids, place coordinates, cover paths, request ids and the recovery hash,
--    system lines' payloads, and every report id.
--  - files: {"profile_photos": [...], "covers": [...]}, the Storage paths under the account's folder in the buckets
--    profile-photos and plan-covers. Download them from Storage for the archive. They are kept apart from the export
--    because cover paths hold resbite ids.
-- It needs private.suspension_history (20261117110000) and private.terms_acceptances (20261117120000) on the database;
-- before they are there it fails and changes nothing.
-- An id with no account prints account and profile null and every list empty: check the id. Add the short summary of
-- what each part means, the files and, by hand where it is safe, a summary of anything withheld (sections 6.1 and
-- 6.4), then send it as section 7 says (template R5).
-- Edit: the account id.
with input(user_id) as (values ('00000000-0000-0000-0000-000000000000'::uuid)),
 -- The account, and its verified number's key (invitations and removals by number are keyed by it). phone_change is a
 -- number given at Add your number and not confirmed yet, which Auth holds with the account ('' when there is none).
 person as (select u.id, u.phone, u.email, u.created_at, u.last_sign_in_at, u.email_confirmed_at, u.phone_confirmed_at,
   u.banned_until, nullif(u.phone_change, '') as phone_change, u.raw_user_meta_data as meta,
   case when u.phone_confirmed_at is not null then nullif(private.phone_key(u.phone), '') end as number_key
  from input i left join auth.users u on u.id = i.user_id),
 -- A series by its latest occurrence's title and start.
 occurrence as (select distinct on (p.series_id) p.series_id, p.title, p.starts_at
  from public.plans p order by p.series_id, p.starts_at desc, p.id desc)
select jsonb_build_object(
 'account', case when p.id is not null then jsonb_build_object('id', p.id, 'phone', p.phone, 'email', p.email,
   'created_at', p.created_at, 'last_sign_in_at', p.last_sign_in_at, 'email_confirmed_at', p.email_confirmed_at,
   'phone_confirmed_at', p.phone_confirmed_at, 'banned_until', p.banned_until, 'phone_change', p.phone_change,
   'display_name', p.meta->>'display_name')
  || case when jsonb_typeof(p.meta) = 'object' and p.meta ? 'registration_details'
   then jsonb_build_object('registration_details', p.meta->'registration_details') else '{}'::jsonb end end,
 'sign_in_methods', coalesce((select jsonb_agg(jsonb_build_object('provider', x.provider, 'created_at', x.created_at,
   'email', x.email) order by x.created_at, x.provider) from auth.identities x where x.user_id = p.id), '[]'::jsonb),
 'sessions', coalesce((select jsonb_agg(jsonb_build_object('created_at', x.created_at, 'updated_at', x.updated_at,
   'user_agent', x.user_agent, 'ip', x.ip) order by x.created_at) from auth.sessions x where x.user_id = p.id), '[]'::jsonb),
 'profile', (select jsonb_build_object('display_name', x.display_name, 'created_at', x.created_at,
   'deletion_requested_at', x.deletion_requested_at) from public.profiles x where x.id = p.id),
 'age_and_terms', coalesce((select jsonb_agg(jsonb_build_object('confirmed_at', x.confirmed_at,
   'terms_version', x.terms_version, 'method', x.method)) from private.age_attestations x where x.user_id = p.id), '[]'::jsonb),
 'terms_accepted', coalesce((select jsonb_agg(jsonb_build_object('terms_version', x.terms_version,
   'accepted_at', x.accepted_at, 'how', x.how) order by x.accepted_at, x.terms_version)
  from private.terms_acceptances x where x.user_id = p.id), '[]'::jsonb),
 'chat_rules', coalesce((select jsonb_agg(jsonb_build_object('version', x.version, 'accepted_at', x.accepted_at)
   order by x.accepted_at, x.version) from private.chat_rules_acceptances x where x.user_id = p.id), '[]'::jsonb),
 'app_sessions', coalesce((select jsonb_agg(jsonb_build_object('first_at', x.first_at, 'last_at', x.last_at))
  from private.app_sessions x where x.user_id = p.id), '[]'::jsonb),
 'access_grants', coalesce((select jsonb_agg(jsonb_build_object('source', x.source, 'granted_at', x.granted_at,
   'revoked_at', x.revoked_at)) from private.beta_access x where x.user_id = p.id), '[]'::jsonb),
 'moderator', exists (select 1 from private.moderators x where x.user_id = p.id),
 'contact_lookups', coalesce((select jsonb_agg(jsonb_build_object('day', x.day, 'count', x.count))
  from private.lookup_usage x where x.user_id = p.id), '[]'::jsonb),
 -- A suspension in force, then each one ended (lifted after an appeal); never the report it came from.
 'suspensions', coalesce((select jsonb_agg(s.item order by s.at) from (
   select x.at, jsonb_build_object('suspended_at', x.at, 'ended_at', null::timestamptz, 'how', 'in_force') as item
   from private.suspensions x where x.user_id = p.id
   union all
   select x.suspended_at, jsonb_build_object('suspended_at', x.suspended_at, 'ended_at', x.ended_at, 'how', x.how)
   from private.suspension_history x where x.user_id = p.id) s), '[]'::jsonb),
 'push_registrations', coalesce((select jsonb_agg(jsonb_build_object('platform', x.platform, 'updated_at', x.updated_at,
   'token', case when length(x.token) > 8 then left(x.token, 4) || '…' || right(x.token, 4) else '…' end)
   order by x.updated_at) from private.device_endpoints x where x.user_id = p.id), '[]'::jsonb),
 'deletion_request', coalesce((select jsonb_agg(jsonb_build_object('status', x.status, 'requested_at', x.requested_at,
   'completed_at', x.completed_at)) from private.account_deletion_jobs x where x.user_id = p.id), '[]'::jsonb),
 -- Each resbite they own, with its meeting details and its guests as the host sees them: name and answer.
 'resbites_hosted', coalesce((select jsonb_agg(jsonb_build_object('title', x.title, 'description', x.description,
   'categories', x.categories, 'starts_at', x.starts_at, 'ends_at', x.ends_at, 'time_zone', x.time_zone,
   'place_label', x.place_label, 'area', x.area, 'note', x.note, 'guest_note', x.guest_note,
   'guest_note_at', x.guest_note_at, 'cover_description', x.cover_description, 'status', x.status,
   'repeat_weeks', x.repeat_weeks, 'bring_invites', x.bring_invites, 'bring_levels', x.bring_levels,
   'created_at', x.created_at,
   'meeting_details', (select d.note from public.plan_meeting_details d where d.plan_id = x.id),
   'guests', coalesce((select jsonb_agg(jsonb_build_object('name', g.display_name, 'answer', a.response)
     order by g.display_name, a.user_id)
    from public.attendees a left join public.profiles g on g.id = a.user_id where a.plan_id = x.id), '[]'::jsonb))
   order by x.starts_at, x.created_at) from public.plans x where x.owner_id = p.id), '[]'::jsonb),
 'attending', coalesce((select jsonb_agg(jsonb_build_object('title', x.title, 'starts_at', x.starts_at,
   'answer', a.response, 'answered_at', a.updated_at, 'level', a.level, 'brought_by', b.display_name)
   order by x.starts_at, a.updated_at)
  from public.attendees a join public.plans x on x.id = a.plan_id left join public.profiles b on b.id = a.brought_by
  where a.user_id = p.id), '[]'::jsonb),
 -- Where they are a co-host, and the co-hosts they appointed.
 'co_hosting', coalesce((select jsonb_agg(jsonb_build_object('title', x.title, 'starts_at', x.starts_at,
   'co_host', c.display_name, 'appointed_by', b.display_name, 'appointed_at', a.appointed_at)
   order by x.starts_at, a.appointed_at, c.display_name)
  from public.plan_admins a join public.plans x on x.id = a.plan_id left join public.profiles c on c.id = a.user_id
   left join public.profiles b on b.id = a.appointed_by
  where p.id in (a.user_id, a.appointed_by)), '[]'::jsonb),
 'join_requests', coalesce((select jsonb_agg(jsonb_build_object('title', x.title, 'starts_at', x.starts_at,
   'answer', j.response, 'status', j.status, 'asked_at', j.created_at, 'decided_at', j.decided_at)
   order by j.created_at, x.starts_at)
  from private.join_requests j join public.plans x on x.id = j.plan_id where j.user_id = p.id), '[]'::jsonb),
 -- A host's removal, of the account or of its verified number.
 'removed_from', coalesce((select jsonb_agg(jsonb_build_object('title', o.title, 'starts_at', o.starts_at,
   'removed_at', r.removed_at) order by r.removed_at, o.starts_at)
  from private.plan_removals r left join occurrence o on o.series_id = r.series_id
  where r.user_id = p.id or r.phone = p.number_key), '[]'::jsonb),
 'groups_left', coalesce((select jsonb_agg(jsonb_build_object('title', o.title, 'starts_at', o.starts_at,
   'left_at', l.left_at) order by l.left_at)
  from private.series_leaves l left join occurrence o on o.series_id = l.series_id where l.user_id = p.id), '[]'::jsonb),
 'mutes', coalesce((select jsonb_agg(jsonb_build_object('title', o.title, 'starts_at', o.starts_at, 'what', m.what,
   'muted_at', m.muted_at) order by m.muted_at, m.what)
  from (select x.series_id, 'resbite' as what, x.muted_at from public.plan_mutes x where x.user_id = p.id
   union all
   select x.series_id, 'chat', x.muted_at from public.chat_mutes x where x.user_id = p.id) m
  left join occurrence o on o.series_id = m.series_id), '[]'::jsonb),
 -- Invitations by number they sent or brought: the number only as its last two digits.
 'invitations_sent', coalesce((select jsonb_agg(jsonb_build_object('title', x.title, 'starts_at', x.starts_at,
   'country', v.country, 'number_ending', right(v.phone, 2), 'sent_at', v.created_at, 'answered_at', v.answered_at,
   'revoked_at', v.revoked_at, 'level', v.level) order by v.created_at, x.starts_at)
  from private.phone_invitations v join public.plans x on x.id = v.plan_id
  where p.id in (v.invited_by, v.brought_by)), '[]'::jsonb),
 -- Invitations to them: answered by this account, or to its verified number and not answered by another account.
 'invitations_received', coalesce((select jsonb_agg(jsonb_build_object('title', x.title, 'starts_at', x.starts_at,
   'host', h.display_name, 'sent_at', v.created_at, 'answered_at', v.answered_at, 'revoked_at', v.revoked_at)
   order by v.created_at, x.starts_at)
  from private.phone_invitations v join public.plans x on x.id = v.plan_id left join public.profiles h on h.id = x.owner_id
  where v.user_id = p.id or (v.user_id is null and v.phone = p.number_key)), '[]'::jsonb),
 'links', coalesce((select jsonb_agg(jsonb_build_object('title', x.title, 'starts_at', x.starts_at,
   'created_at', l.created_at, 'revoked_at', l.revoked_at) order by l.created_at, x.starts_at)
  from private.plan_links l join public.plans x on x.id = l.plan_id where x.owner_id = p.id), '[]'::jsonb),
 -- Their own messages and announcements only; a deleted or removed one without its words.
 'messages', coalesce((select jsonb_agg(jsonb_build_object('title', x.title, 'starts_at', x.starts_at, 'kind', m.kind,
   'audience', m.audience, 'body', case when m.state = 'sent' then m.body end, 'state', m.state,
   'created_at', m.created_at) order by m.created_at, m.id)
  from public.messages m join public.plans x on x.id = m.plan_id
  where m.author_id = p.id and m.kind in ('message', 'announcement')), '[]'::jsonb),
 -- Resbite's lines that name them (its person keys: actor, user, brought_by), without the payload.
 'chat_events', coalesce((select jsonb_agg(jsonb_build_object('title', x.title, 'starts_at', x.starts_at,
   'event', m.event, 'created_at', m.created_at) order by m.created_at, m.id)
  from public.messages m join public.plans x on x.id = m.plan_id
  where m.kind = 'system' and p.id::text in (m.payload->>'actor', m.payload->>'user', m.payload->>'brought_by')),
  '[]'::jsonb),
 'read_positions', coalesce((select jsonb_agg(jsonb_build_object('title', o.title, 'starts_at', o.starts_at,
   'last_read_at', m.created_at) order by o.starts_at)
  from public.chat_reads r left join occurrence o on o.series_id = r.series_id
   left join public.messages m on m.id = r.last_read_id
  where r.user_id = p.id), '[]'::jsonb),
 'connections', coalesce((select jsonb_agg(jsonb_build_object('name', n.display_name, 'state', c.state,
   'asked_by_you', c.requested_by = p.id, 'met_at', o.title, 'met_at_start', o.starts_at, 'asked_at', c.created_at,
   'accepted_at', c.accepted_at) order by c.created_at, n.display_name)
  from public.connections c
   left join public.profiles n on n.id = case when c.user_a = p.id then c.user_b else c.user_a end
   left join occurrence o on o.series_id = c.series_id
  where p.id in (c.user_a, c.user_b)), '[]'::jsonb),
 -- Their own "Not now" answers and removals, and their own blocks. Never a row about them (section 6.2). In
 -- connection_refusals from_user asked and was refused, and to_user refused, removed or blocked them
 -- (20261110120000_connections.sql's table comment; 20261111160000_chat_safety.sql's block paths): theirs are the rows
 -- where they are to_user.
 'refusals_made', coalesce((select jsonb_agg(jsonb_build_object('name', n.display_name, 'title', o.title,
   'starts_at', o.starts_at, 'refused_at', r.refused_at) order by r.refused_at, n.display_name)
  from private.connection_refusals r left join public.profiles n on n.id = r.from_user
   left join occurrence o on o.series_id = r.series_id
  where r.to_user = p.id), '[]'::jsonb),
 'blocks_made', coalesce((select jsonb_agg(jsonb_build_object('name', n.display_name, 'blocked_at', b.created_at)
   order by b.created_at, n.display_name)
  from private.blocks b left join public.profiles n on n.id = b.blocked_id where b.blocker_id = p.id), '[]'::jsonb),
 -- Reports they filed, with their own words and the frozen words they saw; never the review note.
 'reports_filed', coalesce((select jsonb_agg(jsonb_build_object('title', x.title, 'starts_at', x.starts_at,
   'about', r.about, 'reason', r.reason, 'details', r.details, 'created_at', r.created_at, 'status', r.status,
   'reported_person', n.display_name, 'frozen_body', r.frozen_body) order by r.created_at, r.id)
  from private.reports r left join public.plans x on x.id = r.plan_id
   left join public.profiles n on n.id = coalesce(r.target_user_id, r.frozen_author)
  where r.reporter_id = p.id), '[]'::jsonb),
 -- Reports about them: never the reporter, the reporter's words or the review note (section 6.1), and the frozen words
 -- only where they are the person's own.
 'reports_about_you', coalesce((select jsonb_agg(jsonb_build_object('about', r.about, 'reason', r.reason,
   'created_at', r.created_at, 'status', r.status, 'action', r.action,
   'frozen_body', case when r.frozen_author = p.id then r.frozen_body end) order by r.created_at, r.id)
  from private.reports r where r.target_user_id = p.id or r.frozen_author = p.id), '[]'::jsonb),
 'notifications', coalesce((select jsonb_agg(jsonb_build_object('kind', n.kind, 'title', x.title,
   'starts_at', x.starts_at, 'queued_at', n.created_at, 'delivered_at', n.delivered_at, 'actor', a.display_name,
   'detail', n.detail) order by n.created_at, n.id)
  from private.notification_outbox n join public.plans x on x.id = n.plan_id left join public.profiles a on a.id = n.actor_id
  where n.recipient_id = p.id), '[]'::jsonb)
) as export,
jsonb_build_object(
 'profile_photos', coalesce((select jsonb_agg(o.name order by o.name) from storage.objects o
  where o.bucket_id = 'profile-photos' and o.name like p.id::text || '/%'), '[]'::jsonb),
 'covers', coalesce((select jsonb_agg(o.name order by o.name) from storage.objects o
  where o.bucket_id = 'plan-covers' and o.name like p.id::text || '/%'), '[]'::jsonb)
) as files
from person p;
