-- GI2 funnel: per event link, how far people got from opening it to replying.
-- Read-only: one select, no writes. The controller runs it with the Supabase MCP `execute_sql` tool
-- after the GI2 migration is applied; it is never run from the app and never by another tool.
-- Opens carry no person (private.link_opens holds the link id and a time), so there is no per-person timing.
-- "Grants" are accounts made through this link (private.beta_access.plan_link_id; kept only while the link row exists).
-- "Replied" counts attendees whose answer is Going, Maybe or Can't go (not pending, not withdrawn).
select
  l.id as plan_link_id,
  l.plan_id,
  l.created_at,
  l.revoked_at,
  case when l.revoked_at is null then 'live' else 'rotated or turned off' end as link_state,
  (select count(*) from private.link_opens o where o.plan_link_id = l.id) as opens,
  (select count(*) from private.beta_access b where b.plan_link_id = l.id) as grants,
  (select count(*) from public.attendees a where a.plan_id = l.plan_id) as attendees,
  (select count(*) from public.attendees a
    where a.plan_id = l.plan_id and a.response in ('accepted', 'maybe', 'declined')) as replied
from private.plan_links l
order by l.created_at desc, l.id;
